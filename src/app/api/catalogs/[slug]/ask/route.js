import { NextResponse } from "next/server";
import { assertSlug } from "@/lib/catalog-model";
import { selectQuestionContext, validateQuestion } from "@/lib/catalog-qa";
import { getCatalog, readAiSettings, readCatalogDocument } from "@/lib/catalog-store";
import { generateCatalogAnswer } from "@/lib/google-ai";
import { jsonError, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { readPdfText } from "@/lib/pdf-text";
import { hasCatalogAccess, hasTemporaryCatalogAccess, requireSameOrigin } from "@/lib/security";
import { recordAiRun } from "@/lib/stats-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QA_MAX_PDF_BYTES = 512 * 1024 * 1024;

export async function POST(request, context) {
  try {
    if (!requireSameOrigin(request)) return jsonError("Cross-origin request rejected.", 403);

    const attempt = rateLimit(request, "catalog-question", { limit: 20, windowMs: 60 * 60 * 1000 });
    if (!attempt.allowed) {
      return jsonError("Too many AI questions. Try again later.", 429, {
        "Retry-After": String(attempt.retryAfter),
      });
    }

    const { slug } = await context.params;
    assertSlug(slug);
    const catalog = await getCatalog(slug);
    if (!catalog) return jsonError("Catalog not found.", 404);
    if (
      catalog.accessMode === "protected" &&
      !hasCatalogAccess(request, slug, catalog.codeHash) &&
      !hasTemporaryCatalogAccess(request, slug)
    ) {
      return jsonError("Catalog access code required.", 401);
    }
    if ((Number(catalog.sizeBytes) || 0) > QA_MAX_PDF_BYTES) {
      return jsonError("AI questions are limited to PDFs under 512 MiB.", 413);
    }

    const body = await request.json().catch(() => ({}));
    const question = validateQuestion(body.question);
    const settings = await readAiSettings({ includeSecret: true });
    if (!settings.apiKey) return jsonError("AI is not configured for this site.", 503);

    const document = await readCatalogDocument(catalog);
    const extracted = await readPdfText(document, { maxPages: 80, maxChars: 80000 });
    if (extracted.text.length < 80) {
      return jsonError("This catalog does not contain enough extractable text for AI questions.", 422);
    }

    const contextResult = selectQuestionContext(question, extracted.pages);
    if (!contextResult.hasRelevantContext) {
      return NextResponse.json({
        success: true,
        answer: "I could not find that information in this catalog.",
        inCatalog: false,
        citations: [],
      });
    }

    const result = await generateCatalogAnswer({
      question,
      catalog,
      chunks: contextResult.chunks,
      apiKeyOverride: settings.apiKey,
      modelOverride: settings.model,
    });
    await recordAiRun(slug).catch(() => {});
    return NextResponse.json({
      success: true,
      answer: result.answer,
      inCatalog: result.inCatalog,
      citations: result.citations,
    });
  } catch (error) {
    if (/Invalid catalog slug|longer question|under 600 characters/i.test(error.message)) {
      return jsonError(error.message, 400);
    }
    if (/under 512 MiB/i.test(error.message)) return jsonError(error.message, 413);
    if (/not enough extractable text/i.test(error.message)) return jsonError(error.message, 422);
    if (/API key|quota|access|Gemini|model|denied/i.test(error.message)) return jsonError(error.message, 503);
    return serverError(error, "Catalog question failed");
  }
}
