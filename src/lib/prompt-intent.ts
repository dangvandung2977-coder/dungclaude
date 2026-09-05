// Prompt Intent Detector & Dispatcher
// Identifies when a user asks to write/create a prompt (Vietnamese + English)
// and handles extraction of generated prompts to populate the Composer input.

function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Checks whether a user message expresses intent to write, generate, or craft a prompt.
 */
export function isPromptCreationRequest(message: string): boolean {
  if (!message || message.trim().length < 4) return false;
  const raw = message.trim();
  const lower = raw.toLowerCase();
  const plain = stripAccents(lower);

  // If the user is asking an informational question about what a prompt/prompt engineering is,
  // it is NOT a request to create a prompt
  const isQuestionAboutPrompt =
    /\b(la gi|là gì|khai niem|khái niệm|giai thich|giải thích|the nao|thế nào|nghia la|nghĩa là|dinh nghia|định nghĩa|what is|how does|explain)\b/i.test(plain);
  const hasExplicitCreationVerb = /\b(viet|tao|soan|sinh|generate|write|craft|create|make|build)\b/i.test(plain);

  if (isQuestionAboutPrompt && !hasExplicitCreationVerb) {
    return false;
  }

  // Action verbs and patterns that specifically indicate creating or crafting a prompt
  const actionPatterns = [
    /\b(viet|tao|soan|sinh|lam|generate|write|craft|create|make|build|cho|xin|can|chuan bi)\b.*?\b(prompt|prompts|pormpt|promt|promp|cau lenh|câu lệnh)\b/i,
    /\b(prompt|pormpt|promt|promp|cau lenh|câu lệnh)\b.*?\b(de |cho |ve |ve tranh|tao anh|chup anh|video|viet |code|game|web|app|cai thien|nang cap|midjourney|dall-e|sd|stablediffusion|flux|gemini|claude|chatgpt)/i,
    /\b(cho toi|cho minh|cho mình|cho tao|give me|suggest|goi y|gợi ý|viet ho|làm hộ)\b.*?\b(prompt|pormpt|promt|promp|câu lệnh|cau lenh)\b/i,
    /\b(midjourney|flux|dall-e|stable diffusion|chatgpt|claude)\s+(prompt|pormpt|promt|promp|câu lệnh|cau lenh)\b/i,
    /\b(prompt|pormpt|promt|promp)\s*:\s*[^\n\r]+/i,
    /\b(t bảo prompt|prompt thi|prompt thì|dua prompt|đưa prompt|de prompt|để prompt|prompt la file|prompt là file|file md|code block|van ko cho|vẫn ko cho|khong vao code block|không vào code block|cho vao code block|cho vào code block|khong dua vao|không đưa vào|phan chia|phân chia|coppy|copy)\b/i,
  ];

  return actionPatterns.some((pattern) => pattern.test(plain) || pattern.test(lower));
}

/**
 * Extracts the core ready-to-use prompt from an AI assistant's response.
 */
