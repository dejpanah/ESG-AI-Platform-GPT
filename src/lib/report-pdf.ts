import { snapdom } from "@zumer/snapdom";
import { jsPDF } from "jspdf";

function sanitizePdfFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 72);
  return `${cleaned || "esg-report"}.pdf`;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function captureElementCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  const canvas = await snapdom.toCanvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
  });
  return canvas;
}

function sliceCanvasStrip(
  source: HTMLCanvasElement,
  sy: number,
  sh: number,
): string {
  const strip = document.createElement("canvas");
  strip.width = source.width;
  strip.height = Math.max(1, Math.round(sh));
  const ctx = strip.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, strip.width, strip.height);
    ctx.drawImage(
      source,
      0,
      Math.round(sy),
      source.width,
      Math.round(sh),
      0,
      0,
      strip.width,
      strip.height,
    );
  }
  return strip.toDataURL("image/png");
}

export async function exportReportContainerToPdf(
  container: HTMLElement,
  title: string,
): Promise<void> {
  if ("fonts" in document && document.fonts?.ready) {
    await document.fonts.ready;
  }
  await nextFrame();
  await nextFrame();

  const blocks = Array.from(
    container.querySelectorAll<HTMLElement>("[data-pdf-block]"),
  );
  const targets = blocks.length > 0 ? blocks : [container];

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidthMm = pdf.internal.pageSize.getWidth(); // 210
  const pageHeightMm = pdf.internal.pageSize.getHeight(); // 297
  const marginX = 12;
  const marginTop = 12;
  const marginBottom = 14;
  const contentWidthMm = pageWidthMm - marginX * 2; // 186
  const maxPageContentHeightMm = pageHeightMm - marginTop - marginBottom; // 271
  const blockGapMm = 4;

  let cursorY = marginTop;

  for (const block of targets) {
    if (block.offsetHeight === 0 || block.offsetWidth === 0) continue;

    const canvas = await captureElementCanvas(block);
    if (canvas.width === 0 || canvas.height === 0) continue;

    const mmPerPx = contentWidthMm / canvas.width;
    const totalHeightMm = canvas.height * mmPerPx;

    // Single block fits inside one full page: keep intact if it doesn't fit on current page
    if (totalHeightMm <= maxPageContentHeightMm) {
      if (cursorY > marginTop && cursorY + totalHeightMm > pageHeightMm - marginBottom) {
        pdf.addPage();
        cursorY = marginTop;
      }
      const dataUrl = canvas.toDataURL("image/png");
      pdf.addImage(
        dataUrl,
        "PNG",
        marginX,
        cursorY,
        contentWidthMm,
        totalHeightMm,
        undefined,
        "FAST",
      );
      cursorY += totalHeightMm + blockGapMm;
      continue;
    }

    // Tall block (e.g. multi-page markdown text): slice vertically across pages
    if (cursorY > marginTop + 20) {
      pdf.addPage();
      cursorY = marginTop;
    }

    let offsetPx = 0;
    while (offsetPx < canvas.height) {
      const availMm = pageHeightMm - marginBottom - cursorY;
      const slicePx = Math.min(
        canvas.height - offsetPx,
        Math.max(1, Math.floor(availMm / mmPerPx)),
      );
      const sliceMm = slicePx * mmPerPx;
      const sliceUrl = sliceCanvasStrip(canvas, offsetPx, slicePx);
      pdf.addImage(
        sliceUrl,
        "PNG",
        marginX,
        cursorY,
        contentWidthMm,
        sliceMm,
        undefined,
        "FAST",
      );
      offsetPx += slicePx;
      if (offsetPx < canvas.height) {
        pdf.addPage();
        cursorY = marginTop;
      } else {
        cursorY += sliceMm + blockGapMm;
      }
    }
  }

  // Stamp clean subtle footer page numbers on every page
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setTextColor(120, 125, 135);
    pdf.text(
      `ESG Intelligence Platform · Page ${p} of ${totalPages}`,
      pageWidthMm / 2,
      pageHeightMm - 6,
      { align: "center" },
    );
  }

  pdf.save(sanitizePdfFilename(title));
}
