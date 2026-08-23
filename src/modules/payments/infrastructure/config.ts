import "server-only";

export type MercadoPagoRuntimeConfig = {
  appUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webhookSecret: string;
  sandbox: boolean;
};

export function getMercadoPagoRuntimeConfig(): MercadoPagoRuntimeConfig {
  const config = {
    appUrl: process.env.APP_URL ?? "",
    clientId: process.env.MERCADO_PAGO_CLIENT_ID ?? "",
    clientSecret: process.env.MERCADO_PAGO_CLIENT_SECRET ?? "",
    redirectUri: process.env.MERCADO_PAGO_REDIRECT_URI ?? "",
    webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? "",
    sandbox: process.env.MERCADO_PAGO_SANDBOX === "true",
  };

  if ([config.appUrl, config.clientId, config.clientSecret, config.redirectUri, config.webhookSecret]
    .some((value) => !value || value.includes("replace-with"))) {
    throw new Error("Mercado Pago no está configurado para el entorno local.");
  }
  if (!config.sandbox) {
    throw new Error("FASE 2A solo permite credenciales y checkout sandbox.");
  }

  return config;
}

export function isMercadoPagoConfigured() {
  try {
    getMercadoPagoRuntimeConfig();
    return true;
  } catch {
    return false;
  }
}

export function assertPublicHttpsUrl(value: string, label: string) {
  const url = new URL(value);
  const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
  if (url.protocol !== "https:" || localHostnames.has(url.hostname)) {
    throw new Error(`${label} debe ser una URL HTTPS pública temporal para Mercado Pago.`);
  }
  return url;
}
