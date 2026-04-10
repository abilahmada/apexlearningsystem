'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useApex } from '../apex-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type SrsQueueCard =
  | {
      kind: 'due'
      reviewId: string
      flashcardId: string
      question: string
      answer: string
      moduleTitle: string | null
      easeFactor: number
      intervalDays: number
      repetitions: number
      nextReviewDate: string
    }
  | {
      kind: 'new'
      flashcardId: string
      question: string
      answer: string
      moduleTitle: string | null
    }

type SrsStats = {
  dueCount: number
  newCount: number
  masteredCount: number
  totalFlashcards: number
}

export function SpacedRepetition() {
  const { t } = useApex()
  const [showAnswer, setShowAnswer] = useState(false)
  const [feedback, setFeedback] = useState<'none' | 'correct' | 'incorrect'>('none')
  const [userAnswer, setUserAnswer] = useState('')
  const [submittedAnswer, setSubmittedAnswer] = useState('')
  const [queue, setQueue] = useState<SrsQueueCard[]>([])
  const [stats, setStats] = useState<SrsStats | null>(null)
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lastNextInterval, setLastNextInterval] = useState<number | null>(null)

  const getAccessToken = useCallback(async () => {
    const supabase = createSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  const loadQueue = useCallback(async () => {
    setQueueLoading(true)
    setQueueError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setQueueError(t('Silakan masuk untuk memuat antrian SRS.', 'Please sign in to load your SRS queue.'))
        setQueue([])
        setStats(null)
        return
      }
      const res = await fetch('/api/learning/srs/queue', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        setQueueError(typeof data.message === 'string' ? data.message : t('Gagal memuat antrian.', 'Failed to load queue.'))
        setQueue([])
        setStats(null)
        return
      }
      const due = Array.isArray(data.due) ? (data.due as SrsQueueCard[]) : []
      const newCards = Array.isArray(data.newCards) ? (data.newCards as SrsQueueCard[]) : []
      setQueue([...due, ...newCards])
      setStats(
        data.stats && typeof data.stats === 'object'
          ? (data.stats as SrsStats)
          : { dueCount: 0, newCount: 0, masteredCount: 0, totalFlashcards: 0 },
      )
    } catch {
      setQueueError(t('Jaringan error saat memuat SRS.', 'Network error while loading SRS.'))
      setQueue([])
      setStats(null)
    } finally {
      setQueueLoading(false)
    }
  }, [getAccessToken, t])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  const current = queue[0] ?? null

  const handleShowAnswer = () => {
    if (!userAnswer.trim()) return
    setSubmittedAnswer(userAnswer.trim())
    setShowAnswer(true)
  }

  const submitQuality = async (quality: number, expectSuccess: boolean) => {
    if (!current) return
    setSubmitting(true)
    setLastNextInterval(null)
    try {
      const token = await getAccessToken()
      if (!token) return
      const flashcardId = current.flashcardId
      const res = await fetch('/api/learning/srs/review', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ flashcardId, quality }),
      })
      const data = (await res.json()) as { nextInterval?: number; message?: string }
      if (!res.ok) {
        setQueueError(typeof data.message === 'string' ? data.message : t('Gagal menyimpan review.', 'Failed to save review.'))
        return
      }
      if (typeof data.nextInterval === 'number') {
        setLastNextInterval(data.nextInterval)
      }
      setFeedback(expectSuccess ? 'correct' : 'incorrect')
      window.setTimeout(() => {
        setQueue((q) => q.filter((c) => c.flashcardId !== flashcardId))
        setShowAnswer(false)
        setFeedback('none')
        setUserAnswer('')
        setSubmittedAnswer('')
        setLastNextInterval(null)
        void loadQueue()
      }, 2000)
    } finally {
      setSubmitting(false)
    }
  }

  const handleFeedback = (isCorrect: boolean) => {
    const quality = isCorrect ? 4 : 1
    void submitQuality(quality, isCorrect)
  }

  const subjectLabel = current?.moduleTitle?.trim() || t('Materi', 'Subject')

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="bg-orange-50 p-8 rounded-3xl border border-orange-100 text-center">
        <h2 className="text-2xl font-black text-orange-900 mb-2">
          {t('Waktunya Menyegarkan Ingatan!', 'Time to Refresh Your Memory!')}
        </h2>
        <p className="text-orange-700 font-medium">
          {t(
            'Ingatan terkuat dibangun dengan pengulangan. Kartu di bawah memakai algoritma SM-2 di server.',
            'Strong memories are built through repetition. Cards below use the SM-2 algorithm on the server.',
          )}
        </p>
      </div>

      {queueLoading && (
        <div className="flex justify-center py-12 text-slate-500 gap-2 items-center">
          <Loader2 className="animate-spin" size={22} />
          <span className="font-medium">{t('Memuat antrian…', 'Loading queue…')}</span>
        </div>
      )}

      {!queueLoading && queueError && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-center font-medium">{queueError}</div>
      )}

      {!queueLoading && !queueError && stats && (
        <div className="flex justify-center gap-8 flex-wrap">
          <div className="text-center">
            <p className="text-3xl font-black text-blue-600">{stats.dueCount + stats.newCount}</p>
            <p className="text-sm text-slate-500 font-medium">{t('Antrian sekarang', 'In queue now')}</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-black text-emerald-600">{stats.masteredCount}</p>
            <p className="text-sm text-slate-500 font-medium">{t('Sudah mapan (≥21 hari)', 'Mature (≥21d interval)')}</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-black text-orange-600">{stats.totalFlashcards}</p>
            <p className="text-sm text-slate-500 font-medium">{t('Total kartu jenjangmu', 'Cards in your grade')}</p>
          </div>
        </div>
      )}

      {!queueLoading && !queueError && !current && (
        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-10 text-center text-slate-600 max-w-2xl mx-auto">
          <p className="font-bold text-slate-800 mb-2">{t('Tidak ada kartu untuk direview', 'No cards to review')}</p>
          <p className="text-sm">
            {t(
              'Jika basis data masih kosong, admin perlu menambah baris di srs_flashcards untuk modul di jenjang kamu.',
              'If the database is empty, an admin needs to add rows to srs_flashcards for modules in your grade.',
            )}
          </p>
        </div>
      )}

      {current && (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm text-center max-w-2xl mx-auto">
          <p className="text-sm font-bold text-slate-400 mb-6 uppercase tracking-widest">{subjectLabel}</p>
          <h3 className="text-2xl font-bold text-slate-800 mb-10 leading-relaxed whitespace-pre-wrap">{current.question}</h3>

          {!showAnswer ? (
            <div className="w-full max-w-xl mx-auto space-y-4">
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder={t('Tulis jawabanmu di sini sebelum cek pembahasan...', 'Write your answer here before checking the explanation...')}
                className="w-full min-h-28 p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleShowAnswer}
                disabled={!userAnswer.trim()}
                className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
              >
                {t('Kirim Jawaban & Cek', 'Submit Answer & Check')}
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in">
              <div className="bg-blue-50 p-6 rounded-xl border border-blue-200 text-left">
                <p className="text-sm text-blue-700 mb-1 font-semibold">{t('Jawabanmu:', 'Your answer:')}</p>
                <p className="text-slate-700 whitespace-pre-wrap">{submittedAnswer}</p>
              </div>
              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-left">
                <p className="text-lg font-medium text-slate-700 whitespace-pre-wrap">
                  <span className="font-bold">{t('Jawaban:', 'Answer:')}</span> {current.answer}
                </p>
              </div>

              {feedback === 'none' && (
                <div className="flex gap-4 justify-center flex-wrap">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleFeedback(false)}
                    className="px-6 py-3 bg-orange-100 text-orange-700 rounded-xl font-bold flex items-center gap-2 hover:bg-orange-200 transition-colors disabled:opacity-60"
                  >
                    <XCircle size={20} /> {t('Belum Hafal', 'Not Yet')}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleFeedback(true)}
                    className="px-6 py-3 bg-emerald-100 text-emerald-700 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-200 transition-colors disabled:opacity-60"
                  >
                    <CheckCircle2 size={20} /> {t('Sudah Hafal', 'Mastered')}
                  </button>
                </div>
              )}

              {feedback === 'correct' && lastNextInterval != null && (
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 animate-in zoom-in-95">
                  <p className="text-emerald-800 font-bold">
                    {t(
                      `Mantap! Kartu ini jadwal berikutnya ~${lastNextInterval} hari (SM-2).`,
                      `Great! Next review in about ${lastNextInterval} day(s) (SM-2).`,
                    )}
                  </p>
                </div>
              )}

              {feedback === 'incorrect' && lastNextInterval != null && (
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 animate-in zoom-in-95">
                  <p className="text-orange-800 font-bold">
                    {t(
                      `Tidak apa-apa! Jadwal ulang: ${lastNextInterval} hari (biasanya besok untuk jawaban sulit).`,
                      `No worries! Rescheduled: ${lastNextInterval} day(s) (often tomorrow after a lapse).`,
                    )}
                  </p>
                </div>
              )}

              {submitting && (
                <p className="text-slate-500 text-sm flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={16} />
                  {t('Menyimpan…', 'Saving…')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
