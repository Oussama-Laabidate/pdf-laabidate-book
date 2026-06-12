# Portfolio Archive

A Next.js portfolio for publishing responsive PDF catalogs with an animated page-flip reader and code-only access control.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set a strong `ADMIN_CODE` and a random `SESSION_SECRET` of at least 32 characters.
3. Run `npm install` and `npm run dev`.
4. Open `/admin`, enter the admin code, and upload PDF files locally.

Local uploads are validated, streamed to `content/catalogs/`, and registered in `content/catalogs.json`. Large PDFs are limited by local disk space and any reverse proxy/server body limits; files over 128 MiB use the raw streaming upload path.

## Publishing workflow

1. Add or update catalogs through the local admin console.
2. Commit the PDF files and manifest to a **private** GitHub repository.
3. Push the branch connected to Vercel.

Vercel production should use:

```env
ADMIN_CODE=...
# Or set ADMIN_CODE_HASH=sha256:... instead of ADMIN_CODE.
SESSION_SECRET=...
CATALOG_STORAGE_MODE=github
GITHUB_REPOSITORY=owner/repository
GITHUB_CONTENT_BRANCH=main
GITHUB_CONTENT_TOKEN=...
GEMINI_MODEL=gemini-2.5-flash
```

When `ADMIN_CODE_HASH` is present, it takes precedence over `ADMIN_CODE`. Generate it locally with:

```bash
node --input-type=module -e "import('./src/lib/security.js').then(({ hashAdminCode }) => console.log(hashAdminCode('your-new-code')))"
```

The GitHub token needs read access to repository contents and write access to `content/catalogs.json`. Production admin changes update that manifest through the GitHub Contents API. PDF binary uploads remain local-only because Vercel Functions do not provide durable project-file writes.

## Catalog AI

Open `/admin` and save a Gemini API key in the AI settings section, or set `GEMINI_API_KEY` directly in Vercel. Admin-saved keys are encrypted into `content/catalogs.json` with `SESSION_SECRET`, so keep `SESSION_SECRET` stable across deployments. Visitors can ask questions only after they have access to the catalog, and answers are generated from the active PDF catalog excerpts only.

## Security model

- PDFs live outside `public/` and are delivered only through `/api/catalogs/[slug]/file`.
- Protected catalog covers, documents, files, and AI questions all re-check catalog access server-side.
- Protected catalog codes are stored as salted `scrypt` hashes.
- Admin-saved AI keys are encrypted server-side and are never sent back to the browser.
- Admin and catalog sessions use signed `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- Every admin mutation is authorized server-side and rejects cross-origin requests.
- Verification endpoints include an application-level rate limit; configure Vercel Firewall rate limiting for production as well.

## Checks

```bash
npm test
npm run lint
npm run build
npm run test:api
npm audit
```

`test:api` builds and starts a temporary production server, then verifies admin authorization, protected-catalog access, temporary links, Range responses, traversal rejection, strict PDF upload validation, and portrait/landscape metadata.
