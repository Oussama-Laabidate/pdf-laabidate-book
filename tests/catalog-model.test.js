import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPdfPath,
  createSlug,
  normalizeManifest,
  parseByteRange,
  toPublicCatalog,
  validateCatalogCode,
  validatePdfUpload,
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

test("requires a PDF extension, MIME type, and safe size", () => {
  const valid = {
    name: "catalog.pdf",
    type: "application/pdf",
    size: 1024,
    arrayBuffer() {},
  };
  assert.equal(validatePdfUpload(valid), valid);
  assert.throws(() => validatePdfUpload({ ...valid, name: "catalog.txt" }), /\.pdf extension/);
  assert.throws(() => validatePdfUpload({ ...valid, type: "text/plain" }), /application\/pdf MIME/);
  assert.throws(() => validatePdfUpload({ ...valid, size: 0 }), /smaller than 95 MiB/);
});

test("reports portrait and landscape orientation from the catalog ratio", () => {
  const base = {
    slug: "orientation",
    title: "Orientation",
    description: "",
    coverPath: null,
    pageCount: 2,
    sizeBytes: 100,
    dateAdded: "2026-01-01T00:00:00.000Z",
    published: true,
    sortOrder: 0,
    accessMode: "public",
  };
  assert.equal(toPublicCatalog({ ...base, aspectRatio: 0.7 }).orientation, "portrait");
  assert.equal(toPublicCatalog({ ...base, aspectRatio: 1.4 }).orientation, "landscape");
});
