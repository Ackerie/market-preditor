export function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("XSRF-TOKEN="))
    ?.slice("XSRF-TOKEN=".length);
  const headers = new Headers(init.headers);
  if (
    token &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(
      (init.method ?? "GET").toUpperCase(),
    )
  ) {
    headers.set("x-csrf-token", decodeURIComponent(token));
  }
  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  }).then((response) => {
    if (response.status === 428) {
      window.dispatchEvent(new CustomEvent("nexustrade:step-up-required"));
    }
    return response;
  });
}
