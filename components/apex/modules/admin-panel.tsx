'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shield, Save, UserPlus, CheckCircle2, XCircle } from 'lucide-react'
import { useApex } from '../apex-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { ConfirmActionModal } from '../shared/confirm-action-modal'

type ContentType = 'courses' | 'modules' | 'lessons' | 'quizzes'

const CONTENT_FLOW: ContentType[] = ['courses', 'modules', 'lessons', 'quizzes']

const DEFAULT_QUIZ_LEGACY_JSON = `[\n  {\n    "question": "Hasil dari 6 + 5?",\n    "options": ["9", "10", "11", "12"],\n    "answer": "C",\n    "hint": "Jumlahkan dari kiri ke kanan."\n  }\n]`

const DEFAULT_QUIZ_BANK_JSON = '[]'

function typeToWizardStep(ct: ContentType): 1 | 2 | 3 | 4 {
  const i = CONTENT_FLOW.indexOf(ct)
  return (i >= 0 ? i + 1 : 1) as 1 | 2 | 3 | 4
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  )
}

/** Baris CSV yang diawali # diabaikan saat upload (boleh dihapus manual jika lebih rapi). */
function csvDataLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
}

/** Salin metadata JSONB agar kunci selain phase/subject/track (modul) tidak hilang saat simpan. */
function cloneMetadataRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return { ...(raw as Record<string, unknown>) }
}

function metadataText(raw: unknown, key: string): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
  const value = (raw as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}
type CourseItem = {
  id: string
  title: string
  grade_level: 'SD' | 'SMP' | 'SMK'
  mastery_threshold?: number | null
}
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

type AdminHealthSummary = {
  modulesWithoutLesson: number
  quizEmptyIssues: number
  lockReasonMismatch: number | null
  checkedAt: string
}

