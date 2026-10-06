export const STEPS = ["Your story", "Style", "Characters", "Storyboard", "Your comic"] as const;
export type Step = (typeof STEPS)[number];

/** Steps that aren't built yet; shown so people can see where the flow is going. */
const COMING_SOON: Step[] = ["Characters", "Storyboard"];

export default function Stepper({ current }: { current: Step }) {
  const currentIndex = STEPS.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm font-bold">
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`flex items-center gap-2 rounded-full border-2 px-3 py-1 ${
                active ? "border-ink bg-pop" : done ? "border-ink bg-white" : "border-neutral-300 bg-white text-neutral-400"
              }`}
            >
              <span>{done ? "✓" : i + 1}</span>
              {step}
              {COMING_SOON.includes(step) && <span className="text-xs font-normal">(soon)</span>}
            </span>
            {i < STEPS.length - 1 && <span className="text-neutral-400">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
