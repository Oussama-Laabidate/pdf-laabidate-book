import test from "node:test";
import assert from "node:assert/strict";
import { generateCatalogAi } from "../src/lib/google-ai.js";

const ORIGINAL_FETCH = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

test("explains Gemini project access denial as an API key or project issue", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: "Your project has been denied access. Please contact support." },
  }), { status: 403, headers: { "Content-Type": "application/json" } });

  await assert.rejects(
    () => generateCatalogAi({
      task: "metadata",
      catalog: { title: "Catalog", description: "", category: "Catalogs" },
      text: "This PDF excerpt contains enough text for a metadata request.",
      apiKeyOverride: "test-key",
    }),
    /Gemini access was denied for this API key or Google Cloud project/,
  );
});

test("explains Gemini quota failures with a quota action", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: "You exceeded your current quota, please check your plan and billing details." },
  }), { status: 429, headers: { "Content-Type": "application/json" } });

  await assert.rejects(
    () => generateCatalogAi({
      task: "summary",
      catalog: { title: "Catalog", description: "", category: "Catalogs" },
      text: "This PDF excerpt contains enough text for a summary request.",
      apiKeyOverride: "test-key",
    }),
    /Gemini quota was exceeded/,
  );
});
