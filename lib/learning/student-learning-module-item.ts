/**
 * Kontrak item `items[]` dari GET `/api/learning/modules`.
 * Kehadiran field opsional bergantung pada query (`withLessons`, `catalog`, dll.).
 */
export type StudentLearningModuleListItem = {
  id: string
  courseId: string
  courseTitle?: string
  subjectDisplay?: string
  phaseLevel?: number
  title: string
  sequenceOrder: number
  masteryThreshold?: number
  metadata?: Record<string, unknown>
  unlocked?: boolean
  lockReason?: string | null
  lessonsAllPassed?: boolean
  studyConfirmedAt?: string | null
  completed?: boolean
  avgPosttestPct?: number | null
  studyPointsTotal?: number
  progress?: {
    totalLessons: number
    passedLessons: number
    completionPct: number
  }
  lessons?: Array<{
    id: string
    title: string
    pretestScore: number | null
    posttestScore: number | null
    posttestPassed: boolean
  }>
}
