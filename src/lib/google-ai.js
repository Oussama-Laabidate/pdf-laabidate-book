const DEFAULT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function generateCatalogAi({ task, catalog, text, apiKeyOverride = "", modelOverride = "" }) {
  const apiKey = String(apiKeyOverride || "").trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Add it in the admin field or set GEMINI_API_KEY on Vercel.");
  }

  const model = String(modelOverride || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const response = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: buildPrompt({ task, catalog, text }) }],
      }],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: "application/json",
      },
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(geminiErrorMessage(payload?.error?.message, response.status));
  }

  const raw = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = parseJson(raw);
  return {
    title: cleanText(parsed.title, 160),
    description: cleanText(parsed.description, 320),
    summary: cleanText(parsed.summary, 2400),
  };
}

export async function generateCatalogAnswer({ question, catalog, chunks, apiKeyOverride = "", modelOverride = "" }) {
  const apiKey = String(apiKeyOverride || "").trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("AI API key is not configured. Add it in the admin AI settings or set GEMINI_API_KEY on Vercel.");
  }

  const model = String(modelOverride || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const response = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: buildQuestionPrompt({ question, catalog, chunks }) }],
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(geminiErrorMessage(payload?.error?.message, response.status));
  }

  const raw = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = parseJson(raw);
  const answer = cleanText(parsed.answer, 2200);
  return {
    answer: answer || "I could not find that information in this catalog.",
    inCatalog: parsed.inCatalog === true,
    citations: Array.isArray(parsed.citations)
      ? parsed.citations.map((item) => Math.max(1, Number.parseInt(item, 10) || 1)).slice(0, 6)
      : [],
  };
}

function buildPrompt({ task, catalog, text }) {
  return [
    "You are improving SEO metadata for a digital PDF catalog website.",
    "Return strict JSON only with keys: title, description, summary.",
    "Write concise, polished English. Do not invent details that are not supported by the provided text.",
    `Task: ${task}.`,
    `Current title: ${catalog.title || ""}`,
    `Current description: ${catalog.description || ""}`,
    `Category: ${catalog.category || ""}`,
    "",
    "PDF text excerpt:",
    text,
  ].join("\n");
}

function buildQuestionPrompt({ question, catalog, chunks }) {
  const context = chunks.map((chunk, index) => (
    `Excerpt ${index + 1} (page ${chunk.pageNumber}):\n${chunk.text}`
  )).join("\n\n---\n\n");
  return [
    "You answer questions about one PDF catalog only.",
    "The active catalog is the only allowed source. Use only the provided excerpts from this exact catalog.",
    "Do not use internet knowledge, general knowledge, conversation memory, or information from another catalog.",
    "If the answer is not directly supported by the excerpts, set inCatalog to false and answer exactly: \"I could not find that information in this catalog.\"",
    "Return strict JSON only with keys: answer, inCatalog, citations.",
    "citations must be a non-empty array of page numbers from the excerpts that support the answer when inCatalog is true.",
    `Active catalog slug: ${catalog.slug || ""}`,
    `Catalog title: ${catalog.title || ""}`,
    `Catalog category: ${catalog.category || ""}`,
    `Question: ${question}`,
    "",
    "Catalog excerpts:",
    context || "No extractable catalog text was available.",
  ].join("\n");
}

function parseJson(value) {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Gemini returned a response that could not be parsed as JSON.");
  }
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function geminiErrorMessage(message, status) {
  const detail = String(message || "");
  if (/denied access|permission|api key not valid|invalid api key/i.test(detail)) {
    return "Gemini access was denied for this API key or Google Cloud project. Use a valid Google AI Studio key with Gemini API access, or contact Google AI support for that project.";
  }
  if (/quota|rate[- ]?limit/i.test(detail)) {
    return "Gemini quota was exceeded for this API key. Wait for the quota window to reset, use another key, or upgrade the Google AI project quota.";
  }
  if (/high demand|overloaded|unavailable/i.test(detail)) {
    return "Gemini is currently under high demand. Try the AI action again later or switch GEMINI_MODEL to another available model.";
  }
  return detail || `Gemini request failed with status ${status}.`;
}
