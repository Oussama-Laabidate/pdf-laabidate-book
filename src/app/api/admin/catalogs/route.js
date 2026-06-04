import { NextResponse } from "next/server";
import {
  canUploadLocally,
  createLocalCatalog,
  listAdminCatalogs,
  storageMode,
} from "@/lib/catalog-store";
import { jsonError, requireAdmin, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    return NextResponse.json({
      success: true,
      catalogs: await listAdminCatalogs(),
      canUpload: canUploadLocally(),
      storageMode: storageMode(),
    });
  } catch (error) {
    return serverError(error, "Admin catalog list failed");
  }
}

export async function POST(request) {
  const denied = requireAdmin(request, { mutation: true });
  if (denied) return denied;
  if (!canUploadLocally()) {
    return jsonError("Add PDF files locally, then push them to GitHub.", 409);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return jsonError("Choose a PDF file.", 400);
    }
    const catalog = await createLocalCatalog(file);
    return NextResponse.json({ success: true, catalog }, { status: 201 });
  } catch (error) {
    if (/PDF|catalog slug|valid PDF/i.test(error.message)) {
      return jsonError(error.message, 400);
    }
    return serverError(error, "Catalog upload failed");
  }
}
