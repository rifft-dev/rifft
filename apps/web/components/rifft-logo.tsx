export function RifftLogo({ className }: { className?: string }) {
  return (
    <svg
      width="148"
      height="40"
      viewBox="0 0 148 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="0" y="0" width="5" height="40" rx="2.5" fill="currentColor" />
      <rect x="8" y="0" width="5" height="22" rx="2.5" fill="currentColor" />
      <rect x="8" y="26" width="5" height="14" rx="2.5" fill="currentColor" opacity="0.3" />
      <rect x="16" y="8" width="14" height="5" rx="2.5" fill="currentColor" />
      <rect x="16" y="28" width="10" height="5" rx="2.5" fill="currentColor" opacity="0.3" />
      <circle cx="30" cy="30.5" r="3.5" style={{ fill: '#22c55e' }} />
      <text
        x="44"
        y="29"
        fontFamily="'Geist', 'Inter', system-ui, sans-serif"
        fontSize="24"
        fontWeight="500"
        fill="currentColor"
        letterSpacing="-0.8"
      >
        rifft
      </text>
    </svg>
  )
}
