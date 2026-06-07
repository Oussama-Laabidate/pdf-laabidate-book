import CatalogExperience from "@/components/CatalogExperience";
import { getCatalog } from "@/lib/catalog-store";
import { toPublicCatalog } from "@/lib/catalog-model";
import { SITE_DESCRIPTION, absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const catalog = await getCatalog(slug);
    if (!catalog) {
      return {
        title: "Publication unavailable",
        description: SITE_DESCRIPTION,
        robots: { index: false, follow: false },
      };
    }

    const publicCatalog = toPublicCatalog(catalog);
    const description = publicCatalog.summary || publicCatalog.description ||
      `${publicCatalog.title} by Laabidate Oussama. ${publicCatalog.pageCount} pages in ${publicCatalog.category}.`;
    const canIndex = publicCatalog.accessMode === "public";

    return {
      title: publicCatalog.title,
      description,
      alternates: {
        canonical: `/catalog/${publicCatalog.slug}`,
      },
      openGraph: {
        title: publicCatalog.title,
        description,
        url: absoluteUrl(`/catalog/${publicCatalog.slug}`),
        type: "article",
        publishedTime: publicCatalog.dateAdded,
      },
      keywords: [
        publicCatalog.title,
        publicCatalog.category,
        "PDF catalog",
        "Laabidate Oussama",
      ].filter(Boolean),
      twitter: {
        card: "summary_large_image",
        title: publicCatalog.title,
        description,
      },
      robots: {
        index: canIndex,
        follow: canIndex,
        googleBot: {
          index: canIndex,
          follow: canIndex,
          "max-image-preview": "large",
          "max-snippet": -1,
        },
      },
    };
  } catch {
    return {
      title: "Publication",
      description: SITE_DESCRIPTION,
      robots: { index: false, follow: false },
    };
  }
}

export default async function CatalogPage({ params, searchParams }) {
  const { slug } = await params;
  const { token = "", code = "" } = await searchParams;
  const catalog = await getCatalog(slug).catch(() => null);
  const publicCatalog = catalog ? toPublicCatalog(catalog) : null;
  const jsonLd = publicCatalog ? {
    "@context": "https://schema.org",
    "@type": "Book",
    name: publicCatalog.title,
    description: publicCatalog.summary || publicCatalog.description || SITE_DESCRIPTION,
    url: absoluteUrl(`/catalog/${publicCatalog.slug}`),
    genre: publicCatalog.category,
    numberOfPages: publicCatalog.pageCount,
    datePublished: publicCatalog.dateAdded,
    isAccessibleForFree: publicCatalog.accessMode === "public",
    inLanguage: "en",
    author: {
      "@type": "Person",
      name: "Laabidate Oussama",
    },
    publisher: {
      "@type": "Person",
      name: "Laabidate Oussama",
    },
  } : null;
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <CatalogExperience
        slug={slug}
        initialCatalog={publicCatalog}
        initialHasAccess={publicCatalog?.accessMode === "public"}
        initialError={publicCatalog ? "" : "Catalog not found."}
        temporaryToken={token}
        temporaryCode={code}
      />
    </>
  );
}

