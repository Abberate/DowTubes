// Inline SVG icons (Lucide-style, 24px grid, 1.75 stroke, currentColor). No emoji.
interface P {
  size?: number
  className?: string
}

function svg(children: JSX.Element, size = 18, className?: string): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconDownload = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 19h14" />
    </>,
    size,
    className
  )

export const IconSearch = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>,
    size,
    className
  )

export const IconVideo = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <rect x="2.5" y="6" width="14" height="12" rx="2.5" />
      <path d="m16.5 10 5-3v10l-5-3z" />
    </>,
    size,
    className
  )

export const IconMusic = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </>,
    size,
    className
  )

export const IconLayers = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>,
    size,
    className
  )

export const IconX = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>,
    size,
    className
  )

export const IconCheck = ({ size, className }: P): JSX.Element =>
  svg(<path d="M20 6 9 17l-5-5" />, size, className)

export const IconAlert = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>,
    size,
    className
  )

export const IconFolder = ({ size, className }: P): JSX.Element =>
  svg(
    <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2.5h7a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2z" />,
    size,
    className
  )

export const IconExternal = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>,
    size,
    className
  )

export const IconRetry = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>,
    size,
    className
  )

export const IconTrash = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </>,
    size,
    className
  )

export const IconLock = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>,
    size,
    className
  )

export const IconRefresh = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3L3 16" />
      <path d="M3 21v-5h5" />
      <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3L21 8" />
      <path d="M21 3v5h-5" />
    </>,
    size,
    className
  )

export const IconClose = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>,
    size,
    className
  )

export const IconCaptions = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M7 12h3M7 15h5M14 12h3M14 15h3" />
    </>,
    size,
    className
  )

export const IconInbox = ({ size, className }: P): JSX.Element =>
  svg(
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" />
    </>,
    size,
    className
  )
