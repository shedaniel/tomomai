import type { Region } from "./ids";
import type { GameCapability, GameDefinition } from "./types";

export type CapabilitySet = Pick<GameDefinition, "capabilities" | "regionCapabilityOverrides">;

/** Whether the game offers the capability, and still offers it in the region when one is given. It does not check that the region is enabled. */
export function offersCapability(game: CapabilitySet, capability: GameCapability, region?: Region): boolean {
  if (!game.capabilities.includes(capability)) return false;
  return region === undefined || !game.regionCapabilityOverrides?.[region]?.includes(capability);
}
