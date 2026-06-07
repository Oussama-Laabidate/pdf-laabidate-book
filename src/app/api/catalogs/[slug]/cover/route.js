import { createCatalogCoverResponse, getCatalog } from "@/lib/catalog-store";
import { assertSlug } from "@/lib/catalog-model";
import { jsonError, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    assertSlug(slug);
    const catalog = await getCatalog(slug);
    if (!catalog) return jsonError("Catalog not found.", 404);

    return createCatalogCoverResponse(catalog);
  } catch (error) {
    if (error.message === "Invalid catalog slug.") return jsonError(error.message, 400);
    return serverError(error, "Catalog cover delivery failed");
  }
}
