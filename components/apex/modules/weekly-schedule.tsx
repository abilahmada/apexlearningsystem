'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Check, Clock, BookOpen } from 'lucide-react'
import { useApex } from '../apex-context'
import { cn } from '@/lib/utils'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

interface ScheduleItem {
  id: string
  moduleTitle: string
  time: string
  duration: number
  completed: boolean
  type: 'core' | 'project' | 'review'
}

const daysOfWeek = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const daysOfWeekEn = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
type DayKey = (typeof dayKeys)[number]

function normalizeDayKey(raw: unknown): DayKey | null {
  const t = String(raw ?? '').trim().toLowerCase()
  if (t === 'mon' || t === 'monday' || t === 'senin') return 'mon'
  if (t === 'tue' || t === 'tuesday' || t === 'selasa') return 'tue'
  if (t === 'wed' || t === 'wednesday' || t === 'rabu') return 'wed'
  if (t === 'thu' || t === 'thursday' || t === 'kamis') return 'thu'
  if (t === 'fri' || t === 'friday' || t === 'jumat' || t === "jum'at") return 'fri'
  if (t === 'sat' || t === 'saturday' || t === 'sabtu') return 'sat'
  if (t === 'sun' || t === 'sunday' || t === 'minggu') return 'sun'
  return null
}

function dayIndexToKey(idx: number): DayKey {
  return dayKeys[idx] ?? 'mon'
}

type ModuleApiItem = {
  id: string
  title: string
  sequenceOrder: number
  metadata?: Record<string, unknown>
}

function emptySchedule(): Record<string, ScheduleItem[]> {
  return {
    Senin: [],
    Selasa: [],
    Rabu: [],
    Kamis: [],
    Jumat: [],
    Sabtu: [],
    Minggu: [],
  }
}

function buildScheduleFromModules(items: ModuleApiItem[]): Record<string, ScheduleItem[]> {
  const schedule = emptySchedule()
  const dayNameByKey: Record<DayKey, string> = {
    mon: 'Senin',
    tue: 'Selasa',
    wed: 'Rabu',
    thu: 'Kamis',
    fri: 'Jumat',
    sat: 'Sabtu',
    sun: 'Minggu',
  }

  for (const moduleItem of items) {
    const metadata = moduleItem.metadata && typeof moduleItem.metadata === 'object' ? moduleItem.metadata : {}
    const rawDays = Array.isArray((metadata as Record<string, unknown>).scheduleDays)
      ? ((metadata as Record<string, unknown>).scheduleDays as unknown[])
      : []
    const days = rawDays.map(normalizeDayKey).filter((d): d is DayKey => Boolean(d))
    const normalizedDays = days.length > 0 ? days : [dayIndexToKey((moduleItem.sequenceOrder - 1) % 6)]
    const scheduleTime = String((metadata as Record<string, unknown>).scheduleTime ?? '08:00')
    const durationRaw = Number((metadata as Record<string, unknown>).scheduleDuration ?? 90)
    const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : 90
    const typeRaw = String((metadata as Record<string, unknown>).scheduleType ?? 'core').toLowerCase()
    const type: ScheduleItem['type'] = typeRaw === 'project' ? 'project' : typeRaw === 'review' ? 'review' : 'core'

    for (const dayKey of normalizedDays) {
      const dayName = dayNameByKey[dayKey]
      schedule[dayName].push({
        id: `${dayName}-${moduleItem.id}`,
        moduleTitle: moduleItem.title,
        time: scheduleTime,
        duration,
        completed: false,
        type,
      })
    }
  }

  for (const day of daysOfWeek) {
    schedule[day].sort((a, b) => a.time.localeCompare(b.time))
  }
  return schedule
}

