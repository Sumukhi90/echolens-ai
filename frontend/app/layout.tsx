import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EchoLens AI — Conversation intelligence",
  description: "Meeting insights you can trace back to the conversation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
