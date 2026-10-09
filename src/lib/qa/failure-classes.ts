// Visual failure classes: the vocabulary shared by the Continuity Ledger (static checks before
// drawing), visual QA (after drawing) and the regression fixtures. Learned from real failures
// (see research/corners-are-for-winning-failure-analysis.md). Pure data: safe to import anywhere.

export const FAILURE_CLASSES = {
  // Identity
  CHARACTER_IDENTITY_DRIFT: { severity: "hard", label: "A main or recurring character doesn't look like their design (face, turban, glasses, beard, other locked markers)" },
  WRONG_LIFE_STAGE: { severity: "hard", label: "A character is shown at the wrong age for this panel" },
  WRONG_OCCUPANT: { severity: "hard", label: "The wrong person is in a vehicle (e.g. someone other than its driver at the wheel)" },
  DUPLICATE_CHARACTER: { severity: "hard", label: "The same named character appears more than once in one picture" },
  UNINTENDED_CHARACTER_REPLACEMENT: { severity: "hard", label: "A named character is replaced by a different person" },
  WARDROBE_UNINTENDED_CHANGE: { severity: "hard", label: "Clothes differ from what this panel requires (or change mid-scene / against a 'keep this look' choice)" },
  // Vehicles and objects
  MAIN_VEHICLE_COLOUR_DRIFT: { severity: "hard", label: "A canon vehicle's base colour is wrong" },
  VEHICLE_BODY_DRIFT: { severity: "hard", label: "A canon vehicle's model, body kit, spoiler or wheels are wrong" },
  LIVERY_LOSS: { severity: "hard", label: "A locked livery/decal is missing where it should be visible" },
  LIVERY_MUTATION: { severity: "hard", label: "A locked livery/decal is different from canon" },
  OPPONENT_VEHICLE_IDENTITY_DRIFT: { severity: "hard", label: "The rival's vehicle is a different vehicle" },
  OPPONENT_DUPLICATION: { severity: "hard", label: "A vehicle or object appears twice when only one exists" },
  OBJECT_IDENTITY_DRIFT: { severity: "hard", label: "A recurring important object changed design" },
  // Physics and space
  OCCUPANT_CLIPPING: { severity: "hard", label: "A person clips through a vehicle, or is physically outside it when they should be inside" },
  SCALE_FAILURE: { severity: "hard", label: "A person or vehicle is the wrong size for the scene (a driver bigger than the cabin, a standing adult far taller or shorter than about 1.3-1.5x a car's height)" },
  IMPOSSIBLE_POSE: { severity: "hard", label: "Impossible body position, broken anatomy or a driver facing an implausible direction" },
  VEHICLE_GEOMETRY_FAILURE: { severity: "hard", label: "A vehicle's geometry is broken (melted body, wheels misaligned, impossible shape)" },
  ROAD_GEOMETRY_FAILURE: { severity: "hard", label: "Roads, lanes or junctions are physically impossible, or a vehicle is off-road without a story reason" },
  WRONG_SCREEN_DIRECTION: { severity: "hard", label: "Travel direction contradicts the planned/established direction (e.g. two cars at one signal facing opposite ways)" },
  ACTION_CONTINUITY_FAILURE: { severity: "hard", label: "Who is ahead/behind/beside contradicts the storyboard or the previous panel" },
  ACTION_GEOGRAPHY_FAILURE: { severity: "hard", label: "The spatial layout of the action is unreadable or contradicts the sequence plan" },
  DRIVER_SIDE_INCONSISTENCY: { severity: "hard", label: "The driver sits on the other side of the car from its locked driver side (a mirrored car reads as wrong to readers)" },
  UNPLANNED_ELEMENT: { severity: "soft", label: "An extra vehicle, person or prop that the storyboard doesn't have" },
  // Readability and style
  SCENE_MISMATCH: { severity: "hard", label: "The picture doesn't show the storyboard beat" },
  STYLE_DRIFT: { severity: "soft", label: "The rendering style differs noticeably from the comic's style" },
  STRAY_TEXT: { severity: "soft", label: "Unwanted text, letters or logos painted into the art" },
  LETTERING_UNREADABLE: { severity: "hard", label: "Dialogue or captions are clipped, overlapping, or unreadable" },
  LETTERING_PLACEMENT: { severity: "soft", label: "A balloon is far from its speaker, covers a face, or its tail points at nothing" },
  BAD_CROP: { severity: "soft", label: "An important subject is cut off awkwardly" },
} as const;

export type FailureClass = keyof typeof FAILURE_CLASSES;
export const FAILURE_CLASS_IDS = Object.keys(FAILURE_CLASSES) as [FailureClass, ...FailureClass[]];

export function isHard(failure: FailureClass): boolean {
  return FAILURE_CLASSES[failure].severity === "hard";
}

/** The class list as prompt text, for the QA agents. */
export function failureGuide(): string {
  return FAILURE_CLASS_IDS.map((id) => `- ${id} (${FAILURE_CLASSES[id].severity}): ${FAILURE_CLASSES[id].label}`).join("\n");
}
