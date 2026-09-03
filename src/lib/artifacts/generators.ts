// Artifact Generators — render validated JSON content into real files.
// Each generator returns bytes + mimeType. Pure, server-side, no LLM calls.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  AlignmentType, PageBreak, WidthType,
} from "docx";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DocumentContent, PresentationContent, SpreadsheetContent } from "./schema";
import type { ArtifactKind } from "./intent";
import { ARTIFACT_MIME } from "./intent";

export interface GeneratedArtifact {
  bytes: Buffer;
  mimeType: string;
}

// ── DOCX ──
export async function generateDocx(doc: DocumentContent): Promise<GeneratedArtifact> {
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];
  const headingMap = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

  children.push(new Paragraph({
    text: doc.title,
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
  }));
  if (doc.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: doc.subtitle, italics: true, size: 24, color: "666666" })],
    }));
  }

  for (const b of doc.blocks) {
    switch (b.type) {
      case "heading":
        children.push(new Paragraph({ text: b.text, heading: headingMap[Math.min(3, b.level - 1)] }));
        break;
      case "paragraph":
        children.push(new Paragraph({ text: b.text, spacing: { after: 160 } }));
        break;
      case "bullets":
        for (const item of b.items) children.push(new Paragraph({ text: item, bullet: { level: 0 } }));
        break;
      case "table": {
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: b.columns.map((c) => new TableCell({
                shading: { fill: "EDEDED" },
                children: [new Paragraph({ children: [new TextRun({ text: c, bold: true })] })],
              })),
            }),
            ...b.rows.map((r) => new TableRow({
              children: b.columns.map((_, i) => new TableCell({
                children: [new Paragraph({ text: r[i] ?? "" })],
              })),
            })),
          ],
        }));
        children.push(new Paragraph({ text: "" }));
        break;
      }
      case "pageBreak":
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
    }
  }

  const buffer = await Packer.toBuffer(new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
    sections: [{ children }],
  }));
  return { bytes: Buffer.from(buffer), mimeType: ARTIFACT_MIME.docx };
}

// ── PPTX ──
export async function generatePptx(p: PresentationContent): Promise<GeneratedArtifact> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = p.title;

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.addText(p.title, {
    x: 0.5, y: 2.2, w: 9, h: 1.2, fontSize: 36, bold: true, align: "center", color: "1F2937",
  });
  if (p.subtitle) {
    titleSlide.addText(p.subtitle, { x: 0.5, y: 3.4, w: 9, h: 0.8, fontSize: 18, align: "center", color: "6B7280" });
  }

  let n = 0;
  for (const s of p.slides) {
    n++;
    const slide = pptx.addSlide();
    // Section header bar
    slide.addText(`${n}. ${s.title}`, {
      x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 24, bold: true, color: "1F2937",
    });
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.2, w: 1.5, h: 0.06, fill: { color: "D97757" } });
    if (s.bullets.length) {
      slide.addText(
        s.bullets.map((t) => ({ text: t, options: { bullet: true } })),
        { x: 0.8, y: 1.6, w: 8.4, h: 3.6, fontSize: 16, color: "374151", lineSpacingMultiple: 1.3 }
      );
    }
    if (s.notes) slide.addNotes(s.notes);
  }

  const bytes = await pptx.write({ outputType: "nodebuffer" });
  return { bytes: Buffer.from(bytes as ArrayBuffer), mimeType: ARTIFACT_MIME.pptx };
}

// ── XLSX ──
export async function generateXlsx(sp: SpreadsheetContent): Promise<GeneratedArtifact> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Lumen AI";
  for (const s of sp.sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.columns = s.headers.map((h) => ({ header: h, width: Math.max(12, Math.min(40, h.length + 6)) }));
    for (const r of s.rows) ws.addRow(r);
    // Header styling + freeze + autofilter
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD97757" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (s.rows.length > 5) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.headers.length } };
  }
  const buffer = await wb.xlsx.writeBuffer();
  return { bytes: Buffer.from(buffer), mimeType: ARTIFACT_MIME.xlsx };
}

