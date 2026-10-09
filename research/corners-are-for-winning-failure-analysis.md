# "Corners Are for Winning": failure analysis (system learning)

> Comic `ea55da3f…`, Bold Graphic style, 12 pages + cover, 41 pictures, $2.67. Made 9 Oct 2026 on the pipeline before continuity QA existed.
> **Purpose:** teach the product what not to do. The labels below describe the original pictures.
> **Update (9 Oct 2026):** the comic was later upgraded in place with the Object Bible (canon sheets for the Huracan, GT-R and PCR van), panel occupancy and screen direction, and run through the full QA pipeline: existing pictures were inspected first and only failures redrawn (about $16). A backup of the original is in `.context/backups/` on the machine that made it. Readers then caught what QA missed: drivers sitting on the wrong (left) side and the Stranger leaning out with his chest facing the car's rear, which led to the driver-side and facing rules.
> Each finding is tagged with a reusable failure class from `src/lib/qa/failure-classes.ts`. The same labels are machine-readable in `research/fixtures/corners-failures.json`, which the QA evaluation script uses.

## Canon the story defined (what the system should have locked)
- **Hero car:**
  - **Locked:** a two-seater Lamborghini Huracán, **pearl white**, wide fender flares, aggressive camber, a **carbon ducktail spoiler (not a big wing)**, a small Japanese-style **sticker bomb on the rear quarter**. Established in panels 1-2 and 1-3 as red and black waves and kanji-like shapes on white.
  - **Owner and driver:** Gunit.
- **Opponent car:**
  - **Locked:** matte-grey, heavily modified Nissan GT-R, giant rear wing, loud exhaust.
  - **Driver:** the Cocky Stranger.
- **Police vehicle:** a Delhi Police PCR **van** (white, with a light bar).
- **Gunit (main character):** black layered turban, rimless glasses, beard; a black quilted bomber jacket all night.
- **The Cocky Stranger:** backwards cap, thick gold chain, pencil moustache; red graphic tee and black puffer jacket all night.
- **Action:** at the Khan Market signal both cars face the **same** direction side by side. At launch the **GT-R is a nose ahead**. Through Dhaula Kuan the Huracán takes the inside line and exits **ahead**. In the chase the PCR van is **behind** both cars. The GT-R spins and stops; the Huracán leaves.

## Findings

