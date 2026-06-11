import { NextResponse } from "next/server";
import { assertSlug } from "@/lib/catalog-model";
import { getCatalog, readAiSettings, readCatalogDocument, updateCatalog } from "@/lib/catalog-store";
import { generateCatalogAi } from "@/lib/google-ai";
import { jsonError, requireAdmin } from "@/lib/http";
import { readPdfText } from "@/lib/pdf-text";
import { recordAiRun } from "@/lib/stats-store";

export const runtime = "nodejs";

const AI_MAX_PDF_BYTES = 512 * 1024 * 1024;

export async function POST(request, context) {
  const denied = requireAdmin(request, { mutation: true });
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    assertSlug(slug);
    const catalog = await getCatalog(slug, { includeUnpublished: true });
    if (!catalog) return jsonError("Catalog not found.", 404);
    if ((Number(catalog.sizeBytes) || 0) > AI_MAX_PDF_BYTES) {
      return jsonError("AI extraction is limited to PDFs under 512 MiB. Use a smaller optimized PDF or add metadata manually.", 413);
    }

    const body = await request.json().catch(() => ({}));
    const task = ["metadata", "summary", "all"].includes(body.task) ? body.task : "all";
    const document = await readCatalogDocument(catalog);
    const extracted = await readPdfText(document, { maxPages: 20, maxChars: 20000 });
    if (extracted.text.length < 80) {
      return jsonError("The PDF does not contain enough extractable text for AI metadata.", 422);
    }

    const settings = await readAiSettings({ includeSecret: true });
    const result = await generateCatalogAi({
      task,
      catalog,
      text: extracted.text,
      apiKeyOverride: body.geminiApiKey || settings.apiKey,
      modelOverride: settings.model,
    });
    let updated = catalog;
    if (body.apply !== false) {
      const patch = {};
      if (task === "metadata" || task === "all") {
        if (result.title) patch.title = result.title;
        if (result.description) patch.description = result.description;
      }
      if (task === "summary" || task === "all") {
        if (result.summary) patch.summary = result.summary;
      }
      updated = Object.keys(patch).length ? await updateCatalog(slug, patch) : catalog;
    }

    await recordAiRun(slug).catch(() => {});
    return NextResponse.json({ success: true, result, catalog: updated, extracted });
  } catch (error) {
    const message = error.message || "AI catalog task failed.";
    console.error("AI catalog task failed", error);
    if (/Invalid catalog slug/i.test(message)) return jsonError(message, 400);
    if (/under 512 MiB/i.test(message)) return jsonError(message, 413);
    if (/not enough extractable text/i.test(message)) return jsonError(message, 422);
    return jsonError(message, 400);
  }
}
