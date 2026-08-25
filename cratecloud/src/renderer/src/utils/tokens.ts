// JS mirror of assets/tokens.css, for any future non-CSS context (React
// Native's StyleSheet doesn't read CSS custom properties). Must be kept in
// sync with tokens.css by hand — same note lives at the top of that file.
//
// COLORS/SPACING/RADIUS/CONTROL_HEIGHT below mirror real, currently-defined
// CSS custom properties exactly. DURATION does not — no --duration-* tokens
// were ever added to tokens.css (main.css still uses literal transition
// values like `.15s` throughout); these three values are carried over from
// the original design-audit proposal as a forward-looking placeholder, not
// a mirror of something that exists in CSS today.

export const COLORS = {
  brand: '#7f77dd',
  brandLight: '#a09be8',
  brandDark: '#534ab7',
  success: '#1d9e75',
  warning: '#d8a03a',
  danger: '#d85a30',
  info: '#5d9fd8',
} as const

export const SPACING = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const

export const RADIUS = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const

export const CONTROL_HEIGHT = {
  sm: 28,
  md: 32,
  lg: 36,
  touch: 44,
} as const

// Not backed by a real CSS token yet — see file header note.
export const DURATION = {
  fast: 100,
  base: 200,
  slow: 300,
} as const
