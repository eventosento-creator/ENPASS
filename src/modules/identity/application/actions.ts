"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/shared/database/server";
import { safeProducerPath } from "@/shared/lib/navigation";
import { z } from "zod";

export type ActionState = { error?: string; success?: string };

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

export async function login(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ingresá un email válido y una contraseña de al menos 8 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "No pudimos iniciar sesión. Revisá tus datos." };
  redirect(safeProducerPath(formData.get("next")));
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
  return error ? { error: "No pudimos enviar el enlace." } : { success: "Te enviamos un enlace seguro. Revisá tu email." };
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Ingresá un email válido." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: authCallback("/actualizar-clave") });
  if (error) return { error: "No pudimos enviar el enlace. Esperá unos minutos e intentá nuevamente." };
  return { success: "Si existe una cuenta con ese email, vas a recibir un enlace para cambiar la contraseña." };
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