export function WeeklySchedule() {
  const { t } = useApex()
  const nowDayIndex = useMemo(() => {
    const n = new Date().getDay()
    return n === 0 ? 6 : n - 1
  }, [])
  const [selectedDay, setSelectedDay] = useState(nowDayIndex)
  const [schedule, setSchedule] = useState<Record<string, ScheduleItem[]>>(emptySchedule())
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadSchedule = async () => {
      setLoading(true)
      setMessage(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) {
          setMessage(t('Perlu login untuk memuat jadwal.', 'Sign in required to load schedule.'))
          setSchedule(emptySchedule())
          return
        }
        const res = await fetch('/api/learning/modules', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const json = (await res.json()) as { items?: ModuleApiItem[]; message?: string }
        if (!res.ok) throw new Error(json.message ?? 'Failed to load modules')
        setSchedule(buildScheduleFromModules(json.items ?? []))
      } catch (error) {
        setSchedule(emptySchedule())
        setMessage(error instanceof Error ? error.message : t('Gagal memuat jadwal.', 'Failed to load schedule.'))
      } finally {
        setLoading(false)
      }
    }
    void loadSchedule()
  }, [t])

  const toggleComplete = (day: string, itemId: string) => {
    setSchedule(prev => ({
      ...prev,
      [day]: prev[day].map(item => 
        item.id === itemId ? { ...item, completed: !item.completed } : item
      )
    }))
  }

  const currentDayItems = schedule[daysOfWeek[selectedDay]] || []
  const completedToday = currentDayItems.filter(i => i.completed).length
  const totalToday = currentDayItems.length

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Calendar size={20} className="text-blue-500" />
        {t('Jadwal Belajar Mingguan', 'Weekly Learning Schedule')}
      </h2>

      {/* Day Selector */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
        {daysOfWeek.map((day, idx) => {
          const dayItems = schedule[day] || []
          const dayCompleted = dayItems.filter(i => i.completed).length
          const dayTotal = dayItems.length
          const isToday = idx === new Date().getDay() - 1 || (idx === 6 && new Date().getDay() === 0)
          
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(idx)}
              className={cn(
                'flex-shrink-0 px-3 py-2 rounded-xl text-center transition-all min-w-[70px]',
                selectedDay === idx 
                  ? 'bg-blue-600 text-white' 
                  : isToday 
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              <span className="block text-xs font-medium">
                {t(day.slice(0, 3), daysOfWeekEn[idx].slice(0, 3))}
              </span>
              <span className="block text-[10px] mt-0.5 opacity-70">
                {dayCompleted}/{dayTotal}
              </span>
            </button>
          )
        })}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="font-medium text-slate-600">
            {t('Progres Hari Ini', 'Today\'s Progress')}
          </span>
          <span className="font-bold text-blue-600">{completedToday}/{totalToday}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${totalToday > 0 ? (completedToday / totalToday) * 100 : 0}%` }}
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 mb-3">
          {t('Memuat jadwal dari modul...', 'Loading schedule from modules...')}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 mb-3">{message}</div>
      ) : null}

      {/* Schedule Items */}
      <div className="space-y-3">
        {currentDayItems.map((item) => (
          <div
            key={item.id}
            className={cn(
              'p-4 rounded-xl border-2 transition-all',
              item.completed 
                ? 'bg-emerald-50 border-emerald-200' 
                : item.type === 'project'
                  ? 'bg-purple-50 border-purple-200'
                  : 'bg-slate-50 border-slate-200'
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded-full',
                    item.type === 'core' ? 'bg-blue-100 text-blue-700' :
                    item.type === 'project' ? 'bg-purple-100 text-purple-700' :
                    'bg-slate-200 text-slate-600'
                  )}>
                    {item.type === 'core' ? t('Inti', 'Core') : 
                     item.type === 'project' ? t('Proyek', 'Project') : 
                     t('Review', 'Review')}
                  </span>
                </div>
                <h3 className={cn(
                  'font-bold',
                  item.completed ? 'text-emerald-700 line-through' : 'text-slate-800'
                )}>
                  {item.moduleTitle}
                </h3>
                <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    {item.time}
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen size={14} />
                    {item.duration} {t('menit', 'min')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => toggleComplete(daysOfWeek[selectedDay], item.id)}
                className={cn(
                  'w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all',
                  item.completed
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-slate-300 text-slate-300 hover:border-emerald-500 hover:text-emerald-500'
                )}
              >
                <Check size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {currentDayItems.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          <Calendar size={48} className="mx-auto mb-2 opacity-30" />
          <p>{t('Tidak ada jadwal untuk hari ini', 'No schedule for this day')}</p>
        </div>
      )}
    </div>
  )
}
