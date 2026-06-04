import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog-store";
import { assertSlug } from "@/lib/catalog-model";
import { jsonError, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import {
  accessCookieName,
  CATALOG_SESSION_SECONDS,
  createSessionToken,
  requireSameOrigin,
  sessionCookieOptions,
  verifyCatalogCode,
} from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    if (!requireSameOrigin(request)) return jsonError("Cross-origin request rejected.", 403);
    const attempt = rateLimit(request, "catalog-code", { limit: 8, windowMs: 15 * 60 * 1000 });
    if (!attempt.allowed) {
      return jsonError("Too many attempts. Try again later.", 429, {
        "Retry-After": String(attempt.retryAfter),
      });
    }

    const { slug } = await context.params;
    assertSlug(slug);
    const catalog = await getCatalog(slug);
    if (!catalog) return jsonError("Catalog not found.", 404);
    if (catalog.accessMode !== "protected") {
      return NextResponse.json({ success: true });
    }

    const { code } = await request.json();
    if (!(await verifyCatalogCode(code, catalog.codeHash))) {
      return jsonError("Incorrect access code.", 401);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(
      accessCookieName(slug),
      createSessionToken({ type: "catalog", subject: slug, maxAgeSeconds: CATALOG_SESSION_SECONDS }),
      sessionCookieOptions(CATALOG_SESSION_SECONDS),
    );
    return response;
  } catch (error) {
    if (error instanceof SyntaxError || error.message === "Invalid catalog slug.") {
      return jsonError("Invalid request.", 400);
    }
    return serverError(error, "Catalog access verification failed");
  }
}
