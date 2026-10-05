"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/shared/database/admin";
import { createClient } from "@/shared/database/server";
import { safeProducerPath } from "@/shared/lib/navigation";
import { z } from "zod";

export type ActionState = { error?: string; success?: string; /** El email no tiene cuenta: la pantalla ofrece pasar a "Crear cuenta". */ suggestRegister?: boolean };

const credentialsSchema = z.object({ email: z.email(), password: z.string().min(8) });
const passwordSchema = z.object({
  password: z.string().min(8),
  confirmation: z.string().min(8),
}).refine(({ password, confirmation }) => password === confirmation, { path: ["confirmation"] });

function authCallback(next: "/app" | "/actualizar-clave") {
  const callback = new URL("/auth/callback", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  callback.searchParams.set("next", next);
  return callback.toString();
}

export async function signInWithGoogle(nextPath: string) {
  const supabase = await createClient();
  const callback = new URL(authCallback("/app"));
  callback.searchParams.set("next", safeProducerPath(nextPath));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) redirect("/login?authError=google-unavailable" as never);
  redirect(data.url as never);
}

export async function login(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ingresá un email válido y una contraseña de al menos 8 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return explainLoginFailure(parsed.data.email, error.code);
  redirect(safeProducerPath(formData.get("next")));
}

// Dice por qué falló el ingreso (en vez de un error genérico): no tiene cuenta, la cuenta es de Google o la
// contraseña no coincide. Si no se puede consultar (ej. falta la función en la base), cae al mensaje genérico.
async function explainLoginFailure(email: string, code: string | undefined): Promise<ActionState> {
  const generic = { error: "No pudimos iniciar sesión. Revisá tus datos." };
  if (code === "email_not_confirmed") return { error: "Todavía no confirmaste tu email. Abrí el mail que te mandamos para activar la cuenta." };
  const { data, error } = await createAdminClient().rpc("auth_email_status", { target_email: email });
  if (error || typeof data !== "string") return generic;
  if (data === "none") return { error: "No encontramos una cuenta con ese email. Creá tu cuenta para empezar.", suggestRegister: true };
  if (data === "password") return { error: "La contraseña no es correcta. Si no la recordás, usá \"Olvidé mi contraseña\"." };
  return { error: `Ese email se registró con ${data === "google" ? "Google" : data}. Usá el botón "Continuar con ${data === "google" ? "Google" : data}".` };
}

export async function register(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ingresá un email válido y una contraseña de al menos 8 caracteres." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: authCallback("/app") } });
  if (error) return { error: "No pudimos crear la cuenta. Es posible que ese email ya exista." };
  if (!data.session) return { success: "Te enviamos un email para confirmar la cuenta. Abrilo para continuar." };
  redirect(safeProducerPath(formData.get("next")));
}

export async function sendMagicLink(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Ingresá un email válido." };
  const supabase = await createClient();
  const nextPath = safeProducerPath(formData.get("next"));
  const callback = new URL(authCallback("/app"));
  callback.searchParams.set("next", nextPath);
  const { error } = await supabase.auth.signInWithOtp({ email: email.data, options: { emailRedirectTo: callback.toString() } });
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "auth.magic_link.failed", code: error.code, status: error.status }));
    return { error: emailDeliveryError(error.code) };
  }
  return { success: "Te enviamos un enlace seguro. Revisá tu email." };
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Ingresá un email válido." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: authCallback("/actualizar-clave") });
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "auth.password_reset.failed", code: error.code, status: error.status }));
    return { error: emailDeliveryError(error.code) };
  }
  return { success: "Si existe una cuenta con ese email, vas a recibir un enlace para cambiar la contraseña." };
}

function emailDeliveryError(code?: string) {
  if (code === "over_email_send_rate_limit") return "Esperá un minuto antes de pedir otro enlace.";
  if (code === "unexpected_failure") return "El proveedor de email rechazó el envío. Por ahora ingresá con email y contraseña.";
  return "No pudimos enviar el enlace. Esperá unos minutos e intentá nuevamente.";
}

export async function updatePassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Las contraseñas deben coincidir y tener al menos 8 caracteres." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "El enlace venció o ya fue utilizado. Pedí uno nuevo." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "No pudimos actualizar la contraseña. Pedí un enlace nuevo." };
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?password=updated");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
