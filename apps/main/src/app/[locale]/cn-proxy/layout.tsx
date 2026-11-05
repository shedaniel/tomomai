import localFont from "next/font/local";
import { requireFrontendGame } from "@/lib/games/current";

const notoSansSC = localFont({
  src: "../../../../public/res/fonts/NotoSansSC-VariableFont_wght.woff2",
  variable: "--font-noto-sans-sc",
  display: "swap",
});

export default function CnProxyLayout({ children }: { children: React.ReactNode }) {
  requireFrontendGame("maimai");
  return (
    <div
      lang="zh-CN"
      className={notoSansSC.variable}
      style={{
        fontFamily: "var(--font-inter), var(--font-noto-sans-sc), system-ui, sans-serif",
      }}
    >
      {children}
    </div>
  );
}
