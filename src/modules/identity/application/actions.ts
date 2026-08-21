"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/shared/database/server";
import { safeProducerPath } from "@/shared/lib/navigation";
import { z } from "zod";

export type ActionState = { error?: string };

const credentialsSchema = z.object({ email: z.email(), password: z.string().min(8) });

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
  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) return { error: "No pudimos crear la cuenta. Es posible que ese email ya exista." };
  redirect(safeProducerPath(formData.get("next")));
}

export async function sendMagicLink(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Ingresá un email válido." };
  const supabase = await createClient();
  const nextPath = safeProducerPath(formData.get("next"));
  const callback = new URL("/auth/callback", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  callback.searchParams.set("next", nextPath);
  const { error } = await supabase.auth.signInWithOtp({ email: email.data, options: { emailRedirectTo: callback.toString() } });
  return error ? { error: "No pudimos enviar el enlace." } : { error: "Te enviamos un enlace seguro. Revisá tu email." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
