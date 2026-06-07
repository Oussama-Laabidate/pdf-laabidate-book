import { absoluteUrl, getSiteUrl } from "@/lib/site";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/catalog/"],
      disallow: ["/admin", "/api/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: getSiteUrl(),
  };
}
