// Comic.me style recipes.
//
// A style is not a filter: it changes how the story is DIRECTED (camera, pacing, exaggeration,
// humour, cover concept) as well as how it is DRAWN (line, anatomy, colour, light, texture).
// Each recipe below is plain data, so new styles can be added here without touching other code.
//
// - `render`     how pictures look; turned into the art direction for every image.
// - `direction`  how the Comic Director stages the story in this style.
// - `cover`      how covers in this style are composed.
// - `avoid`      things to keep out of the pictures (a "negative prompt").
// - `lettering`  how our renderer letters captions and balloons.
// - `lora`       optional custom-trained style model (used once we move to FLUX-type models).
//
// Styles are described by technique and tradition, never by copying a specific artist or show.

export type LetteringFont = "comic" | "hand" | "typewriter";

export type Lettering = {
  pageColor: string;
  captionFill: string;
  captionInk: string;
  captionFont: LetteringFont;
  balloonFont: LetteringFont;
  /** Balloon fill and outline (default white with black ink). */
  balloonFill?: string;
  balloonInk?: string;
  /** Outline colours per speaker (by cast order), for styles where lettering is part of the fun. */
  speakerAccents?: string[];
  /** Sound-effect lettering colours. */
  sfxFill?: string;
  sfxOutline?: string;
  /** Pop styles: a starburst behind each sound effect. */
  sfxBurst?: string;
  /** Print texture added by our renderer over the art (halftone dots), so the model doesn't have to fake it. */
  texture?: "halftone";
};

export type StyleRecipe = {
  id: string;
  label: string;
  blurb: string;
  /** Signature styles are shown first, larger. */
  family: "signature" | "classic";
  render: {
    signature: string;
    linework: string;
    anatomy: string;
    colour: string;
    lightingAndShadow: string;
    detailAndTexture: string;
  };
  direction: {
    /** How this style interprets a story: what it exaggerates, what it plays for laughs or drama. */
    interpretation: string;
    camera: string;
    pacing: string;
    /** Rough number of panels per page this style likes (the director still varies it). */
    panelDensity: "sparse" | "balanced" | "dense";
    /** How people talk in this style: given to the dialogue writer. */
    dialogue: string;
    /** What a hero panel (the book's 1-2 jaw-droppers) looks like in this style. */
    hero: string;
  };
  cover: string;
  avoid: string[];
  lettering: Lettering;
  lora?: { url: string; trigger: string; scale?: number };
};

/** A recipe plus the prompt text derived from it (what the rest of the app uses). */
export type ComicStyle = StyleRecipe & {
  /** Art direction sent with every image of this style. */
  art: string;
  /** Storytelling direction given to the Comic Director and cover art director. */
  storytelling: string;
};

const classicLettering: Lettering = {
  pageColor: "#ffffff",
  captionFill: "#fde68a",
  captionInk: "#111111",
  captionFont: "comic",
  balloonFont: "comic",
};

/** Kept out of every picture, whatever the style. */
const ALWAYS_AVOID = [
  "any text, letters, logos or watermarks",
  "recognisable copyrighted characters, mascots or monsters from films, comics or games",
  "extra or missing fingers, warped hands or faces",
];

