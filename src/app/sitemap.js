import { listPublicCatalogs } from "@/lib/catalog-store";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  let catalogs = [];
  try {
    catalogs = await listPublicCatalogs();
  } catch {
    // Storage backend unavailable (e.g. missing env vars during build).
    // Return a minimal sitemap instead of crashing.
  }

  return [
    {
      url: absoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...catalogs
      .filter((catalog) => catalog.accessMode === "public")
      .map((catalog) => ({
        url: absoluteUrl(`/catalog/${catalog.slug}`),
        lastModified: catalog.dateAdded,
        changeFrequency: "monthly",
        priority: 0.8,
      })),
  ];
}
