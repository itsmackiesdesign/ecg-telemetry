import type { Metadata } from "next";
import "./globals.css";
import {InstallApp} from '@/components/install-app';

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: {capable:true,title:'ЭКГ телеметрия',statusBarStyle:'default'},
  title: "ЭКГ телеметрия — Emergency Cardiac Care",
  description: "Mobile-first clinical decision support prototype for emergency cardiac assessment.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    apple: '/icons/icon-180.png',
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
      <body className="antialiased">{children}<InstallApp/></body>
    </html>
  );
}
