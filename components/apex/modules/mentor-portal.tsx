'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Mic, Award } from 'lucide-react'
import { useApex } from '../apex-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export function MentorPortal() {
  const { t } = useApex()
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [overrideUserId, setOverrideUserId] = useState('')
  const [overrideDimension, setOverrideDimension] = useState('bahasa')
  const [overrideTheta, setOverrideTheta] = useState('5.5')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideSubmitting, setOverrideSubmitting] = useState(false)
  const [overrideResult, setOverrideResult] = useState<string | null>(null)
  const [loadingBaseline, setLoadingBaseline] = useState(false)
  const [baselineError, setBaselineError] = useState<string | null>(null)
  const [baselineProfile, setBaselineProfile] = useState<Record<
    string,
    { finalTheta: number; intakeTheta: number; delta: number; level: string; ci: number }
  > | null>(null)
  const [loadingFlags, setLoadingFlags] = useState(false)
  const [mentorFlags, setMentorFlags] = useState<
    Array<{ id: string; type: string; dimension: string | null; severity: string; createdAt: string }>
  >([])
  const [studentOptions, setStudentOptions] = useState<
    Array<{ studentProfileId: string; studentUserId: string; fullName: string; gradeLevel: string }>
  >([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const toDimLabel = (key: string) => {
    if (key === 'kognitif') return t('Kognitif', 'Cognitive')
    if (key === 'bahasa') return t('Bahasa', 'Language')
    if (key === 'digital') return t('Digital / CS', 'Digital / CS')
    if (key === 'karakter') return t('Karakter', 'Character')
    if (key === 'spiritual') return t('Spiritual', 'Spiritual')
    if (key === 'leadership') return t('Leadership', 'Leadership')
    return key
  }
  const currentBaselineValue = Number(baselineProfile?.[overrideDimension]?.finalTheta ?? 5)
  const parsedOverrideTheta = Number(overrideTheta)
  const isOverrideThetaNumeric = Number.isFinite(parsedOverrideTheta)
  const isOverrideThetaInRange = isOverrideThetaNumeric && parsedOverrideTheta >= 1 && parsedOverrideTheta <= 10
  const overrideThetaError = !overrideTheta.trim()
    ? t('Theta wajib diisi.', 'Theta is required.')
    : !isOverrideThetaNumeric
      ? t('Theta harus berupa angka.', 'Theta must be a number.')
      : !isOverrideThetaInRange
        ? t('Theta harus di rentang 1 sampai 10.', 'Theta must be in range 1 to 10.')
        : null
  const clampedOverrideTheta = Math.max(1, Math.min(10, isOverrideThetaNumeric ? parsedOverrideTheta : 0))
  const previewDelta = clampedOverrideTheta - currentBaselineValue
  const canSubmitOverride =
    !!overrideUserId.trim() && !!overrideReason.trim() && !overrideSubmitting && !overrideThetaError

  useEffect(() => {
    const loadStudents = async () => {
      setLoadingStudents(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token
        if (!accessToken) return
        const res = await fetch('/api/assessment/mentor-students', {
          headers: { authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = (await res.json()) as {
          students?: Array<{ studentProfileId: string; studentUserId: string; fullName: string; gradeLevel: string }>
        }
        const rows = json.students ?? []
        setStudentOptions(rows)
        if (!overrideUserId && rows[0]?.studentUserId) {
          setOverrideUserId(rows[0].studentUserId)
        }
      } finally {
        setLoadingStudents(false)
      }
    }
    void loadStudents()
    // Roster once per mount; including overrideUserId would refetch on every selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const loadBaseline = async () => {
      const userId = overrideUserId.trim()
      if (!userId) {
        setBaselineProfile(null)
        setBaselineError(null)
        return
      }
      setLoadingBaseline(true)
      setBaselineError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token
        if (!accessToken) {
          setBaselineError(t('Sesi login tidak ditemukan.', 'Login session not found.'))
          return
        }
        const res = await fetch(`/api/assessment/final-profile?userId=${encodeURIComponent(userId)}`, {
          headers: { authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        })
        const json = (await res.json()) as {
          message?: string
          profile?: Record<string, { finalTheta: number; intakeTheta: number; delta: number; level: string; ci: number }>
        }
        if (!res.ok) {
          setBaselineProfile(null)
          setBaselineError(json.message ?? t('Baseline belum tersedia.', 'Baseline is not available yet.'))
          return
        }
        setBaselineProfile(json.profile ?? null)
      } finally {
        setLoadingBaseline(false)
      }
    }
    void loadBaseline()
  }, [overrideUserId, t])
  useEffect(() => {
    const loadFlags = async () => {
      const userId = overrideUserId.trim()
      if (!userId) {
        setMentorFlags([])
        return
      }
      setLoadingFlags(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token
        if (!accessToken) return
        const res = await fetch(`/api/assessment/mentor-flags?userId=${encodeURIComponent(userId)}`, {
          headers: { authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = (await res.json()) as {
          flags?: Array<{ id: string; type: string; dimension: string | null; severity: string; createdAt: string }>
        }
        setMentorFlags(json.flags ?? [])
      } finally {
        setLoadingFlags(false)
      }
    }
    void loadFlags()
  }, [overrideUserId])

  const handleSubmit = () => {
    if (selectedLevel && selectedLevel >= 3) {
      setIsSubmitted(true)
    }
  }
  const submitMentorOverride = async () => {
    setOverrideSubmitting(true)
    setOverrideResult(null)
    try {
      const userId = overrideUserId.trim()
      const reason = overrideReason.trim()
      const theta = Number(overrideTheta)
      if (!userId || !reason || !Number.isFinite(theta)) {
        setOverrideResult(t('Lengkapi semua field override terlebih dahulu.', 'Please complete all override fields first.'))
        return
      }

      const supabase = createSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        setOverrideResult(t('Sesi login tidak ditemukan.', 'Login session not found.'))
        return
      }

      const res = await fetch('/api/assessment/mentor-override', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId,
          dimension: overrideDimension,
          overrideTheta: theta,
          reason,
        }),
      })
      const json = (await res.json()) as {
        message?: string
        level?: string
        autoLocked?: boolean
      }
      if (!res.ok) {
        setOverrideResult(json.message ?? t('Override gagal diproses.', 'Failed to process override.'))
        return
      }

      setOverrideResult(
        t(
          `Override berhasil (${json.level ?? 'N/A'}). Auto-lock: ${json.autoLocked ? 'Ya' : 'Belum'}.`,
          `Override succeeded (${json.level ?? 'N/A'}). Auto-lock: ${json.autoLocked ? 'Yes' : 'Not yet'}.`,
        ),
      )
      if (accessToken) {
        const [flagsRes, baselineRes] = await Promise.all([
          fetch(`/api/assessment/mentor-flags?userId=${encodeURIComponent(userId)}`, {
            headers: { authorization: `Bearer ${accessToken}` },
            cache: 'no-store',
          }),
          fetch(`/api/assessment/final-profile?userId=${encodeURIComponent(userId)}`, {
            headers: { authorization: `Bearer ${accessToken}` },
            cache: 'no-store',
          }),
        ])
        if (flagsRes.ok) {
          const flagsJson = (await flagsRes.json()) as {
            flags?: Array<{ id: string; type: string; dimension: string | null; severity: string; createdAt: string }>
          }
          setMentorFlags(flagsJson.flags ?? [])
        }
        if (baselineRes.ok) {
          const baselineJson = (await baselineRes.json()) as {
            profile?: Record<string, { finalTheta: number; intakeTheta: number; delta: number; level: string; ci: number }>
          }
          setBaselineProfile(baselineJson.profile ?? null)
        }
      }
    } finally {
      setOverrideSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in max-w-3xl mx-auto">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 mb-6">{t('Evaluasi Portofolio Siswa', 'Student Portfolio Evaluation')}</h2>
        
        {/* Student Info */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl mb-6">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
            B
          </div>
          <div>
            <p className="font-bold text-slate-800">Bima Pratama</p>
            <p className="text-sm text-slate-500">{t('Pitch Deck: Aplikasi Belajar Bahasa', 'Pitch Deck: Language Learning App')}</p>
          </div>
        </div>

        {/* HOTS Rubric */}
        <div className="space-y-4 mb-8">
          <h3 className="font-bold text-slate-700">{t('Rubrik HOTS (Standar IB)', 'HOTS Rubric (IB Standard)')}</h3>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button 
                key={n} 
                onClick={() => setSelectedLevel(n)}
                className={`flex-1 py-3 border rounded-xl font-bold transition-colors ${
                  selectedLevel === n
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300'
                }`}
              >
                {t('Level', 'Level')} {n}
              </button>
            ))}
          </div>
          <div className="text-sm text-slate-500">
            {selectedLevel === 1 && t('Memerlukan bimbingan lebih lanjut', 'Needs further guidance')}
            {selectedLevel === 2 && t('Menunjukkan pemahaman dasar', 'Shows basic understanding')}
            {selectedLevel === 3 && t('Menunjukkan pemahaman baik', 'Shows good understanding')}
            {selectedLevel === 4 && t('Menunjukkan pemahaman sangat baik', 'Shows excellent understanding')}
          </div>
        </div>

        {/* Async Feedback */}
        <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100 mb-8">
          <p className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
            <MessageSquare size={18} /> {t('Berikan Async Feedback', 'Provide Async Feedback')}
          </p>
          <button 
            onClick={() => setIsRecording(!isRecording)}
            className={`px-6 py-3 font-bold rounded-xl border shadow-sm transition-colors flex items-center gap-2 ${
              isRecording
                ? 'bg-red-500 text-white border-red-500'
                : 'bg-white text-indigo-600 border-indigo-200 hover:bg-slate-50'
            }`}
          >
            <Mic size={18} />
            {isRecording ? t('Merekam... Tap untuk berhenti', 'Recording... Tap to stop') : t('Rekam Pesan Suara', 'Record Voice Message')}
          </button>
          
          <textarea 
            className="w-full mt-4 bg-white border border-indigo-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
            rows={3}
            placeholder={t('Atau tulis feedback tertulis di sini...', 'Or write written feedback here...')}
          />
        </div>

        {/* Credential Webhook */}
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-200">
          <p className="text-blue-900 font-bold mb-2">{t('Credential Webhook API', 'Credential Webhook API')}</p>
          <p className="text-sm text-blue-700 mb-4">
            {t('Jika nilai >= 3, terbitkan lencana digital otomatis via Credly.', 'If score >= 3, issue digital badge automatically via Credly.')}
          </p>
          
          {!isSubmitted ? (
            <button 
              onClick={handleSubmit}
              disabled={!selectedLevel}
              className={`w-full py-4 rounded-xl font-bold shadow-md transition-colors ${
                selectedLevel
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {t('Submit & Terbitkan Lencana', 'Submit & Issue Badge')}
            </button>
          ) : (
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 flex items-center gap-3 animate-in zoom-in-95">
              <Award className="text-emerald-500" size={24} />
              <div>
                <p className="font-bold text-emerald-800">{t('Lencana Berhasil Diterbitkan!', 'Badge Issued Successfully!')}</p>
                <p className="text-sm text-emerald-700">{t('Badge: Critical Thinking - Level', 'Badge: Critical Thinking - Level')} {selectedLevel}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 p-6 rounded-2xl border border-slate-200 bg-slate-50">
          <h3 className="font-bold text-slate-700 mb-3">{t('Mentor Override (Live)', 'Mentor Override (Live)')}</h3>
          <p className="text-xs text-slate-500 mb-4">
            {t(
              'Gunakan ini untuk override theta per dimensi sesuai observasi mentor.',
              'Use this to override per-dimension theta based on mentor observations.',
            )}
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="space-y-1">
              <select
                value={overrideUserId}
                onChange={(e) => setOverrideUserId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">
                  {loadingStudents
                    ? t('Memuat daftar siswa...', 'Loading students...')
                    : t('Pilih siswa', 'Select student')}
                </option>
                {studentOptions.map((s) => (
                  <option key={s.studentProfileId} value={s.studentUserId}>
                    {s.fullName} ({s.gradeLevel}) - {s.studentUserId}
                  </option>
                ))}
              </select>
              <input
                value={overrideUserId}
                onChange={(e) => setOverrideUserId(e.target.value)}
                placeholder={t('Atau isi manual student user ID', 'Or enter student user ID manually')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <select
              value={overrideDimension}
              onChange={(e) => setOverrideDimension(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="kognitif">{t('Kognitif', 'Cognitive')}</option>
              <option value="bahasa">{t('Bahasa', 'Language')}</option>
              <option value="digital">{t('Digital / CS', 'Digital / CS')}</option>
              <option value="karakter">{t('Karakter', 'Character')}</option>
              <option value="spiritual">{t('Spiritual', 'Spiritual')}</option>
              <option value="leadership">{t('Leadership', 'Leadership')}</option>
            </select>
            <input
              value={overrideTheta}
              onChange={(e) => setOverrideTheta(e.target.value)}
              placeholder={t('Override theta (1-10)', 'Override theta (1-10)')}
              className={`rounded-xl border bg-white px-3 py-2 text-sm ${
                overrideThetaError ? 'border-rose-300 text-rose-700' : 'border-slate-200'
              }`}
            />
            <input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder={t('Alasan override', 'Override reason')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          {overrideThetaError ? (
            <p className="mb-3 text-xs text-rose-700">{overrideThetaError}</p>
          ) : null}
          <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            <span className="font-semibold">{toDimLabel(overrideDimension)}</span>:{" "}
            {t('sebelum', 'before')} {currentBaselineValue.toFixed(1)} → {t('override', 'override')}{" "}
            {clampedOverrideTheta.toFixed(1)}{" "}
            <span className={`font-bold ${previewDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              ({previewDelta >= 0 ? '+' : ''}{previewDelta.toFixed(1)})
            </span>
          </div>
          <button
            onClick={() => void submitMentorOverride()}
            disabled={!canSubmitOverride}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {overrideSubmitting ? t('Mengirim...', 'Submitting...') : t('Kirim Override', 'Submit Override')}
          </button>
          {overrideResult ? (
            <p className="mt-2 text-xs text-slate-700">{overrideResult}</p>
          ) : null}
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold text-slate-700 mb-2">
              {t('Baseline Profil (Sebelum Override)', 'Profile Baseline (Before Override)')}
            </p>
            {loadingBaseline ? (
              <p className="text-xs text-slate-500">{t('Memuat baseline...', 'Loading baseline...')}</p>
            ) : baselineError ? (
              <p className="text-xs text-amber-700">{baselineError}</p>
            ) : baselineProfile ? (
              <div className="space-y-1.5">
                {Object.entries(baselineProfile).map(([dim, v]) => (
                  <div
                    key={dim}
                    className={`rounded-md px-2 py-1 text-xs ${
                      overrideDimension === dim
                        ? 'bg-indigo-50 border border-indigo-200 text-indigo-700'
                        : 'text-slate-600'
                    }`}
                  >
                    <span className="font-semibold">{toDimLabel(dim)}</span>: {v.finalTheta.toFixed(1)} ({v.level})
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                {t('Pilih siswa untuk melihat baseline profil.', 'Select a student to view profile baseline.')}
              </p>
            )}
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold text-slate-700 mb-2">
              {t('Pending Review Flags', 'Pending Review Flags')}
            </p>
            {loadingFlags ? (
              <p className="text-xs text-slate-500">{t('Memuat flags...', 'Loading flags...')}</p>
            ) : mentorFlags.length === 0 ? (
              <p className="text-xs text-emerald-700">
                {t('Tidak ada flag aktif. Kasus siap ditutup/terkunci otomatis.', 'No active flags. Case is ready to close/auto-lock.')}
              </p>
            ) : (
              <div className="space-y-1.5">
                {mentorFlags.map((flag) => (
                  <div key={flag.id} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                    <span className="font-semibold">{flag.type}</span>
                    {flag.dimension ? ` • ${toDimLabel(flag.dimension)}` : ''} • {flag.severity}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
