import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  decryptCatalogCode,
  decryptSecret,
  encryptCatalogCode,
  encryptSecret,
  hashCatalogCode,
  requireSameOrigin,
  secureCompare,
  verifyCatalogCode,
  verifySessionToken,
} from "../src/lib/security.js";

process.env.SESSION_SECRET = "test-session-secret-that-is-longer-than-thirty-two-characters";

test("signs and verifies scoped session tokens", () => {
  const token = createSessionToken({ type: "catalog", subject: "photo", maxAgeSeconds: 60 });
  assert.equal(verifySessionToken(token, { type: "catalog", subject: "photo" }).subject, "photo");
  assert.equal(verifySessionToken(token, { type: "admin" }), null);
  assert.equal(verifySessionToken(`${token}tampered`, { type: "catalog", subject: "photo" }), null);
});

test("hashes catalog codes with salt and verifies without plaintext storage", async () => {
  const code = "private-catalog-2026";
  const hash = await hashCatalogCode(code);
  assert.match(hash, /^scrypt:/);
  assert.equal(hash.includes(code), false);
  assert.equal(await verifyCatalogCode(code, hash), true);
  assert.equal(await verifyCatalogCode("wrong-code", hash), false);
});

test("encrypts catalog codes for admin-only recovery", () => {
  const code = "visible-private-code-2026";
  const encrypted = encryptCatalogCode(code);
  assert.match(encrypted, /^aes-256-gcm:/);
  assert.equal(encrypted.includes(code), false);
  assert.equal(decryptCatalogCode(encrypted), code);
  assert.equal(decryptCatalogCode(`${encrypted}tampered`), "");
});

test("encrypts server-side AI settings without exposing plaintext", () => {
  const key = "AIza-test-server-side-key-2026";
  const encrypted = encryptSecret(key, "gemini-api-key");
  assert.match(encrypted, /^aes-256-gcm:gemini-api-key:/);
  assert.equal(encrypted.includes(key), false);
  assert.equal(decryptSecret(encrypted, "gemini-api-key"), key);
  assert.equal(decryptSecret(encrypted, "other-purpose"), "");
});

test("uses constant-length comparison for secrets", () => {
  assert.equal(secureCompare("admin-code", "admin-code"), true);
  assert.equal(secureCompare("admin-code", "different"), false);
});

test("rejects cross-origin mutation requests", () => {
  const sameOrigin = {
    headers: new Headers({ origin: "https://portfolio.example", host: "portfolio.example" }),
  };
  const crossOrigin = {
    headers: new Headers({ origin: "https://attacker.example", host: "portfolio.example" }),
  };
  assert.equal(requireSameOrigin(sameOrigin), true);
  assert.equal(requireSameOrigin(crossOrigin), false);
});
