import { NextResponse } from "next/server";
import { jsonError, requireAdmin, serverError } from "@/lib/http";
import { getStats, statsBackend } from "@/lib/stats-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    return NextResponse.json({
      success: true,
      backend: statsBackend(),
      stats: await getStats(),
    });
  } catch (error) {
    if (/KV|JSON/i.test(error.message)) return jsonError(error.message, 500);
    return serverError(error, "Admin stats load failed");
  }
}
