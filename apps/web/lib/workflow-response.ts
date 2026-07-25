export function workflowJsonResponse(payload: unknown, init: ResponseInit = {}) {
  const body = JSON.stringify(payload);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Content-Length", String(Buffer.byteLength(body, "utf8")));
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
  return new Response(body, { ...init, headers });
}
