import {
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

export function accessCookieName(slug) {
  return `catalog_access_${slug}`;
}

export function secureCompare(left, right) {
  const leftDigest = createHash("sha256").update(String(left || "")).digest();
  const rightDigest = createHash("sha256").update(String(right || "")).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export async function hashCatalogCode(code) {
  const validCode = validateCatalogCode(code);
  const salt = randomBytes(16);
  const derived = await scrypt(validCode, salt, 64);
  return `scrypt:${salt.toString("base64url")}:${Buffer.from(derived).toString("base64url")}`;
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

export function createSessionToken({ type, subject = "", maxAgeSeconds }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    type,
    subject,
    iat: now,
    exp: now + maxAgeSeconds,
    nonce: randomBytes(12).toString("base64url"),
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

export function hasCatalogAccess(request, slug) {
  const token = request.cookies.get(accessCookieName(slug))?.value;
  return Boolean(verifySessionToken(token, { type: "catalog", subject: slug }));
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
