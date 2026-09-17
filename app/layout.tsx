import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Announcement Hub",
  description: "Official announcements that reach every member, online or offline.",
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
