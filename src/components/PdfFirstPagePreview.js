"use client";

import { useEffect, useRef, useState } from "react";

export default function PdfFirstPagePreview({
  catalog,
  index = 0,
  className = "",
  readyClassName = "",
  enabled = true,
  delayMs = 0,
  children,
}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const element = wrapperRef.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "360px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !visible) return undefined;
    let active = true;
    let loadingTask = null;

    async function renderFirstPage() {
      setReady(false);
      if (delayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        if (!active) return;
      }
      try {
        const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
        if (!active || !canvasRef.current) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        loadingTask = pdfjs.getDocument({
          url: catalog.coverUrl || catalog.fileUrl,
          withCredentials: true,
          isEvalSupported: false,
          disableAutoFetch: true,
          rangeChunkSize: 512 * 1024,
        });
        const pdf = await loadingTask.promise;
        if (!active || !canvasRef.current) return;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.6, Math.max(0.7, 520 / viewport.width));
        const scaled = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.ceil(scaled.width);
        canvas.height = Math.ceil(scaled.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport: scaled }).promise;
        if (active) setReady(true);
      } catch {
        if (active) setReady(false);
      }
    }

    const useIdleCallback = typeof window.requestIdleCallback === "function";
    const handle = useIdleCallback
      ? window.requestIdleCallback(renderFirstPage, { timeout: 2200 })
      : window.setTimeout(renderFirstPage, 80);
    return () => {
      active = false;
      if (useIdleCallback) {
        window.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }
      loadingTask?.destroy?.().catch(() => {});
    };
  }, [catalog.coverUrl, catalog.fileUrl, delayMs, enabled, visible]);

  return (
    <div
      ref={wrapperRef}
      className={`${className} ${ready ? readyClassName : ""}`}
      style={{ "--cover-ratio": catalog.aspectRatio, "--cover-index": index }}
    >
      <canvas ref={canvasRef} aria-hidden={!ready} />
      {!ready && children}
      <i aria-hidden="true" />
    </div>
  );
}
