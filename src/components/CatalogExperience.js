"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, LockKeyhole } from "lucide-react";
import FlipbookReader from "./FlipbookReader";
import styles from "./CatalogExperience.module.css";

export default function CatalogExperience({ slug }) {
  const [state, setState] = useState({ loading: true, catalog: null, hasAccess: false, error: "" });
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/catalogs/${encodeURIComponent(slug)}`, { cache: "no-store" })
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
  }, [slug]);

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

  if (state.loading) {
    return <div className={styles.center}><span className={styles.spinner} /><p>Preparing catalog...</p></div>;
  }

  if (state.error || !state.catalog) {
    return (
      <div className={styles.center}>
        <LockKeyhole size={28} />
        <h1>Catalog unavailable</h1>
        <p>{state.error || "This catalog could not be found."}</p>
        <Link href="/" className={styles.back}><ArrowLeft size={15} /> Return to archive</Link>
      </div>
    );
  }

  if (!state.hasAccess) {
    return (
      <main className={styles.gate}>
        <Link href="/" className={styles.back}><ArrowLeft size={15} /> Return to archive</Link>
        <section className={styles.gateCard}>
          <div className={styles.icon}><KeyRound size={25} /></div>
          <span className={styles.label}>Protected catalog</span>
          <h1>{state.catalog.title}</h1>
          <p>Enter the access code shared with you to open this publication.</p>
          <form onSubmit={unlock}>
            <label>
              <span>Access code</span>
              <input
                type="password"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                required
                autoFocus
              />
            </label>
            {accessError && <div className={styles.error}>{accessError}</div>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Checking code..." : "Open catalog"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return <FlipbookReader book={state.catalog} />;
}
