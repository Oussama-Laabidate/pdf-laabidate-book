import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBlankPdf } from "./helpers/pdf-fixture.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_CODE = "integration-admin-code-2026";
const VIEWER_CODE = "integration-viewer-code-2026";
const SESSION_SECRET = "integration-session-secret-with-more-than-thirty-two-characters";

test("secure catalog API flow", { timeout: 90_000 }, async (context) => {
  const contentRoot = await mkdtemp(path.join(tmpdir(), "catalog-api-"));
  const catalogsDir = path.join(contentRoot, "catalogs");
  await mkdir(catalogsDir, { recursive: true });

  const portraitPdf = createBlankPdf({ width: 612, height: 792, pageCount: 3 });
  const landscapePdf = createBlankPdf({ width: 792, height: 612, pageCount: 4 });
  await writeFile(path.join(catalogsDir, "portrait.pdf"), portraitPdf);
  await writeFile(path.join(catalogsDir, "landscape.pdf"), landscapePdf);
  await writeFile(
    path.join(contentRoot, "catalogs.json"),
    `${JSON.stringify({
      version: 1,
      updatedAt: "2026-06-04T00:00:00.000Z",
      catalogs: [
        catalogFixture("portrait", 3, 612 / 792, portraitPdf.length),
        catalogFixture("landscape", 4, 792 / 612, landscapePdf.length),
      ],
    }, null, 2)}\n`,
  );

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextBin = path.join(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next");
  const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ADMIN_CODE,
      SESSION_SECRET,
      CATALOG_STORAGE_MODE: "local",
      CATALOG_CONTENT_ROOT: contentRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });

  context.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      await Promise.race([once(server, "exit"), delay(5_000)]).catch(() => {});
    }
    server.stdout.destroy();
    server.stderr.destroy();
    await rm(contentRoot, { recursive: true, force: true });
  });

  await waitForServer(`${baseUrl}/api/catalogs`, server, () => serverOutput);

  let response = await fetch(`${baseUrl}/api/catalogs`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  let body = await response.json();
  assert.deepEqual(body.catalogs.map((catalog) => catalog.orientation), ["portrait", "landscape"]);

  response = await fetch(`${baseUrl}/api/catalogs/portrait/file`, {
    headers: { Range: "bytes=0-31" },
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal((await response.arrayBuffer()).byteLength, 32);

  response = await fetch(`${baseUrl}/api/admin/catalogs`);
  assert.equal(response.status, 401);

  response = await jsonRequest(`${baseUrl}/api/admin/catalogs/portrait`, {
    method: "PATCH",
    origin: baseUrl,
    body: { title: "Unauthorized" },
  });
  assert.equal(response.status, 401);

  response = await jsonRequest(`${baseUrl}/api/admin/session`, {
    method: "POST",
    origin: baseUrl,
    body: { code: "wrong-admin-code" },
  });
  assert.equal(response.status, 401);

  response = await jsonRequest(`${baseUrl}/api/admin/session`, {
    method: "POST",
    origin: baseUrl,
    body: { code: ADMIN_CODE },
  });
  assert.equal(response.status, 200);
  const adminCookieHeader = response.headers.get("set-cookie");
  assert.match(adminCookieHeader, /HttpOnly/i);
  assert.match(adminCookieHeader, /SameSite=Strict/i);
  assert.match(adminCookieHeader, /Secure/i);
  const adminCookie = cookiePair(adminCookieHeader);

  response = await jsonRequest(`${baseUrl}/api/admin/catalogs/portrait`, {
    method: "PATCH",
    origin: "https://attacker.example",
    cookie: adminCookie,
    body: { title: "Cross-origin change" },
  });
  assert.equal(response.status, 403);

  response = await jsonRequest(`${baseUrl}/api/admin/catalogs/portrait`, {
    method: "PATCH",
    origin: baseUrl,
    cookie: adminCookie,
    body: { accessMode: "protected", accessCode: VIEWER_CODE },
  });
  assert.equal(response.status, 200);
  const protectedManifest = await readFile(path.join(contentRoot, "catalogs.json"), "utf8");
  assert.match(protectedManifest, /"codeHash": "scrypt:/);
  assert.equal(protectedManifest.includes(VIEWER_CODE), false);

  response = await fetch(`${baseUrl}/api/catalogs/portrait/file`);
  assert.equal(response.status, 401);

  response = await jsonRequest(`${baseUrl}/api/catalogs/portrait/access`, {
    method: "POST",
    origin: baseUrl,
    body: { code: "wrong-viewer-code" },
  });
  assert.equal(response.status, 401);

  response = await jsonRequest(`${baseUrl}/api/catalogs/portrait/access`, {
    method: "POST",
    origin: baseUrl,
    body: { code: VIEWER_CODE },
  });
  assert.equal(response.status, 200);
  const viewerCookie = cookiePair(response.headers.get("set-cookie"));

  response = await fetch(`${baseUrl}/api/catalogs/portrait/file`, {
    headers: { Cookie: viewerCookie, Range: "bytes=0-15" },
  });
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 16);

  response = await fetch(`${baseUrl}/api/catalogs/%2e%2e%2fsecret/file`);
  assert.ok([400, 404].includes(response.status));

  response = await uploadRequest(baseUrl, adminCookie, "wrong-mime.pdf", "text/plain", portraitPdf);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /application\/pdf MIME/);

  response = await uploadRequest(baseUrl, adminCookie, "wrong-extension.txt", "application/pdf", portraitPdf);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /\.pdf extension/);

  response = await uploadRequest(baseUrl, adminCookie, "invalid.pdf", "application/pdf", Buffer.from("not a PDF"));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /not a valid PDF/);

  response = await uploadRequest(baseUrl, adminCookie, "new-portrait.pdf", "application/pdf", portraitPdf);
  body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.equal(body.catalog.orientation, "portrait");
});

function catalogFixture(slug, pageCount, aspectRatio, sizeBytes) {
  return {
    slug,
    title: slug[0].toUpperCase() + slug.slice(1),
    description: `${slug} integration fixture`,
    pdfPath: `content/catalogs/${slug}.pdf`,
    coverPath: null,
    pageCount,
    aspectRatio,
    sizeBytes,
    dateAdded: "2026-06-04T00:00:00.000Z",
    published: true,
    sortOrder: slug === "portrait" ? 0 : 1,
    accessMode: "public",
    codeHash: null,
  };
}

async function uploadRequest(baseUrl, cookie, filename, type, bytes) {
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type }), filename);
  return fetch(`${baseUrl}/api/admin/catalogs`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: baseUrl },
    body: formData,
  });
}

function jsonRequest(url, { method, origin, cookie, body }) {
  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function cookiePair(setCookie) {
  assert.ok(setCookie, "Expected a Set-Cookie header");
  return setCookie.split(";", 1)[0];
}

async function getFreePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
}

async function waitForServer(url, server, output) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next server exited before startup.\n${output()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Startup connection failures are expected until Next begins listening.
    }
    await delay(200);
  }
  throw new Error(`Next server did not start in time.\n${output()}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
