export const getRequestOrigin = (request: Request) => {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (host) {
    const normalizedHost = host.replace(/^0\.0\.0\.0(?=[:/]|$)/, "localhost");
    return `${forwardedProto ?? "http"}://${normalizedHost}`;
  }

  const origin = new URL(request.url).origin;
  return origin.replace("://0.0.0.0", "://localhost");
};
