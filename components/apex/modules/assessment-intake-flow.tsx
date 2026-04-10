'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, ChevronRight, Loader2, Sparkles } from 'lucide-react'
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
  interview: {
    id: string
    status: string
  } | null
  scenarioPrompts: ScenarioPrompt[]
  itemBank: BankItem[]
  catHint?: {
    nextBankItemId: string | null
    thetaEstimate: number
    attemptsCount: number
    maxCatItems: number
  } | null
}

function parseOptions(raw: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((o) => {
      if (o && typeof o === 'object' && 'id' in o && 'label' in o) {
        return { id: String((o as { id: unknown }).id), label: String((o as { label: unknown }).label) }
      }
      return null
    })
    .filter(Boolean) as Array<{ id: string; label: string }>
}

function scoreMcq(rubric: unknown, selectedId: string): number {
  if (!rubric || typeof rubric !== 'object') return 0
  const correct = (rubric as { correctOptionId?: string }).correctOptionId
  const points = Number((rubric as { points?: number }).points ?? 1)
  return correct && selectedId === String(correct) ? points : 0
}

const DIM_LABELS: Record<string, { id: string; en: string }> = {
  kognitif: { id: 'Kognitif', en: 'Cognitive' },
  bahasa: { id: 'Bahasa', en: 'Language' },
  digital: { id: 'Digital / CS', en: 'Digital / CS' },
  karakter: { id: 'Karakter belajar', en: 'Learning character' },
  spiritual: { id: 'Baseline ibadah & motivasi', en: 'Faith baseline & motivation' },
  leadership: { id: 'Leadership', en: 'Leadership' },
}

