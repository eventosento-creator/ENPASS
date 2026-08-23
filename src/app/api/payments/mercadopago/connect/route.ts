import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { assertPublicHttpsUrl, getMercadoPagoRuntimeConfig } from "@/modules/payments/infrastructure/config";
import { MercadoPagoProvider } from "@/modules/payments/infrastructure/mercado-pago-provider";
import { createClient } from "@/shared/database/server";

const COOKIE_PATH = "/api/payments/mercadopago";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const organization = await getCurrentOrganization();
  if (!user || !organization) return NextResponse.redirect(new URL("/login?next=/app/settings", requestBase()));

  try {
    const config = getMercadoPagoRuntimeConfig();
    assertPublicHttpsUrl(config.appUrl, "APP_URL");
    assertPublicHttpsUrl(config.redirectUri, "MERCADO_PAGO_REDIRECT_URI");

    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const cookieStore = await cookies();
    const options = { httpOnly: true, sameSite: "lax" as const, secure: true, maxAge: 600, path: COOKIE_PATH };
    cookieStore.set("mp_oauth_state", state, options);
    cookieStore.set("mp_oauth_verifier", verifier, options);
    cookieStore.set("mp_oauth_org", organization.id, options);

    const authorizationUrl = new MercadoPagoProvider().getAuthorizationUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      codeChallenge: challenge,
    });
    return NextResponse.redirect(authorizationUrl);
  } catch {
    return NextResponse.redirect(new URL("/app/settings?payment=config-error", requestBase()));
  }
}

function requestBase() {
  return process.env.APP_URL || "http://localhost:3000";
}
