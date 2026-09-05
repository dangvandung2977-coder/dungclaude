// Pure, client-safe image intent recognition
// No node:* or server dependencies, can be safely used in client components and server routes.

export function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Detects if a user message in chat is asking to create/draw an image.
 * Returns { isImage: boolean; prompt: string }
 */
export function isImageGenerationRequest(content: string): { isImage: boolean; prompt: string } {
  if (!content || !content.trim()) return { isImage: false, prompt: "" };
  const raw = content.trim();

  // Explicit slash command or tag: /image, /draw, /taoanh, /ve
  const slashMatch = raw.match(/^\/(?:image|draw|img|taoanh|ve)\s+(.+)/i);
  if (slashMatch && slashMatch[1]) {
    return { isImage: true, prompt: slashMatch[1].trim() };
  }

  const plain = stripAccents(raw.toLowerCase());

  // Disqualifications: Asking specifically to write a prompt, asking code, or explanation
  const isPromptRequest =
    /\b(viet|soan|goi y|cho xin|xin|tao|lam)\s+(?:mot\s+)?(?:prompt|cau lenh)\b/i.test(plain) ||
    /\b(prompt|cau lenh)\s+(?:ve|tao anh|chup anh|midjourney|flux|dall-e|sdxl)/i.test(plain);
  const isQuestionOrCode =
    /\b(la gi|the nao|nhu the nao|huong dan|cach|huong dan cach|viet code|code|lap trinh|api|thu vien)\s+(?:ve|tao anh|sinh anh|image)/i.test(plain);

  if (isPromptRequest || isQuestionOrCode) {
    return { isImage: false, prompt: "" };
  }

  // 1. Comprehensive prefix regex covering:
  // "tạo cho t hình ảnh về...", "vẽ cho tao...", "tạo ảnh...", "vẽ một bức tranh...",
  // "sinh ảnh...", "làm cho mình tấm ảnh...", "generate an image of...", "draw me a..."
  const prefixRegex = /^(?:hãy\s+|please\s+)?(?:tạo|vẽ|sinh|làm|thiết\s+kế|phác\s+họa|xuất|render|draw|paint|generate|create|make|illustrate)\s+(?:(?:cho|giúp|hộ|giùm)\s+(?:tôi|t|tao|mình|em|anh|chị|bạn|mk|tớ|me|us)\s+)?(?:(?:hình\s+ảnh|bức\s+ảnh|tấm\s+ảnh|bức\s+hình|ảnh|bức\s+tranh|tranh|hình|chân\s+dung|phong\s+cảnh|image|picture|photo|illustration|artwork)\s+)?(?:(?:về|với|là|of|about)\s+)?(.+)$/i;

  const match1 = raw.match(prefixRegex);
  if (match1 && match1[1]) {
    let p = match1[1].trim();
    p = p.replace(/^(?:về|với|là|of|about)\s+/i, "").trim();
    if (p.length >= 2) {
      return { isImage: true, prompt: p };
    }
  }

  // 2. Direct "vẽ / draw / paint" prefix
  const drawRegex = /^(?:hãy\s+|please\s+)?(?:vẽ|draw|paint)\s+(.+)$/i;
  const match2 = raw.match(drawRegex);
  if (match2 && match2[1]) {
    let p = match2[1].trim();
    p = p.replace(/^(?:cho\s+(?:tôi|t|tao|mình|em|anh|chị|bạn|mk|tớ|me|us)\s+)?(?:bức\s+tranh|bức\s+ảnh|hình\s+ảnh|ảnh)?\s*/i, "").trim();
    p = p.replace(/^(?:về|với|là|of|about)\s+/i, "").trim();
    if (p.length >= 2) {
      return { isImage: true, prompt: p };
    }
  }

  // 3. Sentence with strong image intent phrase anywhere:
  // e.g. "tạo cho t hình ảnh về con chó...", "vẽ giúp tôi bức ảnh..."
  const innerRegex = /(?:tạo|vẽ|sinh|thiết\s+kế)\s+(?:cho\s+(?:tôi|t|tao|mình|em|anh|chị|bạn|mk|tớ)\s+)?(?:hình\s+ảnh|bức\s+ảnh|tấm\s+ảnh|ảnh|bức\s+tranh|tranh)\s+(?:về|với|là)?\s*(.+)/i;
  const match3 = raw.match(innerRegex);
  if (match3 && match3[1]) {
    let p = match3[1].trim();
    p = p.replace(/^(?:về|với|là)\s+/i, "").trim();
    if (p.length >= 2) {
      return { isImage: true, prompt: p };
    }
  }

  // 4. Accent-stripped fallback check
  const plainPrefixRegex = /^(?:hay\s+|please\s+)?(?:tao|ve|sinh|lam|thiet\s+ke|phac\s+hoa|xuat|render|draw|paint|generate|create|make|illustrate)\s+(?:(?:cho|giup|ho|gium)\s+(?:toi|t|tao|minh|em|anh|chi|ban|mk|to|me|us)\s+)?(?:(?:hinh\s+anh|buc\s+anh|tam\s+anh|buc\s+hinh|anh|buc\s+tranh|tranh|hinh|chan\s+dung|phong\s+canh|image|picture|photo)\s+)?(?:(?:ve|voi|la|of|about)\s+)?(.+)$/i;
  const matchPlain = plain.match(plainPrefixRegex);
  if (matchPlain && matchPlain[1]) {
    // Cut original string from the relative position
    const cutPos = raw.length - matchPlain[1].length;
    let p = raw.slice(cutPos).trim();
    p = p.replace(/^(?:về|với|là|ve|voi|la|of|about)\s+/i, "").trim();
    if (p.length >= 2) {
      return { isImage: true, prompt: p };
    }
  }

  return { isImage: false, prompt: "" };
}
