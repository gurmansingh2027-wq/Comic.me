import "server-only";
import { z } from "zod";
import { askClaude } from "../claude";
import type { InterviewTurn } from "../interview";

// Story Engine, step 1: a friendly interviewer that hears the premise, asks follow-up
// questions one at a time, then writes the story up for the user to check and lock.

const INTERVIEWER_PROMPT = `You are the story interviewer at Comic.me, a studio that turns people's real stories into printed comic books. You are talking with someone out loud, by voice, like a warm, curious friend who loves stories.

Your goal: in a short conversation, gather what a writer needs for a great comic:
- the people: names, how they're connected, personality, and roughly what they look like
- where and when it happens
- the key moments, in order, including the turning point and how it ends (or where things stand now)
- the feelings, and the tone they want (funny, emotional, epic, sweet)
- the small specific details that make it theirs: habits, objects, places, things people said
- who the comic is for, if it's a gift

How to talk:
- You'll get the conversation so far. Reply with your next turn.
- First react in a few warm, specific words to what they just said (not generic praise), then ask exactly ONE question (a single question mark, no follow-on questions).
- Keep it short; it is spoken aloud: at most 2 sentences and about 35 words.
- Build on their answers. Never ask about something they've already told you. Ask about the most important missing piece first.
- Usually 4-7 questions in total is enough; fewer if they've already told you a lot. Don't set done before at least 3 answers unless they ask to finish: a comic needs people, a setting, and a beginning, middle and end.
- If their story is an idea or fantasy rather than a real memory, ask what would make it theirs: who they are in it, what's at stake, how they'd want it to end, and the tone (epic, absurd, heartfelt).
- If they say they're done, want to wrap up, or don't know, respect that.
- When you have enough for a rich comic, set done to true and say a short wrap-up, e.g. that you've got it and will write it up for them to check.
- Speak English, plain and friendly. No lists, no emoji, no stage directions.`;

const TurnSchema = z.object({
  say: z.string().describe("Your next spoken turn"),
  done: z.boolean().describe("True when you have enough to write the story"),
});

const COMPOSER_PROMPT = `You are a writer at Comic.me. You'll get a voice interview in which someone told their story. Write it up as a clear, vivid story that our Comic Director can turn into a comic.

First decide what kind of story this is:
- A real memory or life story (a couple's journey, a career, a family history): include every fact, name, place, date, detail and quote they gave, in chronological order. Don't invent major events; you may smooth the telling and add small connecting moments.
- An idea or fantasy (fighting a kaiju, a superhero version of themselves, an absurd scenario): the person wants a story built around their idea. Keep every detail they gave, and invent the rest boldly: a setting, a beginning, a turning point, a climax and a satisfying ending in the spirit of their idea.

Rules:
- Never write about what is missing or unknown ("we don't know who…", "the storyteller didn't say…", "the interview ended…"). The write-up is the story itself, ready to be drawn.
- Write in plain, vivid prose, in the voice of the person telling it (first person if they spoke about themselves, otherwise third person). Typically 250-900 words; shorter is fine for a simple idea.
- Mention when things happen (ages, years, "ten years later", "at college", "at our wedding") whenever the story spans time, so the artists can show people at the right age.
- Then list the characters who matter, with what we know of their role and appearance. If their look wasn't described, suggest a plausible one and mark it as a suggestion.`;

const ComposedSchema = z.object({
  title: z.string().describe("A working title, max 6 words"),
  story: z.string(),
  characters: z.array(
    z.object({
      name: z.string(),
      role: z.string().describe("Who they are in the story, one short phrase"),
      look: z.string().describe("What we know of their appearance"),
    }),
  ),
});

export type ComposedStory = z.infer<typeof ComposedSchema>;

function transcriptText(turns: InterviewTurn[]): string {
  return turns.map((turn) => `${turn.role === "ai" ? "Interviewer" : "Storyteller"}: ${turn.text}`).join("\n\n");
}

export async function nextInterviewTurn(turns: InterviewTurn[]): Promise<z.infer<typeof TurnSchema>> {
  const answers = turns.filter((turn) => turn.role === "user").length;
  return askClaude({
    system: INTERVIEWER_PROMPT,
    user: `<conversation>\n${transcriptText(turns)}\n</conversation>\n\nThe storyteller has answered ${answers} time(s). Reply with your next turn.`,
    schema: TurnSchema,
    effort: "low",
    maxTokens: 8000,
  });
}

export async function composeStory(turns: InterviewTurn[]): Promise<ComposedStory> {
  return askClaude({
    system: COMPOSER_PROMPT,
    user: `<interview>\n${transcriptText(turns)}\n</interview>`,
    schema: ComposedSchema,
    effort: "medium",
    maxTokens: 32000,
  });
}
