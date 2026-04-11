'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Check, Clock, BookOpen, Pencil, Plus, Save, RotateCcw } from 'lucide-react'
import { useApex } from '../apex-context'
import { cn } from '@/lib/utils'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  MODULE_SCHEDULE_DAY_KEYS,
  type ModuleScheduleDayKey,
} from '@/lib/learning/module-schedule-days'

interface ScheduleItem {
  id: string
  moduleId?: string
  moduleTitle: string
  time: string
  duration: number
  completed: boolean
  type: 'core' | 'project' | 'review'
  scheduleSource?: 'custom' | 'default'
}

const daysOfWeek = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const daysOfWeekEn = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const dayKeyToLabel: Record<ModuleScheduleDayKey, string> = {
  mon: 'Senin',
  tue: 'Selasa',
  wed: 'Rabu',
  thu: 'Kamis',
  fri: 'Jumat',
  sat: 'Sabtu',
  sun: 'Minggu',
}

type PickableModule = {
  id: string
  title: string
  sequenceOrder: number
  metadata?: Record<string, unknown>
}

type DraftSlot = { moduleId: string; time: string }

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

function emptyDraft(): Record<ModuleScheduleDayKey, DraftSlot[]> {
  return {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  }
}

function emptyApiSchedule(): Record<
  ModuleScheduleDayKey,
  Array<{
    id: string
    moduleId: string
    moduleTitle: string
    time: string
    duration: number
    type: 'core' | 'project' | 'review'
    source: 'custom' | 'default'
  }>
> {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
}

