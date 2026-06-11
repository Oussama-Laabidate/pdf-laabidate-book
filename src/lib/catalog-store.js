import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { PDFDocument } from "pdf-lib";
import {
  assertPdfPath,
  assertSlug,
  createSlug,
  METADATA_EXTRACTION_BYTES,
  normalizeCatalog,
  normalizeManifest,
  parseByteRange,
  toAdminCatalog,
  toPublicCatalog,
  validatePdfUpload,
} from "./catalog-model.js";
import {
  decryptCatalogCode,
  decryptSecret,
  encryptCatalogCode,
  encryptSecret,
  hashCatalogCode,
} from "./security.js";
import { readPdfMetadata } from "./pdf-meta.js";

const ROOT = process.cwd();
const CONTENT_ROOT = process.env.CATALOG_CONTENT_ROOT
  ? path.resolve(process.env.CATALOG_CONTENT_ROOT)
  : path.join(ROOT, "content");
const MANIFEST_PATH = path.join(CONTENT_ROOT, "catalogs.json");
const CATALOGS_DIR = path.join(CONTENT_ROOT, "catalogs");

export function storageMode() {
  return process.env.CATALOG_STORAGE_MODE || (process.env.VERCEL ? "github" : "local");
}

export function canUploadLocally() {
  return storageMode() === "local";
}

export async function listPublicCatalogs() {
  const manifest = await readManifest();
  return manifest.catalogs
    .filter((catalog) => catalog.published)
    .sort(sortCatalogs)
    .map(toPublicCatalog);
}

export async function listAdminCatalogs() {
  const manifest = await readManifest();
  return manifest.catalogs.sort(sortCatalogs).map(toAdminCatalogWithAccessCode);
}

export async function readAiSettings({ includeSecret = false } = {}) {
  const manifest = await readManifest();
  const settings = manifest.ai || {};
  const envKey = String(process.env.GEMINI_API_KEY || "").trim();
  const savedKey = includeSecret && settings.apiKeyCipher
    ? decryptSecret(settings.apiKeyCipher, "gemini-api-key")
    : "";
  return {
    provider: "gemini",
    model: settings.model || process.env.GEMINI_MODEL || "gemini-2.5-flash",
    configured: Boolean(envKey || settings.apiKeyCipher),
    source: envKey ? "environment" : settings.apiKeyCipher ? "admin" : "none",
    apiKey: includeSecret ? (envKey || savedKey) : "",
  };
}

export async function updateAiSettings(patch = {}) {
  const manifest = await readManifest();
  const current = manifest.ai || {};
  const model = String(patch.model || current.model || process.env.GEMINI_MODEL || "gemini-2.5-flash").trim().slice(0, 120);
  const apiKey = String(patch.apiKey || "").trim();
  const clearApiKey = Boolean(patch.clearApiKey);

  manifest.ai = {
    provider: "gemini",
    model: model || "gemini-2.5-flash",
    apiKeyCipher: clearApiKey ? null : apiKey ? encryptSecret(apiKey, "gemini-api-key") : current.apiKeyCipher || null,
    updatedAt: new Date().toISOString(),
  };

  await writeManifest(manifest, "Update AI settings");
  return readAiSettings();
}

export async function getCatalog(slug, { includeUnpublished = false } = {}) {
  assertSlug(slug);
  const manifest = await readManifest();
  const catalog = manifest.catalogs.find((item) => item.slug === slug);
  if (!catalog || (!catalog.published && !includeUnpublished)) return null;
  return catalog;
}

export async function createLocalCatalog(file) {
  if (!canUploadLocally()) {
    throw new Error("PDF uploads are available only in local storage mode.");
  }
  validatePdfUpload(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size) {
    throw new Error("The uploaded PDF size could not be verified.");
  }
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("The uploaded file is not a valid PDF.");
  }

  const originalBase = path.basename(String(file.name || "catalog.pdf")).replace(/\.pdf$/i, "");
  const manifest = await readManifest();
  const slug = uniqueSlug(createSlug(originalBase), manifest.catalogs);
  const filename = `${slug}.pdf`;
  const pdfPath = `content/catalogs/${filename}`;
  const absolutePath = resolvePdfPath(pdfPath);
  const meta = await readPdfMetadata(buffer, file.name);

  await fsPromises.mkdir(CATALOGS_DIR, { recursive: true });
  await fsPromises.writeFile(absolutePath, buffer, { flag: "wx" });

  const catalog = normalizeCatalog({
    slug,
    title: meta.title,
    description: "",
    summary: "",
    category: "Catalogs",
    pdfPath,
    coverPath: null,
    pageCount: meta.pageCount,
    aspectRatio: meta.aspectRatio,
    sizeBytes: buffer.length,
    dateAdded: new Date().toISOString(),
    published: true,
    sortOrder: manifest.catalogs.length,
    accessMode: "public",
    codeHash: null,
    codeCipher: null,
  });

  manifest.catalogs.push(catalog);
  try {
    await writeManifest(manifest, `Add catalog ${catalog.title}`);
  } catch (error) {
    await fsPromises.rm(absolutePath, { force: true }).catch(() => {});
    throw error;
  }
  return toAdminCatalogWithAccessCode(catalog);
}

