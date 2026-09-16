import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulsePoint — Emergency Cardiac Care",
  description: "Mobile-first clinical decision support prototype for emergency cardiac assessment.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
