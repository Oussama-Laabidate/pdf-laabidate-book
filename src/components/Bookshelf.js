"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  Grid2X2,
  List,
  LockKeyhole,
  Search,
  Settings,
} from "lucide-react";
import PdfFirstPagePreview from "./PdfFirstPagePreview";
import styles from "./Bookshelf.module.css";

export default function Bookshelf({ initialCatalogs = [], initialError = "" }) {
  const hasInitialCatalogs = initialCatalogs.length > 0;
  const [catalogs, setCatalogs] = useState(initialCatalogs);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [layoutMode, setLayoutMode] = useState("grid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    const startedAt = Date.now();
    let sentDuration = false;
    sendStats({ type: "site_view" });

    function sendDuration() {
      if (sentDuration) return;
      sentDuration = true;
      sendStats({ type: "site_duration", durationMs: Date.now() - startedAt });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") sendDuration();
    }

    window.addEventListener("pagehide", sendDuration);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      sendDuration();
      window.removeEventListener("pagehide", sendDuration);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/catalogs", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load catalogs.");
        if (active) {
          setCatalogs(data.catalogs);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active && !hasInitialCatalogs) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hasInitialCatalogs]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalogs.filter((catalog) => {
      const categoryMatch = activeCategory === "all" || catalog.category === activeCategory;
      const queryMatch = !normalizedQuery ||
        `${catalog.title} ${catalog.description} ${catalog.category}`.toLowerCase().includes(normalizedQuery);
      return categoryMatch && queryMatch;
    });
  }, [activeCategory, catalogs, query]);

  const categories = useMemo(() => {
    const names = catalogs.map((catalog) => catalog.category).filter(Boolean);
    return ["all", ...Array.from(new Set(names))];
  }, [catalogs]);

  const stats = useMemo(() => {
    const totalPages = catalogs.reduce((sum, catalog) => sum + (Number(catalog.pageCount) || 0), 0);
    return {
      publications: catalogs.length,
      pages: totalPages,
    };
  }, [catalogs]);

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className={styles.siteHeader}>
        <Link href="/" className={styles.logo} aria-label="Laabidate Oussama publications">
          <span>Laabidate</span><strong>Oussama</strong>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          <Link href="/admin">
            Settings <Settings size={14} />
          </Link>
          <a href="https://laabidate-oussama.vercel.app/" target="_blank" rel="noreferrer">
            Main portfolio <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>

      <section className={styles.archive} id="catalogs">
        <div className={styles.archiveHeader}>
          <div>
            <span className={styles.sectionLabel}>Laabidate Oussama</span>
            <h1>Publications</h1>
          </div>
          <p>
            Browse selected PDFs by category. Add or edit categories from
            Settings, then filter them here.
          </p>
        </div>

        <div className={styles.statsGrid} aria-label="Publication statistics">
          <div><FileText size={18} /><span>Publications</span><strong>{stats.publications}</strong></div>
          <div><BookOpen size={18} /><span>Total pages</span><strong>{stats.pages}</strong></div>
        </div>

        <div className={styles.controls}>
          <label className={styles.search}>
            <Search size={17} aria-hidden="true" />
            <span className="visually-hidden">Search publications</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search publications"
            />
          </label>
          <div className={styles.categoryFilter} aria-label="Publication category filter">
            {categories.map((category) => (
              <button
                type="button"
                key={category}
                className={activeCategory === category ? styles.activeCategory : ""}
                onClick={() => setActiveCategory(category)}
              >
                {category === "all" ? "All" : category}
              </button>
            ))}
          </div>
          <div className={styles.layoutToggle} aria-label="Publication layout">
            <button
              type="button"
              className={layoutMode === "grid" ? styles.activeLayout : ""}
              onClick={() => setLayoutMode("grid")}
              title="Horizontal card layout"
            >
              <Grid2X2 size={15} />
            </button>
            <button
              type="button"
              className={layoutMode === "list" ? styles.activeLayout : ""}
              onClick={() => setLayoutMode("list")}
              title="Vertical list layout"
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {error ? (
          <div className={styles.notice}><BookOpen size={22} /><p>{error}</p></div>
        ) : loading ? (
          <div className={styles.grid} aria-label="Loading catalogs">
            {[0, 1, 2].map((item) => <div className={styles.skeleton} key={item} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.notice}>
            <BookOpen size={22} />
            <p>{query || activeCategory !== "all" ? "No publications match your filters." : "No publications have been published yet."}</p>
          </div>
        ) : (
          <div className={`${styles.grid} ${layoutMode === "list" ? styles.listGrid : ""}`}>
            {filtered.map((catalog, index) => (
              <Link
                href={`/catalog/${catalog.slug}`}
                className={styles.card}
                key={catalog.slug}
                style={{ "--card-index": index }}
                onClick={() => sendStats({ type: "catalog_click", slug: catalog.slug })}
              >
                <div className={styles.coverStage}>
                  <span className={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <PdfCover
                    catalog={catalog}
                    index={index}
                    key={`${catalog.slug}-${catalog.accessMode}-${catalog.documentUrl}`}
                  />
                  <span className={styles.openIcon} aria-hidden="true"><ArrowUpRight size={19} /></span>
                </div>
                <div className={styles.cardInfo}>
                  <div>
                    <h3>{catalog.title}</h3>
                    <p>{catalog.description || "A selected visual project from the publication library."}</p>
                  </div>
                  <div className={styles.meta}>
                    <span>{catalog.category}</span>
                    <span>{catalog.orientation}</span>
                    {catalog.accessMode === "protected" && (
                      <span className={styles.protected}><LockKeyhole size={12} /> Private access</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.logo}><span>Laabidate</span><strong>Oussama</strong></Link>
        <p>{filtered.length} shown · {catalogs.length} total</p>
        <a href="https://laabidate-oussama.vercel.app/" target="_blank" rel="noreferrer">
          Main portfolio <ArrowUpRight size={14} />
        </a>
      </footer>
    </main>
  );
}

function PdfCover({ catalog, index }) {
  return (
    <PdfFirstPagePreview
      catalog={catalog}
      index={index}
      className={`${styles.cover} ${catalog.orientation === "landscape" ? styles.landscape : ""}`}
      readyClassName={styles.coverReady}
    >
      <div className={styles.coverFallback}>
        <span>{catalog.category}</span>
        <strong>{catalog.title}</strong>
        <small>{catalog.pageCount} pages</small>
      </div>
    </PdfFirstPagePreview>
  );
}

function sendStats(payload) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon?.("/api/stats", new Blob([body], { type: "application/json" }))) return;
  const request = new XMLHttpRequest();
  request.open("POST", "/api/stats");
  request.setRequestHeader("Content-Type", "application/json");
  request.send(body);
}
