const DEFAULT_MAX_PAGES = 20;
const DEFAULT_MAX_CHARS = 20000;

export async function readPdfText(buffer, options = {}) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const maxPages = Math.max(1, Number(options.maxPages) || DEFAULT_MAX_PAGES);
  const maxChars = Math.max(1000, Number(options.maxChars) || DEFAULT_MAX_CHARS);
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
  });

  try {
    const document = await task.promise;
    const pageLimit = Math.min(document.numPages, maxPages);
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => String(item.str || "").trim())
        .filter(Boolean)
        .join(" ");
      if (text) pages.push(text);
      if (pages.join("\n\n").length >= maxChars) break;
    }

    return {
      text: pages.join("\n\n").slice(0, maxChars),
      pageCount: document.numPages,
      pagesRead: pageLimit,
    };
  } finally {
    await task.destroy().catch(() => {});
  }
}
