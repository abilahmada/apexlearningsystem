'use client'

import { GraduationCap, School, Building2, CheckCircle2 } from 'lucide-react'
import { useApex, GradeLevel } from './apex-context'
import { cn } from '@/lib/utils'

/* Brand warna per jenjang sesuai Blueprint */
const GRADE_CONFIG: Record<
  GradeLevel,
  { icon: React.ReactNode; color: string; borderColor: string; textColor: string; bgActive: string }
> = {
  sd: {
    icon: <School size={22} />,
    color:       '#10B981',   // Emerald
    borderColor: '#6EE7B7',
    textColor:   '#065F46',
    bgActive:    '#ECFDF5',
  },
  smp: {
    icon: <GraduationCap size={22} />,
    color:       '#06B6D4',   // Electric Cyan (brand utama)
    borderColor: '#67E8F9',
    textColor:   '#0E7490',
    bgActive:    '#ECFEFF',
  },
  smk: {
    icon: <Building2 size={22} />,
    color:       '#8B5CF6',   // Violet
    borderColor: '#C4B5FD',
    textColor:   '#5B21B6',
    bgActive:    '#F5F3FF',
  },
}

export function GradeSelector() {
  const { gradeLevel, setGradeLevel, config, t } = useApex()

  const gradeLabels: Record<GradeLevel, { short: string; sub: string }> = {
    sd:  { short: t('SD', 'Elementary'),   sub: t('Kelas 1–6', 'Grade 1–6') },
    smp: { short: t('SMP', 'Junior High'), sub: t('Kelas 7–9', 'Grade 7–9') },
    smk: { short: t('SMA/SMK', 'Sr. High'), sub: t('Kelas 10–12', 'Grade 10–12') },
  }

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      {/* Heading */}
      <h2
        className="text-base font-bold text-[#0A1128] mb-4"
        style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
      >
        {t('Pilih Jenjang Pendidikan', 'Select Education Level')}
      </h2>

      {/* Grade Buttons */}
      <div className="grid grid-cols-3 gap-2.5">
        {(Object.keys(GRADE_CONFIG) as GradeLevel[]).map((key) => {
          const cfg   = GRADE_CONFIG[key]
          const lbl   = gradeLabels[key]
          const isAct = gradeLevel === key

          return (
            <button
              key={key}
              onClick={() => setGradeLevel(key)}
              className={cn(
                'p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-1.5 text-center',
                'hover:scale-[1.02] active:scale-[0.98]'
              )}
              style={{
                borderColor:     isAct ? cfg.color      : '#E2E8F0',
                backgroundColor: isAct ? cfg.bgActive   : '#F8FAFC',
                color:           isAct ? cfg.textColor  : '#64748B',
              }}
            >
              {/* Icon container */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white transition-all"
                style={{ backgroundColor: isAct ? cfg.color : '#CBD5E1' }}
              >
                {cfg.icon}
              </div>
              <span
                className="font-bold text-sm leading-none"
                style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
              >
                {lbl.short}
              </span>
              <span className="text-[10px] opacity-60 leading-none">{lbl.sub}</span>

              {/* Active check */}
              {isAct && (
                <CheckCircle2 size={13} className="absolute" style={{ color: cfg.color, top: 8, right: 8, position: 'absolute' }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Config info */}
      <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span className="font-semibold text-slate-700">
            {t('Pomodoro Fokus', 'Focus Timer')}
          </span>
          <span className="font-bold text-[#06B6D4]">
            {config.pomodoroFocus} {t('mnt', 'min')} / {config.pomodoroBreak} {t('mnt', 'min')}
          </span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span className="font-semibold text-slate-700">
            {t('Target Harian', 'Daily Target')}
          </span>
          <span className="font-bold text-[#06B6D4]">
            {config.dailyTarget} {t('jam/hari', 'hrs/day')}
          </span>
        </div>
      </div>
    </div>
  )
}