| Page-panel | Failure class | Severity | Why it's wrong | What the system should have known | How QA should catch it |
|---|---|---|---|---|---|
| Cover | MAIN_VEHICLE_COLOUR_DRIFT, VEHICLE_BODY_DRIFT, LIVERY_MUTATION | **Hard** | The hero car is **orange** with a big GT wing and stickers all over | Hero car canon: pearl white, ducktail, rear-quarter stickers. The cover brief said "Gunit's tuned Huracán" with a palette of "indigo, **safety orange**", and the model painted the car orange | Panel QA with the car's canon sheet: base colour lock and spoiler lock |
| 1-2 | LIVERY_MUTATION (canon established without a lock) | Soft | The sticker bomb covers the whole side; the story says "a little sticker bomb on the rear quarter" | The first appearance silently *became* the canon; nothing recorded or approved it | Canon sheet approved **before** drawing; QA compares against it |
| 2-1 | MAIN_VEHICLE_COLOUR_DRIFT | Medium | In a lit garage the white car reads black | The base colour must survive lighting; the panel text only said "the car's headlights" | QA: base colour lock, with "night lighting may darken but must not change the hue" |
| 2-3 | LIVERY_LOSS, VEHICLE_BODY_DRIFT | **Hard** | A stock white Huracán: no stickers, no flares, no ducktail | The scene text said "white Huracán" and nothing else; no reference picture of the car was sent | Every panel showing the car gets its canon sheet as a reference; QA checks locked mods |
| 3-3 | VEHICLE_BODY_DRIFT | Soft | Front view of a stock car (no flares or camber) | As above | QA: mods visible from this angle |
| 4-1 | LIVERY_LOSS | **Hard** | Side-on drift with no rear-quarter stickers | The livery is visible from this angle and must appear | QA: livery lock + camera angle |
| 4-4 → 4-5 | ACTION_CONTINUITY_FAILURE | Medium | The GT-R "rolls up alongside", but the Huracán is drawn far ahead in another lane | Relative position: side by side at the stop line | Sequence QA: relative positions in the ledger |
| 4-6 | WRONG_OCCUPANT | **Hard** | The Huracán's driver has no turban: not Gunit | Gunit owns and drives the Huracán. The panel's cast listed only the Stranger, so Gunit's reference wasn't sent and the model invented a driver | Ledger: owner and occupant rule (anyone visible in the Huracán is Gunit, so add his reference); QA: occupant identity |
| 5-1 (hero splash) | WRONG_SCREEN_DIRECTION, LIVERY_LOSS | **Hard** | At the same red light the GT-R faces up and the Huracán faces down: opposite directions | Both cars face the same way, side by side; no travel direction was recorded | Ledger motion: same heading; QA: direction-of-travel check |
| 6-2 | ACTION_CONTINUITY_FAILURE (storyboard mismatch) | **Hard** | The Huracán is ahead; the script says "GT-R is a nose ahead" | Order: GT-R ahead | QA: "who is ahead" against the ledger |
| 7-2 | MAIN_VEHICLE_COLOUR_DRIFT | **Hard** | The hero car is **yellow-orange** | The scene text said only "the two cars tiny beneath it", with no colour and no reference | Canon reference + locks in every panel where the car appears (even tiny); QA colour |
| 7-3 | MAIN_VEHICLE_COLOUR_DRIFT, DRIVER_SIDE_INCONSISTENCY | **Hard** | The hero car is **lime green**; the GT-R's driver switches to the left seat | Scene text: "the Huracán holds a tight inside line" (no colour). India is right-hand drive and earlier panels put him on the right | Canon + locks; vehicle facts: right-hand drive |
| 8-1 (hero) | ROAD_GEOMETRY_FAILURE | Medium | The cloverleaf loops don't connect to any carriageway; the geography is unreadable | A very high-complexity aerial interchange; no simpler fallback | Complexity → stricter QA + safe-shot fallback |
| 8-2 | OPPONENT_DUPLICATION | **Hard** | From inside the GT-R, the Stranger sees the Huracán **and another dark GT-R** ahead | Only two cars exist in this sequence; the camera is inside the GT-R | Ledger: vehicles in the scene; QA: no duplicate vehicles or characters |
| 8-3 → 9-1 | OBJECT_IDENTITY_DRIFT | Medium | The police vehicle is a sedan in the mirror and a van next | PCR canon: white van with a light bar | Object canon (recurring vehicle) |
| 9-1 | ACTION_GEOGRAPHY_FAILURE, UNPLANNED_ELEMENT | Medium | The van is drawn **in front** of the racing cars, and an unexplained motorbike appears | Chase order: Huracán → GT-R → van | Sequence plan + QA order check |
| 10-2 | WRONG_SCREEN_DIRECTION (soft) | Soft | The camera jumps from left→right travel to cars coming at camera with no establishing beat | Action axis left→right | Sequence QA (soft) |
| 10-3 | MAIN_VEHICLE_COLOUR_DRIFT | **Hard** | The Huracán is **lime green** again | No colour in the text; no reference | Canon + locks; QA |
| 10-4 | OPPONENT_VEHICLE_IDENTITY_DRIFT | **Hard** | The Stranger is slumped in a grey **sedan**, not the GT-R | The scene text said "the stalled car" | Canon + QA |
| 11-1 (hero splash) | LIVERY_LOSS, VEHICLE_BODY_DRIFT | **Hard** | A stock white Huracán in the book's biggest image | As above | Canon + hero-panel QA (stricter) |
| 12-1 | LIVERY_LOSS | Soft | Background car without stickers | Livery visible side-on | QA (soft at this size) |
| 12-2 | DUPLICATE_CHARACTER, WARDROBE_UNINTENDED_CHANGE | **Hard** | The Stranger appears twice: driving the GT-R **and** standing at the stall (in a white tee instead of red) | One person can be in one place | QA: each named character at most once |
| 12-3 | LIVERY_MUTATION | **Hard** | The car is now covered in a multicolour sticker bomb, different from pages 1 and 2 | Livery lock: red and black waves on the rear quarter | Canon + QA |
| Page 5 lettering | LETTERING_PLACEMENT | Soft | "Shame it's just for show" sits far from the Stranger, with its tail pointing at nothing | The speaker's position in the panel | Page QA on the lettered page |

**Character identity held up well:** Gunit (turban, glasses, beard) and the Stranger (cap, chain) are recognisable in almost every panel, because their design sheets were sent as references. **Every hard failure involving a person is an occupancy or duplication failure (4-6, 12-2), not a face failure.**

**Hard failures: 14 of 41 pictures (34%).** The cover and two of the three hero splashes are among them.

## Patterns
1. **Vehicles were text-only.** Characters had reference sheets; the cars had a phrase. When the phrase left out the colour (7-2, 7-3, 10-3) or the cover palette implied one (orange), the model fell back to its prior: Lamborghinis are yellow, orange or lime.
2. **Panels were drawn independently.** Three at a time, out of order, with only the *text* of the neighbouring panels. No picture of the previous panel and no persistent state.
3. **No travel direction, order or occupancy in the data.** "Who's ahead", "which way" and "who's in which car" lived only in free text (sometimes not even there), so the model reinvented them each time.
4. **Nothing checked the output.** The first image returned was accepted, however wrong.
5. **High-complexity shots got no special handling.** Aerial interchanges, two-car drifts and spins were attempted once at full ambition, with no simpler fallback.
6. **Hero panels got higher quality, not more correctness.** High quality made broken panels prettier; it didn't make them right.

