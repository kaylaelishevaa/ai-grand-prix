import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nook — Shopping companion",
  description: "Try things on and talk through real Coupang products.",
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
