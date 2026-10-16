/**
 * Small flat icons that take the colour of the text around them (currentColor), so they match every
 * theme. Used instead of emoji, which render glossy and multicolour and ignore the theme.
 */

export function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg className="icon-lock" viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M5 7V5.2a3 3 0 0 1 6 0V7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <rect x="2.9" y="7" width="10.2" height="7.6" rx="1.9" />
    </svg>
  )
}