const RECIPES: StyleRecipe[] = [
  // --- Signature styles: radically different visual grammars --------------------------------
  {
    id: "prestige",
    label: "Prestige",
    blurb: "Blockbuster superhero-comic polish",
    family: "signature",
    render: {
      signature:
        "Premium mainstream Western superhero comic book art at the very top of the industry: unmistakably an inked and digitally coloured comic panel (not a painting or photo), the quality of a flagship superhero series, original characters only.",
      linework: "Bold black ink contour lines on every form, varied line weight, feathered hatching and big spot blacks in the shadows; crisp, professional inking.",
      anatomy: "Superb, grounded anatomy with heroic proportions; expressive hands and faces; dynamic, weight-bearing poses with clear gesture lines.",
      colour:
        "Rich, professional digital colouring: a controlled scene palette built on two dominant hues (warm key vs cool shadow) with one accent; smooth gradients, glowing highlights, coloured rim light, atmospheric depth.",
      lightingAndShadow: "Cinematic lighting: strong key light, rim lights, dramatic cast shadows, volumetric light shafts.",
      detailAndTexture:
        "Richly detailed, believable environments with real texture (weathered stone, fabric folds, metal sheen); intricate rendering with fine hatching in the midtones; subtle grain and halftone in shadows; every panel polished like a splash page. Selective detail: the focal point is the most finished thing in the frame.",
    },
    direction: {
      interpretation:
        "Treat ordinary life as an epic. Find the heroic beat in every moment: a missed flight becomes a desperate sprint; a job offer becomes a turning point lit like a revelation.",
      camera: "Extreme perspectives: low hero angles, high overheads, deep foreshortening, wide establishing shots with scale contrast, intense close-ups on eyes and hands.",
      pacing: "Build with tight panels, then release into big panels and full-page splashes at climaxes. End pages on cliffhangers.",
      panelDensity: "balanced",
      dialogue: "Restrained and dramatic: few words that carry weight, clipped lines under pressure, a quiet line before the big moment. Captions like a narrator who knows this matters. Let splash panels breathe with little or no text.",
      hero: "A jaw-dropping splash: extreme perspective (worm's-eye or vertiginous overhead), a bold foreground shape framing the hero, a silhouette against light, confident massed blacks, a richly detailed environment with scale, dramatic rim light and volumetric light, clear visual hierarchy, anatomy and pose with real weight and foreshortening.",
    },
    cover:
      "Blockbuster cover: one iconic, larger-than-life focal figure or moment, dramatic perspective, epic scale, a two-tone palette (e.g. amber against steel blue, or crimson glow against cool shadow), and a bold title space.",
    avoid: ["soft painterly rendering without ink lines", "stiff or static poses", "flat lighting", "muddy colours", "plain empty backgrounds"],
    lettering: { ...classicLettering, captionFill: "#fef08a", sfxFill: "#fde047", sfxOutline: "#7f1d1d" },
  },
  {
    id: "chaos",
    label: "Chaos",
    blurb: "Absurd sci-fi comedy, weird and wild",
    family: "signature",
    render: {
      signature:
        "An original adult animated sci-fi comedy look: simple, bold, readable cartoon shapes; deliberately weird and funny; nothing copied from any existing show.",
      linework: "Clean, slightly wobbly uniform outlines; simple geometric construction; big expressive silhouettes.",
      anatomy: "Exaggerated, rubbery cartoon anatomy: oversized heads, noodly limbs, bulging or tiny eyes, extreme reaction faces, sweat drops and gags; aliens with improbable body plans.",
      colour: "Flat, punchy cel colours with acid accents (slime green, portal purple, hazard orange); simple two-tone shading.",
      lightingAndShadow: "Simple cel shadows; glowing sci-fi light sources (portals, screens, lasers) cast coloured light.",
      detailAndTexture: "Clean backgrounds packed with absurd sight gags: sentient objects, strange machines, ridiculous signage shapes (no readable text).",
    },
    direction: {
      interpretation:
        "Reinterpret every ordinary moment through escalating absurd sci-fi logic: the airport scanner becomes sentient, the boss is a three-eyed slug, a breakup triggers a portal storm. Keep the real emotional beat underneath, played deadpan. Every page lands a visual punchline.",
      camera: "Mostly flat, sitcom-like framing for comic timing, interrupted by sudden extreme close-ups on horrified or deadpan faces, and characters staring at the reader.",
      pacing: "Fast: setup, escalation, punchline. Use beat panels (a silent reaction) before the punchline. Small panels for timing, one big panel for the payoff.",
      panelDensity: "dense",
      dialogue: "Absurd and comedic: deadpan reactions to ridiculous events, escalating banter, one-liners, characters talking past each other, aliens and machines with strange voices (use the robot balloon). Short lines; the punchline lands in the last balloon or a silent beat.",
      hero: "The biggest visual gag of the book at full scale: maximal absurd detail, a ridiculous creature or machine, extreme squash-and-stretch reaction, glowing sci-fi light, sight gags hidden everywhere, the hero deadpan in the middle of it.",
    },
    cover: "Absurd visual gag: the hero in a ridiculous sci-fi predicament with a deadpan expression, weird creatures, a portal or explosion, bold flat colours.",
    avoid: ["realistic rendering", "gritty shading", "copying any existing cartoon's characters or exact look"],
    lettering: { ...classicLettering, captionFill: "#bbf7d0", speakerAccents: ["#15803d", "#7e22ce", "#c2410c", "#0369a1"], sfxFill: "#a3e635", sfxOutline: "#2e1065" },
  },
  {
    id: "pop",
    label: "Pop",
    blurb: "Ben-Day dots, starbursts, BIG sound effects",
    family: "signature",
    render: {
      signature:
        "Bold retro pop-art comic illustration, like a classic four-colour newsprint comic blown up to poster size: graphic, loud and fun, original characters only.",
      linework: "Thick, confident black outlines of even weight around every shape; simple, crisp interior lines; no sketchiness.",
      anatomy: "Expressive, slightly stylised figures with big readable gestures and exaggerated reactions; clean simplified faces with strong expressions.",
      colour: "Flat primary colours (fire-engine red, sunshine yellow, cobalt blue) plus black and white, with bright secondary accents (lime, purple, orange) for backgrounds; no gradients.",
      lightingAndShadow: "Graphic lighting: shadows as solid black shapes or halftone-dot areas; radiating speed lines and colour bursts behind action.",
      detailAndTexture:
        "Ben-Day dot fills in skin tones and backgrounds, radial speed lines, starburst and explosion shapes, smoke puffs and comic clouds; simple but punchy backgrounds that frame the action.",
    },
    direction: {
      interpretation:
        "Make every moment POP: ordinary beats become explosive comic-book events, with big reactions, visual sound and graphic energy. Fun first, feelings underneath.",
      camera: "Punchy, close and dynamic: tilted angles, smash-in close-ups on reactions, figures bursting toward the reader.",
      pacing: "Fast and rhythmic: quick beats in small panels, then an explosive big panel. This style may use the dynamic layouts (slash-2, diagonal-3, zigzag-4) more often than others, at most every other page.",
      panelDensity: "balanced",
      dialogue: "Punchy and playful: exclamations, short shouted lines, comic exaggeration, one-word reactions. Sound effects are part of the storytelling: use them often (but not on every panel).",
      hero: "An explosive pop splash: the hero bursting out of a giant starburst, radial speed lines, huge halftone dots, primary colours at full volume, a big graphic shape behind the figure.",
    },
    cover: "Pop-art poster cover: one bold figure or object against a giant starburst or radial burst, flat primary colours, Ben-Day dots, a chunky title.",
    avoid: ["realistic rendering", "soft gradients", "muted or muddy colours", "painterly texture"],
    lettering: { ...classicLettering, captionFill: "#fde047", speakerAccents: ["#111111", "#1d4ed8", "#dc2626", "#7c3aed"], sfxFill: "#fde047", sfxOutline: "#111111", sfxBurst: "#dc2626", texture: "halftone" },
  },
  {
    id: "ink",
    label: "Ink",
    blurb: "Elegant hand-drawn line art",
    family: "signature",
    render: {
      signature:
        "Beautiful, intentional hand-drawn ink illustration, clearly drawn by a human hand with pen and brush on paper: not a coloured image with an edge filter.",
      linework: "Expressive brush and fine-nib pen lines with natural pressure variation; confident economy of line; crosshatching and stippling for tone.",
      anatomy: "Elegant, slightly stylised naturalistic figures; gesture-first drawing; faces suggested with a few precise marks.",
      colour: "Black ink on warm off-white paper, with at most one spot accent colour (vermilion or indigo wash) used sparingly for emphasis.",
      lightingAndShadow: "Light shown through hatching density and solid blacks; generous white space as light.",
      detailAndTexture: "Visible paper grain, ink pooling and dry-brush texture; backgrounds sparse and suggestive, detailed only where it matters.",
    },
    direction: {
      interpretation:
        "Say more with less. Find the quiet, symbolic image in each moment: a clock, an empty chair, a tiny plane leaving. Understated, wry, literary; let silence do the work.",
      camera: "Calm, composed framing with lots of negative space; small figures in big spaces; telling close-ups of hands and objects.",
      pacing: "Unhurried: fewer, larger panels; silent panels; one idea per panel.",
      panelDensity: "sparse",
      dialogue: "Sparse and literary: say less. Silence and captions do most of the work; dialogue is short, natural and specific. A single line can end a page.",
      hero: "A masterful ink drawing: bold composition with a dramatic graphic shape, rich crosshatching and solid blacks against generous white paper, one accent colour used for the single thing that matters, an environment drawn with architectural care.",
    },
    cover: "Minimal, elegant ink composition: a single symbolic image in lots of white space, one accent colour, gallery-print quality.",
    avoid: ["full-colour painting", "digital gradients", "photographic rendering", "heavy outlines on everything"],
    lettering: { pageColor: "#fbf8f1", captionFill: "#fbf8f1", captionInk: "#1c1917", captionFont: "hand", balloonFont: "hand", balloonFill: "#fbf8f1", balloonInk: "#1c1917", sfxFill: "#fbf8f1", sfxOutline: "#1c1917" },
  },
  {
    id: "manga",
    label: "Manga",
    blurb: "Black & white, screentones, big emotions",
    family: "signature",
    render: {
      signature: "High-quality Japanese manga art in black and white, original characters only.",
      linework: "Clean, precise G-pen line art with tapered strokes; crisp hair rendering; speed lines and focus lines for motion and emotion.",
      anatomy: "Manga proportions with expressive, detailed eyes; dramatic emotional faces; chibi or comedic simplification only for comic beats.",
      colour: "Black and white only, with grey screentones and gradient tones; no colour.",
      lightingAndShadow: "Screentone gradients, solid black shadows, sparkle and flare effects for emotional moments.",
      detailAndTexture: "Detailed, accurate backgrounds for establishing shots; tone patterns, flowers or sparkles behind emotional close-ups.",
    },
    direction: {
      interpretation:
        "Amplify feelings. Let emotional beats breathe with reaction shots, inner thoughts and dramatic close-ups; switch to energetic action framing for big moments.",
      camera: "Cinematic manga staging: extreme emotional close-ups, eye shots, dynamic diagonals, impact frames, wide establishing shots for new places.",
      pacing: "Decompressed: several small reaction panels around one big emotional or action panel. Use thought balloons generously.",
      panelDensity: "dense",
      dialogue: "Manga emotional rhythm: short exclamations, trailing pauses (…), inner thoughts in thought balloons, a beat of silence before the emotional line. Reactions say as much as words.",
      hero: "An impact frame: dynamic speed lines or focus lines, an extreme angle, dramatic screentone lighting, the emotional peak in a huge close-up or a full-body action freeze.",
    },
    cover: "Manga volume cover: a striking character-focused composition with dynamic pose, dramatic screentone or limited-colour treatment.",
    avoid: ["colour", "Western superhero rendering", "copying specific manga characters"],
    lettering: { ...classicLettering, captionFill: "#ffffff", sfxFill: "#ffffff", sfxOutline: "#111111" },
  },

  // --- Classic styles ------------------------------------------------------------------------
  {
    id: "ligne-claire",
    label: "Clear Line",
    blurb: "Classic European adventure albums",
    family: "classic",
    render: {
      signature: "European 'ligne claire' (clear line) comic album style.",
      linework: "Uniform-weight clean black outlines everywhere, no hatching.",
      anatomy: "Slightly simplified, cartoonish characters against realistic settings.",
      colour: "Flat bright colours with almost no shading.",
      lightingAndShadow: "Even daylight, minimal shadows.",
      detailAndTexture: "Realistic, detailed backgrounds and vehicles; every panel composed like a postcard.",
    },
    direction: {
      interpretation: "Light adventure with gentle humour and clear cause and effect.",
      camera: "Clear, readable staging at eye level; wide shots that show the whole scene.",
      pacing: "Steady, even rhythm; regular grids.",
      panelDensity: "dense",
      dialogue: "Crisp adventure banter: clear, witty, characterful lines; a little exposition through dialogue; each person instantly identifiable by how they talk.",
      hero: "A grand clear-line vista: an architecturally precise, detailed environment with tiny readable figures, clean even lines, flat bright colour, perfect clarity at scale.",
    },
    cover: "Adventure-album cover: the heroes mid-adventure in a vivid, detailed setting.",
    avoid: ["hatching", "gradients", "dark gritty tones"],
    lettering: { ...classicLettering, captionFill: "#fef9c3" },
  },
  {
    id: "bold-graphic",
    label: "Bold Graphic",
    blurb: "Flat shapes, big blacks, design-led",
    family: "classic",
    render: {
      signature:
        "Modern design-led comic illustration in the spirit of contemporary variant covers: confident brush-inked figures, flat graphic colour, strong design, original characters only.",
      linework: "Clean, bold brush-ink contours with tapered strokes; economical interior lines; solid black masses defining form.",
      anatomy: "Stylised, elegant anatomy with strong silhouettes and grounded, characterful poses; simplified faces with clear expressions.",
      colour: "Flat colour fields from a restrained palette (two or three colours plus black and off-white), sometimes a single bold background colour.",
      lightingAndShadow: "Hard-edged shadow shapes in solid black or one darker tone; no soft gradients; light shown by shape, not rendering.",
      detailAndTexture:
        "Minimal backgrounds made of graphic shapes, colour bands and geometric patterns; generous negative space; a slight print texture.",
    },
    direction: {
      interpretation: "Find the iconic image in every beat: distil scenes to strong shapes and gestures, like a series of designed posters with feeling.",
      camera: "Clean, considered compositions: off-centre figures, strong silhouettes, bold crops, unusual negative space.",
      pacing: "Measured: a few bold panels per page, each one a designed image; occasional wordless panels.",
      panelDensity: "sparse",
      dialogue: "Cool and understated: short, sharp lines, wit over volume; captions minimal.",
      hero: "A poster-worthy hero image: a striking silhouette or off-centre figure against bold colour shapes and negative space, design and illustration in perfect balance.",
    },
    cover:
      "Design-led cover: the figure off-centre or cropped, flat geometric colour shapes behind, lots of negative space, illustration and typography working together.",
    avoid: ["busy painterly rendering", "soft gradients", "cluttered backgrounds", "photographic lighting"],
    lettering: { ...classicLettering, captionFill: "#f5f0e6", sfxFill: "#ffffff", sfxOutline: "#111111" },
  },
  {
    id: "euro-comedy",
    label: "Euro Comedy",
    blurb: "Big noses, big crowds, big laughs",
    family: "classic",
    render: {
      signature:
        "Classic European humour-album cartooning, original characters only: warm, energetic, caricatured and hugely readable, full of physical comedy.",
      linework: "Lively, confident pen lines with a slight swell; clean contours; expressive motion lines and dust clouds.",
      anatomy:
        "Caricature: big noses, round bodies, small legs, big hands and feet; extremely expressive faces; squash-and-stretch exaggeration in every action; identity markers (glasses, turban, beard, hairstyle) kept recognisable.",
      colour: "Bright, flat, cheerful colours with simple shading; clear colour separation between characters.",
      lightingAndShadow: "Simple, even daylight with soft cast shadows; mood through colour, not darkness.",
      detailAndTexture:
        "Busy, funny crowd scenes and detailed, believable settings full of background gags (a dog stealing food, an uncle asleep, a goat on a scooter).",
    },
    direction: {
      interpretation:
        "Play the story as a big-hearted comedy: every scene has a gag, crowds are a chorus of reactions, slapstick escalates, and the emotional moment lands because we've laughed first.",
      camera: "Wide, theatrical staging so the whole gag reads in one glance; cut to close-ups only for reaction punchlines.",
      pacing: "A gag per page: setup, escalation, a silent beat, punchline. One big crowd splash at the climax.",
      panelDensity: "dense",
      dialogue: "Comic banter, puns, comic insults, deadpan asides from the crowd; short lines; sound effects for every bump (BONK, SPLAT).",
      hero: "A giant, jam-packed crowd splash at the comic climax: dozens of distinct caricatured reactions, sight gags everywhere, the heroes at the centre of glorious chaos.",
    },
    cover: "A comedy album cover: the heroes mid-pratfall or mid-celebration, a crowd of caricatured faces, bright flat colour, a visual gag.",
    avoid: ["realistic proportions", "gritty shading", "dark moody lighting", "copying any existing comic's characters or look"],
    lettering: { ...classicLettering, captionFill: "#fef3c7", sfxFill: "#ffffff", sfxOutline: "#111111" },
  },
  {
    id: "newspaper",
    label: "Sunday Strip",
    blurb: "Warm, retro newspaper funnies",
    family: "classic",
    render: {
      signature: "Vintage Sunday newspaper comic strip.",
      linework: "Brush-ink outlines; simple rounded characters with big noses and expressive gestures.",
      anatomy: "Cartoon proportions, gentle slapstick body language.",
      colour: "Limited warm palette printed on slightly yellowed newsprint with visible Ben-Day dots and slight misregistration.",
      lightingAndShadow: "Flat, printed colour; little shading.",
      detailAndTexture: "Simple backgrounds; paper texture.",
    },
    direction: {
      interpretation: "Warm and funny; every page lands a small gag or a sweet punchline.",
      camera: "Flat, stage-like framing.",
      pacing: "Strip rhythm: setup, beat, punchline.",
      panelDensity: "dense",
      dialogue: "Setup and punchline, like a gag strip: short, snappy, a running joke, the last line lands the laugh.",
      hero: "The punchline panel drawn big and bold: exaggerated reaction, clear staging, maximum comic timing.",
    },
    cover: "A warm, funny cover gag starring the main characters.",
    avoid: ["realistic rendering", "dramatic lighting"],
    lettering: { ...classicLettering, pageColor: "#fbf3df", captionFill: "#fef3c7" },
  },
  {
    id: "cartoon",
    label: "Modern Cartoon",
    blurb: "Bright, friendly, animated-film feel",
    family: "classic",
    render: {
      signature: "Modern animated-film cartoon illustration.",
      linework: "Clean thick outlines.",
      anatomy: "Friendly rounded shapes and appealing stylised proportions; expressive poses and faces.",
      colour: "Bright cheerful colours with soft cel shading and gentle gradients.",
      lightingAndShadow: "Warm, glowing lighting.",
      detailAndTexture: "Lively but uncluttered backgrounds.",
    },
    direction: {
      interpretation: "Upbeat and heartfelt, with playful humour and expressive reactions.",
      camera: "Friendly, varied framing with some dynamic angles.",
      pacing: "Balanced, bouncy rhythm.",
      panelDensity: "balanced",
      dialogue: "Warm, funny and family-friendly: playful teasing, heartfelt lines kept simple, kids sounding like kids.",
      hero: "A cinematic animated-film moment: dynamic camera, glowing light, expressive acting, a richly detailed world.",
    },
    cover: "A warm, joyful character moment with bright colours.",
    avoid: ["gritty textures", "harsh shadows"],
    lettering: classicLettering,
  },
  {
    id: "graphic-novel",
    label: "Graphic Novel",
    blurb: "Painterly, grounded, literary",
    family: "classic",
    render: {
      signature: "Contemporary literary graphic novel illustration.",
      linework: "Loose, confident ink lines.",
      anatomy: "Grounded realistic proportions with subtle acting in faces and hands.",
      colour: "Painterly digital colour with visible brush texture; muted naturalistic palette with one warm accent per scene.",
      lightingAndShadow: "Soft natural light.",
      detailAndTexture: "Atmospheric environments.",
    },
    direction: {
      interpretation: "Reflective and intimate; a thoughtful narrator voice in captions; silent panels allowed.",
      camera: "Observational, film-like framing.",
      pacing: "Slow and considered.",
      panelDensity: "balanced",
      dialogue: "Conversational and naturalistic: people interrupt, hesitate and talk around what they mean. Subtext over statements.",
      hero: "A painterly, cinematic full-page moment: dramatic composition and light, deep atmosphere, a quiet emotional peak.",
    },
    cover: "A quiet, evocative painted image with a literary feel.",
    avoid: ["superhero exaggeration", "glossy rendering"],
    lettering: { ...classicLettering, captionFill: "#f5f0e6", captionFont: "hand", balloonFont: "hand" },
  },
  {
    id: "noir",
    label: "Noir",
    blurb: "Moody shadows, high contrast",
    family: "classic",
    render: {
      signature: "Graphic noir comic art.",
      linework: "Heavy brush ink.",
      anatomy: "Realistic, angular figures in silhouette.",
      colour: "Stark high-contrast black and white with a single accent colour of deep muted red, used sparingly.",
      lightingAndShadow: "Large areas of solid black shadow; venetian-blind and streetlight lighting; rain, smoke and silhouettes.",
      detailAndTexture: "Gritty urban texture.",
    },
    direction: {
      interpretation: "First-person, hard-boiled narrator captions with dry wit, even for happy stories.",
      camera: "Dramatic low and high angles; faces half in shadow.",
      pacing: "Measured, suspenseful.",
      panelDensity: "balanced",
      dialogue: "Clipped and hardboiled: terse dialogue, wry first-person captions, metaphors that bite, nothing said directly.",
      hero: "A noir showpiece: extreme chiaroscuro, a silhouette in a doorway or rain-soaked street, venetian-blind shadows, one bold shape of light.",
    },
    cover: "A moody silhouette in hard light and shadow, with one red accent.",
    avoid: ["bright colours", "soft cheerful lighting"],
    lettering: { pageColor: "#0b0b0b", captionFill: "#111111", captionInk: "#f5f5f5", captionFont: "typewriter", balloonFont: "comic", sfxFill: "#f5f5f5", sfxOutline: "#0b0b0b" },
  },
  {
    id: "watercolor",
    label: "Watercolour Storybook",
    blurb: "Soft, dreamy, heartfelt",
    family: "classic",
    render: {
      signature: "Soft watercolour storybook illustration.",
      linework: "Delicate pencil and fine-ink linework.",
      anatomy: "Slightly simplified, charming characters with tender expressions.",
      colour: "Translucent washes of pastel colour with soft blooms and bleeding edges.",
      lightingAndShadow: "Warm nostalgic golden light.",
      detailAndTexture: "Textured cold-press paper visible.",
    },
    direction: {
      interpretation: "Tender and nostalgic, like a family storybook read aloud.",
      camera: "Gentle, eye-level framing.",
      pacing: "Calm, with large picture-book panels.",
      panelDensity: "sparse",
      dialogue: "Gentle and intimate: soft, warm lines, small honest words between people who love each other, lots of silence.",
      hero: "A luminous, dreamy full-page painting: soft light, a vast gentle landscape or a tender close moment, delicate detail.",
    },
    cover: "A tender, glowing storybook scene.",
    avoid: ["hard digital edges", "harsh contrast"],
    lettering: { ...classicLettering, pageColor: "#fffaf0", captionFill: "#fdf6e3", captionFont: "hand", balloonFont: "hand" },
  },
  {
    id: "desi-classic",
    label: "Desi Classic",
    blurb: "Vintage Indian illustrated comics",
    family: "classic",
    render: {
      signature: "Vintage Indian illustrated comic book style from the 1970s-80s.",
      linework: "Detailed realistic figure drawing with confident ink outlines.",
      anatomy: "Expressive faces and graceful classical poses.",
      colour: "Flat, rich printed colours (saffron, deep blue, maroon, leaf green) with subtle period printing texture.",
      lightingAndShadow: "Simple printed shading.",
      detailAndTexture: "Ornate clothing, jewellery and architectural detail; vivid Indian settings.",
    },
    direction: {
      interpretation: "Storyteller narration with warmth and gravitas, as if retelling a family legend.",
      camera: "Classical, theatrical staging.",
      pacing: "Steady, narrated.",
      panelDensity: "balanced",
      dialogue: "Storyteller narration with warmth and gravitas, like a family legend retold; natural Hinglish where people would really say it.",
      hero: "A grand, ornate classic-comic tableau: heroic staging, rich period detail, bold flat colour and dramatic light.",
    },
    cover: "A heroic, ornate scene in the style of a classic illustrated legend.",
    avoid: ["modern glossy rendering"],
    lettering: { ...classicLettering, captionFill: "#fde68a" },
  },
];

