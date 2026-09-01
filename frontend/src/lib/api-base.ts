/** Base URL for the backend API service (Northflank backend public URL). */
export function apiPath(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}${path}`;
}

export const apiFetchInit: RequestInit = {
  credentials: "include",
};
