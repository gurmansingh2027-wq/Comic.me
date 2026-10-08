import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { askClaude, imageBlock } from "../claude";
import type { CastMember, Intake, PhotoVerdict } from "../comic";
import { UserFacingError } from "../errors";
import type { ComicStyle } from "../styles";
import { IMAGE_MODEL, imageClient, imageQuality, recordImageUsage, referenceFile, withRateLimitRetry } from "./art";

// Character Engine: decides who needs a design, checks reference photos, draws character
// designs in the comic's style, and describes approved designs so every panel matches them.

export const DESIGN_SIZE = "1536x1024";

// --- Who's in the story -------------------------------------------------------------------------

const StageSchema = z.object({
  label: z.string().describe('Short label, e.g. "Child (age 8)", "College (19-21)", "Wedding day (28)"'),
  ageRange: z.string().describe('e.g. "7-10"'),
  look: z.string().describe("How they look at this age: height, build, face, hair at the time"),
});

const CastSchema = z.object({
  cast: z.array(
    z.object({
      name: z.string().describe("The name to use in the comic"),
      role: z.string().describe("Who they are in the story, one short phrase"),
      importance: z.enum(["main", "supporting", "minor"]),
      identity: z.object({
        face: z.string().describe("Face shape and features that stay the same at any age"),
        skin: z.string(),
        hair: z.string().describe("Hair colour, texture and usual style"),
        body: z.string().describe("Build and height (as an adult if they grow up in the story)"),
        markers: z.array(z.string()).describe("Instantly recognisable features: glasses, moustache, scar, bindi, signature accessory…"),
      }),
      mainStage: StageSchema.describe("The age at which they appear MOST in the story; their main design is drawn at this age"),
      otherStages: z
        .array(StageSchema)
        .describe("Other ages they visibly appear at, ONLY if the story spans years (childhood, college, ten years later). Usually empty."),
      wardrobe: z
        .string()
        .describe("What they typically wear in different situations (work, home, festive, sport), fitting their age, era and culture"),
    }),
  ),
});

const CAST_PROMPT = `You build the Character Bible for a comic book made from someone's story.

From the story (and the interviewer's notes), list every person who will appear on the page, merging duplicates and leaving out anyone who never appears in a scene.
- importance: "main" = the story is about them (1-3 people); "supporting" = appears in several scenes or a key moment; "minor" = a passing role (a shopkeeper, a crowd member).
- If the storyteller is in the story but unnamed, call them "Me (the storyteller)".
- Never base anyone on a recognisable copyrighted character (e.g. a famous movie monster); design originals.

Identity is what keeps someone recognisable in any outfit, at any age and in any art style: face, skin, hair, build and distinctive markers. Clothes are NOT identity; put clothing in "wardrobe" instead, because people change clothes with the scene (school uniform as a kid, casual at college, a sherwani at their wedding, a suit at work).

Life stages: only when the story clearly shows someone at very different ages ("when we were kids", "ten years later", "at college", "at our wedding", "now in her 80s"). mainStage is the age they appear at most; otherStages lists the other ages, at most 3. If everything happens within a few years, otherStages must be empty. Minor characters never need stages.

Where the story doesn't say how someone looks, suggest a plausible, specific look that fits their age, culture and era.`;

type PlannedMember = Pick<CastMember, "name" | "role" | "importance" | "identity" | "wardrobe" | "description"> & {
  mainStage: { label: string; ageRange: string };
  stages: { label: string; ageRange: string; look: string }[];
};

/** A one-paragraph description from identity + main-stage look (used in every prompt). */
export function describeIdentity(identity: NonNullable<CastMember["identity"]>, look: string): string {
  const markers = identity.markers.length ? ` Recognisable by: ${identity.markers.join(", ")}.` : "";
  return `${look} Face: ${identity.face}. Skin: ${identity.skin}. Hair: ${identity.hair}. Build: ${identity.body}.${markers}`;
}

export async function planCast(story: string, intake?: Intake): Promise<PlannedMember[]> {
  const notes = intake?.characters.map((c) => `- ${c.name}: ${c.role}. Looks: ${c.look}`).join("\n") ?? "";
  const { cast } = await askClaude({
    system: CAST_PROMPT,
    user: `<story>\n${story}\n</story>\n\n<interviewer_notes>\n${notes}\n</interviewer_notes>`,
    schema: CastSchema,
    effort: "low",
    operation: "cast-planner",
    maxTokens: 24000,
  });
  return cast.slice(0, 12).map((person) => ({
    name: person.name,
    role: person.role,
    importance: person.importance,
    identity: person.identity,
    wardrobe: person.wardrobe,
    description: describeIdentity(person.identity, person.mainStage.look),
    mainStage: { label: person.mainStage.label, ageRange: person.mainStage.ageRange },
    stages: person.importance === "minor" ? [] : person.otherStages.slice(0, 3),
  }));
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
    operation: "photo-check",
    maxTokens: 8000,
  });
}

// --- Character designs ----------------------------------------------------------------------------

/** Which age a design is for: the main design, or one of the member's extra life stages. */
export type DesignStage = { label: string; ageRange: string; look: string };

