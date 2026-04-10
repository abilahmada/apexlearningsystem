'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Award, TrendingUp, Clock, BookOpen } from 'lucide-react'
import { useApex } from '../apex-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { levelToDisplayBand } from '@/lib/calibration/engine'

type ParentMonitoringResponse = {
  parent: { id: string; name: string; parentLinkCode: string | null }
  students: Array<{
    studentProfileId: string
    studentUserId: string
    studentName: string
    gradeLevel: string
    currentGradeClass: number
    avgScore: number
    completedModules: number
    latestConfusedTopic: string | null
    latestValidation: {
      agreedWithProfile: boolean
      adjustments: Record<string, number>
      observations: string | null
      submittedAt: string
    } | null
    assessmentProfile: Record<string, { level: string }>
  }>
  alerts: Array<{
    id: string
    student_id: string
    type: string
    message_content: string
    is_read: boolean
    created_at: string
  }>
}

export function ParentAnalytics() {
  const { t } = useApex()
  const [data, setData] = useState<ParentMonitoringResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [updatingAlertId, setUpdatingAlertId] = useState<string | null>(null)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [agreeWithProfile, setAgreeWithProfile] = useState(true)
  const [observations, setObservations] = useState('')
  const [savingValidation, setSavingValidation] = useState(false)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [loadingFinalProfile, setLoadingFinalProfile] = useState(false)
  const [finalProfileError, setFinalProfileError] = useState<string | null>(null)
  const [finalProfile, setFinalProfile] = useState<Record<
    string,
    { level: string; trend: 'up' | 'down' | 'stable'; confidenceBand: 'narrow' | 'moderate' | 'wide' }
  > | null>(null)
  const [chartAnimKey, setChartAnimKey] = useState(0)
  const [animatedProfile, setAnimatedProfile] = useState<Record<string, number>>({
    kognitif: 50,
    bahasa: 50,
    digital: 50,
    karakter: 50,
    spiritual: 50,
    leadership: 50,
  })
  const animatedProfileRef = useRef(animatedProfile)
  animatedProfileRef.current = animatedProfile
  const [adjustments, setAdjustments] = useState<Record<string, number>>({
    kognitif: 0,
    bahasa: 0,
    digital: 0,
    karakter: 0,
    spiritual: 0,
    leadership: 0,
  })
  const [observationBasis, setObservationBasis] = useState<'daily_home' | 'school_home' | 'both'>('both')
  const [confidenceLevel, setConfidenceLevel] = useState<'high' | 'medium' | 'low'>('medium')

  useEffect(() => {
    const loadMonitoring = async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token
        if (!accessToken) {
          setLoading(false)
          return
        }

        const res = await fetch('/api/parent/monitoring', {
          headers: { authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        })
        if (!res.ok) {
          setLoading(false)
          return
        }
        const json = (await res.json()) as ParentMonitoringResponse
        setData(json)
      } finally {
        setLoading(false)
      }
    }

    void loadMonitoring()
  }, [])

  useEffect(() => {
    if (!data?.students?.length) {
      setSelectedStudentId(null)
      return
    }
    if (!selectedStudentId || !data.students.some((s) => s.studentProfileId === selectedStudentId)) {
      setSelectedStudentId(data.students[0].studentProfileId)
    }
  }, [data, selectedStudentId])

  const focusedStudent = useMemo(
    () => data?.students?.find((s) => s.studentProfileId === selectedStudentId) ?? data?.students?.[0] ?? null,
    [data, selectedStudentId],
  )

  const unreadAlertCountByStudent = useMemo(() => {
    const out: Record<string, number> = {}
    for (const alert of data?.alerts ?? []) {
      if (alert.is_read) continue
      out[alert.student_id] = (out[alert.student_id] ?? 0) + 1
    }
    return out
  }, [data])

  const filteredAlerts = useMemo(() => {
    if (!focusedStudent) return []
    return (data?.alerts ?? []).filter((a) => a.student_id === focusedStudent.studentProfileId)
  }, [data, focusedStudent])
  const totalAdjustment = useMemo(
    () =>
      Object.values(adjustments).reduce(
        (acc, n) => acc + (Number.isFinite(Number(n)) ? Number(n) : 0),
        0,
      ),
    [adjustments],
  )
  const adjustmentTone =
    totalAdjustment > 0
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : totalAdjustment < 0
        ? 'text-rose-700 bg-rose-50 border-rose-200'
        : 'text-slate-700 bg-slate-50 border-slate-200'
  const topPositiveAdjustment = useMemo(() => {
    const entries = Object.entries(adjustments)
      .map(([k, v]) => [k, Number(v)] as const)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
    return entries[0] ?? null
  }, [adjustments])
  const topNegativeAdjustment = useMemo(() => {
    const entries = Object.entries(adjustments)
      .map(([k, v]) => [k, Number(v)] as const)
      .filter(([, v]) => v < 0)
      .sort((a, b) => a[1] - b[1])
    return entries[0] ?? null
  }, [adjustments])
  const toDimLabel = (key: string) => {
    if (key === 'kognitif') return t('Kognitif', 'Cognitive')
    if (key === 'bahasa') return t('Bahasa', 'Language')
    if (key === 'digital') return t('Digital', 'Digital')
    if (key === 'karakter') return t('Karakter', 'Character')
    if (key === 'spiritual') return t('Spiritual', 'Spiritual')
    return t('Leadership', 'Leadership')
  }
  const levelLabel = (lvl: string) => {
    if (lvl === 'DEVELOPING') return t('Berkembang', 'Developing')
    if (lvl === 'SOLID') return t('Solid', 'Solid')
    if (lvl === 'PROFICIENT') return t('Mahir', 'Proficient')
    if (lvl === 'ADVANCED') return t('Lanjut', 'Advanced')
    return lvl
  }
  const trendLabel = (tr: 'up' | 'down' | 'stable') => {
    if (tr === 'up') return t('Cenderung naik vs intake', 'Trending up vs intake')
    if (tr === 'down') return t('Cenderung turun vs intake', 'Trending down vs intake')
    return t('Stabil vs intake', 'Stable vs intake')
  }
  const confidenceLabel = (b: 'narrow' | 'moderate' | 'wide') => {
    if (b === 'narrow') return t('Rentang keyakinan sempit', 'Narrow confidence band')
    if (b === 'moderate') return t('Rentang keyakinan sedang', 'Moderate confidence band')
    return t('Rentang keyakinan lebar', 'Wide confidence band')
  }
  const chartDimensions = useMemo(
    () => [
      { key: 'kognitif', label: t('Kognitif', 'Cognitive') },
      { key: 'bahasa', label: t('Bahasa', 'Language') },
      { key: 'digital', label: t('Digital / CS', 'Digital / CS') },
      { key: 'karakter', label: t('Karakter', 'Character') },
      { key: 'spiritual', label: t('Spiritual', 'Spiritual') },
      { key: 'leadership', label: t('Leadership', 'Leadership') },
    ],
    [t],
  )
  const profileForChart = useMemo((): Record<string, number> => {
    const dims = ['kognitif', 'bahasa', 'digital', 'karakter', 'spiritual', 'leadership'] as const
    const fallback: Record<string, number> = {}
    for (const d of dims) fallback[d] = levelToDisplayBand('SOLID')
    const src = focusedStudent?.assessmentProfile
    if (!src) return fallback
    const out: Record<string, number> = { ...fallback }
    for (const d of dims) {
      const lvl = src[d]?.level
      if (lvl) out[d] = levelToDisplayBand(lvl)
    }
    return out
  }, [focusedStudent])
  const radarPoints = useMemo(() => {
    const center = 100
    const maxRadius = 72
    return chartDimensions.map((dim, idx) => {
      const angle = (-90 + idx * (360 / chartDimensions.length)) * (Math.PI / 180)
      const valuePct = Math.max(0, Math.min(100, Number(profileForChart[dim.key] ?? 0))) / 100
      const r = maxRadius * valuePct
      const x = center + Math.cos(angle) * r
      const y = center + Math.sin(angle) * r
      return `${x},${y}`
    }).join(' ')
  }, [chartDimensions, profileForChart])
  const radarGrid = useMemo(() => {
    const center = 100
    const levels = [0.25, 0.5, 0.75, 1]
    return levels.map((level) => {
      const r = 72 * level
      const points = chartDimensions.map((_, idx) => {
        const angle = (-90 + idx * (360 / chartDimensions.length)) * (Math.PI / 180)
        const x = center + Math.cos(angle) * r
        const y = center + Math.sin(angle) * r
        return `${x},${y}`
      }).join(' ')
      return points
    })
  }, [chartDimensions])
  const radarLabelPositions = useMemo(() => {
    const center = 100
    const labelRadius = 84
    return chartDimensions.map((dim, idx) => {
      const angle = (-90 + idx * (360 / chartDimensions.length)) * (Math.PI / 180)
      return {
        ...dim,
        x: center + Math.cos(angle) * labelRadius,
        y: center + Math.sin(angle) * labelRadius,
      }
    })
  }, [chartDimensions])
  const splitRadarLabel = (label: string) => {
    if (!label.includes('/')) return [label]
    return label.split('/').map((part) => part.trim()).filter(Boolean)
  }
  const weightedImpactPreview = useMemo(() => {
    const parentWeights: Record<string, number> = {
      kognitif: 0.1,
      bahasa: 0.15,
      digital: 0.1,
      karakter: 0.45,
      spiritual: 0.7,
      leadership: 0.35,
    }
    return Object.entries(adjustments).map(([dim, adj]) => {
      const weight = parentWeights[dim] ?? 0
      const impactIndex = Number(adj) * weight
      return { dim, weight, impactIndex }
    })
  }, [adjustments])

  useEffect(() => {
    if (!focusedStudent) return
    const latest = focusedStudent.latestValidation
    if (!latest) {
      setAgreeWithProfile(true)
      setObservations('')
      setAdjustments({
        kognitif: 0,
        bahasa: 0,
        digital: 0,
        karakter: 0,
        spiritual: 0,
        leadership: 0,
      })
      setValidationMessage(null)
      return
    }
    setAgreeWithProfile(latest.agreedWithProfile)
    setObservations(latest.observations ?? '')
    setAdjustments({
      kognitif: Number(latest.adjustments?.kognitif ?? 0),
      bahasa: Number(latest.adjustments?.bahasa ?? 0),
      digital: Number(latest.adjustments?.digital ?? 0),
      karakter: Number(latest.adjustments?.karakter ?? 0),
      spiritual: Number(latest.adjustments?.spiritual ?? 0),
      leadership: Number(latest.adjustments?.leadership ?? 0),
    })
    setValidationMessage(null)
  }, [focusedStudent])
  useEffect(() => {
    if (!focusedStudent?.studentProfileId) return
    setChartAnimKey((prev) => prev + 1)
  }, [focusedStudent?.studentProfileId])
  useEffect(() => {
    const target = profileForChart
    const start = { ...animatedProfileRef.current }
    const startTime = performance.now()
    const duration = 320
    let raf = 0

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration)
      const ease = 1 - Math.pow(1 - progress, 3)
      const next: Record<string, number> = {}
      for (const key of Object.keys(target)) {
        const from = Number(start[key] ?? 0)
        const to = Number(target[key] ?? 0)
        next[key] = from + (to - from) * ease
      }
      setAnimatedProfile(next)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [profileForChart])

  const formatAlertTime = (iso: string) => {
    const date = new Date(iso)
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.max(1, Math.floor(diffMs / (1000 * 60)))
    if (diffMin < 60) return t(`${diffMin} menit lalu`, `${diffMin} min ago`)
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return t(`${diffHour} jam lalu`, `${diffHour}h ago`)
    const diffDay = Math.floor(diffHour / 24)
    return t(`${diffDay} hari lalu`, `${diffDay}d ago`)
  }

  const markAlertAsRead = async (alertId: string) => {
    setUpdatingAlertId(alertId)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) return

      const res = await fetch('/api/parent/monitoring', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ alertId, isRead: true }),
      })
      if (!res.ok) return

      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          alerts: prev.alerts.map((a) => (a.id === alertId ? { ...a, is_read: true } : a)),
        }
      })
    } finally {
      setUpdatingAlertId(null)
    }
  }

  const markAllAlertsAsRead = async () => {
    if (!focusedStudent) return
    setMarkingAllRead(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) return

      const res = await fetch('/api/parent/monitoring', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          markAllForStudent: true,
          studentId: focusedStudent.studentProfileId,
          isRead: true,
        }),
      })
      if (!res.ok) return

      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          alerts: prev.alerts.map((a) =>
            a.student_id === focusedStudent.studentProfileId ? { ...a, is_read: true } : a,
          ),
        }
      })
    } finally {
      setMarkingAllRead(false)
    }
  }

  const submitParentValidation = async () => {
    if (!focusedStudent) return
    setSavingValidation(true)
    setValidationMessage(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        setValidationMessage(t('Sesi login tidak ditemukan.', 'Login session not found.'))
        return
      }

      const res = await fetch('/api/assessment/parent-validation', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          studentUserId: focusedStudent.studentUserId,
          agreedWithProfile: agreeWithProfile,
          adjustments,
          observations,
          specialConditions: [],
          structuredSession: {
            observationBasis,
            confidenceLevel,
          },
        }),
      })
      const json = (await res.json()) as { message?: string }
      if (!res.ok) {
        setValidationMessage(json.message ?? t('Gagal menyimpan validasi.', 'Failed to save validation.'))
        return
      }
      setValidationMessage(t('Validasi orang tua berhasil disimpan.', 'Parent validation saved successfully.'))
      const refresh = await fetch('/api/parent/monitoring', {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      if (refresh.ok) {
        setData((await refresh.json()) as ParentMonitoringResponse)
      }
    } finally {
      setSavingValidation(false)
    }
  }
  const loadFinalProfile = async () => {
    if (!focusedStudent) return
    setLoadingFinalProfile(true)
    setFinalProfileError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        setFinalProfileError(t('Sesi login tidak ditemukan.', 'Login session not found.'))
        return
      }

      const res = await fetch(
        `/api/assessment/final-profile?studentProfileId=${encodeURIComponent(focusedStudent.studentProfileId)}`,
        {
          headers: { authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        },
      )
      const json = (await res.json()) as {
        message?: string
        profile?: Record<
          string,
          { level: string; trend: 'up' | 'down' | 'stable'; confidenceBand: 'narrow' | 'moderate' | 'wide' }
        >
      }
      if (!res.ok) {
        setFinalProfile(null)
        setFinalProfileError(json.message ?? t('Belum ada final profile.', 'Final profile is not ready yet.'))
        return
      }
      setFinalProfile(json.profile ?? null)
    } finally {
      setLoadingFinalProfile(false)
    }
  }
  useEffect(() => {
    if (!focusedStudent?.studentProfileId) {
      setFinalProfile(null)
      setFinalProfileError(null)
      return
    }
    void loadFinalProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedStudent?.studentProfileId])

  return (
    <div className="grid md:grid-cols-2 gap-6 animate-in fade-in">
      {/* Competency Profile */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-2">
          {t('Profil Kompetensi Holistik (Berdasarkan Standar Global)', 'Holistic Competency Profile (Global Standard)')}
        </h2>
        <p className="text-[11px] text-slate-500 mb-4">
          {t(
            'Radar memetakan level deskriptif (bukan skor numerik mentah).',
            'The radar maps descriptive levels (not raw numeric scores).',
          )}
        </p>

        {/* Spider Chart Placeholder */}
        <div className="aspect-square bg-slate-50 rounded-full border-4 border-slate-100 flex items-center justify-center relative p-8">
          <svg viewBox="0 0 200 200" className="absolute inset-4">
            {radarGrid.map((points, idx) => (
              <polygon
                key={idx}
                points={points}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            ))}
            <g key={chartAnimKey} className="animate-in fade-in duration-300">
              <polygon
                points={radarPoints}
                fill="rgba(59, 130, 246, 0.2)"
                stroke="#3b82f6"
                strokeWidth="2"
              />
              {radarPoints.split(' ').map((pt, idx) => {
                const [x, y] = pt.split(',')
                return <circle key={idx} cx={x} cy={y} r="3.5" fill="#3b82f6" />
              })}
            </g>
            {radarLabelPositions.map((dim) => {
              const lines = splitRadarLabel(dim.label)
              return (
                <text
                  key={dim.key}
                  x={dim.x}
                  y={dim.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="#475569"
                >
                  {lines.map((line, idx) => (
                    <tspan key={`${dim.key}-${idx}`} x={dim.x} dy={idx === 0 ? 0 : 9}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )
            })}
          </svg>
        </div>

        {/* Legend — show level labels, not pseudo-percentages */}
        <div className="mt-6 grid grid-cols-3 gap-2">
          {chartDimensions.map((item) => (
            <div key={item.key} className="text-center">
              <p className="text-lg font-bold text-blue-700">
                {levelLabel(focusedStudent?.assessmentProfile?.[item.key]?.level ?? 'SOLID')}
              </p>
              <p className="text-xs text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Insights & Alerts */}
      <div className="space-y-6">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <p className="text-xs font-bold text-slate-600 mb-2">
            {t('Pilih Anak', 'Select Student')}
          </p>
          {data?.students?.length ? (
            <div className="flex flex-wrap gap-2">
              {data.students.map((student) => {
                const active = student.studentProfileId === focusedStudent?.studentProfileId
                const unreadCount = unreadAlertCountByStudent[student.studentProfileId] ?? 0
                return (
                  <button
                    key={student.studentProfileId}
                    onClick={() => setSelectedStudentId(student.studentProfileId)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {student.studentName} ({student.gradeLevel} {t('Kelas', 'Class')} {student.currentGradeClass})
                    {unreadCount > 0 && (
                      <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${
                        active ? 'bg-white/25 text-white' : 'bg-red-100 text-red-700'
                      }`}>
                        {unreadCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {t('Belum ada anak terhubung.', 'No linked students yet.')}
            </p>
          )}
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <p className="text-sm font-bold text-slate-700 mb-2">
            {t('Validasi Profil Assessment', 'Assessment Profile Validation')}
          </p>
          <p className="text-xs text-slate-500 mb-2">
            {focusedStudent
              ? t(`Untuk ${focusedStudent.studentName}`, `For ${focusedStudent.studentName}`)
              : t('Pilih anak terlebih dahulu.', 'Select a student first.')}
          </p>
          <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">
            {t(
              'Isi form terstruktur di bawah ini — tidak perlu wawancara video. Sistem akan memproses jawaban Anda bersama data kalibrasi.',
              'Complete the structured form below — no video interview required. The system processes your answers together with calibration data.',
            )}
          </p>
          <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-700">
            {t(
              'Catatan: penyesuaian orang tua diproses oleh engine kalibrasi. Dampak biasanya lebih kuat pada dimensi Spiritual, Karakter, dan Leadership dibanding dimensi akademik.',
              'Note: parent adjustments are processed by the calibration engine. Impact is typically stronger on Spiritual, Character, and Leadership dimensions than on academic dimensions.',
            )}
          </div>
          <div className="mb-3 space-y-2">
            <p className="text-[11px] font-semibold text-slate-700">
              {t('Dasar observasi Anda', 'What is your observation mainly based on?')}
            </p>
            <div className="flex flex-col gap-1.5 text-[11px] text-slate-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="obs-basis"
                  checked={observationBasis === 'daily_home'}
                  onChange={() => setObservationBasis('daily_home')}
                />
                {t('Perilaku & rutinitas di rumah', 'Home routines & daily behavior')}
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="obs-basis"
                  checked={observationBasis === 'school_home'}
                  onChange={() => setObservationBasis('school_home')}
                />
                {t('Laporan sekolah / guru', 'School / teacher reports')}
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="obs-basis"
                  checked={observationBasis === 'both'}
                  onChange={() => setObservationBasis('both')}
                />
                {t('Gabungan rumah dan sekolah', 'Both home and school')}
              </label>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              {t('Keyakinan terhadap penilaian ini', 'Confidence in this validation')}
            </label>
            <select
              value={confidenceLevel}
              onChange={(e) =>
                setConfidenceLevel(e.target.value as 'high' | 'medium' | 'low')
              }
              className="w-full max-w-xs rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] text-slate-800 bg-white"
            >
              <option value="high">{t('Tinggi', 'High')}</option>
              <option value="medium">{t('Sedang', 'Medium')}</option>
              <option value="low">{t('Rendah', 'Low')}</option>
            </select>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="radio"
                checked={agreeWithProfile}
                onChange={() => setAgreeWithProfile(true)}
              />
              {t('Setuju profil saat ini', 'Agree with current profile')}
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="radio"
                checked={!agreeWithProfile}
                onChange={() => setAgreeWithProfile(false)}
              />
              {t('Perlu penyesuaian', 'Needs adjustment')}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            {([
              ['kognitif', t('Kognitif', 'Cognitive')],
              ['bahasa', t('Bahasa', 'Language')],
              ['digital', t('Digital', 'Digital')],
              ['karakter', t('Karakter', 'Character')],
              ['spiritual', t('Spiritual', 'Spiritual')],
              ['leadership', t('Leadership', 'Leadership')],
            ] as Array<[string, string]>).map(([key, label]) => (
              <label key={key} className="text-xs text-slate-600">
                <span>{label}</span>
                <input
                  type="number"
                  min={-2}
                  max={2}
                  disabled={agreeWithProfile}
                  value={adjustments[key] ?? 0}
                  onChange={(e) =>
                    setAdjustments((prev) => ({
                      ...prev,
                      [key]: Math.max(-2, Math.min(2, Number(e.target.value) || 0)),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-100 disabled:text-slate-400"
                />
              </label>
            ))}
          </div>
          {!agreeWithProfile ? (
            <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${adjustmentTone}`}>
              <span className="font-semibold">
                {t('Ringkasan penyesuaian', 'Adjustment summary')}:
              </span>{' '}
              {totalAdjustment > 0 ? '+' : ''}
              {totalAdjustment}{' '}
              {t(
                totalAdjustment > 0
                  ? '(cenderung menaikkan profil)'
                  : totalAdjustment < 0
                    ? '(cenderung menurunkan profil)'
                    : '(netral)',
                totalAdjustment > 0
                  ? '(tends to increase profile)'
                  : totalAdjustment < 0
                    ? '(tends to decrease profile)'
                    : '(neutral)',
              )}
              {(topPositiveAdjustment || topNegativeAdjustment) ? (
                <div className="mt-2 space-y-1">
                  {topPositiveAdjustment ? (
                    <p>
                      {t('Peningkatan dominan', 'Top increase')}: {toDimLabel(topPositiveAdjustment[0])} (+{topPositiveAdjustment[1]})
                    </p>
                  ) : null}
                  {topNegativeAdjustment ? (
                    <p>
                      {t('Penurunan dominan', 'Top decrease')}: {toDimLabel(topNegativeAdjustment[0])} ({topNegativeAdjustment[1]})
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-2 rounded-md border border-white/60 bg-white/40 px-2 py-2">
                <p className="mb-1 text-[11px] font-semibold">
                  {t('Preview dampak berbobot', 'Weighted impact preview')}
                </p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                  {weightedImpactPreview.map((item) => (
                    <p key={item.dim}>
                      {toDimLabel(item.dim)}: {item.impactIndex > 0 ? '+' : ''}{item.impactIndex.toFixed(2)}
                    </p>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-600">
                  {t(
                    'Angka ini adalah indikator relatif berbasis bobot parent, bukan theta final. Nilai akhir tetap dihitung engine kalibrasi dari gabungan semua sinyal.',
                    'These values are relative indicators based on parent weights, not final theta. Final values are still computed by the calibration engine from all signals.',
                  )}
                </p>
              </div>
            </div>
          ) : null}

          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder={t('Catatan orang tua (opsional)', 'Parent notes (optional)')}
            className="w-full min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-xs mb-3"
          />
          {focusedStudent?.latestValidation ? (
            <p className="mb-3 text-[11px] text-slate-500">
              {t('Validasi terakhir:', 'Last validation:')} {new Date(focusedStudent.latestValidation.submittedAt).toLocaleString()}
            </p>
          ) : null}

          <button
            onClick={() => void submitParentValidation()}
            disabled={!focusedStudent || savingValidation}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {savingValidation ? t('Menyimpan...', 'Saving...') : t('Simpan Validasi', 'Save Validation')}
          </button>
          {validationMessage ? (
            <p className="mt-2 text-xs text-slate-600">{validationMessage}</p>
          ) : null}
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-bold text-slate-700">
              {t('Final Profile Assessment', 'Final Assessment Profile')}
            </p>
            <button
              onClick={() => void loadFinalProfile()}
              disabled={!focusedStudent || loadingFinalProfile}
              className="px-2.5 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60"
            >
              {loadingFinalProfile ? t('Memuat...', 'Loading...') : t('Refresh Final Profile', 'Refresh Final Profile')}
            </button>
          </div>
          {finalProfileError ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              {finalProfileError}
            </p>
          ) : null}
          {finalProfile ? (
            <div className="space-y-2">
              {Object.entries(finalProfile).map(([dim, item]) => (
                <div key={dim} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{toDimLabel(dim)}</span>
                    <span className="font-medium text-slate-600">{trendLabel(item.trend)}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    {t('Level', 'Level')}: {levelLabel(item.level)} · {confidenceLabel(item.confidenceBand)}
                  </p>
                </div>
              ))}
              <p className="text-[10px] text-slate-500 pt-1">
                {t(
                  'Angka skor mentah tidak ditampilkan sesuai kebijakan privasi assessment.',
                  'Raw scores are not shown per assessment privacy policy.',
                )}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {t('Klik tombol untuk memuat profil akhir jika placement sudah final.', 'Click the button to load final profile when placement is finalized.')}
            </p>
          )}
        </div>

        {/* Learning Insight */}
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex gap-4">
          <AlertCircle className="text-blue-500 shrink-0 mt-1" size={24} />
          <div>
            <p className="font-bold text-blue-900 mb-1">{t('Insight Belajar:', 'Learning Insight:')}</p>
            <p className="text-sm font-medium text-blue-800">
              {loading
                ? t('Memuat insight...', 'Loading insights...')
                : focusedStudent?.latestConfusedTopic
                  ? t(
                      `${focusedStudent.studentName} masih bingung di: ${focusedStudent.latestConfusedTopic}. Ajak diskusi santai untuk bantu memahami.`,
                      `${focusedStudent.studentName} is still confused about: ${focusedStudent.latestConfusedTopic}. Try a relaxed discussion to help.`,
                    )
                  : t(
                      'Belum ada catatan kebingungan terbaru. Pertahankan komunikasi belajar yang positif.',
                      'No recent confusion notes found. Keep positive learning communication.',
                    )}
            </p>
          </div>
        </div>

        {/* Achievement Alert */}
        <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 flex gap-4">
          <Award className="text-emerald-500 shrink-0 mt-1" size={24} />
          <div>
            <p className="font-bold text-emerald-900 mb-1">{t('Perkembangan:', 'Progress:')}</p>
            <p className="text-sm font-medium text-emerald-800">
              {loading
                ? t('Memuat perkembangan...', 'Loading progress...')
                : focusedStudent
                  ? t(
                      `${focusedStudent.studentName} telah menuntaskan ${focusedStudent.completedModules} modul dengan rata-rata nilai ${focusedStudent.avgScore}%.`,
                      `${focusedStudent.studentName} has completed ${focusedStudent.completedModules} modules with an average score of ${focusedStudent.avgScore}%.`,
                    )
                  : t(
                      'Belum ada data siswa terhubung. Pastikan akun siswa memakai ID Orang Tua yang benar.',
                      'No linked student data yet. Ensure student account uses the correct Parent ID.',
                    )}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Clock size={20} className="text-blue-600" />
              </div>
              <span className="font-bold text-slate-700">{t('Waktu Belajar', 'Study Time')}</span>
            </div>
            <p className="text-2xl font-black text-slate-800">
              {focusedStudent ? Math.max(1, Math.round(focusedStudent.avgScore / 20)) : 0}{' '}
              <span className="text-sm font-medium text-slate-500">{t('jam/hari', 'hours/day')}</span>
            </p>
            <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <TrendingUp size={12} /> {t('Estimasi berbasis progres terbaru', 'Estimate based on latest progress')}
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <BookOpen size={20} className="text-emerald-600" />
              </div>
              <span className="font-bold text-slate-700">{t('Modul Selesai', 'Completed Modules')}</span>
            </div>
            <p className="text-2xl font-black text-slate-800">
              {focusedStudent?.completedModules ?? 0}{' '}
              <span className="text-sm font-medium text-slate-500">{t('modul', 'modules')}</span>
            </p>
            <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <TrendingUp size={12} /> {t('Terhubung otomatis dari akun siswa', 'Auto-synced from student account')}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-bold text-slate-700">
              {t('Recent Alerts', 'Recent Alerts')}
            </p>
            {!!filteredAlerts.some((a) => !a.is_read) && (
              <button
                onClick={() => void markAllAlertsAsRead()}
                disabled={markingAllRead}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-60"
              >
                {markingAllRead ? t('Menyimpan...', 'Saving...') : t('Tandai semua dibaca', 'Mark all read')}
              </button>
            )}
          </div>
          {filteredAlerts.length === 0 ? (
            <p className="text-xs text-slate-500">
              {t('Belum ada alert untuk anak ini.', 'No alerts for this student yet.')}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredAlerts.slice(0, 4).map((alert) => (
                <div key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-slate-700">{alert.message_content}</p>
                    <div className="flex items-center gap-1">
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        alert.is_read ? 'bg-slate-200 text-slate-600' : 'bg-red-100 text-red-700'
                      }`}>
                        {alert.is_read ? t('Read', 'Read') : t('Baru', 'New')}
                      </span>
                      {!alert.is_read && (
                        <button
                          onClick={() => void markAlertAsRead(alert.id)}
                          disabled={updatingAlertId === alert.id}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-60"
                        >
                          {updatingAlertId === alert.id ? t('Menyimpan...', 'Saving...') : t('Tandai dibaca', 'Mark read')}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {formatAlertTime(alert.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
