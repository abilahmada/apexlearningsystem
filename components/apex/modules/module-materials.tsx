'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp, Lock, Sparkles } from 'lucide-react'
import { useApex } from '../apex-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseModulePhaseNumber } from '@/lib/learning/student-module-phase-context'
import type { StudentLearningModuleListItem } from '@/lib/learning/student-learning-module-item'

type ModuleItem = StudentLearningModuleListItem

type ModuleMaterialsProps = {
  onOpenLearningHub?: () => void
}

function levelGroupKey(m: ModuleItem): number {
  if (typeof m.phaseLevel === 'number' && Number.isFinite(m.phaseLevel)) return m.phaseLevel
  const meta = m.metadata && typeof m.metadata === 'object' ? m.metadata : {}
  return parseModulePhaseNumber(meta as Record<string, unknown>)
}

function levelSectionTitle(
  modulesInGroup: ModuleItem[],
  levelKey: number,
  t: (id: string, en: string) => string,
): string {
  const first = modulesInGroup[0]
  const meta = first?.metadata && typeof first.metadata === 'object' ? first.metadata : {}
  const label = String((meta as Record<string, unknown>).phaseLabel ?? '').trim()
  if (label) return label
  return `${t('Level', 'Level')} ${levelKey}`
}

export function ModuleMaterials({ onOpenLearningHub }: ModuleMaterialsProps) {
  const { t } = useApex()
  const [items, setItems] = useState<ModuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [effectiveGrade, setEffectiveGrade] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmingModuleId, setConfirmingModuleId] = useState<string | null>(null)

  useEffect(() => {
    if (!successMessage) return
    const id = window.setTimeout(() => setSuccessMessage(null), 4500)
    return () => window.clearTimeout(id)
  }, [successMessage])

  const toLevelLabel = (raw: unknown) => {
    const text = String(raw ?? '').trim()
    if (!text) return `${t('Level', 'Level')} 1`
    if (/^\d+$/.test(text)) return `${t('Level', 'Level')} ${text}`
    return text.replace(/^(fase|phase)/i, t('Level', 'Level'))
  }

  const normalizeModuleTitle = (raw: unknown) =>
    String(raw ?? '').replace(/\b(Fase|Phase)\b/gi, t('Level', 'Level'))

  const groupedByLevel = useMemo(() => {
    const map = new Map<number, ModuleItem[]>()
    for (const m of items) {
      const k = levelGroupKey(m)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(m)
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.sequenceOrder - b.sequenceOrder || a.title.localeCompare(b.title))
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [items])

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setErrorMessage(t('Perlu login untuk memuat modul.', 'Sign in required to load modules.'))
        setItems([])
        setEffectiveGrade(null)
        return
      }
      const res = await fetch('/api/learning/modules?withLessons=1&catalog=1', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = (await res.json()) as { items?: ModuleItem[]; message?: string; effectiveGrade?: string }
      if (!res.ok) throw new Error(json.message ?? 'Failed to load modules')
      const list = (json.items ?? []).sort((a, b) => a.sequenceOrder - b.sequenceOrder)
      setItems(list)
      setEffectiveGrade(json.effectiveGrade?.trim() ? String(json.effectiveGrade) : null)
    } catch (error) {
      setItems([])
      setEffectiveGrade(null)
      setErrorMessage(error instanceof Error ? error.message : t('Gagal memuat modul.', 'Failed to load modules.'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const confirmModuleStudy = async (moduleId: string) => {
    setConfirmingModuleId(moduleId)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setErrorMessage(t('Perlu login untuk konfirmasi.', 'Sign in required to confirm.'))
        return
      }
      const res = await fetch('/api/learning/module-complete', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ moduleId }),
      })
      const json = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(json.message ?? t('Gagal mengonfirmasi modul.', 'Failed to confirm module.'))
      await loadCatalog()
      setSuccessMessage(t('Modul ditandai selesai dipelajari.', 'Module marked as finished for study.'))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('Gagal mengonfirmasi modul.', 'Failed to confirm module.'))
    } finally {
      setConfirmingModuleId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <h2
            id="module-materials-heading"
            className="text-lg font-bold text-slate-800 flex items-center gap-2 flex-wrap"
          >
            <BookOpen size={18} className="text-cyan-600 shrink-0" aria-hidden />
            {t('Modul Materi', 'Module Materials')}
          </h2>
          {effectiveGrade ? (
            <span className="shrink-0 self-start text-[11px] font-bold text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
              {t('Jenjang', 'Grade')}: {effectiveGrade}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {t(
            'Semua modul untuk jenjang (grade) kamu ditampilkan di sini. Kamu dapat mempelajari isi materi & lesson pada modul yang statusnya terbuka (unlock). Modul terkunci tetap terlihat sebagai gambaran kurikulum; tes resmi lewat Learning Hub.',
            'Every module for your grade appears here. You can study materials and lessons on modules that are unlocked. Locked modules stay visible as curriculum context; official tests are in the Learning Hub.',
          )}
        </p>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-cyan-100 bg-cyan-50/80 px-3 py-2.5 text-xs text-cyan-950">
          <p className="leading-relaxed">
            {t(
              'Untuk Pre-test / Post-test, buka Learning Hub.',
              'For Pre-test / Post-test, open the Learning Hub.',
            )}
          </p>
          {onOpenLearningHub ? (
            <button
              type="button"
              onClick={onOpenLearningHub}
              className="shrink-0 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-semibold px-3 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2"
            >
              {t('Buka Learning Hub', 'Open Learning Hub')}
            </button>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="module-materials-heading" aria-busy={loading}>
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3" aria-hidden>
          <div className="h-5 w-48 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-32 rounded-xl bg-slate-100 animate-pulse" />
          <div className="h-32 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      ) : null}
      {errorMessage ? (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div role="status" aria-live="polite" className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-900">
          {successMessage}
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500 text-sm">
          {t('Belum ada modul yang tersedia.', 'No modules available yet.')}
        </div>
      ) : null}

      <div className="space-y-8">
        {groupedByLevel.map(([levelKey, modulesInGroup]) => (
          <section key={levelKey} className="space-y-3">
            <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-gradient-to-r from-slate-50 to-cyan-50/90 border-y border-slate-200/80 backdrop-blur-sm">
              <div className="flex items-center gap-2 border-l-4 border-cyan-600 pl-3">
                <span className="text-xs font-black uppercase tracking-wide text-cyan-800">
                  {t('Jenjang modul', 'Module tier')}
                </span>
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {levelSectionTitle(modulesInGroup, levelKey, t)}
                </h3>
              </div>
            </div>

            <div className="space-y-3 pl-0 sm:pl-1">
              {modulesInGroup.map((module) => {
                const total = Number(module.progress?.totalLessons ?? module.lessons?.length ?? 0)
                const passed = Number(module.progress?.passedLessons ?? 0)
                const pct = Number(module.progress?.completionPct ?? (total > 0 ? (passed / total) * 100 : 0))
                const phase = toLevelLabel(module.metadata?.phase)
                const masteryTarget = Number(module.masteryThreshold ?? 80)
                const isOpen = Boolean(expanded[module.id])
                const lessonsAllPassed = Boolean(
                  module.lessonsAllPassed ?? (total > 0 && passed >= total),
                )
                const done = module.completed === true
                const needsStudyConfirm = lessonsAllPassed && !done && module.unlocked !== false
                const statusText = done
                  ? t('Selesai', 'Completed')
                  : needsStudyConfirm
                    ? t('Siap dikonfirmasi', 'Ready to confirm')
                    : passed > 0
                      ? t('Berjalan', 'In Progress')
                      : t('Siap Mulai', 'Ready')
                const statusClass = done
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : needsStudyConfirm
                    ? 'bg-violet-100 text-violet-800 border-violet-200'
                    : passed > 0
                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-blue-100 text-blue-700 border-blue-200'
                const isLocked = module.unlocked === false

                const subjectLine =
                  module.subjectDisplay?.trim() ||
                  module.courseTitle?.trim() ||
                  t('(Tanpa label mata pelajaran)', '(No subject label)')
                const moduleTitle = normalizeModuleTitle(module.title)
                const avgPost = module.avgPosttestPct
                const points = Number(module.studyPointsTotal ?? 0)

                return (
                  <div key={module.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${statusClass}`}>
                            {statusText}
                          </span>
                          {isLocked ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-bold inline-flex items-center gap-1">
                              <Lock size={10} />
                              {t('Terkunci', 'Locked')}
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                              {t('Akses materi', 'Material access')}
                            </span>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 space-y-1.5 text-[11px]">
                          <p className="text-slate-500 font-semibold uppercase tracking-wide">
                            {t('Judul pelajaran', 'Subject / course')}
                          </p>
                          <p className="text-sm font-bold text-slate-900 leading-snug">{subjectLine}</p>
                          <p className="text-slate-500 font-semibold uppercase tracking-wide pt-1">
                            {t('Judul modul', 'Module title')}
                          </p>
                          <p className="text-sm font-bold text-cyan-950 leading-snug">{moduleTitle}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-slate-600">
                            <span>
                              <span className="font-semibold text-slate-500">{t('Level', 'Level')}: </span>
                              {phase}
                            </span>
                            <span>
                              <span className="font-semibold text-slate-500">{t('Jumlah lesson', 'Lessons')}: </span>
                              {total}
                            </span>
                            <span>
                              <span className="font-semibold text-slate-500">
                                {t('Nilai poin hasil belajar', 'Learning score points')}
                                :{' '}
                              </span>
                              {points > 0 ? (
                                <span className="font-bold text-orange-700">{points} pts</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                              {avgPost != null ? (
                                <span className="text-slate-500">
                                  {' '}
                                  · {t('Rata-rata post-test', 'Avg post-test')}: {avgPost}%
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-600">
                          <span className="font-semibold">{t('Progress', 'Progress')}: </span>
                          {passed}/{total} ({Math.round(pct)}%)
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={isLocked}
                        aria-expanded={isOpen}
                        aria-controls={isLocked ? undefined : `module-lessons-${module.id}`}
                        title={
                          isLocked
                            ? t(
                                'Lesson hanya dapat dibuka untuk modul yang sudah unlock.',
                                'Lessons open only for unlocked modules.',
                              )
                            : undefined
                        }
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
                        onClick={() => {
                          if (isLocked) return
                          setExpanded((prev) => ({ ...prev, [module.id]: !prev[module.id] }))
                        }}
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
                        <span className="text-orange-500">
                          {Math.round(pct)}% → {t('target', 'target')} {masteryTarget}%
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(0, pct))}%`,
                            background:
                              pct >= masteryTarget
                                ? 'linear-gradient(90deg,#10B981,#059669)'
                                : 'linear-gradient(90deg,#F97316,#EA580C)',
                          }}
                        />
                      </div>
                      {!isLocked ? (
                        <p className="mt-2 text-xs text-orange-700 border border-orange-200 bg-orange-50 rounded-xl px-3 py-2">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Sparkles size={12} />
                            {pct >= masteryTarget
                              ? t(
                                  'Luar biasa! Modul ini sudah di atas target mastery.',
                                  'Great! This module is above mastery target.',
                                )
                              : t(
                                  'Hampir sampai! Mari perkuat sisa target mastery.',
                                  'Almost there! Let us strengthen the remaining mastery target.',
                                )}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] text-amber-800 border border-amber-200 bg-amber-50 rounded-xl px-3 py-2">
                          {t(
                            'Selesaikan level sebelumnya untuk membuka akses materi lesson di modul ini.',
                            'Complete the previous level to unlock lesson materials for this module.',
                          )}
                        </p>
                      )}
                      {needsStudyConfirm ? (
                        <button
                          type="button"
                          disabled={confirmingModuleId === module.id}
                          onClick={() => void confirmModuleStudy(module.id)}
                          className="mt-2 w-full px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2"
                        >
                          {confirmingModuleId === module.id
                            ? t('Menyimpan...', 'Saving...')
                            : t('Selesai dipelajari', 'Mark as finished for study')}
                        </button>
                      ) : null}
                    </div>

                    {isOpen && !isLocked ? (
                      <div id={`module-lessons-${module.id}`} className="mt-3 space-y-2">
                        {(module.lessons ?? []).map((lesson, idx) => (
                          <div key={lesson.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-xs font-semibold text-slate-700">
                              {idx + 1}. {lesson.title}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              PRE: {lesson.pretestScore != null ? `${lesson.pretestScore}%` : '—'} · POST:{' '}
                              {lesson.posttestScore ?? '-'}% ·{' '}
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
          </section>
        ))}
      </div>
      </section>
    </div>
  )
}