function designPrompt(member: CastMember, style: ComicStyle, fromPhotos: boolean, stage?: DesignStage): string {
  const age = stage ? `${stage.label}, age ${stage.ageRange}` : member.mainStage ? `${member.mainStage.label}, age ${member.mainStage.ageRange}` : "";
  const appearance = stage ? `${stage.look} ${member.identity ? describeIdentityTraits(member) : member.description}` : member.description;
  return [
    `A character design sheet for a comic book: ${member.name}, ${member.role}${age ? ` (${age})` : ""}.`,
    `Art style: ${style.art}`,
    fromPhotos
      ? `Likeness: the reference photo(s) show the real person. Draw them as an illustrated character in the art style above, fully stylised like every other character in a comic of this style (same simplification, linework, shading and proportions); never a realistic portrait or a traced photo. Keep them recognisable through face shape, distinctive features, skin tone, hair, facial hair, glasses and build.${stage ? ` Show them at this age: ${stage.look}` : ""} Details: ${appearance}`
      : `Appearance: ${appearance}`,
    stage &&
      "Age-appropriate details only: leave out any feature that doesn't fit this age (an adult's watch, beard, glasses or jewellery on a child; a child's features on an adult). Face shape, eyes, skin tone and hair colour must stay the same person.",
    "Outfit: one simple, typical everyday outfit for this person at this age (their clothes will change from scene to scene; this sheet is about who they are).",
    "Layout: on the left, the full body from head to toe, standing in a relaxed, natural pose facing the viewer; on the right, a large head-and-shoulders portrait of the same character with a warm expression. Same outfit in both. Plain light background.",
    "IMPORTANT: Do not draw any text, labels, names, colour swatches, logos or watermarks.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function describeIdentityTraits(member: CastMember): string {
  const id = member.identity!;
  const markers = id.markers.length ? ` Recognisable by: ${id.markers.join(", ")}.` : "";
  return `Face: ${id.face}. Skin: ${id.skin}. Hair: ${id.hair}.${markers}`;
}

export async function drawDesign({
  member,
  style,
  photoPaths,
  previousDesignPath,
  feedback,
  stage,
  identityDesignPath,
}: {
  member: CastMember;
  style: ComicStyle;
  photoPaths: string[];
  previousDesignPath?: string;
  feedback?: string;
  /** Draw one of the member's other ages instead of the main design. */
  stage?: DesignStage;
  /** The approved main design: anchors identity when drawing another age. */
  identityDesignPath?: string;
}): Promise<Buffer> {
  const fromPhotos = member.source === "photos" && photoPaths.length > 0;

  // Every design also gets the style's sample picture, so the whole cast is drawn in one
  // consistent rendering style, whether it starts from photos or from a description.
  const styleSample = path.join(process.cwd(), "public", "styles", `${style.id}.webp`);
  const hasSample = existsSync(styleSample);
  const references: string[] = [];
  const roles: string[] = [];
  const add = (file: string, role: string) => {
    references.push(file);
    roles.push(`reference image ${references.length} ${role}`);
  };
  if (previousDesignPath) add(previousDesignPath, `is the current version of this design of ${member.name}`);
  if (identityDesignPath) {
    add(identityDesignPath, `is ${member.name}'s approved main design at another age: keep exactly the same person (face, features, skin tone, hair colour, distinctive markers) and art style, just at the new age`);
  }
  if (fromPhotos) photoPaths.forEach((file) => add(file, `is a photo of the real ${member.name}, for likeness only`));
  if (hasSample) {
    add(styleSample, "is an example of the target art style: match its rendering style exactly (linework, shading, colouring, level of stylisation), but ignore its people, scene and composition");
  }

  const prompt = [
    `Reference images: ${roles.join("; ")}.`,
    previousDesignPath &&
      `Requested change (the most important instruction; apply it clearly and visibly, even if it changes the drawing style, proportions or outfit): ${feedback?.trim() || "a fresh take on the same person"}. Apart from the requested change, keep the same person, likeness, age and layout.`,
    designPrompt(member, style, fromPhotos, stage),
  ]
    .filter(Boolean)
    .join("\n\n");

  const client = imageClient();
  const images = await Promise.all(references.map(referenceFile));
  let retries = 0;
  const result = await withRateLimitRetry(
    () =>
      client.images.edit({
        model: IMAGE_MODEL(),
        image: images,
        prompt,
        size: DESIGN_SIZE,
        quality: imageQuality(),
        output_format: "webp",
        output_compression: 88,
      }),
    () => retries++,
  );
  recordImageUsage("character-design", DESIGN_SIZE, references.length, retries);
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

export async function describeDesign(member: CastMember, design: Buffer, stageLabel?: string): Promise<string> {
  const { description } = await askClaude({
    system:
      "You describe comic character designs precisely, so other artists can draw the same character consistently in every panel. Describe only what is visible. No names of artists or styles.",
    user: [
      imageBlock(design, "image/webp"),
      { type: "text", text: `This is the approved design for ${member.name} (${member.role})${stageLabel ? `, at this age: ${stageLabel}` : ""}. Describe the person first (face, skin, hair, build, distinctive markers), then the outfit separately, starting the outfit part with "Outfit on this sheet:".` },
    ],
    schema: DescriptionSchema,
    effort: "low",
    operation: "design-description",
    maxTokens: 8000,
  });
  return description;
}
