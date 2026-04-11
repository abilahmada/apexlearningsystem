'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Heart, CheckCircle2, Lock, Star, Zap } from 'lucide-react'
import { useApex } from '../apex-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { APEX_LEARNING_EVENTS } from '@/lib/assessment/placement-lifecycle'
import { getDailyGrowthMindsetMessage } from '../shared/growth-mindset'

interface LearningHubProps {
  charityPoints: number
  onAddCharityPoints: () => void
}

/* Microcopy resmi dari Panduan UX APEX */
const MASTERY_COPY = {
  below60:  'Usahamu sudah {pct}%, mari kita perkuat sisanya. 💪',
  below80:  'Hampir Sampai! Usahamu sudah {pct}%, mari kita perkuat {rem}% sisanya. 💪',
  reached:  'Luar Biasa! Kerja kerasmu membuahkan hasil. Materi ini sudah kamu kuasai! 🌟',
  unlocked: 'Evolusi Selesai! Kamu siap untuk tantangan global berikutnya. 🌍',
}

function getMasteryCopy(pct: number) {
  if (pct >= 80) return MASTERY_COPY.reached
  if (pct >= 60) return MASTERY_COPY.below80.replace('{pct}', String(pct)).replace('{rem}', String(80 - pct))
  return MASTERY_COPY.below60.replace('{pct}', String(pct))
}

/* Misi hari ini — nanti dari API/context */
const TODAY_MISSION = {
  subject: 'Python',
  topic: 'Logic & Loops',
  mastery: 60,
  color: '#8B5CF6',
  icon: '🐍',
  xp: 150,
}

/* Spaced repetition queue — nanti dari backend algorithm */
const REVIEW_QUEUE = [
  { id: 1, subject: 'Sains',       topic: 'Siklus Ekosistem',       days: 0, urgent: true,  icon: '🔭' },
  { id: 2, subject: 'Matematika',  topic: 'Teorema Pythagoras',      days: 1, urgent: false, icon: '📐' },
  { id: 3, subject: 'Bhs Inggris', topic: 'Past Perfect Tense',      days: 3, urgent: false, icon: '🌐' },
]

/* Habit tracker */
const HABITS = [
  { id: 'dhuha',   label: 'Shalat Dhuha',   icon: '🌅', points: 50,  done: false },
  { id: 'tilawah', label: 'Tilawah Qur\'an', icon: '📖', points: 75,  done: true  },
  { id: 'shalat',  label: 'Shalat 5 Waktu',  icon: '🕌', points: 100, done: true  },
  { id: 'olahraga',label: 'Olahraga',         icon: '🏃', points: 30,  done: false },
]

const DEMO_MODULE_ID = 'demo-python-loops'

const MODULE_STATUS_COPY = {
  phaseLocked: { id: 'Level Terkunci', en: 'Level Locked' },
  ready: { id: 'Siap Mulai', en: 'Ready' },
  inProgress: { id: 'Berjalan', en: 'In Progress' },
  awaitingConfirm: { id: 'Siap dikonfirmasi', en: 'Ready to confirm' },
  completed: { id: 'Selesai', en: 'Completed' },
} as const

