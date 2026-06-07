"use client";

import { useEffect, useRef, useState } from "react";

export default function PdfFirstPagePreview({
  catalog,
  index = 0,
  className = "",
  readyClassName = "",
  children,
}) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let loadingTask = null;

    async function renderFirstPage() {
      setReady(false);
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

    renderFirstPage();
    return () => {
      active = false;
      loadingTask?.destroy?.().catch(() => {});
    };
  }, [catalog.coverUrl, catalog.fileUrl]);

  return (
    <div
      className={`${className} ${ready ? readyClassName : ""}`}
      style={{ "--cover-ratio": catalog.aspectRatio, "--cover-index": index }}
    >
      <canvas ref={canvasRef} aria-hidden={!ready} />
      {!ready && children}
      <i aria-hidden="true" />
    </div>
  );
}
