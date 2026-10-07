"use client";

import Image from "next/image";
import { COMIC_STYLES, styleSampleUrl } from "@/lib/styles";

type Props = { value: string; onChange: (styleId: string) => void };

export default function StylePicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {COMIC_STYLES.map((style) => {
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
  );
}
