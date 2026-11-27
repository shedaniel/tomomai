import type { ReactNode } from "react";
import { NetShell } from "@/components/net/net-shell";
import { loadNetPlayer } from "@/lib/net/player";

export default async function NetPlayerLayout({ children, params }: { children: ReactNode; params: Promise<{ username: string; region: string }> }) {
  const { username, region } = await params;
  const player = await loadNetPlayer(username, region);
  return (
    <NetShell base={player.base} profilePath={`/profile/${encodeURIComponent(player.username)}/${player.region}`}>
      {children}
    </NetShell>
  );
}