type GradeArchiveSummary = {
  totalArchives: number
  archivedLessonProgress: number
  archivedAssessmentAttempts: number
  checkedAt: string
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
  const [contentEntryMode, setContentEntryMode] = useState<'wizard' | 'tabs'>('wizard')
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentMessage, setContentMessage] = useState<string | null>(null)
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [modules, setModules] = useState<ModuleItem[]>([])
  const [lessons, setLessons] = useState<LessonItem[]>([])

  const [courseTitle, setCourseTitle] = useState('')
  const [courseGradeLevel, setCourseGradeLevel] = useState<'SD' | 'SMP' | 'SMK'>('SMP')
  const [courseMasteryThreshold, setCourseMasteryThreshold] = useState<string>('')

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
  /** Kunci metadata modul selain phase/subject/track (scheduleDays, phaseOrder, …). */
  const [moduleMetadataBase, setModuleMetadataBase] = useState<Record<string, unknown>>({})
  /** Kunci metadata lesson selain code/benchmark (topic, …). */
  const [lessonMetadataBase, setLessonMetadataBase] = useState<Record<string, unknown>>({})
  const [lessonCode, setLessonCode] = useState('')
  const [lessonBenchmark, setLessonBenchmark] = useState('')

  const [quizLessonId, setQuizLessonId] = useState('')
  const [quizQuestionsJson, setQuizQuestionsJson] = useState(DEFAULT_QUIZ_LEGACY_JSON)
  const [quizQuestionsPreJson, setQuizQuestionsPreJson] = useState(DEFAULT_QUIZ_BANK_JSON)
  const [quizQuestionsPostJson, setQuizQuestionsPostJson] = useState(DEFAULT_QUIZ_BANK_JSON)
  const [bulkQuizRows, setBulkQuizRows] = useState<
    Array<{
      lesson_id: string
      bank?: string
      question: string
      options: string[]
      answer: string
      hint: string
    }>
  >([])
  const [aiQuizOverwrite, setAiQuizOverwrite] = useState(false)

  const [pendingRegs, setPendingRegs] = useState<PendingReg[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [healthSummary, setHealthSummary] = useState<AdminHealthSummary | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthMessage, setHealthMessage] = useState<string | null>(null)
  const [gradeArchiveSummary, setGradeArchiveSummary] = useState<GradeArchiveSummary | null>(null)
  const [gradeArchiveLoading, setGradeArchiveLoading] = useState(false)
  const [gradeArchiveMessage, setGradeArchiveMessage] = useState<string | null>(null)
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

  const selectedModuleCourse = useMemo(
    () => courses.find((c) => c.id === moduleCourseId) ?? null,
    [courses, moduleCourseId],
  )

  const canonicalPhaseOptions = useMemo(() => {
    const base = ['Level 1', 'Level 2', 'Level 3']
    if (selectedModuleCourse?.grade_level === 'SMK') {
      base.push('Level 4')
    }
    if (modulePhase.trim() && !base.includes(modulePhase.trim())) {
      base.push(modulePhase.trim())
    }
    return base
  }, [modulePhase, selectedModuleCourse?.grade_level])

  const canonicalSubjectOptions = useMemo(() => {
    const grade = selectedModuleCourse?.grade_level ?? 'SMP'
    const map: Record<'SD' | 'SMP' | 'SMK', string[]> = {
      SD: ['Matematika', 'Bahasa Indonesia', 'IPA', 'IPS', 'Bahasa Inggris', 'PPKn'],
      SMP: ['Matematika', 'Bahasa Indonesia', 'IPA', 'IPS', 'Bahasa Inggris', 'Informatika'],
      SMK: ['Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'Produktif', 'Kewirausahaan', 'Informatika'],
    }
    const list = [...map[grade]]
    if (moduleSubject.trim() && !list.includes(moduleSubject.trim())) {
      list.push(moduleSubject.trim())
    }
    return list
  }, [moduleSubject, selectedModuleCourse?.grade_level])

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

  const formatModuleOptionLabel = useCallback(
    (m: ModuleItem) => {
      const c = courses.find((x) => x.id === m.course_id)
      const code = metadataText(m.metadata, 'code')
      const phase = metadataText(m.metadata, 'phase')
      const subject = metadataText(m.metadata, 'subject')
      const courseBit = c
        ? `${c.title} (${c.grade_level})`
        : t('Kursus induk belum terbaca', 'Parent course unavailable')
      const tags = [code, phase, subject].filter(Boolean)
      const tagBit = tags.length > 0 ? ` [${tags.join(' · ')}]` : ''
      return `#${m.sequence_order} · ${m.title}${tagBit} — ${courseBit}`
    },
    [courses, t],
  )

  const formatLessonOptionLabel = useCallback(
    (l: LessonItem) => {
      const mod = modules.find((x) => x.id === l.module_id)
      const code = metadataText(l.metadata, 'code')
      const benchmark = metadataText(l.metadata, 'benchmark')
      const modBit = mod
        ? `#${mod.sequence_order} ${mod.title}`
        : t('Modul induk belum terbaca', 'Parent module unavailable')
      const tags = [code, benchmark].filter(Boolean)
      const tagBit = tags.length > 0 ? ` [${tags.join(' · ')}]` : ''
      return `${l.title} (${l.type})${tagBit} · ${modBit}`
    },
    [modules, t],
  )

  const activeContentType: ContentType = useMemo(() => {
    if (contentEntryMode === 'tabs') return contentType
    return CONTENT_FLOW[(wizardStep - 1) as number] ?? 'courses'
  }, [contentEntryMode, contentType, wizardStep])

  const wizardStepBlockedReason = useMemo(() => {
    if (contentEntryMode !== 'wizard') return null
    if (wizardStep === 2 && courses.length === 0) {
      return t('Langkah 2 butuh minimal satu kursus.', 'Step 2 requires at least one course.')
    }
    if (wizardStep === 3 && modules.length === 0) {
      return t('Langkah 3 butuh minimal satu modul.', 'Step 3 requires at least one module.')
    }
    if (wizardStep === 4 && lessons.length === 0) {
      return t('Langkah 4 butuh minimal satu pelajaran.', 'Step 4 requires at least one lesson.')
    }
    return null
  }, [contentEntryMode, courses.length, lessons.length, modules.length, t, wizardStep])

  const canEnterWizardStep = useCallback(
    (step: 1 | 2 | 3 | 4) => {
      if (step === 1) return true
      if (step === 2) return courses.length > 0
      if (step === 3) return modules.length > 0
      return lessons.length > 0
    },
    [courses.length, lessons.length, modules.length],
  )

  const goToWizardStep = useCallback(
    (step: 1 | 2 | 3 | 4) => {
      if (!canEnterWizardStep(step)) {
        const msg =
          step === 2
            ? t('Buat kursus dulu sebelum lanjut ke modul.', 'Create a course first before continuing to modules.')
            : step === 3
              ? t('Buat modul dulu sebelum lanjut ke pelajaran.', 'Create a module first before continuing to lessons.')
              : t('Buat pelajaran dulu sebelum lanjut ke kuis.', 'Create a lesson first before continuing to quizzes.')
        setContentMessage(msg)
        return
      }
      setWizardStep(step)
    },
    [canEnterWizardStep, t],
  )

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

  const loadAdminHealth = async () => {
    setHealthLoading(true)
    setHealthMessage(null)
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/admin/health-learning-flow', {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const data = (await res.json()) as {
        summary?: AdminHealthSummary
        message?: string
      }
      if (!res.ok) throw new Error(data.message ?? t('Gagal memuat health check.', 'Failed to load health check.'))
      setHealthSummary(data.summary ?? null)
    } catch (error) {
      setHealthMessage(error instanceof Error ? error.message : t('Gagal memuat health check.', 'Failed to load health check.'))
    } finally {
      setHealthLoading(false)
    }
  }

  const loadGradeArchiveHealth = async () => {
    setGradeArchiveLoading(true)
    setGradeArchiveMessage(null)
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/admin/grade-change-archives', {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const data = (await res.json()) as {
        summary?: GradeArchiveSummary
        message?: string
      }
      if (!res.ok) {
        throw new Error(
          data.message ?? t('Gagal memuat arsip perubahan jenjang.', 'Failed to load grade-change archives.'),
        )
      }
      setGradeArchiveSummary(data.summary ?? null)
    } catch (error) {
      setGradeArchiveMessage(
        error instanceof Error
          ? error.message
          : t('Gagal memuat arsip perubahan jenjang.', 'Failed to load grade-change archives.'),
      )
    } finally {
      setGradeArchiveLoading(false)
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

  const loadItems = async (type: ContentType): Promise<Array<Record<string, unknown>>> => {
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
      const list = data.items ?? []
      setItems(list)
      return list
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('Gagal memuat konten', 'Failed to load content'))
      return []
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
    const typeLabel = String(activeContentType ?? 'content').toLowerCase()
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
      type: activeContentType,
      exported_at: new Date().toISOString(),
      count: selectedItems.length,
      items: selectedItems,
    }
    const filename = `apex-${String(activeContentType).toLowerCase()}-selected-${Date.now()}.json`
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
    const filename = `apex-${String(activeContentType).toLowerCase()}-selected-${Date.now()}.csv`
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
    void loadItems(activeContentType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContentType, filterPhase, filterSubject, filterTrack, filterCode, filterBenchmark])

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
  }, [activeContentType, recentSearch, recentPageSize, recentSort, filterPhase, filterSubject, filterTrack, filterCode, filterBenchmark])

  useEffect(() => {
    setSelectedRecent({})
  }, [activeContentType, recentSearch, recentPageSize, recentSort, filterPhase, filterSubject, filterTrack, filterCode, filterBenchmark])

  useEffect(() => {
    if (recentPage > recentTotalPages) setRecentPage(recentTotalPages)
  }, [recentPage, recentTotalPages])

  useEffect(() => {
    if (activeContentType === 'modules') void loadFilterCatalog('modules')
    if (activeContentType === 'lessons') void loadFilterCatalog('lessons')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContentType])

  useEffect(() => {
    void loadPendingRegs()
    void loadAdminHealth()
    void loadGradeArchiveHealth()
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

  useEffect(() => {
    if (activeContentType !== 'quizzes') return
    void (async () => {
      try {
        await loadLessons()
      } catch {
        /* dropdown falls back to whatever is already loaded */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContentType])

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

  const buildPayload = (type: ContentType): Record<string, unknown> => {
    if (type === 'courses') {
      const raw = courseMasteryThreshold.trim()
      const threshold = raw.length > 0 ? Number(raw) : null
      return {
        title: courseTitle,
        grade_level: courseGradeLevel,
        mastery_threshold: Number.isFinite(threshold) ? threshold : null,
      }
    }
    if (type === 'modules') {
      const meta = cloneMetadataRecord(moduleMetadataBase)
      const ph = modulePhase.trim()
      const sub = moduleSubject.trim()
      const tr = moduleTrack.trim()
      if (ph) meta.phase = ph
      else delete meta.phase
      if (sub) meta.subject = sub
      else delete meta.subject
      if (tr) meta.track = tr
      else delete meta.track
      return {
        course_id: moduleCourseId,
        title: moduleTitle,
        sequence_order: moduleSequence,
        mastery_threshold: moduleMastery,
        metadata: meta,
      }
    }
    if (type === 'lessons') {
      const meta = cloneMetadataRecord(lessonMetadataBase)
      const code = lessonCode.trim()
      const bench = lessonBenchmark.trim()
      if (code) meta.code = code
      else delete meta.code
      if (bench) meta.benchmark = bench
      else delete meta.benchmark
      return {
        module_id: lessonModuleId,
        title: lessonTitle,
        type: lessonType,
        content_url: lessonContentUrl,
        metadata: meta,
      }
    }
    let legacy: unknown
    let pre: unknown
    let post: unknown
    try {
      legacy = JSON.parse(quizQuestionsJson)
      pre = JSON.parse(quizQuestionsPreJson)
      post = JSON.parse(quizQuestionsPostJson)
    } catch {
      throw new Error(
        t('JSON soal tidak valid (legacy / PRE / POST).', 'Invalid quiz JSON (legacy / PRE / POST).'),
      )
    }
    if (!Array.isArray(legacy) || !Array.isArray(pre) || !Array.isArray(post)) {
      throw new Error(
        t('Soal harus berupa array JSON di ketiga kolom.', 'Each quiz field must be a JSON array.'),
      )
    }
    return {
      lesson_id: quizLessonId,
      questions: legacy,
      questions_pre: pre,
      questions_post: post,
    }
  }

  const validateContentPayload = (type: ContentType, payload: Record<string, unknown>): string | null => {
    if (type === 'lessons') {
      const moduleId = String(payload.module_id ?? '').trim()
      const title = String(payload.title ?? '').trim()
      const lessonType = String(payload.type ?? '').trim()
      if (!moduleId) return t('Pilih modul induk terlebih dahulu.', 'Select a parent module first.')
      if (!isUuid(moduleId)) return t('ID modul tidak valid (harus UUID).', 'Invalid module id (must be UUID).')
      if (!title) return t('Judul pelajaran wajib diisi.', 'Lesson title is required.')
      if (!['VIDEO', 'ARTICLE', 'INTERACTIVE'].includes(lessonType)) {
        return t('Tipe pelajaran tidak valid.', 'Invalid lesson type.')
      }
    }
    if (type === 'modules') {
      const courseId = String(payload.course_id ?? '').trim()
      if (!courseId) return t('Pilih kursus induk terlebih dahulu.', 'Select a parent course first.')
      if (!isUuid(courseId)) return t('ID kursus tidak valid (harus UUID).', 'Invalid course id (must be UUID).')
    }
    if (type === 'quizzes') {
      const lessonId = String(payload.lesson_id ?? '').trim()
      if (!lessonId) return t('Pilih lesson untuk kuis terlebih dahulu.', 'Select a lesson for quiz first.')
      if (!isUuid(lessonId)) return t('ID lesson tidak valid (harus UUID).', 'Invalid lesson id (must be UUID).')
    }
    return null
  }

  const createContent = async () => {
    setContentLoading(true)
    setContentMessage(null)
    try {
      const accessToken = await getAccessToken()
      const payload = buildPayload(contentType)
      const payloadError = validateContentPayload(contentType, payload)
      if (payloadError) throw new Error(payloadError)
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
      if (!isEditing) {
        if (contentType === 'modules') setModuleMetadataBase({})
        if (contentType === 'lessons') setLessonMetadataBase({})
      }
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

  const wizardSubmit = async () => {
    if (editingId) {
      setContentMessage(
        t('Batalkan edit di daftar bawah atau pindah ke Mode tab.', 'Cancel the edit below or switch to Tab mode.'),
      )
      return
    }
    if (wizardStepBlockedReason) {
      setContentMessage(wizardStepBlockedReason)
      return
    }
    setContentLoading(true)
    setContentMessage(null)
    try {
      const accessToken = await getAccessToken()
      const type = activeContentType
      const payload = buildPayload(type)
      const payloadError = validateContentPayload(type, payload)
      if (payloadError) throw new Error(payloadError)
      const res = await fetch('/api/admin/content', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ type, payload }),
      })
      const data = (await res.json()) as { id?: string; message?: string }
      if (!res.ok) throw new Error(data.message ?? t('Gagal menyimpan konten', 'Failed to save content'))

      const newId = data.id ? String(data.id) : ''
      const nextCourseId = type === 'courses' && newId ? newId : moduleCourseId
      const nextModuleId = type === 'modules' && newId ? newId : lessonModuleId

      if (type === 'courses' && newId) setModuleCourseId(newId)
      if (type === 'modules' && newId) setLessonModuleId(newId)
      if (type === 'lessons' && newId) setQuizLessonId(newId)

      setContentMessage(
        wizardStep < 4
          ? t('Berhasil. Lanjut ke langkah berikutnya.', 'Saved. Continue to the next step.')
          : t('Kuis berhasil disimpan.', 'Quiz saved successfully.'),
      )

      await loadItems(type)
      if (type === 'modules') await loadFilterCatalog('modules')
      if (type === 'lessons') await loadFilterCatalog('lessons')
      await loadCourses()
      await loadModules(nextCourseId || undefined)
      await loadLessons(nextModuleId || undefined)
      if (type === 'lessons') {
        try {
          await loadLessons()
        } catch {
          /* ignore */
        }
      }

      if (wizardStep < 4) {
        setWizardStep((s) => Math.min(4, s + 1) as 1 | 2 | 3 | 4)
      }
      if (type === 'modules') setModuleMetadataBase({})
      if (type === 'lessons') setLessonMetadataBase({})
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('Gagal menyimpan konten', 'Failed to save content'))
    } finally {
      setContentLoading(false)
    }
  }

  const getTemplatePayload = (type: ContentType): Record<string, unknown> => {
    const petunjukUmumJson = t(
      'Field yang namanya diawali _apex_ hanya penjelasan untuk manusia. Boleh dihapus dari file; sistem mengabaikannya. Setelah mengisi, pilih Upload Template JSON pada jenis konten yang sama, lalu simpan lewat Wizard atau Tab.',
      'Keys starting with _apex_ are human-readable notes only. You may delete them; the system ignores them. After editing, use Upload Template JSON on the matching content type, then save via Wizard or Tabs.',
    )

    if (type === 'courses') {
      return {
        _apex_petunjuk_id: [
          petunjukUmumJson,
          '',
          'Wajib:',
          '- title: nama kursus (mis. "IPA SMP 2024").',
          '- grade_level: tepat salah satu huruf besar SD, SMP, atau SMK (menentukan siswa mana yang melihat modul ini).',
          '- mastery_threshold: opsional 0..100. Jika kosong, sistem fallback ke threshold modul lalu 80.',
          '',
          'Tidak perlu mengisi ID — kursus baru akan dapat ID otomatis setelah disimpan.',
        ].join('\n'),
        _apex_petunjuk_en: [
          petunjukUmumJson,
          '',
          'Required:',
          '- title: course name (e.g. "Science JHS 2024").',
          '- grade_level: exactly SD, SMP, or SMK (uppercase) — matches student grade.',
          '- mastery_threshold: optional 0..100. If empty, system falls back to module threshold then 80.',
          '',
          'No ID needed — a new id is created when you save.',
        ].join('\n'),
        title: 'Contoh: Matematika SMP — Semester 1',
        grade_level: 'SMP',
        mastery_threshold: 80,
      }
    }
    if (type === 'modules') {
      return {
        _apex_petunjuk_id: [
          petunjukUmumJson,
          '',
          'Wajib:',
          '- course_id: UUID kursus induk. Salin dari daftar "Konten Terbaru" (jenis courses) atau dari database.',
          '- title: judul bab/modul.',
          '- sequence_order: angka urutan di dalam kursus (1, 2, 3, …).',
          '- mastery_threshold: batas lulus post-test dalam persen (biasanya 80).',
          '',
          'Opsional (metadata): level, subject, track — untuk filter admin dan gating level. Kosongkan string jika tidak dipakai.',
        ].join('\n'),
        _apex_petunjuk_en: [
          petunjukUmumJson,
          '',
          'Required:',
          '- course_id: parent course UUID (copy from Recent Items for courses or your DB).',
          '- title: module/chapter title.',
          '- sequence_order: order inside the course (1, 2, 3, …).',
          '- mastery_threshold: post-test pass percent (usually 80).',
          '',
          'Optional metadata: level, subject, track — for admin filters / level gating. Use empty string if unused.',
        ].join('\n'),
        course_id: 'GANTI_DENGAN_UUID_KURSUS',
        title: 'Contoh: Bilangan Bulat',
        sequence_order: 1,
        mastery_threshold: 80,
        metadata: {
          phase: 'Level 1',
          subject: 'Matematika',
          track: '',
        },
      }
    }
    if (type === 'lessons') {
      return {
        _apex_petunjuk_id: [
          petunjukUmumJson,
          '',
          'Wajib:',
          '- module_id: UUID modul induk.',
          '- title: judul pelajaran (untuk pre/post test, gunakan judul jelas mis. "Pre-test: …" / "Post-test: …").',
          '- type: salah satu persis: VIDEO, ARTICLE, atau INTERACTIVE (huruf besar).',
          '',
          'Opsional:',
          '- content_url: tautan video/artikel.',
          '- metadata.code / metadata.benchmark: kode kurikulum (boleh dikosongkan).',
        ].join('\n'),
        _apex_petunjuk_en: [
          petunjukUmumJson,
          '',
          'Required:',
          '- module_id: parent module UUID.',
          '- title: lesson title (for pre/post, use clear names like "Pre-test: …").',
          '- type: exactly VIDEO, ARTICLE, or INTERACTIVE (uppercase).',
          '',
          'Optional:',
          '- content_url: link to material.',
          '- metadata.code / metadata.benchmark: curriculum codes (may be empty).',
        ].join('\n'),
        module_id: 'GANTI_DENGAN_UUID_MODUL',
        title: 'Contoh: Pre-test — Bilangan Bulat',
        type: 'ARTICLE',
        content_url: 'https://contoh.com/materi',
        metadata: {
          code: '7.M.1',
          benchmark: 'Cambridge LS1',
        },
      }
    }
    return {
      _apex_petunjuk_id: [
        petunjukUmumJson,
        '',
        'Wajib:',
        '- lesson_id: UUID pelajaran yang akan diberi soal (biasanya lesson pre atau post).',
        '- questions: array legacy (fallback jika questions_pre & questions_post kosong).',
        '',
        'Opsional (disarankan untuk pre/post terpisah):',
        '- questions_pre: array soal PRE (boleh [] jika tidak dipakai).',
        '- questions_post: array soal POST (boleh [] jika tidak dipakai).',
        '',
        'Tiap soal punya: question, options (4 string), answer (A–D), hint.',
        'Satu baris quiz per lesson. Untuk banyak lesson, ulangi atau pakai CSV Bulk Quiz (kolom opsional bank: kosong=legacy, pre, post).',
      ].join('\n'),
      _apex_petunjuk_en: [
        petunjukUmumJson,
        '',
        'Required:',
        '- lesson_id: UUID of the lesson to attach questions to (often pre or post).',
        '- questions: legacy array (fallback when questions_pre & questions_post are empty).',
        '',
        'Optional (recommended for split PRE/POST):',
        '- questions_pre: PRE bank (may be []).',
        '- questions_post: POST bank (may be []).',
        '',
        'Each item: question, options (4 strings), answer (A–D), hint.',
        'One quiz row per lesson. For many lessons use Bulk Quiz CSV (optional bank column: empty=legacy, pre, post).',
      ].join('\n'),
      lesson_id: 'GANTI_DENGAN_UUID_LESSON',
      questions: [
        {
          question: 'Hasil dari 12 + 8 adalah?',
          options: ['18', '20', '22', '24'],
          answer: 'B',
          hint: 'Jumlahkan satuan per satuan.',
        },
        {
          question: 'Manakah yang termasuk bilangan prima?',
          options: ['4', '9', '11', '15'],
          answer: 'C',
          hint: 'Prima hanya habis dibagi 1 dan dirinya sendiri.',
        },
      ],
      questions_pre: [],
      questions_post: [],
    }
  }

  const downloadTemplate = () => {
    const payload = getTemplatePayload(activeContentType)
    const json = JSON.stringify(payload, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `apex-${activeContentType}-template.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const uploadTemplate = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Record<string, unknown>

      if (activeContentType === 'courses') {
        setCourseTitle(String(parsed.title ?? ''))
        const grade = String(parsed.grade_level ?? 'SMP')
        if (grade === 'SD' || grade === 'SMP' || grade === 'SMK') setCourseGradeLevel(grade)
        const threshold = Number(parsed.mastery_threshold)
        setCourseMasteryThreshold(Number.isFinite(threshold) ? String(threshold) : '')
      } else if (activeContentType === 'modules') {
        setModuleCourseId(String(parsed.course_id ?? ''))
        setModuleTitle(String(parsed.title ?? ''))
        setModuleSequence(Number(parsed.sequence_order ?? 1))
        setModuleMastery(Number(parsed.mastery_threshold ?? 80))
        const metadata = (parsed.metadata ?? parsed.meta ?? {}) as Record<string, unknown>
        setModuleMetadataBase(cloneMetadataRecord(metadata))
        setModulePhase(String(metadata.phase ?? ''))
        setModuleSubject(String(metadata.subject ?? ''))
        setModuleTrack(String(metadata.track ?? ''))
      } else if (activeContentType === 'lessons') {
        setLessonModuleId(String(parsed.module_id ?? ''))
        setLessonTitle(String(parsed.title ?? ''))
        const lType = String(parsed.type ?? 'ARTICLE')
        if (lType === 'VIDEO' || lType === 'ARTICLE' || lType === 'INTERACTIVE') setLessonType(lType)
        setLessonContentUrl(String(parsed.content_url ?? ''))
        const metadata = (parsed.metadata ?? parsed.meta ?? {}) as Record<string, unknown>
        setLessonMetadataBase(cloneMetadataRecord(metadata))
        setLessonCode(String(metadata.code ?? ''))
        setLessonBenchmark(String(metadata.benchmark ?? ''))
      } else {
        setQuizLessonId(String(parsed.lesson_id ?? ''))
        setQuizQuestionsJson(JSON.stringify(parsed.questions ?? [], null, 2))
        setQuizQuestionsPreJson(JSON.stringify(parsed.questions_pre ?? [], null, 2))
        setQuizQuestionsPostJson(JSON.stringify(parsed.questions_post ?? [], null, 2))
      }

      setContentMessage(t('Template berhasil diunggah.', 'Template uploaded successfully.'))
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('Template tidak valid', 'Invalid template'))
    }
  }

  const downloadQuizCsvTemplate = () => {
    const csv =
      '# ============================================================\n' +
      '# PETUNJUK (Bahasa Indonesia)\n' +
      '# - Baris yang diawali # boleh dihapus atau dibiarkan; saat upload baris ini DIABAICAN.\n' +
      '# - Baris PERTAMA setelah komentar harus tepat header kolom (satu baris).\n' +
      '# - Kolom answer = huruf A, B, C, atau D (bukan kalimat jawaban).\n' +
      '# - Satu file = mengisi form satu kuis untuk satu lesson (pilih lesson di admin lalu simpan).\n' +
      '# ------------------------------------------------------------\n' +
      '# INSTRUCTIONS (English)\n' +
      '# - # lines are skipped on upload (optional to delete).\n' +
      '# - First non-# row must be the header exactly as below.\n' +
      '# - answer column = A, B, C, or D only.\n' +
      '# ============================================================\n' +
      'question,option_a,option_b,option_c,option_d,answer,hint\n' +
      '"Berapa hasil 3 x 4?","10","11","12","13","C","Kalikan bertahap."\n'
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
      '# ============================================================\n' +
      '# BULK QUIZ — banyak soal sekaligus, bisa untuk banyak lesson\n' +
      '# - lesson_id = UUID lesson (sama untuk beberapa baris jika banyak soal untuk lesson yang sama).\n' +
      '# - bank (opsional): kosong / legacy → kolom questions; pre → questions_pre; post → questions_post.\n' +
      '# - Hanya bank yang punya baris di CSV yang ditimpa; bank lain di DB tidak diubah.\n' +
      '# - Baris # diabaikan saat upload.\n' +
      '# EN: optional bank: empty or legacy → questions; pre → questions_pre; post → questions_post.\n' +
      '# ============================================================\n' +
      'lesson_id,bank,question,option_a,option_b,option_c,option_d,answer,hint\n' +
      '"GANTI_UUID_LESSON_SATU","","Soal legacy 1?","A1","B1","C1","D1","A","Hint 1"\n' +
      '"GANTI_UUID_LESSON_SATU","pre","Soal PRE 1?","A2","B2","C2","D2","B","Hint 2"\n' +
      '"GANTI_UUID_LESSON_SATU","post","Soal POST 1?","A3","B3","C3","D3","C","Hint 3"\n' +
      '"GANTI_UUID_LESSON_LAIN","post","Hanya post untuk lesson lain","X1","X2","X3","X4","D",""\n'
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
      const lines = csvDataLines(text)
      if (lines.length < 2) throw new Error(t('CSV kosong atau tidak valid', 'CSV is empty or invalid'))

      const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
      const required = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'answer', 'hint']
      const missing = required.filter((k) => !header.includes(k))
      if (missing.length > 0) {
        throw new Error(t(`Header CSV kurang: ${missing.join(', ')}`, `CSV header missing: ${missing.join(', ')}`))
      }

      const idx = (key: string) => header.indexOf(key)
      const questions = lines
        .slice(1)
        .map((line) => {
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
        .filter((q) => q.question.trim().length > 0)

      setQuizQuestionsJson(JSON.stringify(questions, null, 2))
      setContentMessage(t('CSV quiz berhasil diunggah.', 'Quiz CSV uploaded successfully.'))
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('CSV tidak valid', 'Invalid CSV'))
    }
  }

  const uploadBulkQuizCsv = async (file: File) => {
    try {
      const text = await file.text()
      const lines = csvDataLines(text)
      if (lines.length < 2) throw new Error(t('CSV bulk quiz kosong atau tidak valid', 'Bulk quiz CSV is empty or invalid'))

      const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
      const required = ['lesson_id', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'answer', 'hint']
      const missing = required.filter((k) => !header.includes(k))
      if (missing.length > 0) throw new Error(t(`Header CSV kurang: ${missing.join(', ')}`, `CSV header missing: ${missing.join(', ')}`))

      const idx = (key: string) => header.indexOf(key)
      const hasBank = header.includes('bank')
      const rows = lines
        .slice(1)
        .map((line) => {
          const cols = parseCsvLine(line)
          const answer = (cols[idx('answer')] || '').toUpperCase()
          const optionA = cols[idx('option_a')] || ''
          const optionB = cols[idx('option_b')] || ''
          const optionC = cols[idx('option_c')] || ''
          const optionD = cols[idx('option_d')] || ''
          const bankRaw = hasBank ? (cols[idx('bank')] || '').trim() : ''
          return {
            lesson_id: cols[idx('lesson_id')] || '',
            ...(bankRaw ? { bank: bankRaw } : {}),
            question: cols[idx('question')] || '',
            options: [optionA, optionB, optionC, optionD],
            answer: ['A', 'B', 'C', 'D'].includes(answer) ? answer : 'A',
            hint: cols[idx('hint')] || '',
          }
        })
        .filter((r) => r.lesson_id.trim().length > 0 && r.question.trim().length > 0)
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

  const generateAiPrePostQuizzes = async () => {
    if (!quizLessonId.trim()) {
      setContentMessage(t('Pilih lesson dulu.', 'Select a lesson first.'))
      return
    }
    setContentLoading(true)
    setContentMessage(null)
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/admin/lesson-quiz/generate-from-lesson', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ lessonId: quizLessonId, overwrite: aiQuizOverwrite }),
      })
      const data = (await res.json()) as { message?: string; preCount?: number; postCount?: number }
      if (!res.ok) throw new Error(data.message ?? t('Gagal generate quiz AI.', 'AI quiz generation failed.'))
      setContentMessage(
        t(
          `Claude selesai: ${data.preCount ?? 0} soal PRE + ${data.postCount ?? 0} soal POST disimpan (kolom questions_pre / questions_post).`,
          `Claude finished: saved ${data.preCount ?? 0} PRE + ${data.postCount ?? 0} POST questions (questions_pre / questions_post).`,
        ),
      )
      const list = await loadItems('quizzes')
      const row = list.find((q) => String(q.lesson_id ?? '') === quizLessonId)
      if (row) {
        setQuizQuestionsJson(JSON.stringify(row.questions ?? [], null, 2))
        setQuizQuestionsPreJson(JSON.stringify(row.questions_pre ?? [], null, 2))
        setQuizQuestionsPostJson(JSON.stringify(row.questions_post ?? [], null, 2))
      }
    } catch (error) {
      setContentMessage(
        error instanceof Error ? error.message : t('Gagal generate quiz AI.', 'AI quiz generation failed.'),
      )
    } finally {
      setContentLoading(false)
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
    setContentEntryMode('tabs')
    setContentType(activeContentType)
    setEditingId(id)
    if (activeContentType === 'courses') {
      setCourseTitle(String(item.title ?? ''))
      const grade = String(item.grade_level ?? 'SMP')
      if (grade === 'SD' || grade === 'SMP' || grade === 'SMK') setCourseGradeLevel(grade)
      const threshold = Number(item.mastery_threshold)
      setCourseMasteryThreshold(Number.isFinite(threshold) ? String(threshold) : '')
      return
    }
    if (activeContentType === 'modules') {
      setModuleCourseId(String(item.course_id ?? ''))
      setModuleTitle(String(item.title ?? ''))
      setModuleSequence(Number(item.sequence_order ?? 1))
      setModuleMastery(Number(item.mastery_threshold ?? 80))
      const metadata = (item.metadata ?? {}) as Record<string, unknown>
      setModuleMetadataBase(cloneMetadataRecord(metadata))
      setModulePhase(String(metadata.phase ?? ''))
      setModuleSubject(String(metadata.subject ?? ''))
      setModuleTrack(String(metadata.track ?? ''))
      return
    }
    if (activeContentType === 'lessons') {
      setLessonModuleId(String(item.module_id ?? ''))
      setLessonTitle(String(item.title ?? ''))
      const lType = String(item.type ?? 'ARTICLE')
      if (lType === 'VIDEO' || lType === 'ARTICLE' || lType === 'INTERACTIVE') setLessonType(lType)
      setLessonContentUrl(String(item.content_url ?? ''))
      const metadata = (item.metadata ?? {}) as Record<string, unknown>
      setLessonMetadataBase(cloneMetadataRecord(metadata))
      setLessonCode(String(metadata.code ?? ''))
      setLessonBenchmark(String(metadata.benchmark ?? ''))
      return
    }
    setQuizLessonId(String(item.lesson_id ?? ''))
    setQuizQuestionsJson(JSON.stringify(item.questions ?? [], null, 2))
    setQuizQuestionsPreJson(JSON.stringify(item.questions_pre ?? [], null, 2))
    setQuizQuestionsPostJson(JSON.stringify(item.questions_post ?? [], null, 2))
  }

  const removeContent = async (id: string) => {
    if (!id) return
    setContentLoading(true)
    setContentMessage(null)
    try {
      const accessToken = await getAccessToken()
      const res = await fetch(`/api/admin/content?type=${activeContentType}&id=${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${accessToken}` },
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? t('Gagal menghapus konten', 'Failed to delete content'))
      if (editingId === id) setEditingId(null)
      setContentMessage(t('Konten berhasil dihapus.', 'Content deleted successfully.'))
      await loadItems(activeContentType)
      if (activeContentType === 'modules') await loadFilterCatalog('modules')
      if (activeContentType === 'lessons') await loadFilterCatalog('lessons')
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
        <p className="text-xs text-slate-500 mb-3">
          {t(
            'Mode Wizard memandu langkah 1→4 otomatis. Mode Tab untuk edit cepat per jenis. Isi selalu “nempel” ke induk di dropdown.',
            'Wizard mode guides you through steps 1→4. Tab mode is for quick edits per type. Entries always attach to the parent you select in the dropdowns.',
          )}
        </p>

        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50/90 p-4 text-xs text-slate-700 space-y-2">
          <p className="font-bold text-blue-900">
            {t('Alur kurikulum (disarankan berurutan)', 'Curriculum flow (recommended order)')}
          </p>
          <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
            <li>
              <strong>{t('Kursus', 'Course')}</strong> —{' '}
              {t(
                'Wadah per jalur kurikulum + jenjang (SD/SMP/SMK). Contoh: “IPA SMP 2024”.',
                'Container per curriculum line + level (SD/SMP/SMK). E.g. “Science JHS 2024”.',
              )}
            </li>
            <li>
              <strong>{t('Modul', 'Module')}</strong> —{' '}
              {t(
                'Bab di dalam kursus. Urutan = nomor di Learning Hub. Metadata level/mapel dipakai filter admin & gating level.',
                'Chapter inside a course. Order = sequence in Learning Hub. Level/subject metadata powers admin filters & level gating.',
              )}
            </li>
            <li>
              <strong>{t('Pelajaran', 'Lesson')}</strong> —{' '}
              {t(
                'Satu aktivitas (video/artikel/interaktif). Pre-test & post-test = dua pelajaran terpisah dengan judul jelas (mis. “Pre: …” / “Post: …”).',
                'One activity (video/article/interactive). Pre- & post-test = two separate lessons with clear titles (e.g. “Pre: …” / “Post: …”).',
              )}
            </li>
            <li>
              <strong>{t('Kuis', 'Quiz')}</strong> —{' '}
              {t(
                'Soal JSON (atau CSV bulk) untuk satu pelajaran. Biasanya satu kuis untuk lesson pre dan satu lagi untuk lesson post.',
                'JSON questions (or bulk CSV) for one lesson. Usually one quiz on the pre lesson and one on the post lesson.',
              )}
            </li>
          </ol>
        </div>

        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/80 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-sky-900">
              {t('Health ringkas learning flow', 'Learning flow health snapshot')}
            </p>
            <button
              type="button"
              onClick={() => void loadAdminHealth()}
              disabled={healthLoading}
              className="rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700 disabled:opacity-60"
            >
              {healthLoading ? t('Memuat...', 'Loading...') : t('Refresh', 'Refresh')}
            </button>
          </div>
          {healthSummary ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[11px] text-slate-500">{t('Module tanpa lesson', 'Modules without lessons')}</p>
                <p className="text-base font-bold text-slate-800">{healthSummary.modulesWithoutLesson}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[11px] text-slate-500">{t('Quiz kosong/kurang', 'Empty/incomplete quizzes')}</p>
                <p className="text-base font-bold text-slate-800">{healthSummary.quizEmptyIssues}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[11px] text-slate-500">{t('Lock reason mismatch', 'Lock reason mismatch')}</p>
                <p className="text-base font-bold text-slate-800">
                  {healthSummary.lockReasonMismatch == null ? t('N/A', 'N/A') : healthSummary.lockReasonMismatch}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              {t('Belum ada data health. Tekan Refresh.', 'No health data yet. Press Refresh.')}
            </p>
          )}
          {healthSummary?.checkedAt && (
            <p className="text-[11px] text-slate-500">
              {t('Pemeriksaan terakhir:', 'Last check:')} {new Date(healthSummary.checkedAt).toLocaleString()}
            </p>
          )}
          {healthMessage && <p className="text-[11px] font-semibold text-rose-700">{healthMessage}</p>}
        </div>

        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-indigo-900">
              {t('Arsip perubahan jenjang', 'Grade-change archive snapshot')}
            </p>
            <button
              type="button"
              onClick={() => void loadGradeArchiveHealth()}
              disabled={gradeArchiveLoading}
              className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 disabled:opacity-60"
            >
              {gradeArchiveLoading ? t('Memuat...', 'Loading...') : t('Refresh', 'Refresh')}
            </button>
          </div>
          {gradeArchiveSummary ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[11px] text-slate-500">{t('Total event archive', 'Total archive events')}</p>
                <p className="text-base font-bold text-slate-800">{gradeArchiveSummary.totalArchives}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[11px] text-slate-500">{t('Progress lesson diarsipkan', 'Archived lesson progress')}</p>
                <p className="text-base font-bold text-slate-800">{gradeArchiveSummary.archivedLessonProgress}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[11px] text-slate-500">{t('Attempt diarsipkan', 'Archived attempts')}</p>
                <p className="text-base font-bold text-slate-800">{gradeArchiveSummary.archivedAssessmentAttempts}</p>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              {t('Belum ada data arsip. Tekan Refresh.', 'No archive data yet. Press Refresh.')}
            </p>
          )}
          {gradeArchiveSummary?.checkedAt && (
            <p className="text-[11px] text-slate-500">
              {t('Pemeriksaan terakhir:', 'Last check:')}{' '}
              {new Date(gradeArchiveSummary.checkedAt).toLocaleString()}
            </p>
          )}
          {gradeArchiveMessage && <p className="text-[11px] font-semibold text-rose-700">{gradeArchiveMessage}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-600">{t('Mode input', 'Input mode')}</span>
          <button
            type="button"
            onClick={() => {
              setWizardStep(typeToWizardStep(contentType))
              setEditingId(null)
              setContentEntryMode('wizard')
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${contentEntryMode === 'wizard' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600 bg-white'}`}
          >
            {t('Wizard (disarankan)', 'Wizard (recommended)')}
          </button>
          <button
            type="button"
            onClick={() => {
              setContentType(CONTENT_FLOW[wizardStep - 1] ?? 'courses')
              setEditingId(null)
              setContentEntryMode('tabs')
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${contentEntryMode === 'tabs' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600 bg-white'}`}
          >
            {t('Tab (lanjutan)', 'Tabs (advanced)')}
          </button>
        </div>

        {contentEntryMode === 'wizard' && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 space-y-2">
            <p className="text-xs font-bold text-emerald-900">
              {t(`Langkah ${wizardStep} dari 4`, `Step ${wizardStep} of 4`)} —{' '}
              {wizardStep === 1
                ? t('Buat kursus', 'Create course')
                : wizardStep === 2
                  ? t('Tambah modul', 'Add module')
                  : wizardStep === 3
                    ? t('Tambah pelajaran', 'Add lesson')
                    : t('Pasang kuis', 'Attach quiz')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {([1, 2, 3, 4] as const).map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => goToWizardStep(step)}
                  disabled={!canEnterWizardStep(step)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold border ${wizardStep === step ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  {step}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {wizardStep === 1 && courses.length > 0 && (
                <button type="button" className="text-emerald-800 underline font-semibold" onClick={() => goToWizardStep(2)}>
                  {t('Lewati — kursus sudah ada', 'Skip — I already have a course')}
                </button>
              )}
              {wizardStep === 2 && modules.length > 0 && (
                <button type="button" className="text-emerald-800 underline font-semibold" onClick={() => goToWizardStep(3)}>
                  {t('Lewati — modul sudah ada', 'Skip — I already have a module')}
                </button>
              )}
              {wizardStep === 3 && lessons.length > 0 && (
                <button type="button" className="text-emerald-800 underline font-semibold" onClick={() => goToWizardStep(4)}>
                  {t('Lewati — pelajaran sudah ada', 'Skip — I already have lessons')}
                </button>
              )}
            </div>
            {wizardStepBlockedReason && <p className="text-[11px] font-semibold text-amber-700">{wizardStepBlockedReason}</p>}
          </div>
        )}

        {contentEntryMode === 'tabs' && (
          <div className="flex flex-wrap gap-2 mb-4">
            {(['courses', 'modules', 'lessons', 'quizzes'] as ContentType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setContentType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${contentType === type ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 bg-white'}`}
              >
                {type === 'courses'
                  ? t('1 · Kursus', '1 · Courses')
                  : type === 'modules'
                    ? t('2 · Modul', '2 · Modules')
                    : type === 'lessons'
                      ? t('3 · Pelajaran', '3 · Lessons')
                      : t('4 · Kuis', '4 · Quizzes')}
              </button>
            ))}
          </div>
        )}

        {activeContentType === 'modules' && courses.length === 0 && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t(
              'Belum ada kursus. Buka tab “1 · Kursus”, buat minimal satu kursus dulu, lalu kembali ke tab Modul.',
              'No courses yet. Open tab “1 · Courses”, create at least one course, then return to Modules.',
            )}
          </div>
        )}
        {activeContentType === 'lessons' && modules.length === 0 && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t(
              'Belum ada modul. Lengkapi tab Kursus lalu Modul dulu (satu modul per bab).',
              'No modules yet. Complete Courses then Modules first (one module per chapter).',
            )}
          </div>
        )}
        {activeContentType === 'quizzes' && lessons.length === 0 && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t(
              'Belum ada pelajaran. Buat lesson (mis. pre/post) di tab Pelajaran, baru tempel kuis di sini.',
              'No lessons yet. Create lessons (e.g. pre/post) under Lessons, then attach quizzes here.',
            )}
          </div>
        )}

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
          {activeContentType === 'quizzes' && (
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

        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/90 p-3 text-[11px] text-amber-950 space-y-1.5 leading-relaxed">
          <p className="font-bold text-amber-900">
            {t('Petunjuk singkat template unduhan', 'Quick guide: downloaded templates')}
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              {t(
                'JSON: unduh → sunting di Notepad / VS Code / Excel (ekspor hati-hati) → unggah lagi pada jenis konten yang sama. Field _apex_* hanya penjelasan; boleh dihapus.',
                'JSON: download → edit in Notepad / VS Code → upload again on the same content type. _apex_* keys are notes only; safe to delete.',
              )}
            </li>
            <li>
              {t(
                'CSV kuis: baris yang diawali # adalah bantuan; saat unggah otomatis diabaikan. Kolom answer wajib A, B, C, atau D.',
                'Quiz CSV: lines starting with # are help text and are ignored on upload. The answer column must be A, B, C, or D.',
              )}
            </li>
            <li>
              {t(
                'CSV Bulk Quiz: kolom opsional bank — kosong atau legacy → questions; pre → questions_pre; post → questions_post. File lama tanpa kolom bank tetap hanya mengisi legacy.',
                'Bulk Quiz CSV: optional bank column — empty or legacy → questions; pre → questions_pre; post → questions_post. Old files without bank still fill legacy only.',
              )}
            </li>
            <li>
              {t(
                'Ganti teks seperti GANTI_DENGAN_UUID_* dengan ID asli dari tabel Konten Terbaru di bawah atau dari Supabase.',
                'Replace placeholders like GANTI_DENGAN_UUID_* with real ids from the Recent Items table below or from Supabase.',
              )}
            </li>
            <li>
              {t(
                'Urutan kerja ideal: Kursus → Modul → Pelajaran → Kuis (atau pakai Mode Wizard).',
                'Recommended order: Course → Module → Lesson → Quiz (or use Wizard mode).',
              )}
            </li>
          </ul>
        </div>

        {(activeContentType === 'modules' || activeContentType === 'lessons') && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              {t('Filter metadata', 'Metadata filters')}
            </p>
            {activeContentType === 'modules' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={filterPhase}
                  onChange={(e) => setFilterPhase(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
                >
                  <option value="">{t('Semua level', 'All levels')}</option>
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
            {activeContentType === 'lessons' && (
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
          {activeContentType === 'courses' && (
            <>
              <p className="text-xs text-slate-500">
                {t(
                  'Satu kursus = satu “jalur” konten untuk satu jenjang. Modul siswa di Learning Hub diambil dari kursus yang grade-nya sama dengan profil siswa.',
                  'One course = one content track for one level. Student modules come from courses matching the student profile grade.',
                )}
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('Judul kursus', 'Course title')}
                </label>
                <input
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  placeholder={t('mis. Matematika SMP — Semester 1', 'e.g. Math JHS — Semester 1')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('Jenjang (filter siswa)', 'Level (student filter)')}
                </label>
                <select
                  value={courseGradeLevel}
                  onChange={(e) => setCourseGradeLevel(e.target.value as 'SD' | 'SMP' | 'SMK')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="SD">SD</option>
                  <option value="SMP">SMP</option>
                  <option value="SMK">SMK</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('Mastery threshold default (%)', 'Default mastery threshold (%)')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={courseMasteryThreshold}
                  onChange={(e) => setCourseMasteryThreshold(e.target.value)}
                  placeholder={t('Kosong = fallback 80', 'Empty = fallback 80')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </>
          )}

          {activeContentType === 'modules' && (
            <>
              <p className="text-xs text-slate-500">
                {t(
                  'Pilih kursus induk, lalu isi judul bab. Urutan menentukan posisi di daftar modul; threshold mastery dipakai untuk logika post-test (biasanya 80%).',
                  'Pick the parent course, then the chapter title. Order controls module list position; mastery threshold drives post-test logic (usually 80%).',
                )}
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('Kursus induk', 'Parent course')}
                </label>
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
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('Judul modul (bab)', 'Module title (chapter)')}
                </label>
                <input
                  value={moduleTitle}
                  onChange={(e) => setModuleTitle(e.target.value)}
                  placeholder={t('mis. Bilangan Bulat', 'e.g. Integers')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('Urutan dalam kursus', 'Sequence in course')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={moduleSequence}
                    onChange={(e) => setModuleSequence(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5">1, 2, 3 …</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('Batas mastery post-test (%)', 'Post-test mastery threshold (%)')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={moduleMastery}
                    onChange={(e) => setModuleMastery(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5">{t('Umumnya 80', 'Typically 80')}</p>
                </div>
              </div>
              <p className="text-[11px] font-semibold text-slate-500">
                {t('Metadata (opsional, untuk filter & gating level)', 'Metadata (optional, for filters & level gating)')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                    {t('level (key: phase)', 'level (key: phase)')}
                  </label>
                  <select
                    value={modulePhase}
                    onChange={(e) => setModulePhase(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">{t('Pilih level', 'Select level')}</option>
                    {canonicalPhaseOptions.map((phase) => (
                      <option key={phase} value={phase}>
                        {phase}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">subject</label>
                  <select
                    value={moduleSubject}
                    onChange={(e) => setModuleSubject(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">{t('Pilih subject', 'Select subject')}</option>
                    {canonicalSubjectOptions.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">track</label>
                  <input
                    value={moduleTrack}
                    onChange={(e) => setModuleTrack(e.target.value)}
                    placeholder={t('opsional', 'optional')}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {activeContentType === 'lessons' && (
            <>
              <p className="text-xs text-slate-500">
                {t(
                  'Satu baris = satu pelajaran di dalam modul. Untuk pre/post test: buat dua lesson (tipe bebas), lalu di tab Kuis pasang soal ke masing-masing lesson.',
                  'One row = one lesson inside a module. For pre/post tests: create two lessons (any type), then in Quizzes attach questions to each lesson.',
                )}
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('Modul induk', 'Parent module')}
                </label>
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
                      {formatModuleOptionLabel(module)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('Judul pelajaran', 'Lesson title')}
                </label>
                <input
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  placeholder={t('mis. Pre-test: Bilangan Bulat', 'e.g. Pre-test: Integers')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('Tipe konten', 'Content type')}
                </label>
                <select
                  value={lessonType}
                  onChange={(e) => setLessonType(e.target.value as 'VIDEO' | 'ARTICLE' | 'INTERACTIVE')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="VIDEO">VIDEO</option>
                  <option value="ARTICLE">ARTICLE</option>
                  <option value="INTERACTIVE">INTERACTIVE</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('URL materi (opsional)', 'Content URL (optional)')}
                </label>
                <input
                  value={lessonContentUrl}
                  onChange={(e) => setLessonContentUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <p className="text-[11px] font-semibold text-slate-500">
                {t('Metadata kurikulum (opsional)', 'Curriculum metadata (optional)')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">code</label>
                  <input
                    value={lessonCode}
                    onChange={(e) => setLessonCode(e.target.value)}
                    placeholder="7M.1"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">benchmark</label>
                  <input
                    value={lessonBenchmark}
                    onChange={(e) => setLessonBenchmark(e.target.value)}
                    placeholder={t('mis. Cambridge LS1', 'e.g. Cambridge LS1')}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {activeContentType === 'quizzes' && (
            <>
              <p className="text-xs text-slate-500">
                {t(
                  'Satu lesson = satu baris quiz. Isi JSON di bawah: legacy `questions` (fallback), plus `questions_pre` / `questions_post` untuk pre/post terpisah. Generator Claude mengisi PRE+POST; simpan lewat Wizard/Tab mengirim ketiga kolom ke API.',
                  'One lesson = one quiz row. Use JSON below: legacy `questions` (fallback), plus `questions_pre` / `questions_post` for split banks. Claude fills PRE+POST; Wizard/Tab save sends all three columns to the API.',
                )}
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('Pelajaran yang dikuis', 'Lesson to attach quiz to')}
                </label>
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
                      {formatLessonOptionLabel(lesson)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t(
                    'Saat tab ini dibuka, daftar memuat sampai 100 pelajaran dari semua modul (bukan hanya modul yang dipilih di tab Pelajaran).',
                    'When this tab opens, the list loads up to 100 lessons across all modules (not only the module selected on the Lessons tab).',
                  )}
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('Legacy questions (JSON)', 'Legacy questions (JSON)')}
                  </label>
                  <p className="text-[11px] text-slate-400 mb-1">
                    {t(
                      'Dipakai jika PRE dan POST kosong. Format sama untuk ketiga kolom.',
                      'Used when PRE and POST are empty. Same item shape for all three banks.',
                    )}
                  </p>
                  <textarea
                    value={quizQuestionsJson}
                    onChange={(e) => setQuizQuestionsJson(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-28 font-mono text-[13px]"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      {t('PRE — questions_pre (JSON)', 'PRE — questions_pre (JSON)')}
                    </label>
                    <textarea
                      value={quizQuestionsPreJson}
                      onChange={(e) => setQuizQuestionsPreJson(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-28 font-mono text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      {t('POST — questions_post (JSON)', 'POST — questions_post (JSON)')}
                    </label>
                    <textarea
                      value={quizQuestionsPostJson}
                      onChange={(e) => setQuizQuestionsPostJson(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-28 font-mono text-[13px]"
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-3 space-y-2 mt-2">
                <p className="text-xs font-bold text-violet-900">
                  {t('Generator AI (Claude)', 'AI generator (Claude)')}
                </p>
                <p className="text-[11px] text-violet-950 leading-relaxed">
                  {t(
                    'Membuat 5 soal pilihan ganda untuk PRE dan 10 untuk POST dari judul lesson + isi URL content_url. Wajib ANTHROPIC_API_KEY. Limit dan billing dipantau di konsol Anthropic.',
                    'Creates 5 PRE and 10 POST MCQs from the lesson title + content_url body. Requires ANTHROPIC_API_KEY. Limits and billing are managed in the Anthropic console.',
                  )}
                </p>
                <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiQuizOverwrite}
                    onChange={(e) => setAiQuizOverwrite(e.target.checked)}
                  />
                  {t('Timpa quiz yang sudah ada untuk lesson ini', 'Overwrite existing quiz for this lesson')}
                </label>
                <button
                  type="button"
                  onClick={() => void generateAiPrePostQuizzes()}
                  disabled={contentLoading || !quizLessonId}
                  className="w-full rounded-lg bg-violet-700 hover:bg-violet-800 text-white py-2 text-xs font-bold disabled:opacity-50"
                >
                  {t('Generate PRE (5) + POST (10) dari materi', 'Generate PRE (5) + POST (10) from material')}
                </button>
              </div>
            </>
          )}
        </div>

        {contentEntryMode === 'wizard' && !editingId && (
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => void wizardSubmit()}
              disabled={contentLoading || Boolean(wizardStepBlockedReason)}
              className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-700 text-white py-2.5 text-sm font-bold disabled:opacity-60"
            >
              {contentLoading
                ? t('Memproses...', 'Processing...')
                : wizardStep < 4
                  ? t('Simpan & lanjut ke langkah berikutnya', 'Save & go to next step')
                  : t('Simpan kuis', 'Save quiz')}
            </button>
            {wizardStep > 1 && (
              <button
                type="button"
                onClick={() => setWizardStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}
                disabled={contentLoading}
                className="rounded-xl border border-slate-300 bg-white text-slate-700 py-2.5 px-4 text-sm font-semibold"
              >
                {t('Kembali', 'Back')}
              </button>
            )}
          </div>
        )}

        {contentEntryMode === 'tabs' && (
          <>
            <button
              type="button"
              onClick={() => void createContent()}
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
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setModuleMetadataBase({})
                  setLessonMetadataBase({})
                  setQuizQuestionsJson(DEFAULT_QUIZ_LEGACY_JSON)
                  setQuizQuestionsPreJson(DEFAULT_QUIZ_BANK_JSON)
                  setQuizQuestionsPostJson(DEFAULT_QUIZ_BANK_JSON)
                }}
                className="mt-2 w-full rounded-xl border border-slate-200 text-slate-600 py-2 text-xs font-semibold"
              >
                {t('Batal Edit', 'Cancel Edit')}
              </button>
            )}
          </>
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
