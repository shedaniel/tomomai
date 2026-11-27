"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { netBasePath } from "@/lib/net/routes";
import { NetButton, NetSelect } from "./kit";

export function NetPlayerPicker({ regions, defaultRegion }: { regions: readonly string[]; defaultRegion: string }) {
  const t = useTranslations("net.common.pickPlayer");
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [region, setRegion] = useState(defaultRegion);
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (username.trim()) router.push(netBasePath(username.trim(), region));
      }}
      style={{ display: "grid", gap: 10, justifyItems: "center" }}
    >
      <input
        aria-label={t("username")}
        placeholder={t("username")}
        value={username}
        onChange={event => setUsername(event.target.value)}
        style={{ width: "min(300px, 100%)", padding: "6px 10px", border: "2px solid #111", borderRadius: 8, fontSize: 14 }}
      />
      {regions.length > 1 && (
        <NetSelect aria-label={t("region")} value={region} onChange={event => setRegion(event.target.value)} style={{ marginTop: 0 }}>
          {regions.map(option => <option key={option} value={option}>{option.toUpperCase()}</option>)}
        </NetSelect>
      )}
      <NetButton type="submit">{t("go")}</NetButton>
    </form>
  );
}
