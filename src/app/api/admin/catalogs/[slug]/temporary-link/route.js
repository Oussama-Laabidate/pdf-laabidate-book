import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog-store";
import { assertSlug } from "@/lib/catalog-model";
import { jsonError, requireAdmin, serverError } from "@/lib/http";
import { createTemporaryCatalogToken, TEMPORARY_CATALOG_LINK_SECONDS } from "@/lib/security";
import { recordTemporaryLink } from "@/lib/stats-store";

export const runtime = "nodejs";

export async function POST(request, context) {
  const denied = requireAdmin(request, { mutation: true });
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    assertSlug(slug);
    const catalog = await getCatalog(slug);
    if (!catalog) return jsonError("Catalog not found.", 404);

    const body = await request.json().catch(() => ({}));
    const requestedSeconds = Number(body.maxAgeSeconds);
    const maxAgeSeconds = Number.isFinite(requestedSeconds)
      ? Math.min(7 * 24 * 60 * 60, Math.max(5 * 60, Math.round(requestedSeconds)))
      : TEMPORARY_CATALOG_LINK_SECONDS;
    const accessCode = String(body.accessCode || "").trim();
    const oneTime = Boolean(body.oneTime);
    const token = createTemporaryCatalogToken(slug, maxAgeSeconds, { oneTime, accessCode });
    const url = new URL(oneTime ? `/api/catalogs/${encodeURIComponent(slug)}/open` : `/catalog/${encodeURIComponent(slug)}`, request.url);
    url.searchParams.set("token", token);
    if (accessCode) url.searchParams.set("code", accessCode);
    await recordTemporaryLink(slug).catch(() => {});

    return NextResponse.json({
      success: true,
      url: url.toString(),
      expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
      maxAgeSeconds,
      oneTime,
      hasAccessCode: Boolean(accessCode),
    });
  } catch (error) {
    if (error.message === "Invalid catalog slug.") return jsonError(error.message, 400);
    return serverError(error, "Temporary catalog link generation failed");
  }
}
