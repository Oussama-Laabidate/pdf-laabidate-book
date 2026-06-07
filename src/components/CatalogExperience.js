"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  KeyRound,
  LockKeyhole,
  Shield,
  Tag,
  Unlock,
} from "lucide-react";
import FlipbookReader from "./FlipbookReader";
import styles from "./CatalogExperience.module.css";

export default function CatalogExperience({
  slug,
  initialCatalog = null,
  initialHasAccess = false,
  initialError = "",
  temporaryToken = "",
  temporaryCode = "",
}) {
  const [state, setState] = useState({
    loading: !initialCatalog && !initialError,
    catalog: initialCatalog,
    hasAccess: initialHasAccess,
    error: initialError,
  });
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accessError, setAccessError] = useState("");

  const backdropCanvasRef = useRef(null);
  const bookCanvasRef = useRef(null);
  const [backdropReady, setBackdropReady] = useState(false);
  const [bookReady, setBookReady] = useState(false);

  useEffect(() => {
    if (initialCatalog?.accessMode === "public") return undefined;
    let active = true;
    const query = temporaryToken ? `?${temporaryQuery(temporaryToken, temporaryCode)}` : "";
    fetch(`/api/catalogs/${encodeURIComponent(slug)}${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Catalog not found.");
        if (active) setState({ loading: false, catalog: data.catalog, hasAccess: data.hasAccess, error: "" });
      })
      .catch((error) => {
        if (active) setState({ loading: false, catalog: null, hasAccess: false, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [initialCatalog?.accessMode, slug, temporaryCode, temporaryToken]);

  useEffect(() => {
    if (state.loading || state.hasAccess || !state.catalog) return undefined;

    let active = true;
    let loadingTask = null;

    async function loadAndRender() {
      setBackdropReady(false);
      setBookReady(false);

      try {
        const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const resolvedCatalog = withTemporaryToken(state.catalog, temporaryToken, temporaryCode);

        loadingTask = pdfjs.getDocument({
          url: resolvedCatalog.coverUrl || resolvedCatalog.fileUrl,
          withCredentials: true,
          isEvalSupported: false,
          disableAutoFetch: true,
          rangeChunkSize: 512 * 1024,
        });

        const pdf = await loadingTask.promise;
        if (!active) return;

        const page = await pdf.getPage(1);
        if (!active) return;

        // Render to backdrop canvas
        if (backdropCanvasRef.current) {
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = backdropCanvasRef.current;
          const context = canvas.getContext("2d", { alpha: false });
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: context, viewport }).promise;
          if (active) setBackdropReady(true);
        }

        // Render to book cover canvas
        if (active && bookCanvasRef.current) {
          const viewport = page.getViewport({ scale: 1 });
          const scale = Math.min(1.6, Math.max(0.7, 520 / viewport.width));
          const scaled = page.getViewport({ scale });
          const canvas = bookCanvasRef.current;
          const context = canvas.getContext("2d", { alpha: false });
          canvas.width = Math.ceil(scaled.width);
          canvas.height = Math.ceil(scaled.height);
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: context, viewport: scaled }).promise;
          if (active) setBookReady(true);
        }
      } catch (err) {
        console.warn("PDF page preview render failed:", err);
        if (active) {
          setBackdropReady(false);
          setBookReady(false);
        }
      }
    }

    loadAndRender();

    return () => {
      active = false;
      loadingTask?.destroy?.().catch(() => {});
    };
  }, [state.hasAccess, state.catalog, state.loading, temporaryToken, temporaryCode]);

  async function unlock(event) {
    event.preventDefault();
    setSubmitting(true);
    setAccessError("");
    try {
      const response = await fetch(`/api/catalogs/${encodeURIComponent(slug)}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Incorrect access code.");
      setState((current) => ({ ...current, hasAccess: true }));
      setCode("");
    } catch (error) {
      setAccessError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!state.catalog || !state.hasAccess) return;
    sendStats({ type: "catalog_view", slug });
  }, [slug, state.catalog, state.hasAccess]);

  if (state.loading) {
    return <div className={styles.center}><span className={styles.spinner} /><p>Preparing publication...</p></div>;
  }

  if (state.error || !state.catalog) {
    return (
      <div className={styles.center}>
        <LockKeyhole size={28} />
        <h1>Publication unavailable</h1>
        <p>{state.error || "This catalog could not be found."}</p>
        <Link href="/" className={styles.back}><ArrowLeft size={15} /> Return to publications</Link>
      </div>
    );
  }

  if (!state.hasAccess) {
    return (
      <main className={styles.gate}>
        {/* Backdrop: blurred PDF or gradient */}
        <div className={styles.gateBackdrop}>
          <canvas
            ref={backdropCanvasRef}
            className={`${styles.gateBackdropCanvas} ${backdropReady ? styles.backdropReady : ""}`}
          />
        </div>

        {/* Floating particles */}
        <div className={styles.gateParticles}>
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>

        {/* Ambient light rays */}
        <div className={styles.gateLightRay} />

        {/* Return link */}
        <Link href="/" className={styles.back}>
          <ArrowLeft size={15} /> Return to publications
        </Link>

        {/* Main layout grid */}
        <div className={styles.gateContent}>
          {/* Left Column: Showcase details */}
          <div className={styles.gateShowcase}>
            <span className={styles.gateShowcaseLabel}>
              <LockKeyhole size={12} /> Protected Publication
            </span>
            <h2 className={styles.gateShowcaseTitle}>{state.catalog.title}</h2>
            <div className={styles.gateShowcaseMeta}>
              <span>
                <BookOpen size={12} /> {state.catalog.pageCount} pages
              </span>
              <span>
                <Tag size={12} /> {state.catalog.category}
              </span>
            </div>
          </div>

          {/* Right Column: Glass card passcode form */}
          <section className={styles.gateCard}>
            <div className={styles.icon}>
              <KeyRound size={24} />
            </div>
            <span className={styles.label}>
              <Shield size={10} /> Access Required
            </span>
            <h1>Unlock publication</h1>
            <p>Enter the access code shared with you to open this publication.</p>
            <form onSubmit={unlock}>
              <div className={styles.fieldWrap}>
                <span className={styles.fieldLabel}>Access code</span>
                <div className={styles.inputWrap}>
                  <input
                    type="password"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoComplete="one-time-code"
                    required
                    autoFocus
                  />
                  <KeyRound size={16} className={styles.inputIcon} />
                </div>
              </div>
              {accessError && (
                <div className={styles.error}>
                  <AlertCircle size={14} />
                  {accessError}
                </div>
              )}
              <button type="submit" className={styles.gateSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <span className={styles.btnSpinner} /> Checking...
                  </>
                ) : (
                  <>
                    <Unlock size={16} /> Open publication
                  </>
                )}
              </button>
            </form>
          </section>
        </div>

        {/* 3D floating book preview */}
        <div className={styles.gateBookWrap}>
          <div className={styles.gateBook} style={{ "--book-ratio": state.catalog.aspectRatio }}>
            <div className={styles.gateBookPage}>
              <canvas
                ref={bookCanvasRef}
                className={`${styles.gateBookCanvas} ${bookReady ? styles.bookReady : ""}`}
              />
            </div>
            <div className={styles.gateBookSpine} />
          </div>
        </div>
      </main>
    );
  }

  return <FlipbookReader book={withTemporaryToken(state.catalog, temporaryToken, temporaryCode)} />;
}

function withTemporaryToken(catalog, token, code) {
  if (!token) return catalog;
  const suffix = temporaryQuery(token, code);
  return {
    ...catalog,
    fileUrl: `${catalog.fileUrl}${catalog.fileUrl.includes("?") ? "&" : "?"}${suffix}`,
    documentUrl: `${catalog.documentUrl}${catalog.documentUrl.includes("?") ? "&" : "?"}${suffix}`,
  };
}

function temporaryQuery(token, code) {
  const params = new URLSearchParams({ token });
  if (code) params.set("code", code);
  return params.toString();
}

function sendStats(payload) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon?.("/api/stats", new Blob([body], { type: "application/json" }))) return;
  const request = new XMLHttpRequest();
  request.open("POST", "/api/stats");
  request.setRequestHeader("Content-Type", "application/json");
  request.send(body);
}
