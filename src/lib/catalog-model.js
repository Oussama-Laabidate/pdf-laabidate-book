export const MAX_FORM_UPLOAD_BYTES = 128 * 1024 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = MAX_FORM_UPLOAD_BYTES + 1024 * 1024;
export const INLINE_PDF_BYTES = 128 * 1024 * 1024;
export const METADATA_EXTRACTION_BYTES = 256 * 1024 * 1024;
export const MANIFEST_VERSION = 1;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PDF_PATH_PATTERN = /^content\/catalogs\/[A-Za-z0-9][A-Za-z0-9._ -]*\.pdf$/i;
export const PDF_MIME_TYPE = "application/pdf";
export const DEFAULT_CATEGORY = "Catalogs";

export function createSlug(value) {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (!SLUG_PATTERN.test(slug)) {
    throw new Error("A valid catalog slug could not be created.");
  }

  return slug;
}

export function assertSlug(slug) {
  if (!SLUG_PATTERN.test(String(slug || ""))) {
    throw new Error("Invalid catalog slug.");
  }
  return slug;
}

export function assertPdfPath(pdfPath) {
  const value = String(pdfPath || "");
  if (
    !PDF_PATH_PATTERN.test(value) ||
    value.includes("..") ||
    value.includes("\\") ||
    value.startsWith("/")
  ) {
    throw new Error("Invalid catalog PDF path.");
  }
  return value;
}

export function validateCatalogCode(code) {
  const value = String(code || "");
  if (value.length < 10 || value.length > 128) {
    throw new Error("Catalog access codes must be between 10 and 128 characters.");
  }
  return value;
}

export function validatePdfUpload(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Choose a PDF file.");
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("PDF files must not be empty.");
  }
  if (file.size > MAX_FORM_UPLOAD_BYTES) {
    throw new Error("Use the large-file upload flow for PDFs over 128 MiB.");
  }
  if (!/\.pdf$/i.test(String(file.name || ""))) {
    throw new Error("PDF files must use the .pdf extension.");
  }
  if (String(file.type || "").toLowerCase() !== PDF_MIME_TYPE) {
    throw new Error("PDF files must use the application/pdf MIME type.");
  }
  return file;
}

export function normalizeCatalog(catalog) {
  const accessMode = catalog.accessMode === "protected" ? "protected" : "public";
  const normalized = {
    slug: assertSlug(catalog.slug),
    title: String(catalog.title || "").trim().slice(0, 160),
    description: String(catalog.description || "").trim().slice(0, 1000),
    summary: String(catalog.summary || "").trim().slice(0, 2400),
    category: normalizeCategory(catalog.category),
    pdfPath: assertPdfPath(catalog.pdfPath),
    coverPath: catalog.coverPath ? String(catalog.coverPath).slice(0, 300) : null,
    pageCount: Math.max(1, Number.parseInt(catalog.pageCount, 10) || 1),
    aspectRatio: clampNumber(catalog.aspectRatio, 0.35, 3, 0.707),
    sizeBytes: Math.max(0, Number.parseInt(catalog.sizeBytes, 10) || 0),
    dateAdded: validIsoDate(catalog.dateAdded) || new Date().toISOString(),
    published: catalog.published !== false,
    sortOrder: Number.isFinite(Number(catalog.sortOrder)) ? Number(catalog.sortOrder) : 0,
    accessMode,
    codeHash: accessMode === "protected" && catalog.codeHash ? String(catalog.codeHash) : null,
    codeCipher: accessMode === "protected" && catalog.codeCipher ? String(catalog.codeCipher) : null,
  };

  if (!normalized.title) {
    throw new Error("Catalog title is required.");
  }

  return normalized;
}

export function normalizeManifest(manifest) {
  const catalogs = Array.isArray(manifest?.catalogs)
    ? manifest.catalogs.map(normalizeCatalog)
    : [];

  const seen = new Set();
  for (const catalog of catalogs) {
    if (seen.has(catalog.slug)) {
      throw new Error(`Duplicate catalog slug: ${catalog.slug}`);
    }
    seen.add(catalog.slug);
  }

  return {
    version: MANIFEST_VERSION,
    updatedAt: validIsoDate(manifest?.updatedAt) || new Date().toISOString(),
    catalogs,
    ai: normalizeAiSettings(manifest?.ai),
  };
}

export function toPublicCatalog(catalog) {
  return {
    slug: catalog.slug,
    title: catalog.title,
    description: catalog.description,
    summary: catalog.summary,
    category: catalog.category,
    coverPath: catalog.coverPath,
    pageCount: catalog.pageCount,
    aspectRatio: catalog.aspectRatio,
    sizeBytes: catalog.sizeBytes,
    dateAdded: catalog.dateAdded,
    published: catalog.published,
    sortOrder: catalog.sortOrder,
    accessMode: catalog.accessMode,
    orientation: catalog.aspectRatio >= 1 ? "landscape" : "portrait",
    fileUrl: `/api/catalogs/${encodeURIComponent(catalog.slug)}/file`,
    coverUrl: `/api/catalogs/${encodeURIComponent(catalog.slug)}/cover`,
    documentUrl: `/api/catalogs/${encodeURIComponent(catalog.slug)}/document`,
  };
}

export function toAdminCatalog(catalog) {
  return {
    ...toPublicCatalog(catalog),
    pdfPath: catalog.pdfPath,
    hasAccessCode: Boolean(catalog.codeHash),
  };
}

export function parseByteRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("Invalid file size.");
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) {
    throw new Error("Invalid range header.");
  }

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!suffixLength) throw new Error("Invalid range header.");
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  }

  if (start < 0 || end < start || start >= size) {
    throw new Error("Requested range is not satisfiable.");
  }

  return { start, end: Math.min(end, size - 1) };
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeCategory(value) {
  const category = String(value || "").trim().replace(/\s+/g, " ").slice(0, 64);
  return category || DEFAULT_CATEGORY;
}

function validIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function normalizeAiSettings(settings) {
  const provider = settings?.provider === "gemini" ? "gemini" : "gemini";
  const model = String(settings?.model || "").trim().slice(0, 120) || "gemini-2.5-flash";
  const apiKeyCipher = settings?.apiKeyCipher ? String(settings.apiKeyCipher) : null;
  return {
    provider,
    model,
    apiKeyCipher,
    updatedAt: validIsoDate(settings?.updatedAt),
  };
}
