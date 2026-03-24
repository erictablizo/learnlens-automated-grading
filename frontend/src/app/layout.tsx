import type { Metadata } from "next";
import "./globals.css";
 
export const metadata: Metadata = {
  title: "LearnLens – Automated Grading",
  description: "Smart automated exam grading powered by OCR and AI",
};
 
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
