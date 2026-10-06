import type { Metadata } from "next";
import Link from "next/link";
import { comicFont, titleFont } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comic.me — turn your story into a comic",
  description: "Type your story, pick a style, and get a 6-panel comic in minutes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${titleFont.variable} ${comicFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b-3 border-ink bg-pop">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
            <Link href="/" className="font-title text-3xl tracking-wide">
              Comic.me
            </Link>
            <span className="hidden text-sm font-bold sm:block">Your story, drawn as a comic</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">{children}</main>
      </body>
    </html>
  );
}
