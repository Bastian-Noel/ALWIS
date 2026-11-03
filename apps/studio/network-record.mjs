// Bounded, in-memory inspection of the virtual server. Never execute response markup.
const limit = 32768;
const decoder = new TextDecoder();
export function inspectBody(body, headers = []) {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body ?? 0);
  const type =
    headers.find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
  const textual =
    !bytes.length ||
    /^(text\/)|json|javascript|xml|x-www-form-urlencoded/i.test(type);
  return {
    bytes: bytes.byteLength,
    text: textual ? decoder.decode(bytes.subarray(0, limit)) : null,
    truncated: textual && bytes.length > limit,
    type,
  };
}
export function networkRecord(session, input, response, durationMs) {
  const url = new URL(input.url);
  return {
    id: crypto.randomUUID(),
    session,
    url: url.href,
    path: url.pathname + url.search,
    name: url.pathname.split("/").pop() || "/",
    method: input.method ?? "GET",
    status: response.status,
    durationMs,
    destination: input.destination || "fetch / XHR",
    requestHeaders: input.headers ?? [],
    responseHeaders: response.inspectHeaders ?? response.headers ?? [],
    requestBody: inspectBody(input.body, input.headers),
    responseBody:
      response.inspection ?? inspectBody(response.body, response.headers),
  };
}