function mapApiScheduleToLocal(
  schedule: Partial<
    Record<
      ModuleScheduleDayKey,
      Array<{
        id: string
        moduleId: string
        moduleTitle: string
        time: string
        duration: number
        type: 'core' | 'project' | 'review'
        source: 'custom' | 'default'
      }>
    >
  >,
): Record<string, ScheduleItem[]> {
  const out = emptySchedule()
  for (const k of MODULE_SCHEDULE_DAY_KEYS) {
    const label = dayKeyToLabel[k]
    const rows = schedule[k] ?? []
    out[label] = rows.map((r) => ({
      id: r.id,
      moduleId: r.moduleId,
      moduleTitle: r.moduleTitle,
      time: r.time,
      duration: r.duration,
      completed: false,
      type: r.type,
      scheduleSource: r.source,
    }))
  }
  return out
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [effectiveGrade, setEffectiveGrade] = useState<string | null>(null)
  const [pickableModules, setPickableModules] = useState<PickableModule[]>([])
  const [customSlotsByDay, setCustomSlotsByDay] = useState<
    Record<ModuleScheduleDayKey, { moduleId: string; time: string }[]>
  >(emptyDraft())

  const [editing, setEditing] = useState(false)
  const [draftByDay, setDraftByDay] = useState<Record<ModuleScheduleDayKey, DraftSlot[]>>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [addModuleChoice, setAddModuleChoice] = useState<string>('')
  const selectedDayKey = MODULE_SCHEDULE_DAY_KEYS[selectedDay] ?? 'mon'
  const selectedDayLabel = daysOfWeek[selectedDay] ?? 'Senin'

  const getAccessToken = async () => {
    const supabase = createSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  useEffect(() => {
    if (!successMessage) return
    const id = window.setTimeout(() => setSuccessMessage(null), 4500)
    return () => window.clearTimeout(id)
  }, [successMessage])

  const loadSchedule = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setLoadError(t('Perlu login untuk memuat jadwal.', 'Sign in required to load schedule.'))
        setSchedule(emptySchedule())
        setPickableModules([])
        setCustomSlotsByDay(emptyDraft())
        setEffectiveGrade(null)
        return
      }
      const res = await fetch('/api/learning/student-schedule', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = (await res.json()) as {
        effectiveGrade?: string
        schedule?: Record<
          ModuleScheduleDayKey,
          Array<{
            id: string
            moduleId: string
            moduleTitle: string
            time: string
            duration: number
            type: 'core' | 'project' | 'review'
            source: 'custom' | 'default'
          }>
        >
        customSlotsByDay?: Record<ModuleScheduleDayKey, { moduleId: string; time: string }[]>
        pickableModules?: PickableModule[]
        message?: string
      }
      if (!res.ok) throw new Error(json.message ?? 'Failed to load schedule')
      setEffectiveGrade(json.effectiveGrade?.trim() ? String(json.effectiveGrade) : null)
      setSchedule(mapApiScheduleToLocal(json.schedule ?? emptyApiSchedule()))
      setPickableModules(
        (json.pickableModules ?? []).sort((a, b) => a.sequenceOrder - b.sequenceOrder || a.title.localeCompare(b.title)),
      )
      const custom = emptyDraft()
      const rawCustom = json.customSlotsByDay
      if (rawCustom) {
        for (const k of MODULE_SCHEDULE_DAY_KEYS) {
          custom[k] = (rawCustom[k] ?? []).map((x) => ({ moduleId: x.moduleId, time: x.time ?? '' }))
        }
      }
      setCustomSlotsByDay(custom)
    } catch (error) {
      setSchedule(emptySchedule())
      setPickableModules([])
      setCustomSlotsByDay(emptyDraft())
      setLoadError(error instanceof Error ? error.message : t('Gagal memuat jadwal.', 'Failed to load schedule.'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadSchedule()
  }, [loadSchedule])

  const toggleComplete = (day: string, itemId: string) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: prev[day].map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item)),
    }))
  }

  const beginEdit = () => {
    const d = emptyDraft()
    for (const k of MODULE_SCHEDULE_DAY_KEYS) {
      d[k] = customSlotsByDay[k].map((x) => ({ moduleId: x.moduleId, time: x.time }))
    }
    setDraftByDay(d)
    setAddModuleChoice('')
    setEditError(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditError(null)
    setAddModuleChoice('')
  }

  const addDraftSlot = () => {
    if (!addModuleChoice) return
    const used = new Set(draftByDay[selectedDayKey].map((s) => s.moduleId))
    if (used.has(addModuleChoice)) {
      setEditError(t('Modul ini sudah ada di hari yang dipilih.', 'This module is already on the selected day.'))
      return
    }
    setDraftByDay((prev) => ({
      ...prev,
      [selectedDayKey]: [...prev[selectedDayKey], { moduleId: addModuleChoice, time: '' }],
    }))
    setAddModuleChoice('')
    setEditError(null)
  }

  const removeDraftSlot = (dayKey: ModuleScheduleDayKey, index: number) => {
    setDraftByDay((prev) => ({
      ...prev,
      [dayKey]: prev[dayKey].filter((_, i) => i !== index),
    }))
  }

  const updateDraftTime = (dayKey: ModuleScheduleDayKey, index: number, time: string) => {
    setDraftByDay((prev) => ({
      ...prev,
      [dayKey]: prev[dayKey].map((s, i) => (i === index ? { ...s, time } : s)),
    }))
  }

  const saveDraft = async () => {
    setSaving(true)
    setEditError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setEditError(t('Perlu login untuk menyimpan.', 'Sign in required to save.'))
        return
      }
      const days: Record<ModuleScheduleDayKey, { moduleId: string; time?: string }[]> = {
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
      }
      for (const k of MODULE_SCHEDULE_DAY_KEYS) {
        days[k] = draftByDay[k].map((s) => ({
          moduleId: s.moduleId,
          ...(s.time.trim() ? { time: s.time.trim() } : {}),
        }))
      }
      const res = await fetch('/api/learning/student-schedule', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ days }),
      })
      const json = (await res.json()) as { message?: string; ok?: boolean }
      if (!res.ok) throw new Error(json.message ?? t('Gagal menyimpan jadwal.', 'Failed to save schedule.'))
      setEditing(false)
      await loadSchedule()
      setSuccessMessage(t('Jadwal berhasil disimpan.', 'Schedule saved successfully.'))
    } catch (error) {
      setEditError(error instanceof Error ? error.message : t('Gagal menyimpan jadwal.', 'Failed to save schedule.'))
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = async () => {
    setSaving(true)
    setEditError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setEditError(t('Perlu login.', 'Sign in required.'))
        return
      }
      const res = await fetch('/api/learning/student-schedule', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      const json = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(json.message ?? t('Gagal mereset jadwal.', 'Failed to reset schedule.'))
      setEditing(false)
      await loadSchedule()
      setSuccessMessage(t('Jadwal dikembalikan ke default kurikulum.', 'Schedule reset to curriculum default.'))
    } catch (error) {
      setEditError(error instanceof Error ? error.message : t('Gagal mereset jadwal.', 'Failed to reset schedule.'))
    } finally {
      setSaving(false)
    }
  }

  const currentDayItems = schedule[selectedDayLabel] || []
  const completedToday = currentDayItems.filter((i) => i.completed).length
  const totalToday = currentDayItems.length

  const pickableForAdd = pickableModules.filter((m) => !draftByDay[selectedDayKey].some((s) => s.moduleId === m.id))

  return (
    <section
      className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm"
      aria-busy={loading}
      aria-labelledby="weekly-schedule-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2
            id="weekly-schedule-heading"
            className="text-lg font-bold text-slate-800 flex items-center gap-2 flex-wrap"
          >
            <Calendar size={20} className="text-blue-500 shrink-0" aria-hidden />
            {t('Jadwal Belajar Mingguan', 'Weekly Learning Schedule')}
          </h2>
          {effectiveGrade ? (
            <p className="mt-1 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                {t('Jenjang', 'Grade')}: {effectiveGrade}
              </span>
            </p>
          ) : null}
        </div>
        {!loading && pickableModules.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <button
                type="button"
                onClick={() => beginEdit()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
              >
                <Pencil size={14} />
                {t('Edit jadwal manual', 'Edit schedule manually')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveDraft()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
                >
                  <Save size={14} />
                  {saving ? t('Menyimpan...', 'Saving...') : t('Simpan jadwal', 'Save schedule')}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void resetToDefault()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                >
                  <RotateCcw size={14} />
                  {t('Kembali ke default kurikulum', 'Reset to curriculum default')}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => cancelEdit()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                >
                  {t('Batal', 'Cancel')}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-500 mb-4">
        {t(
          'Jadwal manual hanya boleh memuat modul yang sudah terbuka (unlock) untukmu dan belum ditandai selesai dipelajari. Learning Hub "Hari ini" mengikuti jadwal manual jika ada slot untuk hari ini.',
          'Manual schedule may only include modules that are unlocked for you and not marked finished for study. Learning Hub "today" follows your manual slots when today has custom entries.',
        )}
      </p>

      {/* Day Selector */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
        {daysOfWeek.map((day, idx) => {
          const dayItems = schedule[day] || []
          const dayCompleted = dayItems.filter((i) => i.completed).length
          const dayTotal = dayItems.length
          const isToday = idx === new Date().getDay() - 1 || (idx === 6 && new Date().getDay() === 0)

          return (
            <button
              key={day}
              type="button"
              aria-pressed={selectedDay === idx}
              aria-label={`${t(day, daysOfWeekEn[idx])}: ${dayCompleted} ${t('dari', 'of')} ${dayTotal} ${t('selesai', 'done')}`}
              onClick={() => setSelectedDay(idx)}
              className={cn(
                'flex-shrink-0 px-3 py-2 rounded-xl text-center transition-all min-w-[70px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2',
                selectedDay === idx
                  ? 'bg-blue-600 text-white'
                  : isToday
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
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
            {t('Progres Hari Ini', "Today's Progress")}
          </span>
          <span className="font-bold text-blue-600">
            {completedToday}/{totalToday}
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${totalToday > 0 ? (completedToday / totalToday) * 100 : 0}%` }}
          />
        </div>
      </div>

      {loading ? (
        <div className="mb-4 space-y-3" aria-hidden>
          <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
          <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      ) : null}
      {loadError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-3"
        >
          {loadError}
        </div>
      ) : null}
      {successMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 mb-3"
        >
          {successMessage}
        </div>
      ) : null}
      {editError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-3">
          {editError}
        </div>
      ) : null}

      {editing ? (
        <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-900">
            {t('Mengedit', 'Editing')}: {t(selectedDayLabel.slice(0, 3), daysOfWeekEn[selectedDay].slice(0, 3))} (
            {selectedDayKey})
          </p>
          <div className="space-y-2">
            {draftByDay[selectedDayKey].length === 0 ? (
              <p className="text-xs text-slate-600">
                {t('Belum ada modul di hari ini (kosong = ikut default kurikulum untuk hari ini).', 'No modules this day (empty = use curriculum default for this day).')}
              </p>
            ) : null}
            {draftByDay[selectedDayKey].map((slot, index) => {
              const mod = pickableModules.find((m) => m.id === slot.moduleId)
              return (
                <div key={`${slot.moduleId}-${index}`} className="flex flex-col sm:flex-row gap-2 sm:items-center rounded-xl border border-white bg-white p-2">
                  <span className="text-xs font-semibold text-slate-800 flex-1 min-w-0 truncate">
                    {mod?.title ?? slot.moduleId}
                  </span>
                  <input
                    type="text"
                    placeholder="HH:mm"
                    value={slot.time}
                    onChange={(e) => updateDraftTime(selectedDayKey, index, e.target.value)}
                    className="w-full sm:w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraftSlot(selectedDayKey, index)}
                    className="text-xs font-bold text-red-600 hover:underline shrink-0"
                  >
                    {t('Hapus', 'Remove')}
                  </button>
                </div>
              )
            })}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                {t('Tambah modul (hanya unlock)', 'Add module (unlocked only)')}
              </label>
              <select
                value={addModuleChoice}
                onChange={(e) => setAddModuleChoice(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
              >
                <option value="">{t('— pilih —', '— choose —')}</option>
                {pickableForAdd.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => addDraftSlot()}
              disabled={!addModuleChoice}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              <Plus size={14} />
              {t('Tambah', 'Add')}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            {t(
              'Simpan mengirim seluruh minggu: hari lain mengikuti isian di panel ini; ubah hari lewat tab di atas sebelum simpan.',
              'Save sends the full week: switch days with the tabs above and adjust each day before saving.',
            )}
          </p>
        </div>
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
                  : 'bg-slate-50 border-slate-200',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      item.type === 'core'
                        ? 'bg-blue-100 text-blue-700'
                        : item.type === 'project'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-slate-200 text-slate-600',
                    )}
                  >
                    {item.type === 'core' ? t('Inti', 'Core') : item.type === 'project' ? t('Proyek', 'Project') : t('Review', 'Review')}
                  </span>
                  {item.scheduleSource === 'custom' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
                      {t('Manual', 'Manual')}
                    </span>
                  ) : null}
                </div>
                <h3 className={cn('font-bold', item.completed ? 'text-emerald-700 line-through' : 'text-slate-800')}>
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
              {!editing ? (
                <button
                  type="button"
                  onClick={() => toggleComplete(selectedDayLabel, item.id)}
                  aria-label={
                    item.completed
                      ? t('Tandai belum selesai', 'Mark as not done')
                      : t('Tandai selesai', 'Mark as done')
                  }
                  aria-pressed={item.completed}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2',
                    item.completed
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-slate-300 text-slate-300 hover:border-emerald-500 hover:text-emerald-500',
                  )}
                >
                  <Check size={16} />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {currentDayItems.length === 0 && !editing ? (
        <div className="text-center py-8 text-slate-500">
          <Calendar size={48} className="mx-auto mb-2 opacity-30" aria-hidden />
          <p>{t('Tidak ada jadwal untuk hari ini', 'No schedule for this day')}</p>
        </div>
      ) : null}
    </section>
  )
}
