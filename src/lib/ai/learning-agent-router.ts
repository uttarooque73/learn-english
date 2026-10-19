export type LearningAgentId =
  | "grammar"
  | "vocabulary"
  | "pronunciation"
  | "writing"
  | "interview"
  | "workplace"
  | "conversation"
  | "tutor";

export type LearningAgent = {
  id: LearningAgentId;
  name: string;
  reason: string;
  instructions: string;
};

type AgentContext = {
  message: string;
  mode?: string;
  goal?: string;
  scenario?: string;
};

const AGENTS: Record<LearningAgentId, Omit<LearningAgent, "reason">> = {
  grammar: {
    id: "grammar",
    name: "Grammar Coach",
    instructions: "Act as a grammar specialist. Identify the most important grammar issue, explain the rule in plain language, show a corrected example, then give one short practice prompt. If the sentence is already correct, say so and offer a natural alternative only when useful.",
  },
  vocabulary: {
    id: "vocabulary",
    name: "Vocabulary Coach",
    instructions: "Act as a vocabulary specialist. Explain word meaning in context, give two natural examples, distinguish common usage or register where helpful, and finish with a quick recall question. Avoid long dictionary-style lists.",
  },
  pronunciation: {
    id: "pronunciation",
    name: "Pronunciation Coach",
    instructions: "Act as a pronunciation coach. Break difficult words into syllables, mark the stressed syllable in uppercase, give a simple sound hint and a short repeat-after-me drill. Do not claim to have heard audio unless audio/transcription was actually supplied.",
  },
  writing: {
    id: "writing",
    name: "Writing Coach",
    instructions: "Act as a supportive writing coach. Preserve the learner's meaning, provide a natural corrected version, explain at most two high-impact changes, and offer one alternative suited to the requested tone.",
  },
  interview: {
    id: "interview",
    name: "Interview Coach",
    instructions: "Act as an interview practice coach. Ask one realistic question at a time, help structure answers with a clear situation/action/result when relevant, and give specific feedback without inventing the learner's experience.",
  },
  workplace: {
    id: "workplace",
    name: "Workplace English Coach",
    instructions: "Act as a workplace English coach. Prefer concise, professional, natural phrasing for meetings, stand-ups, status updates, disagreements, and clarifying questions. Give a ready-to-use example and one practice turn.",
  },
  conversation: {
    id: "conversation",
    name: "Conversation Partner",
    instructions: "Act as a natural conversation partner. Respond to the learner's meaning first, keep the exchange moving with one relevant follow-up, and correct only when useful or requested.",
  },
  tutor: {
    id: "tutor",
    name: "Personal Tutor",
    instructions: "Act as a one-to-one English tutor. Address the learner's request directly, explain concepts clearly at their level, provide a practical example when useful, and end with one focused exercise or question.",
  },
};

const MATCHERS: Array<{ id: LearningAgentId; pattern: RegExp; reason: string }> = [
  { id: "pronunciation", pattern: /\b(pronounc\w*|say this word|how do i say|stress syllable|phonetic|sounds like)\b/i, reason: "The message asks for pronunciation or speech-sound help." },
  { id: "interview", pattern: /\b(interview|tell me about yourself|behavioral question|star method|hiring manager)\b/i, reason: "The message is about interview preparation." },
  { id: "workplace", pattern: /\b(stand[- ]?up|workplace|meeting|slack message|professional email|at work|manager|colleague|status update|work update)\b/i, reason: "The message needs practical workplace English." },
  { id: "vocabulary", pattern: /\b(meaning of|what does .+ mean|define|definition|synonym|antonym|vocabulary|word choice|use .+ in a sentence)\b/i, reason: "The message focuses on word meaning or vocabulary use." },
  { id: "grammar", pattern: /\b(grammar|tense|article|preposition|pronoun|verb form|subject[- ]verb|is this correct|correct my sentence|why is .+ wrong)\b/i, reason: "The message asks about grammar or sentence correctness." },
  { id: "writing", pattern: /\b(rewrite|rephrase|make this (more )?(natural|polite|professional|formal)|improve this sentence|proofread|correct this paragraph|write a paragraph)\b/i, reason: "The message requests sentence or writing improvement." },
];

export function chooseLearningAgent(context: AgentContext): LearningAgent {
  const message = context.message.trim();
  const scenario = (context.scenario ?? "").toLowerCase();
  const goal = (context.goal ?? "").toLowerCase();

  // Explicit practice modes and scenarios outrank keyword matching.
  if (scenario.includes("interview") || goal.includes("interview")) {
    return { ...AGENTS.interview, reason: "Your selected practice goal is interview preparation." };
  }
  if (["at work", "daily stand-up", "team meeting", "explain a technical concept"].includes(scenario)) {
    return { ...AGENTS.workplace, reason: "Your selected scenario is workplace communication." };
  }
  if (context.mode === "reading-discussion" || context.mode === "paragraph-generation") {
    return { ...AGENTS.writing, reason: "This activity generates or discusses written English." };
  }
  if (context.mode === "follow-up" || context.mode === "simplify") {
    return { ...AGENTS.tutor, reason: "This is a focused tutoring follow-up." };
  }

  for (const matcher of MATCHERS) {
    if (matcher.pattern.test(message)) return { ...AGENTS[matcher.id], reason: matcher.reason };
  }

  if (goal.includes("grammar")) return { ...AGENTS.grammar, reason: "Your saved learning goal is grammar improvement." };
  if (goal.includes("vocabulary")) return { ...AGENTS.vocabulary, reason: "Your saved learning goal is vocabulary building." };
  if (goal.includes("workplace")) return { ...AGENTS.workplace, reason: "Your saved learning goal is workplace English." };
  if (context.mode === "tutor") return { ...AGENTS.tutor, reason: "No specialist intent was detected, so your personal tutor will handle this request." };
  return { ...AGENTS.conversation, reason: "This looks like an open conversation, so your conversation partner will take the next turn." };
}
