'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardList,
  FolderKanban,
  FileQuestion,
  Award,
  Heart,
  Brain,
  Sparkles,
  TrendingUp,
  ChevronDown,
  ListTodo,
} from 'lucide-react'
import { useApex } from '../apex-context'
import { cn } from '@/lib/utils'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { levelToDisplayBand } from '@/lib/calibration/engine'
import type { PlacementProductPhase } from '@/lib/assessment/placement-lifecycle'

interface AssessmentComponent {
  id: string
  name: string
  nameEn: string
  weight: number
  score: number
  icon: React.ReactNode
  color: string
  description: string
  descriptionEn: string
}

const baseComponents: AssessmentComponent[] = [
  {
    id: 'kognitif',
    name: 'Kognitif',
    nameEn: 'Cognitive',
    weight: 22,
    score: 50,
    icon: <FolderKanban size={20} />,
    color: 'purple',
    description: 'Kemampuan penalaran, pemahaman konsep, dan penyelesaian masalah',
    descriptionEn: 'Reasoning, conceptual understanding, and problem-solving ability'
  },
  {
    id: 'bahasa',
    name: 'Bahasa',
    nameEn: 'Language',
    weight: 18,
    score: 50,
    icon: <FileQuestion size={20} />,
    color: 'blue',
    description: 'Kemampuan memahami, menulis, dan komunikasi bahasa',
    descriptionEn: 'Comprehension, writing, and language communication skills'
  },
  {
    id: 'digital',
    name: 'Digital / CS',
    nameEn: 'Digital / CS',
    weight: 20,
    score: 50,
    icon: <Brain size={20} />,
    color: 'emerald',
    description: 'Literasi digital, logika komputasi, dan coding',
    descriptionEn: 'Digital literacy, computational logic, and coding'
  },
  {
    id: 'karakter',
    name: 'Karakter',
    nameEn: 'Character',
    weight: 15,
    score: 50,
    icon: <Award size={20} />,
    color: 'orange',
    description: 'Sikap, disiplin, konsistensi, dan kebiasaan belajar',
    descriptionEn: 'Attitude, discipline, consistency, and study habits'
  },
  {
    id: 'spiritual',
    name: 'Spiritual',
    nameEn: 'Spiritual',
    weight: 13,
    score: 50,
    icon: <Heart size={20} />,
    color: 'pink',
    description: 'Kebiasaan ibadah, nilai, dan integritas pribadi',
    descriptionEn: 'Worship habits, values, and personal integrity'
  },
  {
    id: 'leadership',
    name: 'Leadership',
    nameEn: 'Leadership',
    weight: 12,
    score: 50,
    icon: <Sparkles size={20} />,
    color: 'purple',
    description: 'Inisiatif, kolaborasi, komunikasi, dan pengaruh positif',
    descriptionEn: 'Initiative, collaboration, communication, and positive influence'
  }
]

type RemediationItem = {
  id: string
  dimension: string
  conceptKey: string
  reason: string
  priority: string
  status: string
  metadata: Record<string, unknown>
  createdAt: string
  resolvedAt: string | null
}

function dimensionDisplayLabel(dim: string, t: (id: string, en: string) => string) {
  const c = baseComponents.find((x) => x.id === dim)
  if (c) return t(c.name, c.nameEn)
  return dim.replace(/_/g, ' ')
}

function remediationOccurrenceCount(metadata: Record<string, unknown>): number | null {
  const n = metadata.count
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : null
}

function formatRemediationShortDate(iso: string, lang: 'id' | 'en') {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return iso
  }
}

/**
 * Validates the session with Supabase Auth (unlike getSession(), which can return a stale JWT).
 * Refreshes tokens when needed so Bearer tokens accepted by /api/assessment/* succeed.
 */
async function getFreshAccessTokenForApis(
  client: ReturnType<typeof createSupabaseBrowserClient>,
): Promise<string | null> {
  const { error: validateErr } = await client.auth.getUser()
  if (!validateErr) {
    const { data } = await client.auth.getSession()
    const tok = data.session?.access_token
    if (tok) return tok
  }
  const { data: refreshed, error: refreshErr } = await client.auth.refreshSession()
  if (!refreshErr && refreshed.session?.access_token) return refreshed.session.access_token
  const { data: again } = await client.auth.getSession()
  return again.session?.access_token ?? null
}

