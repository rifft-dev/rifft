const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
const isLocalApp =
  process.env.NODE_ENV !== "production" ||
  /localhost|127\.0\.0\.1/.test(appUrl);

export const statusPageHref = isLocalApp ? "/status" : "https://status.rifft.dev";
