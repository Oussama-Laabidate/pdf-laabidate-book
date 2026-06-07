import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog-store";
import { assertSlug, toPublicCatalog } from "@/lib/catalog-model";
import { hasCatalogAccess, hasTemporaryCatalogAccess } from "@/lib/security";
import { jsonError, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    assertSlug(slug);
    const catalog = await getCatalog(slug);
    if (!catalog) return jsonError("Catalog not found.", 404);

    const hasAccess =
      catalog.accessMode === "public" ||
      hasCatalogAccess(request, slug, catalog.codeHash) ||
      hasTemporaryCatalogAccess(request, slug);

    return NextResponse.json({
      success: true,
      catalog: toPublicCatalog(catalog),
      hasAccess,
    });
  } catch (error) {
    if (error.message === "Invalid catalog slug.") return jsonError(error.message, 400);
    return serverError(error, "Catalog detail failed");
  }
}
