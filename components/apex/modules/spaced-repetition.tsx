'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useApex } from '../apex-context'

export function SpacedRepetition() {
  const { t } = useApex()
  const [showAnswer, setShowAnswer] = useState(false)
  const [feedback, setFeedback] = useState<'none' | 'correct' | 'incorrect'>('none')
  const [userAnswer, setUserAnswer] = useState('')
  const [submittedAnswer, setSubmittedAnswer] = useState('')

  const handleShowAnswer = () => {
    if (!userAnswer.trim()) return
    setSubmittedAnswer(userAnswer.trim())
    setShowAnswer(true)
  }

  const handleFeedback = (isCorrect: boolean) => {
    setFeedback(isCorrect ? 'correct' : 'incorrect')
    setTimeout(() => {
      setShowAnswer(false)
      setFeedback('none')
      setUserAnswer('')
      setSubmittedAnswer('')
    }, 2000)
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="bg-orange-50 p-8 rounded-3xl border border-orange-100 text-center">
        <h2 className="text-2xl font-black text-orange-900 mb-2">
          {t('Waktunya Menyegarkan Ingatan!', 'Time to Refresh Your Memory!')}
        </h2>
        <p className="text-orange-700 font-medium">
          {t('Ingatan terkuat dibangun dengan pengulangan. Yuk review materi minggu lalu.', "Strong memories are built through repetition. Let's review last week's material.")}
        </p>
      </div>

      {/* Flashcard */}
      <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm text-center max-w-2xl mx-auto">
        <p className="text-sm font-bold text-slate-400 mb-6 uppercase tracking-widest">{t('Sains', 'Science')}</p>
        <h3 className="text-2xl font-bold text-slate-800 mb-10 leading-relaxed">
          {t('Sebutkan 3 jenis batuan utama di bumi!', 'Name 3 main rock types on Earth!')}
        </h3>
        
        {!showAnswer ? (
          <div className="w-full max-w-xl mx-auto space-y-4">
            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder={t('Tulis jawabanmu di sini sebelum cek pembahasan...', 'Write your answer here before checking the explanation...')}
              className="w-full min-h-28 p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
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
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <p className="text-lg font-medium text-slate-700">
                <span className="font-bold">{t('Jawaban:', 'Answer:')}</span>{' '}
                {t('Batuan Beku, Batuan Sedimen, dan Batuan Metamorf', 'Igneous, Sedimentary, and Metamorphic rocks')}
              </p>
            </div>
            
            {feedback === 'none' && (
              <div className="flex gap-4 justify-center">
                <button 
                  onClick={() => handleFeedback(false)}
                  className="px-6 py-3 bg-orange-100 text-orange-700 rounded-xl font-bold flex items-center gap-2 hover:bg-orange-200 transition-colors"
                >
                  <XCircle size={20} /> {t('Belum Hafal', 'Not Yet')}
                </button>
                <button 
                  onClick={() => handleFeedback(true)}
                  className="px-6 py-3 bg-emerald-100 text-emerald-700 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-200 transition-colors"
                >
                  <CheckCircle2 size={20} /> {t('Sudah Hafal', 'Mastered')}
                </button>
              </div>
            )}

            {feedback === 'correct' && (
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 animate-in zoom-in-95">
                <p className="text-emerald-800 font-bold">
                  {t('Mantap! Kartu ini akan muncul lagi dalam 3 hari.', 'Great! This card will appear again in 3 days.')}
                </p>
              </div>
            )}

            {feedback === 'incorrect' && (
              <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 animate-in zoom-in-95">
                <p className="text-orange-800 font-bold">
                  {t('Tidak apa-apa! Kartu ini akan muncul lagi besok untuk latihan.', 'No worries! This card will appear again tomorrow for practice.')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-8">
        <div className="text-center">
          <p className="text-3xl font-black text-blue-600">12</p>
          <p className="text-sm text-slate-500 font-medium">{t('Kartu Hari Ini', 'Cards Today')}</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-black text-emerald-600">8</p>
          <p className="text-sm text-slate-500 font-medium">{t('Sudah Dikuasai', 'Mastered')}</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-black text-orange-600">4</p>
          <p className="text-sm text-slate-500 font-medium">{t('Perlu Review', 'Need Review')}</p>
        </div>
      </div>
    </div>
  )
}