export async function createLocalCatalogFromStream({ filename, mimeType, sizeBytes, stream }) {
  if (!canUploadLocally()) {
    throw new Error("PDF uploads are available only in local storage mode.");
  }
  if (!stream || typeof stream.getReader !== "function") {
    throw new Error("Choose a PDF file.");
  }
  if (!/\.pdf$/i.test(String(filename || ""))) {
    throw new Error("PDF files must use the .pdf extension.");
  }
  if (String(mimeType || "").toLowerCase() !== "application/pdf") {
    throw new Error("PDF files must use the application/pdf MIME type.");
  }
  if (Number.isFinite(sizeBytes) && sizeBytes <= 0) {
    throw new Error("PDF files must not be empty.");
  }

  const originalBase = path.basename(String(filename || "catalog.pdf")).replace(/\.pdf$/i, "");
  const manifest = await readManifest();
  const slug = uniqueSlug(createSlug(originalBase), manifest.catalogs);
  const pdfPath = `content/catalogs/${slug}.pdf`;
  const absolutePath = resolvePdfPath(pdfPath);
  const tempPath = path.join(CATALOGS_DIR, `.uploading-${slug}-${Date.now()}.pdf`);

  await fsPromises.mkdir(CATALOGS_DIR, { recursive: true });

  let written = 0;
  let header = Buffer.alloc(0);
  const validator = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.from(chunk);
      written += buffer.length;
      if (header.length < 5) {
        header = Buffer.concat([header, buffer.subarray(0, 5 - header.length)]);
        if (header.length >= 5 && header.toString("ascii") !== "%PDF-") {
          callback(new Error("The uploaded file is not a valid PDF."));
          return;
        }
      }
      callback(null, buffer);
    },
  });

  try {
    await pipeline(Readable.fromWeb(stream), validator, fs.createWriteStream(tempPath, { flags: "wx" }));
    if (written <= 0) throw new Error("PDF files must not be empty.");
    if (Number.isFinite(sizeBytes) && written !== sizeBytes) {
      throw new Error("The uploaded PDF size could not be verified.");
    }

    const meta = await readMetadataFromLocalFile(absolutePath, tempPath, filename, written);
    await fsPromises.rename(tempPath, absolutePath);

    const catalog = normalizeCatalog({
      slug,
      title: meta.title,
      description: "",
      summary: "",
      category: "Catalogs",
      pdfPath,
      coverPath: null,
      pageCount: meta.pageCount,
      aspectRatio: meta.aspectRatio,
      sizeBytes: written,
      dateAdded: new Date().toISOString(),
      published: true,
      sortOrder: manifest.catalogs.length,
      accessMode: "public",
      codeHash: null,
      codeCipher: null,
    });

    manifest.catalogs.push(catalog);
    try {
      await writeManifest(manifest, `Add catalog ${catalog.title}`);
    } catch (error) {
      await fsPromises.rm(absolutePath, { force: true }).catch(() => {});
      throw error;
    }
    return toAdminCatalogWithAccessCode(catalog);
  } catch (error) {
    await fsPromises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function updateCatalog(slug, patch) {
  assertSlug(slug);
  const manifest = await readManifest();
  const index = manifest.catalogs.findIndex((catalog) => catalog.slug === slug);
  if (index === -1) return null;

  const current = manifest.catalogs[index];
  const accessCode = String(patch.accessCode || "").trim();
  const requestedAccessMode = patch.accessMode === "protected" ? "protected" : patch.accessMode === "public" ? "public" : current.accessMode;

  // Determine the effective accessMode:
  // - If a new accessCode is provided, it becomes "protected" regardless
  // - Otherwise, use the explicitly requested mode
  const accessMode = accessCode ? "protected" : requestedAccessMode;

  let codeHash = current.codeHash;
  let codeCipher = current.codeCipher;

  if (accessMode === "public") {
    codeHash = null;
    codeCipher = null;
  } else if (accessCode) {
    // New access code provided — hash and encrypt it
    codeHash = await hashCatalogCode(accessCode);
    codeCipher = encryptCatalogCode(accessCode);
  } else if (!codeHash) {
    // Trying to set protected mode without an access code and no existing code
    throw new Error("Set an access code before protecting this catalog.");
  }
  // If accessMode === "protected" and no new accessCode but codeHash exists,
  // keep the existing codeHash and codeCipher unchanged.


  const updated = normalizeCatalog({
    ...current,
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    summary: patch.summary ?? current.summary,
    category: patch.category ?? current.category,
    published: typeof patch.published === "boolean" ? patch.published : current.published,
    sortOrder: patch.sortOrder ?? current.sortOrder,
    accessMode,
    codeHash,
    codeCipher,
  });

  manifest.catalogs[index] = updated;
  await writeManifest(manifest, `Update catalog ${updated.title}`);
  return toAdminCatalogWithAccessCode(updated);
}

export async function removeCatalog(slug) {
  assertSlug(slug);
  const manifest = await readManifest();
  const index = manifest.catalogs.findIndex((catalog) => catalog.slug === slug);
  if (index === -1) return false;

  const [catalog] = manifest.catalogs.splice(index, 1);
  if (canUploadLocally()) {
    await fsPromises.rm(resolvePdfPath(catalog.pdfPath), { force: true });
    const coverPdfPath = catalog.pdfPath.replace(/\.pdf$/i, "-cover.pdf");
    await fsPromises.rm(resolvePdfPath(coverPdfPath), { force: true }).catch(() => {});
  }
  await writeManifest(manifest, `Remove catalog ${catalog.title}`);
  return true;
}

export async function createCatalogFileResponse(catalog, rangeHeader) {
  if (storageMode() === "github") {
    return githubFileResponse(catalog.pdfPath, rangeHeader);
  }
  return localFileResponse(catalog.pdfPath, rangeHeader);
}

export async function generateCatalogCover(catalog) {
  let originalBytes;
  if (storageMode() === "github") {
    originalBytes = await readCatalogDocument(catalog);
  } else {
    const absolutePdfPath = resolvePdfPath(catalog.pdfPath);
    originalBytes = await fsPromises.readFile(absolutePdfPath);
  }

  const srcDoc = await PDFDocument.load(originalBytes);
  const pdfDoc = await PDFDocument.create();

  const [copiedPage] = await pdfDoc.copyPages(srcDoc, [0]);
  pdfDoc.addPage(copiedPage);

  const coverBytes = await pdfDoc.save();
  return Buffer.from(coverBytes);
}

export async function createCatalogCoverResponse(catalog) {
  const coverPdfPath = catalog.pdfPath.replace(/\.pdf$/i, "-cover.pdf");

  if (storageMode() === "github") {
    const response = await githubFileResponse(coverPdfPath);
    if (response.status === 200 || response.status === 206) {
      return response;
    }
    const coverBytes = await generateCatalogCover(catalog);
    return new Response(coverBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  }

  const absoluteCoverPath = resolvePdfPath(coverPdfPath);
  let exists = false;
  try {
    await fsPromises.access(absoluteCoverPath);
    exists = true;
  } catch {}

  if (!exists) {
    try {
      const coverBytes = await generateCatalogCover(catalog);
      await fsPromises.writeFile(absoluteCoverPath, coverBytes);
    } catch (err) {
      console.error("Cover generation failed:", err);
      return new Response("Cover generation failed", { status: 500 });
    }
  }

  return localFileResponse(coverPdfPath);
}

export async function readCatalogDocument(catalog) {
  if (storageMode() === "github") {
    return readGithubBinary(catalog.pdfPath);
  }
  return fsPromises.readFile(resolvePdfPath(catalog.pdfPath));
}

export async function readManifest() {
  const raw = storageMode() === "github"
    ? await readGithubText("content/catalogs.json")
    : await fsPromises.readFile(MANIFEST_PATH, "utf8");
  return normalizeManifest(JSON.parse(raw));
}

export async function writeManifest(manifest, commitMessage) {
  const normalized = normalizeManifest({
    ...manifest,
    updatedAt: new Date().toISOString(),
  });
  const content = `${JSON.stringify(normalized, null, 2)}\n`;

  if (storageMode() === "github") {
    await writeGithubText("content/catalogs.json", content, commitMessage);
  } else {
    await fsPromises.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
    await fsPromises.writeFile(MANIFEST_PATH, content, "utf8");
  }
}

async function localFileResponse(pdfPath, rangeHeader) {
  const absolutePath = resolvePdfPath(pdfPath);
  const stats = await fsPromises.stat(absolutePath);
  let range = null;
  try {
    range = parseByteRange(rangeHeader, stats.size);
  } catch {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stats.size}` },
    });
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
  });
  const stream = fs.createReadStream(absolutePath, range || undefined);
  const body = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
      stream.on("end", () => controller.close());
      stream.on("error", (error) => controller.error(error));
    },
    cancel() {
      stream.destroy();
    },
  });

  if (range) {
    headers.set("Content-Length", String(range.end - range.start + 1));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${stats.size}`);
    return new Response(body, { status: 206, headers });
  }

  headers.set("Content-Length", String(stats.size));
  return new Response(body, { status: 200, headers });
}

