import Link from "next/link";
import { DiscordIcon, ThreadsIcon, XIcon } from "@tomomai/ui";
import { getAppVersion } from "@/lib/version";

const currentYear = new Date().getFullYear();
const copyrightYears = currentYear > 2025 ? `2025-${currentYear}` : "2025";

const legalLinks = [
  { label: "Terms of Service", href: "/tos" },
  { label: "Privacy Policy", href: "/privacy" },
];

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="text-muted-foreground/80 transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  );
}

export function SiteFooter() {
  const { minor, stamp, sha } = getAppVersion();

  return (
    <footer className="mt-auto border-t border-border/40 bg-muted/20">
      <div className="container mx-auto max-w-5xl px-6 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-baseline gap-1.5 text-base font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
            >
              tomomai
              <span className="text-xs font-normal text-muted-foreground">ともマイ</span>
            </Link>
            <div className="mt-1.5 flex items-center gap-3">
              <a
                href="https://discord.gg/jZqQHr3UDq"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className="text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <DiscordIcon className="size-3.5" />
              </a>
              <a
                href="https://threads.com/shedaniel"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Threads"
                className="text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <ThreadsIcon className="size-3.5" />
              </a>
              <a
                href="https://x.com/shedaniel_sub"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X"
                className="text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </a>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            {legalLinks.map((link) => (
              <FooterLink key={link.label} href={link.href}>
                {link.label}
              </FooterLink>
            ))}
          </nav>
        </div>

        <div className="mt-4 flex flex-col gap-1.5 border-t border-border/40 pt-4 text-xs text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>&copy; {copyrightYears} S.D. Studios</span>
            <span className="text-muted-foreground/40">&middot;</span>
            <span>
              Licensed under{" "}
              <a
                href="https://github.com/shedaniel/tomomai/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                AGPL-3.0
              </a>
            </span>
          </div>
          <span className="font-mono text-muted-foreground/60">
            v{minor}.{stamp} &middot; commit{" "}
            {sha === "dev" ? (
              sha
            ) : (
              <a
                href={`https://github.com/shedaniel/tomomai/commit/${sha}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                {sha}
              </a>
            )}
          </span>
        </div>
      </div>
    </footer>
  );
}
