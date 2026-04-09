'use client'

import { Leaf, Eye } from 'lucide-react'

interface WellbeingOverlayProps {
  show: boolean
  onClose: () => void
}

/* Microcopy resmi dari Panduan UX APEX:
   "Hebat! Kamu sudah fokus selama 45 menit.
    Yuk, istirahatkan mata & regangkan badanmu 5 menit! 👀🌿"
*/

const STRETCH_TIPS = [
  { icon: '👀', tip: 'Lihat benda jauh ±6 meter selama 20 detik — istirahatkan fokus matamu.' },
  { icon: '🤸', tip: 'Putar bahu ke belakang 5× perlahan, lalu ke depan 5×.' },
  { icon: '💧', tip: 'Minum segelas air putih. Otak butuh hidrasi untuk berpikir.' },
  { icon: '🌬️', tip: 'Tarik napas dalam 4 hitungan, tahan 4, hembuskan 6. Ulangi 3×.' },
]

export function WellbeingOverlay({ show, onClose }: WellbeingOverlayProps) {
  if (!show) return null

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center text-center p-6 animate-in fade-in"
      style={{
        background: 'linear-gradient(160deg, #0A1128 0%, #0F2A2A 60%, #0A1128 100%)',
      }}
    >
      {/* Icon animasi */}
      <div className="relative mb-6">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(16, 185, 129, 0.15)', border: '2px solid rgba(16, 185, 129, 0.4)' }}
        >
          <Leaf size={44} style={{ color: '#10B981' }} className="animate-pulse" />
        </div>
        <div
          className="absolute -top-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: '#06B6D4' }}
        >
          <Eye size={14} className="text-white" />
        </div>
      </div>

      {/* Microcopy resmi APEX UX Guide */}
      <h2
        className="text-2xl font-black text-white mb-3"
        style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
      >
        Hebat! Waktunya Jeda Layar 👀🌿
      </h2>

      <p
        className="text-base font-medium mb-8 max-w-md leading-relaxed px-6 py-4 rounded-2xl"
        style={{
          color: '#6EE7B7',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
        }}
      >
        Kamu sudah fokus selama <strong className="text-white">45 menit</strong> — luar biasa!
        Yuk, istirahatkan mata &amp; regangkan badanmu <strong className="text-white">5 menit</strong> sebelum lanjut. 🌿
      </p>

      {/* Tips peregangan */}
      <div className="grid grid-cols-2 gap-3 max-w-sm w-full mb-8">
        {STRETCH_TIPS.map((t, i) => (
          <div
            key={i}
            className="p-3 rounded-xl text-left"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="text-xl mb-1">{t.icon}</div>
            <p className="text-xs text-slate-300 leading-relaxed">{t.tip}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onClose}
        className="px-10 py-3 rounded-xl font-bold text-sm transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
          color: 'white',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          boxShadow: '0 4px 20px 0 rgb(16 185 129 / 0.35)',
        }}
      >
        ✅ Saya Sudah Istirahat, Lanjut Belajar!
      </button>

      <p className="mt-4 text-xs text-slate-500">
        Menjaga kesehatan mata &amp; tubuh adalah bagian dari ibadah. 🤍
      </p>
    </div>
  )
}

