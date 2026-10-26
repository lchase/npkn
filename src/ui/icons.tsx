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

/** Shared 16px stroke-icon frame for the sidebar: round caps, 1.5 stroke, no fill. */
function Stroke({ size = 16, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

export const TodosIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><circle cx="8" cy="8" r="6" /><path d="m5.4 8.1 1.8 1.8 3.4-3.7" /></Stroke>
)
export const SettingsIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6" /><circle cx="10" cy="5" r="1.5" /><circle cx="6" cy="11" r="1.5" /></Stroke>
)
export const PageIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M4 2.5h5.2L12 5.3v8.2H4z" /><path d="M9 2.7v2.8h2.8M6 8.5h4M6 10.8h4" /></Stroke>
)
export const PlusIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M8 3.5v9M3.5 8h9" /></Stroke>
)
export const ImportIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M8 2.5v7M5.2 6.9 8 9.7l2.8-2.8M3 12.5h10" /></Stroke>
)
export const ExportIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M8 9.5v-7M5.2 5.3 8 2.5l2.8 2.8M3 12.5h10" /></Stroke>
)
export const PinIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M6 2.5h4M6.6 2.5 6 7l-2 2.2h8L10 7l-.6-4.5M8 9.2v4.3" /></Stroke>
)
export const SampleIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M2.5 3.5c2.2-.5 4 0 5.5 1.2v8c-1.5-1.2-3.3-1.7-5.5-1.2zM13.5 3.5c-2.2-.5-4 0-5.5 1.2v8c1.5-1.2 3.3-1.7 5.5-1.2z" /></Stroke>
)
export const FolderIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M2.5 4.5v7.5h11V6.2H8L6.8 4.5z" /></Stroke>
)
export const StopIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></Stroke>
)
export const MoonIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M12.8 9.5A5.2 5.2 0 0 1 6.5 3.2a5.2 5.2 0 1 0 6.3 6.3z" /></Stroke>
)
export const SunIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><circle cx="8" cy="8" r="2.6" /><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1" /></Stroke>
)
export const AutoIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor" /></Stroke>
)
export const PaletteIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M8 2.5c-3.1 0-5.5 2.3-5.5 5.3S4.8 13.5 8 13.5c1.1 0 1.5-.7 1.2-1.5-.3-.9.2-1.7 1.2-1.7h1.3c1.1 0 1.8-.8 1.8-2C13.5 4.6 11 2.5 8 2.5z" /><circle cx="5.5" cy="7.5" r=".6" fill="currentColor" /><circle cx="8" cy="5.3" r=".6" fill="currentColor" /><circle cx="10.6" cy="7" r=".6" fill="currentColor" /></Stroke>
)
export const TableIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M2.5 9.8h11M6.5 6.5V13" /></Stroke>
)
export const TrashIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.3 4.5l.6 8.5h6.2l.6-8.5" /></Stroke>
)
export const SearchIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></Stroke>
)
