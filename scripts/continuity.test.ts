// Regression tests for the Continuity Ledger (free, no AI calls). Each test is a failure pattern
// from a real comic (research/corners-are-for-winning-failure-analysis.md), rebuilt as a tiny
// synthetic storyboard. Run: node --test scripts/continuity.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { applyLookPolicy, buildLedger } from "../src/lib/continuity.ts";
import type { CanonObject, CastMember, ComicScript, Panel, SceneContext } from "../src/lib/comic.ts";

const member = (name: string, extra: Partial<CastMember> = {}): CastMember => ({
  id: name,
  name,
  role: "",
  description: `${name}. Outfit on this sheet: black bomber jacket`,
  importance: "main",
  source: "ai",
  photos: [],
  designAttempts: 0,
  ...extra,
});
const car = (id: string, name: string, owner: string): CanonObject => ({
  id,
  name,
  kind: "vehicle",
  role: "hero",
  owner,
  description: "",
  locks: ["pearl-white paint"],
  designAttempts: 0,
});
const context = (extra: Partial<SceneContext> = {}): SceneContext => ({
  location: "Ring Road",
  period: "now",
  timeOfDay: "night",
  weather: "clear",
  event: "midnight drive",
  cast: [],
  objects: [],
  continuity: "",
  ...extra,
});
const panel = (scene: string, ctx: Partial<SceneContext> = {}, extra: Partial<Panel> = {}): Panel => ({
  shot: "wide",
  scene,
  caption: "",
  dialogue: [],
  context: context(ctx),
  ...extra,
});
const script = (...panels: Panel[]): ComicScript => ({
  title: "t",
  tagline: "",
  bible: null,
  characters: [],
  cover: null,
  pages: [{ layout: "grid-4", panels }],
});

const CAST = [member("Gunit"), member("The Stranger")];
const OBJECTS = [car("huracan", "Gunit's Huracan", "Gunit"), car("gt-r", "the GT-R", "The Stranger")];

test("a canon car mentioned without its colour is listed as canon (7-2 / 7-3 / 10-3: colour drift)", () => {
  const { entries } = buildLedger(script(panel("On the right, the Huracan holds a tight inside line.")), CAST, OBJECTS);
  assert.deepEqual(entries[0].objects.map((o) => o.id), ["huracan"]);
});

test("a moving car does not invent its owner at the wheel", () => {
  const { entries, issues } = buildLedger(
    script(panel("The Stranger leans out of the GT-R, looking at the Huracan.", { canon: [{ id: "gt-r" }, { id: "huracan" }], cast: [{ name: "The Stranger", stage: "", wardrobe: "red tee", emotion: "", action: "leaning out", inside: { objectId: "gt-r", position: "driver's seat" } }] })),
    CAST,
    OBJECTS,
  );
  const gunit = entries[0].people.find((p) => p.name === "Gunit");
  assert.equal(gunit, undefined, "Ownership does not establish a driver");
  assert.equal(issues.some((i) => i.failure === "WRONG_OCCUPANT" && i.fixed), false);
});

test("a parked car doesn't invent a driver (12-3)", () => {
  const { entries } = buildLedger(script(panel("Gunit sips chai; behind him the parked Huracan cools.", { canon: [{ id: "huracan" }], cast: [{ name: "Gunit", stage: "", wardrobe: "jacket", emotion: "", action: "sipping" }] })), CAST, OBJECTS);
  assert.equal(entries[0].people.filter((p) => p.name === "Gunit").length, 1);
  assert.equal(entries[0].people[0].inside, undefined);
});

test("the same person can't appear twice in one panel (12-2: duplicate character)", () => {
  const twice = { name: "The Stranger", stage: "", wardrobe: "red tee", emotion: "", action: "" };
  const { entries, issues } = buildLedger(script(panel("The GT-R crawls past the stall.", { cast: [twice, { ...twice, action: "standing" }] })), CAST, OBJECTS);
  assert.equal(entries[0].people.filter((p) => p.name === "The Stranger").length, 1);
  assert.ok(issues.some((i) => i.failure === "DUPLICATE_CHARACTER"));
});

test("travel direction is inherited inside a sequence and flips are corrected (5-1 / 6-2: screen direction)", () => {
  const { entries, issues } = buildLedger(
    script(
      panel("Both cars launch.", { sequence: "race", motion: { direction: "left-to-right", order: "GT-R a nose ahead" } }),
      panel("Close on the GT-R.", { sequence: "race" }),
      panel("The Huracan reels him in.", { sequence: "race", motion: { direction: "right-to-left" } }),
      panel("Camera swings round.", { sequence: "race", motion: { direction: "right-to-left" }, axisChange: true }),
    ),
    CAST,
    OBJECTS,
  );
  assert.equal(entries[1].motion?.direction, "left-to-right");
  assert.equal(entries[2].motion?.direction, "right-to-left", "ambiguous intent is not rewritten");
  assert.ok(issues.some((i) => i.failure === "WRONG_SCREEN_DIRECTION" && i.key === "1-3"));
  assert.equal(entries[3].motion?.direction, "right-to-left", "a deliberate axis change is allowed");
});

