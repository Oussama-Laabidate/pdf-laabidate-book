import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readPdfMetadata } from "../src/lib/pdf-meta.js";

test("reads catalog PDF metadata and cleans up the loading task", async () => {
  const buffer = await readFile(new URL("../content/catalogs/PHOTO.pdf", import.meta.url));
  const metadata = await readPdfMetadata(buffer, "PHOTO.pdf");

  assert.equal(metadata.title, "PHOTO");
  assert.equal(metadata.pageCount, 87);
  assert.ok(metadata.aspectRatio > 1);
});
