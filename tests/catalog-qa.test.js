import test from "node:test";
import assert from "node:assert/strict";
import { selectQuestionContext, validateQuestion } from "../src/lib/catalog-qa.js";

test("validates question length before calling AI", () => {
  assert.equal(validateQuestion("  What is the deadline?  "), "What is the deadline?");
  assert.throws(() => validateQuestion(" ? "), /longer question/);
  assert.throws(() => validateQuestion("x".repeat(601)), /under 600 characters/);
});

test("selects context from the active catalog pages only", () => {
  const result = selectQuestionContext("What is the warranty duration?", [
    { pageNumber: 1, text: "Catalog 4 includes furniture dimensions, colors, and materials." },
    { pageNumber: 2, text: "Warranty duration is 24 months for every product in Catalog 4." },
    { pageNumber: 3, text: "Shipping notes and installation notes are listed here." },
  ]);

  assert.equal(result.hasRelevantContext, true);
  assert.equal(result.chunks[0].pageNumber, 2);
  assert.match(result.chunks[0].text, /Warranty duration/);
});

test("marks unrelated questions as having no relevant local context", () => {
  const result = selectQuestionContext("Who won the world cup?", [
    { pageNumber: 1, text: "Catalog 4 includes furniture dimensions, colors, and materials." },
  ]);

  assert.equal(result.hasRelevantContext, false);
});
