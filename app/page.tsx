"use client";

import YearCountdown from "./components/YearCountdown";

export default function Home() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000000',
      margin: 0,
      padding: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <YearCountdown />
    </div>
  );
}
