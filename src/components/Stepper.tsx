export const STEPS = ["Your story", "Style", "Characters", "Storyboard", "Your comic"] as const;
export type Step = (typeof STEPS)[number];

/** Steps that aren't built yet; shown so people can see where the flow is going. */
const COMING_SOON: Step[] = [];

/**
 * The flow at the top of every step. Steps in `available` are clickable, so people can move
 * back and forth freely where that's safe (e.g. between their story and the style).
 */
export default function Stepper({ current, available = [], onSelect }: { current: Step; available?: Step[]; onSelect?: (step: Step) => void }) {
  const currentIndex = STEPS.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm font-bold">
      {STEPS.map((step, i) => {
        const done = i < currentIndex && !COMING_SOON.includes(step);
        const active = i === currentIndex;
        const clickable = !active && !!onSelect && available.includes(step);
        const className = `flex items-center gap-2 rounded-full border-2 px-3 py-1 ${
          active ? "border-ink bg-pop" : done || clickable ? "border-ink bg-white" : "border-neutral-300 bg-white text-neutral-400"
        } ${clickable ? "cursor-pointer hover:bg-pop" : ""}`;
        const content = (
          <>
            <span>{done ? "✓" : i + 1}</span>
            {step}
            {COMING_SOON.includes(step) && <span className="text-xs font-normal">(soon)</span>}
          </>
        );
        return (
          <li key={step} className="flex items-center gap-2">
            {clickable ? (
              <button type="button" onClick={() => onSelect!(step)} className={className}>
                {content}
              </button>
            ) : (
              <span className={className} aria-current={active ? "step" : undefined}>
                {content}
              </span>
            )}
            {i < STEPS.length - 1 && <span className="text-neutral-400">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
