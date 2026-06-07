export const SITE_NAME = "Laabidate Oussama Publications";
export const SITE_DESCRIPTION =
  "Interactive publications, catalogs, CVs, and selected visual work by Laabidate Oussama.";

export function getSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://127.0.0.1:3000");
  return raw.replace(/\/+$/, "");
}

export function absoluteUrl(path = "/") {
  return new URL(path, `${getSiteUrl()}/`).toString();
}
