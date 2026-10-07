import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Amigo invisible 2026",
  description: "Emparejamientos de la familia",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  openGraph: {
    title: "Amigo invisible 2026",
    description: "Abuela, tú decides ❤️",
  },
};

export default function GrandmaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
