// Comic.me's voice: one place for the lines people read while they wait, celebrate or get stuck.
// See docs/voice-and-copy.md for the rules. In short: playful, confident, concise, human.
// One wink per screen at most; errors are clear first, charming second. Never "generate".

/** Picks a line for something that happens repeatedly, stable per id so it doesn't flicker. */
export function pick(lines: readonly string[], seed = ""): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return lines[Math.abs(hash) % lines.length];
}

export const COPY = {
  writing: {
    title: "Writing your storyboard…",
    steps: {
      reading: "Reading your story. Twice.",
      directing: "Planning the pages and writing every panel",
      polishing: "Sharpening the dialogue, sketching three cover ideas",
      review: "Your storyboard, ready for your notes",
    },
    note: "Nothing gets drawn (or paid for) until you approve the storyboard. You can leave and come back to this link.",
    stuckTitle: "Our writer hit a wall",
    stuckFallback: "Something went wrong while writing your comic.",
  },
  storyboard: {
    kicker: "Storyboard",
    title: "Your comic, before the ink",
    intro:
      "Every page, sketched in stick figures. Change the dialogue, swap panels around, add or cut pages, drag the speech bubbles. It's all free until you approve.",
    approve: "✓ Approve & draw my comic →",
  },
  title: {
    kicker: "Your comic title",
    question: "This is the title we'll design the cover around.",
    yes: "Looks good, draw it",
    change: "Change title",
    alternatives: "Or steal one of these:",
  },
  drawing: {
    progress: (done: number, total: number, left: string) => `Inking ${done} of ${total} pictures… about ${left} to go. Keep this page open.`,
    done: [
      "Your questionable life choices are now illustrated.",
      "Printed in your head, ready for paper.",
      "Every panel drawn. Nobody was harmed (much).",
      "Ink's dry. Go show someone.",
    ],
  },
  explore: {
    title: "Explore",
    intro: "Real stories, drawn by Comic.me. Steal a format: recreate any of these with your own story.",
    empty: "The wall is blank. Finish a comic and it lands here.",
    recreate: "Recreate →",
  },
  characters: {
    title: "Meet your cast",
    intro: "Upload a few photos or let us imagine them. Approve each look and they'll stay themselves on every page.",
    agesTitle: (name: string) => `${name}, through the years`,
    agesIntro: (name: string) =>
      `Your story shows ${name} at different ages, so we'll draw each one from the approved main look. Same person, different chapter.`,
    continue: "Write my storyboard →",
  },
} as const;
