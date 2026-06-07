import { NextResponse } from "next/server";
import { assertSlug } from "@/lib/catalog-model";
import { recordCatalogClick, recordCatalogVisit, recordSiteDuration, recordSiteVisit } from "@/lib/stats-store";
import { serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.type === "catalog_view") {
      assertSlug(body.slug);
      await recordCatalogVisit(body.slug);
    } else if (body.type === "catalog_click") {
      assertSlug(body.slug);
      await recordCatalogClick(body.slug);
    } else if (body.type === "site_duration") {
      await recordSiteDuration(body.durationMs);
    } else {
      await recordSiteVisit();
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error.message === "Invalid catalog slug.") {
      return NextResponse.json({ success: false }, { status: 400 });
    }
    return serverError(error, "Stats recording failed");
  }
}
