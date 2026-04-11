/**
 * JSON response untuk data sensitif per-sesi (Bearer): hindari cache edge/browser.
 */
export function jsonPrivateNoStore(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  }
  return Response.json(data, { ...init, headers });
}
