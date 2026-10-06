import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { askClaude, imageBlock } from "../claude";
import type { CastMember, Intake, PhotoVerdict } from "../comic";
import { UserFacingError } from "../errors";
import type { ComicStyle } from "../styles";
import { IMAGE_MODEL, imageClient, imageQuality, referenceFile, withRateLimitRetry } from "./art";

// Character Engine: decides who needs a design, checks reference photos, draws character
// designs in the comic's style, and describes approved designs so every panel matches them.

export const DESIGN_SIZE = "1536x1024";

// --- Who's in the story -------------------------------------------------------------------------

const CastSchema = z.object({
  cast: z.array(
    z.object({
      name: z.string().describe("The name to use in the comic"),
      role: z.string().describe("Who they are in the story, one short phrase"),
      description: z
        .string()
        .describe("Everything known about how they look; where unknown, a plausible specific look that fits the story"),
      importance: z.enum(["main", "supporting", "minor"]),
    }),
  ),
});

const CAST_PROMPT = `You prepare the cast for a comic book made from someone's real story.

From the story (and the interviewer's notes), list every person who will appear on the page, merging duplicates and leaving out anyone who never appears in a scene.
- importance: "main" = the story is about them (1-3 people); "supporting" = appears in several scenes or a key moment; "minor" = a passing role (a shopkeeper, a crowd member).
- If the storyteller is in the story but unnamed, call them "Me (the storyteller)".
- description: what they look like, from the story. Where it's not said, suggest a plausible, specific look that fits their age, culture and era (and say it's a suggestion). One or two sentences.`;

export async function planCast(story: string, intake?: Intake): Promise<Omit<CastMember, "id" | "source" | "photos" | "designAttempts">[]> {
  const notes = intake?.characters.map((c) => `- ${c.name}: ${c.role}. Looks: ${c.look}`).join("\n") ?? "";
  const { cast } = await askClaude({
    system: CAST_PROMPT,
    user: `<story>\n${story}\n</story>\n\n<interviewer_notes>\n${notes}\n</interviewer_notes>`,
    schema: CastSchema,
    effort: "low",
    maxTokens: 16000,
  });
  return cast.slice(0, 12);
}

// --- Photo check --------------------------------------------------------------------------------

const PhotoCheckSchema = z.object({
  verdict: z.enum(["good", "need-more", "unusable"]),
  message: z.string().describe("One or two friendly sentences for the user"),
});

const PHOTO_CHECK_PROMPT = `You check reference photos that a user uploaded so an illustrator can draw a real person as a comic character.

Decide whether the photos are enough to capture this person's likeness:
- "good": at least one clear, well-lit photo where the face is visible and large enough, and all photos show the same single person. For a main character, two photos (e.g. a face close-up plus another angle or full body) are ideal, but one excellent face photo is enough.
- "need-more": usable, but another photo would clearly help (e.g. face too small, sunglasses, heavy filter, only a side view, or a main character with just one so-so photo). Say exactly what kind of photo to add.
- "unusable": no clear face, several people and it's unclear which one is them, or not a photo of a person. Explain what to upload instead.

Talk to the user directly, warmly and briefly. Don't comment on the person's looks.`;

export async function checkPhotos(member: CastMember, photos: Buffer[]): Promise<{ verdict: PhotoVerdict; message: string }> {
  return askClaude({
    system: PHOTO_CHECK_PROMPT,
    user: [
      ...photos.map((photo) => imageBlock(photo, "image/jpeg")),
      {
        type: "text",
        text: `These ${photos.length} photo(s) are of ${member.name} (${member.role}), a ${member.importance} character.`,
      },
    ],
    schema: PhotoCheckSchema,
    effort: "low",
    maxTokens: 8000,
  });
}

// --- Character designs ----------------------------------------------------------------------------

