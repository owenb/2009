"use client";

import MainGame from "./components/MainGame";

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
      <MainGame />
    </div>
  );
}
