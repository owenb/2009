"use client";

import { useState } from "react";
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
import Countdown from "./Countdown";
import IntroVideo from "./IntroVideo";
import SlotChoiceModal from "./SlotChoiceModal";
import styles from "./YearCountdown.module.css";

export default function YearCountdown() {
  const [showVideo, setShowVideo] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  const handleCountdownComplete = () => {
    setShowVideo(true);
  };

  const handleVideoEnd = () => {
    setShowPopup(true);
  };

  return (
    <div className={styles.container}>
      {/* Wallet connection in top right */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000 }}>
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

      {/* Intro video */}
      <IntroVideo isVisible={showVideo} onVideoEnd={handleVideoEnd} />

      {/* Countdown animation */}
      {!showVideo && <Countdown onComplete={handleCountdownComplete} />}

      {/* Slot choice modal */}
      <SlotChoiceModal isVisible={showPopup} />
    </div>
  );
}
