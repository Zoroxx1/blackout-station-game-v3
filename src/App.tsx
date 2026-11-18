import { useEffect, useRef } from "react";
// @ts-ignore - plain JS game modules
import { startGame } from "./game/game.js";

let started = false;

export default function App() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (started || !ref.current) return;
    started = true;
    startGame(ref.current);
  }, []);
  return <div ref={ref} style={{ position: "fixed", inset: 0, background: "#000" }} />;
}
