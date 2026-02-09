import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "SKPM",
  description: "Skills Package Manager"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
