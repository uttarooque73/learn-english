export type SavedVocabulary = {
  id: string;
  phrase: string;
  meaning: string;
  example: string;
  savedAt: string;
  status?: VocabularyStatus;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  reviewCount?: number;
};

export type VocabularyStatus = "learning" | "familiar" | "mastered";

export type PracticeMessage = { role: "user" | "assistant"; content: string };

export type PracticeSession = {
  id: string;
  scenario: string;
  startedAt: string;
  updatedAt: string;
  durationSeconds: number;
  messageCount: number;
  learnerMessages: string[];
  messages?: PracticeMessage[];
};

function createId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const VOCABULARY_KEY = "speakup:vocabulary:v1";
const SESSIONS_KEY = "speakup:sessions:v1";

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, value: T[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
}

export function getVocabulary(): SavedVocabulary[] {
  return readList<SavedVocabulary>(VOCABULARY_KEY).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveVocabulary(item: Omit<SavedVocabulary, "id" | "savedAt">): SavedVocabulary {
  const items = getVocabulary();
  const normalized = item.phrase.trim().toLocaleLowerCase();
  const existing = items.find((entry) => entry.phrase.trim().toLocaleLowerCase() === normalized);
  if (existing) return existing;
  const saved: SavedVocabulary = { ...item, status: "learning", id: createId(), savedAt: new Date().toISOString() };
  writeList(VOCABULARY_KEY, [saved, ...items]);
  return saved;
}

export function updateVocabularyStatus(id: string, status: VocabularyStatus) {
  const items = getVocabulary().map((item) => item.id === id ? { ...item, status } : item);
  writeList(VOCABULARY_KEY, items);
}

export type VocabularyReviewRating = "again" | "good" | "easy";

export function reviewVocabulary(id: string, rating: VocabularyReviewRating, reviewedAt = new Date()): SavedVocabulary | undefined {
  const intervals: Record<VocabularyReviewRating, number> = { again: 1, good: 3, easy: 7 };
  const items = getVocabulary();
  let reviewed: SavedVocabulary | undefined;
  const updated = items.map((item) => {
    if (item.id !== id) return item;
    const nextReview = new Date(reviewedAt);
    nextReview.setDate(nextReview.getDate() + intervals[rating]);
    reviewed = {
      ...item,
      lastReviewedAt: reviewedAt.toISOString(),
      nextReviewAt: nextReview.toISOString(),
      reviewCount: (item.reviewCount ?? 0) + 1,
      status: rating === "easy" ? "mastered" : rating === "good" ? "familiar" : "learning",
    };
    return reviewed;
  });
  if (reviewed) writeList(VOCABULARY_KEY, updated);
  return reviewed;
}

export function getDueVocabulary(now = new Date()): SavedVocabulary[] {
  return getVocabulary().filter((item) => !item.nextReviewAt || !Number.isFinite(Date.parse(item.nextReviewAt)) || Date.parse(item.nextReviewAt) <= now.getTime());
}

export function removeVocabulary(id: string) {
  writeList(VOCABULARY_KEY, getVocabulary().filter((item) => item.id !== id));
}

export function getSessions(): PracticeSession[] {
  return readList<PracticeSession>(SESSIONS_KEY).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upsertSession(session: PracticeSession) {
  const sessions = getSessions();
  const normalizedSession = {
    ...session,
    learnerMessages: session.learnerMessages.slice(-40),
    messages: session.messages?.slice(-100),
  };
  const index = sessions.findIndex((item) => item.id === session.id);
  if (index >= 0) sessions[index] = normalizedSession;
  else sessions.unshift(normalizedSession);
  writeList(SESSIONS_KEY, sessions.slice(0, 100));
}
