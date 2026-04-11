'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, ChevronRight, Loader2, Sparkles, Brain, BookOpen, Monitor, Heart, Star, Users } from 'lucide-react'
import { useApex } from '../apex-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { CALIBRATION_DIMENSIONS } from '@/lib/calibration/engine'
import { cn } from '@/lib/utils'

type ScenarioPrompt = {
  id: string
  slug: string
  scenario_text: string
  response_mode: string
  options: unknown
  sort_order: number
}

type BankItem = {
  id: string
  slug: string
  dimension: string
  subject: string | null
  item_type: string
  stem: string
  options: unknown
  scoring_rubric: unknown
}

type IntakeGetJson = {
  assessmentSession: {
    id: string
    status: string
    calibrationEndsAt: string | null
    intakeTheta: unknown
    intakeCi: number
  }
  interview: { id: string; status: string } | null
  scenarioPrompts: ScenarioPrompt[]
  itemBank: BankItem[]
  catHint?: {
    nextBankItemId: string | null
    thetaEstimate: number
    attemptsCount: number
    maxCatItems: number
  } | null
  gradeLabel?: string
}

const DIM_META: Record<string, {
  id: string; en: string;
  icon: React.ReactNode;
  color: string; bgColor: string; borderColor: string
}> = {
  kognitif:  { id: 'Kognitif',              en: 'Cognitive',          icon: <Brain size={14} />,    color: 'text-violet-700',  bgColor: 'bg-violet-50',  borderColor: 'border-violet-200' },
  bahasa:    { id: 'Bahasa',                en: 'Language',           icon: <BookOpen size={14} />, color: 'text-sky-700',     bgColor: 'bg-sky-50',     borderColor: 'border-sky-200' },
  digital:   { id: 'Digital / CS',         en: 'Digital / CS',       icon: <Monitor size={14} />,  color: 'text-cyan-700',    bgColor: 'bg-cyan-50',    borderColor: 'border-cyan-200' },
  karakter:  { id: 'Karakter Belajar',     en: 'Learning Character', icon: <Heart size={14} />,    color: 'text-rose-700',    bgColor: 'bg-rose-50',    borderColor: 'border-rose-200' },
  spiritual: { id: 'Spiritual & Motivasi', en: 'Spiritual & Motivation', icon: <Star size={14} />, color: 'text-amber-700',   bgColor: 'bg-amber-50',   borderColor: 'border-amber-200' },
  leadership:{ id: 'Leadership',           en: 'Leadership',         icon: <Users size={14} />,    color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
}

const LEVEL_META = {
  1: { id: 'Perlu Fondasi', en: 'Needs Foundation', bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300',  bar: 'bg-amber-400',  pct: 22 },
  2: { id: 'Sesuai Jenjang',en: 'On Track',         bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300',   bar: 'bg-blue-500',   pct: 55 },
  3: { id: 'Sangat Kuat',   en: 'Strong',           bg: 'bg-emerald-100',text: 'text-emerald-800',border: 'border-emerald-300',bar: 'bg-emerald-500',pct: 88 },
} as const

function parseOptions(raw: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((o) => {
      if (o && typeof o === 'object' && 'id' in o && 'label' in o)
        return { id: String((o as { id: unknown }).id), label: String((o as { label: unknown }).label) }
      return null
    })
    .filter(Boolean) as Array<{ id: string; label: string }>
}

function scoreMcq(rubric: unknown, selectedId: string): number {
  if (!rubric || typeof rubric !== 'object') return 0
  const correct = (rubric as { correctOptionId?: string }).correctOptionId
  const points  = Number((rubric as { points?: number }).points ?? 1)
  return correct && selectedId === String(correct) ? points : 0
}

export function AssessmentIntakeFlow({
  onComplete,
  onStudentIntakeVisibility,
}: {
  onComplete?: () => void
  onStudentIntakeVisibility?: (state: { loading: boolean; visible: boolean }) => void
}) {
  const { t, userRole } = useApex()
  const [loading, setLoading]                   = useState(true)
  const [error, setError]                       = useState<string | null>(null)
  const [data, setData]                         = useState<IntakeGetJson | null>(null)
  const [phase, setPhase]                       = useState<'welcome' | 'scenarios' | 'academic' | 'finalize'>('welcome')
  const [submittingComplete, setSubmittingComplete] = useState(false)
  const [startingIntake, setStartingIntake]         = useState(false)
  const [scenarioIdx, setScenarioIdx]           = useState(0)
  const [scenarioChoice, setScenarioChoice]     = useState('')
  const [scenarioOpen, setScenarioOpen]         = useState('')
  const [socratesQuestion, setSocratesQuestion] = useState('')
  const [socratesReply, setSocratesReply]       = useState<string | null>(null)
  const [socratesLoading, setSocratesLoading]   = useState(false)
  const [activeBankItemId, setActiveBankItemId] = useState<string | null>(null)
  const [mcqChoice, setMcqChoice]               = useState('')
  const [openAnswer, setOpenAnswer]             = useState('')
  const [completionResult, setCompletionResult] = useState<{
    placementLevels: Record<string, number>
    narratives: Record<string, { id: string; en: string }>
    gradeLabel?: string
  } | null>(null)

  const itemSeqRef             = useRef(0)
  const progressInterviewIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: sd } = await supabase.auth.getSession()
      const token = sd.session?.access_token
      if (!token) { setData(null); setLoading(false); return }
      const res  = await fetch('/api/assessment/intake', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
      const json = (await res.json()) as IntakeGetJson & { message?: string }
      if (!res.ok) { setError(json.message ?? t('Gagal memuat intake.', 'Failed to load intake.')); setData(null); return }
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { if (userRole === 'student') void load() }, [userRole, load])

  useEffect(() => {
    if (!data || userRole !== 'student') return
    if (data.assessmentSession.status !== 'PENDING') return
    const intv = data.interview
    if (intv?.status === 'IN_PROGRESS') {
      if (progressInterviewIdRef.current !== intv.id) {
        progressInterviewIdRef.current = intv.id
        setScenarioIdx(0)
        itemSeqRef.current = 0
        setPhase('scenarios')
      }
    } else if (!intv) {
      progressInterviewIdRef.current = null
      setPhase('welcome')
    }
  }, [data, userRole])

  useEffect(() => {
    if (phase !== 'academic' || !data?.itemBank?.length) return
    setActiveBankItemId((prev) => {
      const bank = data.itemBank ?? []
      if (prev && bank.some((b) => b.id === prev)) return prev
      const hint = data.catHint?.nextBankItemId
      if (hint && bank.some((b) => b.id === hint)) return hint
      return bank[0]!.id
    })
  }, [phase, data])

  const showIntake = useMemo(() => {
    if (userRole !== 'student' || !data) return false
    if (data.assessmentSession.status !== 'PENDING') return false
    if (data.interview?.status === 'COMPLETED') return false
    return true
  }, [userRole, data])

  useEffect(() => {
    if (userRole !== 'student' || !onStudentIntakeVisibility) return
    onStudentIntakeVisibility({ loading, visible: showIntake })
  }, [userRole, loading, showIntake, onStudentIntakeVisibility])

  if (userRole !== 'student') return null
  if (loading) return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
      <Loader2 className="animate-spin size-5" />
      <span className="text-sm">{t('Memuat sesi intake…', 'Loading intake session…')}</span>
    </div>
  )
  if (error) return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
  )
  if (!showIntake || !data) return null

  const prompts     = data.scenarioPrompts ?? []
  const bank        = data.itemBank ?? []
  const catMeta     = data.catHint
  const gradeLabel  = data.gradeLabel ?? 'SMP'
  const currentScenario = prompts[scenarioIdx]
  const currentItem = bank.find((b) => b.id === activeBankItemId) ?? bank[0] ?? null
  const attemptsCount   = catMeta?.attemptsCount ?? 0
  const maxCatItems     = catMeta?.maxCatItems ?? 20
  const dimMeta         = currentItem ? (DIM_META[currentItem.dimension] ?? null) : null

  const postAction = async (body: Record<string, unknown>) => {
    const supabase = createSupabaseBrowserClient()
    const { data: sd } = await supabase.auth.getSession()
    const token = sd.session?.access_token
    if (!token) throw new Error('Sesi habis')
    const res  = await fetch('/api/assessment/intake', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as {
      message?: string; reused?: boolean; interviewId?: string
      nextBankItemId?: string | null; scoredPoints?: number; aiRationale?: string | null
      attemptsCount?: number
      maxCatItems?: number
      placementLevels?: Record<string, number>
      narratives?: Record<string, { id: string; en: string }>
      gradeLabel?: string
    }
    if (!res.ok) throw new Error(json.message ?? 'Request failed')
    return json
  }

  const startIntake = async () => {
    setError(null)
    setStartingIntake(true)
    try {
      const startJson = await postAction({ action: 'start' })
      if (typeof startJson.interviewId === 'string') progressInterviewIdRef.current = startJson.interviewId
      if (!startJson.reused && typeof startJson.interviewId === 'string') {
        await postAction({
          action: 'conversation_turn', interviewId: startJson.interviewId,
          seqNo: 0, role: 'assistant',
          content: t(
            'Selamat datang di intake adaptif APEX. Kita akan melalui skenario singkat dan soal adaptif di 6 aspek kompetensi. Perkiraan waktu 20–25 menit.',
            'Welcome to the APEX adaptive intake. We will go through short scenarios and adaptive items across 6 competency areas. About 20–25 minutes.',
          ),
          metadata: { layer: 1 },
        })
      }
      await load()
      setPhase('scenarios')
      setScenarioIdx(0)
      itemSeqRef.current = 0
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Start failed')
    } finally {
      setStartingIntake(false)
    }
  }

  const submitScenario = async () => {
    if (!currentScenario) { setPhase('academic'); return }
    setError(null)
    try {
      const response = currentScenario.response_mode === 'OPEN_SHORT'
        ? { text: scenarioOpen.trim() }
        : { selectedOptionId: scenarioChoice }
      if (currentScenario.response_mode === 'OPEN_SHORT' && !scenarioOpen.trim()) {
        setError(t('Jawaban tidak boleh kosong.', 'Answer cannot be empty.')); return
      }
      if (currentScenario.response_mode === 'MULTIPLE_CHOICE' && !scenarioChoice) {
        setError(t('Pilih salah satu opsi.', 'Pick an option.')); return
      }
      await postAction({ action: 'scenario_response', promptId: currentScenario.id, response })
      await postAction({
        action: 'conversation_turn', seqNo: 10 + scenarioIdx,
        role: 'user',
        content: currentScenario.response_mode === 'OPEN_SHORT'
          ? scenarioOpen.trim().slice(0, 500)
          : `scenario:${currentScenario.slug}:${scenarioChoice}`,
        metadata: { promptId: currentScenario.id },
      })
      setScenarioChoice('')
      setScenarioOpen('')
      if (scenarioIdx + 1 >= prompts.length) { setPhase('academic'); setActiveBankItemId(null) }
      else setScenarioIdx((i) => i + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const submitAcademicItem = async () => {
    if (!currentItem) { setPhase('finalize'); return }
    setError(null)
    try {
      let learnerResponse: Record<string, unknown> = {}
      let scored = 0
      const useAiScore = currentItem.item_type === 'OPEN_SHORT'
      if (currentItem.item_type === 'MULTIPLE_CHOICE') {
        if (!mcqChoice) { setError(t('Pilih jawaban.', 'Select an answer.')); return }
        learnerResponse = { selectedOptionId: mcqChoice }
        scored = scoreMcq(currentItem.scoring_rubric, mcqChoice)
      } else {
        if (!openAnswer.trim()) { setError(t('Tulis jawaban singkat.', 'Write a short answer.')); return }
        learnerResponse = { text: openAnswer.trim() }
        if (!useAiScore) scored = Number((currentItem.scoring_rubric as { maxPoints?: number })?.maxPoints ?? 1) * 0.5
      }
      if (!data?.interview?.id) {
        setError(t('Sesi intake tidak valid. Muat ulang halaman.', 'Invalid intake session. Please reload.')); return
      }
      const resJson = await postAction({
        action: 'item_attempt', interviewId: data.interview.id,
        dimension: currentItem.dimension, bankItemId: currentItem.id,
        learnerResponse, scoredPoints: useAiScore ? undefined : scored,
        latencyMs: null, aiScoreOpen: useAiScore,
      })
      setMcqChoice('')
      setOpenAnswer('')
      const nextId = resJson.nextBankItemId
      if (nextId && bank.some((b) => b.id === nextId)) setActiveBankItemId(nextId)
      else setPhase('finalize')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const askIntakeSocrates = async () => {
    const q = socratesQuestion.trim()
    if (!q) return
    setSocratesLoading(true); setSocratesReply(null); setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: sd } = await supabase.auth.getSession()
      const token = sd.session?.access_token
      if (!token) throw new Error('Sesi habis')
      const res  = await fetch('/api/assessment/intake/socrates', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: q, language: 'id' }),
      })
      const json = (await res.json()) as { message?: string; assistantContent?: string }
      if (!res.ok) throw new Error(json.message ?? 'Socrates error')
      setSocratesReply(json.assistantContent ?? '')
      setSocratesQuestion('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Socrates failed')
    } finally {
      setSocratesLoading(false)
    }
  }

  const finalizeIntake = async () => {
    if (!data?.interview?.id) { setError(t('Sesi intake tidak valid.', 'Invalid intake session.')); return }
    setSubmittingComplete(true); setError(null)
    try {
      const completeJson = await postAction({
        action: 'complete', interviewId: data.interview.id,
        academicCatSummary: {
          source: 'intake_cat_layer1',
          itemsAttempted: catMeta?.attemptsCount ?? bank.length,
          maxCatItems: catMeta?.maxCatItems ?? 20,
        },
        characterScenarioSummary: { scenariosCompleted: prompts.length },
      })
      setCompletionResult({
        placementLevels: completeJson.placementLevels ?? {},
        narratives: completeJson.narratives ?? {},
        gradeLabel: completeJson.gradeLabel,
      })
      onComplete?.()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Complete failed')
    } finally {
      setSubmittingComplete(false)
    }
  }

  // ── Progress bar untuk academic phase ────────────────────────────────────────
  const progressPct = maxCatItems > 0 ? Math.round((attemptsCount / maxCatItems) * 100) : 0

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-5 rounded-3xl border border-indigo-100 shadow-sm mb-6 space-y-4">

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-indigo-600 text-white p-2.5 shrink-0">
          <MessageCircle size={20} />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {t('Lapis 1 — Tes Penempatan Adaptif (CAT)', 'Layer 1 — Adaptive Placement Test (CAT)')}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t(
              `Jenjang: ${gradeLabel} · 6 aspek kompetensi (6 Prisma) · Maks ${maxCatItems} soal adaptif`,
              `Grade: ${gradeLabel} · 6 competency areas (6 Prisms) · Max ${maxCatItems} adaptive items`,
            )}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
      )}

      {/* ── WELCOME ── */}
      {phase === 'welcome' && (
        <div className="rounded-2xl border border-white/80 bg-white/90 p-5 space-y-4">
          {/* 6 Prisma */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              {t('6 Aspek yang dinilai (6 Prisma APEX)', '6 Areas being assessed (6 APEX Prisms)')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CALIBRATION_DIMENSIONS.map((dim) => {
                const m = DIM_META[dim]
                return (
                  <div key={dim} className={cn('flex items-center gap-2 rounded-xl border px-2.5 py-2', m?.bgColor, m?.borderColor)}>
                    <span className={m?.color}>{m?.icon}</span>
                    <span className={cn('text-xs font-medium', m?.color)}>{t(m?.id ?? dim, m?.en ?? dim)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Steps */}
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { step: '1', id: 'Skenario karakter', en: 'Character scenarios', sub: 'Situasi nyata belajar', subEn: 'Real learning situations' },
              { step: '2', id: 'Soal adaptif CAT', en: 'Adaptive CAT items', sub: `Maks ${maxCatItems} soal pilihan ganda`, subEn: `Max ${maxCatItems} multiple choice items` },
              { step: '3', id: 'Hasil & penempatan', en: 'Results & placement', sub: 'Level 1–3 per aspek; orang tua validasi di portal', subEn: 'Level 1–3 per area; parent validates in portal' },
            ].map((row) => (
              <div key={row.step} className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-3 text-center sm:text-left">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">{row.step}</span>
                <p className="mt-1.5 text-xs font-semibold text-slate-900">{t(row.id, row.en)}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{t(row.sub, row.subEn)}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-600 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-indigo-500 shrink-0" />
            {t('Perkiraan waktu 20–25 menit. Pastikan koneksi internet stabil.', 'About 20–25 minutes. Use a stable internet connection.')}
          </p>
          <button
            type="button"
            disabled={startingIntake}
            onClick={() => void startIntake()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {startingIntake ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t('Menyiapkan soal…', 'Preparing questions…')}
              </>
            ) : (
              <>
                {t('Mulai tes penempatan', 'Start placement test')}
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      )}

      {/* ── SCENARIOS ── */}
      {phase === 'scenarios' && currentScenario && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              {t('Skenario', 'Scenario')} {scenarioIdx + 1}/{prompts.length}
            </span>
            <span className="text-[11px] text-slate-400">{t('Aspek: Karakter & Motivasi', 'Area: Character & Motivation')}</span>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{currentScenario.scenario_text}</p>
          {currentScenario.response_mode === 'MULTIPLE_CHOICE' ? (
            <div className="space-y-2">
              {parseOptions(currentScenario.options).map((opt) => (
                <label key={opt.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors', scenarioChoice === opt.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50')}>
                  <input type="radio" name="sc" className="mt-0.5" checked={scenarioChoice === opt.id} onChange={() => setScenarioChoice(opt.id)} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <>
              <textarea value={scenarioOpen} onChange={(e) => setScenarioOpen(e.target.value)} rows={4}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none"
                placeholder={t('Jawab 2–3 kalimat…', 'Answer in 2–3 sentences…')} />
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-indigo-800">{t('Bantuan Socrates (opsional)', 'Socrates hint (optional)')}</p>
                <textarea
                  value={socratesQuestion}
                  onChange={(e) => setSocratesQuestion(e.target.value.slice(0, 500))}
                  rows={2}
                  enterKeyHint="enter"
                  inputMode="text"
                  className="w-full min-h-[2.75rem] rounded-lg border border-slate-200 px-2 py-1.5 text-xs resize-y touch-manipulation"
                  placeholder={t('Tanya pancingan…', 'Ask for a guiding question…')}
                  aria-label={t('Pertanyaan ke Socrates (opsional)', 'Optional question for Socrates')}
                />
                <p className="text-[10px] text-slate-500 md:hidden">
                  {t('Enter = baris baru. Ketuk «Tanya Socrates» untuk mengirim.', 'Enter adds a new line. Tap “Ask Socrates” to send.')}
                </p>
                <button type="button" disabled={socratesLoading} onClick={() => void askIntakeSocrates()}
                  className="text-xs font-semibold text-indigo-700 hover:underline disabled:opacity-50">
                  {socratesLoading ? t('Memuat…', 'Loading…') : t('Tanya Socrates', 'Ask Socrates')}
                </button>
                {socratesReply && <p className="text-xs text-slate-700 whitespace-pre-wrap border-t border-indigo-100 pt-2">{socratesReply}</p>}
              </div>
            </>
          )}
          <button type="button" onClick={() => void submitScenario()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            {t('Lanjut', 'Continue')}
          </button>
        </div>
      )}

      {phase === 'scenarios' && !currentScenario && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600 mb-3">{t('Tidak ada skenario — lanjut ke soal adaptif.', 'No scenarios — continuing to adaptive items.')}</p>
          <button type="button" onClick={() => { setPhase('academic'); setActiveBankItemId(null) }}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            {t('Lanjut', 'Continue')}
          </button>
        </div>
      )}

      {/* ── ACADEMIC (CAT) ── */}
      {phase === 'academic' && currentItem && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>{t('Soal adaptif', 'Adaptive items')}: {attemptsCount + 1} / {maxCatItems}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-indigo-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Dimension badge */}
          {dimMeta && (
            <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', dimMeta.bgColor, dimMeta.borderColor, dimMeta.color)}>
              {dimMeta.icon}
              {t(dimMeta.id, dimMeta.en)}
              {currentItem.subject ? ` — ${currentItem.subject}` : ''}
            </div>
          )}

          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{currentItem.stem}</p>

          {currentItem.item_type === 'MULTIPLE_CHOICE' ? (
            <div className="space-y-2">
              {parseOptions(currentItem.options).map((opt) => (
                <label key={opt.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors', mcqChoice === opt.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50')}>
                  <input type="radio" name="mcq" className="mt-0.5" checked={mcqChoice === opt.id} onChange={() => setMcqChoice(opt.id)} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea value={openAnswer} onChange={(e) => setOpenAnswer(e.target.value)} rows={5}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none"
              placeholder={t('Jawaban singkat…', 'Short answer…')} />
          )}

          <button type="button" onClick={() => void submitAcademicItem()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            {t('Kirim jawaban', 'Submit answer')}
          </button>
        </div>
      )}

      {phase === 'academic' && !currentItem && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600 mb-3">{t('Bank soal belum tersedia. Periksa koneksi atau hubungi admin.', 'Question bank unavailable. Check your connection or contact admin.')}</p>
          <button type="button" onClick={() => void load()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            {t('Muat ulang', 'Reload')}
          </button>
        </div>
      )}

      {/* ── FINALIZE ── */}
      {phase === 'finalize' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
          {!completionResult ? (
            <>
              <p className="text-sm text-slate-700 leading-relaxed">
                {t(
                  'Semua soal selesai! Klik di bawah untuk menghitung penempatan awal (Level 1–3 per aspek). Orang tua akan dapat memvalidasi hasilnya di menu kontrol orang tua.',
                  'All items done! Click below to compute initial placement (Level 1–3 per area). Your parent can validate the results in the parent portal.',
                )}
              </p>
              <button type="button" disabled={submittingComplete} onClick={() => void finalizeIntake()}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {submittingComplete ? t('Menghitung…', 'Computing…') : t('Hitung penempatan & selesaikan', 'Compute placement & finish')}
              </button>
            </>
          ) : (
            <PlacementResults result={completionResult} t={t} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Komponen hasil penempatan ─────────────────────────────────────────────────
function PlacementResults({
  result,
  t,
}: {
  result: { placementLevels: Record<string, number>; narratives: Record<string, { id: string; en: string }>; gradeLabel?: string }
  t: (id: string, en: string) => string
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="size-8 rounded-full bg-emerald-100 flex items-center justify-center">
          <Sparkles className="size-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-800">{t('Intake selesai!', 'Intake complete!')}</p>
          <p className="text-xs text-slate-500">
            {t('Kalibrasi 14 hari dimulai. Orang tua dapat memvalidasi di portal mereka.', '14-day calibration window has started. Your parent can validate in their portal.')}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
        {t(
          'Level 1 = perlu fondasi · Level 2 = sesuai jenjang · Level 3 = sangat kuat',
          'Level 1 = needs foundation · Level 2 = on track · Level 3 = strong',
        )}
      </p>

      <div className="space-y-3">
        {CALIBRATION_DIMENSIONS.map((dim) => {
          const level  = (result.placementLevels[dim] ?? 2) as 1 | 2 | 3
          const meta   = LEVEL_META[level]
          const dimM   = DIM_META[dim]
          const narr   = result.narratives[dim]
          return (
            <div key={dim} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 space-y-2">
              {/* Row: icon + label + level badge */}
              <div className="flex items-center justify-between gap-2">
                <div className={cn('flex items-center gap-1.5 text-xs font-semibold', dimM?.color)}>
                  {dimM?.icon}
                  {t(dimM?.id ?? dim, dimM?.en ?? dim)}
                </div>
                <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-bold', meta.bg, meta.text, meta.border)}>
                  L{level} — {t(meta.id, meta.en)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-slate-200">
                <div className={cn('h-1.5 rounded-full transition-all', meta.bar)} style={{ width: `${meta.pct}%` }} />
              </div>

              {/* Narrative */}
              {narr && (
                <p className="text-[11px] text-slate-600 leading-relaxed">{t(narr.id, narr.en)}</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-800">
        {t(
          'Hasil ini adalah penempatan awal berbasis soal adaptif. Orang tua dapat melihat dan memvalidasi detail di menu Kontrol Orang Tua.',
          'These are initial placements based on adaptive items. Your parent can review and validate details in the Parent Control menu.',
        )}
      </div>
    </div>
  )
}
