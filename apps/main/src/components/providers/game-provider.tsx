"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FrontendGame } from "@/lib/games/frontend";

const GameContext = createContext<FrontendGame | null>(null);

export function GameProvider({ game, children }: { game: FrontendGame; children: ReactNode }) {
  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
}

export function useGame(): FrontendGame {
  const game = useContext(GameContext);
  if (!game) throw new Error("GameProvider is required for game-scoped UI");
  return game;
}

export function useGameId() {
  return useGame().id;
}
