/**
 * Append the JWT as `access_token=…` query param so `<img src>` and similar
 * native loaders (which can't send Authorization headers) authenticate against
 * /api/v1/files/. Backend `authMiddleware` already accepts this fallback for
 * paths under /api/v1/files/ (see backend/internal/httpapi/server.go).
 *
 * Returns the URL unchanged when the token is missing or the URL doesn't
 * point to a file endpoint that requires JWT auth.
 */
export function withAccessToken(url: string | undefined, token?: string): string {
  if (!url || !token) return url ?? "";
  if (!url.includes("/api/v1/files/")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}
