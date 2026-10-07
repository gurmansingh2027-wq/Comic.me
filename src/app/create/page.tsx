import type { Metadata } from "next";
import StoryStudio from "@/components/StoryStudio";

export const metadata: Metadata = { title: "Create your comic — Comic.me" };

export default function CreatePage() {
  return <StoryStudio />;
}
