export const activeProjectCookieName = "rifft_active_project";
export const accessTokenCookieName = "rifft_access_token";
export const planIntentCookieName = "rifft_plan_intent";

export const getActiveProjectIdFromDocument = () => {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${activeProjectCookieName}=`;
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!entry) {
    return null;
  }

  return decodeURIComponent(entry.slice(prefix.length));
};

export const setCookieValue = (name: string, value: string, maxAgeSeconds?: number) => {
  if (typeof document === "undefined") {
    return;
  }

  const maxAgePart = typeof maxAgeSeconds === "number" ? `; max-age=${maxAgeSeconds}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/${maxAgePart}; samesite=lax`;
};

export const clearCookieValue = (name: string) => {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
};
