import { NextResponse } from "next/server";
import { readAiSettings, updateAiSettings } from "@/lib/catalog-store";
import { jsonError, requireAdmin, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    return NextResponse.json({ success: true, settings: await readAiSettings() });
  } catch (error) {
    return serverError(error, "AI settings read failed");
  }
}

export async function PUT(request) {
  const denied = requireAdmin(request, { mutation: true });
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const apiKey = String(body.apiKey || "").trim();
    const model = String(body.model || "").trim();
    if (apiKey && apiKey.length < 20) return jsonError("AI API key is too short.", 400);
    if (model && !/^[A-Za-z0-9_.:-]+$/.test(model)) return jsonError("AI model name is invalid.", 400);

    const settings = await updateAiSettings({
      apiKey,
      model,
      clearApiKey: Boolean(body.clearApiKey),
    });
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return serverError(error, "AI settings update failed");
  }
}
