import type { Metadata } from "next";
import "./globals.css";
import { ClientReadyMarker } from "@/components/client-ready-marker";

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
      <body><ClientReadyMarker />{children}</body>
    </html>
  );
}
