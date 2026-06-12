import { NextResponse } from "next/server";
import { jsonError, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  createSessionToken,
  isAdminConfigured,
  isAdminRequest,
  requireSameOrigin,
  sessionCookieOptions,
  verifyAdminCode,
} from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request) {
  return NextResponse.json({ success: true, authenticated: isAdminRequest(request) });
}

export async function POST(request) {
  try {
    if (!requireSameOrigin(request)) return jsonError("Cross-origin request rejected.", 403);
    const attempt = rateLimit(request, "admin-code", { limit: 6, windowMs: 15 * 60 * 1000 });
    if (!attempt.allowed) {
      return jsonError("Too many attempts. Try again later.", 429, {
        "Retry-After": String(attempt.retryAfter),
      });
    }

    if (!isAdminConfigured()) {
      return jsonError("Admin access is not configured.", 503);
    }
    const { code } = await request.json();
    if (!verifyAdminCode(code)) return jsonError("Incorrect admin code.", 401);

    const response = NextResponse.json({ success: true, authenticated: true });
    response.cookies.set(
      ADMIN_COOKIE,
      createSessionToken({ type: "admin", maxAgeSeconds: ADMIN_SESSION_SECONDS }),
      sessionCookieOptions(ADMIN_SESSION_SECONDS),
    );
    return response;
  } catch (error) {
    if (error instanceof SyntaxError) return jsonError("Invalid request.", 400);
    return serverError(error, "Admin login failed");
  }
}

export async function DELETE(request) {
  if (!requireSameOrigin(request)) return jsonError("Cross-origin request rejected.", 403);
  const response = NextResponse.json({ success: true, authenticated: false });
  response.cookies.set(ADMIN_COOKIE, "", sessionCookieOptions(0));
  return response;
}
