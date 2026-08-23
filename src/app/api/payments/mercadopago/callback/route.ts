import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encryptCredential } from "@/modules/payments/infrastructure/credential-cipher";
import { assertPublicHttpsUrl, getMercadoPagoRuntimeConfig } from "@/modules/payments/infrastructure/config";
import { MercadoPagoProvider } from "@/modules/payments/infrastructure/mercado-pago-provider";
import { createAdminClient } from "@/shared/database/admin";
import { createClient } from "@/shared/database/server";
import { paymentLog } from "@/shared/lib/structured-log";

const COOKIE_PATH = "/api/payments/mercadopago";
const COOKIE_NAMES = ["mp_oauth_state", "mp_oauth_verifier", "mp_oauth_org"] as const;

export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const destination = (value: string) => new URL(`/app/settings?payment=${value}`, appUrl);
  const cookieStore = await cookies();
  const storedState = cookieStore.get("mp_oauth_state")?.value;
  const verifier = cookieStore.get("mp_oauth_verifier")?.value;
  const organizationId = cookieStore.get("mp_oauth_org")?.value;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const providerError = request.nextUrl.searchParams.get("error");

  if (providerError || !code || !state || !storedState || state !== storedState || !verifier || !organizationId) {
    return clearOAuthCookies(NextResponse.redirect(destination(providerError ? "cancelled" : "invalid-state")));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = user
    ? await supabase.from("organization_members").select("organization_id").eq("user_id", user.id)
      .eq("organization_id", organizationId).maybeSingle()
    : { data: null };
  if (!user || !membership) {
    return clearOAuthCookies(NextResponse.redirect(destination("unauthorized")));
  }

  try {
    const config = getMercadoPagoRuntimeConfig();
    assertPublicHttpsUrl(config.redirectUri, "MERCADO_PAGO_REDIRECT_URI");
    const credentials = await new MercadoPagoProvider().exchangeAuthorizationCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      code,
      codeVerifier: verifier,
    });
    if (credentials.liveMode) throw new Error("LIVE_CREDENTIALS_NOT_ALLOWED");

    const now = new Date();
    const admin = createAdminClient();
    const { data: account, error } = await admin.from("payment_accounts").upsert({
      organization_id: organizationId,
      provider: "mercado_pago",
      provider_account_id: credentials.providerAccountId,
      provider_public_key: credentials.publicKey,
      access_token_encrypted: encryptCredential(credentials.accessToken),
      refresh_token_encrypted: credentials.refreshToken ? encryptCredential(credentials.refreshToken) : null,
      token_scope: credentials.scope,
      live_mode: false,
      expires_at: credentials.expiresInSeconds
        ? new Date(now.getTime() + credentials.expiresInSeconds * 1000).toISOString()
        : null,
      status: "connected",
      connected_at: now.toISOString(),
      disconnected_at: null,
      last_refreshed_at: null,
    }, { onConflict: "organization_id,provider" }).select("id").single();
    if (error || !account) throw new Error("ACCOUNT_PERSIST_FAILED");

    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_user_id: user.id,
      action: "oauth.connected",
      entity_type: "payment_account",
      entity_id: account.id,
      after_data: { provider: "mercado_pago", live_mode: false },
    });
    paymentLog("oauth.connected", { organizationId, accountId: account.id, liveMode: false });
    return clearOAuthCookies(NextResponse.redirect(destination("connected")));
  } catch {
    return clearOAuthCookies(NextResponse.redirect(destination("connection-error")));
  }
}

function clearOAuthCookies(response: NextResponse) {
  for (const name of COOKIE_NAMES) response.cookies.set(name, "", { maxAge: 0, path: COOKIE_PATH });
  return response;
}
