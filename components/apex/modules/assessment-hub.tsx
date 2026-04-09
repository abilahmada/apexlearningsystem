'use client'

import { useCallback, useState } from 'react'
import { ClipboardList, Sparkles } from 'lucide-react'
import { AssessmentDashboard } from './assessment-dashboard'
import { AssessmentIntakeFlow } from './assessment-intake-flow'
import { useApex } from '../apex-context'

export function AssessmentHub() {
  const { userRole, t } = useApex()
  const [intakeEpoch, setIntakeEpoch] = useState(0)
  const [intakeOnboarding, setIntakeOnboarding] = useState({ loading: true, visible: false })

  const onIntakeVisibility = useCallback(
    (state: { loading: boolean; visible: boolean }) => {
      setIntakeOnboarding(state)
    },
    [],
  )

  return (
    <div className="space-y-6">
      {userRole === 'student' && !intakeOnboarding.loading && intakeOnboarding.visible && (
        <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <ClipboardList className="size-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">
                {t('Langkah pertama: tes penempatan awal', 'First step: placement assessment')}
              </h2>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                {t(
                  'Selesaikan blok di bawah ini sekali untuk mendapat penilaian awal di semua dimensi. Orang tua bisa melihat ringkasan di portal mereka setelah kamu menyelesaikan intake.',
                  'Complete the section below once to get your initial scores across dimensions. Parents can see a summary in their portal after you finish intake.',
                )}
              </p>
              <p className="mt-3 flex items-center gap-2 text-xs font-medium text-blue-800">
                <Sparkles className="size-3.5 shrink-0" />
                {t('Disarankan dikerjakan hari ini sebelum mulai modul belajar.', 'Best done today before starting learning modules.')}
              </p>
            </div>
          </div>
        </div>
      )}
      {userRole === 'student' && (
        <AssessmentIntakeFlow
          onStudentIntakeVisibility={onIntakeVisibility}
          onComplete={() => setIntakeEpoch((n) => n + 1)}
        />
      )}
      <AssessmentDashboard key={intakeEpoch} />
    </div>
  )
}
