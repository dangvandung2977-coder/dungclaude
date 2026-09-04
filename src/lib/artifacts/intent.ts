// Artifact Intent Router — heuristic (zero-token) detection of document/artifact
// requests in user messages (Vietnamese + English). Pure function, provider-independent.
export type ArtifactKind =
  | "docx" | "pptx" | "xlsx" | "pdf" | "md" | "csv" | "txt" | "json" | "html" | "py" | "zip";

export interface ArtifactIntent {
  kind: ArtifactKind | null;   // null = no artifact request
  fileName: string | null;     // explicit name if user gave one
  instruction: string;         // the user request, cleaned of artifact-trigger words
}

interface KindPattern {
  kind: ArtifactKind;
  // Vietnamese + English trigger words for the format
  words: string[];
  exts: string[];
}

const KIND_PATTERNS: KindPattern[] = [
  { kind: "docx", words: ["word", "tài liệu word", "tai lieu word", "docx"], exts: ["docx", "doc"] },
  { kind: "pptx", words: ["powerpoint", "slide", "bài thuyết trình", "bai thuyet trinh", "pptx", "ppt"], exts: ["pptx", "ppt"] },
  { kind: "xlsx", words: ["excel", "bảng tính", "bang tinh", "spreadsheet", "xlsx"], exts: ["xlsx", "xls"] },
  { kind: "pdf", words: ["pdf"], exts: ["pdf"] },
  { kind: "md", words: ["xuất markdown", "xuat markdown", "file markdown tải về"], exts: ["md", "markdown"] },
  { kind: "csv", words: ["tạo csv", "tao csv", "xuất csv", "xuat csv", "tệp csv tải về", "export csv"], exts: ["csv"] },
  {
    kind: "zip",
    words: [
      "dự án zip", "du an zip", "project zip", "tạo dự án zip", "tao du an zip",
      "tải dự án zip", "tai du an zip", "nén dự án zip", "nen du an zip",
      "gộp dự án vào zip", "gop du an vao zip", "gộp thành file zip", "gop thanh file zip",
      "source code zip", "mã nguồn zip", "ma nguon zip", "full project zip",
      "dự án lớn zip", "du an lon zip", "tạo file zip dự án", "tao file zip du an",
    ],
    exts: ["zip"],
  },
];

// Marks intent: the request must ask to create/export/generate a real file,
// not merely mention a format ("what is a pptx file?" is a CHAT question).
const ACTION_WORDS = [
  "tạo", "tao", "làm", "lam", "viết", "viet", "xuất", "xuat", "export",
  "generate", "create", "make", "build", "tạo lập", "soạn", "soan",
  "chuyển thành", "chuyen thanh", "convert", "đổi sang", "doi sang", "save as",
  "gộp", "gop", "nén", "nen", "đóng gói", "dong goi",
];

// Explicit filename patterns: "report.docx", "baocao.xlsx", "report.pdf", "project.zip"
const FILENAME_RE = /([\p{L}\p{N}_-]{1,60})\.(docx|doc|pptx|ppt|xlsx|xls|pdf|md|markdown|csv|zip)\b/giu;

function stripAccents(s: string): string {
  // ponytail: diacritic fold via NFD — covers vi/đ/ơ/ư without a lookup table
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

function findFileName(text: string): { name: string; ext: string } | null {
  FILENAME_RE.lastIndex = 0;
  const m = FILENAME_RE.exec(text);
  if (m) {
    const ext = m[2].toLowerCase();
    const raw = `${m[1].trim()}.${ext}`;
    return { name: raw, ext };
  }
  return null;
}

function extToKind(ext: string): ArtifactKind | null {
  const k = KIND_PATTERNS.find((p) => p.exts.includes(ext));
  return k?.kind ?? null;
}

export function detectArtifactIntent(message: string): ArtifactIntent {
  const text = message.trim();
  if (text.length < 15) return { kind: null, fileName: null, instruction: text };

  const lower = text.toLowerCase();
  const plain = stripAccents(lower);
  const hasAction = ACTION_WORDS.some((a) => plain.includes(stripAccents(a))) || ACTION_WORDS.some((a) => lower.includes(a));

  const isQuestion = /\?\s*$/.test(text) || /^(cách|cach|how|làm thế nào|lam the nao|làm sao|lam sao|giải thích|giai thich)\b/i.test(plain);
  const isCodeRequest = /\b(hàm|ham|function|script|code|đoạn code|doan code|chương trình|chuong trinh|lớp|class|module|api|thuật toán|thuat toan|sửa|fix|debug)\b/i.test(plain);

  // 1. Explicit filename wins — strongest signal ("tạo report.docx", "my-project.zip")
  const fn = findFileName(lower);
  if (fn) {
    const kind = extToKind(fn.ext);
    if (kind) {
      if (!isQuestion && (!isCodeRequest || kind === "zip")) {
        return { kind, fileName: fn.name, instruction: text };
      }
    }
    // Filename mentioned in a question or code context → plain chat
    if (kind) return { kind: null, fileName: null, instruction: text };
  }

  // 2. Format word + action word ("làm slide về X", "xuất word", "tạo dự án web ... zip")
  //    Normal code requests should NEVER create standalone file artifacts.
  if (hasAction && !isQuestion) {
    for (const p of KIND_PATTERNS) {
      const words = p.words.map((w) => ({ w, plain: stripAccents(w) }));
      const hit = words.some(
        ({ w, plain: pw }) => lower.includes(w) || plain.includes(pw) || plain.includes(w)
      );
      if (hit) {
        // If it is a coding request, only create a zip file if explicitly asked for a project / large project
        if (isCodeRequest) {
          if (p.kind === "zip") {
            const hasProject = /\b(dự án|du an|project|full stack|source code|mã nguồn|ma nguon)\b/i.test(plain);
            if (hasProject) {
              return { kind: "zip", fileName: null, instruction: text };
            }
          }
          // Normal code request -> plain chat
          continue;
        }
        return { kind: p.kind, fileName: null, instruction: text };
      }
    }
  }

  return { kind: null, fileName: null, instruction: text };
}

// Build a safe filename when user didn't give one: from a short title slug.
export function safeFileName(title: string, kind: ArtifactKind): string {
  const slug = stripAccents(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${slug || "artifact"}.${kind}`;
}

export const ARTIFACT_MIME: Record<ArtifactKind, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  md: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  html: "text/html; charset=utf-8",
  py: "text/x-python; charset=utf-8",
  zip: "application/zip",
};
