// Memory Router & Relevance Gate
// Low Token Cost + Low Latency + High Relevance.
// Skips memory lookup for trivial questions; routes contextual/project queries intelligently.
import type { MemoryRoutingDecision } from "@/types/memory";

const TRIVIAL_PATTERNS = [
  /^(hi|hello|hey|chào|xin chào|good morning|good afternoon|good evening)\b[!.? ]*$/i,
  /^(thanks|thank you|cảm ơn|ok|oke|okie|yep|yes|no|được|rồi)\b[!.? ]*$/i,
  /^(viết|write)\s+(hello world|chương trình hello world)\b/i,
  /^(\d+\s*[\+\-\*\/\^]\s*\d+\s*)+$/i, // simple math
];

const CONTEXT_SIGNALS = [
  /\b(continue|tiếp tục|làm tiếp|triển khai tiếp)\b/i,
  /\b(previous|earlier|yesterday|hôm qua|lần trước|trước đó|lúc nãy|vừa rồi)\b/i,
  /\b(as discussed|we discussed|đã bàn|đã thống nhất|chúng ta đã nói)\b/i,
  /\b(the project|dự án|project này|hệ thống|our architecture|kiến trúc)\b/i,
  /\b(as before|như trước|như cũ|giống lúc nãy)\b/i,
  /\b(what database|dùng database gì|dùng db gì|dùng framework gì|stack gì)\b/i,
  /\b(that code|đoạn code đó|file đó|hàm đó|bug đó|lỗi đó)\b/i,
  /\b(my preference|tôi thích|tôi muốn viết bằng|gu của tôi)\b/i,
  /\b(quy tắc|rule|quy chuẩn|convention)\b/i,
];

const EXPLICIT_REMEMBER = [
  /^(hãy ghi nhớ|ghi nhớ|nhớ rằng|remember that|remember this|save to project|lưu vào project)[:\s]+(.+)$/i,
  /^(tôi thích|tôi luôn muốn|từ giờ hãy nhớ)[:\s]+(.+)$/i,
];

const EXPLICIT_FORGET = [
  /^(quên rằng|hãy quên|forget that|do not remember)[:\s]+(.+)$/i,
];

export function routeMemory(input: {
  message: string;
  projectId?: string | null;
  historyLength: number;
}): MemoryRoutingDecision {
  const msg = input.message.trim();
  const reasons: string[] = [];

  // 1. Check for explicit memory commands
  for (const pat of EXPLICIT_REMEMBER) {
    const m = msg.match(pat);
    if (m && m[2]) {
      const isProjectSave = /save to project|lưu vào project/i.test(msg);
      return {
        needMemory: true,
        needGlobalUserMemory: !isProjectSave,
        needProjectMemory: isProjectSave || Boolean(input.projectId),
        needConversationSummary: false,
        needSemanticSearch: false,
        isExplicitCommand: true,
        explicitAction: isProjectSave ? "save_to_project" : "remember",
        explicitContent: m[2].trim(),
        reasons: ["Explicit remember command detected"],
      };
    }
  }

  for (const pat of EXPLICIT_FORGET) {
    const m = msg.match(pat);
    if (m && m[2]) {
      return {
        needMemory: true,
        needGlobalUserMemory: true,
        needProjectMemory: Boolean(input.projectId),
        needConversationSummary: false,
        needSemanticSearch: true,
        isExplicitCommand: true,
        explicitAction: "forget",
        explicitContent: m[2].trim(),
        reasons: ["Explicit forget command detected"],
      };
    }
  }

  // 2. Deterministic Trivial Gate
  for (const pat of TRIVIAL_PATTERNS) {
    if (pat.test(msg)) {
      return {
        needMemory: false,
        needGlobalUserMemory: false,
        needProjectMemory: false,
        needConversationSummary: false,
        needSemanticSearch: false,
        reasons: ["Trivial greeting or simple formula — skipped memory lookup to save tokens & latency"],
      };
    }
  }

  // 3. Check Contextual Signals
  let hasContextSignal = false;
  for (const pat of CONTEXT_SIGNALS) {
    if (pat.test(msg)) {
      hasContextSignal = true;
      reasons.push(`Matched contextual signal: ${pat.source}`);
      break;
    }
  }

  // 4. Decision synthesis
  const hasProject = Boolean(input.projectId);
  const isLongConversation = input.historyLength >= 6;

  // If user is inside a project, we always load stable project rules & architecture facts
  const needProjectMemory = hasProject;

  // Semantic search is triggered when contextual signals exist or user asks question about project/tech
  const needSemanticSearch = hasContextSignal || (hasProject && /\?|gì|như thế nào|sao|how|what|why|where/i.test(msg));

  // Global user memory (preferences, coding style) is relevant for substantive coding or architecture tasks
  const needGlobalUserMemory = hasContextSignal || msg.length > 25 || /\b(code|build|tạo|thiết kế|viết|implement|fix)\b/i.test(msg);

  const needMemory = needProjectMemory || needSemanticSearch || needGlobalUserMemory || isLongConversation;

  if (needSemanticSearch) reasons.push("Semantic search required for query context");
  if (needProjectMemory) reasons.push("Active project memory context loaded");
  if (isLongConversation) reasons.push("Long conversation summary enabled");

  return {
    needMemory,
    needGlobalUserMemory,
    needProjectMemory,
    needConversationSummary: isLongConversation,
    needSemanticSearch,
    reasons: reasons.length ? reasons : ["General context request"],
  };
}
