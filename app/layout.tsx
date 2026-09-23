import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Rock Guitar — Your AI guitar coach", description: "A conversational AI guitar coach." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
