import test from "node:test";
import assert from "node:assert/strict";
import { readPdfMetadata } from "../src/lib/pdf-meta.js";
import { createBlankPdf } from "./helpers/pdf-fixture.js";

test("reads catalog PDF metadata and cleans up the loading task", async () => {
  const buffer = createBlankPdf({ width: 900, height: 500, title: "PHOTO" });
  const metadata = await readPdfMetadata(buffer, "PHOTO.pdf");

  assert.equal(metadata.title, "PHOTO");
  assert.equal(metadata.pageCount, 2);
  assert.ok(metadata.aspectRatio > 1);
});
