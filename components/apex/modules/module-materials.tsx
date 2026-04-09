'use client'

import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { useApex } from '../apex-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type ModuleItem = {
  id: string
  title: string
  sequenceOrder: number
  metadata?: Record<string, unknown>
  progress?: {
    totalLessons: number
    passedLessons: number
    completionPct: number
  }
  lessons?: Array<{
    id: string
    title: string
    posttestScore: number | null
    posttestPassed: boolean
  }>
}

export function ModuleMaterials() {
  const { t } = useApex()
  const [items, setItems] = useState<ModuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setMessage(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) {
          setMessage(t('Perlu login untuk memuat modul.', 'Sign in required to load modules.'))
          setItems([])
          return
        }
        const res = await fetch('/api/learning/modules?withLessons=1', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const json = (await res.json()) as { items?: ModuleItem[]; message?: string }
        if (!res.ok) throw new Error(json.message ?? 'Failed to load modules')
        const list = (json.items ?? []).sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        setItems(list)
      } catch (error) {
        setItems([])
        setMessage(error instanceof Error ? error.message : t('Gagal memuat modul.', 'Failed to load modules.'))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [t])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <BookOpen size={18} className="text-cyan-600" />
          {t('Modul Materi', 'Module Materials')}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {t(
            'Menampilkan semua modul sesuai grade yang bisa kamu akses. Klik modul untuk melihat turunan lesson.',
            'Shows all modules available for your grade. Click a module to view lesson breakdown.',
          )}
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 text-sm text-slate-500">
          {t('Memuat modul...', 'Loading modules...')}
        </div>
      ) : null}
      {message ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">{message}</div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500 text-sm">
          {t('Belum ada modul yang tersedia.', 'No modules available yet.')}
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((module) => {
          const total = Number(module.progress?.totalLessons ?? module.lessons?.length ?? 0)
          const passed = Number(module.progress?.passedLessons ?? 0)
          const pct = Number(module.progress?.completionPct ?? (total > 0 ? (passed / total) * 100 : 0))
          const phase = String(module.metadata?.phase ?? 'Phase 1')
          const isOpen = Boolean(expanded[module.id])

          return (
            <div key={module.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-100 font-bold">
                      {phase}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100 font-bold">
                      +150 XP
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-800 truncate">
                    #{module.sequenceOrder} {module.title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {t('Progress lesson', 'Lesson progress')}: {passed}/{total} ({Math.round(pct)}%)
                  </p>
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
                  onClick={() => setExpanded((prev) => ({ ...prev, [module.id]: !prev[module.id] }))}
                >
                  {isOpen ? (
                    <span className="inline-flex items-center gap-1">
                      {t('Sembunyikan', 'Hide')} <ChevronUp size={14} />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {t('Lihat Lesson', 'View lessons')} <ChevronDown size={14} />
                    </span>
                  )}
                </button>
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-500">{t('Mastery Level', 'Mastery Level')}</span>
                  <span className="text-orange-500">{Math.round(pct)}% → target 80%</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, pct))}%`,
                      background: pct >= 80 ? 'linear-gradient(90deg,#10B981,#059669)' : 'linear-gradient(90deg,#F97316,#EA580C)',
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-orange-700 border border-orange-200 bg-orange-50 rounded-xl px-3 py-2">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Sparkles size={12} />
                    {pct >= 80
                      ? t('Luar biasa! Modul ini sudah di atas target mastery.', 'Great! This module is above mastery target.')
                      : t('Hampir sampai! Mari perkuat sisa target mastery.', 'Almost there! Let us strengthen the remaining mastery target.')}
                  </span>
                </p>
              </div>

              {isOpen ? (
                <div className="mt-3 space-y-2">
                  {(module.lessons ?? []).map((lesson, idx) => (
                    <div key={lesson.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-700">
                        {idx + 1}. {lesson.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        POST: {lesson.posttestScore ?? '-'}% ·{' '}
                        {lesson.posttestPassed ? t('LULUS', 'PASSED') : t('BELUM', 'PENDING')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
