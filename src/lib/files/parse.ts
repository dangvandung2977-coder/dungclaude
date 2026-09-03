// Extract readable text from upload bytes. PDF/DOCX get a best-effort parse;
// text-like formats are read directly. Images/video return null (sent as vision).
export async function parseUploadBytes(buf: Buffer, mime: string, fileName: string): Promise<string | null> {
  try {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
    if (mime.startsWith("image/") || mime.startsWith("video/")) return null;
    if ([".txt", ".md", ".markdown", ".csv", ".json", ".ts", ".tsx", ".js", ".jsx", ".py", ".html", ".css"].includes(ext) || mime.startsWith("text/") || mime === "application/json") {
      return buf.slice(0, 200000).toString("utf8");
    }
    if (mime === "application/pdf" || ext === ".pdf") {
      const bin = buf.toString("latin1");
      const texts: string[] = [];
      const re = /\((?:[^()\\]|\\.)*\)\s*Tj/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(bin)) && texts.length < 5000) {
        texts.push(m[0].slice(1, m[0].lastIndexOf(")")).replace(/\\([()\\])/g, "$1"));
      }
      const joined = texts.join(" ").replace(/\s+/g, " ").trim();
      return joined.length > 20 ? joined.slice(0, 60000) : `[PDF ${fileName}: không trích xuất được text, hãy dùng file text hoặc cấu hình parser đầy đủ.]`;
    }
    if (ext === ".docx") {
      return `[DOCX ${fileName}: đã lưu. Nội dung sẽ được lập chỉ mục đầy đủ khi admin bật parser DOCX.]`;
    }
    return null;
  } catch (e) {
    return `[Lỗi đọc file ${fileName}: ${e instanceof Error ? e.message : String(e)}]`;
  }
}
