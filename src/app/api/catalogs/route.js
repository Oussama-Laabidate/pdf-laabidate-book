import { NextResponse } from "next/server";
import { listPublicCatalogs } from "@/lib/catalog-store";
import { serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ success: true, catalogs: await listPublicCatalogs() });
  } catch (error) {
    return serverError(error, "Catalog list failed");
  }
}
