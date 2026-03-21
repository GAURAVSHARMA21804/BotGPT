import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "BOT GPT",
  description: "Chat UI for BOT GPT monolith"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
