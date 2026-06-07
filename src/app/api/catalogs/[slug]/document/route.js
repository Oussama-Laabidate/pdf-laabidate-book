import { getCatalog, readCatalogDocument } from "@/lib/catalog-store";
import { assertSlug, INLINE_PDF_BYTES } from "@/lib/catalog-model";
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
    if (catalog.accessMode === "protected" && !hasCatalogAccess(request, slug, catalog.codeHash) && !hasTemporaryCatalogAccess(request, slug)) {
      return jsonError("Catalog access code required.", 401);
    }
    if (catalog.sizeBytes > INLINE_PDF_BYTES) {
      return jsonError("Large catalogs must be read through the streaming file endpoint.", 413);
    }

    const bytes = await readCatalogDocument(catalog);
    const payload = new Uint8Array(bytes.length + 1);
    payload[0] = 0;
    payload.set(bytes, 1);

    return new Response(payload, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(payload.byteLength),
        "Cache-Control": "private, no-store",
        "X-Catalog-Mime-Type": "application/pdf",
        "X-Catalog-Byte-Length": String(bytes.length),
        "X-Catalog-Document-Encoding": "prefixed-pdf-v1",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error.message === "Invalid catalog slug.") return jsonError(error.message, 400);
    return serverError(error, "Catalog document delivery failed");
  }
}
