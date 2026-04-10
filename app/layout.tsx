import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "APEX Learning System",
  description: "APEX Learning System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
