import type { HapticInput, TriggerOptions } from "web-haptics"

let instance: import("web-haptics").WebHaptics | null = null
let loading = false

async function getInstance() {
  if (instance) return instance
  if (loading) return null
  if (typeof window === "undefined") return null
  loading = true
  try {
    const { WebHaptics } = await import("web-haptics")
    instance = new WebHaptics()
    return instance
  } catch {
    return null
  } finally {
    loading = false
  }
}

// Eagerly init on first import in browser
if (typeof window !== "undefined") {
  getInstance()
}

/**
 * Trigger haptic feedback synchronously (may block briefly).
 */
function triggerHapticSync(input?: HapticInput, options?: TriggerOptions) {
  if (instance) {
    instance.trigger(input, options)
  } else {
    getInstance().then((h) => h?.trigger(input, options))
  }
}

/**
 * Trigger haptic feedback on the next frame so it never blocks the current event handler.
 *
 * Uses built-in presets:
 * "light" | "medium" | "heavy" | "soft" | "rigid" | "selection" |
 * "success" | "warning" | "error" | "nudge" | "buzz"
 * Or pass a duration in ms, or a custom pattern array.
 */
export function triggerHaptic(input?: HapticInput, options?: TriggerOptions) {
  requestAnimationFrame(() => triggerHapticSync(input, options))
}
