export type MemoryScope = "global" | "project" | "conversation";

export type MemoryCategory =
  | "preference"
  | "technical"
  | "architecture"
  | "constraint"
  | "fact"
  | "decision"
  | "rule"
  | "general";

export type MemoryStatus = "current" | "superseded" | "archived";

export interface MemoryRecord {
  id: string;
  userId: string;
  projectId?: string | null;
  conversationId?: string | null;
  scope: MemoryScope;
  category: MemoryCategory;
  key: string;
  content: string;
  importance: number; // 0.0 to 1.0
  confidence: number; // 0.0 to 1.0
  status: MemoryStatus;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  embedding?: number[] | null;
  similarity?: number;
  lastAccessedAt: string;
  accessCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRoutingDecision {
  needMemory: boolean;
  needGlobalUserMemory: boolean;
  needProjectMemory: boolean;
  needConversationSummary: boolean;
  needSemanticSearch: boolean;
  isExplicitCommand?: boolean;
  explicitAction?: "remember" | "forget" | "save_to_project";
  explicitContent?: string;
  reasons: string[];
}

export interface ContextMemoryComposition {
  systemPrompt: string;
  globalUserMemories: MemoryRecord[];
  projectMemories: MemoryRecord[];
  conversationSummary?: string | null;
  retrievedMemories: MemoryRecord[];
  tokenEstimate: {
    system: number;
    globalUser: number;
    project: number;
    summary: number;
    retrieved: number;
    messages: number;
    total: number;
  };
}
