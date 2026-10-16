import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SpeakUp AI — English Practice",
    template: "%s | SpeakUp AI",
  },
  description: "Build English confidence with thoughtful, personal AI conversation practice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
