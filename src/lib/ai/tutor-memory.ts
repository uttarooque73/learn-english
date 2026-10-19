import { randomUUID } from "node:crypto";
import { ensurePersistenceSchema, getDatabase } from "@/lib/database";

export type TutorMessage = { role: "user" | "assistant"; content: string };
export type TutorConversationSummary = {
  id: string;
  title: string;
  goal: string;
  level: string;
  feedbackStyle: string;
  createdAt: string;
  updatedAt: string;
};
export type TutorConversation = {
  id: string;
  title: string;
  goal: string;
  level: string;
  feedbackStyle: string;
  messages: TutorMessage[];
  createdAt: string;
  updatedAt: string;
};

type TutorConversationRow = {
  id: string;
  title: string;
  goal: string;
  level: string;
  feedbackStyle: string;
  messagesJson: string;
  createdAt: string;
  updatedAt: string;
};

const MAX_STORED_MESSAGES = 40;
const MAX_STORED_MESSAGE_LENGTH = 4_000;

function rowToConversation(row: TutorConversationRow): TutorConversation {
  let messages: TutorMessage[] = [];
  try {
    const parsed: unknown = JSON.parse(row.messagesJson);
    if (Array.isArray(parsed)) {
      messages = parsed.filter((item): item is TutorMessage =>
        !!item && typeof item === "object" &&
        ((item as TutorMessage).role === "user" || (item as TutorMessage).role === "assistant") &&
        typeof (item as TutorMessage).content === "string" &&
        (item as TutorMessage).content.length <= MAX_STORED_MESSAGE_LENGTH
      ).slice(-MAX_STORED_MESSAGES);
    }
  } catch {
    messages = [];
  }
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    level: row.level,
    feedbackStyle: row.feedbackStyle,
    messages,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function selectConversation(ownerId: string, conversationId?: string): TutorConversationRow | undefined {
  ensurePersistenceSchema();
  const database = getDatabase();
  if (conversationId) {
    return database.prepare(`
      SELECT id, title, goal, level, feedback_style AS feedbackStyle,
        messages_json AS messagesJson, created_at AS createdAt, updated_at AS updatedAt
      FROM tutor_conversations WHERE owner_id = ? AND id = ?
    `).get(ownerId, conversationId) as TutorConversationRow | undefined;
  }
  return database.prepare(`
    SELECT id, title, goal, level, feedback_style AS feedbackStyle,
      messages_json AS messagesJson, created_at AS createdAt, updated_at AS updatedAt
    FROM tutor_conversations WHERE owner_id = ?
    ORDER BY updated_at DESC, created_at DESC LIMIT 1
  `).get(ownerId) as TutorConversationRow | undefined;
}

export function listTutorConversations(ownerId: string, limit = 10): TutorConversationSummary[] {
  ensurePersistenceSchema();
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 20)) : 10;
  return getDatabase().prepare(`
    SELECT id, title, goal, level, feedback_style AS feedbackStyle,
      created_at AS createdAt, updated_at AS updatedAt
    FROM tutor_conversations WHERE owner_id = ?
    ORDER BY updated_at DESC, created_at DESC LIMIT ?
  `).all(ownerId, safeLimit) as TutorConversationSummary[];
}

export function getTutorConversation(ownerId: string, conversationId?: string): TutorConversation | null {
  const row = selectConversation(ownerId, conversationId);
  return row ? rowToConversation(row) : null;
}

export function createTutorConversation(
  ownerId: string,
  options: { goal: string; level: string; feedbackStyle: string },
): TutorConversation {
  ensurePersistenceSchema();
  const id = randomUUID();
  const database = getDatabase();
  database.prepare(`
    INSERT INTO tutor_conversations (id, owner_id, title, goal, level, feedback_style, messages_json)
    VALUES (?, ?, 'AI Tutor Session', ?, ?, ?, '[]')
  `).run(id, ownerId, options.goal, options.level, options.feedbackStyle);
  const conversation = getTutorConversation(ownerId, id);
  if (!conversation) throw new Error("Tutor conversation could not be created.");
  return conversation;
}

export function appendTutorTurn(
  ownerId: string,
  conversationId: string,
  turn: { userMessage: string; assistantMessage: string; goal: string; level: string; feedbackStyle: string },
): TutorConversation | null {
  ensurePersistenceSchema();
  const database = getDatabase();
  const update = database.transaction(() => {
    const row = selectConversation(ownerId, conversationId);
    if (!row) return false;
    const current = rowToConversation(row);
    const messages = [...current.messages,
      { role: "user" as const, content: turn.userMessage.slice(0, MAX_STORED_MESSAGE_LENGTH) },
      { role: "assistant" as const, content: turn.assistantMessage.slice(0, MAX_STORED_MESSAGE_LENGTH) },
    ].slice(-MAX_STORED_MESSAGES);
    const firstUserMessage = messages.find((message) => message.role === "user")?.content ?? "AI Tutor Session";
    const title = firstUserMessage.replace(/\s+/g, " ").trim().slice(0, 72) || "AI Tutor Session";
    database.prepare(`
      UPDATE tutor_conversations SET title = ?, goal = ?, level = ?, feedback_style = ?,
        messages_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE owner_id = ? AND id = ?
    `).run(title, turn.goal, turn.level, turn.feedbackStyle, JSON.stringify(messages), ownerId, conversationId);
    return true;
  });
  return update() ? getTutorConversation(ownerId, conversationId) : null;
}

export function deleteTutorConversation(ownerId: string, conversationId: string): boolean {
  ensurePersistenceSchema();
  return getDatabase().prepare(
    "DELETE FROM tutor_conversations WHERE owner_id = ? AND id = ?",
  ).run(ownerId, conversationId).changes > 0;
}