function artFor(recipe: StyleRecipe): string {
  const r = recipe.render;
  const avoid = [...recipe.avoid, ...ALWAYS_AVOID];
  return [
    r.signature,
    `Line: ${r.linework}`,
    `Figures: ${r.anatomy}`,
    `Colour: ${r.colour}`,
    `Light: ${r.lightingAndShadow}`,
    `Detail: ${r.detailAndTexture}`,
    `Avoid: ${avoid.join("; ")}.`,
    recipe.lora ? `(${recipe.lora.trigger})` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function storytellingFor(recipe: StyleRecipe): string {
  const d = recipe.direction;
  const density = { sparse: "about 2-3 panels per page", balanced: "about 3-5 panels per page", dense: "about 4-6 panels per page" }[d.panelDensity];
  return [
    `Interpretation: ${d.interpretation}`,
    `Camera: ${d.camera}`,
    `Pacing: ${d.pacing} Typically ${density}.`,
    `Dialogue: ${d.dialogue}`,
    `Hero panels: ${d.hero}`,
    `Covers: ${recipe.cover}`,
  ].join(" ");
}

export const COMIC_STYLES: ComicStyle[] = RECIPES.map((recipe) => ({
  ...recipe,
  art: artFor(recipe),
  storytelling: storytellingFor(recipe),
}));

/** Old style ids that were renamed or merged, so earlier comics still open. */
const ALIASES: Record<string, string> = { superhero: "prestige" };

export function getStyle(id: string): ComicStyle | undefined {
  const resolved = ALIASES[id] ?? id;
  return COMIC_STYLES.find((style) => style.id === resolved);
}

export function styleSampleUrl(id: string): string {
  return `/styles/${ALIASES[id] ?? id}.webp`;
}
