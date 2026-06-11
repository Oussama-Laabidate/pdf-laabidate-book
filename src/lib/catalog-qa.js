const MIN_QUESTION_LENGTH = 3;
const MAX_QUESTION_LENGTH = 600;
const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 180;
const MAX_CHUNKS = 8;
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "i", "in", "is", "it",
  "of", "on", "or", "that", "the", "this", "to", "was", "what", "when", "where", "which", "who",
  "why", "with", "you", "your", "عن", "على", "في", "من", "ما", "ماذا", "هل", "كيف", "اين", "أين",
  "هو", "هي", "هذا", "هذه", "ذلك", "تلك", "الى", "إلى", "او", "أو",
]);

export function validateQuestion(value) {
  const question = String(value || "").replace(/\s+/g, " ").trim();
  if (question.length < MIN_QUESTION_LENGTH) {
    throw new Error("Write a longer question.");
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new Error("Questions must be under 600 characters.");
  }
  return question;
}

export function selectQuestionContext(question, pages) {
  const terms = tokenize(question);
  const chunks = [];

  for (const page of pages || []) {
    for (const text of splitPage(page.text)) {
      const score = scoreChunk(text, terms);
      chunks.push({
        pageNumber: page.pageNumber,
        text,
        score,
      });
    }
  }

  const selected = chunks
    .filter((chunk) => chunk.text.length >= 40)
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, MAX_CHUNKS);

  return {
    chunks: selected,
    hasRelevantContext: selected.some((chunk) => chunk.score > 0) || terms.length === 0,
  };
}

function splitPage(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks = [];
  for (let start = 0; start < normalized.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    chunks.push(normalized.slice(start, start + CHUNK_SIZE).trim());
  }
  return chunks;
}

function scoreChunk(text, terms) {
  if (terms.length === 0) return 1;
  const normalized = normalizeText(text);
  let score = 0;
  for (const term of terms) {
    if (normalized.includes(term)) score += term.length > 4 ? 2 : 1;
  }
  return score;
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term))
    .slice(0, 24);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
