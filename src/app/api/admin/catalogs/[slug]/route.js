import { NextResponse } from "next/server";
import { removeCatalog, updateCatalog } from "@/lib/catalog-store";
import { assertSlug } from "@/lib/catalog-model";
import { jsonError, requireAdmin, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function PATCH(request, context) {
  const denied = requireAdmin(request, { mutation: true });
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    assertSlug(slug);
    const catalog = await updateCatalog(slug, await request.json());
    if (!catalog) return jsonError("Catalog not found.", 404);
    return NextResponse.json({ success: true, catalog });
  } catch (error) {
    if (/Invalid catalog slug|access code|title is required/i.test(error.message)) {
      return jsonError(error.message, 400);
    }
    return serverError(error, "Catalog update failed");
  }
}

export async function DELETE(request, context) {
  const denied = requireAdmin(request, { mutation: true });
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    assertSlug(slug);
    if (!(await removeCatalog(slug))) return jsonError("Catalog not found.", 404);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error.message === "Invalid catalog slug.") return jsonError(error.message, 400);
    return serverError(error, "Catalog removal failed");
  }
}
