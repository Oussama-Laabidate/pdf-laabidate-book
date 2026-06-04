import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
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
