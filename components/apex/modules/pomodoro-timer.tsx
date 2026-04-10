'use client'

import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, RotateCcw, Coffee, Brain } from 'lucide-react'
import { useApex } from '../apex-context'
import { cn } from '@/lib/utils'

type TimerMode = 'focus' | 'break'

export function PomodoroTimer() {
  const { config, t, addCharityPoints } = useApex()
  const [mode, setMode] = useState<TimerMode>('focus')
  const [timeLeft, setTimeLeft] = useState(config.pomodoroFocus * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [sessionsCompleted, setSessionsCompleted] = useState(0)

  const totalTime = mode === 'focus' ? config.pomodoroFocus * 60 : config.pomodoroBreak * 60
  const progress = ((totalTime - timeLeft) / totalTime) * 100

  const resetTimer = useCallback(() => {
    setTimeLeft(mode === 'focus' ? config.pomodoroFocus * 60 : config.pomodoroBreak * 60)
    setIsRunning(false)
  }, [mode, config])

  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsRunning(false)
          if (mode === 'focus') {
            setSessionsCompleted(s => s + 1)
            addCharityPoints(25)
            setMode('break')
            return config.pomodoroBreak * 60
          } else {
            setMode('focus')
            return config.pomodoroFocus * 60
          }
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, mode, config, addCharityPoints])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const switchMode = (newMode: TimerMode) => {
    setMode(newMode)
    setTimeLeft(newMode === 'focus' ? config.pomodoroFocus * 60 : config.pomodoroBreak * 60)
    setIsRunning(false)
  }

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        {mode === 'focus' ? <Brain size={20} className="text-blue-500" /> : <Coffee size={20} className="text-emerald-500" />}
        {t('Pomodoro Timer', 'Pomodoro Timer')}
      </h2>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => switchMode('focus')}
          className={cn(
            'flex-1 py-2 px-4 rounded-xl font-bold text-sm transition-colors',
            mode === 'focus' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          {t('Fokus', 'Focus')} ({config.pomodoroFocus} {t('mnt', 'min')})
        </button>
        <button
          onClick={() => switchMode('break')}
          className={cn(
            'flex-1 py-2 px-4 rounded-xl font-bold text-sm transition-colors',
            mode === 'break' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          {t('Istirahat', 'Break')} ({config.pomodoroBreak} {t('mnt', 'min')})
        </button>
      </div>

      {/* Timer Display */}
      <div className="relative w-48 h-48 mx-auto mb-6">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="96"
            cy="96"
            r="88"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-slate-100"
          />
          <circle
            cx="96"
            cy="96"
            r="88"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeDasharray={553}
            strokeDashoffset={553 - (553 * progress) / 100}
            strokeLinecap="round"
            className={cn(
              'transition-all duration-1000',
              mode === 'focus' ? 'text-blue-500' : 'text-emerald-500'
            )}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-slate-800">{formatTime(timeLeft)}</span>
          <span className="text-sm font-medium text-slate-500 mt-1">
            {mode === 'focus' ? t('Waktu Fokus', 'Focus Time') : t('Waktu Istirahat', 'Break Time')}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-4">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors',
            mode === 'focus' 
              ? 'bg-blue-600 hover:bg-blue-700' 
              : 'bg-emerald-600 hover:bg-emerald-700'
          )}
        >
          {isRunning ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
        </button>
        <button
          onClick={resetTimer}
          className="w-14 h-14 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
        >
          <RotateCcw size={24} />
        </button>
      </div>

      {/* Session Counter */}
      <div className="mt-6 text-center">
        <p className="text-sm font-medium text-slate-500">
          {t('Sesi Selesai Hari Ini:', 'Sessions Completed Today:')} 
          <span className="font-bold text-blue-600 ml-1">{sessionsCompleted}</span>
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {t('Setiap sesi fokus = +25 Charity Points', 'Each focus session = +25 Charity Points')}
        </p>
      </div>
    </div>
  )
}
