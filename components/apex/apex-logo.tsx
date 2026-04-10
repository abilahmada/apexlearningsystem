'use client'

/**
 * ApexLogo — Reproduksi SVG logo APEX Learning System
 * Berdasarkan brand asset: logo segitiga A dengan node koneksi cyan & coral
 * Digunakan di: Sidebar header, Loading screen, Auth pages
 */

interface ApexLogoProps {
  /** Ukuran logo mark (icon saja, tanpa wordmark) */
  size?: number
  /** Tampilkan wordmark "APEX" di samping / bawah icon */
  showWordmark?: boolean
  /** Layout wordmark */
  layout?: 'horizontal' | 'vertical'
  /** Warna wordmark. Default: putih (untuk sidebar gelap) */
  wordmarkColor?: string
  className?: string
}

export function ApexLogo({
  size = 36,
  showWordmark = true,
  layout = 'horizontal',
  wordmarkColor = '#FFFFFF',
  className = '',
}: ApexLogoProps) {
  const iconSize = size

  const Icon = (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="APEX Learning System logo"
    >
      {/* ── Background circle (opsional, untuk konteks gelap) */}
      {/* Segitiga A utama — Deep Space Navy */}
      <polygon
        points="60,8 108,95 12,95"
        fill="#0A1128"
        stroke="none"
      />

      {/* Cut-out crossbar huruf A */}
      <polygon
        points="60,52 78,80 42,80"
        fill="#F8FAFC"
        stroke="none"
      />

      {/* ── Network nodes — Coral Orange (kiri) */}
      {/* Node 1: kiri atas */}
      <circle cx="38" cy="44" r="5.5" fill="#F97316" />
      {/* Node 2: kiri bawah */}
      <circle cx="22" cy="72" r="7" fill="#F97316" />
      {/* Garis koneksi coral */}
      <line x1="38" y1="44" x2="22" y2="72"
        stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" />

      {/* ── Network nodes — Electric Cyan (kanan) */}
      {/* Node 3: apex atas */}
      <circle cx="60" cy="8" r="6" fill="#06B6D4" />
      {/* Node 4: kanan tengah */}
      <circle cx="84" cy="50" r="5.5" fill="#06B6D4" />
      {/* Node 5: kanan bawah */}
      <circle cx="100" cy="82" r="5" fill="#06B6D4" />
      {/* Garis koneksi cyan: apex → tengah */}
      <line x1="60" y1="8" x2="84" y2="50"
        stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" />
      {/* Garis koneksi cyan: tengah → bawah */}
      <line x1="84" y1="50" x2="100" y2="82"
        stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" />
      {/* Garis koneksi cyan: bawah → node kanan bawah */}
      <line x1="84" y1="50" x2="100" y2="82"
        stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />

      {/* Arrow up inside A — indikator naik */}
      <polygon
        points="60,18 68,34 52,34"
        fill="#06B6D4"
        opacity="0.85"
      />
    </svg>
  )

  if (!showWordmark) return <span className={className}>{Icon}</span>

  return (
    <span
      className={`inline-flex items-center ${
        layout === 'vertical' ? 'flex-col gap-1' : 'flex-row gap-2.5'
      } ${className}`}
    >
      {Icon}
      <span
        style={{
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          fontWeight: 800,
          letterSpacing: '0.18em',
          fontSize: layout === 'vertical' ? size * 0.38 : size * 0.5,
          color: wordmarkColor,
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        APEX
      </span>
    </span>
  )
}

/** Versi kecil untuk favicon / tab */
export function ApexFavicon({ size = 32 }: { size?: number }) {
  return <ApexLogo size={size} showWordmark={false} />
}
