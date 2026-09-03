import { describe, it, expect } from "vitest";
import { detectArtifactIntent, safeFileName } from "@/lib/artifacts/intent";
import { extractJson, documentSchema, presentationSchema, spreadsheetSchema } from "@/lib/artifacts/schema";
import { generateDocx, generatePptx, generateXlsx, generatePdf, generateMarkdown, generateCsv } from "@/lib/artifacts/generators";

describe("artifact intent detection", () => {
  it("detects Vietnamese docx requests", () => {
    const r = detectArtifactIntent("Tạo cho tôi tài liệu word về kế hoạch marketing 2026");
    expect(r.kind).toBe("docx");
    expect(r.fileName).toBeNull();
  });
  it("detects English pptx requests", () => {
    const r = detectArtifactIntent("Please create a PowerPoint about our Q3 results");
    expect(r.kind).toBe("pptx");
  });
  it("detects Vietnamese slide requests", () => {
    const r = detectArtifactIntent("Làm slide thuyết trình về kiến trúc microservices");
    expect(r.kind).toBe("pptx");
  });
  it("detects excel/xlsx requests", () => {
    expect(detectArtifactIntent("Xuất excel danh sách nhân viên phòng IT").kind).toBe("xlsx");
    expect(detectArtifactIntent("export this table to spreadsheet please").kind).toBe("xlsx");
  });
  it("detects pdf requests", () => {
    expect(detectArtifactIntent("Viết và xuất pdf báo cáo tài chính quý 2").kind).toBe("pdf");
  });
  it("explicit filename wins", () => {
    const r = detectArtifactIntent("tạo file baocao-doanhthu.xlsx cho tôi");
    expect(r.kind).toBe("xlsx");
    expect(r.fileName).toBe("baocao-doanhthu.xlsx");
  });
  it("explicit pdf filename", () => {
    const r = detectArtifactIntent("hãy lưu thành report.pdf");
    expect(r.kind).toBe("pdf");
    expect(r.fileName).toBe("report.pdf");
  });
  it("does NOT trigger on questions about formats", () => {
    expect(detectArtifactIntent("cách tạo file excel trong Python?").kind).toBeNull();
    expect(detectArtifactIntent("what is a pptx file?").kind).toBeNull();
    expect(detectArtifactIntent("làm thế nào để mở file docx?").kind).toBeNull();
  });
  it("does NOT trigger on normal chat", () => {
    expect(detectArtifactIntent("Chào bạn, hôm nay thời tiết thế nào?").kind).toBeNull();
    expect(detectArtifactIntent("Giải thích cho tôi différence giữa SQL và NoSQL").kind).toBeNull();
    expect(detectArtifactIntent("viết một hàm JavaScript đọc file CSV và parse dữ liệu").kind).toBeNull();
  });
  it("does not fire on short messages", () => {
    expect(detectArtifactIntent("làm slide").kind).toBeNull();
  });
  it("safe filename slugifies Vietnamese", () => {
    expect(safeFileName("Báo cáo Doanh thu Q2!!", "docx")).toBe("bao-cao-doanh-thu-q2.docx");
    expect(safeFileName("", "pdf")).toBe("artifact.pdf");
  });
});

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"title":"T"}')).toEqual({ title: "T" });
  });
  it("parses fenced JSON", () => {
    expect(extractJson('```json\n{"title":"T"}\n```')).toEqual({ title: "T" });
  });
  it("extracts JSON from surrounding prose", () => {
    expect(extractJson('Đây là kết quả:\n{"title":"T","slides":[]}\nHy vọng hữu ích!')).toEqual({ title: "T", slides: [] });
  });
  it("handles nested braces in strings", () => {
    expect(extractJson('{"text":"a } b"}')).toEqual({ text: "a } b" });
  });
  it("throws on no JSON", () => {
    expect(() => extractJson("không có json ở đây")).toThrow();
  });
});

