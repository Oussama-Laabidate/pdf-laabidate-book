import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { validateCatalogCode } from "./catalog-model.js";

const scrypt = promisify(scryptCallback);
export const ADMIN_COOKIE = "catalog_admin_session";
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
export const CATALOG_SESSION_SECONDS = 24 * 60 * 60;
export const TEMPORARY_CATALOG_LINK_SECONDS = 24 * 60 * 60;

export function accessCookieName(slug) {
  return `catalog_access_${slug}`;
}

export function secureCompare(left, right) {
  const leftDigest = createHash("sha256").update(String(left || "")).digest();
  const rightDigest = createHash("sha256").update(String(right || "")).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function hashAdminCode(code) {
  return `sha256:${createHash("sha256").update(String(code || "")).digest("hex")}`;
}

export function verifyAdminCode(code) {
  const adminHash = String(process.env.ADMIN_CODE_HASH || "").trim();
  if (adminHash) {
    return secureCompare(hashAdminCode(code), adminHash);
  }
  const adminCode = process.env.ADMIN_CODE;
  return Boolean(adminCode && adminCode.length >= 10 && secureCompare(code, adminCode));
}

export function isAdminConfigured() {
  return Boolean(String(process.env.ADMIN_CODE_HASH || "").trim()) ||
    Boolean(process.env.ADMIN_CODE && process.env.ADMIN_CODE.length >= 10);
}

export async function hashCatalogCode(code) {
  const validCode = validateCatalogCode(code);
  const salt = randomBytes(16);
  const derived = await scrypt(validCode, salt, 64);
  return `scrypt:${salt.toString("base64url")}:${Buffer.from(derived).toString("base64url")}`;
}

export function encryptCatalogCode(code) {
  const validCode = validateCatalogCode(code);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", catalogCodeKey(), iv);
  cipher.setAAD(Buffer.from("catalog-access-code:v1"));
  const encrypted = Buffer.concat([cipher.update(validCode, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes-256-gcm:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptCatalogCode(encodedCipher) {
  const parts = String(encodedCipher || "").split(":");
  if (parts.length !== 4 || parts[0] !== "aes-256-gcm") return "";

  try {
    const decipher = createDecipheriv("aes-256-gcm", catalogCodeKey(), Buffer.from(parts[1], "base64url"));
    decipher.setAAD(Buffer.from("catalog-access-code:v1"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

export function encryptSecret(value, purpose = "app-secret") {
  const secret = String(value || "").trim();
  if (!secret) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", genericSecretKey(), iv);
  cipher.setAAD(Buffer.from(`${purpose}:v1`));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes-256-gcm:${purpose}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(encodedCipher, purpose = "app-secret") {
  const parts = String(encodedCipher || "").split(":");
  if (parts.length !== 5 || parts[0] !== "aes-256-gcm" || parts[1] !== purpose) return "";

  try {
    const decipher = createDecipheriv("aes-256-gcm", genericSecretKey(), Buffer.from(parts[2], "base64url"));
    decipher.setAAD(Buffer.from(`${purpose}:v1`));
    decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[4], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

export async function verifyCatalogCode(code, encodedHash) {
  const parts = String(encodedHash || "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  try {
    const salt = Buffer.from(parts[1], "base64url");
    const expected = Buffer.from(parts[2], "base64url");
    const actual = Buffer.from(await scrypt(String(code || ""), salt, expected.length));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createSessionToken({ type, subject = "", maxAgeSeconds, ...claims }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    type,
    subject,
    iat: now,
    exp: now + maxAgeSeconds,
    nonce: randomBytes(12).toString("base64url"),
    ...claims,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token, { type, subject = null } = {}) {
  const [encoded, signature, extra] = String(token || "").split(".");
  if (!encoded || !signature || extra || !secureCompare(signature, sign(encoded))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now || payload.type !== type) return null;
    if (subject !== null && payload.subject !== subject) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isAdminRequest(request) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  return Boolean(verifySessionToken(token, { type: "admin" }));
}

export function hasCatalogAccess(request, slug, currentCodeHash = null) {
  const token = request.cookies.get(accessCookieName(slug))?.value;
  const payload = verifySessionToken(token, { type: "catalog", subject: slug });
  if (!payload) return false;
  if (currentCodeHash && payload.codeHash !== currentCodeHash) return false;
  return true;
}

export function createTemporaryCatalogToken(slug, maxAgeSeconds = TEMPORARY_CATALOG_LINK_SECONDS, options = {}) {
  const linkCode = String(options.accessCode || "").trim();
  return createSessionToken({
    type: "catalog-temp",
    subject: slug,
    maxAgeSeconds,
    oneTime: Boolean(options.oneTime),
    linkCodeHash: linkCode ? hashLinkCode(linkCode) : null,
  });
}

export function hasTemporaryCatalogAccess(request, slug) {
  const token = request.nextUrl?.searchParams?.get("token") || new URL(request.url).searchParams.get("token");
  const code = request.nextUrl?.searchParams?.get("code") || new URL(request.url).searchParams.get("code") || "";
  return Boolean(verifyTemporaryCatalogPayload(token, slug, code));
}

export function verifyTemporaryCatalogToken(token, slug, code = "") {
  return Boolean(verifyTemporaryCatalogPayload(token, slug, code));
}

export function verifyTemporaryCatalogPayload(token, slug, code = "") {
  const payload = verifySessionToken(token, { type: "catalog-temp", subject: slug });
  if (!payload) return null;
  if (payload.linkCodeHash && payload.linkCodeHash !== hashLinkCode(code)) return null;
  return payload;
}

export function temporaryTokenId(token) {
  return createHash("sha256").update(String(token || "")).digest("base64url");
}

export function sessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
    priority: "high",
  };
}

export function requireSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function sign(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function catalogCodeKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return createHash("sha256").update(`catalog-access-code:${secret}`).digest();
}

function genericSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return createHash("sha256").update(`server-secret:${secret}`).digest();
}

function hashLinkCode(code) {
  return createHash("sha256").update(String(code || "")).digest("base64url");
}
