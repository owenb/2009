"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect
} from "@coinbase/onchainkit/wallet";
import {
  Avatar,
  Name,
  Identity,
  Address
} from "@coinbase/onchainkit/identity";

export default function GlobalWallet() {
  const { address } = useAccount();
  const [walletVisible, setWalletVisible] = useState(true);
  const [walletOpacity, setWalletOpacity] = useState(1);

  // Fade out wallet after connection
  useEffect(() => {
    if (!address) {
      // User not connected - keep wallet visible
      setWalletVisible(true);
      setWalletOpacity(1);
      return;
    }

    // User just connected - show for 3 seconds then fade out
    setWalletVisible(true);
    setWalletOpacity(1);

    const fadeTimer = setTimeout(() => {
      setWalletOpacity(0);
    }, 3000);

    const hideTimer = setTimeout(() => {
      setWalletVisible(false);
    }, 4000); // Extra 1 second for fade transition

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [address]);

  if (!walletVisible) {
    return null;
  }

  return (
    <div
      className="fixed top-5 right-5 z-[1000] transition-opacity duration-1000 ease-out"
      style={{
        opacity: walletOpacity,
        pointerEvents: walletOpacity === 0 ? 'none' : 'auto'
      }}
    >
      <Wallet>
        <ConnectWallet>
          <Avatar className="h-6 w-6" />
          <Name />
        </ConnectWallet>
        <WalletDropdown>
          <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
            <Avatar />
            <Name />
            <Address />
          </Identity>
          <WalletDropdownDisconnect />
        </WalletDropdown>
      </Wallet>
    </div>
  );
}
