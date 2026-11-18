"use client";

import { useSyncExternalStore } from "react";

/**
 * The tomomai userscript marks our pages with this attribute on <html> and fires this event when it loads,
 * which can be after hydration. It only steers the UI, so a page faking it gains nothing.
 */
export const USERSCRIPT_ATTRIBUTE = "data-tomomai-userscript";
export const USERSCRIPT_EVENT = "tomomai:userscript";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(USERSCRIPT_EVENT, onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [USERSCRIPT_ATTRIBUTE] });
  return () => {
    window.removeEventListener(USERSCRIPT_EVENT, onChange);
    observer.disconnect();
  };
}

/** The installed tomomai userscript's version, or null when this browser does not run it. */
export function useTomomaiUserscript(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.getAttribute(USERSCRIPT_ATTRIBUTE),
    () => null,
  );
}
