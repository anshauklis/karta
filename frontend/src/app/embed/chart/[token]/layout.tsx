import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Karta - Embedded Chart",
  robots: { index: false, follow: false },
};

export default function EmbedChartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
