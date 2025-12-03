import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ArtifactProvider } from "@/lib/context/artifact-context";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css";
import Script from "next/script";
import { MainLayout } from "@/components/main-layout";

const figtree = Figtree({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://scira-mcp-chat-indol.vercel.app"),
  title: "Smooth Client",
  description: "",
  openGraph: {
    siteName: "Smooth Client",
    url: "https://scira-mcp-chat-indol.vercel.app",
    images: [
      {
        url: "https://scira-mcp-chat-indol.vercel.app/twitter-image.png",
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Smooth Client",
    description: "",
    images: ["https://scira-mcp-chat-indol.vercel.app/twitter-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${figtree.className}`}>
        <Providers>
          <ArtifactProvider>
            <div className="flex h-dvh w-full">
              <ChatSidebar />
              <MainLayout>{children}</MainLayout>
            </div>
          </ArtifactProvider>
        </Providers>
        <Analytics />
        <SpeedInsights />
        <Script defer src="https://cloud.umami.is/script.js" data-website-id="1373896a-fb20-4c9d-b718-c723a2471ae5" />
      </body>
    </html>
  );
}
