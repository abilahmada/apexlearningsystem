import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Inter } from 'next/font/google'
import './globals.css'

/* ─── APEX Brand Fonts ─────────────────────────────────────────────────────
   Plus Jakarta Sans → Headlines, logo wordmark, display text
   Inter             → Body copy, UI labels, form elements
   ───────────────────────────────────────────────────────────────────────── */
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'APEX Learning System — Global Standard, Personal Untukmu',
  description:
    'Platform E-Learning berstandar internasional (Cambridge · IB · STEM) yang dirancang ' +
    'khusus untuk mendidik anak Indonesia agar memiliki kapabilitas kelas dunia — ' +
    'dilengkapi AI Socratic Tutor, Spaced Repetition, dan monitoring holistik untuk orang tua.',
  keywords: [
    'APEX Learning', 'E-Learning Indonesia', 'Kurikulum Cambridge', 'IB Indonesia',
    'Belajar Mandiri', 'AI Tutor', 'Spaced Repetition', 'Pendidikan Internasional',
  ],
  authors: [{ name: 'APEX Learning System' }],
  openGraph: {
    title: 'APEX Learning System',
    description: 'Global Standard, Personalized for You. Belajar Mandiri, Bersaing Global.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" className={`${plusJakartaSans.variable} ${inter.variable}`}>
      <body
        className="font-body antialiased bg-[#F8FAFC]"
        style={{ fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)' }}
      >
        {children}
      </body>
    </html>
  )
}

