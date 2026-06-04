"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  List,
  Maximize2,
  Minimize2,
  RotateCcw,
  Share2,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import styles from "./FlipbookReader.module.css";

const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export default function FlipbookReader({ book }) {
  const [documentInfo, setDocumentInfo] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [orientation, setOrientation] = useState("landscape");
  const [loadingText, setLoadingText] = useState("Loading document...");
  const [error, setError] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState({});
  const [toast, setToast] = useState("");

  const appRef = useRef(null);
  const mountRef = useRef(null);
  const pageFlipRef = useRef(null);
  const pdfRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const pageElementsRef = useRef(new Map());
  const renderedUrlsRef = useRef(new Map());
  const renderQueueRef = useRef(new Set());
  const generationRef = useRef(0);
  const previousPageRef = useRef(0);
  const dragStartRef = useRef(null);
  const soundRef = useRef(true);

  const totalPages = documentInfo?.pageCount || 0;
  const aspectRatio = documentInfo?.aspectRatio || book.aspectRatio || 0.707;

  useEffect(() => {
    const saved = localStorage.getItem("catalog_reader_sound");
    if (saved === null) return;
    const frame = window.requestAnimationFrame(() => {
      const enabled = saved === "true";
      setSoundEnabled(enabled);
      soundRef.current = enabled;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const renderPage = useCallback(async (pageNumber) => {
    const pdf = pdfRef.current;
    const generation = generationRef.current;
    if (!pdf || pageNumber < 1 || pageNumber > pdf.numPages) return;
    if (renderedUrlsRef.current.has(pageNumber) || renderQueueRef.current.has(pageNumber)) return;

    renderQueueRef.current.add(pageNumber);
    try {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(1900, Math.max(1100, window.innerWidth * Math.min(window.devicePixelRatio || 1, 1.5)));
      const viewport = page.getViewport({ scale: targetWidth / base.width });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Page image could not be created.");
      const url = URL.createObjectURL(blob);

      if (generation !== generationRef.current) {
        URL.revokeObjectURL(url);
        return;
      }

      renderedUrlsRef.current.set(pageNumber, url);
      const elements = pageElementsRef.current.get(pageNumber);
      if (elements) {
        elements.image.src = url;
        elements.image.classList.add(styles.pageReady);
        elements.loader.classList.add(styles.pageLoaderHidden);
      }
      setThumbnailUrls((current) => ({ ...current, [pageNumber]: url }));
    } catch (renderError) {
      if (generation === generationRef.current) {
        console.error(`Page ${pageNumber} rendering failed`, renderError);
      }
    } finally {
      renderQueueRef.current.delete(pageNumber);
    }
  }, []);

  useEffect(() => {
    let active = true;
    generationRef.current += 1;
    const generation = generationRef.current;
    previousPageRef.current = 0;
    const renderedUrls = renderedUrlsRef.current;
    const renderQueue = renderQueueRef.current;
    const pageElements = pageElementsRef.current;

    async function loadPdf() {
      try {
        const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
        if (!active) return;
        setDocumentInfo(null);
        setError("");
        setLoadingText("Loading PDF...");
        setCurrentPage(0);
        setThumbnailUrls({});
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({
          url: book.fileUrl,
          withCredentials: true,
          isEvalSupported: false,
        });
        loadingTaskRef.current = task;
        const pdf = await task.promise;
        if (!active || generation !== generationRef.current) {
          await task.destroy();
          return;
        }
        pdfRef.current = pdf;
        const firstPage = await pdf.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        setDocumentInfo({
          pageCount: pdf.numPages,
          aspectRatio: viewport.width / viewport.height,
        });
        setLoadingText("");
      } catch (loadError) {
        if (active) {
          console.error("PDF loading failed", loadError);
          setError("The catalog file could not be loaded. Your access may have expired.");
          setLoadingText("");
        }
      }
    }

    loadPdf();
    return () => {
      active = false;
      generationRef.current += 1;
      loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
      pdfRef.current = null;
      for (const url of renderedUrls.values()) URL.revokeObjectURL(url);
      renderedUrls.clear();
      renderQueue.clear();
      pageElements.clear();
    };
  }, [book.fileUrl, book.slug]);

  useEffect(() => {
    if (!documentInfo || !mountRef.current) return;
    let cancelled = false;
    let instance = null;
    const mount = mountRef.current;
    const host = document.createElement("div");
    host.className = styles.bookHost;
    const pageElements = [];
    const pageElementMap = pageElementsRef.current;
    mount.replaceChildren(host);
    pageElementMap.clear();

    for (let index = 0; index < documentInfo.pageCount; index += 1) {
      const pageNumber = index + 1;
      const page = document.createElement("div");
      page.className = styles.page;
      page.dataset.density = "soft";

      const image = document.createElement("img");
      image.src = renderedUrlsRef.current.get(pageNumber) || EMPTY_IMAGE;
      image.alt = `Page ${pageNumber}`;
      image.className = styles.pageImage;
      if (renderedUrlsRef.current.has(pageNumber)) image.classList.add(styles.pageReady);

      const loader = document.createElement("div");
      loader.className = styles.pageLoader;
      if (renderedUrlsRef.current.has(pageNumber)) loader.classList.add(styles.pageLoaderHidden);
      loader.innerHTML = `<span></span><strong>Page ${pageNumber}</strong>`;

      page.append(image, loader);
      host.appendChild(page);
      pageElements.push(page);
      pageElementMap.set(pageNumber, { image, loader });
    }

    async function setup() {
      const { PageFlip } = await import("page-flip");
      if (cancelled) return;
      const initialFromUrl = Number.parseInt(new URLSearchParams(window.location.search).get("page"), 10);
      const saved = Number.parseInt(localStorage.getItem(`catalog_progress_${book.slug}`), 10);
      const initialPage = clamp(
        Number.isFinite(initialFromUrl) ? initialFromUrl - 1 : Number.isFinite(saved) ? saved : 0,
        0,
        documentInfo.pageCount - 1,
      );
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      instance = new PageFlip(host, {
        width: Math.round(documentInfo.aspectRatio * 1000),
        height: 1000,
        size: "stretch",
        minWidth: 180,
        maxWidth: 1500,
        minHeight: 120,
        maxHeight: 1500,
        showCover: true,
        usePortrait: true,
        autoSize: true,
        drawShadow: true,
        maxShadowOpacity: 0.32,
        flippingTime: reducedMotion ? 250 : 780,
        mobileScrollSupport: true,
        swipeDistance: 24,
        startPage: initialPage,
        showPageCorners: !reducedMotion,
      });
      instance.loadFromHTML(pageElements);
      pageFlipRef.current = instance;
      setCurrentPage(initialPage);
      previousPageRef.current = initialPage;
      setOrientation(instance.getOrientation());

      instance.on("flip", (event) => {
        const next = event.data;
        if (next !== previousPageRef.current) {
          playFlipSound(soundRef.current, next > previousPageRef.current ? 1 : -1);
        }
        previousPageRef.current = next;
        setCurrentPage(next);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        localStorage.setItem(`catalog_progress_${book.slug}`, String(next));
      });
      instance.on("changeOrientation", (event) => setOrientation(event.data));

      for (let page = Math.max(1, initialPage); page <= Math.min(documentInfo.pageCount, initialPage + 4); page += 1) {
        renderPage(page);
      }
    }

    setup().catch((setupError) => {
      console.error("Flipbook setup failed", setupError);
      setError("The flipbook could not be initialized.");
    });

    return () => {
      cancelled = true;
      if (pageFlipRef.current === instance) pageFlipRef.current = null;
      if (instance) instance.destroy();
      if (mount.isConnected) mount.replaceChildren();
      pageElementMap.clear();
    };
  }, [book.slug, documentInfo, renderPage]);

  useEffect(() => {
    if (!totalPages) return;
    const frame = window.requestAnimationFrame(() => {
      for (let page = Math.max(1, currentPage - 1); page <= Math.min(totalPages, currentPage + 5); page += 1) {
        renderPage(page);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, renderPage, totalPages]);

  useEffect(() => {
    if (!tocOpen || !totalPages) return;
    const frame = window.requestAnimationFrame(() => {
      for (let page = 1; page <= Math.min(totalPages, 14); page += 1) renderPage(page);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renderPage, tocOpen, totalPages]);

  useEffect(() => {
    function handleKey(event) {
      if (event.key === "ArrowRight") pageFlipRef.current?.flipNext("bottom");
      if (event.key === "ArrowLeft") pageFlipRef.current?.flipPrev("bottom");
      if (event.key === "Escape") setTocOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function turnToPage(index) {
    pageFlipRef.current?.turnToPage(index);
    setCurrentPage(index);
    setTocOpen(false);
    renderPage(index + 1);
  }

  function changeZoom(amount) {
    setZoom((current) => {
      const next = clamp(current + amount, 1, 3);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }

  function startPan(event) {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    dragStartRef.current = { x: event.clientX, y: event.clientY, pan };
  }

  function movePan(event) {
    if (!dragging || !dragStartRef.current) return;
    const limit = 330 * (zoom - 1);
    setPan({
      x: clamp(dragStartRef.current.pan.x + event.clientX - dragStartRef.current.x, -limit, limit),
      y: clamp(dragStartRef.current.pan.y + event.clientY - dragStartRef.current.y, -limit, limit),
    });
  }

  function endPan(event) {
    if (!dragging) return;
    setDragging(false);
    dragStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function copyShareLink() {
    const url = new URL(`/catalog/${book.slug}`, window.location.origin);
    url.searchParams.set("page", String(currentPage + 1));
    await navigator.clipboard.writeText(url.toString());
    setToast("Share link copied");
    window.setTimeout(() => setToast(""), 1800);
  }

  function toggleSound() {
    const next = !soundEnabled;
    soundRef.current = next;
    setSoundEnabled(next);
    localStorage.setItem("catalog_reader_sound", String(next));
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await appRef.current?.requestFullscreen();
    }
  }

  return (
    <div
      className={styles.reader}
      ref={appRef}
      style={{ "--page-ratio": aspectRatio, "--spread-ratio": aspectRatio * 2 }}
    >
      <header className={styles.topbar}>
        <div className={styles.titleGroup}>
          <Link href="/" className={styles.back} aria-label="Return to archive">
            <ArrowLeft size={17} /><span>Archive</span>
          </Link>
          <div>
            <h1>{book.title}</h1>
            <span>{book.orientation} catalog · {totalPages || book.pageCount} pages</span>
          </div>
        </div>
        <div className={styles.toolbar}>
          <ToolbarButton label="Contents" active={tocOpen} onClick={() => setTocOpen((open) => !open)}><List size={17} /></ToolbarButton>
          <ToolbarButton label="Sound" onClick={toggleSound}>{soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</ToolbarButton>
          <ToolbarButton label="Copy share link" onClick={copyShareLink}><Share2 size={17} /></ToolbarButton>
          <ToolbarButton label="Open PDF" onClick={() => window.open(book.fileUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={17} /></ToolbarButton>
          <ToolbarButton label="Fullscreen" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</ToolbarButton>
        </div>
      </header>

      <aside className={`${styles.toc} ${tocOpen ? styles.tocOpen : ""}`}>
        <div className={styles.tocHeader}>
          <div><span>Navigate</span><h2>Pages</h2></div>
          <button onClick={() => setTocOpen(false)} aria-label="Close contents"><X size={18} /></button>
        </div>
        <ol>
          {Array.from({ length: totalPages }, (_, index) => {
            const pageNumber = index + 1;
            return (
              <li key={pageNumber}>
                <button
                  className={currentPage === index ? styles.activeThumb : ""}
                  onClick={() => turnToPage(index)}
                  onMouseEnter={() => renderPage(pageNumber)}
                >
                  <span className={styles.thumb}>
                    {thumbnailUrls[pageNumber] ? (
                      // Object URLs rendered by PDF.js are not compatible with next/image.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbnailUrls[pageNumber]} alt="" />
                    ) : <em>{pageNumber}</em>}
                  </span>
                  <span>Page {pageNumber}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <main className={styles.viewer}>
        {loadingText && <div className={styles.loader}><span /><p>{loadingText}</p></div>}
        {error && <div className={styles.readerError}><p>{error}</p><Link href="/">Return to archive</Link></div>}
        {documentInfo && !error && (
          <>
            <button
              className={`${styles.navArrow} ${styles.previous}`}
              onClick={() => pageFlipRef.current?.flipPrev("bottom")}
              disabled={currentPage <= 0}
              aria-label="Previous page"
            ><ChevronLeft size={25} /></button>

            <div
              className={`${styles.zoomSurface} ${zoom > 1 ? styles.zoomed : ""} ${dragging ? styles.dragging : ""}`}
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={endPan}
              onPointerCancel={endPan}
            >
              <div
                className={`${styles.stageFrame} ${orientation === "portrait" ? styles.singlePage : ""}`}
                style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
              >
                <div className={styles.bookMount} ref={mountRef} />
              </div>
            </div>

            <button
              className={`${styles.navArrow} ${styles.next}`}
              onClick={() => pageFlipRef.current?.flipNext("bottom")}
              disabled={currentPage >= totalPages - 1}
              aria-label="Next page"
            ><ChevronRight size={25} /></button>
          </>
        )}
      </main>

      <footer className={styles.bottombar}>
        <div className={styles.zoomControls}>
          <ToolbarButton label="Zoom out" onClick={() => changeZoom(-0.25)} disabled={zoom <= 1}><ZoomOut size={16} /></ToolbarButton>
          <ToolbarButton label="Reset zoom" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} disabled={zoom === 1}><RotateCcw size={16} /></ToolbarButton>
          <ToolbarButton label="Zoom in" onClick={() => changeZoom(0.25)} disabled={zoom >= 3}><ZoomIn size={16} /></ToolbarButton>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
        <span className={styles.pageCount}>Page {Math.min(currentPage + 1, totalPages)} / {totalPages}</span>
      </footer>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

function ToolbarButton({ label, active = false, disabled = false, onClick, children }) {
  return (
    <button
      className={`${styles.toolButton} ${active ? styles.toolButtonActive : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function playFlipSound(enabled, direction) {
  if (!enabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const duration = 0.12;
  const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    const progress = index / channel.length;
    channel[index] = (Math.random() * 2 - 1) * Math.sin(Math.PI * progress) * 0.12;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = direction > 0 ? 1700 : 1300;
  source.buffer = buffer;
  source.connect(filter).connect(context.destination);
  source.start();
  source.onended = () => context.close();
}