async function githubFileResponse(pdfPath, rangeHeader) {
  assertPdfPath(pdfPath);
  const response = await githubRequest(`/contents/${encodeGithubPath(pdfPath)}?ref=${encodeURIComponent(githubConfig().branch)}`, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      ...(rangeHeader ? { Range: rangeHeader } : {}),
    },
  });

  if (!response.ok) {
    return new Response(null, { status: response.status });
  }

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": response.headers.get("accept-ranges") || "bytes",
  });
  for (const name of ["content-length", "content-range"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

async function readGithubBinary(pdfPath) {
  assertPdfPath(pdfPath);
  const response = await githubRequest(`/contents/${encodeGithubPath(pdfPath)}?ref=${encodeURIComponent(githubConfig().branch)}`, {
    headers: {
      Accept: "application/vnd.github.raw+json",
    },
  });
  if (!response.ok) throw new Error(`GitHub PDF read failed with status ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function readGithubText(repoPath) {
  const response = await githubRequest(`/contents/${encodeGithubPath(repoPath)}?ref=${encodeURIComponent(githubConfig().branch)}`);
  if (!response.ok) throw new Error(`GitHub read failed with status ${response.status}.`);
  const data = await response.json();
  return Buffer.from(data.content, "base64").toString("utf8");
}

async function writeGithubText(repoPath, content, message) {
  const config = githubConfig();
  const current = await githubRequest(`/contents/${encodeGithubPath(repoPath)}?ref=${encodeURIComponent(config.branch)}`);
  if (!current.ok) throw new Error(`GitHub manifest lookup failed with status ${current.status}.`);
  const currentData = await current.json();

  const response = await githubRequest(`/contents/${encodeGithubPath(repoPath)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString("base64"),
      sha: currentData.sha,
      branch: config.branch,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub manifest update failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

function githubRequest(apiPath, options = {}) {
  const config = githubConfig();
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${config.token}`);
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", "catalog-portfolio");
  return fetch(`https://api.github.com/repos/${config.repository}${apiPath}`, {
    ...options,
    headers,
    cache: "no-store",
  });
}

function githubConfig() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_CONTENT_TOKEN;
  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !token) {
    throw new Error("GITHUB_REPOSITORY and GITHUB_CONTENT_TOKEN are required in GitHub storage mode.");
  }
  return {
    repository,
    token,
    branch: process.env.GITHUB_CONTENT_BRANCH || "main",
  };
}

function resolvePdfPath(pdfPath) {
  const validPath = assertPdfPath(pdfPath);
  const resolved = path.resolve(CATALOGS_DIR, path.basename(validPath));
  const allowedRoot = path.resolve(CATALOGS_DIR) + path.sep;
  if (!resolved.startsWith(allowedRoot)) {
    throw new Error("Catalog PDF path escapes the content directory.");
  }
  return resolved;
}

function encodeGithubPath(repoPath) {
  return repoPath.split("/").map(encodeURIComponent).join("/");
}

async function readMetadataFromLocalFile(finalPath, tempPath, filename, sizeBytes) {
  const fallbackTitle = String(filename || "").replace(/\.pdf$/i, "").trim() || "Untitled catalog";
  if (sizeBytes > METADATA_EXTRACTION_BYTES) {
    return {
      title: fallbackTitle.slice(0, 160),
      pageCount: 1,
      aspectRatio: 0.707,
    };
  }

  const buffer = await fsPromises.readFile(tempPath || finalPath);
  return readPdfMetadata(buffer, filename);
}

function uniqueSlug(base, catalogs) {
  const used = new Set(catalogs.map((catalog) => catalog.slug));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function sortCatalogs(left, right) {
  return left.sortOrder - right.sortOrder || left.title.localeCompare(right.title);
}

function toAdminCatalogWithAccessCode(catalog) {
  return {
    ...toAdminCatalog(catalog),
    accessCode: catalog.codeCipher ? decryptCatalogCode(catalog.codeCipher) : "",
  };
}
