import type { Metadata } from "next";
import "./globals.css";
 
export const metadata: Metadata = {
  title: "LearnLens – Automated Grading",
  description: "AI-powered exam grading system",
};
 
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}