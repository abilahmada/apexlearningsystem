'use client'

import { useState } from 'react'
import { BookOpen, Sparkles, Target, HelpCircle, Save, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApex } from '../apex-context'
import { cn } from '@/lib/utils'

interface ReflectionEntry {
  weekNumber: number
  learned: string
  confused: string
  nextPlan: string
  savedAt: Date
}

export function WeeklyReflection() {
  const { t, addCharityPoints, language } = useApex()
  const [currentWeek] = useState(getWeekNumber(new Date()))
  const [learned, setLearned] = useState('')
  const [confused, setConfused] = useState('')
  const [nextPlan, setNextPlan] = useState('')
  const [savedReflections, setSavedReflections] = useState<ReflectionEntry[]>([])
  const [viewingWeek, setViewingWeek] = useState(currentWeek)

  function getWeekNumber(date: Date): number {
    const startOfYear = new Date(date.getFullYear(), 0, 1)
    const diff = date.getTime() - startOfYear.getTime()
    return Math.ceil((diff / (1000 * 60 * 60 * 24) + startOfYear.getDay() + 1) / 7)
  }

  const saveReflection = () => {
    if (!learned.trim() || !confused.trim() || !nextPlan.trim()) return

    const newEntry: ReflectionEntry = {
      weekNumber: currentWeek,
      learned,
      confused,
      nextPlan,
      savedAt: new Date()
    }

    setSavedReflections(prev => {
      const filtered = prev.filter(r => r.weekNumber !== currentWeek)
      return [newEntry, ...filtered]
    })
    
    addCharityPoints(50)
    setLearned('')
    setConfused('')
    setNextPlan('')
  }

  const currentWeekReflection = savedReflections.find(r => r.weekNumber === viewingWeek)
  const isCurrentWeek = viewingWeek === currentWeek
  const hasCurrentWeekReflection = savedReflections.some(r => r.weekNumber === currentWeek)

  const questions = [
    {
      icon: <Sparkles size={20} className="text-emerald-500" />,
      label: t('Apa yang saya pelajari minggu ini?', 'What did I learn this week?'),
      placeholder: t(
        'Contoh: Saya belajar tentang fotosintesis dan bagaimana tumbuhan menghasilkan makanan...',
        'Example: I learned about photosynthesis and how plants produce food...'
      ),
      value: learned,
      setValue: setLearned,
      color: 'emerald'
    },
    {
      icon: <HelpCircle size={20} className="text-orange-500" />,
      label: t('Apa yang masih membingungkan?', 'What is still confusing?'),
      placeholder: t(
        'Contoh: Saya masih bingung tentang perbedaan mitosis dan meiosis...',
        'Example: I\'m still confused about the difference between mitosis and meiosis...'
      ),
      value: confused,
      setValue: setConfused,
      color: 'orange'
    },
    {
      icon: <Target size={20} className="text-blue-500" />,
      label: t('Apa rencana saya minggu depan?', 'What is my plan for next week?'),
      placeholder: t(
        'Contoh: Minggu depan saya akan fokus menyelesaikan bab aljabar...',
        'Example: Next week I will focus on completing the algebra chapter...'
      ),
      value: nextPlan,
      setValue: setNextPlan,
      color: 'blue'
    }
  ]

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <BookOpen size={20} className="text-blue-500" />
          {t('Refleksi Mingguan', 'Weekly Reflection')}
        </h2>
        
        {/* Week Navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewingWeek(prev => Math.max(1, prev - 1))}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
            disabled={viewingWeek <= 1}
          >
            <ChevronLeft size={20} className="text-slate-400" />
          </button>
          <span className="text-sm font-bold text-slate-600 min-w-[100px] text-center">
            {t('Minggu', 'Week')} {viewingWeek}
            {isCurrentWeek && <span className="text-blue-500 ml-1">({t('Sekarang', 'Current')})</span>}
          </span>
          <button
            onClick={() => setViewingWeek(prev => Math.min(currentWeek, prev + 1))}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
            disabled={viewingWeek >= currentWeek}
          >
            <ChevronRight size={20} className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* Viewing Past Reflection */}
      {!isCurrentWeek && currentWeekReflection && (
        <div className="space-y-4">
          {[
            { label: t('Yang Dipelajari', 'What I Learned'), content: currentWeekReflection.learned, color: 'emerald' },
            { label: t('Yang Membingungkan', 'What Was Confusing'), content: currentWeekReflection.confused, color: 'orange' },
            { label: t('Rencana Selanjutnya', 'Next Plan'), content: currentWeekReflection.nextPlan, color: 'blue' },
          ].map((item, idx) => (
            <div key={idx} className={cn('p-4 rounded-xl', `bg-${item.color}-50 border border-${item.color}-100`)}>
              <h3 className={cn('text-sm font-bold mb-2', `text-${item.color}-700`)}>{item.label}</h3>
              <p className="text-slate-700">{item.content}</p>
            </div>
          ))}
          <p className="text-xs text-slate-400 text-right">
            {t('Disimpan:', 'Saved:')} {currentWeekReflection.savedAt.toLocaleString(language === 'en' ? 'en-US' : 'id-ID')}
          </p>
        </div>
      )}

      {!isCurrentWeek && !currentWeekReflection && (
        <div className="text-center py-8 text-slate-500">
          <BookOpen size={48} className="mx-auto mb-2 opacity-30" />
          <p>{t('Tidak ada refleksi untuk minggu ini', 'No reflection for this week')}</p>
        </div>
      )}

      {/* Current Week Input Form */}
      {isCurrentWeek && !hasCurrentWeekReflection && (
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={idx}>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                {q.icon}
                {q.label}
              </label>
              <textarea
                value={q.value}
                onChange={(e) => q.setValue(e.target.value)}
                placeholder={q.placeholder}
                className={cn(
                  'w-full p-3 border rounded-xl resize-none h-24 focus:outline-none focus:ring-2 text-slate-800',
                  `border-${q.color}-200 focus:ring-${q.color}-500`
                )}
              />
            </div>
          ))}

          <button
            onClick={saveReflection}
            disabled={!learned.trim() || !confused.trim() || !nextPlan.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Save size={18} />
            {t('Simpan Refleksi (+50 Points)', 'Save Reflection (+50 Points)')}
          </button>
        </div>
      )}

      {isCurrentWeek && hasCurrentWeekReflection && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Sparkles size={32} className="text-emerald-500" />
          </div>
          <h3 className="font-bold text-emerald-700 mb-1">
            {t('Refleksi Minggu Ini Sudah Selesai!', 'This Week\'s Reflection is Complete!')}
          </h3>
          <p className="text-sm text-slate-500">
            {t('Kamu sudah meluangkan waktu untuk merefleksikan pembelajaran.', 'You have taken time to reflect on your learning.')}
          </p>
        </div>
      )}
    </div>
  )
}
