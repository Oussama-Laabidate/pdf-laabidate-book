export async function readPdfMetadata(buffer, filename) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
  });

  try {
    const document = await task.promise;
    const firstPage = await document.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const metadata = await document.getMetadata().catch(() => null);
    const title =
      String(metadata?.info?.Title || "").trim() ||
      String(filename || "").replace(/\.pdf$/i, "").trim() ||
      "Untitled catalog";

    const result = {
      title: title.slice(0, 160),
      pageCount: document.numPages,
      aspectRatio: Number((viewport.width / viewport.height).toFixed(6)),
    };
    return result;
  } finally {
    await task.destroy().catch(() => {});
  }
}