export function LearningHub({ charityPoints, onAddCharityPoints }: LearningHubProps) {
  const { t, language, userRole, gradeLevel } = useApex()
  const mastery = TODAY_MISSION.mastery
  const masteryPassed = mastery >= 80
  const [eventNote, setEventNote] = useState<string | null>(null)
  const [sendingEvent, setSendingEvent] = useState(false)
  const [moduleItems, setModuleItems] = useState<
    Array<{
      id: string
      title: string
      sequenceOrder: number
      unlocked?: boolean
      lockReason?: string | null
      completed?: boolean
      lessonsAllPassed?: boolean
      studyConfirmedAt?: string | null
      progress?: { completionPct?: number; totalLessons?: number; passedLessons?: number }
      metadata?: Record<string, unknown>
    }>
  >([])
  const [confirmingModuleId, setConfirmingModuleId] = useState<string | null>(null)
  const [selectedModuleId, setSelectedModuleId] = useState<string>('')
  const [lessonItems, setLessonItems] = useState<
    Array<{
      lessonId: string
      title: string
      unlocked: boolean
      lockReason?: string | null
      pretestScore: number | null
      posttestScore: number | null
      posttestPassed: boolean
    }>
  >([])
  const [lessonLoading, setLessonLoading] = useState(false)
  const [lessonMessage, setLessonMessage] = useState<string | null>(null)
  const [modulesLoading, setModulesLoading] = useState(false)
  const [modulesLoadError, setModulesLoadError] = useState<string | null>(null)
  const [hubSuccessMessage, setHubSuccessMessage] = useState<string | null>(null)
  const [effectiveGrade, setEffectiveGrade] = useState<string | null>(null)
  const [modulePostPassThreshold, setModulePostPassThreshold] = useState(80)
  const [activeTest, setActiveTest] = useState<{ lessonId: string; type: 'PRE' | 'POST' } | null>(null)
  const [testQuestions, setTestQuestions] = useState<Array<{ question: string; options: string[]; hint?: string | null }>>([])
  const [testAnswers, setTestAnswers] = useState<string[]>([])
  const [submittingTest, setSubmittingTest] = useState(false)
  const [openingTestLessonId, setOpeningTestLessonId] = useState<string | null>(null)
  const [lastAssessmentResult, setLastAssessmentResult] = useState<{
    lessonId: string
    assessmentType: 'PRE' | 'POST'
    scorePct: number
    correctAnswers: number
    totalQuestions: number
    passed: boolean
    passThreshold: number
  } | null>(null)

  const dailyMindsetGreeting = useMemo(() => {
    return getDailyGrowthMindsetMessage(t, 'dashboard', TODAY_MISSION.subject)
  }, [t])

  useEffect(() => {
    if (!hubSuccessMessage) return
    const id = window.setTimeout(() => setHubSuccessMessage(null), 4500)
    return () => window.clearTimeout(id)
  }, [hubSuccessMessage])
  const toLevelLabel = (raw: unknown) => {
    const text = String(raw ?? '').trim()
    if (!text) return ''
    if (/^\d+$/.test(text)) return `${t('Level', 'Level')} ${text}`
    return text.replace(/^(fase|phase)/i, t('Level', 'Level'))
  }
  const normalizeModuleTitle = (raw: unknown) =>
    String(raw ?? '').replace(/\b(Fase|Phase)\b/gi, t('Level', 'Level'))

  const getAccessToken = async () => {
    const supabase = createSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  const loadLessons = async (moduleId: string) => {
    setLessonLoading(true)
    setLessonMessage(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setLessonMessage(t('Perlu login untuk memuat lesson.', 'Sign in required to load lessons.'))
        return
      }
      const res = await fetch(`/api/learning/lesson-assessment?moduleId=${encodeURIComponent(moduleId)}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = (await res.json()) as {
        items?: Array<{
          lessonId: string
          title: string
          unlocked: boolean
          lockReason?: string | null
          pretestScore: number | null
          posttestScore: number | null
          posttestPassed: boolean
        }>
        postPassThreshold?: number
        message?: string
      }
      if (!res.ok) throw new Error(json.message ?? 'Failed to load lessons')
      setLessonItems(json.items ?? [])
      setModulePostPassThreshold(
        typeof json.postPassThreshold === 'number' && Number.isFinite(json.postPassThreshold)
          ? json.postPassThreshold
          : 80,
      )
    } catch (error) {
      setLessonMessage(error instanceof Error ? error.message : t('Gagal memuat lesson.', 'Failed to load lessons.'))
    } finally {
      setLessonLoading(false)
    }
  }

  const loadModules = useCallback(async () => {
    if (userRole !== 'student') return
    setModulesLoading(true)
    setModulesLoadError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setModuleItems([])
        setEffectiveGrade(null)
        setModulesLoadError(t('Perlu login untuk memuat modul.', 'Sign in required to load modules.'))
        return
      }
      const res = await fetch('/api/learning/modules?todayOnly=1', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = (await res.json()) as {
        items?: Array<{
          id: string
          title: string
          sequenceOrder: number
          unlocked?: boolean
          lockReason?: string | null
          completed?: boolean
          lessonsAllPassed?: boolean
          studyConfirmedAt?: string | null
          progress?: { completionPct?: number; totalLessons?: number; passedLessons?: number }
          metadata?: Record<string, unknown>
        }>
        todayKey?: string
        effectiveGrade?: string
        message?: string
      }
      if (!res.ok) throw new Error(json.message ?? 'Failed to load modules')
      setEffectiveGrade(json.effectiveGrade?.trim() ? String(json.effectiveGrade) : null)
      const items = (json.items ?? []).sort((a, b) => a.sequenceOrder - b.sequenceOrder)
      setModuleItems(items)
      if (items.length > 0) {
        setSelectedModuleId((prev) => (prev && items.some((x) => x.id === prev) ? prev : items[0].id))
        setLessonMessage(null)
      } else {
        setSelectedModuleId('')
        setLessonItems([])
        setLessonMessage(
          t(
            'Tidak ada modul belajar aktif untuk hari ini: belum ada slot jadwal yang memenuhi aturan unlock fase, modul terjadwal sudah ditandai selesai dipelajari, atau tidak ada slot hari ini (fallback berikutnya belum tersedia). Cek Jadwal Belajar dan Modul Materi.',
            'No active modules for today: no schedule slot matches your unlocked phase, scheduled modules are marked as finished for study, or there is no slot today (no next eligible fallback). Check Weekly Schedule and Module Materials.',
          ),
        )
      }
    } catch (error) {
      setModuleItems([])
      setEffectiveGrade(null)
      setModulesLoadError(
        error instanceof Error
          ? error.message
          : t('Gagal memuat modul terjadwal hari ini.', 'Failed to load today scheduled modules.'),
      )
    } finally {
      setModulesLoading(false)
    }
  }, [t, userRole])

  useEffect(() => {
    void loadModules()
  }, [loadModules, gradeLevel])

  const confirmModuleStudy = async (moduleId: string) => {
    setConfirmingModuleId(moduleId)
    setLessonMessage(null)
    setHubSuccessMessage(null)
    setModulesLoadError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setLessonMessage(t('Perlu login untuk konfirmasi.', 'Sign in required to confirm.'))
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
      const json = (await res.json()) as { message?: string; ok?: boolean }
      if (!res.ok) throw new Error(json.message ?? t('Gagal mengonfirmasi modul.', 'Failed to confirm module.'))
      await loadModules()
      if (selectedModuleId === moduleId) {
        await loadLessons(moduleId)
      }
      setHubSuccessMessage(
        t(
          'Modul ditandai selesai dipelajari. Jadwal dan daftar modul aktif diperbarui.',
          'Module marked as finished for study. Your schedule and active module list are updated.',
        ),
      )
    } catch (error) {
      setLessonMessage(error instanceof Error ? error.message : t('Gagal mengonfirmasi modul.', 'Failed to confirm module.'))
    } finally {
      setConfirmingModuleId(null)
    }
  }

  useEffect(() => {
    if (!selectedModuleId) return
    void loadLessons(selectedModuleId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModuleId])

  const openTest = async (lessonId: string, type: 'PRE' | 'POST') => {
    setLessonMessage(null)
    setOpeningTestLessonId(lessonId)
    try {
      const token = await getAccessToken()
      if (!token) {
        setLessonMessage(t('Perlu login untuk mulai test.', 'Sign in required to start test.'))
        return
      }
      const res = await fetch(
        `/api/learning/lesson-assessment?lessonId=${encodeURIComponent(lessonId)}&assessmentType=${encodeURIComponent(type)}`,
        {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        },
      )
      const json = (await res.json()) as {
        lessonId?: string
        questions?: Array<{ question: string; options: string[]; hint?: string | null }>
        message?: string
        reason?: string
      }
      if (!res.ok) {
        if (json.reason === 'PHASE_LOCKED') {
          throw new Error('PHASE_LOCKED')
        }
        if (json.reason === 'PRE_REQUIRED') {
          throw new Error('PRE_REQUIRED')
        }
        if (json.reason === 'LESSON_LOCKED') {
          throw new Error('LESSON_LOCKED')
        }
        throw new Error(json.message ?? 'Failed to load quiz')
      }
      const questions = json.questions ?? []
      if (questions.length === 0) {
        throw new Error(
          t(
            'Soal untuk lesson ini belum tersedia. Isi quiz dulu di Admin Panel.',
            'No questions are available for this lesson yet. Please add quiz content in Admin Panel.',
          ),
        )
      }
      setActiveTest({ lessonId, type })
      setTestQuestions(questions)
      setTestAnswers(new Array(questions.length).fill(''))
    } catch (error) {
      const fallback = t('Gagal memuat quiz.', 'Failed to load quiz.')
      const raw = error instanceof Error ? error.message : fallback
      if (raw.includes('PHASE_LOCKED')) {
        setLessonMessage(
          t(
            'Level modul masih terkunci. Selesaikan level saat ini dulu untuk membuka level berikutnya.',
            'Module level is still locked. Complete your current level to unlock the next one.',
          ),
        )
      } else if (raw.includes('PRE_REQUIRED')) {
        setLessonMessage(
          t(
            'Kerjakan Pre-test dulu sebelum membuka Post-test.',
            'Complete the Pre-test before opening the Post-test.',
          ),
        )
      } else if (raw.includes('LESSON_LOCKED')) {
        setLessonMessage(
          t(
            'Lesson masih terkunci. Lulus post-test lesson sebelumnya terlebih dahulu.',
            'Lesson is still locked. Pass the previous lesson post-test first.',
          ),
        )
      } else {
        setLessonMessage(raw)
      }
    } finally {
      setOpeningTestLessonId(null)
    }
  }

  const submitTest = async () => {
    if (!activeTest) return
    setSubmittingTest(true)
    setLessonMessage(null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error(t('Perlu login untuk submit test.', 'Sign in required to submit test.'))
      const res = await fetch('/api/learning/lesson-assessment', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          lessonId: activeTest.lessonId,
          assessmentType: activeTest.type,
          submitKey:
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          answers: testAnswers,
        }),
      })
      const json = (await res.json()) as {
        scorePct?: number
        correctAnswers?: number
        totalQuestions?: number
        passed?: boolean
        passThreshold?: number
        message?: string
        reason?: string
      }
      if (!res.ok) {
        if (json.reason === 'PHASE_LOCKED') {
          throw new Error('PHASE_LOCKED')
        }
        if (json.reason === 'PRE_REQUIRED') {
          throw new Error('PRE_REQUIRED')
        }
        if (json.reason === 'LESSON_LOCKED') {
          throw new Error('LESSON_LOCKED')
        }
        throw new Error(json.message ?? 'Failed to submit assessment')
      }
      const scorePct = Number(json.scorePct ?? 0)
      const correctAnswers = Number(json.correctAnswers ?? 0)
      const totalQuestions = Number(json.totalQuestions ?? 0)
      const passed = Boolean(json.passed)
      const passTh =
        typeof json.passThreshold === 'number' && Number.isFinite(json.passThreshold)
          ? json.passThreshold
          : modulePostPassThreshold
      setLastAssessmentResult({
        lessonId: activeTest.lessonId,
        assessmentType: activeTest.type,
        scorePct,
        correctAnswers,
        totalQuestions,
        passed,
        passThreshold: passTh,
      })
      setLessonMessage(
        t(
          `${activeTest.type}-test selesai: skor ${scorePct}%. ${
            activeTest.type === 'POST' && passed
              ? 'Lulus, lesson berikutnya terbuka.'
              : activeTest.type === 'POST'
                ? `Belum lulus ${passTh}%, ulangi sampai lulus.`
                : ''
          }`,
          `${activeTest.type} test submitted: score ${scorePct}%. ${
            activeTest.type === 'POST' && passed
              ? 'Passed, next lesson unlocked.'
              : activeTest.type === 'POST'
                ? `Below ${passTh}%, retry to unlock next lesson.`
                : ''
          }`,
        ),
      )
      setActiveTest(null)
      setTestQuestions([])
      setTestAnswers([])
      await loadLessons(selectedModuleId)
      await loadModules()
    } catch (error) {
      const fallback = t('Gagal submit test.', 'Failed to submit test.')
      const raw = error instanceof Error ? error.message : fallback
      if (raw.includes('PHASE_LOCKED')) {
        setLessonMessage(
          t(
            'Level modul masih terkunci. Selesaikan level saat ini dulu.',
            'Module level is still locked. Complete your current level first.',
          ),
        )
      } else if (raw.includes('PRE_REQUIRED')) {
        setLessonMessage(
          t('Kerjakan Pre-test dulu sebelum Post-test.', 'Complete Pre-test before Post-test.'),
        )
      } else if (raw.includes('LESSON_LOCKED')) {
        setLessonMessage(
          t(
            'Lesson masih terkunci. Lulus post-test lesson sebelumnya terlebih dahulu.',
            'Lesson is still locked. Pass the previous lesson post-test first.',
          ),
        )
      } else {
        setLessonMessage(raw)
      }
    } finally {
      setSubmittingTest(false)
    }
  }

  const postLearningEvent = async (body: Record<string, unknown>) => {
    setSendingEvent(true)
    setEventNote(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setEventNote(t('Login diperlukan untuk mencatat sinyal kalibrasi.', 'Sign in to record calibration signals.'))
        return
      }
      const res = await fetch('/api/assessment/learning-events', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { message?: string; inserted?: number }
      if (!res.ok) {
        setEventNote(json.message ?? t('Gagal mencatat event.', 'Failed to record event.'))
        return
      }
      setEventNote(
        t(
          `Sinyal kalibrasi tercatat (${json.inserted ?? 0} baris).`,
          `Calibration signal recorded (${json.inserted ?? 0} row(s)).`,
        ),
      )
    } finally {
      setSendingEvent(false)
    }
  }

  return (
    <div className="space-y-5 animate-in fade-in">

      {/* ── Sapaan selamat datang ────────────────────────────────────── */}
      <div
        className="p-5 rounded-2xl text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0A1128 0%, #0F2A3A 100%)' }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: '#06B6D4', transform: 'translate(20%, -30%)' }} />
        <p className="text-xs font-semibold text-[#06B6D4] mb-1 tracking-wide" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
          {t('Selamat Datang, Pejuang Ilmu! 🌟', 'Welcome back, Knowledge Seeker! 🌟')}
        </p>
        <h2 className="text-xl font-black text-white" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
          {t('Misi Hari Ini', "Today's Quest")} 🚀
        </h2>
        <p className="text-sm md:text-base text-cyan-100 mt-2 font-semibold leading-relaxed italic">
          {dailyMindsetGreeting}
        </p>
      </div>

      {/* ── Misi Hari Ini ────────────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Icon mata pelajaran */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
            style={{ background: `${TODAY_MISSION.color}15`, border: `1px solid ${TODAY_MISSION.color}30` }}
          >
            {TODAY_MISSION.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3
                className="font-bold text-base text-[#0A1128]"
                style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
              >
                {TODAY_MISSION.subject}: {TODAY_MISSION.topic}
              </h3>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: '#FFF7ED', color: '#F97316', border: '1px solid #FED7AA' }}
              >
                +{TODAY_MISSION.xp} XP
              </span>
            </div>

            {/* Mastery bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-slate-500">{t('Mastery Level', 'Mastery Level')}</span>
                <span style={{ color: masteryPassed ? '#10B981' : '#F97316' }}>
                  {mastery}% {masteryPassed ? '✅' : `→ target 80%`}
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${mastery}%`,
                    background: masteryPassed
                      ? 'linear-gradient(90deg, #10B981, #059669)'
                      : 'linear-gradient(90deg, #F97316, #EA6C0A)',
                  }}
                />
              </div>
              {/* Marker 80% */}
              <div className="relative h-2 -mt-2 pointer-events-none">
                <div className="absolute w-0.5 h-3 bg-slate-400 rounded-full" style={{ left: '80%', top: 0 }} />
                <span className="absolute text-[9px] text-slate-400 font-bold" style={{ left: 'calc(80% + 3px)', top: 0 }}>80%</span>
              </div>

              {/* Microcopy dari Panduan UX APEX */}
              <p
                className="text-xs font-medium mt-3 px-3 py-2 rounded-lg"
                style={{
                  background: masteryPassed ? '#ECFDF5' : '#FFF7ED',
                  color:      masteryPassed ? '#059669' : '#C2410C',
                  border:     `1px solid ${masteryPassed ? '#A7F3D0' : '#FED7AA'}`,
                }}
              >
                {t(
                  getMasteryCopy(mastery),
                  mastery >= 80
                    ? 'Excellent! Your hard work paid off. You have mastered this topic! 🌟'
                    : mastery >= 60
                      ? `Almost there! Your progress is ${mastery}%, let us strengthen the remaining ${80 - mastery}%. 💪`
                      : `Your progress is ${mastery}%, let us strengthen the rest. 💪`,
                )}
              </p>
            </div>

            {/* CTA — mencatat MODULE_SESSION_START ke calibration_signals (live) */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
              <button
                type="button"
                disabled={sendingEvent}
                onClick={() =>
                  void postLearningEvent({
                    event: APEX_LEARNING_EVENTS.MODULE_SESSION_START,
                    moduleId: DEMO_MODULE_ID,
                    metadata: { subject: TODAY_MISSION.subject, topic: TODAY_MISSION.topic },
                  })
                }
                className="px-5 py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  boxShadow: '0 4px 14px 0 rgb(6 182 212 / 0.35)',
                }}
              >
                <Zap size={15} />
                {t('Mulai Misi Hari Ini! 🚀', "Start Today's Quest! 🚀")}
              </button>
              <button
                type="button"
                disabled={sendingEvent}
                onClick={() =>
                  void postLearningEvent({
                    event: APEX_LEARNING_EVENTS.MODULE_SESSION_END,
                    moduleId: DEMO_MODULE_ID,
                    dimension: 'digital',
                    scorePct: mastery,
                    durationSeconds: 600,
                    metadata: { subject: TODAY_MISSION.subject, topic: TODAY_MISSION.topic },
                  })
                }
                className="px-4 py-2.5 rounded-xl font-semibold text-xs border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {t('Catat selesai misi (kalibrasi)', 'Log completed session (calibration)')}
              </button>
            </div>
            {eventNote ? (
              <p className="mt-2 text-[11px] text-slate-500" role="status">
                {eventNote}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Lesson gating: pre lalu post, ambang lulus = mastery_threshold modul ── */}
      <div
        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3"
        aria-busy={modulesLoading}
        aria-labelledby="learning-hub-modules-heading"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 id="learning-hub-modules-heading" className="text-sm font-bold text-slate-800">
            {t('Progress Lesson per Modul (Pre/Post Test)', 'Module Lesson Progress (Pre/Post Test)')}
          </h3>
          {effectiveGrade ? (
            <span className="text-[10px] font-bold text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 shrink-0">
              {t('Jenjang', 'Grade')}: {effectiveGrade}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">
          {t(
            `Aturan: kerjakan Pre-test dulu, lalu Post-test. Lulus post-test = ≥ ${modulePostPassThreshold}% (ambang modul). Lesson berikutnya terbuka jika post-test lesson sebelumnya lulus.`,
            `Rule: complete Pre-test first, then Post-test. Pass post-test = ≥ ${modulePostPassThreshold}% (module threshold). Next lesson unlocks when the previous lesson’s post-test passes.`,
          )}
        </p>
        {modulesLoadError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {modulesLoadError}
          </div>
        ) : null}
        {hubSuccessMessage ? (
          <div role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            {hubSuccessMessage}
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {modulesLoading ? (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3 animate-pulse space-y-2" aria-hidden>
                  <div className="h-4 w-3/4 max-w-[200px] rounded bg-slate-200" />
                  <div className="h-3 w-1/2 rounded bg-slate-200" />
                  <div className="h-1.5 w-full rounded bg-slate-200" />
                </div>
              ))}
            </>
          ) : null}
          {!modulesLoading && moduleItems.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              {t('Belum ada modul terjadwal untuk hari ini.', 'No modules scheduled for today.')}
            </div>
          ) : null}
          {!modulesLoading &&
            moduleItems.map((m) => {
            const selected = selectedModuleId === m.id
            const completionPct = Number(m.progress?.completionPct ?? 0)
            const totalLessons = Number(m.progress?.totalLessons ?? 0)
            const passedLessons = Number(m.progress?.passedLessons ?? 0)
            const phase = toLevelLabel(m.metadata?.phase)
            const moduleUnlocked = Boolean(m.unlocked)
            const lessonsAllPassed = Boolean(
              m.lessonsAllPassed ?? (totalLessons > 0 && passedLessons >= totalLessons),
            )
            const isCompleted = Boolean(m.completed)
            const needsStudyConfirm = moduleUnlocked && lessonsAllPassed && !isCompleted
            const statusText = !moduleUnlocked
              ? t(MODULE_STATUS_COPY.phaseLocked.id, MODULE_STATUS_COPY.phaseLocked.en)
              : isCompleted
                ? t(MODULE_STATUS_COPY.completed.id, MODULE_STATUS_COPY.completed.en)
                : needsStudyConfirm
                  ? t(MODULE_STATUS_COPY.awaitingConfirm.id, MODULE_STATUS_COPY.awaitingConfirm.en)
                  : passedLessons > 0
                    ? t(MODULE_STATUS_COPY.inProgress.id, MODULE_STATUS_COPY.inProgress.en)
                    : t(MODULE_STATUS_COPY.ready.id, MODULE_STATUS_COPY.ready.en)
            const statusClass = !moduleUnlocked
              ? 'bg-slate-100 text-slate-600 border-slate-200'
              : isCompleted
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : needsStudyConfirm
                  ? 'bg-violet-100 text-violet-800 border-violet-200'
                  : passedLessons > 0
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-blue-100 text-blue-700 border-blue-200'
            const selectModule = () => {
              if (!moduleUnlocked) {
                setLessonMessage(
                  t(
                    'Level modul ini masih terkunci untuk levelmu saat ini.',
                    'This module level is still locked for your current level.',
                  ),
                )
                return
              }
              setSelectedModuleId(m.id)
            }
            return (
              <div
                key={m.id}
                className={`text-left rounded-xl border p-3 transition-all ${
                  selected
                    ? 'border-cyan-300 bg-cyan-50 shadow-sm'
                    : 'border-slate-200 bg-white'
                } ${!moduleUnlocked ? 'opacity-80' : ''}`}
              >
                <div
                  role="button"
                  tabIndex={moduleUnlocked ? 0 : -1}
                  onClick={() => selectModule()}
                  onKeyDown={(e) => {
                    if (!moduleUnlocked) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      selectModule()
                    }
                  }}
                  className={`rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    moduleUnlocked ? 'cursor-pointer hover:bg-cyan-50/50' : 'cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {normalizeModuleTitle(m.title)}
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${statusClass}`}>
                      {statusText}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {phase ? `${phase} · ` : ''}
                    {passedLessons}/{totalLessons} {t('lesson lulus', 'passed lessons')}
                  </p>
                  {!moduleUnlocked && m.lockReason === 'PHASE_LOCKED' ? (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {t(
                        'Selesaikan level saat ini terlebih dahulu untuk membuka modul ini.',
                        'Complete your current level first to unlock this module.',
                      )}
                    </p>
                  ) : null}
                  <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(0, Math.min(100, completionPct))}%`,
                        background:
                          completionPct >= 80
                            ? 'linear-gradient(90deg, #34D399, #059669)'
                            : 'linear-gradient(90deg, #60A5FA, #2563EB)',
                      }}
                    />
                  </div>
                </div>
                {needsStudyConfirm ? (
                  <button
                    type="button"
                    disabled={confirmingModuleId === m.id}
                    onClick={() => void confirmModuleStudy(m.id)}
                    className="mt-2 w-full px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-60"
                  >
                    {confirmingModuleId === m.id
                      ? t('Menyimpan...', 'Saving...')
                      : t('Selesai dipelajari', 'Mark as finished for study')}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
        {lessonLoading ? <p className="text-xs text-slate-500">{t('Memuat lesson...', 'Loading lessons...')}</p> : null}
        <div className="space-y-2">
          {lessonItems.map((lesson) => (
            <div
              key={lesson.lessonId}
              className={`rounded-xl border p-3 ${lesson.unlocked ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-80'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{lesson.title}</p>
                  <p className="text-[11px] text-slate-500">
                    PRE: {lesson.pretestScore ?? '-'}% · POST: {lesson.posttestScore ?? '-'}% ·{' '}
                    {lesson.posttestPassed ? t('LULUS', 'PASSED') : t('BELUM', 'PENDING')}
                  </p>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {lesson.posttestPassed ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                      {t('PASSED', 'PASSED')}
                    </span>
                  ) : lesson.unlocked ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                      {t('UNLOCKED', 'UNLOCKED')}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      {t('LOCKED', 'LOCKED')}
                    </span>
                  )}
                  {!lesson.unlocked ? <Lock size={14} className="text-slate-400" /> : null}
                </div>
              </div>
              {!lesson.unlocked ? (
                <p className="mt-1 text-[11px] text-amber-700">
                  {lesson.lockReason === 'PHASE_LOCKED'
                    ? t(
                        'Level modul terkunci untuk levelmu saat ini.',
                        'This module level is locked for your current level.',
                      )
                    : t(
                        'Lesson terkunci: lulus Post-test lesson sebelumnya terlebih dahulu.',
                        'Lesson locked: pass the previous lesson post-test first.',
                      )}
                </p>
              ) : null}
              <div className="mt-2 space-y-1.5">
                <div>
                  <div className="mb-0.5 flex justify-between text-[10px] text-slate-500">
                    <span>{t('Progress PRE', 'PRE progress')}</span>
                    <span>{lesson.pretestScore ?? 0}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(0, Math.min(100, Number(lesson.pretestScore ?? 0)))}%`,
                        background: 'linear-gradient(90deg, #60A5FA, #2563EB)',
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[10px] text-slate-500">
                    <span>{t('Progress POST', 'POST progress')}</span>
                    <span>{lesson.posttestScore ?? 0}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(0, Math.min(100, Number(lesson.posttestScore ?? 0)))}%`,
                        background:
                          Number(lesson.posttestScore ?? 0) >= modulePostPassThreshold
                            ? 'linear-gradient(90deg, #34D399, #059669)'
                            : 'linear-gradient(90deg, #FBBF24, #F97316)',
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!lesson.unlocked}
                  onClick={() => void openTest(lesson.lessonId, 'PRE')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40"
                >
                  {openingTestLessonId === lesson.lessonId ? t('Memuat...', 'Loading...') : t('Pre-test', 'Pre-test')}
                </button>
                <button
                  type="button"
                  disabled={!lesson.unlocked || lesson.pretestScore == null}
                  onClick={() => void openTest(lesson.lessonId, 'POST')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40"
                >
                  {openingTestLessonId === lesson.lessonId ? t('Memuat...', 'Loading...') : t('Post-test', 'Post-test')}
                </button>
              </div>
              {lesson.unlocked && lesson.pretestScore == null ? (
                <p className="mt-1 text-[11px] text-amber-700">
                  {t('Kerjakan Pre-test dulu untuk membuka Post-test.', 'Complete Pre-test first to unlock Post-test.')}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        {lastAssessmentResult ? (
          <div
            className={`rounded-xl border p-3 ${
              lastAssessmentResult.assessmentType === 'POST' && lastAssessmentResult.passed
                ? 'border-emerald-200 bg-emerald-50'
                : lastAssessmentResult.assessmentType === 'POST'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-blue-200 bg-blue-50'
            }`}
          >
            <p className="text-xs font-bold text-slate-800">
              {t('Hasil test terakhir', 'Latest test result')}
            </p>
            <p className="text-xs text-slate-700 mt-1">
              {lastAssessmentResult.assessmentType}-test · {t('Skor', 'Score')}: {lastAssessmentResult.scorePct}%
              {' '}({lastAssessmentResult.correctAnswers}/{lastAssessmentResult.totalQuestions})
            </p>
            {lastAssessmentResult.assessmentType === 'POST' ? (
              <p className="text-xs font-semibold mt-1">
                {lastAssessmentResult.passed
                  ? t(
                      `Lulus ≥ ${lastAssessmentResult.passThreshold}%. Lesson berikutnya terbuka.`,
                      `Passed ≥ ${lastAssessmentResult.passThreshold}%. Next lesson is unlocked.`,
                    )
                  : t(
                      `Belum mencapai ${lastAssessmentResult.passThreshold}%. Ulangi Post-test untuk lanjut.`,
                      `Below ${lastAssessmentResult.passThreshold}%. Retry Post-test to continue.`,
                    )}
              </p>
            ) : (
              <p className="text-xs mt-1 text-slate-600">
                {t('Lanjutkan ke Post-test untuk membuka lesson berikutnya.', 'Continue to Post-test to unlock next lesson.')}
              </p>
            )}
            {lastAssessmentResult.assessmentType === 'POST' && !lastAssessmentResult.passed ? (
              <button
                type="button"
                onClick={() => void openTest(lastAssessmentResult.lessonId, 'POST')}
                className="mt-2 px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-800"
              >
                {t('Ulangi Post-test', 'Retry Post-test')}
              </button>
            ) : null}
          </div>
        ) : null}
        {lessonMessage ? <p className="text-xs text-slate-600">{lessonMessage}</p> : null}
      </div>

      {activeTest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-blue-700">
                {activeTest.type === 'PRE'
                  ? t('Sesi Pre-test', 'Pre-test session')
                  : t('Sesi Post-test', 'Post-test session')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveTest(null)
                  setTestQuestions([])
                  setTestAnswers([])
                }}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
              >
                {t('Tutup', 'Close')}
              </button>
            </div>
            {testQuestions.map((q, qi) => (
              <div key={`${activeTest.lessonId}-${qi}`} className="rounded-lg border border-blue-100 bg-white p-2.5">
                <p className="text-xs font-semibold text-slate-700 mb-1">
                  {qi + 1}. {q.question}
                </p>
                <div className="grid grid-cols-1 gap-1">
                  {(q.options ?? []).map((opt, oi) => {
                    const letter = String.fromCharCode(65 + oi)
                    return (
                      <label key={`${qi}-${letter}`} className="text-xs text-slate-600 inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name={`q-${qi}`}
                          checked={testAnswers[qi] === letter}
                          onChange={() =>
                            setTestAnswers((prev) => {
                              const next = [...prev]
                              next[qi] = letter
                              return next
                            })
                          }
                        />
                        <span>
                          {letter}. {opt}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {q.hint ? (
                  <p className="mt-1 text-[11px] text-blue-700">
                    {t('Hint', 'Hint')}: {q.hint}
                  </p>
                ) : null}
              </div>
            ))}
            <div className="sticky bottom-0 bg-blue-50 pt-2">
              <button
                type="button"
                disabled={submittingTest}
                onClick={() => void submitTest()}
                className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                {submittingTest ? t('Mengirim...', 'Submitting...') : t('Submit Test', 'Submit Test')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Spaced Repetition Panel (brand Coral Orange) ─────────────── */}
      <div
        className="p-5 rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)',
          border: '1px solid #FED7AA',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🧠</span>
          <h2
            className="font-bold text-sm text-[#9A3412]"
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
          >
            {/* Microcopy resmi APEX */}
            {t('Waktunya Menyegarkan Ingatan! 🧠✨', 'Time to Refresh Your Memory! 🧠✨')}
          </h2>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#F97316', color: 'white' }}>
            {REVIEW_QUEUE.length} {t('kartu', 'cards')}
          </span>
        </div>
        <p className="text-xs text-[#C2410C] mb-3 font-medium">
          {t(
            'Ingatan terkuat dibangun dengan pengulangan. Yuk review materi minggu lalu.',
            'Strong memories are built through repetition. Let\'s review last week\'s material.'
          )}
        </p>
        <div className="space-y-2">
          {REVIEW_QUEUE.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-white rounded-xl border"
              style={{ borderColor: item.urgent ? '#FCA5A5' : '#E2E8F0' }}
            >
              <span className="text-lg">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#0A1128] truncate">
                  {t(
                    item.topic,
                    item.topic === 'Siklus Ekosistem'
                      ? 'Ecosystem Cycle'
                      : item.topic === 'Teorema Pythagoras'
                        ? 'Pythagorean Theorem'
                        : 'Past Perfect Tense',
                  )}
                </p>
                <p className="text-[10px] text-slate-400">
                  {t(
                    item.subject,
                    item.subject === 'Sains'
                      ? 'Science'
                      : item.subject === 'Matematika'
                        ? 'Mathematics'
                        : 'English',
                  )}
                </p>
              </div>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={
                  item.urgent
                    ? { background: '#FEF2F2', color: '#DC2626' }
                    : { background: '#F1F5F9', color: '#64748B' }
                }
              >
                {item.days === 0
                  ? t('Hari ini!', 'Today!')
                  : `${item.days} ${t('hari lagi', 'days')}`}
              </span>
              <button
                className="text-[10px] font-bold px-3 py-1.5 rounded-lg text-white shrink-0"
                style={{ background: '#F97316' }}
              >
                {t('Review', 'Review')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Habit Tracker / Mutaba'ah Yaumiyyah ─────────────────────── */}
      <div
        className="p-5 rounded-2xl"
        style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Heart size={16} style={{ color: '#10B981' }} />
          <h2
            className="font-bold text-sm text-[#065F46]"
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
          >
            {t('Mutaba\'ah Yaumiyyah — Ibadah Harianmu', 'Daily Ibadah Tracker')} 🤍
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {HABITS.map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-2.5 p-3 bg-white rounded-xl border cursor-pointer transition-all duration-200 hover:border-emerald-300"
              style={{ borderColor: h.done ? '#6EE7B7' : '#E2E8F0' }}
              onClick={!h.done ? onAddCharityPoints : undefined}
            >
              <span className="text-lg">{h.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#0A1128] truncate">
                  {t(
                    h.label,
                    h.id === 'dhuha'
                      ? 'Dhuha Prayer'
                      : h.id === 'tilawah'
                        ? "Qur'an Recitation"
                        : h.id === 'shalat'
                          ? 'Five Daily Prayers'
                          : 'Exercise',
                  )}
                </p>
                <p className="text-[10px]" style={{ color: '#10B981' }}>+{h.points} pts</p>
              </div>
              <div
                className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                style={{
                  borderColor: h.done ? '#10B981' : '#CBD5E1',
                  background:  h.done ? '#10B981' : 'transparent',
                }}
              >
                {h.done && <CheckCircle2 size={12} className="text-white" />}
              </div>
            </div>
          ))}
        </div>

        {/* Charity Points */}
        <div
          className="mt-4 flex items-center justify-between p-3 rounded-xl"
          style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}
        >
          <div className="flex items-center gap-2">
            <Star size={14} style={{ color: '#F97316' }} />
            <span className="text-xs font-bold text-[#065F46]">
              {t('Total Charity Points', 'Total Charity Points')}
            </span>
          </div>
          <div className="text-right">
            <span className="text-base font-black" style={{ color: '#059669' }}>
              {charityPoints.toLocaleString(language === 'en' ? 'en-US' : 'id-ID')}
            </span>
            <p className="text-[10px] text-emerald-600">
              {t('≈ Rp 12.500 donasi digital', '≈ Rp 12,500 digital donation')}
            </p>
          </div>
        </div>
      </div>

      {/* ── Skill Quick View ─────────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3
          className="font-bold text-sm text-[#0A1128] mb-3"
          style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
          {t('Kapabilitas Minggu Ini', 'This Week\'s Capabilities')} 📊
        </h3>
        <div className="space-y-2.5">
          {[
            { label: t('Matematika', 'Mathematics'), pct: 82, color: '#06B6D4' },
            { label: t('Bahasa Inggris', 'English'), pct: 74, color: '#8B5CF6' },
            { label: 'Computer Science', pct: 91, color: '#10B981' },
            { label: 'Leadership', pct: 58, color: '#F97316', warn: true },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-600">{s.label}</span>
                <span className="font-bold" style={{ color: s.warn ? '#F97316' : s.color }}>
                  {s.pct}% {s.warn && '⚠️'}
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${s.pct}%`, background: s.color }}
                />
              </div>
            </div>
          ))}
        </div>
        {/* Locked subjects */}
        <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <Lock size={13} className="text-slate-400 shrink-0" />
          <p className="text-[11px] text-slate-400">
            {t(
              'Ekonomi & Wirausaha terkunci — capai 80% di IPS terlebih dahulu.',
              'Economics & Entrepreneurship locked — achieve 80% in Social Studies first.'
            )}
          </p>
        </div>
      </div>

    </div>
  )
}

