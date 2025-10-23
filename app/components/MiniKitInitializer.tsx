"use client";

import { useEffect } from "react";
import sdk from "@farcaster/miniapp-sdk";

/**
 * Initializes the Farcaster MiniKit SDK and signals when the app is ready to display.
 * This component must be rendered early in the app lifecycle to prevent infinite splash screen.
 */
export default function MiniKitInitializer() {
  useEffect(() => {
    async function initializeSdk() {
      try {
        // Signal to the mini app client that we're ready to display
        // disableNativeGestures: true allows our swipe gestures to work without conflicts
        await sdk.actions.ready({
          disableNativeGestures: true,
        });

        console.log("✅ MiniKit SDK ready - native gestures disabled");
      } catch (error) {
        console.error("Failed to initialize MiniKit SDK:", error);
      }
    }

    initializeSdk();
  }, []);

  // This component doesn't render anything - it just initializes the SDK
  return null;
}
