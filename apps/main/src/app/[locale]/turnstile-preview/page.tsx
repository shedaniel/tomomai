import {
  TurnstilePreclearance,
  TURNSTILE_TEST_SITE_KEY,
} from "@tomomai/ui/turnstile";
import { notFound } from "next/navigation";

export default function TurnstilePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <TurnstilePreclearance
      siteKey={TURNSTILE_TEST_SITE_KEY}
      preview
    />
  );
}
