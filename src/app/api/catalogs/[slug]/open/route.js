import { NextResponse } from "next/server";
import { assertSlug } from "@/lib/catalog-model";
import { getCatalog } from "@/lib/catalog-store";
import { jsonError, serverError } from "@/lib/http";
import {
  accessCookieName,
  createSessionToken,
  sessionCookieOptions,
  temporaryTokenId,
  verifyTemporaryCatalogPayload,
} from "@/lib/security";
import { isTemporaryTokenUsed, markTemporaryTokenUsed } from "@/lib/stats-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    assertSlug(slug);
    const catalog = await getCatalog(slug);
    if (!catalog) return jsonError("Catalog not found.", 404);

    const token = request.nextUrl.searchParams.get("token") || "";
    const code = request.nextUrl.searchParams.get("code") || "";
    const payload = verifyTemporaryCatalogPayload(token, slug, code);
    if (!payload) return jsonError("Temporary link is invalid or expired.", 403);

    const id = temporaryTokenId(token);
    if (payload.oneTime && await isTemporaryTokenUsed(id)) {
      return jsonError("This one-time catalog link has already been used.", 410);
    }
    if (payload.oneTime) await markTemporaryTokenUsed(id, slug);

    const now = Math.floor(Date.now() / 1000);
    const remainingSeconds = Math.max(60, Math.min(7 * 24 * 60 * 60, payload.exp - now));
    const response = NextResponse.redirect(new URL(`/catalog/${encodeURIComponent(slug)}`, request.url));
    response.cookies.set(
      accessCookieName(slug),
      createSessionToken({
        type: "catalog",
        subject: slug,
        maxAgeSeconds: remainingSeconds,
        codeHash: catalog.accessMode === "protected" ? catalog.codeHash : null,
      }),
      sessionCookieOptions(remainingSeconds),
    );
    return response;
  } catch (error) {
    if (error.message === "Invalid catalog slug.") return jsonError(error.message, 400);
    return serverError(error, "Temporary catalog link open failed");
  }
}
