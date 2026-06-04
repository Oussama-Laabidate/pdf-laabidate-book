# Portfolio Archive

A Next.js portfolio for publishing responsive PDF catalogs with an animated page-flip reader and code-only access control.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set a strong `ADMIN_CODE` and a random `SESSION_SECRET` of at least 32 characters.
3. Run `npm install` and `npm run dev`.
4. Open `/admin`, enter the admin code, and upload PDF files locally.

Local uploads are validated, limited to 95 MiB per PDF, stored in `content/catalogs/`, and registered in `content/catalogs.json`.

## Publishing workflow

1. Add or update catalogs through the local admin console.
2. Commit the PDF files and manifest to a **private** GitHub repository.
3. Push the branch connected to Vercel.

Vercel production should use:

```env
ADMIN_CODE=...
SESSION_SECRET=...
CATALOG_STORAGE_MODE=github
GITHUB_REPOSITORY=owner/repository
GITHUB_CONTENT_BRANCH=main
GITHUB_CONTENT_TOKEN=...
```

The GitHub token needs read access to repository contents and write access to `content/catalogs.json`. Production admin changes update that manifest through the GitHub Contents API. PDF binary uploads remain local-only because Vercel Functions do not provide durable project-file writes.

## Security model

- PDFs live outside `public/` and are delivered only through `/api/catalogs/[slug]/file`.
- Protected catalog codes are stored as salted `scrypt` hashes.
- Admin and catalog sessions use signed `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- Every admin mutation is authorized server-side and rejects cross-origin requests.
- Verification endpoints include an application-level rate limit; configure Vercel Firewall rate limiting for production as well.

## Checks

```bash
npm test
npm run lint
npm run build
```
