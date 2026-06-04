"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  FileUp,
  KeyRound,
  LockKeyhole,
  LogOut,
  Save,
  Trash2,
} from "lucide-react";
import styles from "./page.module.css";

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [code, setCode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [catalogs, setCatalogs] = useState([]);
  const [canUpload, setCanUpload] = useState(false);
  const [storageMode, setStorageMode] = useState("local");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setAuthenticated(Boolean(data.authenticated));
        if (data.authenticated) loadCatalogs();
      })
      .catch(() => setLoginError("Could not check the admin session."))
      .finally(() => setChecking(false));
  }, []);

  async function loadCatalogs() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/catalogs", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Could not load catalogs.");
      setCatalogs(data.catalogs);
      setCanUpload(data.canUpload);
      setStorageMode(data.storageMode);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Incorrect admin code.");
      setCode("");
      setAuthenticated(true);
      await loadCatalogs();
    } catch (requestError) {
      setLoginError(requestError.message);
    }
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    setAuthenticated(false);
    setCatalogs([]);
  }

  async function upload(file) {
    if (!file) return;
    setError("");
    setNotice("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/catalogs", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      setNotice(`${data.catalog.title} was added to the project.`);
      await loadCatalogs();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeCatalog(catalog) {
    if (!window.confirm(`Remove "${catalog.title}" from the catalog manifest?`)) return;
    setError("");
    const response = await fetch(`/api/admin/catalogs/${catalog.slug}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Catalog could not be removed.");
      return;
    }
    setCatalogs((current) => current.filter((item) => item.slug !== catalog.slug));
    setNotice(`${catalog.title} was removed.`);
  }

  function replaceCatalog(updated) {
    setCatalogs((current) => current.map((catalog) => catalog.slug === updated.slug ? updated : catalog));
    setNotice(`${updated.title} was saved.`);
  }

  if (checking) {
    return <div className={styles.center}><span className={styles.spinner} /><p>Checking admin session...</p></div>;
  }

  if (!authenticated) {
    return (
      <main className={styles.loginPage}>
        <Link href="/" className={styles.back}><ArrowLeft size={15} /> Return to archive</Link>
        <form className={styles.loginCard} onSubmit={login}>
          <span className={styles.loginIcon}><KeyRound size={24} /></span>
          <span className={styles.label}>Code-only access</span>
          <h1>Admin console</h1>
          <p>Enter the private admin code to publish and protect catalogs.</p>
          <label>
            <span>Admin code</span>
            <input
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              autoFocus
              autoComplete="current-password"
            />
          </label>
          {loginError && <div className={styles.errorText}>{loginError}</div>}
          <button type="submit">Unlock console</button>
        </form>
      </main>
    );
  }

  return (
    <main className={styles.adminPage}>
      <header className={styles.header}>
        <div>
          <span className={styles.label}>Portfolio management</span>
          <h1>Admin console</h1>
          <p>Publish catalogs, change access rules, and share direct links.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/" className={styles.secondaryButton}><ArrowLeft size={15} /> View archive</Link>
          <button className={styles.secondaryButton} onClick={logout}><LogOut size={15} /> Lock console</button>
        </div>
      </header>

      <section className={styles.statusBar}>
        <div><span>Storage mode</span><strong>{storageMode}</strong></div>
        <div><span>Catalogs</span><strong>{catalogs.length}</strong></div>
        <div><span>PDF uploads</span><strong>{canUpload ? "Local enabled" : "GitHub workflow"}</strong></div>
      </section>

      <section className={styles.uploadSection}>
        <div>
          <span className={styles.label}>Add publication</span>
          <h2>{canUpload ? "Upload a local PDF" : "Add PDFs locally, then push to GitHub"}</h2>
          <p>
            {canUpload
              ? "The PDF will be validated and stored in content/catalogs. Keep each file below 95 MiB."
              : "Production manages metadata only. Add new PDF files from the local admin console and push the project."}
          </p>
        </div>
        {canUpload ? (
          <button className={styles.uploadButton} onClick={() => inputRef.current?.click()} disabled={uploading}>
            <FileUp size={20} />
            <span>{uploading ? "Validating and saving..." : "Choose PDF file"}</span>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="visually-hidden"
              onChange={(event) => upload(event.target.files?.[0])}
            />
          </button>
        ) : (
          <div className={styles.workflowNote}>content/catalogs/*.pdf → GitHub → Vercel</div>
        )}
      </section>

      {(notice || error) && (
        <div className={`${styles.message} ${error ? styles.messageError : ""}`}>
          {error ? <LockKeyhole size={16} /> : <Check size={16} />}
          <span>{error || notice}</span>
        </div>
      )}

      <section className={styles.catalogSection}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.label}>Catalog manifest</span><h2>Manage publications</h2></div>
          <button className={styles.refresh} onClick={loadCatalogs} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading && catalogs.length === 0 ? (
          <div className={styles.centerInline}><span className={styles.spinner} /><p>Loading catalogs...</p></div>
        ) : catalogs.length === 0 ? (
          <div className={styles.empty}>No catalogs are in the manifest.</div>
        ) : (
          <div className={styles.catalogList}>
            {catalogs.map((catalog) => (
              <CatalogEditor
                catalog={catalog}
                key={catalog.slug}
                onSaved={replaceCatalog}
                onRemove={() => removeCatalog(catalog)}
                onError={setError}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function CatalogEditor({ catalog, onSaved, onRemove, onError }) {
  const [form, setForm] = useState({
    title: catalog.title,
    description: catalog.description,
    published: catalog.published,
    sortOrder: catalog.sortOrder,
    accessMode: catalog.accessMode,
    accessCode: "",
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    onError("");
    try {
      const response = await fetch(`/api/admin/catalogs/${catalog.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Catalog could not be saved.");
      setForm((current) => ({ ...current, accessCode: "" }));
      onSaved(data.catalog);
    } catch (requestError) {
      onError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/catalog/${catalog.slug}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <form className={styles.catalogRow} onSubmit={save}>
      <div className={styles.catalogIdentity}>
        <div className={styles.miniCover} style={{ "--ratio": catalog.aspectRatio }}>
          <span>{catalog.title.slice(0, 24)}</span>
        </div>
        <div>
          <strong>{catalog.slug}</strong>
          <span>{catalog.pageCount} pages · {formatBytes(catalog.sizeBytes)} · {catalog.orientation}</span>
          <span>{catalog.pdfPath}</span>
        </div>
      </div>

      <div className={styles.fields}>
        <label className={styles.wideField}><span>Title</span><input value={form.title} onChange={(event) => update("title", event.target.value)} required /></label>
        <label className={styles.wideField}><span>Description</span><textarea value={form.description} onChange={(event) => update("description", event.target.value)} rows={2} /></label>
        <label><span>Access</span>
          <select value={form.accessMode} onChange={(event) => update("accessMode", event.target.value)}>
            <option value="public">Public</option>
            <option value="protected">Protected</option>
          </select>
        </label>
        <label><span>Sort order</span><input type="number" value={form.sortOrder} onChange={(event) => update("sortOrder", Number(event.target.value))} /></label>
        <label className={styles.wideField}><span>{catalog.hasAccessCode ? "New access code (leave blank to keep current)" : "Access code"}</span>
          <input
            type="password"
            minLength={10}
            value={form.accessCode}
            onChange={(event) => update("accessCode", event.target.value)}
            placeholder={form.accessMode === "protected" ? "Minimum 10 characters" : "Used only when protected"}
          />
        </label>
        <label className={styles.publishField}>
          <input type="checkbox" checked={form.published} onChange={(event) => update("published", event.target.checked)} />
          <span>Published in portfolio</span>
        </label>
      </div>

      <div className={styles.rowActions}>
        <button type="button" className={styles.iconAction} onClick={copyLink} title="Copy share link">
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
        <button type="submit" className={styles.saveButton} disabled={saving}><Save size={15} /> {saving ? "Saving..." : "Save"}</button>
        <button type="button" className={styles.deleteButton} onClick={onRemove} title="Remove catalog"><Trash2 size={16} /></button>
      </div>
    </form>
  );
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}
