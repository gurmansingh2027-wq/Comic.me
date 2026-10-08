import type { Metadata } from "next";
import StoryStudio from "@/components/StoryStudio";
import { onExplore, remixPresetFor } from "@/lib/comic";
import { loadComic } from "@/lib/storage";

export const metadata: Metadata = { title: "Create your comic — Comic.me" };

export default async function CreatePage(props: PageProps<"/create">) {
  // "Recreate" from Explore: /create?preset=<published comic id>
  const { preset: presetId } = await props.searchParams;
  const source = typeof presetId === "string" ? await loadComic(presetId) : null;
  const preset = source && onExplore(source) ? remixPresetFor(source) : null;
  return <StoryStudio preset={preset} />;
}
