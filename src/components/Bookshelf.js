"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, LockKeyhole, Search } from "lucide-react";
import styles from "./Bookshelf.module.css";

export default function Bookshelf() {
  const [catalogs, setCatalogs] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/catalogs", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load catalogs.");
        if (active) setCatalogs(data.catalogs);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return catalogs;
    return catalogs.filter((catalog) =>
      `${catalog.title} ${catalog.description}`.toLowerCase().includes(normalizedQuery),
    );
  }, [catalogs, query]);

  return (
    <main className={styles.page}>
      <header className={styles.siteHeader}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true" />
          <span>Portfolio Archive</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#catalogs">Catalogs</a>
          <Link href="/admin">Admin</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <h1>Selected work,<br />made to be explored.</h1>
        <p>
          A curated archive of catalogs, projects, and event work presented as
          tactile digital publications.
        </p>
        <a href="#catalogs" className={styles.heroLink}>
          Explore the archive <ArrowUpRight size={16} />
        </a>
      </section>

      <section className={styles.archive} id="catalogs">
        <div className={styles.archiveHeader}>
          <div>
            <span className={styles.sectionLabel}>Archive</span>
            <h2>Published catalogs</h2>
          </div>
          <label className={styles.search}>
            <Search size={17} aria-hidden="true" />
            <span className="visually-hidden">Search catalogs</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the archive"
            />
          </label>
        </div>

        {error ? (
          <div className={styles.notice}>
            <BookOpen size={22} />
            <p>{error}</p>
          </div>
        ) : loading ? (
          <div className={styles.grid} aria-label="Loading catalogs">
            {[0, 1, 2].map((item) => <div className={styles.skeleton} key={item} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.notice}>
            <BookOpen size={22} />
            <p>{query ? "No catalogs match your search." : "No catalogs have been published yet."}</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((catalog, index) => (
              <Link href={`/catalog/${catalog.slug}`} className={styles.card} key={catalog.slug}>
                <div className={styles.coverStage}>
                  <div
                    className={`${styles.cover} ${catalog.orientation === "landscape" ? styles.landscape : ""}`}
                    style={{ "--cover-ratio": catalog.aspectRatio, "--cover-index": index }}
                  >
                    <span className={styles.coverNumber}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <strong>{catalog.title}</strong>
                    <span className={styles.coverFoot}>Portfolio archive</span>
                  </div>
                </div>
                <div className={styles.cardInfo}>
                  <div>
                    <h3>{catalog.title}</h3>
                    <p>{catalog.description || "Open the catalog to explore the work."}</p>
                  </div>
                  <span className={styles.openIcon} aria-hidden="true">
                    <ArrowUpRight size={17} />
                  </span>
                </div>
                <div className={styles.meta}>
                  <span>{catalog.pageCount} pages</span>
                  <span>{catalog.orientation}</span>
                  {catalog.accessMode === "protected" && (
                    <span className={styles.protected}><LockKeyhole size={12} /> Protected</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        <span>Portfolio Archive</span>
        <span>Digital catalogs and selected work</span>
      </footer>
    </main>
  );
}
