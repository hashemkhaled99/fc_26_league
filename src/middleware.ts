import { NextRequest, NextResponse } from "next/server";

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function allowedOrigins(): string[] {
  const raw = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const fromEnv = raw
    .split(",")
    .map((s) => normalizeOrigin(s))
    .filter(Boolean);

  const defaults = [
    "http://localhost:3000",
    "https://p01--fc26-frontend--xxwmmwbgfpdk.code.run",
  ];

  return Array.from(new Set([...fromEnv, ...defaults]));
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (allowedOrigins().includes(normalized)) return true;
  // Any Northflank frontend for this project
  if (/^https:\/\/p01--fc26-frontend--[\w-]+\.code\.run$/i.test(normalized)) {
    return true;
  }
  return false;
}

function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = isAllowedOrigin(origin)
    ? origin!
    : allowedOrigins()[0] ?? "http://localhost:3000";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const response = NextResponse.next();
  const headers = corsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
