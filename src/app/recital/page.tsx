import type { Metadata } from "next";
import { RecitalBrowser } from "./recital-browser";
import { getElev8ProgramData } from "@/lib/elev8-program";

export const metadata: Metadata = {
  title: "ELEV8 Program - Premier Dance",
  description: "Track dances and view the ELEV8 recital program for Premier Dance families.",
};

export default async function RecitalPage() {
  const program = await getElev8ProgramData();

  return (
    <main className="dark min-h-dvh overscroll-y-none bg-[#07080b] text-white">
      <RecitalBrowser program={program} />
    </main>
  );
}
