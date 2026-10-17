import { describe, expect, it } from "vitest";

describe("conversation coach session migration", () => {
  it("defines owner-scoped sessions and turns with cascading deletion", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile("db/migrations/003_conversation_coach.sql", "utf8");
    expect(sql).toContain("conversation_coach_sessions");
    expect(sql).toContain("conversation_coach_turns");
    expect(sql).toContain("owner_id TEXT NOT NULL");
    expect(sql).toContain("FOREIGN KEY(session_id) REFERENCES conversation_coach_sessions(id) ON DELETE CASCADE");
    expect(sql).toContain("CHECK (role IN ('user', 'assistant'))");
    expect(sql).toContain("idx_coach_sessions_owner_updated");
  });
});