export function extractGeneratedPrompt(responseContent: string): string | null {
  if (!responseContent || !responseContent.trim()) return null;
  const content = responseContent.trim();

  // 1. Explicit prompt code block with 3 or more backticks (e.g. ````markdown:prompt.md or ```markdown:prompt.md or ```prompt)
  // Handles nested code fences gracefully by matching corresponding closing fences or the true final closing fence.
  const promptBlockRegex = /(?:^|\n)[ \t]*(`{3,})(?:((?:prompt|pormpt|promt|promp|systemprompt)\b[^\n\r]*)|(?:markdown|md|text|txt)?:([^\n\r]*(?:prompt|pormpt|promt)[^\n\r]*))\r?\n([\s\S]*)/i;
  const promptBlockMatch = promptBlockRegex.exec(content);
  if (promptBlockMatch) {
    const fenceTicks = promptBlockMatch[1];
    const afterHeader = promptBlockMatch[4];

    if (fenceTicks.length >= 4) {
      const closeRegex = new RegExp(`(?:^|\\n)[ \\t]*\`{${fenceTicks.length},}[ \\t]*(?:\\r?\\n|$)`);
      const closeMatch = closeRegex.exec(afterHeader);
      if (closeMatch) {
        return afterHeader.slice(0, closeMatch.index).trim();
      }
      return afterHeader.trim();
    }

    // Outer fence had 3 backticks: handle possible nested 3-backtick code fences
    const fenceRegex = /(?:^|\n)[ \t]*(`{3,})[^\n\r]*/g;
    const fences: { index: number; line: string }[] = [];
    let fm: RegExpExecArray | null;
    while ((fm = fenceRegex.exec(afterHeader)) !== null) {
      fences.push({
        index: fm.index + (fm[0].startsWith("\n") ? 1 : 0),
        line: fm[0].trim(),
      });
    }

    if (fences.length === 1 && /^`{3,}\s*$/.test(fences[0].line)) {
      return afterHeader.slice(0, fences[0].index).trim();
    } else if (fences.length > 1) {
      // Find the last bare closing fence (```)
      const lastClosing = [...fences].reverse().find((f) => /^`{3,}\s*$/.test(f.line));
      const closingIndex = lastClosing ? lastClosing.index : fences[fences.length - 1].index;
      const extracted = afterHeader.slice(0, closingIndex).trim();
      if (extracted.length > 0) {
        return extracted;
      }
    } else if (fences.length === 0 && afterHeader.trim().length > 0) {
      return afterHeader.trim();
    }
  }

  // 1.8. Delimited by start/end markers (e.g. "▶️ PROMPT BẮT ĐẦU ... ⏹️ PROMPT KẾT THÚC")
  const startMarkerRegex = /(?:^|\n)(?:---[ \t]*\r?\n+)?(?:[ \t]*(?:[#*~_`>▶️🚀📌🎯💡👉-]*\s*)*(?:(?:PROMPT|CÂU LỆNH)\s*(?:BẮT ĐẦU|START|BEGIN)|(?:BẮT ĐẦU|START|BEGIN)\s*(?:PROMPT|CÂU LỆNH))[^\n\r]*)\r?\n+([\s\S]+)$/i;
  const startMatch = startMarkerRegex.exec(content);
  if (startMatch) {
    let candidate = startMatch[1].trim();
    const endMarkerRegex = /(?:^|\n)[ \t]*(?:[#*~_`>⏹️🛑🔚👉-]*\s*)*(?:(?:PROMPT|CÂU LỆNH)\s*(?:KẾT THÚC|END|FINISH|STOP)|(?:KẾT THÚC|END|FINISH|STOP)\s*(?:PROMPT|CÂU LỆNH))[^\n\r]*(?:\r?\n+|$)/i;
    const endMatch = endMarkerRegex.exec(candidate);
    if (endMatch) {
      candidate = candidate.slice(0, endMatch.index).trim();
    }
    candidate = candidate.replace(
      /(?:\n\s*\n|\n)(?:Hy vọng|Chúc bạn|Nếu bạn|Bạn có thể|Let me know|Hope this helps|Feel free to)[\s\S]*$/i,
      ""
    ).trim();
    if (candidate.length >= 20) {
      return candidate;
    }
  }

  // 2. Scan all code blocks
  const codeBlocks: { lang: string; meta: string; code: string }[] = [];
  const codeBlockRegex = /(`{3,})([a-zA-Z0-9_-]+)?(?::([^\s\n\r]+)|[ \t]+([^\n\r]+))?\r?\n([\s\S]*?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = codeBlockRegex.exec(content)) !== null) {
    const lang = (m[2] || "").toLowerCase().trim();
    const meta = (m[3] || m[4] || "").toLowerCase().trim();
    const code = m[5].trim();
    if (code) {
      codeBlocks.push({ lang, meta, code });
    }
  }

  // If any codeblock has filename or meta containing "prompt", e.g. prompt.md
  const promptFileBlock = codeBlocks.find(
    (b) => b.meta.includes("prompt") || b.meta.includes("pormpt") || b.lang === "prompt" || b.lang === "pormpt" || b.lang === "systemprompt"
  );
  if (promptFileBlock && promptFileBlock.code) {
    return promptFileBlock.code;
  }

  // If any codeblock is labeled text, txt, md, markdown
  const textBlock = codeBlocks.find((b) =>
    ["prompt", "text", "txt", "md", "markdown", ""].includes(b.lang)
  );
  if (textBlock && textBlock.code) {
    return textBlock.code;
  }

  // If there is exactly one code block in the entire response, that's likely the prompt
  if (codeBlocks.length === 1) {
    return codeBlocks[0].code;
  }

  // 3. Look for full structured multi-line prompt starting with PROMPT: or # PROMPT:
  const fullStructuredMatch = /(?:^|\n)(?:#+\s*)?(?:PROMPT|Prompt|CÂU LỆNH|Câu lệnh)\s*:[ \t]*([^\n\r]+)([\s\S]*)$/i.exec(content);
  if (fullStructuredMatch) {
    const title = fullStructuredMatch[1].trim();
    let body = (fullStructuredMatch[2] || "").trim();

    // Strip out common conversational outros if present at the end
    body = body.replace(
      /(?:\n\s*\n|\n)(?:Hy vọng|Chúc bạn|Nếu bạn|Bạn có thể|Let me know|Hope this helps|Feel free to)[\s\S]*$/i,
      ""
    ).trim();

    if (body.length > 20) {
      return `PROMPT: ${title}\n\n${body}`.trim();
    }
    if (title.length > 10) {
      return title.replace(/^["'«“`*]+|["'»”`*]+$/g, "").trim();
    }
  }

  // 3.5. Look for prompt section separated by horizontal divider (---) or heading (### Prompt / Prompt on newline):
  // e.g. "Dưới đây là prompt...\n\n---\n\nPrompt\n\nHãy xây dựng game Flappy Bird..."
  const sectionDividerMatch = /(?:^|\n)(?:---[ \t]*\r?\n+)?(?:[ \t]*(?:#{1,4}\s+|\*\*)?(?:PROMPT|Prompt|CÂU LỆNH|Câu lệnh)(?:\*\*)?\s*\r?\n+)([\s\S]+)$/i.exec(content);
  if (sectionDividerMatch) {
    let body = sectionDividerMatch[1].trim();
    body = body.replace(
      /(?:\n\s*\n|\n)(?:Hy vọng|Chúc bạn|Nếu bạn|Bạn có thể|Let me know|Hope this helps|Feel free to)[\s\S]*$/i,
      ""
    ).trim();
    if (body.length > 20) {
      return body;
    }
  }

  // 4. Look for labeled prompt lines: **Prompt:** "..." or **Prompt**: ... or Prompt: ...
  const labelSingleLine = /(?:^|\n)[*#_`\s]*(?:Prompt|Prompt gợi ý|Gợi ý prompt|Prompt mẫu|Câu lệnh)[*#_`\s]*:[*#_`\s]*([^\n\r]+)/i.exec(content);
  if (labelSingleLine) {
    const cleaned = labelSingleLine[1].trim().replace(/^["'«“`*]+|["'»”`*]+$/g, "").trim();
    if (cleaned.length > 10) return cleaned;
  }

  // Multi-line labeled prompt
  const labelMultiLine = /(?:^|\n)[*#_`\s]*(?:Prompt|Prompt gợi ý|Gợi ý prompt|Prompt mẫu|Câu lệnh)[*#_`\s]*:[*#_`\s]*\r?\n([\s\S]+?)(?:\n\s*\n|$)/i.exec(content);
  if (labelMultiLine) {
    const cleaned = labelMultiLine[1].trim().replace(/^["'«“`*]+|["'»”`*]+$/g, "").trim();
    if (cleaned.length > 10) return cleaned;
  }

  // Blockquote prompt
  const quoteMatch = /(?:^|\n)>\s*([^\n\r]+(?:\r?\n>[^\n\r]+)*)/.exec(content);
  if (quoteMatch) {
    const unquoted = quoteMatch[1].replace(/^>\s*/gm, "").trim().replace(/^["'«“`]+|["'»”`]+$/g, "").trim();
    if (unquoted.length > 15) return unquoted;
  }

  // Fallback: If there are multiple codeblocks, return the first one
  if (codeBlocks.length > 0) {
    return codeBlocks[0].code;
  }

  return null;
}

export interface InsertTextOptions {
  mode?: "replace" | "append";
  focus?: boolean;
  onlyIfEmpty?: boolean;
}

/**
 * Dispatches an event to insert text into the active Composer input box.
 */
export function insertTextToComposer(text: string, options?: InsertTextOptions): void {
  if (typeof window === "undefined" || !text) return;
  window.dispatchEvent(
    new CustomEvent("composer:set-text", {
      detail: {
        text: text.trim(),
        mode: options?.mode ?? "replace",
        focus: options?.focus !== false,
        onlyIfEmpty: Boolean(options?.onlyIfEmpty),
      },
    })
  );
}
