import { getPublicApiUrl } from "./public-env";

/** Base URL for the backend API service (Northflank backend public URL). */
export function apiPath(path: string): string {
  const base = getPublicApiUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const apiFetchInit: RequestInit = {
  credentials: "include",
};
