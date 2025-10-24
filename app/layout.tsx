import type { Metadata, Viewport } from "next";
import { Inter, Saira } from "next/font/google";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "../minikit.config";
import { RootProvider } from "./rootProvider";
import { GenerationProvider } from "./contexts/GenerationContext";
import GenerationNotificationBar from "./components/GenerationNotificationBar";
import GlobalWallet from "./components/GlobalWallet";
import MiniKitInitializer from "./components/MiniKitInitializer";
import "./globals.css";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: minikitConfig.miniapp.name,
    description: minikitConfig.miniapp.description,
    other: {
      "fc:miniapp": JSON.stringify({
        version: minikitConfig.miniapp.version,
        imageUrl: minikitConfig.miniapp.heroImageUrl,
        button: {
          title: `Launch ${minikitConfig.miniapp.name}`,
          action: {
            type: "launch_frame",
            name: `Launch ${minikitConfig.miniapp.name}`,
            url: minikitConfig.miniapp.homeUrl,
          },
        },
      }),
    },
  };
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const saira = Saira({
  variable: "--font-saira",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="bg-black">
      <body className={`${inter.variable} ${saira.variable} bg-black`}>
        <RootProvider>
          <GenerationProvider>
            <MiniKitInitializer />
            <GenerationNotificationBar />
            <GlobalWallet />
            <SafeArea>
              <div className="max-w-[480px] mx-auto bg-black min-h-screen">
                {children}
              </div>
            </SafeArea>
          </GenerationProvider>
        </RootProvider>
      </body>
    </html>
  );
}