## Regression classes defined from this comic
CHARACTER_IDENTITY_DRIFT · WRONG_OCCUPANT · DUPLICATE_CHARACTER · MAIN_VEHICLE_COLOUR_DRIFT · VEHICLE_BODY_DRIFT · LIVERY_LOSS · LIVERY_MUTATION · OPPONENT_VEHICLE_IDENTITY_DRIFT · OPPONENT_DUPLICATION · OBJECT_IDENTITY_DRIFT · WRONG_SCREEN_DIRECTION · ACTION_CONTINUITY_FAILURE · ACTION_GEOGRAPHY_FAILURE · ROAD_GEOMETRY_FAILURE · OCCUPANT_CLIPPING · DRIVER_SIDE_INCONSISTENCY · UNPLANNED_ELEMENT · WARDROBE_UNINTENDED_CHANGE · LETTERING_PLACEMENT (plus the general classes in `failure-classes.ts`).

## Measured detection (9 Oct 2026 audit, $0.27 of a $1 cap)

Visual QA (`src/lib/qa/visual-qa.ts`, Claude Opus 5.5 at low effort, pictures downscaled to 768 px) was run over labelled pictures of this comic with the fixture canon sheets (`research/fixtures/corners-failures.json`), through the capped developer tool (`scripts/qa-eval.ts`). Eight inspections, $0.27 in total, reports saved outside the repo in `.context/continuity-audit-*.json`.

| Picture | Labelled failure | Inspector found | Decision | Confidence | Cost / time |
|---|---|---|---|---|---|
| 7-3 | MAIN_VEHICLE_COLOUR_DRIFT | **Caught** (+ LIVERY_LOSS, VEHICLE_BODY_DRIFT, OCCUPANT_CLIPPING, all real on inspection) | simplify | high | $0.038 / 16 s |
| 5-1 | WRONG_SCREEN_DIRECTION, LIVERY_LOSS | **Caught** direction; livery only in the fix text | simplify | high | $0.046 / 12 s |
| 8-2 | OPPONENT_DUPLICATION | **Caught** (+ LIVERY_LOSS) | escalate | medium | $0.039 / 16 s |
| 12-2 | DUPLICATE_CHARACTER | **Caught** | simplify | high | $0.035 / 8 s |
| 4-6 | WRONG_OCCUPANT | **Missed** (no finding) | escalate | medium | $0.032 / 9 s |
| 1-4 (clean) | none | 1st run: SCENE_MISMATCH (the shot is wider than scripted); 2nd run after the "a wider view is not a mismatch" rule: clean | escalate | medium | $0.025–0.028 / 6–7 s |
| 3-4 (clean) | none | clean | accept | high | $0.029 / 6 s |

- **Caught 4 of 5 labelled hard failures with the exact class.** Every catch came with a usable redraw instruction (e.g. "repaint pearl-white, add the rear-quarter sticker bomb, seat the Stranger inside the GT-R").
- **The miss (4-6, wrong driver) is the known weak spot:** a driver behind glass, small in frame. The inspector was *not* confident, so the pipeline escalates to a high-effort pass rather than accepting; in production an uncertain verdict never passes.
- **False positives:** one on a clean control (1-4), caused by framing; fixed in the prompt and gone on rerun. 2 of 2 clean controls now pass, one of them only at medium confidence (so it would cost one extra high-effort check).
- **Cost and speed:** about $0.03 and 6–16 s per low-effort check. A full 41-picture book is roughly $1.30 of QA if nothing escalates, more with escalations, page checks and the final audit (budget $2–3 per book on top of drawing).

### Remaining gaps (what this does not guarantee)
- QA is a strong filter, not proof of correctness. It judges what it can see at 768 px; drivers behind glass, tiny background cars and faces in crowds remain the hardest cases.
- Uncertain verdicts block rather than pass. Users will sometimes see "This picture needs another try" on a picture that was fine.
- Objects without an approved canon sheet are still text-only (locks are enforced in the prompt and by QA, but with no reference image).
- Finished comics made before this change are not re-audited; they stay viewable and downloadable as they were.
- Lettering is checked only on the rendered page (balloon far from speaker, covering a face, cut off), not against reading order or font size.
- The whole-book audit works in two-page batches with earlier appearances as references; it does not see all 12 pages at once.