describe("generators produce real files", () => {
  it("docx: valid zip (PK header) with content", async () => {
    const doc = documentSchema.parse({
      title: "Báo cáo thử nghiệm",
      subtitle: "Kiểm thử hệ thống artifact",
      blocks: [
        { type: "heading", level: 1, text: "Phần 1" },
        { type: "paragraph", text: "Nội dung đoạn văn đầu tiên với tiếng Việt." },
        { type: "bullets", items: ["Điểm một", "Điểm hai"] },
        { type: "table", columns: ["Cột A", "Cột B"], rows: [["1", "2"], ["3", "4"]] },
        { type: "pageBreak" },
        { type: "paragraph", text: "Sau trang mới." },
      ],
    });
    const g = await generateDocx(doc);
    expect(g.bytes.length).toBeGreaterThan(2000);
    expect(g.bytes[0]).toBe(0x50); // P
    expect(g.bytes[1]).toBe(0x4b); // K — zip magic
    expect(g.mimeType).toContain("wordprocessingml");
  });

  it("pptx: valid file with slides + notes", async () => {
    const p = presentationSchema.parse({
      title: "Kế hoạch 2026",
      subtitle: "Tổng quan chiến lược",
      slides: [
        { title: "Mục tiêu", bullets: ["Tăng 20% doanh thu", "Mở rộng thị trường"], notes: "Nhấn mạnh con số 20%" },
        { title: "Rủi ro", bullets: ["Cạnh tranh", "Chi phí"] },
      ],
    });
    const g = await generatePptx(p);
    expect(g.bytes.length).toBeGreaterThan(3000);
    expect(g.bytes[0]).toBe(0x50);
    expect(g.mimeType).toContain("presentationml");
  });

  it("xlsx: valid file with styled header", async () => {
    const sp = spreadsheetSchema.parse({
      title: "Dữ liệu",
      sheets: [{ name: "Sheet1", headers: ["Tên", "Tuổi"], rows: [["An", 30], ["Bình", 25]] }],
    });
    const g = await generateXlsx(sp);
    expect(g.bytes.length).toBeGreaterThan(2000);
    expect(g.bytes[0]).toBe(0x50);
    expect(g.mimeType).toContain("spreadsheetml");
  });

  it("pdf: valid file (%PDF header) with multiple blocks", async () => {
    const doc = documentSchema.parse({
      title: "Bao cao PDF",
      blocks: [
        { type: "paragraph", text: "Đoạn văn ".repeat(200) }, // forces pagination
        { type: "heading", level: 2, text: "Mục lớn" },
        { type: "table", columns: ["A", "B"], rows: [["x", "y"]] },
      ],
    });
    const g = await generatePdf(doc);
    expect(g.bytes.length).toBeGreaterThan(1500);
    expect(g.bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(g.mimeType).toBe("application/pdf");
  });

  it("markdown: proper structure", () => {
    const g = generateMarkdown(documentSchema.parse({
      title: "Tài liệu MD",
      blocks: [
        { type: "heading", level: 1, text: "Mục" },
        { type: "bullets", items: ["a", "b"] },
        { type: "table", columns: ["X", "Y"], rows: [["1", "2"]] },
      ],
    }));
    const s = g.bytes.toString("utf8");
    expect(s).toContain("# Tài liệu MD");
    expect(s).toContain("## Mục");
    expect(s).toContain("- a");
    expect(s).toContain("| X | Y |");
  });

  it("csv: escaping and CRLF", () => {
    const g = generateCsv({ columns: ["name", "note"], rows: [["An", 'có "dấu nháy"'], ["B", "phẩy, ok"]] });
    const s = g.bytes.toString("utf8");
    expect(s.split("\r\n").length).toBe(3);
    expect(s).toContain('An,"có ""dấu nháy"""');
    expect(s).toContain('B,"phẩy, ok"');
    expect(s.startsWith("name,note")).toBe(true);
  });
});
