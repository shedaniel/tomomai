/**
 * Shared animation constants for Framer Motion animations
 * Provides consistent spring configurations, easing curves, and transition patterns
 */

export const SPRING_CONFIGS = {
  gentle: { type: 'spring' as const, stiffness: 200, damping: 30 },
  default: { type: 'spring' as const, stiffness: 300, damping: 25 },
  snappy: { type: 'spring' as const, stiffness: 400, damping: 20 },
  stiff: { type: 'spring' as const, stiffness: 500, damping: 30 },
}

export const EASING = {
  easeOut: [0.4, 0, 0.2, 1] as const,
}

export const STAGGER = {
  fast: 0.03,
  default: 0.05,
  slow: 0.1,
  /**
   * Calculate stagger delay with a maximum cap
   * @param index - Item index
   * @param speed - Delay multiplier (default: 0.05)
   * @param max - Maximum delay cap (default: 0.15)
   */
  calculateDelay: (index: number, speed: number = 0.05, max: number = 0.15) =>
    Math.min(index * speed, max),
}

export const TRANSITIONS = {
  fadeIn: { opacity: 0 },
  fadeInUp: { opacity: 0, y: 20 },
  fadeInDown: { opacity: 0, y: -20 },
  fadeInLeft: { opacity: 0, x: -10 },
  fadeInRight: { opacity: 0, x: 10 },
  fadeInScale: { opacity: 0, scale: 0.8 },
  scaleIn: { scale: 0.96 },
}

export const ANIMATE_TO = {
  visible: { opacity: 1, y: 0, x: 0, scale: 1 },
}

/**
 * Check if user prefers reduced motion
 */
export const shouldReduceMotion = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Get transition with reduced motion support
 */
export const getTransition = (transition: any) => {
  if (shouldReduceMotion()) {
    return { duration: 0.01 }
  }
  return transition
}
