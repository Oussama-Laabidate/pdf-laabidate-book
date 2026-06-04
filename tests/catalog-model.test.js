import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPdfPath,
  createSlug,
  normalizeManifest,
  parseByteRange,
  validateCatalogCode,
} from "../src/lib/catalog-model.js";

test("creates stable safe slugs", () => {
  assert.equal(createSlug("  Summer Event 2026.pdf  "), "summer-event-2026-pdf");
  assert.throws(() => createSlug("___"), /valid catalog slug/);
});

test("rejects PDF paths outside the private content directory", () => {
  assert.equal(assertPdfPath("content/catalogs/photo.pdf"), "content/catalogs/photo.pdf");
  assert.throws(() => assertPdfPath("../public/photo.pdf"), /Invalid catalog PDF path/);
  assert.throws(() => assertPdfPath("content/catalogs/../../.env"), /Invalid catalog PDF path/);
  assert.throws(() => assertPdfPath("content\\catalogs\\photo.pdf"), /Invalid catalog PDF path/);
});

test("parses regular, open-ended, and suffix byte ranges", () => {
  assert.deepEqual(parseByteRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange("bytes=900-", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseByteRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.throws(() => parseByteRange("bytes=1000-1001", 1000), /not satisfiable/);
});

test("normalizes manifests and does not allow duplicate slugs", () => {
  const catalog = {
    slug: "photo",
    title: "PHOTO",
    pdfPath: "content/catalogs/photo.pdf",
    pageCount: 4,
    aspectRatio: 1.4,
    published: true,
    accessMode: "public",
  };
  assert.equal(normalizeManifest({ catalogs: [catalog] }).catalogs[0].codeHash, null);
  assert.throws(() => normalizeManifest({ catalogs: [catalog, catalog] }), /Duplicate catalog slug/);
});

test("requires meaningful catalog access codes", () => {
  assert.equal(validateCatalogCode("shared-code-2026"), "shared-code-2026");
  assert.throws(() => validateCatalogCode("short"), /between 10 and 128/);
});
