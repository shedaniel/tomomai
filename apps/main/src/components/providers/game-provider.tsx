"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import type { GamePresentation } from "@/lib/games/types";

const FrontendGameContext = createContext<FrontendGame | null>(null);

export function GameProvider({ game, children }: { game: FrontendGame; children: ReactNode }) {
  return <FrontendGameContext.Provider value={game}>{children}</FrontendGameContext.Provider>;
}

export function useGame(): FrontendGame {
  const game = useContext(FrontendGameContext);
  if (!game) throw new Error("GameProvider is required for game-scoped UI");
  return game;
}

export function usePresentation(): GamePresentation {
  return getGame(useGame().id).presentation;
}
