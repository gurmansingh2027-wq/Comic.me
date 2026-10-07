"use client";

import Image from "next/image";
import { COMIC_STYLES, styleSampleUrl } from "@/lib/styles";

type Props = { value: string; onChange: (styleId: string) => void };

export default function StylePicker({ value, onChange }: Props) {
  const groups = [
    { title: "Signature styles", note: "Each one tells your story differently, not just draws it differently.", styles: COMIC_STYLES.filter((s) => s.family === "signature") },
    { title: "More styles", note: null, styles: COMIC_STYLES.filter((s) => s.family === "classic") },
  ];
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.title} className="space-y-3">
          <div>
            <h3 className="font-title text-2xl tracking-wide">{group.title}</h3>
            {group.note && <p className="text-sm text-neutral-600">{group.note}</p>}
          </div>
          <div className={`grid gap-4 ${group.title === "Signature styles" ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-4 lg:grid-cols-7"}`}>
            {group.styles.map((style) => {
              const selected = style.id === value;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => onChange(style.id)}
                  aria-pressed={selected}
                  className={`overflow-hidden rounded border-3 text-left transition ${
                    selected ? "border-ink bg-pop shadow-[4px_4px_0_#111]" : "border-neutral-300 bg-paper hover:border-ink"
                  }`}
                >
                  <Image
                    src={styleSampleUrl(style.id)}
                    alt={`${style.label} style example`}
                    width={512}
                    height={512}
                    className="aspect-square w-full bg-neutral-200 object-cover"
                  />
                  <div className="p-3">
                    <div className="text-lg font-bold">{style.label}</div>
                    <div className="text-sm text-neutral-700">{style.blurb}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
