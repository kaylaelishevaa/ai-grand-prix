import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coupi — Shopping companion",
  description: "Try things on and talk through real Coupang products.",
  icons: {
    icon: "/assets/coupi.png",
    shortcut: "/assets/coupi.png",
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
