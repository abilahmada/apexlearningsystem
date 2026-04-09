import { ImageResponse } from 'next/og'

export const size = {
  width: 64,
  height: 64,
}

export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F8FAFC',
        }}
      >
        <svg
          width="56"
          height="56"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="APEX Learning System logo"
        >
          <polygon points="60,8 108,95 12,95" fill="#0A1128" stroke="none" />
          <polygon points="60,52 78,80 42,80" fill="#F8FAFC" stroke="none" />
          <circle cx="38" cy="44" r="5.5" fill="#F97316" />
          <circle cx="22" cy="72" r="7" fill="#F97316" />
          <line x1="38" y1="44" x2="22" y2="72" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="60" cy="8" r="6" fill="#06B6D4" />
          <circle cx="84" cy="50" r="5.5" fill="#06B6D4" />
          <circle cx="100" cy="82" r="5" fill="#06B6D4" />
          <line x1="60" y1="8" x2="84" y2="50" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="84" y1="50" x2="100" y2="82" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" />
          <line
            x1="84"
            y1="50"
            x2="100"
            y2="82"
            stroke="#06B6D4"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.5"
          />
          <polygon points="60,18 68,34 52,34" fill="#06B6D4" opacity="0.85" />
        </svg>
      </div>
    ),
    {
      ...size,
    },
  )
}
