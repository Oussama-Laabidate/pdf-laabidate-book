import { listPublicCatalogs } from "@/lib/catalog-store";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap() {
  const catalogs = await listPublicCatalogs();
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