function describePlacementPhase(phase: PlacementProductPhase | undefined, t: (id: string, en: string) => string) {
  switch (phase) {
    case 'L1_INTAKE':
      return t('Lapis 1 — Intake adaptif', 'Layer 1 — Adaptive intake')
    case 'L2_CALIBRATION':
      return t('Lapis 2 — Kalibrasi dinamis', 'Layer 2 — Dynamic calibration')
    case 'L3_RADAR_PROVISIONAL':
      return t('Lapis 3 — Radar kompetensi (provisional)', 'Layer 3 — Competency radar (provisional)')
    case 'L4_PARENT_VALIDATION_PENDING':
      return t('Lapis 4 — Menunggu validasi orang tua', 'Layer 4 — Awaiting parent validation')
    case 'PLACEMENT_STABLE':
      return t('Penempatan aktif — review berkala terjadwal', 'Active placement — scheduled periodic review')
    case 'CONTINUOUS_REVIEW_DUE':
      return t('Review penempatan — waktunya penyesuaian', 'Placement review — time to adjust')
    default:
      return t('Kalibrasi', 'Calibration')
  }
}

export function AssessmentDashboard() {
  const { t, language, userRole } = useApex()
  const [expandedComponent, setExpandedComponent] = useState<string | null>(null)
  const [scores, setScores] = useState<Record<string, number>>(
    baseComponents.reduce((acc, comp) => ({ ...acc, [comp.id]: comp.score }), {} as Record<string, number>),
  )
  const [loading, setLoading] = useState(true)
  const [statusLabel, setStatusLabel] = useState<string>('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [sessionsCompleted, setSessionsCompleted] = useState<number>(0)
  const [productPhase, setProductPhase] = useState<PlacementProductPhase | undefined>(undefined)
  const [nextContinuousReviewInDays, setNextContinuousReviewInDays] = useState<number | null>(null)
  const [remediationItems, setRemediationItems] = useState<RemediationItem[]>([])
  const [remediationLoaded, setRemediationLoaded] = useState(false)
  const [remediationHistoryOpen, setRemediationHistoryOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    if (userRole === null) {
      return () => {
        mounted = false
      }
    }

    if (userRole !== 'student') {
      setLoading(false)
      setFetchError(null)
      setRemediationLoaded(true)
      setRemediationItems([])
      return () => {
        mounted = false
      }
    }

    const loadAssessmentStatus = async () => {
      setLoading(true)
      setFetchError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const token = await getFreshAccessTokenForApis(supabase)
        if (!token) {
          if (!mounted) return
          setLoading(false)
          setRemediationLoaded(true)
          setRemediationItems([])
          setFetchError(
            t('Sesi berakhir atau belum login. Muat ulang halaman atau login lagi.', 'Session expired or not signed in. Reload or sign in again.'),
          )
          return
        }

        const [res, resRemediation] = await Promise.all([
          fetch('/api/assessment/status', {
            headers: { authorization: `Bearer ${token}` },
            cache: 'no-store',
          }),
          fetch('/api/assessment/remediation', {
            headers: { authorization: `Bearer ${token}` },
            cache: 'no-store',
          }),
        ])

        const json = (await res.json()) as {
          message?: string
          status?: string
          productPhase?: PlacementProductPhase
          nextContinuousReviewInDays?: number | null
          sessionsCompleted?: number
          provisionalProfile?: Record<
            string,
            { level: string; confidenceBand?: 'narrow' | 'moderate' | 'wide' }
          >
        }
        if (!res.ok) {
          throw new Error(json.message ?? 'Gagal memuat status assessment')
        }

        if (resRemediation.ok) {
          const remJson = (await resRemediation.json()) as { items?: RemediationItem[] }
          if (mounted) setRemediationItems(remJson.items ?? [])
        } else if (mounted) {
          setRemediationItems([])
        }

        const profile = json.provisionalProfile ?? {}
        const nextScores: Record<string, number> = {}
        for (const comp of baseComponents) {
          const level = profile[comp.id]?.level ?? 'SOLID'
          nextScores[comp.id] = levelToDisplayBand(level)
        }

        if (!mounted) return
        setScores(nextScores)
        setStatusLabel(String(json.status ?? '').toUpperCase())
        setSessionsCompleted(Number(json.sessionsCompleted ?? 0))
        setProductPhase(json.productPhase)
        setNextContinuousReviewInDays(
          json.nextContinuousReviewInDays === undefined ? null : json.nextContinuousReviewInDays,
        )
        setRemediationLoaded(true)
      } catch (error) {
        if (!mounted) return
        setFetchError(error instanceof Error ? error.message : 'Gagal memuat data assessment')
        setRemediationItems([])
        setRemediationLoaded(true)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadAssessmentStatus()
    return () => {
      mounted = false
    }
  }, [userRole])

  const calculateWeightedScore = () => {
    return baseComponents.reduce((total, comp) => {
      return total + (scores[comp.id] * comp.weight / 100)
    }, 0)
  }

  const weightedScore = calculateWeightedScore()
  const grade = weightedScore >= 90 ? 'A' : weightedScore >= 80 ? 'B' : weightedScore >= 70 ? 'C' : weightedScore >= 60 ? 'D' : 'E'
  const statusTone = statusLabel === 'PLACED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : statusLabel === 'EXTENDED'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : statusLabel === 'PENDING'
        ? 'border-slate-200 bg-slate-50 text-slate-700'
        : 'border-blue-200 bg-blue-50 text-blue-700'
  const assessmentComponents = useMemo(
    () => baseComponents.map((comp) => ({ ...comp, score: scores[comp.id] ?? comp.score })),
    [scores],
  )

  const activeRemediation = useMemo(
    () => remediationItems.filter((it) => it.status === 'PENDING' || it.status === 'IN_PROGRESS'),
    [remediationItems],
  )

  const completedRemediation = useMemo(() => {
    const rows = remediationItems.filter((it) => it.status === 'DONE' || it.status === 'DISMISSED')
    const ts = (it: RemediationItem) =>
      new Date(it.resolvedAt ?? it.createdAt).getTime()
    return [...rows].sort((a, b) => ts(b) - ts(a)).slice(0, 8)
  }, [remediationItems])

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
        <ClipboardList size={20} className="text-blue-500" />
        {t('Dashboard Penilaian Holistik', 'Holistic Assessment Dashboard')}
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        {t(
          'Sistem penilaian 6 dimensi sesuai metodologi pembelajaran mandiri global',
          '6-dimension assessment system following global self-learning methodology'
        )}
      </p>
      {userRole !== null && userRole !== 'student' ? (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {t(
            'Data penempatan dan radar real-time di bawah ini hanya ditampilkan untuk akun siswa. Orang tua/mentor memantau lewat menu kontrol masing-masing.',
            'Placement and live radar below are loaded for student accounts only. Parents and mentors use their own dashboards to monitor progress.',
          )}
        </p>
      ) : null}
      {statusLabel ? (
        <div className="mb-4 space-y-1">
          <div className={`inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusTone}`}>
            <span>{t('Status sistem', 'System status')}:</span>
            <span>{statusLabel}</span>
            <span>•</span>
            <span>{sessionsCompleted} {t('sesi modul', 'module sessions')}</span>
          </div>
          {productPhase ? (
            <p className="text-xs font-medium text-slate-700">
              {describePlacementPhase(productPhase, t)}
            </p>
          ) : null}
          {nextContinuousReviewInDays !== null && productPhase === 'PLACEMENT_STABLE' ? (
            <p className="text-[11px] text-slate-500">
              {nextContinuousReviewInDays > 0
                ? t(
                    `Review penempatan berkala dalam ~${nextContinuousReviewInDays} hari.`,
                    `Periodic placement review in ~${nextContinuousReviewInDays} days.`,
                  )
                : t(
                    'Review penempatan berkala dapat dijalankan kapan saja.',
                    'Periodic placement review may run anytime.',
                  )}
            </p>
          ) : null}
          {productPhase === 'CONTINUOUS_REVIEW_DUE' ? (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              {t(
                'Sistem menyarankan peninjauan ulang penempatan berdasarkan jadwal (4–6 minggu). Lanjutkan belajar; mentor atau job otomatis dapat memperbarui jalur.',
                'The system suggests a placement review on schedule (every 4–6 weeks). Keep learning; a mentor or automated job may update your path.',
              )}
            </p>
          ) : null}
        </div>
      ) : null}
      {fetchError ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {t('Data assessment real-time belum tersedia.', 'Real-time assessment data is not available yet')} ({fetchError})
        </div>
      ) : null}

      {remediationLoaded ? (
        <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
          <h3 className="text-sm font-bold text-violet-900 mb-1 flex items-center gap-2">
            <ListTodo size={18} className="text-violet-600" />
            {t('Fokus remediasi', 'Remediation focus')}
          </h3>
          <p className="text-xs text-violet-800/80 mb-3">
            {t(
              'Topik berikut disarankan berdasarkan pola kesalahan berulang dari kalibrasi. Teruskan latihan di modul terkait.',
              'These topics are suggested from repeated error patterns in calibration. Continue practice in related modules.',
            )}
          </p>
          {activeRemediation.length === 0 ? (
            <p className="text-xs text-slate-600 py-1">
              {t('Tidak ada item remediasi aktif saat ini.', 'No active remediation items right now.')}
            </p>
          ) : (
            <ul className="space-y-2">
              {activeRemediation.map((it) => {
                const pr = it.priority.toUpperCase()
                const priTone =
                  pr === 'HIGH'
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : pr === 'LOW'
                      ? 'border-slate-200 bg-white text-slate-600'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                const occ = remediationOccurrenceCount(it.metadata)
                return (
                  <li
                    key={it.id}
                    className="rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-800">{it.conceptKey}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priTone}`}
                      >
                        {pr}
                      </span>
                      <span className="text-[10px] font-medium uppercase text-slate-500">
                        {it.status.replace('_', ' ')}
                      </span>
                      {occ != null && occ >= 2 ? (
                        <span className="text-[10px] text-slate-500">
                          {t(`Terdeteksi ${occ}×`, `Detected ${occ}×`)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-600 mb-0.5">
                      <span className="font-medium text-slate-700">
                        {dimensionDisplayLabel(it.dimension, t)}
                      </span>
                      {' · '}
                      {it.reason}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-violet-900/70 leading-snug">
            {t(
              'Tip: gunakan Learning Hub untuk mencari latihan sesuai kata kunci topik di atas.',
              'Tip: use the Learning Hub to find practice matching the topic keywords above.',
            )}
          </p>
          {completedRemediation.length > 0 ? (
            <div className="mt-3 border-t border-violet-200/70 pt-2">
              <button
                type="button"
                onClick={() => setRemediationHistoryOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-xs font-semibold text-violet-900 hover:bg-violet-100/50 transition-colors"
              >
                <span>
                  {t('Riwayat remediasi', 'Remediation history')}
                  <span className="ml-1 font-normal text-violet-800/80">
                    ({completedRemediation.length})
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  className={cn('shrink-0 text-violet-700 transition-transform', remediationHistoryOpen && 'rotate-180')}
                />
              </button>
              {remediationHistoryOpen ? (
                <ul className="mt-1 space-y-1.5 pl-0.5">
                  {completedRemediation.map((it) => {
                    const when = formatRemediationShortDate(
                      it.resolvedAt ?? it.createdAt,
                      language,
                    )
                    const st = it.status === 'DONE' ? t('Selesai', 'Done') : t('Ditutup', 'Dismissed')
                    return (
                      <li
                        key={it.id}
                        className="rounded-lg border border-violet-100/80 bg-white/50 px-2.5 py-1.5 text-[11px] text-slate-600"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-1">
                          <span className="font-medium text-slate-800">{it.conceptKey}</span>
                          <span className="text-slate-400">{when}</span>
                        </div>
                        <div className="text-slate-500">
                          {dimensionDisplayLabel(it.dimension, t)} · {st}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Overall Score */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 rounded-2xl text-white mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-sm font-medium mb-1">
              {t('Skor Total Tertimbang', 'Total Weighted Score')}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black">{weightedScore.toFixed(1)}</span>
              <span className="text-xl font-bold text-blue-200">/ 100</span>
            </div>
          </div>
          <div className="text-center">
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-4xl font-black">{grade}</span>
            </div>
            <p className="text-xs text-blue-200 mt-1">{t('Grade', 'Grade')}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <TrendingUp size={16} />
          <span>
            {loading
              ? t('Memuat data kalibrasi...', 'Loading calibration data...')
              : t('Skor mengikuti hasil kalibrasi assessment terbaru', 'Score follows latest assessment calibration result')}
          </span>
        </div>
      </div>

      {/* Component Breakdown */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-600 mb-1">
          {t('Rincian Per Komponen', 'Component Breakdown')}
        </h3>
        <p className="text-[11px] text-slate-500 mb-3">
          {t(
            'Batang progres memetakan level kompetensi (bukan skor mentah), sesuai kebijakan assessment.',
            'Progress bars map competency levels (not raw scores), per assessment policy.',
          )}
        </p>
        
        {assessmentComponents.map((comp) => {
          const isExpanded = expandedComponent === comp.id
          return (
            <div
              key={comp.id}
              className={cn(
                'border-2 rounded-xl overflow-hidden transition-all',
                isExpanded ? 'border-blue-300' : 'border-slate-200'
              )}
            >
              <button
                onClick={() => setExpandedComponent(isExpanded ? null : comp.id)}
                className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors"
              >
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center',
                  comp.color === 'purple' ? 'bg-purple-100 text-purple-600' :
                  comp.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                  comp.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
                  comp.color === 'orange' ? 'bg-orange-100 text-orange-600' :
                  'bg-pink-100 text-pink-600'
                )}>
                  {comp.icon}
                </div>
                
                <div className="flex-1 text-left">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-800">
                      {t(comp.name, comp.nameEn)}
                    </span>
                    <span className="text-sm text-slate-500">
                      {comp.weight}% {t('bobot', 'weight')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          'h-full rounded-full transition-all',
                          comp.color === 'purple' ? 'bg-purple-500' :
                          comp.color === 'blue' ? 'bg-blue-500' :
                          comp.color === 'emerald' ? 'bg-emerald-500' :
                          comp.color === 'orange' ? 'bg-orange-500' :
                          'bg-pink-500'
                        )}
                        style={{ width: `${scores[comp.id]}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-slate-700 w-12 text-right">
                      {(scores[comp.id] ?? 0)}%
                    </span>
                  </div>
                </div>
                
                <ChevronDown 
                  size={20} 
                  className={cn(
                    'text-slate-400 transition-transform',
                    isExpanded && 'rotate-180'
                  )} 
                />
              </button>
              
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                  <p className="text-sm text-slate-600 mb-3">
                    {t(comp.description, comp.descriptionEn)}
                  </p>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-600">
                      {t(
                        'Skor komponen ini dihitung otomatis dari intake + sinyal kalibrasi dinamis.',
                        'This component score is automatically computed from intake + dynamic calibration signals.',
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Weight Distribution Visual */}
      <div className="mt-6 p-4 bg-slate-50 rounded-xl">
        <h4 className="text-sm font-bold text-slate-600 mb-3">
          {t('Distribusi Bobot Penilaian', 'Assessment Weight Distribution')}
        </h4>
        <div className="flex h-4 rounded-full overflow-hidden">
          {assessmentComponents.map((comp) => (
            <div
              key={comp.id}
              className={cn(
                comp.color === 'purple' ? 'bg-purple-500' :
                comp.color === 'blue' ? 'bg-blue-500' :
                comp.color === 'emerald' ? 'bg-emerald-500' :
                comp.color === 'orange' ? 'bg-orange-500' :
                'bg-pink-500'
              )}
              style={{ width: `${comp.weight}%` }}
              title={`${t(comp.name, comp.nameEn)}: ${comp.weight}%`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {assessmentComponents.map((comp) => (
            <div key={comp.id} className="flex items-center gap-1.5 text-xs">
              <div className={cn(
                'w-3 h-3 rounded-full',
                comp.color === 'purple' ? 'bg-purple-500' :
                comp.color === 'blue' ? 'bg-blue-500' :
                comp.color === 'emerald' ? 'bg-emerald-500' :
                comp.color === 'orange' ? 'bg-orange-500' :
                'bg-pink-500'
              )} />
              <span className="text-slate-600">{comp.weight}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
