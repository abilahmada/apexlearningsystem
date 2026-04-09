'use client'

import { useEffect, useMemo, useState } from 'react'
import { Shield, Save, UserPlus, CheckCircle2, XCircle } from 'lucide-react'
import { useApex } from '../apex-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { ConfirmActionModal } from '../shared/confirm-action-modal'

type ContentType = 'courses' | 'modules' | 'lessons' | 'quizzes'
type CourseItem = { id: string; title: string; grade_level: 'SD' | 'SMP' | 'SMK' }
type ModuleItem = {
  id: string
  course_id: string
  title: string
  sequence_order: number
  metadata?: Record<string, unknown>
}
type LessonItem = {
  id: string
  module_id: string
  title: string
  type: 'VIDEO' | 'ARTICLE' | 'INTERACTIVE'
  metadata?: Record<string, unknown>
}

type PendingReg = {
  id: string
  user_id: string
  email: string
  role: string
  status: string
  payload: unknown
  expires_at: string
  created_at: string
}

type PendingConfirmAction = {
  verificationId: string
  action: 'approve' | 'reject'
  email: string
}

export function AdminPanel() {
  const CSV_COLUMNS_STORAGE_KEY = 'apex.admin.csvColumns.v1'
  const {
    appName,
    setAppName,
    appTagline,
    setAppTagline,
    wellbeingMinutes,
    setWellbeingMinutes,
    t,
  } = useApex()

  const [draftName, setDraftName] = useState(appName)
  const [draftTagline, setDraftTagline] = useState(appTagline)
  const [draftWellbeing, setDraftWellbeing] = useState(wellbeingMinutes)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [contentType, setContentType] = useState<ContentType>('courses')
  const [contentLoading, setContentLoading] = useState(false)
  const [contentMessage, setContentMessage] = useState<string | null>(null)
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [modules, setModules] = useState<ModuleItem[]>([])
  const [lessons, setLessons] = useState<LessonItem[]>([])

  const [courseTitle, setCourseTitle] = useState('')
  const [courseGradeLevel, setCourseGradeLevel] = useState<'SD' | 'SMP' | 'SMK'>('SMP')

  const [moduleCourseId, setModuleCourseId] = useState('')
  const [moduleTitle, setModuleTitle] = useState('')
  const [moduleSequence, setModuleSequence] = useState(1)
  const [moduleMastery, setModuleMastery] = useState(80)

  const [lessonModuleId, setLessonModuleId] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonType, setLessonType] = useState<'VIDEO' | 'ARTICLE' | 'INTERACTIVE'>('ARTICLE')
  const [lessonContentUrl, setLessonContentUrl] = useState('')
  const [modulePhase, setModulePhase] = useState('')
  const [moduleSubject, setModuleSubject] = useState('')
  const [moduleTrack, setModuleTrack] = useState('')
  const [lessonCode, setLessonCode] = useState('')
  const [lessonBenchmark, setLessonBenchmark] = useState('')

  const [quizLessonId, setQuizLessonId] = useState('')
  const [quizQuestionsJson, setQuizQuestionsJson] = useState(
    '[{"question":"Contoh soal","options":["A","B","C","D"],"answer":"A","hint":"Pikirkan konsep inti."}]',
  )
  const [bulkQuizRows, setBulkQuizRows] = useState<
    Array<{ lesson_id: string; question: string; options: string[]; answer: string; hint: string }>
  >([])

  const [pendingRegs, setPendingRegs] = useState<PendingReg[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmAction | null>(null)
  const [filterPhase, setFilterPhase] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [filterTrack, setFilterTrack] = useState('')
  const [filterCode, setFilterCode] = useState('')
  const [filterBenchmark, setFilterBenchmark] = useState('')
  const [recentSearch, setRecentSearch] = useState('')
  const [recentPage, setRecentPage] = useState(1)
  const [recentPageSize, setRecentPageSize] = useState<20 | 50 | 100>(20)
  const [recentSort, setRecentSort] = useState<
    'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'code_asc' | 'code_desc'
  >('newest')
  const [moduleFilterCatalog, setModuleFilterCatalog] = useState<Array<Record<string, unknown>>>([])
  const [lessonFilterCatalog, setLessonFilterCatalog] = useState<Array<Record<string, unknown>>>([])
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
  const [expandedRecent, setExpandedRecent] = useState<Record<string, boolean>>({})
  const [selectedRecent, setSelectedRecent] = useState<Record<string, boolean>>({})
  const [showCsvColumns, setShowCsvColumns] = useState(false)
  const CSV_COLUMN_KEYS = [
    'id',
    'title',
    'type',
    'created_at',
    'module_id',
    'lesson_id',
    'metadata.code',
    'metadata.topic',
    'metadata.benchmark',
    'metadata.phase',
    'metadata.subject',
    'metadata.track',
  ] as const
  type CsvColumnKey = (typeof CSV_COLUMN_KEYS)[number]
  const CSV_PRESETS: Record<'minimal' | 'curriculum' | 'audit', CsvColumnKey[]> = {
    minimal: ['id', 'title', 'type'],
    curriculum: [
      'id',
      'title',
      'type',
      'metadata.code',
      'metadata.topic',
      'metadata.benchmark',
      'metadata.phase',
      'metadata.subject',
      'metadata.track',
    ],
    audit: [...CSV_COLUMN_KEYS],
  }
  const [csvColumns, setCsvColumns] = useState<Record<string, boolean>>({
    id: true,
    title: true,
    type: true,
    created_at: true,
    module_id: true,
    lesson_id: true,
    'metadata.code': true,
    'metadata.topic': true,
    'metadata.benchmark': true,
    'metadata.phase': false,
    'metadata.subject': false,
    'metadata.track': false,
  })

  const getMetadataValue = (item: Record<string, unknown>, key: string) => {
    const metadata = item.metadata
    if (!metadata || typeof metadata !== 'object') return ''
    const value = (metadata as Record<string, unknown>)[key]
    return typeof value === 'string' ? value.trim() : ''
  }

  const modulePhaseOptions = useMemo(() => {
    const values = new Set<string>()
    for (const item of moduleFilterCatalog) {
      const v = getMetadataValue(item, 'phase')
      if (v) values.add(v)
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [moduleFilterCatalog])

  const moduleSubjectOptions = useMemo(() => {
    const values = new Set<string>()
    for (const item of moduleFilterCatalog) {
      const v = getMetadataValue(item, 'subject')
      if (v) values.add(v)
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [moduleFilterCatalog])

  const moduleTrackOptions = useMemo(() => {
    const values = new Set<string>()
    for (const item of moduleFilterCatalog) {
      const v = getMetadataValue(item, 'track')
      if (v) values.add(v)
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [moduleFilterCatalog])

  const lessonCodeOptions = useMemo(() => {
    const values = new Set<string>()
    for (const item of lessonFilterCatalog) {
      const v = getMetadataValue(item, 'code')
      if (v) values.add(v)
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [lessonFilterCatalog])

  const lessonBenchmarkOptions = useMemo(() => {
    const values = new Set<string>()
    for (const item of lessonFilterCatalog) {
      const v = getMetadataValue(item, 'benchmark')
      if (v) values.add(v)
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [lessonFilterCatalog])

  const visibleRecentItems = useMemo(() => {
    const keyword = recentSearch.trim().toLowerCase()
    const base = !keyword
      ? [...items]
      : items.filter((item) => JSON.stringify(item).toLowerCase().includes(keyword))
    const safeText = (value: unknown) => (typeof value === 'string' ? value : '').toLowerCase()
    const getCode = (item: Record<string, unknown>) => {
      const metadata = item.metadata
      if (!metadata || typeof metadata !== 'object') return ''
      return safeText((metadata as Record<string, unknown>).code)
    }
    base.sort((a, b) => {
      if (recentSort === 'oldest') {
        return safeText(a.created_at).localeCompare(safeText(b.created_at))
      }
      if (recentSort === 'title_asc') {
        return safeText(a.title).localeCompare(safeText(b.title))
      }
      if (recentSort === 'title_desc') {
        return safeText(b.title).localeCompare(safeText(a.title))
      }
      if (recentSort === 'code_asc') {
        return getCode(a).localeCompare(getCode(b))
      }
      if (recentSort === 'code_desc') {
        return getCode(b).localeCompare(getCode(a))
      }
      return safeText(b.created_at).localeCompare(safeText(a.created_at))
    })
    return base
  }, [items, recentSearch, recentSort])

  const recentTotalPages = Math.max(1, Math.ceil(visibleRecentItems.length / recentPageSize))
  const pagedRecentItems = useMemo(() => {
    const safePage = Math.min(Math.max(recentPage, 1), recentTotalPages)
    const start = (safePage - 1) * recentPageSize
    return visibleRecentItems.slice(start, start + recentPageSize)
  }, [visibleRecentItems, recentPage, recentTotalPages, recentPageSize])

  const getAccessToken = async () => {
    const supabase = createSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error(t('Session tidak ditemukan. Silakan login ulang.', 'Session not found. Please sign in again.'))
    return token
  }

  const loadPendingRegs = async () => {
    setPendingLoading(true)
    setPendingMessage(null)
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/admin/registrations/pending', {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const data = (await res.json()) as { items?: PendingReg[]; message?: string }
      if (!res.ok) throw new Error(data.message ?? t('Gagal memuat pendaftar', 'Failed to load registrations'))
      setPendingRegs(data.items ?? [])
    } catch (error) {
      setPendingMessage(error instanceof Error ? error.message : t('Gagal memuat pendaftar', 'Failed to load registrations'))
    } finally {
      setPendingLoading(false)
    }
  }

  const runRegistrationAction = async (verificationId: string, action: 'approve' | 'reject') => {
    setPendingActionId(verificationId)
    setPendingMessage(null)
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/admin/registrations/action', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ verificationId, action }),
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? t('Aksi gagal', 'Action failed'))
      setPendingMessage(data.message ?? t('Berhasil.', 'Success.'))
      await loadPendingRegs()
    } catch (error) {
      setPendingMessage(error instanceof Error ? error.message : t('Aksi gagal', 'Action failed'))
    } finally {
      setPendingActionId(null)
    }
  }

  const askRegistrationAction = (verificationId: string, action: 'approve' | 'reject', email: string) => {
    setPendingConfirm({ verificationId, action, email })
  }

  const confirmRegistrationAction = async () => {
    if (!pendingConfirm) return
    const { verificationId, action } = pendingConfirm
    setPendingConfirm(null)
    await runRegistrationAction(verificationId, action)
  }

  const loadItems = async (type: ContentType) => {
    try {
      const accessToken = await getAccessToken()
      const query = new URLSearchParams({ type, limit: '500' })
      if (type === 'modules') {
        if (filterPhase.trim()) query.set('phase', filterPhase.trim())
        if (filterSubject.trim()) query.set('subject', filterSubject.trim())
        if (filterTrack.trim()) query.set('track', filterTrack.trim())
      }
      if (type === 'lessons') {
        if (filterCode.trim()) query.set('code', filterCode.trim())
        if (filterBenchmark.trim()) query.set('benchmark', filterBenchmark.trim())
      }
      const res = await fetch(`/api/admin/content?${query.toString()}`, {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const data = (await res.json()) as { items?: Array<Record<string, unknown>>; message?: string }
      if (!res.ok) throw new Error(data.message ?? t('Gagal memuat konten', 'Failed to load content'))
      setItems(data.items ?? [])
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('Gagal memuat konten', 'Failed to load content'))
    }
  }

  const copyText = async (label: string, value: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedLabel(label)
      window.setTimeout(() => setCopiedLabel((prev) => (prev === label ? null : prev)), 1200)
      setContentMessage(t('Teks berhasil disalin.', 'Text copied successfully.'))
      window.setTimeout(
        () => setContentMessage((prev) => (prev === t('Teks berhasil disalin.', 'Text copied successfully.') ? null : prev)),
        1200,
      )
    } catch {
      setContentMessage(t('Gagal menyalin ke clipboard', 'Failed to copy to clipboard'))
    }
  }

  const downloadItemJson = (item: Record<string, unknown>, idx: number) => {
    const id = String(item.id ?? `item-${idx}`)
    const typeLabel = String(contentType ?? 'content').toLowerCase()
    const filename = `apex-${typeLabel}-${id}.json`.replace(/[^a-z0-9._-]/gi, '_')
    const json = JSON.stringify(item, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    setContentMessage(t('File JSON berhasil diunduh.', 'JSON file downloaded successfully.'))
  }

  const getRecentKey = (item: Record<string, unknown>, idx: number) => String(item.id ?? idx)
  const selectedCount = useMemo(
    () => Object.values(selectedRecent).filter(Boolean).length,
    [selectedRecent],
  )
  const expandCurrentPage = () => {
    setExpandedRecent((prev) => {
      const next = { ...prev }
      for (let i = 0; i < pagedRecentItems.length; i += 1) {
        const item = pagedRecentItems[i]
        next[getRecentKey(item, i)] = true
      }
      return next
    })
  }

  const collapseCurrentPage = () => {
    setExpandedRecent((prev) => {
      const next = { ...prev }
      for (let i = 0; i < pagedRecentItems.length; i += 1) {
        const item = pagedRecentItems[i]
        next[getRecentKey(item, i)] = false
      }
      return next
    })
  }

  const toggleSelectCurrentPage = (checked: boolean) => {
    setSelectedRecent((prev) => {
      const next = { ...prev }
      for (let i = 0; i < pagedRecentItems.length; i += 1) {
        const item = pagedRecentItems[i]
        next[getRecentKey(item, i)] = checked
      }
      return next
    })
  }

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedRecent((prev) => {
      const next = { ...prev }
      for (let i = 0; i < visibleRecentItems.length; i += 1) {
        const item = visibleRecentItems[i]
        next[getRecentKey(item, i)] = checked
      }
      return next
    })
  }

  const downloadSelectedJson = () => {
    const selectedItems = pagedRecentItems.filter((item, idx) => selectedRecent[getRecentKey(item, idx)])
    if (selectedItems.length === 0) {
      setContentMessage(t('Pilih item dulu untuk diunduh.', 'Select items first to download.'))
      return
    }
    const payload = {
      type: contentType,
      exported_at: new Date().toISOString(),
      count: selectedItems.length,
      items: selectedItems,
    }
    const filename = `apex-${String(contentType).toLowerCase()}-selected-${Date.now()}.json`
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    setContentMessage(
      t(
        `JSON terpilih berhasil diunduh (${selectedItems.length} item).`,
        `Selected JSON downloaded (${selectedItems.length} items).`,
      ),
    )
  }

  const csvEscape = (value: unknown) => {
    const text = String(value ?? '')
    return `"${text.replace(/"/g, '""')}"`
  }

  const downloadSelectedCsv = () => {
    const selectedItems = visibleRecentItems.filter((item, idx) => selectedRecent[getRecentKey(item, idx)])
    if (selectedItems.length === 0) {
      setContentMessage(t('Pilih item dulu untuk diunduh.', 'Select items first to download.'))
      return
    }
    const allHeaders = [...CSV_COLUMN_KEYS]
    const header = allHeaders.filter((key) => csvColumns[key])
    if (header.length === 0) {
      setContentMessage(t('Pilih minimal 1 kolom CSV.', 'Select at least one CSV column.'))
      return
    }
    const lines = [header.join(',')]
    for (const item of selectedItems) {
      const metadata =
        item.metadata && typeof item.metadata === 'object'
          ? (item.metadata as Record<string, unknown>)
          : {}
      const rowByKey: Record<string, unknown> = {
        id: item.id,
        title: item.title,
        type: item.type,
        created_at: item.created_at,
        module_id: item.module_id,
        lesson_id: item.lesson_id,
        'metadata.code': metadata.code,
        'metadata.topic': metadata.topic,
        'metadata.benchmark': metadata.benchmark,
        'metadata.phase': metadata.phase,
        'metadata.subject': metadata.subject,
        'metadata.track': metadata.track,
      }
      const row = header.map((key) => rowByKey[key])
      lines.push(row.map(csvEscape).join(','))
    }
    const filename = `apex-${String(contentType).toLowerCase()}-selected-${Date.now()}.csv`
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    setContentMessage(
      t(
        `CSV terpilih berhasil diunduh (${selectedItems.length} item).`,
        `Selected CSV downloaded (${selectedItems.length} items).`,
      ),
    )
  }

  const applyCsvPreset = (preset: 'minimal' | 'curriculum' | 'audit') => {
    const active = new Set<string>(CSV_PRESETS[preset])
    const next: Record<string, boolean> = {}
    for (const key of CSV_COLUMN_KEYS) next[key] = active.has(key)
    setCsvColumns(next)
  }

  const loadFilterCatalog = async (type: 'modules' | 'lessons') => {
    try {
      const accessToken = await getAccessToken()
      const res = await fetch(`/api/admin/content?type=${type}&limit=1000`, {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const data = (await res.json()) as { items?: Array<Record<string, unknown>>; message?: string }
      if (!res.ok) throw new Error(data.message ?? t('Gagal memuat filter', 'Failed to load filters'))
      if (type === 'modules') setModuleFilterCatalog(data.items ?? [])
      if (type === 'lessons') setLessonFilterCatalog(data.items ?? [])
    } catch {
      // Keep UI usable even when metadata catalog fails.
    }
  }

  const loadCourses = async () => {
    const accessToken = await getAccessToken()
    const res = await fetch('/api/admin/content?type=courses&limit=100', {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    const data = (await res.json()) as { items?: CourseItem[]; message?: string }
    if (!res.ok) throw new Error(data.message ?? t('Gagal memuat course', 'Failed to load courses'))
    const loaded = data.items ?? []
    setCourses(loaded)
    if (!moduleCourseId && loaded.length > 0) setModuleCourseId(loaded[0].id)
  }

  const loadModules = async (courseId?: string) => {
    const accessToken = await getAccessToken()
    const query = courseId
      ? `/api/admin/content?type=modules&course_id=${courseId}&limit=100`
      : '/api/admin/content?type=modules&limit=100'
    const res = await fetch(query, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    const data = (await res.json()) as { items?: ModuleItem[]; message?: string }
    if (!res.ok) throw new Error(data.message ?? t('Gagal memuat module', 'Failed to load modules'))
    const loaded = data.items ?? []
    setModules(loaded)
    if (!lessonModuleId && loaded.length > 0) setLessonModuleId(loaded[0].id)
  }

  const loadLessons = async (moduleId?: string) => {
    const accessToken = await getAccessToken()
    const query = moduleId
      ? `/api/admin/content?type=lessons&module_id=${moduleId}&limit=100`
      : '/api/admin/content?type=lessons&limit=100'
    const res = await fetch(query, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    const data = (await res.json()) as { items?: LessonItem[]; message?: string }
    if (!res.ok) throw new Error(data.message ?? t('Gagal memuat lesson', 'Failed to load lessons'))
    const loaded = data.items ?? []
    setLessons(loaded)
    if (!quizLessonId && loaded.length > 0) setQuizLessonId(loaded[0].id)
  }

  useEffect(() => {
    void loadItems(contentType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, filterPhase, filterSubject, filterTrack, filterCode, filterBenchmark])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CSV_COLUMNS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const next: Record<string, boolean> = {}
      for (const key of CSV_COLUMN_KEYS) {
        next[key] = Boolean(parsed[key])
      }
      setCsvColumns(next)
    } catch {
      // Ignore invalid persisted config.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(CSV_COLUMNS_STORAGE_KEY, JSON.stringify(csvColumns))
    } catch {
      // Ignore storage failure in private mode.
    }
  }, [CSV_COLUMNS_STORAGE_KEY, csvColumns])

  useEffect(() => {
    setRecentPage(1)
  }, [contentType, recentSearch, recentPageSize, recentSort, filterPhase, filterSubject, filterTrack, filterCode, filterBenchmark])

  useEffect(() => {
    setSelectedRecent({})
  }, [contentType, recentSearch, recentPageSize, recentSort, filterPhase, filterSubject, filterTrack, filterCode, filterBenchmark])

  useEffect(() => {
    if (recentPage > recentTotalPages) setRecentPage(recentTotalPages)
  }, [recentPage, recentTotalPages])

  useEffect(() => {
    if (contentType === 'modules') void loadFilterCatalog('modules')
    if (contentType === 'lessons') void loadFilterCatalog('lessons')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType])

  useEffect(() => {
    void loadPendingRegs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const bootstrapRelations = async () => {
      try {
        await loadCourses()
        await loadModules(moduleCourseId || undefined)
        await loadLessons(lessonModuleId || undefined)
      } catch {
        // ignore, surfaced by content message when needed
      }
    }
    void bootstrapRelations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!moduleCourseId) return
    void loadModules(moduleCourseId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleCourseId])

  useEffect(() => {
    if (!lessonModuleId) return
    void loadLessons(lessonModuleId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonModuleId])

  const onSave = async () => {
    setSaving(true)
    try {
      const payload = {
        app_name: draftName.trim() || 'APEX System',
        app_tagline: draftTagline.trim() || 'Belajar Mandiri, Bersaing Global.',
        wellbeing_minutes: Math.max(10, Math.min(120, draftWellbeing)),
      }

      const supabase = createSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        throw new Error(t('Session tidak ditemukan. Silakan login ulang.', 'Session not found. Please sign in again.'))
      }

      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error('Failed to save settings')
      }

      const data = (await res.json()) as {
        app_name: string
        app_tagline: string
        wellbeing_minutes: number
      }

      setAppName(data.app_name)
      setAppTagline(data.app_tagline)
      setWellbeingMinutes(data.wellbeing_minutes)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const createContent = async () => {
    setContentLoading(true)
    setContentMessage(null)
    try {
      const accessToken = await getAccessToken()
      let payload: Record<string, unknown> = {}
      if (contentType === 'courses') {
        payload = { title: courseTitle, grade_level: courseGradeLevel }
      } else if (contentType === 'modules') {
        payload = {
          course_id: moduleCourseId,
          title: moduleTitle,
          sequence_order: moduleSequence,
          mastery_threshold: moduleMastery,
          metadata: {
            phase: modulePhase || undefined,
            subject: moduleSubject || undefined,
            track: moduleTrack || undefined,
          },
        }
      } else if (contentType === 'lessons') {
        payload = {
          module_id: lessonModuleId,
          title: lessonTitle,
          type: lessonType,
          content_url: lessonContentUrl,
          metadata: {
            code: lessonCode || undefined,
            benchmark: lessonBenchmark || undefined,
          },
        }
      } else {
        payload = {
          lesson_id: quizLessonId,
          questions: JSON.parse(quizQuestionsJson),
        }
      }

      const isEditing = Boolean(editingId)
      const res = await fetch('/api/admin/content', {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ type: contentType, id: editingId ?? undefined, payload }),
      })

      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? t('Gagal menyimpan konten', 'Failed to save content'))

      setContentMessage(
        isEditing
          ? t('Konten berhasil diperbarui.', 'Content updated successfully.')
          : t('Konten berhasil ditambahkan.', 'Content created successfully.'),
      )
      setEditingId(null)
      await loadItems(contentType)
      if (contentType === 'modules') await loadFilterCatalog('modules')
      if (contentType === 'lessons') await loadFilterCatalog('lessons')
      await loadCourses()
      await loadModules(moduleCourseId || undefined)
      await loadLessons(lessonModuleId || undefined)
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('Gagal menyimpan konten', 'Failed to save content'))
    } finally {
      setContentLoading(false)
    }
  }

  const getTemplatePayload = (type: ContentType) => {
    if (type === 'courses') {
      return { title: 'Contoh Course APEX', grade_level: 'SMP' }
    }
    if (type === 'modules') {
      return {
        course_id: 'UUID_COURSE',
        title: 'Contoh Modul',
        sequence_order: 1,
        mastery_threshold: 80,
        metadata: {
          phase: 'Kelas 7 — Transisi & Konsolidasi',
          subject: 'Matematika Kelas 7',
          track: '',
        },
      }
    }
    if (type === 'lessons') {
      return {
        module_id: 'UUID_MODULE',
        title: 'Contoh Lesson',
        type: 'ARTICLE',
        content_url: 'https://example.com/lesson',
        metadata: {
          code: '7M.1',
          benchmark: 'Cambridge LS1',
        },
      }
    }
    return {
      lesson_id: 'UUID_LESSON',
      questions: [
        {
          question: 'Contoh soal',
          options: ['A', 'B', 'C', 'D'],
          answer: 'A',
          hint: 'Berpikir langkah demi langkah.',
        },
      ],
    }
  }

  const downloadTemplate = () => {
    const payload = getTemplatePayload(contentType)
    const json = JSON.stringify(payload, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `apex-${contentType}-template.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const uploadTemplate = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Record<string, unknown>

      if (contentType === 'courses') {
        setCourseTitle(String(parsed.title ?? ''))
        const grade = String(parsed.grade_level ?? 'SMP')
        if (grade === 'SD' || grade === 'SMP' || grade === 'SMK') setCourseGradeLevel(grade)
      } else if (contentType === 'modules') {
        setModuleCourseId(String(parsed.course_id ?? ''))
        setModuleTitle(String(parsed.title ?? ''))
        setModuleSequence(Number(parsed.sequence_order ?? 1))
        setModuleMastery(Number(parsed.mastery_threshold ?? 80))
        const metadata = (parsed.metadata ?? parsed.meta ?? {}) as Record<string, unknown>
        setModulePhase(String(metadata.phase ?? ''))
        setModuleSubject(String(metadata.subject ?? ''))
        setModuleTrack(String(metadata.track ?? ''))
      } else if (contentType === 'lessons') {
        setLessonModuleId(String(parsed.module_id ?? ''))
        setLessonTitle(String(parsed.title ?? ''))
        const lType = String(parsed.type ?? 'ARTICLE')
        if (lType === 'VIDEO' || lType === 'ARTICLE' || lType === 'INTERACTIVE') setLessonType(lType)
        setLessonContentUrl(String(parsed.content_url ?? ''))
        const metadata = (parsed.metadata ?? parsed.meta ?? {}) as Record<string, unknown>
        setLessonCode(String(metadata.code ?? ''))
        setLessonBenchmark(String(metadata.benchmark ?? ''))
      } else {
        setQuizLessonId(String(parsed.lesson_id ?? ''))
        setQuizQuestionsJson(JSON.stringify(parsed.questions ?? [], null, 2))
      }

      setContentMessage(t('Template berhasil diunggah.', 'Template uploaded successfully.'))
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('Template tidak valid', 'Invalid template'))
    }
  }

  const downloadQuizCsvTemplate = () => {
    const csv =
      'question,option_a,option_b,option_c,option_d,answer,hint\n' +
      '"Contoh soal APEX?","Pilihan A","Pilihan B","Pilihan C","Pilihan D","A","Gunakan konsep inti materi."\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'apex-quiz-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadBulkQuizCsvTemplate = () => {
    const csv =
      'lesson_id,question,option_a,option_b,option_c,option_d,answer,hint\n' +
      '"UUID_LESSON_1","Contoh soal 1?","A1","B1","C1","D1","A","Hint 1"\n' +
      '"UUID_LESSON_1","Contoh soal 2?","A2","B2","C2","D2","B","Hint 2"\n' +
      '"UUID_LESSON_2","Contoh soal 3?","A3","B3","C3","D3","C","Hint 3"\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'apex-bulk-quiz-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const parseCsvLine = (line: string) => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    out.push(cur.trim())
    return out.map((v) => v.replace(/^"(.*)"$/, '$1'))
  }

  const uploadQuizCsv = async (file: File) => {
    try {
      const text = await file.text()
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.length < 2) throw new Error(t('CSV kosong atau tidak valid', 'CSV is empty or invalid'))

      const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
      const required = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'answer', 'hint']
      const missing = required.filter((k) => !header.includes(k))
      if (missing.length > 0) {
        throw new Error(t(`Header CSV kurang: ${missing.join(', ')}`, `CSV header missing: ${missing.join(', ')}`))
      }

      const idx = (key: string) => header.indexOf(key)
      const questions = lines.slice(1).map((line) => {
        const cols = parseCsvLine(line)
        const answer = (cols[idx('answer')] || '').toUpperCase()
        const optionA = cols[idx('option_a')] || ''
        const optionB = cols[idx('option_b')] || ''
        const optionC = cols[idx('option_c')] || ''
        const optionD = cols[idx('option_d')] || ''
        const optionMap: Record<string, string> = {
          A: optionA,
          B: optionB,
          C: optionC,
          D: optionD,
        }
        return {
          question: cols[idx('question')] || '',
          options: [optionA, optionB, optionC, optionD],
          answer: optionMap[answer] ? answer : 'A',
          hint: cols[idx('hint')] || '',
        }
      })

      setQuizQuestionsJson(JSON.stringify(questions, null, 2))
      setContentMessage(t('CSV quiz berhasil diunggah.', 'Quiz CSV uploaded successfully.'))
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('CSV tidak valid', 'Invalid CSV'))
    }
  }

  const uploadBulkQuizCsv = async (file: File) => {
    try {
      const text = await file.text()
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.length < 2) throw new Error(t('CSV bulk quiz kosong atau tidak valid', 'Bulk quiz CSV is empty or invalid'))

      const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
      const required = ['lesson_id', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'answer', 'hint']
      const missing = required.filter((k) => !header.includes(k))
      if (missing.length > 0) throw new Error(t(`Header CSV kurang: ${missing.join(', ')}`, `CSV header missing: ${missing.join(', ')}`))

      const idx = (key: string) => header.indexOf(key)
      const rows = lines.slice(1).map((line) => {
        const cols = parseCsvLine(line)
        const answer = (cols[idx('answer')] || '').toUpperCase()
        const optionA = cols[idx('option_a')] || ''
        const optionB = cols[idx('option_b')] || ''
        const optionC = cols[idx('option_c')] || ''
        const optionD = cols[idx('option_d')] || ''
        return {
          lesson_id: cols[idx('lesson_id')] || '',
          question: cols[idx('question')] || '',
          options: [optionA, optionB, optionC, optionD],
          answer: ['A', 'B', 'C', 'D'].includes(answer) ? answer : 'A',
          hint: cols[idx('hint')] || '',
        }
      })
      setBulkQuizRows(rows)
      setContentMessage(
        t(
          `CSV bulk quiz siap diproses (${rows.length} baris).`,
          `Bulk quiz CSV ready (${rows.length} rows).`,
        ),
      )
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('CSV bulk quiz tidak valid', 'Invalid bulk quiz CSV'))
    }
  }

  const submitBulkQuiz = async () => {
    if (bulkQuizRows.length === 0) {
      setContentMessage(t('Upload CSV bulk quiz dulu.', 'Upload bulk quiz CSV first.'))
      return
    }
    setContentLoading(true)
    setContentMessage(null)
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/admin/content/bulk-quiz', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ rows: bulkQuizRows }),
      })
      const data = (await res.json()) as { message?: string; processed_lessons?: number }
      if (!res.ok) throw new Error(data.message ?? t('Bulk import quiz gagal', 'Bulk quiz import failed'))
      setContentMessage(
        t(
          `Bulk quiz berhasil. Lesson diproses: ${data.processed_lessons ?? 0}`,
          `Bulk quiz succeeded. Lessons processed: ${data.processed_lessons ?? 0}`,
        ),
      )
      setBulkQuizRows([])
      await loadItems('quizzes')
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('Bulk import quiz gagal', 'Bulk quiz import failed'))
    } finally {
      setContentLoading(false)
    }
  }

  const startEdit = (item: Record<string, unknown>) => {
    const id = String(item.id ?? '')
    if (!id) return
    setEditingId(id)
    if (contentType === 'courses') {
      setCourseTitle(String(item.title ?? ''))
      const grade = String(item.grade_level ?? 'SMP')
      if (grade === 'SD' || grade === 'SMP' || grade === 'SMK') setCourseGradeLevel(grade)
      return
    }
    if (contentType === 'modules') {
      setModuleCourseId(String(item.course_id ?? ''))
      setModuleTitle(String(item.title ?? ''))
      setModuleSequence(Number(item.sequence_order ?? 1))
      setModuleMastery(Number(item.mastery_threshold ?? 80))
      const metadata = (item.metadata ?? {}) as Record<string, unknown>
      setModulePhase(String(metadata.phase ?? ''))
      setModuleSubject(String(metadata.subject ?? ''))
      setModuleTrack(String(metadata.track ?? ''))
      return
    }
    if (contentType === 'lessons') {
      setLessonModuleId(String(item.module_id ?? ''))
      setLessonTitle(String(item.title ?? ''))
      const lType = String(item.type ?? 'ARTICLE')
      if (lType === 'VIDEO' || lType === 'ARTICLE' || lType === 'INTERACTIVE') setLessonType(lType)
      setLessonContentUrl(String(item.content_url ?? ''))
      const metadata = (item.metadata ?? {}) as Record<string, unknown>
      setLessonCode(String(metadata.code ?? ''))
      setLessonBenchmark(String(metadata.benchmark ?? ''))
      return
    }
    setQuizLessonId(String(item.lesson_id ?? ''))
    setQuizQuestionsJson(JSON.stringify(item.questions ?? [], null, 2))
  }

  const removeContent = async (id: string) => {
    if (!id) return
    setContentLoading(true)
    setContentMessage(null)
    try {
      const accessToken = await getAccessToken()
      const res = await fetch(`/api/admin/content?type=${contentType}&id=${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${accessToken}` },
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? t('Gagal menghapus konten', 'Failed to delete content'))
      if (editingId === id) setEditingId(null)
      setContentMessage(t('Konten berhasil dihapus.', 'Content deleted successfully.'))
      await loadItems(contentType)
      if (contentType === 'modules') await loadFilterCatalog('modules')
      if (contentType === 'lessons') await loadFilterCatalog('lessons')
      await loadCourses()
      await loadModules(moduleCourseId || undefined)
      await loadLessons(lessonModuleId || undefined)
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('Gagal menghapus konten', 'Failed to delete content'))
    } finally {
      setContentLoading(false)
    }
  }

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
        <Shield size={20} className="text-blue-500" />
        {t('Panel Admin', 'Admin Panel')}
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        {t(
          'Kustomisasi nama aplikasi, tagline, wellbeing, verifikasi pendaftar, dan konten e-learning.',
          'Customize app name, tagline, wellbeing, applicant verification, and e-learning content.',
        )}
      </p>

      <div className="mb-8 pb-8 border-b border-slate-200">
        <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
          <UserPlus size={18} className="text-emerald-600" />
          {t('Pendaftar menunggu konfirmasi', 'Applicants awaiting approval')}
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          {t(
            'Setujui atau tolak dari sini (email ke admin tetap bisa dipakai). Setelah disetujui, email otomatis ke pendaftar.',
            'Approve or reject here (admin email links still work). Approved applicants receive an email automatically.',
          )}
        </p>
        <button
          type="button"
          onClick={() => void loadPendingRegs()}
          disabled={pendingLoading}
          className="mb-3 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {pendingLoading ? t('Memuat…', 'Loading…') : t('Muat ulang daftar', 'Refresh list')}
        </button>
        {pendingMessage ? (
          <p className="text-xs text-slate-600 mb-3 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">{pendingMessage}</p>
        ) : null}
        {pendingLoading && pendingRegs.length === 0 ? (
          <p className="text-sm text-slate-500">{t('Memuat daftar…', 'Loading list…')}</p>
        ) : null}
        {!pendingLoading && pendingRegs.length === 0 ? (
          <p className="text-sm text-slate-500">{t('Tidak ada pendaftar yang menunggu.', 'No pending applicants.')}</p>
        ) : null}
        <ul className="space-y-4">
          {pendingRegs.map((row) => {
            const p = (row.payload ?? {}) as Record<string, unknown>
            const addr = p.address as Record<string, unknown> | undefined
            const roleLabel =
              row.role === 'STUDENT'
                ? t('Siswa', 'Student')
                : row.role === 'PARENT'
                  ? t('Orang tua', 'Parent')
                  : row.role
            const busy = pendingActionId === row.id
            return (
              <li
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm space-y-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{String(p.fullName ?? row.email)}</p>
                    <p className="text-slate-600">{row.email}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {t('Peran', 'Role')}: {roleLabel} · {t('User ID', 'User ID')}:{' '}
                      <code className="text-[11px] bg-white px-1 rounded border border-slate-200">{row.user_id}</code>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => askRegistrationAction(row.id, 'approve', row.email)}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} />
                      {busy ? t('Memproses…', 'Working…') : t('Setujui', 'Approve')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => askRegistrationAction(row.id, 'reject', row.email)}
                      className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle size={14} />
                      {t('Tolak', 'Reject')}
                    </button>
                  </div>
                </div>
                <dl className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                  {p.phoneNumber != null && String(p.phoneNumber) !== '' ? (
                    <div>
                      <dt className="font-semibold text-slate-500">{t('HP', 'Phone')}</dt>
                      <dd>{String(p.phoneNumber)}</dd>
                    </div>
                  ) : null}
                  {p.parentLinkCode != null && String(p.parentLinkCode) !== '' ? (
                    <div>
                      <dt className="font-semibold text-slate-500">{t('ID Orang Tua (siswa)', 'Parent ID (student)')}</dt>
                      <dd className="font-mono">{String(p.parentLinkCode)}</dd>
                    </div>
                  ) : null}
                  {p.gradeLevel != null && String(p.gradeLevel) !== '' ? (
                    <div>
                      <dt className="font-semibold text-slate-500">{t('Jenjang', 'Grade level')}</dt>
                      <dd>{String(p.gradeLevel)}</dd>
                    </div>
                  ) : null}
                  {p.schoolOrigin != null && String(p.schoolOrigin) !== '' ? (
                    <div className="sm:col-span-2">
                      <dt className="font-semibold text-slate-500">{t('Asal sekolah', 'School')}</dt>
                      <dd>{String(p.schoolOrigin)}</dd>
                    </div>
                  ) : null}
                  {p.birthDate != null && String(p.birthDate) !== '' ? (
                    <div>
                      <dt className="font-semibold text-slate-500">{t('Tanggal lahir', 'Birth date')}</dt>
                      <dd>{String(p.birthDate)}</dd>
                    </div>
                  ) : null}
                  {addr && (addr.line || addr.city || addr.province) ? (
                    <div className="sm:col-span-2">
                      <dt className="font-semibold text-slate-500">{t('Alamat', 'Address')}</dt>
                      <dd>
                        {[addr.line, addr.district, addr.city, addr.province].filter(Boolean).join(', ')}
                      </dd>
                    </div>
                  ) : null}
                  <div className="sm:col-span-2 text-slate-400">
                    {t('Kedaluwarsa', 'Expires')}: {new Date(row.expires_at).toLocaleString()}{' '}
                    · {t('Diajukan', 'Submitted')}: {new Date(row.created_at).toLocaleString()}
                  </div>
                </dl>
              </li>
            )
          })}
        </ul>
      </div>

      <ConfirmActionModal
        open={Boolean(pendingConfirm)}
        title={
          pendingConfirm?.action === 'approve'
            ? t('Konfirmasi setujui pendaftar', 'Confirm applicant approval')
            : t('Konfirmasi tolak pendaftar', 'Confirm applicant rejection')
        }
        description={
          pendingConfirm?.action === 'approve'
            ? t(
                `Setujui pendaftar ${pendingConfirm?.email ?? ''}? Sistem akan mengirim email konfirmasi.`,
                `Approve applicant ${pendingConfirm?.email ?? ''}? The system will send a confirmation email.`,
              )
            : t(
                `Tolak pendaftar ${pendingConfirm?.email ?? ''}? Tindakan ini tidak bisa diurungkan.`,
                `Reject applicant ${pendingConfirm?.email ?? ''}? This cannot be undone.`,
              )
        }
        confirmLabel={pendingConfirm?.action === 'approve' ? t('Ya, setujui', 'Yes, approve') : t('Ya, tolak', 'Yes, reject')}
        cancelLabel={t('Batal', 'Cancel')}
        tone={pendingConfirm?.action === 'approve' ? 'primary' : 'danger'}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => void confirmRegistrationAction()}
      />

      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
            {t('Nama Aplikasi', 'Application Name')}
          </label>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
            {t('Tagline Sidebar', 'Sidebar Tagline')}
          </label>
          <input
            value={draftTagline}
            onChange={(e) => setDraftTagline(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
            {t('Durasi Wellbeing (menit)', 'Wellbeing Duration (minutes)')}
          </label>
          <input
            type="number"
            min={10}
            max={120}
            value={draftWellbeing}
            onChange={(e) => setDraftWellbeing(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="mt-6 w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white py-2.5 text-sm font-bold flex items-center justify-center gap-2"
      >
        <Save size={16} />
        {saving ? t('Menyimpan...', 'Saving...') : t('Simpan Pengaturan', 'Save Settings')}
      </button>

      {saved && (
        <p className="text-xs text-emerald-600 font-semibold mt-2">
          {t('Perubahan berhasil disimpan.', 'Settings saved successfully.')}
        </p>
      )}

      <div className="mt-8 pt-6 border-t border-slate-200">
        <h3 className="text-base font-bold text-slate-800 mb-2">
          {t('Manajemen Konten E-Learning', 'E-Learning Content Management')}
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          {t(
            'Tambah materi course/module/lesson/quiz langsung dari panel admin.',
            'Create course/module/lesson/quiz materials directly from admin panel.',
          )}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {(['courses', 'modules', 'lessons', 'quizzes'] as ContentType[]).map((type) => (
            <button
              key={type}
              onClick={() => setContentType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${contentType === type ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600'}`}
            >
              {type === 'courses'
                ? t('Kursus', 'Courses')
                : type === 'modules'
                  ? t('Modul', 'Modules')
                  : type === 'lessons'
                    ? t('Pelajaran', 'Lessons')
                    : t('Kuis', 'Quizzes')}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={downloadTemplate}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700"
          >
            {t('Download Template JSON', 'Download JSON Template')}
          </button>
          <label className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-200 bg-violet-50 text-violet-700 cursor-pointer">
            {t('Upload Template JSON', 'Upload JSON Template')}
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadTemplate(file)
                e.currentTarget.value = ''
              }}
            />
          </label>
          {contentType === 'quizzes' && (
            <>
              <button
                onClick={downloadQuizCsvTemplate}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                {t('Download Template CSV Quiz', 'Download Quiz CSV Template')}
              </button>
              <label className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-700 cursor-pointer">
                {t('Upload CSV Quiz', 'Upload Quiz CSV')}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadQuizCsv(file)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <button
                onClick={downloadBulkQuizCsvTemplate}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                {t('Download CSV Bulk Quiz', 'Download Bulk Quiz CSV')}
              </button>
              <label className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-700 cursor-pointer">
                {t('Upload CSV Bulk Quiz', 'Upload Bulk Quiz CSV')}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadBulkQuizCsv(file)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <button
                onClick={() => void submitBulkQuiz()}
                disabled={contentLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-200 bg-violet-50 text-violet-700"
              >
                {t('Proses Bulk Quiz', 'Process Bulk Quiz')}
              </button>
            </>
          )}
        </div>

        {(contentType === 'modules' || contentType === 'lessons') && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              {t('Filter metadata', 'Metadata filters')}
            </p>
            {contentType === 'modules' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={filterPhase}
                  onChange={(e) => setFilterPhase(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
                >
                  <option value="">{t('Semua phase', 'All phases')}</option>
                  {modulePhaseOptions.map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
                <select
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
                >
                  <option value="">{t('Semua subject', 'All subjects')}</option>
                  {moduleSubjectOptions.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
                <select
                  value={filterTrack}
                  onChange={(e) => setFilterTrack(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
                >
                  <option value="">{t('Semua track', 'All tracks')}</option>
                  {moduleTrackOptions.map((track) => (
                    <option key={track} value={track}>
                      {track}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {contentType === 'lessons' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                  value={filterCode}
                  onChange={(e) => setFilterCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
                >
                  <option value="">{t('Semua code', 'All codes')}</option>
                  {lessonCodeOptions.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <select
                  value={filterBenchmark}
                  onChange={(e) => setFilterBenchmark(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
                >
                  <option value="">{t('Semua benchmark', 'All benchmarks')}</option>
                  {lessonBenchmarkOptions.map((benchmark) => (
                    <option key={benchmark} value={benchmark}>
                      {benchmark}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setFilterPhase('')
                setFilterSubject('')
                setFilterTrack('')
                setFilterCode('')
                setFilterBenchmark('')
              }}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900"
            >
              {t('Reset filter', 'Reset filters')}
            </button>
          </div>
        )}

        <div className="space-y-3">
          {contentType === 'courses' && (
            <>
              <input
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
                placeholder={t('Judul course', 'Course title')}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={courseGradeLevel}
                onChange={(e) => setCourseGradeLevel(e.target.value as 'SD' | 'SMP' | 'SMK')}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="SD">SD</option>
                <option value="SMP">SMP</option>
                <option value="SMK">SMK</option>
              </select>
            </>
          )}

          {contentType === 'modules' && (
            <>
              <select
                value={moduleCourseId}
                onChange={(e) => setModuleCourseId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {courses.length === 0 && (
                  <option value="">{t('Belum ada course', 'No courses yet')}</option>
                )}
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title} ({course.grade_level})
                  </option>
                ))}
              </select>
              <input
                value={moduleTitle}
                onChange={(e) => setModuleTitle(e.target.value)}
                placeholder={t('Judul module', 'Module title')}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  value={moduleSequence}
                  onChange={(e) => setModuleSequence(Number(e.target.value))}
                  placeholder={t('urutan_modul', 'sequence_order')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={moduleMastery}
                  onChange={(e) => setModuleMastery(Number(e.target.value))}
                  placeholder={t('batas_mastery', 'mastery_threshold')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  value={modulePhase}
                  onChange={(e) => setModulePhase(e.target.value)}
                  placeholder={t('phase (metadata)', 'phase (metadata)')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={moduleSubject}
                  onChange={(e) => setModuleSubject(e.target.value)}
                  placeholder={t('subject (metadata)', 'subject (metadata)')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={moduleTrack}
                  onChange={(e) => setModuleTrack(e.target.value)}
                  placeholder={t('track (metadata, opsional)', 'track (metadata, optional)')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </>
          )}

          {contentType === 'lessons' && (
            <>
              <select
                value={lessonModuleId}
                onChange={(e) => setLessonModuleId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {modules.length === 0 && (
                  <option value="">{t('Belum ada module', 'No modules yet')}</option>
                )}
                {modules.map((module) => (
                  <option key={module.id} value={module.id}>
                    #{module.sequence_order} - {module.title}
                  </option>
                ))}
              </select>
              <input
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder={t('Judul lesson', 'Lesson title')}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value as 'VIDEO' | 'ARTICLE' | 'INTERACTIVE')}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="VIDEO">VIDEO</option>
                <option value="ARTICLE">ARTICLE</option>
                <option value="INTERACTIVE">INTERACTIVE</option>
              </select>
              <input
                value={lessonContentUrl}
                onChange={(e) => setLessonContentUrl(e.target.value)}
                placeholder={t('content_url (opsional)', 'content_url (optional)')}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={lessonCode}
                  onChange={(e) => setLessonCode(e.target.value)}
                  placeholder={t('code (metadata, contoh 7M.1)', 'code (metadata)')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  value={lessonBenchmark}
                  onChange={(e) => setLessonBenchmark(e.target.value)}
                  placeholder={t('benchmark (metadata)', 'benchmark (metadata)')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </>
          )}

          {contentType === 'quizzes' && (
            <>
              <select
                value={quizLessonId}
                onChange={(e) => setQuizLessonId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {lessons.length === 0 && (
                  <option value="">{t('Belum ada lesson', 'No lessons yet')}</option>
                )}
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title} ({lesson.type})
                  </option>
                ))}
              </select>
              <textarea
                value={quizQuestionsJson}
                onChange={(e) => setQuizQuestionsJson(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-28"
              />
            </>
          )}
        </div>

        <button
          onClick={createContent}
          disabled={contentLoading}
          className="mt-4 w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white py-2.5 text-sm font-bold"
        >
          {contentLoading
            ? t('Memproses...', 'Processing...')
            : editingId
              ? t('Simpan Perubahan', 'Save Changes')
              : t('Tambah Konten', 'Create Content')}
        </button>
        {editingId && (
          <button
            onClick={() => setEditingId(null)}
            className="mt-2 w-full rounded-xl border border-slate-200 text-slate-600 py-2 text-xs font-semibold"
          >
            {t('Batal Edit', 'Cancel Edit')}
          </button>
        )}

        {contentMessage && (
          <p className="mt-2 text-xs font-semibold text-slate-600">{contentMessage}</p>
        )}

        <div className="mt-4 p-3 rounded-xl border border-slate-200 bg-slate-50">
          <p className="text-xs font-bold text-slate-700 mb-2">
            {t('Konten Terbaru', 'Recent Items')}
          </p>
          <input
            value={recentSearch}
            onChange={(e) => setRecentSearch(e.target.value)}
            placeholder={t('Cari item (title/code/metadata)...', 'Search item (title/code/metadata)...')}
            className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
          />
          <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
            <span>{t('Item per halaman', 'Items per page')}</span>
            <select
              value={recentPageSize}
              onChange={(e) => setRecentPageSize(Number(e.target.value) as 20 | 50 | 100)}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] bg-white"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>{t('Urutkan', 'Sort')}</span>
            <select
              value={recentSort}
              onChange={(e) =>
                setRecentSort(
                  e.target.value as
                    | 'newest'
                    | 'oldest'
                    | 'title_asc'
                    | 'title_desc'
                    | 'code_asc'
                    | 'code_desc',
                )
              }
              className="rounded border border-slate-200 px-2 py-1 text-[11px] bg-white"
            >
              <option value="newest">{t('Terbaru', 'Newest')}</option>
              <option value="oldest">{t('Terlama', 'Oldest')}</option>
              <option value="title_asc">{t('Title A-Z', 'Title A-Z')}</option>
              <option value="title_desc">{t('Title Z-A', 'Title Z-A')}</option>
              <option value="code_asc">{t('Code A-Z', 'Code A-Z')}</option>
              <option value="code_desc">{t('Code Z-A', 'Code Z-A')}</option>
            </select>
            <button
              type="button"
              onClick={expandCurrentPage}
              title={t('Buka detail JSON semua item di halaman ini', 'Expand JSON details for current page')}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
            >
              {t('Expand all', 'Expand all')}
            </button>
            <button
              type="button"
              onClick={collapseCurrentPage}
              title={t('Tutup detail JSON semua item di halaman ini', 'Collapse JSON details for current page')}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
            >
              {t('Collapse all', 'Collapse all')}
            </button>
            <button
              type="button"
              onClick={() => toggleSelectCurrentPage(true)}
              title={t('Pilih semua item di halaman ini', 'Select all items in current page')}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900"
            >
              {t('Select page', 'Select page')}
            </button>
            <button
              type="button"
              onClick={() => toggleSelectCurrentPage(false)}
              title={t('Hapus pilihan item di halaman ini', 'Clear selected items in current page')}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900"
            >
              {t('Clear page', 'Clear page')}
            </button>
            <button
              type="button"
              onClick={() => toggleSelectAllFiltered(true)}
              title={t('Pilih semua item hasil filter lintas halaman', 'Select all filtered items across pages')}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900"
            >
              {t('Select filtered', 'Select filtered')}
            </button>
            <button
              type="button"
              onClick={() => toggleSelectAllFiltered(false)}
              title={t('Hapus pilihan semua item hasil filter', 'Clear all filtered selections')}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900"
            >
              {t('Clear filtered', 'Clear filtered')}
            </button>
            <button
              type="button"
              onClick={downloadSelectedJson}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900"
            >
              {t('Download selected', 'Download selected')}
            </button>
            <button
              type="button"
              onClick={downloadSelectedCsv}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900"
            >
              {t('Download selected CSV', 'Download selected CSV')}
            </button>
            <button
              type="button"
              onClick={() => setShowCsvColumns((v) => !v)}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900"
            >
              {showCsvColumns ? t('Sembunyikan kolom CSV', 'Hide CSV columns') : t('Pilih kolom CSV', 'Choose CSV columns')}
            </button>
            <span>
              {t('Terpilih', 'Selected')}: {selectedCount} / {visibleRecentItems.length}
            </span>
          </div>
          {showCsvColumns && (
            <div className="mb-2 rounded border border-slate-200 bg-white p-2">
              <p className="mb-1 text-[11px] font-semibold text-slate-600">
                {t('Kolom CSV', 'CSV columns')}
              </p>
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => applyCsvPreset('minimal')}
                  className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:text-violet-900"
                >
                  {t('Preset Minimal', 'Preset Minimal')}
                </button>
                <button
                  type="button"
                  onClick={() => applyCsvPreset('curriculum')}
                  className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:text-violet-900"
                >
                  {t('Preset Curriculum', 'Preset Curriculum')}
                </button>
                <button
                  type="button"
                  onClick={() => applyCsvPreset('audit')}
                  className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:text-violet-900"
                >
                  {t('Preset Audit Full', 'Preset Audit Full')}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-[11px] text-slate-600">
                {CSV_COLUMN_KEYS.map((key) => (
                  <label key={key} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={Boolean(csvColumns[key])}
                      onChange={(e) =>
                        setCsvColumns((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                    />
                    {key}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {pagedRecentItems.length === 0 && (
              <p className="text-xs text-slate-400">{t('Belum ada data.', 'No data yet.')}</p>
            )}
            {pagedRecentItems.map((item, idx) => (
              <div key={`${String(item.id ?? idx)}`} className="text-xs text-slate-600 border-b border-slate-200 pb-1">
                {(() => {
                  const rowKey = getRecentKey(item, idx)
                  const pretty = JSON.stringify(item, null, 2)
                  const isExpanded = Boolean(expandedRecent[rowKey])
                  const preview = pretty.length > 220 ? `${pretty.slice(0, 220)}...` : pretty
                  return (
                    <>
                      <label className="mb-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedRecent[rowKey])}
                          onChange={(e) =>
                            setSelectedRecent((prev) => ({ ...prev, [rowKey]: e.target.checked }))
                          }
                        />
                        {t('Pilih item', 'Select item')}
                      </label>
                      <div className="mb-1">
                        <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-4">
                          {isExpanded ? pretty : preview}
                        </pre>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRecent((prev) => ({ ...prev, [rowKey]: !isExpanded }))
                          }
                          className="mt-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
                        >
                          {isExpanded ? t('Ringkas', 'Collapse') : t('Lihat detail', 'Expand')}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void copyText(`id-${String(item.id ?? idx)}`, String(item.id ?? ''))}
                          className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold"
                        >
                          {copiedLabel === `id-${String(item.id ?? idx)}` ? t('ID tersalin', 'ID copied') : t('Copy ID', 'Copy ID')}
                        </button>
                        <button
                          onClick={() => void copyText(`title-${String(item.id ?? idx)}`, String(item.title ?? ''))}
                          className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold"
                        >
                          {copiedLabel === `title-${String(item.id ?? idx)}`
                            ? t('Title tersalin', 'Title copied')
                            : t('Copy title', 'Copy title')}
                        </button>
                        <button
                          onClick={() =>
                            void copyText(
                              `code-${String(item.id ?? idx)}`,
                              getMetadataValue(item, 'code'),
                            )
                          }
                          className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold"
                        >
                          {copiedLabel === `code-${String(item.id ?? idx)}`
                            ? t('Code tersalin', 'Code copied')
                            : t('Copy code', 'Copy code')}
                        </button>
                        <button
                          onClick={() =>
                            void copyText(
                              `json-${String(item.id ?? idx)}`,
                              JSON.stringify(item, null, 2),
                            )
                          }
                          className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold"
                        >
                          {copiedLabel === `json-${String(item.id ?? idx)}`
                            ? t('JSON tersalin', 'JSON copied')
                            : t('Copy JSON', 'Copy JSON')}
                        </button>
                        <button
                          onClick={() => downloadItemJson(item, idx)}
                          className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold"
                        >
                          {t('Download JSON', 'Download JSON')}
                        </button>
                        <button
                          onClick={() => startEdit(item)}
                          className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold"
                        >
                          {t('Edit', 'Edit')}
                        </button>
                        <button
                          onClick={() => void removeContent(String(item.id ?? ''))}
                          className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold"
                        >
                          {t('Hapus', 'Delete')}
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {t('Halaman', 'Page')} {recentPage} / {recentTotalPages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={recentPage <= 1}
                onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
                className="px-2 py-0.5 rounded border border-slate-200 disabled:opacity-40"
              >
                {t('Prev', 'Prev')}
              </button>
              <button
                type="button"
                disabled={recentPage >= recentTotalPages}
                onClick={() => setRecentPage((p) => Math.min(recentTotalPages, p + 1))}
                className="px-2 py-0.5 rounded border border-slate-200 disabled:opacity-40"
              >
                {t('Next', 'Next')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
