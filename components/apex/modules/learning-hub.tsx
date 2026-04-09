'use client'

import { useEffect, useMemo, useState } from 'react'
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

export function LearningHub({ charityPoints, onAddCharityPoints }: LearningHubProps) {
  const { t, language, gradeLevel, userRole } = useApex()
  const mastery = TODAY_MISSION.mastery
  const masteryPassed = mastery >= 80
  const [eventNote, setEventNote] = useState<string | null>(null)
  const [sendingEvent, setSendingEvent] = useState(false)
  const [moduleItems, setModuleItems] = useState<Array<{ id: string; title: string; sequenceOrder: number }>>([])
  const [selectedModuleId, setSelectedModuleId] = useState<string>('')
  const [lessonItems, setLessonItems] = useState<
    Array<{
      lessonId: string
      title: string
      unlocked: boolean
      pretestScore: number | null
      posttestScore: number | null
      posttestPassed: boolean
    }>
  >([])
  const [lessonLoading, setLessonLoading] = useState(false)
  const [lessonMessage, setLessonMessage] = useState<string | null>(null)
  const [activeTest, setActiveTest] = useState<{ lessonId: string; type: 'PRE' | 'POST' } | null>(null)
  const [testQuestions, setTestQuestions] = useState<Array<{ question: string; options: string[]; hint?: string | null }>>([])
  const [testAnswers, setTestAnswers] = useState<string[]>([])
  const [submittingTest, setSubmittingTest] = useState(false)
  const [lastAssessmentResult, setLastAssessmentResult] = useState<{
    lessonId: string
    assessmentType: 'PRE' | 'POST'
    scorePct: number
    correctAnswers: number
    totalQuestions: number
    passed: boolean
  } | null>(null)

  const dailyMindsetGreeting = useMemo(() => {
    return getDailyGrowthMindsetMessage(t, 'dashboard', TODAY_MISSION.subject)
  }, [t])

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
          pretestScore: number | null
          posttestScore: number | null
          posttestPassed: boolean
        }>
        message?: string
      }
      if (!res.ok) throw new Error(json.message ?? 'Failed to load lessons')
      setLessonItems(json.items ?? [])
    } catch (error) {
      setLessonMessage(error instanceof Error ? error.message : t('Gagal memuat lesson.', 'Failed to load lessons.'))
    } finally {
      setLessonLoading(false)
    }
  }

  useEffect(() => {
    const loadModules = async () => {
      if (userRole !== 'student') return
      try {
        const token = await getAccessToken()
        if (!token) return
        const res = await fetch('/api/learning/modules?todayOnly=1', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const json = (await res.json()) as {
          items?: Array<{ id: string; title: string; sequenceOrder: number }>
          todayKey?: string
          message?: string
        }
        if (!res.ok) throw new Error(json.message ?? 'Failed to load modules')
        const items = (json.items ?? []).sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        setModuleItems(items)
        if (items.length > 0) {
          setSelectedModuleId((prev) => prev || items[0].id)
        } else {
          setSelectedModuleId('')
          setLessonItems([])
          setLessonMessage(
            t(
              'Belum ada modul terjadwal untuk hari ini. Cek menu Jadwal Belajar untuk detail.',
              'No modules are scheduled for today. Check Weekly Schedule for details.',
            ),
          )
        }
      } catch {
        setModuleItems([])
      }
    }
    void loadModules()
  }, [gradeLevel, t, userRole])

  useEffect(() => {
    if (!selectedModuleId) return
    void loadLessons(selectedModuleId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModuleId])

  const openTest = async (lessonId: string, type: 'PRE' | 'POST') => {
    setLessonMessage(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setLessonMessage(t('Perlu login untuk mulai test.', 'Sign in required to start test.'))
        return
      }
      const res = await fetch(`/api/learning/lesson-assessment?lessonId=${encodeURIComponent(lessonId)}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = (await res.json()) as {
        lessonId?: string
        questions?: Array<{ question: string; options: string[]; hint?: string | null }>
        message?: string
      }
      if (!res.ok) throw new Error(json.message ?? 'Failed to load quiz')
      const questions = json.questions ?? []
      setActiveTest({ lessonId, type })
      setTestQuestions(questions)
      setTestAnswers(new Array(questions.length).fill(''))
    } catch (error) {
      setLessonMessage(error instanceof Error ? error.message : t('Gagal memuat quiz.', 'Failed to load quiz.'))
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
        message?: string
      }
      if (!res.ok) throw new Error(json.message ?? 'Failed to submit assessment')
      const scorePct = Number(json.scorePct ?? 0)
      const correctAnswers = Number(json.correctAnswers ?? 0)
      const totalQuestions = Number(json.totalQuestions ?? 0)
      const passed = Boolean(json.passed)
      setLastAssessmentResult({
        lessonId: activeTest.lessonId,
        assessmentType: activeTest.type,
        scorePct,
        correctAnswers,
        totalQuestions,
        passed,
      })
      setLessonMessage(
        t(
          `${activeTest.type}-test selesai: skor ${scorePct}%. ${
            activeTest.type === 'POST' && passed
              ? 'Lulus, lesson berikutnya terbuka.'
              : activeTest.type === 'POST'
                ? 'Belum lulus 80%, ulangi sampai lulus.'
                : ''
          }`,
          `${activeTest.type} test submitted: score ${scorePct}%. ${
            activeTest.type === 'POST' && passed
              ? 'Passed, next lesson unlocked.'
              : activeTest.type === 'POST'
                ? 'Below 80%, retry to unlock next lesson.'
                : ''
          }`,
        ),
      )
      setActiveTest(null)
      setTestQuestions([])
      setTestAnswers([])
      await loadLessons(selectedModuleId)
    } catch (error) {
      setLessonMessage(error instanceof Error ? error.message : t('Gagal submit test.', 'Failed to submit test.'))
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

      {/* ── Lesson Gating (Pre/Post >= 80) ─────────────────────────── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-800">
          {t('Progress Lesson per Modul (Pre/Post Test)', 'Module Lesson Progress (Pre/Post Test)')}
        </h3>
        <p className="text-xs text-slate-500">
          {t(
            'Aturan: lesson berikutnya terbuka hanya jika post-test lesson saat ini >= 80%.',
            'Rule: next lesson unlocks only if current lesson post-test is >= 80%.',
          )}
        </p>
        <select
          value={selectedModuleId}
          onChange={(e) => setSelectedModuleId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          {moduleItems.length === 0 ? (
            <option value="">{t('Belum ada modul', 'No modules yet')}</option>
          ) : null}
          {moduleItems.map((m) => (
            <option key={m.id} value={m.id}>
              #{m.sequenceOrder} - {m.title}
            </option>
          ))}
        </select>
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
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!lesson.unlocked}
                  onClick={() => void openTest(lesson.lessonId, 'PRE')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40"
                >
                  {t('Pre-test', 'Pre-test')}
                </button>
                <button
                  type="button"
                  disabled={!lesson.unlocked || lesson.pretestScore == null}
                  onClick={() => void openTest(lesson.lessonId, 'POST')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40"
                >
                  {t('Post-test', 'Post-test')}
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

        {activeTest ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-700">
              {activeTest.type === 'PRE' ? t('Sesi Pre-test', 'Pre-test session') : t('Sesi Post-test', 'Post-test session')}
            </p>
            {testQuestions.map((q, qi) => (
              <div key={`${activeTest.lessonId}-${qi}`} className="rounded-lg border border-blue-100 bg-white p-2">
                <p className="text-xs font-semibold text-slate-700 mb-1">{qi + 1}. {q.question}</p>
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
                        <span>{letter}. {opt}</span>
                      </label>
                    )
                  })}
                </div>
                {q.hint ? <p className="mt-1 text-[11px] text-blue-700">{t('Hint', 'Hint')}: {q.hint}</p> : null}
              </div>
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={submittingTest}
                onClick={() => void submitTest()}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                {submittingTest ? t('Mengirim...', 'Submitting...') : t('Submit Test', 'Submit Test')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTest(null)
                  setTestQuestions([])
                  setTestAnswers([])
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold"
              >
                {t('Tutup', 'Close')}
              </button>
            </div>
          </div>
        ) : null}
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
                  ? t('Lulus >= 80%. Lesson berikutnya terbuka.', 'Passed >= 80%. Next lesson is unlocked.')
                  : t('Belum mencapai 80%. Ulangi Post-test untuk lanjut.', 'Below 80%. Retry Post-test to continue.')}
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

