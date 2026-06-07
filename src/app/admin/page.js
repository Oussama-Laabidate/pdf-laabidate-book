"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Check,
  Clock3,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  FileUp,
  KeyRound,
  Link2,
  LockKeyhole,
  LogOut,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react";
import PdfFirstPagePreview from "@/components/PdfFirstPagePreview";
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [statsBackend, setStatsBackend] = useState("local");
  const [geminiKey, setGeminiKey] = useState(() => getStoredGeminiKey());
  const [geminiSaved, setGeminiSaved] = useState(() => Boolean(getStoredGeminiKey()));
  const inputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const stats = useMemo(() => ({
    totalPages: catalogs.reduce((sum, catalog) => sum + (Number(catalog.pageCount) || 0), 0),
    totalBytes: catalogs.reduce((sum, catalog) => sum + (Number(catalog.sizeBytes) || 0), 0),
    protectedCount: catalogs.filter((catalog) => catalog.accessMode === "protected").length,
  }), [catalogs]);
  const categories = useMemo(() => Array.from(new Set(catalogs.map((catalog) => catalog.category).filter(Boolean))).sort(), [catalogs]);
  const analyticsRows = useMemo(() => {
    return catalogs.map((catalog) => {
      const entry = statsData?.catalogs?.[catalog.slug] || {};
      return {
        slug: catalog.slug,
        title: catalog.title,
        views: Number(entry.views) || 0,
        clicks: Number(entry.clicks) || 0,
        temporaryLinks: Number(entry.temporaryLinks) || 0,
        aiRuns: Number(entry.aiRuns) || 0,
        lastViewedAt: entry.lastViewedAt || null,
      };
    }).sort((left, right) => (right.clicks + right.views) - (left.clicks + left.views));
  }, [catalogs, statsData]);
  const totalCatalogClicks = analyticsRows.reduce((sum, row) => sum + row.clicks, 0);
  const averageDuration = statsData?.site?.engagementCount
    ? Math.round((Number(statsData.site.totalDurationMs) || 0) / statsData.site.engagementCount)
    : 0;
  const maxCatalogActivity = Math.max(1, ...analyticsRows.map((row) => row.clicks + row.views));

  const loadStats = useCallback(async () => {
    try {
      const data = await requestJson("GET", "/api/admin/stats");
      setStatsData(data.stats);
      setStatsBackend(data.backend || "local");
    } catch {
      setStatsData(null);
    }
  }, []);

  const loadCatalogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await requestJson("GET", "/api/admin/catalogs");
      setCatalogs(data.catalogs);
      setCanUpload(data.canUpload);
      setStorageMode(data.storageMode);
      loadStats();
    } catch (requestError) {
      if (requestError.status === 401) {
        setAuthenticated(false);
        return;
      }
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [loadStats]);

  useEffect(() => {
    requestJson("GET", "/api/admin/session")
      .then((data) => {
        setAuthenticated(Boolean(data.authenticated));
        if (data.authenticated) loadCatalogs();
      })
      .catch(() => setLoginError("Could not check the admin session."))
      .finally(() => setChecking(false));
  }, [loadCatalogs]);

  async function login(event) {
    event.preventDefault();
    setLoginError("");
    try {
      await requestJson("POST", "/api/admin/session", { code });
      setCode("");
      setAuthenticated(true);
      await loadCatalogs();
    } catch (requestError) {
      setLoginError(requestError.message);
    }
  }

  async function logout() {
    await requestJson("DELETE", "/api/admin/session").catch(() => {});
    setAuthenticated(false);
    setCatalogs([]);
    setStatsData(null);
  }

  async function upload(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name || "") && file.type !== "application/pdf") {
      setError("Drop a PDF file to upload.");
      setNotice("");
      return;
    }
    setError("");
    setNotice("");
    setUploading(true);
    setUploadProgress(0);
    try {
      const data = await uploadPdf(file, setUploadProgress);
      setNotice(`${data.catalog.title} was added to the project.`);
      await loadCatalogs();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDragEnter(event) {
    if (!canUpload || uploading) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    if (hasDraggedPdf(event)) setDragActive(true);
  }

  function handleDragOver(event) {
    if (!canUpload || uploading) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (hasDraggedPdf(event)) setDragActive(true);
  }

  function handleDragLeave(event) {
    if (!canUpload) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }

  function handleDrop(event) {
    if (!canUpload || uploading) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    const file = Array.from(event.dataTransfer.files || []).find((item) => /\.pdf$/i.test(item.name || "") || item.type === "application/pdf");
    if (!file) {
      setNotice("");
      setError("Drop a PDF file to upload.");
      return;
    }
    upload(file);
  }

  async function removeCatalog(catalog) {
    setError("");
    try {
      await requestJson("DELETE", `/api/admin/catalogs/${catalog.slug}`);
    } catch (requestError) {
      setError(requestError.message || "Catalog could not be removed.");
      return;
    }
    setCatalogs((current) => current.filter((item) => item.slug !== catalog.slug));
    setNotice(`${catalog.title} was removed.`);
    setPendingDelete(null);
  }

  function replaceCatalog(updated) {
    setCatalogs((current) => current.map((catalog) => catalog.slug === updated.slug ? updated : catalog));
    setNotice(`${updated.title} was saved.`);
  }

  function saveGeminiKey() {
    const trimmed = geminiKey.trim();
    if (trimmed) {
      window.localStorage.setItem("catalog_gemini_api_key", trimmed);
      setGeminiKey(trimmed);
      setGeminiSaved(true);
      setNotice("Gemini key was saved in this browser.");
      setError("");
    } else {
      window.localStorage.removeItem("catalog_gemini_api_key");
      setGeminiSaved(false);
      setNotice("Gemini key was cleared from this browser.");
    }
  }

  if (checking) {
    return <div className={styles.center}><span className={styles.spinner} /><p>Checking admin session...</p></div>;
  }

  if (!authenticated) {
    return (
      <main className={styles.loginPage}>
        <Link href="/" className={styles.back}><ArrowLeft size={15} /> Return to publications</Link>
        <form className={styles.loginCard} onSubmit={login}>
          <span className={styles.loginIcon}><KeyRound size={24} /></span>
          <span className={styles.label}>Code-only access</span>
          <h1>Admin console</h1>
          <p>Enter the private admin code to publish and protect PDFs.</p>
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
    <main
      className={`${styles.adminPage} ${dragActive ? styles.dragActive : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {canUpload && (
        <div className={styles.dropOverlay} aria-hidden={!dragActive}>
          <UploadCloud size={32} />
          <strong>Drop PDF to upload</strong>
          <span>The file will stream directly into the local catalog storage.</span>
        </div>
      )}
      <header className={styles.header}>
        <div>
          <span className={styles.label}>Portfolio management</span>
          <h1>Admin console</h1>
          <p>Publish PDFs, change access rules, and share direct links.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/" className={styles.secondaryButton}><ArrowLeft size={15} /> View publications</Link>
          <button className={styles.secondaryButton} onClick={logout}><LogOut size={15} /> Lock console</button>
        </div>
      </header>

      <section className={styles.statusBar}>
        <div><span>Storage mode</span><strong>{storageMode}</strong></div>
        <div><span>Publications</span><strong>{catalogs.length}</strong></div>
        <div><span>Total pages</span><strong>{stats.totalPages}</strong></div>
        <div><span>Library size</span><strong>{formatBytes(stats.totalBytes)}</strong></div>
        <div><span>Visits</span><strong>{statsData?.site?.visits || 0}</strong></div>
        <div><span>Protected</span><strong>{stats.protectedCount}</strong></div>
        <div><span>PDF uploads</span><strong>{canUpload ? "Streaming enabled" : "GitHub workflow"}</strong></div>
      </section>

      <section className={styles.settingsSection}>
        <div>
          <span className={styles.label}>AI settings</span>
          <h2>Gemini API key</h2>
          <p>Use a Google AI Studio key here for admin AI tasks. Vercel environment variables remain the preferred production setup.</p>
        </div>
        <label className={styles.keyField}>
          <span>Gemini key</span>
          <input
            type="password"
            value={geminiKey}
            onChange={(event) => {
              setGeminiKey(event.target.value);
              setGeminiSaved(false);
            }}
            placeholder={geminiSaved ? "Gemini key saved in this browser" : "AIza..."}
            autoComplete="off"
          />
        </label>
        <button type="button" className={styles.secondaryButton} onClick={saveGeminiKey}>
          <KeyRound size={15} /> {geminiKey.trim() ? "Save key" : "Clear key"}
        </button>
      </section>

      <section className={styles.analyticsSection}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.label}>Detailed analytics</span><h2>Site performance</h2></div>
          <BarChart3 size={22} />
        </div>
        <div className={styles.analyticsCards}>
          <div><span>Site visitors</span><strong>{statsData?.site?.visits || 0}</strong></div>
          <div><span>Average stay</span><strong>{formatDuration(averageDuration)}</strong></div>
          <div><span>Tracked stays</span><strong>{statsData?.site?.engagementCount || 0}</strong></div>
          <div><span>Catalog clicks</span><strong>{totalCatalogClicks}</strong></div>
        </div>
        <div className={styles.analyticsGrid}>
          <div className={styles.chartPanel}>
            <span className={styles.label}>Catalog activity</span>
            {analyticsRows.map((row) => (
              <div className={styles.barRow} key={row.slug}>
                <span>{row.title}</span>
                <div><i style={{ width: `${Math.max(4, ((row.clicks + row.views) / maxCatalogActivity) * 100)}%` }} /></div>
                <strong>{row.clicks + row.views}</strong>
              </div>
            ))}
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr><th>Catalog</th><th>Clicks</th><th>Views</th><th>Temp links</th><th>Last view</th></tr>
              </thead>
              <tbody>
                {analyticsRows.map((row) => (
                  <tr key={row.slug}>
                    <td>{row.title}</td>
                    <td>{row.clicks}</td>
                    <td>{row.views}</td>
                    <td>{row.temporaryLinks}</td>
                    <td>{row.lastViewedAt ? new Date(row.lastViewedAt).toLocaleString() : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.uploadSection}>
        <div>
          <span className={styles.label}>Add publication</span>
          <h2>{canUpload ? "Upload a local PDF" : "Add PDFs locally, then push to GitHub"}</h2>
          <p>
            {canUpload
              ? "The PDF streams directly to content/catalogs, so large local files are limited by disk and server infrastructure instead of browser memory."
              : "Production manages metadata only. Add new PDF files from the local admin console and push the project."}
          </p>
        </div>
        {canUpload ? (
          <button
            className={`${styles.uploadButton} ${dragActive ? styles.uploadButtonActive : ""}`}
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <FileUp size={20} />
            <span>{uploading ? `Uploading ${uploadProgress}%` : "Choose or drop PDF file"}</span>
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

      {uploading && (
        <div className={styles.uploadProgress} aria-label="Upload progress">
          <span style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      {(notice || error) && (
        <div className={`${styles.message} ${error ? styles.messageError : ""}`}>
          {error ? <LockKeyhole size={16} /> : <Check size={16} />}
          <span>{error || notice}</span>
        </div>
      )}

      <section className={styles.catalogSection}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.label}>Publication manifest</span><h2>Manage publications</h2></div>
          <button className={styles.refresh} onClick={loadCatalogs} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading && catalogs.length === 0 ? (
          <div className={styles.centerInline}><span className={styles.spinner} /><p>Loading catalogs...</p></div>
        ) : catalogs.length === 0 ? (
          <div className={styles.empty}>No publications are in the manifest.</div>
        ) : (
          <div className={styles.catalogList}>
            {catalogs.map((catalog) => (
              <CatalogEditor
                catalog={catalog}
                categories={categories}
                catalogStats={statsData?.catalogs?.[catalog.slug]}
                statsBackend={statsBackend}
                geminiApiKey={geminiKey.trim()}
                key={catalog.slug}
                onSaved={replaceCatalog}
                onRemove={() => setPendingDelete(catalog)}
                onError={setError}
                onRefreshStats={loadStats}
              />
            ))}
          </div>
        )}
      </section>

      {pendingDelete && (
        <div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <section className={styles.confirmDialog}>
            <span className={styles.label}>Confirm removal</span>
            <h2 id="delete-title">Delete {pendingDelete.title}?</h2>
            <p>This removes the publication from the academic catalog list. The action cannot be undone from this console.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setPendingDelete(null)}>Cancel</button>
              <button type="button" className={styles.dangerButton} onClick={() => removeCatalog(pendingDelete)}>
                <Trash2 size={15} /> Delete publication
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function CatalogEditor({ catalog, categories, catalogStats, statsBackend, geminiApiKey, onSaved, onRemove, onError, onRefreshStats }) {
  const [form, setForm] = useState({
    title: catalog.title,
    description: catalog.description,
    summary: catalog.summary || "",
    category: catalog.category || "Catalogs",
    published: catalog.published,
    sortOrder: catalog.sortOrder,
    accessMode: catalog.accessMode,
    accessCode: catalog.accessCode || "",
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [temporaryLink, setTemporaryLink] = useState(null);
  const [temporaryLoading, setTemporaryLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState("");
  const [customLink, setCustomLink] = useState({
    hours: 1,
    minutes: 0,
    accessCode: "",
    oneTime: true,
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAccessMode(value) {
    setForm((current) => ({
      ...current,
      accessMode: value,
      accessCode: value === "public" ? "" : current.accessCode,
    }));
  }

  function updateAccessCode(value) {
    setForm((current) => ({
      ...current,
      accessCode: value,
      accessMode: value.trim() ? "protected" : current.accessMode,
    }));
  }

  async function save(event) {
    event.preventDefault();
    // Client-side guard: if switching to protected but no code exists and none entered, warn early.
    if (form.accessMode === "protected" && !form.accessCode.trim() && !catalog.hasAccessCode) {
      onError("Enter an access code (minimum 10 characters) before protecting this catalog.");
      return;
    }
    setSaving(true);
    onError("");
    try {
      const data = await requestJson("PATCH", `/api/admin/catalogs/${catalog.slug}`, form);
      // After saving, update the form's accessCode from the server response.
      // If the server returns the decrypted code, show it; otherwise keep the current form value.
      setForm((current) => ({
        ...current,
        accessCode: data.catalog.accessCode ?? current.accessCode ?? "",
      }));
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

  async function generateTemporaryLink(maxAgeSeconds = 24 * 60 * 60, options = {}) {
    setTemporaryLoading(true);
    onError("");
    try {
      const data = await requestJson("POST", `/api/admin/catalogs/${catalog.slug}/temporary-link`, { maxAgeSeconds, ...options });
      setTemporaryLink(data);
      await navigator.clipboard.writeText(data.url);
      onRefreshStats?.();
    } catch (requestError) {
      onError(requestError.message);
    } finally {
      setTemporaryLoading(false);
    }
  }

  async function runAi(task) {
    setAiLoading(task);
    onError("");
    try {
      const data = await requestJson("POST", `/api/admin/catalogs/${catalog.slug}/ai`, { task, apply: true, geminiApiKey });
      setForm((current) => ({
        ...current,
        title: data.catalog.title,
        description: data.catalog.description || "",
        summary: data.catalog.summary || "",
      }));
      onSaved(data.catalog);
      onRefreshStats?.();
    } catch (requestError) {
      onError(requestError.message);
    } finally {
      setAiLoading("");
    }
  }

  function updateCustomLink(field, value) {
    setCustomLink((current) => ({ ...current, [field]: value }));
  }

  function generateCustomLink() {
    const hours = Math.max(0, Number(customLink.hours) || 0);
    const minutes = Math.max(0, Number(customLink.minutes) || 0);
    const maxAgeSeconds = Math.max(5 * 60, Math.min(7 * 24 * 60 * 60, Math.round((hours * 60 + minutes) * 60)));
    generateTemporaryLink(maxAgeSeconds, {
      oneTime: Boolean(customLink.oneTime),
      accessCode: customLink.accessCode.trim(),
    });
  }

  return (
    <form className={`${styles.catalogRow} ${open ? styles.catalogRowOpen : ""}`} onSubmit={save}>
      <button type="button" className={styles.catalogIdentity} onClick={() => setOpen((current) => !current)}>
        <PdfFirstPagePreview catalog={catalog} className={styles.miniCover} readyClassName={styles.miniCoverReady}>
          <span>{catalog.title.slice(0, 24)}</span>
        </PdfFirstPagePreview>
        <div>
          <strong>{catalog.slug}</strong>
          <span>{catalog.category} · {catalog.pageCount} pages · {formatBytes(catalog.sizeBytes)} · {catalog.orientation}</span>
          <span>{catalogStats?.views || 0} views · {catalogStats?.temporaryLinks || 0} temp links · stats: {statsBackend}</span>
          <span>{catalog.pdfPath}</span>
        </div>
        <ChevronDown size={16} className={styles.expandIcon} />
      </button>

      {open && <div className={styles.fields}>
        <label className={styles.wideField}><span>Title</span><input value={form.title} onChange={(event) => update("title", event.target.value)} required /></label>
        <label className={styles.wideField}><span>Description</span><textarea value={form.description} onChange={(event) => update("description", event.target.value)} rows={2} /></label>
        <label className={styles.wideField}><span>SEO summary</span><textarea value={form.summary} onChange={(event) => update("summary", event.target.value)} rows={3} placeholder="Short searchable summary used for SEO and the catalog detail." /></label>
        <label><span>Category</span>
          <input
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
            placeholder="Academic, Catalogs, CVs..."
            list={`categories-${catalog.slug}`}
          />
          <datalist id={`categories-${catalog.slug}`}>
            {categories.map((category) => <option value={category} key={category} />)}
          </datalist>
        </label>
        <label><span>Access</span>
          <select value={form.accessMode} onChange={(event) => updateAccessMode(event.target.value)}>
            <option value="public">Public</option>
            <option value="protected">Protected</option>
          </select>
        </label>
        <label><span>Sort order</span><input type="number" value={form.sortOrder} onChange={(event) => update("sortOrder", Number(event.target.value))} /></label>
        <label className={styles.wideField}>
          <span>
            {form.accessMode === "protected" && !form.accessCode.trim() && !catalog.hasAccessCode
              ? "Access code ⚠️ Required to protect this catalog"
              : catalog.hasAccessCode && !catalog.accessCode
              ? "Access code (set a new one to show it here)"
              : "Access code"}
          </span>
          <div className={styles.passwordField}>
            <input
              type={showAccessCode ? "text" : "password"}
              minLength={10}
              value={form.accessCode}
              onChange={(event) => updateAccessCode(event.target.value)}
              placeholder={form.accessMode === "protected" && !catalog.hasAccessCode ? "Required — minimum 10 characters" : "Minimum 10 characters"}
              required={form.accessMode === "protected" && !catalog.hasAccessCode}
            />
            <button
              type="button"
              onClick={() => setShowAccessCode((current) => !current)}
              title={showAccessCode ? "Hide access code" : "Show access code"}
              aria-label={showAccessCode ? "Hide access code" : "Show access code"}
            >
              {showAccessCode ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>
        <label className={styles.publishField}>
          <input type="checkbox" checked={form.published} onChange={(event) => update("published", event.target.checked)} />
          <span>Published in portfolio</span>
        </label>
        <div className={styles.linkPanel}>
          <span className={styles.label}>Catalog links</span>
          <div className={styles.statsInline}>
            <span>{catalogStats?.views || 0}<small>views</small></span>
            <span>{catalogStats?.clicks || 0}<small>clicks</small></span>
            <span>{catalogStats?.temporaryLinks || 0}<small>temporary links</small></span>
            <span>{catalogStats?.aiRuns || 0}<small>AI runs</small></span>
          </div>
          <div className={styles.customLinkGrid}>
            <label><span>Hours</span><input type="number" min="0" max="168" value={customLink.hours} onChange={(event) => updateCustomLink("hours", event.target.value)} /></label>
            <label><span>Minutes</span><input type="number" min="0" max="59" value={customLink.minutes} onChange={(event) => updateCustomLink("minutes", event.target.value)} /></label>
            <label><span>Custom password</span><input value={customLink.accessCode} onChange={(event) => updateCustomLink("accessCode", event.target.value)} placeholder="Optional link code" /></label>
            <label className={styles.inlineCheck}>
              <input type="checkbox" checked={customLink.oneTime} onChange={(event) => updateCustomLink("oneTime", event.target.checked)} />
              <span>One-time link</span>
            </label>
          </div>
          <div className={styles.linkActions}>
            <button type="button" className={styles.secondaryButton} onClick={copyLink}>
              <Link2 size={15} /> Copy permanent link
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => generateTemporaryLink(60 * 60)} disabled={temporaryLoading}>
              <Clock3 size={15} /> 1h link
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => generateTemporaryLink(24 * 60 * 60)} disabled={temporaryLoading}>
              <Clock3 size={15} /> {temporaryLoading ? "Generating..." : "24h link"}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => generateTemporaryLink(7 * 24 * 60 * 60)} disabled={temporaryLoading}>
              <Clock3 size={15} /> 7d link
            </button>
            <button type="button" className={styles.secondaryButton} onClick={generateCustomLink} disabled={temporaryLoading}>
              <Clock3 size={15} /> Generate custom
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => runAi("metadata")} disabled={Boolean(aiLoading)}>
              <Cpu size={15} /> {aiLoading === "metadata" ? "Writing..." : "AI title"}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => runAi("summary")} disabled={Boolean(aiLoading)}>
              <Cpu size={15} /> {aiLoading === "summary" ? "Summarizing..." : "AI summary"}
            </button>
          </div>
          {temporaryLink && (
            <p className={styles.temporaryLink}>
              Temporary link copied. {temporaryLink.oneTime ? "One-time access. " : ""}
              {temporaryLink.hasAccessCode ? "Includes a custom code. " : ""}
              Expires {new Date(temporaryLink.expiresAt).toLocaleString()}.
            </p>
          )}
        </div>
      </div>}

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

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function getStoredGeminiKey() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("catalog_gemini_api_key") || "";
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function hasDraggedPdf(event) {
  const items = Array.from(event.dataTransfer?.items || []);
  if (items.length === 0) return true;
  return items.some((item) => item.kind === "file" && (!item.type || item.type === "application/pdf"));
}

function uploadPdf(file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", "/api/admin/catalogs");
    request.setRequestHeader("Content-Type", file.type || "application/pdf");
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name || "catalog.pdf"));
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };
    request.onload = () => {
      let payload = null;
      try {
        payload = JSON.parse(request.responseText || "{}");
      } catch {
        // Non-JSON server errors are converted below.
      }
      if (request.status >= 200 && request.status < 300 && payload?.catalog) {
        onProgress(100);
        resolve(payload);
      } else {
        reject(new Error(payload?.error || `Upload failed with status ${request.status}.`));
      }
    };
    request.onerror = () => reject(new Error("Upload failed before reaching the server."));
    request.onabort = () => reject(new Error("Upload was cancelled."));
    request.send(file);
  });
}

function requestJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    request.setRequestHeader("Accept", "application/json");
    if (body !== undefined) request.setRequestHeader("Content-Type", "application/json");
    request.onload = () => {
      let payload = null;
      try {
        payload = JSON.parse(request.responseText || "{}");
      } catch {
        // Non-JSON server errors are converted below.
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(payload || {});
      } else {
        const error = new Error(payload?.error || `Request failed with status ${request.status}.`);
        error.status = request.status;
        reject(error);
      }
    };
    request.onerror = () => reject(new Error("The admin request could not reach the server."));
    request.send(body === undefined ? null : JSON.stringify(body));
  });
}