function designPrompt(member: CastMember, style: ComicStyle, fromPhotos: boolean): string {
  return [
    `A character design sheet for a comic book: ${member.name}, ${member.role}.`,
    `Art style: ${style.art}`,
    fromPhotos
      ? `Likeness: the reference photo(s) show the real person. Draw them as an illustrated character in the art style above, fully stylised like every other character in a comic of this style (same simplification, linework, shading and proportions); never a realistic portrait or a traced photo. Keep them recognisable through face shape, distinctive features, skin tone, hair, facial hair, glasses, age and build. Outfit and details: ${member.description}`
      : `Appearance: ${member.description}`,
    "Layout: on the left, the full body from head to toe, standing in a relaxed, natural pose facing the viewer; on the right, a large head-and-shoulders portrait of the same character with a warm expression. Same outfit in both. Plain light background.",
    "IMPORTANT: Do not draw any text, labels, names, colour swatches, logos or watermarks.",
  ].join("\n\n");
}

export async function drawDesign({
  member,
  style,
  photoPaths,
  previousDesignPath,
  feedback,
}: {
  member: CastMember;
  style: ComicStyle;
  photoPaths: string[];
  previousDesignPath?: string;
  feedback?: string;
}): Promise<Buffer> {
  const fromPhotos = member.source === "photos" && photoPaths.length > 0;

  // Every design also gets the style's sample picture, so the whole cast is drawn in one
  // consistent rendering style, whether it starts from photos or from a description.
  const styleSample = path.join(process.cwd(), "public", "styles", `${style.id}.webp`);
  const references = [
    ...(previousDesignPath ? [previousDesignPath] : []),
    ...(fromPhotos ? photoPaths : []),
    ...(existsSync(styleSample) ? [styleSample] : []),
  ];
  const label = (i: number) => `reference image ${i + 1}`;
  const roles = [
    previousDesignPath && `${label(0)} is the current design of ${member.name}`,
    fromPhotos &&
      `${photoPaths.map((_, i) => label(i + (previousDesignPath ? 1 : 0))).join(", ")} ${photoPaths.length > 1 ? "are photos" : "is a photo"} of the real person, for likeness only`,
    existsSync(styleSample) &&
      `the last reference image is an example of the target art style: match its rendering style exactly (linework, shading, colouring, level of stylisation), but ignore its people, scene and composition`,
  ].filter(Boolean);

  const prompt = [
    `Reference images: ${roles.join("; ")}.`,
    previousDesignPath &&
      `Requested change (the most important instruction; apply it clearly and visibly, even if it changes the drawing style, proportions or outfit): ${feedback?.trim() || "a fresh take on the same person and outfit"}. Apart from the requested change, keep the same person, likeness, outfit and layout.`,
    designPrompt(member, style, fromPhotos),
  ]
    .filter(Boolean)
    .join("\n\n");

  const client = imageClient();
  const images = await Promise.all(references.map(referenceFile));
  const result = await withRateLimitRetry(() =>
    client.images.edit({
      model: IMAGE_MODEL(),
      image: images,
      prompt,
      size: DESIGN_SIZE,
      quality: imageQuality(),
      output_format: "webp",
      output_compression: 88,
    }),
  );
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) throw new UserFacingError("The image service didn't return a design. Please try again.", 502);
  return Buffer.from(base64, "base64");
}

// --- Describing an approved design ----------------------------------------------------------------

const DescriptionSchema = z.object({
  description: z
    .string()
    .describe(
      "2-3 sentences an illustrator can follow: apparent age, build, skin tone, face and distinctive features, hair, facial hair, glasses, and the outfit with exact colours",
    ),
});

export async function describeDesign(member: CastMember, design: Buffer): Promise<string> {
  const { description } = await askClaude({
    system:
      "You describe comic character designs precisely, so other artists can draw the same character consistently in every panel. Describe only what is visible. No names of artists or styles.",
    user: [imageBlock(design, "image/webp"), { type: "text", text: `This is the approved design for ${member.name} (${member.role}).` }],
    schema: DescriptionSchema,
    effort: "low",
    maxTokens: 8000,
  });
  return description;
}
