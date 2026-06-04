import CatalogExperience from "@/components/CatalogExperience";

export default async function CatalogPage({ params }) {
  const { slug } = await params;
  return <CatalogExperience slug={slug} />;
}