test("age can't change in the middle of a scene", () => {
  const withStages = [member("Gunit", { stages: [{ id: "child", label: "Child", ageRange: "8", look: "", designAttempts: 0 }] }), member("The Stranger")];
  const { entries, issues } = buildLedger(
    script(
      panel("Gunit at the wheel.", { cast: [{ name: "Gunit", stage: "", wardrobe: "jacket", emotion: "", action: "" }] }),
      panel("Gunit grins.", { cast: [{ name: "Gunit", stage: "child", wardrobe: "jacket", emotion: "", action: "" }] }),
    ),
    withStages,
    OBJECTS,
  );
  assert.equal(entries[1].people[0].stage, "child");
  assert.ok(issues.some((i) => i.failure === "WRONG_LIFE_STAGE"));
});

test("complexity is raised for two drifting cars with visible drivers (8-1 / 10-3)", () => {
  const { entries } = buildLedger(
    script(
      panel(
        "Top-down: the Huracan drifts through the cloverleaf in thick smoke while the GT-R spins.",
        { canon: [{ id: "huracan" }, { id: "gt-r" }], motion: { direction: "left-to-right" }, cast: [{ name: "Gunit", stage: "", wardrobe: "", emotion: "", action: "", inside: { objectId: "huracan", position: "driver's seat" } }] },
        { complexity: "low" },
      ),
    ),
    CAST,
    OBJECTS,
  );
  assert.ok(["high", "very_high"].includes(entries[0].complexity), entries[0].complexity);
});

test("look policies: keep copies the sheet outfit, ask needs approval, story dresses for the scene", () => {
  const person = { name: "Gunit", stage: "", wardrobe: "wedding sherwani", emotion: "", action: "", lookChange: "wedding sherwani" };
  assert.equal(applyLookPolicy(person, "keep").fromSheet, true);
  assert.equal(applyLookPolicy(person, "ask").fromSheet, true);
  assert.equal(applyLookPolicy({ ...person, lookChangeApproved: true, lookChangeReviewed: true }, "ask").wardrobe, "wedding sherwani");
  assert.equal(applyLookPolicy(person, "story").wardrobe, "wedding sherwani");
});

test("explicit temporal transitions preserve the requested age", () => {
  const cast = [member("Gunit", { stages: [{ id: "child", label: "Child", ageRange: "8", look: "", designAttempts: 0 }] })];
  const person = { name: "Gunit", stage: "", wardrobe: "jacket", emotion: "", action: "" };
  const result = buildLedger(script(panel("Gunit today", { cast: [person] }), panel("Years earlier", { transition: "Flashback", cast: [{ ...person, stage: "child" }] })), cast);
  assert.equal(result.entries[1].people[0].stage, "child"); assert.equal(result.entries[1].continuesFrom, undefined); assert.equal(result.issues.length, 0);
});
test("latest race order, rather than the initial order, is inherited", () => {
  const result = buildLedger(script(panel("Launch", { sequence: "race", motion: { direction: "left-to-right", order: "GT-R ahead" } }), panel("Overtake", { sequence: "race", motion: { direction: "left-to-right", order: "Huracan ahead" } }), panel("Exit", { sequence: "race" })));
  assert.equal(result.entries[2].motion?.order, "Huracan ahead");
});
test("explicit non-owner drivers remain authoritative", () => {
  const result = buildLedger(script(panel("The Stranger borrows the Huracan", { canon: [{ id: "huracan" }], cast: [{ name: "The Stranger", stage: "", wardrobe: "", emotion: "", action: "driving", inside: { objectId: "huracan", position: "driver's seat" } }] })), CAST, OBJECTS);
  assert.deepEqual(result.entries[0].people.map(p => p.name), ["The Stranger"]);
});
test("defined object damage persists into the next panel", () => {
  const objects = [{ ...OBJECTS[0], states: [{ id: "damaged", label: "Damaged", description: "dented front lip" }] }];
  const result = buildLedger(script(panel("Huracan hits a barrier", { canon: [{ id: "huracan", state: "damaged" }] }), panel("Huracan stops", { canon: [{ id: "huracan" }] })), CAST, objects);
  assert.equal(result.entries[1].objects[0].state, "damaged");
});

test("only explicitly established occupants inherit into an ongoing sequence", () => {
  const driver = { name: "The Stranger", stage: "", wardrobe: "jacket", emotion: "", action: "driving", inside: { objectId: "huracan", position: "driver's seat" } };
  const result = buildLedger(script(panel("Launch", { sequence: "race", canon: [{ id: "huracan" }], cast: [driver], motion: { direction: "left-to-right" } }), panel("Huracan rounds a bend", { sequence: "race", canon: [{ id: "huracan" }] })), CAST, OBJECTS);
  assert.equal(result.entries[1].people[0].name, "The Stranger");
  assert.equal(result.entries[1].people[0].inferred, true);
});