// ── PDF (pdf-lib, custom professional layout) ──
export async function generatePdf(doc: DocumentContent): Promise<GeneratedArtifact> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // ponytail: Helvetica (WinAnsi) chokes on Vietnamese diacritics — strip them
  // for PDF; upgrade path: embed a Unicode TTF font when Vietnamese PDFs needed.
  const t = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  const sanitize = (s: string) => t(s).replace(/[^\x20-\x7E\n]/g, "");

  const A4: [number, number] = [595.28, 841.89];
  const M = 56; // margin
  const maxWidth = A4[0] - M * 2;
  let page = pdf.addPage(A4);
  let y = A4[1] - M;
  let pageNumber = 1;

  const newPage = () => {
    drawPageNumber();
    page = pdf.addPage(A4);
    pageNumber++;
    y = A4[1] - M;
  };
  const drawPageNumber = () => {
    page.drawText(String(pageNumber), { x: A4[0] / 2 - 8, y: M / 2, size: 9, font: regular, color: rgb(0.6, 0.6, 0.6) });
  };
  const ensure = (h: number) => { if (y - h < M + 20) newPage(); };

  // Word-wrap for a font size
  const wrap = (text: string, size: number, font: typeof regular): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(cand, size) > maxWidth) {
        if (line) lines.push(line);
        line = w;
      } else line = cand;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };

  // Title
  ensure(90);
  page.drawText(sanitize(doc.title.slice(0, 80)), {
    x: M, y: y - 28, size: 22, font: bold, color: rgb(0.12, 0.12, 0.15),
  });
  y -= 40;
  if (doc.subtitle) {
    page.drawText(sanitize(doc.subtitle.slice(0, 100)), { x: M, y, size: 12, font: italic, color: rgb(0.45, 0.45, 0.5) });
    y -= 24;
  }
  // Accent rule
  page.drawRectangle({ x: M, y: y - 2, width: 48, height: 3, color: rgb(0.85, 0.47, 0.34) });
  y -= 24;

  for (const b of doc.blocks) {
    switch (b.type) {
      case "heading": {
        const size = b.level === 1 ? 16 : b.level === 2 ? 13 : 11.5;
        const lines = wrap(sanitize(b.text), size, bold);
        ensure(lines.length * (size + 6) + 14);
        y -= 8;
        for (const ln of lines) {
          page.drawText(ln, { x: M, y: y - size, size, font: bold, color: rgb(0.1, 0.1, 0.12) });
          y -= size + 5;
        }
        y -= 4;
        break;
      }
      case "paragraph": {
        const lines = wrap(sanitize(b.text), 10.5, regular);
        for (const ln of lines) {
          ensure(16);
          page.drawText(ln, { x: M, y: y - 11, size: 10.5, font: regular, color: rgb(0.2, 0.2, 0.25) });
          y -= 15;
        }
        y -= 6;
        break;
      }
      case "bullets":
        for (const item of b.items) {
          const lines = wrap(sanitize(item), 10.5, regular);
          ensure(lines.length * 15 + 4);
          // bullet dot
          page.drawCircle({ x: M + 4, y: y - 7, size: 2, color: rgb(0.85, 0.47, 0.34) });
          for (let i = 0; i < lines.length; i++) {
            if (i > 0) ensure(15);
            page.drawText(lines[i], { x: M + 14, y: y - 11, size: 10.5, font: regular, color: rgb(0.2, 0.2, 0.25) });
            y -= 15;
          }
          y -= 2;
        }
        y -= 4;
        break;
      case "table": {
        const cols = b.columns.map((c) => sanitize(c));
        const colCount = Math.max(1, cols.length);
        const colW = maxWidth / colCount;
        const size = 9.5;
        // header row
        ensure(24);
        page.drawRectangle({ x: M, y: y - 16, width: maxWidth, height: 18, color: rgb(0.93, 0.93, 0.94) });
        for (let i = 0; i < colCount; i++) {
          page.drawText(cols[i].slice(0, Math.floor(colW / (size * 0.55))), { x: M + i * colW + 5, y: y - 12, size, font: bold, color: rgb(0.15, 0.15, 0.18) });
        }
        y -= 22;
        // data rows
        for (let r = 0; r < b.rows.length; r++) {
          const row = b.rows[r].map((c) => sanitize(String(c ?? "")));
          ensure(18);
          if (r % 2 === 1) {
            page.drawRectangle({ x: M, y: y - 14, width: maxWidth, height: 16, color: rgb(0.97, 0.97, 0.975) });
          }
          for (let i = 0; i < colCount; i++) {
            page.drawText(row[i]?.slice(0, Math.floor(colW / (size * 0.55))) ?? "", { x: M + i * colW + 5, y: y - 10, size, font: regular, color: rgb(0.25, 0.25, 0.3) });
          }
          y -= 17;
        }
        y -= 8;
        break;
      }
      case "pageBreak":
        newPage();
        break;
    }
  }
  drawPageNumber();

  const bytes = await pdf.save();
  return { bytes: Buffer.from(bytes), mimeType: ARTIFACT_MIME.pdf };
}

// ── MD / CSV / TXT / JSON / HTML — plain text formats ──
export function generateMarkdown(doc: DocumentContent): GeneratedArtifact {
  const out: string[] = [`# ${doc.title}`, ""];
  if (doc.subtitle) out.push(`> ${doc.subtitle}`, "");
  for (const b of doc.blocks) {
    switch (b.type) {
      case "heading": out.push(`${"#".repeat(Math.min(6, b.level + 1))} ${b.text}`, ""); break;
      case "paragraph": out.push(b.text, ""); break;
      case "bullets": out.push(...b.items.map((i) => `- ${i}`), ""); break;
      case "table":
        out.push(`| ${b.columns.join(" | ")} |`);
        out.push(`| ${b.columns.map(() => "---").join(" | ")} |`);
        for (const r of b.rows) out.push(`| ${b.columns.map((_, i) => r[i] ?? "").join(" | ")} |`);
        out.push("");
        break;
      case "pageBreak": out.push("---", ""); break;
    }
  }
  return { bytes: Buffer.from(out.join("\n"), "utf8"), mimeType: ARTIFACT_MIME.md };
}

export function generateCsv(table: { columns: string[]; rows: string[][] }): GeneratedArtifact {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [table.columns.map(esc).join(","), ...table.rows.map((r) => table.columns.map((_, i) => esc(r[i] ?? "")).join(","))];
  return { bytes: Buffer.from(lines.join("\r\n"), "utf8"), mimeType: ARTIFACT_MIME.csv };
}

export function generateText(text: string): GeneratedArtifact {
  return { bytes: Buffer.from(text, "utf8"), mimeType: ARTIFACT_MIME.txt };
}

export function generateJson(value: unknown): GeneratedArtifact {
  return { bytes: Buffer.from(JSON.stringify(value, null, 2), "utf8"), mimeType: ARTIFACT_MIME.json };
}

// Re-export for convenience
export { ARTIFACT_MIME };
export type { ArtifactKind };
