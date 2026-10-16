import type { Metadata } from "next";
import "./globals.css";
import { PreferenceInitializer } from "@/components/preference-initializer";

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
      <body><PreferenceInitializer />{children}</body>
    </html>
  );
}
