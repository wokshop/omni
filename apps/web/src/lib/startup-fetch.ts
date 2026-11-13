// The answers `index.html` preloads (session, shell data, the Inbox's first page) start with
// the page, before any script runs. They are taken here as the app starts and each answers the
// first GET for its URL, within the startup window only. Left to the browser, an unused preload
// waits for the page's whole life and answers a much later request with what was true at load:
// a sign-in that went to /join and was accepted later opened a shell built from its
// pre-membership answers.

/** Long enough for the first screen's requests, far shorter than anything that changes the answers. */
const STARTUP_MS = 10_000;

const early = new Map<string, Promise<Response>>();
for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="fetch"]')) {
  // Same URL and credentials mode as the preload, so this takes its answer, not a new request.
  const response = fetch(link.href, { credentials: "include" });
  response.catch(() => {}); // A failure surfaces to the request that takes it.
  early.set(link.href, response);
}
const expires = performance.now() + STARTUP_MS;

/** The preloaded answer for this request, once; `undefined` sends it to the network. */
export function takeStartupResponse(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> | undefined {
  if (early.size === 0) return undefined;
  if (performance.now() > expires) {
    for (const response of early.values())
      void response.then(
        (r) => r.body?.cancel(),
        () => {},
      );
    early.clear();
    return undefined;
  }
  const request = input instanceof Request ? input : undefined;
  if ((init?.method ?? request?.method ?? "GET") !== "GET") return undefined;
  const url = new URL(request?.url ?? String(input), window.location.href).href;
  const response = early.get(url);
  early.delete(url);
  return response;
}
