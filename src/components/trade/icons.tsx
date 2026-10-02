import type { SVGProps } from 'react'

/* Line icons for the Trade surface (Phosphor-style, 1.5px strokes, currentColor). */
type P = SVGProps<SVGSVGElement> & { s?: number }
const Ico = ({ s = 16, children, ...p }: P) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>{children}</svg>
)

export const IcoCaretDoubleLeft = (p: P) => <Ico {...p}><path d="M11 5 4 12l7 7M19 5l-7 7 7 7" /></Ico>
export const IcoCaretDown = (p: P) => <Ico {...p}><path d="m6 9 6 6 6-6" /></Ico>
export const IcoSearch = (p: P) => <Ico {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Ico>
export const IcoCopy = (p: P) => <Ico {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Ico>
export const IcoCandles = (p: P) => <Ico {...p}><path d="M7 3v3M7 17v4M17 3v5M17 15v6" /><rect x="5" y="6" width="4" height="11" rx="1" /><rect x="15" y="8" width="4" height="7" rx="1" /></Ico>
export const IcoLine = (p: P) => <Ico {...p}><path d="m3 17 6-6 4 4 8-8" /></Ico>
export const IcoArea = (p: P) => <Ico {...p}><path d="m3 15 6-6 4 4 8-8v14H3z" fill="currentColor" fillOpacity={0.15} /><path d="m3 15 6-6 4 4 8-8" /></Ico>
export const IcoFx = (p: P) => <Ico {...p}><path d="M10 4c-2 0-3 1-3 3v13M4 10h6M13 11l6 7M19 11l-6 7" /></Ico>
export const IcoUndo = (p: P) => <Ico {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Ico>
export const IcoRedo = (p: P) => <Ico {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></Ico>
export const IcoGear = (p: P) => <Ico {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Ico>
export const IcoCornersOut = (p: P) => <Ico {...p}><path d="M15 4h5v5M9 20H4v-5M20 15v5h-5M4 9V4h5" /></Ico>
export const IcoCornersIn = (p: P) => <Ico {...p}><path d="M20 9h-5V4M4 15h5v5M15 20v-5h5M9 4v5H4" /></Ico>
export const IcoCamera = (p: P) => <Ico {...p}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.5" /></Ico>
export const IcoCalendar = (p: P) => <Ico {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4" /></Ico>
export const IcoPanel = (p: P) => <Ico {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M15 4v16" /></Ico>
export const IcoQuestion = (p: P) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.2" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></Ico>
export const IcoSignal = (p: P) => <Ico {...p}><path d="M6 18v-3M10 18v-6M14 18V9M18 18V6" /></Ico>
export const IcoClock = (p: P) => <Ico {...p}><path d="M3.5 12A8.5 8.5 0 1 0 6 6" /><path d="M3 4v4h4M12 8v4l3 2" /></Ico>
export const IcoNews = (p: P) => <Ico {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h6M7 13h10M7 16h7" /></Ico>
// Chart tool rail
export const IcoCross = (p: P) => <Ico {...p}><path d="M12 3v7M12 14v7M3 12h7M14 12h7" /></Ico>
export const IcoHLine = (p: P) => <Ico {...p}><path d="M3 12h18" /><circle cx="12" cy="12" r="2" fill="currentColor" /></Ico>
export const IcoMagnet = (p: P) => <Ico {...p}><path d="M5 4h4v8a3 3 0 0 0 6 0V4h4v8a7 7 0 0 1-14 0Z" /><path d="M5 8h4M15 8h4" /></Ico>
export const IcoZoomIn = (p: P) => <Ico {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6M11 8v6" /></Ico>
export const IcoZoomOut = (p: P) => <Ico {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6" /></Ico>
export const IcoLock = (p: P) => <Ico {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Ico>
export const IcoUnlock = (p: P) => <Ico {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></Ico>
export const IcoEye = (p: P) => <Ico {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Ico>
export const IcoEyeOff = (p: P) => <Ico {...p}><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1" /></Ico>
export const IcoTrash = (p: P) => <Ico {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Ico>
export const IcoRuler = (p: P) => <Ico {...p}><path d="m3 17 14-14 4 4L7 21Z" /><path d="m7 13 2 2M10 10l2 2M13 7l2 2" /></Ico>
