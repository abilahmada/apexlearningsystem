'use client'

import { cn } from '@/lib/utils'

interface NavButtonProps {
  icon: React.ReactNode
  label: string
  isActive: boolean
  onClick: () => void
  badge?: string | number   // opsional: angka notifikasi / label kecil
}

export function NavButton({ icon, label, isActive, onClick, badge }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        // Base
        'w-full flex items-center gap-3.5 px-3.5 py-3 md:gap-3 md:px-3 md:py-2.5 rounded-xl transition-all duration-200 relative group',
        // Active → Electric Cyan gradient dengan glow
        isActive
          ? 'text-white shadow-[0_4px_14px_0_rgb(6_182_212_/_0.35)]'
          : 'text-slate-400 hover:bg-[#1E293B] hover:text-white'
      )}
      style={
        isActive
          ? {
              background: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
            }
          : undefined
      }
      title={label}   // tooltip untuk collapsed state
    >
      {/* Icon */}
      <span className={cn('shrink-0 transition-transform duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] md:[&>svg]:w-[17px] md:[&>svg]:h-[17px]', isActive ? 'scale-100' : 'group-hover:scale-110')}>
        {icon}
      </span>

      {/* Label */}
      <span
        className="font-semibold text-[14px] md:text-sm block truncate leading-none"
        style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
      >
        {label}
      </span>

      {/* Badge notifikasi */}
      {badge !== undefined && (
        <span
          className={cn(
            'ml-auto shrink-0 inline-flex items-center justify-center',
            'min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold',
            isActive
              ? 'bg-white/20 text-white'
              : 'bg-[#F97316]/20 text-[#F97316]'
          )}
        >
          {badge}
        </span>
      )}

      {/* Active indicator bar (kiri) */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white/60 rounded-full" />
      )}
    </button>
  )
}

