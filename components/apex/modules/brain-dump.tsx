'use client'

import { useState } from 'react'
import { Brain, Lightbulb, Save, Trash2, Clock } from 'lucide-react'
import { useApex } from '../apex-context'
import { cn } from '@/lib/utils'

interface BrainDumpEntry {
  id: string
  content: string
  subject: string
  timestamp: Date
}

export function BrainDump() {
  const { config, t, addCharityPoints, language } = useApex()
  const [currentDump, setCurrentDump] = useState('')
  const [selectedSubject, setSelectedSubject] = useState(config.subjects[0])
  const [entries, setEntries] = useState<BrainDumpEntry[]>([])
  const [isTimerActive, setIsTimerActive] = useState(false)
  const [timeLeft, setTimeLeft] = useState(180) // 3 minutes

  const startBrainDump = () => {
    setIsTimerActive(true)
    setTimeLeft(180)
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setIsTimerActive(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const saveDump = () => {
    if (!currentDump.trim()) return
    
    const newEntry: BrainDumpEntry = {
      id: Date.now().toString(),
      content: currentDump,
      subject: selectedSubject,
      timestamp: new Date()
    }
    
    setEntries(prev => [newEntry, ...prev])
    setCurrentDump('')
    setIsTimerActive(false)
    setTimeLeft(180)
    addCharityPoints(15)
  }

  const deleteEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
        <Brain size={20} className="text-purple-500" />
        {t('Brain Dump - Active Recall', 'Brain Dump - Active Recall')}
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        {t(
          'Tulis semua yang kamu ingat dari sesi belajar tadi tanpa melihat catatan!',
          'Write everything you remember from your study session without looking at notes!'
        )}
      </p>

      {/* Subject Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-600 mb-2">
          {t('Pilih Mata Pelajaran:', 'Select Subject:')}
        </label>
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          className="w-full p-3 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {config.subjects.map(subject => (
            <option key={subject} value={subject}>{subject}</option>
          ))}
        </select>
      </div>

      {/* Timer & Input Area */}
      <div className="relative">
        {isTimerActive && (
          <div className={cn(
            'absolute top-3 right-3 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1',
            timeLeft <= 30 ? 'bg-red-100 text-red-600' : 'bg-purple-100 text-purple-600'
          )}>
            <Clock size={14} />
            {formatTime(timeLeft)}
          </div>
        )}
        <textarea
          value={currentDump}
          onChange={(e) => setCurrentDump(e.target.value)}
          placeholder={t(
            'Mulai menulis semua yang kamu ingat...',
            'Start writing everything you remember...'
          )}
          className="w-full h-40 p-4 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800"
          disabled={!isTimerActive && entries.length === 0 && currentDump === ''}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mt-4">
        {!isTimerActive ? (
          <button
            onClick={startBrainDump}
            className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Lightbulb size={18} />
            {t('Mulai Brain Dump (3 menit)', 'Start Brain Dump (3 min)')}
          </button>
        ) : (
          <button
            onClick={saveDump}
            disabled={!currentDump.trim()}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Save size={18} />
            {t('Simpan (+15 Points)', 'Save (+15 Points)')}
          </button>
        )}
      </div>

      {/* Previous Entries */}
      {entries.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-600 mb-3">
            {t('Riwayat Brain Dump', 'Brain Dump History')}
          </h3>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {entries.map(entry => (
              <div key={entry.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                    {entry.subject}
                  </span>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{entry.content}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {entry.timestamp.toLocaleString(language === 'en' ? 'en-US' : 'id-ID')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
