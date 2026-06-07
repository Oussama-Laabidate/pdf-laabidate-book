"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
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
const INLINE_DOCUMENT_BYTES = 128 * 1024 * 1024;

export default function FlipbookReader({ book }) {
  const [documentInfo, setDocumentInfo] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [orientation, setOrientation] = useState("landscape");
  const [loadingText, setLoadingText] = useState("Loading document...");
  const [error, setError] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [ambientActive, setAmbientActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState({});
  const [toast, setToast] = useState("");
  const [flipState, setFlipState] = useState("read");

  const appRef = useRef(null);
  const viewerRef = useRef(null);
  const tocRef = useRef(null);
  const mountRef = useRef(null);
  const stageRef = useRef(null);
  const pageFlipRef = useRef(null);
  const pdfRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const pageElementsRef = useRef(new Map());
  const renderedUrlsRef = useRef(new Map());
  const renderQueueRef = useRef(new Set());
  const generationRef = useRef(0);
  const previousPageRef = useRef(0);
  const dragStartRef = useRef(null);
  const panCaptureRef = useRef(null);
  const soundRef = useRef(true);
  const ambientRef = useRef(null);

  const totalPages = documentInfo?.pageCount || 0;
  const aspectRatio = documentInfo?.aspectRatio || book.aspectRatio || 0.707;
  const isFrontCover = totalPages > 0 && orientation === "landscape" && currentPage === 0;
  const isBackCover = totalPages > 1 && orientation === "landscape" && currentPage >= totalPages - 1;
  const isSinglePageView = orientation === "portrait";

  useEffect(() => {
    if (!documentInfo || !pageFlipRef.current) return;
    const updateBook = () => {
      pageFlipRef.current?.update?.();
    };
    const frame = window.requestAnimationFrame(updateBook);
    const timer = window.setTimeout(updateBook, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [documentInfo, isSinglePageView]);

  const renderPage = useCallback(async (pageNumber) => {
    const pdf = pdfRef.current;
    const generation = generationRef.current;
    if (!pdf || pageNumber < 1 || pageNumber > pdf.numPages) return;
    if (renderedUrlsRef.current.has(pageNumber) || renderQueueRef.current.has(pageNumber)) return;

    renderQueueRef.current.add(pageNumber);
    try {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(1800, Math.max(1050, window.innerWidth * Math.min(window.devicePixelRatio || 1, 1.45)));
      const viewport = page.getViewport({ scale: targetWidth / base.width });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
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
        setLoadingText("Loading document...");
        setCurrentPage(0);
        setThumbnailUrls({});
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const shouldStreamPdf = Number(book.sizeBytes || 0) > INLINE_DOCUMENT_BYTES;
        let task;
        if (shouldStreamPdf) {
          task = pdfjs.getDocument({
            url: book.fileUrl,
            withCredentials: true,
            isEvalSupported: false,
            disableAutoFetch: true,
            rangeChunkSize: 1024 * 1024,
          });
        } else {
          const documentResponse = await fetch(book.documentUrl || `/api/catalogs/${encodeURIComponent(book.slug)}/document`, {
            cache: "no-store",
            credentials: "same-origin",
          });
          if (!documentResponse.ok) {
            throw new Error(await readCatalogDocumentError(documentResponse, "The catalog document could not be loaded."));
          }
          const bytes = await readCatalogDocumentPayload(documentResponse);
          task = pdfjs.getDocument({
            data: bytes,
            isEvalSupported: false,
          });
        }
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
  }, [book.documentUrl, book.fileUrl, book.sizeBytes, book.slug]);

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
      page.dataset.density = pageNumber === 1 || pageNumber === documentInfo.pageCount ? "hard" : "soft";
      page.dataset.pageNumber = String(pageNumber);

      const image = document.createElement("img");
      image.src = renderedUrlsRef.current.get(pageNumber) || EMPTY_IMAGE;
      image.alt = `Page ${pageNumber}`;
      image.className = styles.pageImage;
      if (renderedUrlsRef.current.has(pageNumber)) image.classList.add(styles.pageReady);

      const loader = document.createElement("div");
      loader.className = styles.pageLoader;
      if (renderedUrlsRef.current.has(pageNumber)) loader.classList.add(styles.pageLoaderHidden);
      const loaderSpinner = document.createElement("span");
      const loaderLabel = document.createElement("strong");
      loaderLabel.textContent = `Page ${pageNumber}`;
      loader.append(loaderSpinner, loaderLabel);

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
      restorePageDensities(instance, documentInfo.pageCount);
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
        localStorage.setItem(`catalog_progress_${book.slug}`, String(next));
        window.setTimeout(() => restorePageDensities(instance, documentInfo.pageCount), 0);
      });
      instance.on("changeOrientation", (event) => setOrientation(event.data));
      instance.on("changeState", (event) => {
        setFlipState(event.data);
        if (event.data === "read") {
          window.setTimeout(() => restorePageDensities(instance, documentInfo.pageCount), 0);
        }
      });

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
      for (let page = Math.max(1, currentPage - 1); page <= Math.min(totalPages, currentPage + 4); page += 1) {
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
    if (!tocRef.current) return;
    if (tocOpen) {
      tocRef.current.removeAttribute("inert");
    } else {
      tocRef.current.setAttribute("inert", "");
    }
  }, [tocOpen]);

  useEffect(() => {
    function handleKey(event) {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
      if (event.key === "ArrowRight") pageFlipRef.current?.flipNext("bottom");
      if (event.key === "ArrowLeft") pageFlipRef.current?.flipPrev("bottom");
      if ((event.key === "+" || event.key === "=") && !event.metaKey && !event.ctrlKey) {
        setZoom((current) => clamp(Number((current + 0.25).toFixed(2)), 0.75, 3.5));
      }
      if (event.key === "-" && !event.metaKey && !event.ctrlKey) {
        setZoom((current) => {
          const next = clamp(Number((current - 0.25).toFixed(2)), 0.75, 3.5);
          if (next <= 1) setPan({ x: 0, y: 0 });
          return next;
        });
      }
      if (event.key === "0" && !event.metaKey && !event.ctrlKey) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
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
    startAmbientSound().catch(() => {});
    pageFlipRef.current?.turnToPage(index);
    setCurrentPage(index);
    setTocOpen(false);
    renderPage(index + 1);
  }

  function flipNext() {
    startAmbientSound().catch(() => {});
    pageFlipRef.current?.flipNext("bottom");
  }

  function flipPrev() {
    startAmbientSound().catch(() => {});
    pageFlipRef.current?.flipPrev("bottom");
  }

  function changeZoom(amount) {
    setZoom((current) => {
      const next = clamp(Number((current + amount).toFixed(2)), 0.75, 3.5);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }

  function setZoomLevel(value) {
    const next = clamp(Number(value), 0.75, 3.5);
    setZoom(next);
    if (next <= 1) setPan({ x: 0, y: 0 });
  }

  function resetZoom() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleWheelZoom(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY === 0) return;
    const direction = event.deltaY < 0 ? 1 : -1;
    const step = event.deltaMode === 1 ? 0.18 : 0.14;
    changeZoom(direction * step);
  }

  const getPanBounds = useCallback(() => {
    const viewer = viewerRef.current;
    const stage = stageRef.current;
    if (!viewer || !stage) {
      const fallback = 220 * Math.max(1, zoom);
      return { x: fallback, y: fallback };
    }

    const viewerRect = viewer.getBoundingClientRect();
    const stageWidth = stage.offsetWidth || stage.getBoundingClientRect().width / zoom;
    const stageHeight = stage.offsetHeight || stage.getBoundingClientRect().height / zoom;
    const scaledWidth = stageWidth * zoom;
    const scaledHeight = stageHeight * zoom;
    const overflowX = Math.max(0, (scaledWidth - viewerRect.width) / 2);
    const overflowY = Math.max(0, (scaledHeight - viewerRect.height) / 2);

    return {
      x: Math.max(96, Math.min(viewerRect.width * 0.42, overflowX + viewerRect.width * 0.22)),
      y: Math.max(96, Math.min(viewerRect.height * 0.38, overflowY + viewerRect.height * 0.18)),
    };
  }, [zoom]);

  useEffect(() => {
    if (!documentInfo) return;
    const frame = window.requestAnimationFrame(() => {
      const bounds = getPanBounds();
      setPan((current) => ({
        x: clamp(current.x, -bounds.x, bounds.x),
        y: clamp(current.y, -bounds.y, bounds.y),
      }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, documentInfo, getPanBounds, isSinglePageView, orientation]);

  function startPan(event) {
    if (event.button !== 1) return;
    startAmbientSound().catch(() => {});
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panCaptureRef.current = event.currentTarget;
    setDragging(true);
    dragStartRef.current = { x: event.clientX, y: event.clientY, pan };
  }

  function movePan(event) {
    if (!dragging || !dragStartRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = getPanBounds();
    setPan({
      x: clamp(dragStartRef.current.pan.x + event.clientX - dragStartRef.current.x, -bounds.x, bounds.x),
      y: clamp(dragStartRef.current.pan.y + event.clientY - dragStartRef.current.y, -bounds.y, bounds.y),
    });
  }

  function endPan(event) {
    if (!dragging) return;
    event.preventDefault();
    event.stopPropagation();
    const captureTarget = panCaptureRef.current;
    if (captureTarget?.hasPointerCapture?.(event.pointerId)) {
      captureTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    dragStartRef.current = null;
    panCaptureRef.current = null;
  }

  function preventMiddleClickNavigation(event) {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
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
    if (next) {
      startAmbientSound()
        .then((started) => setToast(started ? "Ambient audio on" : "Tap the reader to start audio"))
        .catch(() => setToast("Tap the reader to start audio"));
      window.setTimeout(() => setToast(""), 1800);
    } else {
      stopAmbientSound();
      setToast("Audio muted");
      window.setTimeout(() => setToast(""), 1600);
    }
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await appRef.current?.requestFullscreen();
    }
  }

  async function startAmbientSound() {
    if (!soundRef.current) return false;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;

    if (ambientRef.current?.started) {
      if (ambientRef.current.context.state === "suspended") {
        await resumeAudioContext(ambientRef.current.context);
      }
      const running = ambientRef.current.context.state === "running";
      setAmbientActive(running);
      return running;
    }

    const context = ambientRef.current?.context || new AudioContext();
    if (context.state === "suspended") await resumeAudioContext(context);

    const master = context.createGain();
    const filter = context.createBiquadFilter();
    const subFilter = context.createBiquadFilter();
    const shimmerFilter = context.createBiquadFilter();
    const filterLfo = context.createOscillator();
    const filterLfoGain = context.createGain();
    const shimmerLfo = context.createOscillator();
    const shimmerLfoGain = context.createGain();
    const notes = [73.42, 98, 123.47, 146.83, 196, 246.94];
    const sources = [];
    const modulators = [];

    const oscillators = notes.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
      const panLfo = context.createOscillator();
      const panGain = context.createGain();
      oscillator.type = index % 3 === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = [-8, 4, -3, 7, -5, 2][index];
      gain.gain.value = index < 2 ? 0.01 : 0.014;
      panLfo.type = "sine";
      panLfo.frequency.value = 0.008 + index * 0.004;
      panGain.gain.value = 0.18 + index * 0.025;
      if (panner) {
        panLfo.connect(panGain).connect(panner.pan);
        oscillator.connect(gain).connect(panner).connect(filter);
      } else {
        oscillator.connect(gain).connect(filter);
      }
      oscillator.start();
      panLfo.start();
      sources.push(oscillator);
      modulators.push(panLfo);
      return oscillator;
    });

    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.62;
    subFilter.type = "lowpass";
    subFilter.frequency.value = 155;
    subFilter.Q.value = 0.35;
    shimmerFilter.type = "bandpass";
    shimmerFilter.frequency.value = 980;
    shimmerFilter.Q.value = 0.5;
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.026, context.currentTime + 2.4);
    filter.connect(master);
    subFilter.connect(master);
    shimmerFilter.connect(master);
    master.connect(context.destination);

    filterLfo.type = "sine";
    filterLfo.frequency.value = 0.018;
    filterLfoGain.gain.value = 115;
    filterLfo.connect(filterLfoGain).connect(filter.frequency);
    filterLfo.start();
    shimmerLfo.type = "sine";
    shimmerLfo.frequency.value = 0.011;
    shimmerLfoGain.gain.value = 220;
    shimmerLfo.connect(shimmerLfoGain).connect(shimmerFilter.frequency);
    shimmerLfo.start();
    modulators.push(filterLfo, shimmerLfo);

    const sub = context.createOscillator();
    const subGain = context.createGain();
    sub.type = "sine";
    sub.frequency.value = 36.71;
    subGain.gain.value = 0.012;
    sub.connect(subGain).connect(subFilter);
    sub.start();
    sources.push(sub);

    const noiseSource = createSoftNoiseLoop(context);
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.0045;
    noiseSource.connect(noiseGain).connect(shimmerFilter);
    noiseSource.start();
    sources.push(noiseSource);

    ambientRef.current = {
      context,
      filter,
      filterLfo,
      filterLfoGain,
      master,
      oscillators,
      sources,
      modulators,
      started: true,
    };
    const running = context.state === "running";
    setAmbientActive(running);
    return running;
  }

  function stopAmbientSound(fade = true, updateState = true) {
    const engine = ambientRef.current;
    if (!engine?.started) {
      if (updateState) setAmbientActive(false);
      return;
    }

    const stopAt = fade ? engine.context.currentTime + 0.42 : engine.context.currentTime;
    engine.master.gain.cancelScheduledValues(engine.context.currentTime);
    engine.master.gain.setValueAtTime(Math.max(engine.master.gain.value, 0.0001), engine.context.currentTime);
    engine.master.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    window.setTimeout(() => {
      for (const source of engine.sources || engine.oscillators || []) {
        try {
          source.stop();
        } catch {
          // Source may already be stopped by the browser.
        }
      }
      for (const modulator of engine.modulators || []) {
        try {
          modulator.stop();
        } catch {
          // Modulator may already be stopped by the browser.
        }
      }
      engine.context.close();
    }, fade ? 470 : 0);
    ambientRef.current = null;
    if (updateState) setAmbientActive(false);
  }

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

  useEffect(() => {
    soundRef.current = soundEnabled;
    if (!soundEnabled) stopAmbientSound();
  }, [soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) return undefined;
    const unlockAudio = () => {
      startAmbientSound().catch(() => {
        setAmbientActive(false);
      });
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [soundEnabled]);

  useEffect(() => {
    return () => stopAmbientSound(false, false);
  }, []);

  return (
    <div
      className={styles.reader}
      ref={appRef}
      style={{ "--page-ratio": aspectRatio, "--spread-ratio": aspectRatio * 2 }}
    >
      <header className={styles.topbar}>
        <div className={styles.titleGroup}>
          <Link href="/" className={styles.back} aria-label="Return to publications">
            <ArrowLeft size={17} /><span>Publications</span>
          </Link>
          <div>
            <h1>{book.title}</h1>
            <span>{book.category} · {book.orientation} · {totalPages || book.pageCount} pages</span>
          </div>
        </div>
        <div className={styles.toolbar}>
          <ToolbarButton label="Contents" active={tocOpen} onClick={() => setTocOpen((open) => !open)}><List size={17} /></ToolbarButton>
          <ToolbarButton label={soundEnabled ? "Mute audio" : "Enable ambient audio"} active={soundEnabled} onClick={toggleSound}>{soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</ToolbarButton>
          <ToolbarButton label="Copy share link" onClick={copyShareLink}><Share2 size={17} /></ToolbarButton>
          <ToolbarButton label="Fullscreen" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</ToolbarButton>
        </div>
      </header>

      <aside
        className={`${styles.toc} ${tocOpen ? styles.tocOpen : ""}`}
        aria-hidden={!tocOpen}
        ref={tocRef}
      >
        <div className={styles.tocHeader}>
          <div><span>Navigate</span><h2>Pages</h2></div>
          <button onClick={() => setTocOpen(false)} aria-label="Close contents" tabIndex={tocOpen ? undefined : -1}><X size={18} /></button>
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
                  tabIndex={tocOpen ? undefined : -1}
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

      <main className={styles.viewer} ref={viewerRef}>
        {loadingText && <div className={styles.loader}><span /><p>{loadingText}</p></div>}
        {error && <div className={styles.readerError}><p>{error}</p><Link href="/">Return to publications</Link></div>}
        {documentInfo && !error && (
          <>
            <button
              className={`${styles.navArrow} ${styles.previous}`}
              onClick={flipPrev}
              disabled={currentPage <= 0}
              aria-label="Previous page"
            ><ChevronLeft size={25} /></button>

            <div
              className={`${styles.zoomSurface} ${zoom > 1 ? styles.zoomed : ""} ${dragging ? styles.dragging : ""}`}
              onPointerDownCapture={startPan}
              onPointerMove={movePan}
              onPointerUp={endPan}
              onPointerCancel={endPan}
              onAuxClick={preventMiddleClickNavigation}
              onWheelCapture={handleWheelZoom}
            >
              <div
                className={`${styles.stageFrame} ${isSinglePageView ? styles.singlePage : ""} ${isFrontCover ? styles.frontCover : ""} ${isBackCover ? styles.backCover : ""}`}
                data-flip-state={flipState}
                data-view-mode={isSinglePageView ? "single" : "spread"}
                ref={stageRef}
                style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
              >
                <div className={styles.bookMountShell}>
                  <div className={styles.bookShadow} aria-hidden="true" />
                  <div className={styles.bookMount} ref={mountRef} />
                </div>
              </div>
            </div>

            <button
              className={`${styles.navArrow} ${styles.next}`}
              onClick={flipNext}
              disabled={currentPage >= totalPages - 1}
              aria-label="Next page"
            ><ChevronRight size={25} /></button>
          </>
        )}
      </main>

      <footer className={styles.bottombar}>
        <div className={styles.zoomControls}>
          <ToolbarButton label="Zoom out" onClick={() => changeZoom(-0.25)} disabled={zoom <= 0.75}><ZoomOut size={16} /></ToolbarButton>
          <ToolbarButton label="Reset zoom" onClick={resetZoom} disabled={zoom === 1}><RotateCcw size={16} /></ToolbarButton>
          <ToolbarButton label="Zoom in" onClick={() => changeZoom(0.25)} disabled={zoom >= 3.5}><ZoomIn size={16} /></ToolbarButton>
          <label className={styles.zoomSlider}>
            <span className="visually-hidden">Zoom</span>
            <input
              type="range"
              min="0.75"
              max="3.5"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoomLevel(event.target.value)}
            />
          </label>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
        <span className={`${styles.soundStatus} ${ambientActive ? styles.soundOn : ""}`}>
          {soundEnabled ? (ambientActive ? "Ambient on" : "Audio ready") : "Muted"}
        </span>
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
      aria-pressed={active ? true : undefined}
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

function restorePageDensities(instance, pageCount) {
  for (let index = 0; index < pageCount; index += 1) {
    const page = instance.getPage?.(index);
    if (!page) continue;
    const density = index === 0 || index === pageCount - 1 ? "hard" : "soft";
    page.setDensity?.(density);
    page.setDrawingDensity?.(density);
  }
}

async function readCatalogDocumentPayload(response) {
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.length < 6 || raw[0] !== 0) throw new Error("Catalog document payload is invalid.");
  const bytes = new Uint8Array(raw.length - 1);
  bytes.set(raw.subarray(1));
  return bytes;
}

async function readCatalogDocumentError(response, fallback) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    return payload?.error || fallback;
  }
  return fallback;
}

async function resumeAudioContext(context) {
  if (context.state !== "suspended") return;
  await Promise.race([
    context.resume().catch(() => {}),
    new Promise((resolve) => window.setTimeout(resolve, 450)),
  ]);
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

function createSoftNoiseLoop(context) {
  const duration = 4;
  const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < channel.length; index += 1) {
    last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
    channel[index] = last;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = 0.42;
  return source;
}
