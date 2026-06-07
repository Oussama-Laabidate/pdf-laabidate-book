import fsPromises from "node:fs/promises";
import path from "node:path";

const CONTENT_ROOT = process.env.CATALOG_CONTENT_ROOT
  ? path.resolve(process.env.CATALOG_CONTENT_ROOT)
  : path.join(process.cwd(), "content");
const STATS_PATH = path.join(CONTENT_ROOT, "stats.json");
const KV_KEY = process.env.CATALOG_STATS_KEY || "catalog_stats";

export function statsBackend() {
  return process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN ? "kv" : "local";
}

export async function getStats() {
  const stats = await readStats();
  return normalizeStats(stats);
}

export async function recordSiteVisit() {
  return updateStats((stats) => {
    const today = new Date().toISOString().slice(0, 10);
    stats.site.visits += 1;
    stats.site.byDay[today] = (stats.site.byDay[today] || 0) + 1;
    stats.updatedAt = new Date().toISOString();
    return stats;
  });
}

export async function recordSiteDuration(durationMs) {
  const duration = Math.max(0, Math.min(30 * 60 * 1000, Number(durationMs) || 0));
  if (duration < 1000) return getStats();
  return updateStats((stats) => {
    stats.site.totalDurationMs += duration;
    stats.site.engagementCount += 1;
    stats.updatedAt = new Date().toISOString();
    return stats;
  });
}

export async function recordCatalogClick(slug) {
  return updateStats((stats) => {
    const entry = ensureCatalogStats(stats, slug);
    entry.clicks += 1;
    stats.updatedAt = new Date().toISOString();
    return stats;
  });
}

export async function recordCatalogVisit(slug) {
  return updateStats((stats) => {
    const entry = ensureCatalogStats(stats, slug);
    entry.views += 1;
    entry.lastViewedAt = new Date().toISOString();
    stats.updatedAt = new Date().toISOString();
    return stats;
  });
}

export async function recordTemporaryLink(slug) {
  return updateStats((stats) => {
    const entry = ensureCatalogStats(stats, slug);
    entry.temporaryLinks += 1;
    stats.updatedAt = new Date().toISOString();
    return stats;
  });
}

export async function recordAiRun(slug) {
  return updateStats((stats) => {
    const entry = ensureCatalogStats(stats, slug);
    entry.aiRuns += 1;
    stats.updatedAt = new Date().toISOString();
    return stats;
  });
}

export async function isTemporaryTokenUsed(tokenId) {
  const stats = await getStats();
  return Boolean(stats.temporaryTokens[tokenId]?.usedAt);
}

export async function markTemporaryTokenUsed(tokenId, slug) {
  return updateStats((stats) => {
    stats.temporaryTokens[tokenId] = {
      slug,
      usedAt: new Date().toISOString(),
    };
    stats.updatedAt = new Date().toISOString();
    return stats;
  });
}

async function updateStats(mutator) {
  const current = await readStats();
  const next = normalizeStats(mutator(normalizeStats(current)));
  await writeStats(next);
  return next;
}

async function readStats() {
  if (statsBackend() === "kv") {
    const response = await kvCommand(["GET", KV_KEY]);
    if (!response.result) return emptyStats();
    return typeof response.result === "string" ? JSON.parse(response.result) : response.result;
  }

  try {
    return JSON.parse(await fsPromises.readFile(STATS_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return emptyStats();
    throw error;
  }
}

async function writeStats(stats) {
  if (statsBackend() === "kv") {
    await kvCommand(["SET", KV_KEY, JSON.stringify(stats)]);
    return;
  }

  await fsPromises.mkdir(path.dirname(STATS_PATH), { recursive: true });
  await fsPromises.writeFile(STATS_PATH, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
}

async function kvCommand(command) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `KV request failed with status ${response.status}.`);
  }
  return payload || {};
}

function normalizeStats(stats) {
  const normalized = {
    version: 1,
    updatedAt: validIso(stats?.updatedAt) || new Date().toISOString(),
    site: {
      visits: Math.max(0, Number.parseInt(stats?.site?.visits, 10) || 0),
      totalDurationMs: Math.max(0, Number.parseInt(stats?.site?.totalDurationMs, 10) || 0),
      engagementCount: Math.max(0, Number.parseInt(stats?.site?.engagementCount, 10) || 0),
      byDay: typeof stats?.site?.byDay === "object" && stats.site.byDay ? stats.site.byDay : {},
    },
    catalogs: typeof stats?.catalogs === "object" && stats.catalogs ? stats.catalogs : {},
    temporaryTokens: typeof stats?.temporaryTokens === "object" && stats.temporaryTokens ? stats.temporaryTokens : {},
  };

  for (const [slug, entry] of Object.entries(normalized.catalogs)) {
    normalized.catalogs[slug] = {
      views: Math.max(0, Number.parseInt(entry?.views, 10) || 0),
      clicks: Math.max(0, Number.parseInt(entry?.clicks, 10) || 0),
      temporaryLinks: Math.max(0, Number.parseInt(entry?.temporaryLinks, 10) || 0),
      aiRuns: Math.max(0, Number.parseInt(entry?.aiRuns, 10) || 0),
      lastViewedAt: validIso(entry?.lastViewedAt),
    };
  }

  return normalized;
}

function ensureCatalogStats(stats, slug) {
  stats.catalogs[slug] ||= {
    views: 0,
    clicks: 0,
    temporaryLinks: 0,
    aiRuns: 0,
    lastViewedAt: null,
  };
  return stats.catalogs[slug];
}

function emptyStats() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    site: { visits: 0, totalDurationMs: 0, engagementCount: 0, byDay: {} },
    catalogs: {},
    temporaryTokens: {},
  };
}

function validIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}
