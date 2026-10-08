import type { Metadata } from "next";
import Link from "next/link";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comic.me — turn your story into a comic",
  description: "Type your story, pick a style, and get a real comic book of your life, ready to print.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col overflow-x-clip font-sans">
        <header className="border-b-3 border-ink bg-pop">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="font-title text-3xl tracking-wide">
              Comic.me
            </Link>
            <nav className="flex items-center gap-4 text-sm font-bold">
              <Link href="/explore" className="hover:underline">Explore</Link>
              <Link href="/create" className="rounded-full border-2 border-ink bg-white px-3 py-1 hover:bg-paper">Make a comic</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</main>
      </body>
    </html>
  );
}
