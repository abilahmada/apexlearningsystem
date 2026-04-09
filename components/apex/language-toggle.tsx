'use client'

import { Languages } from 'lucide-react'
import { useApex } from './apex-context'
import { cn } from '@/lib/utils'

export function LanguageToggle() {
  const { language, setLanguage } = useApex()

  const toggleLanguage = () => {
    setLanguage(language === 'id' ? 'en' : 'id')
  }

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-sm font-semibold transition-all duration-200 border border-slate-200 hover:border-slate-300"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
      title={language === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
    >
      <Languages size={14} className="text-slate-400" />
      <span
        className={cn(
          'transition-colors text-xs font-bold tracking-wide',
          language === 'id' ? 'text-[#06B6D4]' : 'text-slate-400'
        )}
      >
        ID
      </span>
      <span className="text-slate-300 text-xs">/</span>
      <span
        className={cn(
          'transition-colors text-xs font-bold tracking-wide',
          language === 'en' ? 'text-[#06B6D4]' : 'text-slate-400'
        )}
      >
        EN
      </span>
    </button>
  )
}

