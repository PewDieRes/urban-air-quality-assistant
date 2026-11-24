import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Urban Air Quality Assistant",
  description:
    "Worldwide air quality forecast, household activity planner during smog, and smoke transport feature for communities.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#fbfaf8] text-stone-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