export function AssessmentIntakeFlow({
  onComplete,
  onStudentIntakeVisibility,
}: {
  onComplete?: () => void
  /** Untuk hero onboarding di AssessmentHub saat intake masih relevan. */
  onStudentIntakeVisibility?: (state: { loading: boolean; visible: boolean }) => void
}) {
  const { t, userRole } = useApex()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<IntakeGetJson | null>(null)
  const [phase, setPhase] = useState<'welcome' | 'scenarios' | 'academic' | 'finalize'>('welcome')
  const [submittingComplete, setSubmittingComplete] = useState(false)
  const [scenarioIdx, setScenarioIdx] = useState(0)
  const [scenarioChoice, setScenarioChoice] = useState('')
  const [scenarioOpen, setScenarioOpen] = useState('')
  const [socratesQuestion, setSocratesQuestion] = useState('')
  const [socratesReply, setSocratesReply] = useState<string | null>(null)
  const [socratesLoading, setSocratesLoading] = useState(false)
  const [activeBankItemId, setActiveBankItemId] = useState<string | null>(null)
  const [mcqChoice, setMcqChoice] = useState('')
  const [openAnswer, setOpenAnswer] = useState('')
  /** Level penempatan 1–3 per dimensi setelah `complete` di server (bukan self-rating). */
  const [completionLevels, setCompletionLevels] = useState<Record<string, number> | null>(null)

  const itemSeqRef = useRef(0)
  /** Mencegah reset scenario/academic index saat load() mengembalikan interview yang sama setelah progres lokal. */
  const progressInterviewIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setData(null)
        setLoading(false)
        return
      }
      const res = await fetch('/api/assessment/intake', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = (await res.json()) as IntakeGetJson & { message?: string }
      if (!res.ok) {
        setError(json.message ?? t('Gagal memuat intake.', 'Failed to load intake.'))
        setData(null)
        return
      }
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (userRole !== 'student') return
    void load()
  }, [userRole, load])

  useEffect(() => {
    if (!data || userRole !== 'student') return
    if (data.assessmentSession.status !== 'PENDING') return
    const intv = data.interview
    if (intv?.status === 'IN_PROGRESS') {
      setPhase('scenarios')
      if (progressInterviewIdRef.current !== intv.id) {
        progressInterviewIdRef.current = intv.id
        setScenarioIdx(0)
        itemSeqRef.current = 0
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

  const postAction = async (body: Record<string, unknown>) => {
    const supabase = createSupabaseBrowserClient()
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('Sesi habis')
    const res = await fetch('/api/assessment/intake', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as {
      message?: string
      reused?: boolean
      interviewId?: string
      nextBankItemId?: string | null
      scoredPoints?: number
      aiRationale?: string | null
      placementLevels?: Record<string, number>
    }
    if (!res.ok) throw new Error(json.message ?? 'Request failed')
    return json
  }

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
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
        <Loader2 className="animate-spin size-5" />
        <span className="text-sm">{t('Memuat sesi intake…', 'Loading intake session…')}</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {error}
      </div>
    )
  }
  if (!showIntake || !data) return null

  const prompts = data.scenarioPrompts ?? []
  const bank = data.itemBank ?? []
  const currentScenario = prompts[scenarioIdx]
  const currentItem =
    bank.find((b) => b.id === activeBankItemId) ?? bank[0] ?? null
  const catMeta = data.catHint

  const startIntake = async () => {
    setError(null)
    try {
      const startJson = await postAction({ action: 'start' })
      if (typeof startJson.interviewId === 'string') {
        progressInterviewIdRef.current = startJson.interviewId
      }
      if (!startJson.reused && typeof startJson.interviewId === 'string') {
        await postAction({
          action: 'conversation_turn',
          interviewId: startJson.interviewId,
          seqNo: 0,
          role: 'assistant',
          content: t(
            'Selamat datang di intake adaptif APEX. Kita akan melalui beberapa skenario singkat dan latihan soal. Perkiraan waktu sekitar 20 menit.',
            'Welcome to the APEX adaptive intake. We will go through short scenarios and practice items. About 20 minutes.',
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
    }
  }

  const submitScenario = async () => {
    if (!currentScenario) {
      setPhase('academic')
      return
    }
    setError(null)
    try {
      const response =
        currentScenario.response_mode === 'OPEN_SHORT'
          ? { text: scenarioOpen.trim() }
          : { selectedOptionId: scenarioChoice }
      if (currentScenario.response_mode === 'OPEN_SHORT' && !scenarioOpen.trim()) {
        setError(t('Jawaban tidak boleh kosong.', 'Answer cannot be empty.'))
        return
      }
      if (currentScenario.response_mode === 'MULTIPLE_CHOICE' && !scenarioChoice) {
        setError(t('Pilih salah satu opsi.', 'Pick an option.'))
        return
      }
      await postAction({
        action: 'scenario_response',
        promptId: currentScenario.id,
        response,
      })
      await postAction({
        action: 'conversation_turn',
        seqNo: 10 + scenarioIdx,
        role: 'user',
        content:
          currentScenario.response_mode === 'OPEN_SHORT'
            ? scenarioOpen.trim().slice(0, 500)
            : `scenario:${currentScenario.slug}:${scenarioChoice}`,
        metadata: { promptId: currentScenario.id },
      })
      setScenarioChoice('')
      setScenarioOpen('')
      if (scenarioIdx + 1 >= prompts.length) {
        setPhase('academic')
        setActiveBankItemId(null)
      } else {
        setScenarioIdx((i) => i + 1)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const submitAcademicItem = async () => {
    if (!currentItem) {
      setPhase('finalize')
      return
    }
    setError(null)
    try {
      itemSeqRef.current += 1
      const seq = itemSeqRef.current
      let learnerResponse: Record<string, unknown> = {}
      let scored = 0
      const useAiScore = currentItem.item_type === 'OPEN_SHORT'
      if (currentItem.item_type === 'MULTIPLE_CHOICE') {
        if (!mcqChoice) {
          setError(t('Pilih jawaban.', 'Select an answer.'))
          return
        }
        learnerResponse = { selectedOptionId: mcqChoice }
        scored = scoreMcq(currentItem.scoring_rubric, mcqChoice)
      } else {
        if (!openAnswer.trim()) {
          setError(t('Tulis jawaban singkat.', 'Write a short answer.'))
          return
        }
        learnerResponse = { text: openAnswer.trim() }
        if (!useAiScore) {
          scored = Number((currentItem.scoring_rubric as { maxPoints?: number })?.maxPoints ?? 1) * 0.5
        }
      }
      if (!data?.interview?.id) {
        setError(t('Sesi intake tidak valid. Muat ulang halaman.', 'Invalid intake session. Please reload.'))
        return
      }
      const resJson = await postAction({
        action: 'item_attempt',
        interviewId: data.interview.id,
        seq,
        dimension: currentItem.dimension,
        bankItemId: currentItem.id,
        learnerResponse,
        scoredPoints: useAiScore ? undefined : scored,
        latencyMs: null,
        aiScoreOpen: useAiScore,
      })
      setMcqChoice('')
      setOpenAnswer('')
      const nextId = resJson.nextBankItemId
      if (nextId && bank.some((b) => b.id === nextId)) {
        setActiveBankItemId(nextId)
      } else {
        setPhase('finalize')
      }
      if (resJson.aiRationale && useAiScore) {
        setError(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const askIntakeSocrates = async () => {
    const q = socratesQuestion.trim()
    if (!q) return
    setSocratesLoading(true)
    setSocratesReply(null)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Sesi habis')
      const res = await fetch('/api/assessment/intake/socrates', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
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
    if (!data?.interview?.id) {
      setError(t('Sesi intake tidak valid.', 'Invalid intake session.'))
      return
    }
    setSubmittingComplete(true)
    setError(null)
    try {
      const completeJson = await postAction({
        action: 'complete',
        interviewId: data.interview.id,
        academicCatSummary: {
          source: 'intake_cat_layer1',
          itemsAttempted: catMeta?.attemptsCount ?? bank.length,
          maxCatItems: catMeta?.maxCatItems ?? 12,
        },
        characterScenarioSummary: { scenariosCompleted: prompts.length },
      })
      setCompletionLevels(completeJson.placementLevels ?? null)
      onComplete?.()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Complete failed')
    } finally {
      setSubmittingComplete(false)
    }
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-6 rounded-3xl border border-indigo-100 shadow-sm mb-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="rounded-xl bg-indigo-600 text-white p-2.5">
          <MessageCircle size={22} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {t('Lapis 1 — Intake interview adaptif', 'Layer 1 — Adaptive intake interview')}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              'Percakapan terstruktur + skenario karakter + soal adaptif (CAT) untuk enam aspek kompetensi. Nilai awal dihitung dari jawabanmu; orang tua memvalidasi ringkasan di menu kontrol orang tua. Kalibrasi 14 hari berikutnya (Lapis 2–4) menyempurnakan penempatan.',
              'Structured flow + character scenarios + adaptive items (CAT) across six competency areas. Initial placement comes from your responses; your parent validates the summary in the parent portal. A 14-day calibration (layers 2–4) then refines placement.',
            )}
          </p>
        </div>
      </div>

      {phase === 'welcome' && (
        <div className="rounded-2xl border border-white/80 bg-white/90 p-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                step: '1',
                id: 'Skenario singkat',
                en: 'Short scenarios',
                sub: 'Karakter & motivasi belajar',
                subEn: 'Character & motivation',
              },
              {
                step: '2',
                id: 'Soal adaptif',
                en: 'Adaptive items',
                sub: 'MCQ & jawaban singkat',
                subEn: 'MCQ & short answers',
              },
              {
                step: '3',
                id: 'Ringkasan & penempatan awal',
                en: 'Summary & initial placement',
                sub: 'Hasil dari latihan; orang tua memvalidasi di portal',
                subEn: 'From your practice; your parent confirms in their portal',
              },
            ].map((row) => (
              <div
                key={row.step}
                className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-3 text-center sm:text-left"
              >
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {row.step}
                </span>
                <p className="mt-2 text-sm font-semibold text-slate-900">{t(row.id, row.en)}</p>
                <p className="text-xs text-slate-600 mt-0.5">{t(row.sub, row.subEn)}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-700 flex items-center gap-2">
            <Sparkles className="size-4 text-indigo-500 shrink-0" />
            {t('Perkiraan waktu ~20 menit. Pastikan koneksi stabil.', 'About 20 minutes. Use a stable connection.')}
          </p>
          <button
            type="button"
            onClick={() => void startIntake()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {t('Mulai tes penempatan', 'Start placement test')}
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {phase === 'scenarios' && currentScenario && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            {t('Skenario karakter belajar', 'Learning character scenario')} ({scenarioIdx + 1}/{prompts.length})
          </p>
          <p className="text-sm text-slate-800 leading-relaxed">{currentScenario.scenario_text}</p>
          {currentScenario.response_mode === 'MULTIPLE_CHOICE' ? (
            <div className="space-y-2">
              {parseOptions(currentScenario.options).map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors',
                    scenarioChoice === opt.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="radio"
                    name="sc"
                    className="mt-1"
                    checked={scenarioChoice === opt.id}
                    onChange={() => setScenarioChoice(opt.id)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <>
              <textarea
                value={scenarioOpen}
                onChange={(e) => setScenarioOpen(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder={t('Jawab 2–3 kalimat…', 'Answer in 2–3 sentences…')}
              />
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-indigo-800">
                  {t('Bantuan Socrates (opsional)', 'Socrates hint (optional)')}
                </p>
                <input
                  type="text"
                  value={socratesQuestion}
                  onChange={(e) => setSocratesQuestion(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  placeholder={t('Tanya pancingan, bukan jawaban langsung…', 'Ask for a guiding question…')}
                />
                <button
                  type="button"
                  disabled={socratesLoading}
                  onClick={() => void askIntakeSocrates()}
                  className="text-xs font-semibold text-indigo-700 hover:underline disabled:opacity-50"
                >
                  {socratesLoading ? t('Memuat…', 'Loading…') : t('Tanya Socrates', 'Ask Socrates')}
                </button>
                {socratesReply ? (
                  <p className="text-xs text-slate-700 whitespace-pre-wrap border-t border-indigo-100 pt-2">
                    {socratesReply}
                  </p>
                ) : null}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => void submitScenario()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {t('Lanjut', 'Continue')}
          </button>
        </div>
      )}

      {phase === 'scenarios' && !currentScenario && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600 mb-3">{t('Tidak ada skenario di bank — lanjut ke latihan.', 'No scenarios in bank — continuing to practice.')}</p>
          <button
            type="button"
            onClick={() => {
              setPhase('academic')
              setActiveBankItemId(null)
            }}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            {t('Lanjut', 'Continue')}
          </button>
        </div>
      )}

      {phase === 'academic' && currentItem && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <p className="text-xs font-semibold text-cyan-700">
            {t('Latihan adaptif (CAT ringan)', 'Lightweight adaptive practice')} (
            {catMeta ? `${catMeta.attemptsCount + 1}/${catMeta.maxCatItems}` : `—/${bank.length}`}) ·{' '}
            {currentItem.subject ?? currentItem.dimension}
          </p>
          {currentItem.item_type === 'OPEN_SHORT' ? (
            <p className="text-[11px] text-slate-500">
              {t(
                'Jawaban singkat akan dinilai otomatis oleh AI sesuai rubrik di bank soal (jika ANTHROPIC_API_KEY aktif).',
                'Short answers are auto-scored by AI against the item rubric when ANTHROPIC_API_KEY is set.',
              )}
            </p>
          ) : null}
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{currentItem.stem}</p>
          {currentItem.item_type === 'MULTIPLE_CHOICE' ? (
            <div className="space-y-2">
              {parseOptions(currentItem.options).map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm',
                    mcqChoice === opt.id ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="radio"
                    name="mcq"
                    className="mt-1"
                    checked={mcqChoice === opt.id}
                    onChange={() => setMcqChoice(opt.id)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder={t('Jawaban singkat…', 'Short answer…')}
            />
          )}
          <button
            type="button"
            onClick={() => void submitAcademicItem()}
            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
          >
            {t('Kirim jawaban', 'Submit answer')}
          </button>
        </div>
      )}

      {phase === 'academic' && !currentItem && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600 mb-3">
            {t(
              'Bank soal belum tersedia. Periksa koneksi atau hubungi admin.',
              'Question bank is not available. Check your connection or contact admin.',
            )}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            {t('Muat ulang', 'Reload')}
          </button>
        </div>
      )}

      {phase === 'finalize' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
          {!completionLevels ? (
            <>
              <p className="text-sm text-slate-700 leading-relaxed">
                {t(
                  'Selesaikan langkah ini untuk menghitung penempatan awal (level 1–3 per aspek) dari jawaban latihanmu. Orang tua akan melihat ringkasan dan dapat mengonfirmasi atau menyesuaikan di menu kontrol orang tua — bukan lewat penilaian diri di sini.',
                  'Finish this step to compute your initial placement (levels 1–3 per area) from your practice answers. Your parent will see a summary and can confirm or adjust in the parent portal — not via self-rating here.',
                )}
              </p>
              <button
                type="button"
                disabled={submittingComplete}
                onClick={() => void finalizeIntake()}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submittingComplete
                  ? t('Menyimpan…', 'Saving…')
                  : t('Hitung penempatan & selesaikan intake', 'Compute placement & finish intake')}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-emerald-800">
                {t('Intake selesai. Kalibrasi 14 hari dimulai.', 'Intake complete. Your 14-day calibration window has started.')}
              </p>
              <p className="text-xs text-slate-600">
                {t(
                  'Level 1 = perlu fondasi, 2 = sesuai jenjang, 3 = kuat. Orang tua dapat memvalidasi di portal mereka.',
                  'Level 1 = needs foundation, 2 = on track for grade, 3 = strong. Your parent can validate in their portal.',
                )}
              </p>
              <ul className="space-y-2 text-sm">
                {CALIBRATION_DIMENSIONS.map((d) => (
                  <li key={d} className="flex justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-700">{t(DIM_LABELS[d].id, DIM_LABELS[d].en)}</span>
                    <span className="font-bold text-indigo-700">
                      L{completionLevels[d] ?? '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
