import Bookshelf from "@/components/Bookshelf";
import { listPublicCatalogs } from "@/lib/catalog-store";

export const revalidate = 300;

export default async function Home() {
  let catalogs = [];
  let initialError = "";

  try {
    catalogs = await listPublicCatalogs();
  } catch (error) {
    initialError = error.message;
  }

  return <Bookshelf initialCatalogs={catalogs} initialError={initialError} />;
}
