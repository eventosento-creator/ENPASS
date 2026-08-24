export const PROMOTER_ATTRIBUTION_COOKIE = "nl_promoter_attribution";
export const PROMOTER_SESSION_COOKIE = "nl_promoter_session";
export const PROMOTER_ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const PROMOTER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const PROMOTER_INVITE_MAX_AGE_SECONDS = 60 * 60 * 24;

export function isOpaqueCredential(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
