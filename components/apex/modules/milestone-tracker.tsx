'use client'

import { useState } from 'react'
import { Flag, Check, Lock, Star, Award, GraduationCap, Globe } from 'lucide-react'
import { useApex } from '../apex-context'
import { cn } from '@/lib/utils'

interface Milestone {
  id: string
  grade: string
  gradeEn: string
  age: string
  title: string
  titleEn: string
  targets: { id: string; text: string; textEn: string; completed: boolean }[]
  certifications: string[]
  status: 'completed' | 'current' | 'locked'
}

const milestones: Milestone[] = [
  {
    id: 'kelas-3',
    grade: 'Kelas 3 SD',
    gradeEn: 'Grade 3',
    age: '8-9 tahun',
    title: 'Fondasi Dasar',
    titleEn: 'Foundation',
    targets: [
      { id: '1', text: 'Lancar membaca & menulis', textEn: 'Fluent reading & writing', completed: true },
      { id: '2', text: 'Matematika dasar (perkalian)', textEn: 'Basic math (multiplication)', completed: true },
      { id: '3', text: 'Bahasa Inggris dasar', textEn: 'Basic English', completed: true },
      { id: '4', text: 'Kebiasaan belajar mandiri', textEn: 'Self-learning habits', completed: false },
    ],
    certifications: ['Cambridge YLE Starters', 'Matematika Level 1'],
    status: 'completed'
  },
  {
    id: 'kelas-6',
    grade: 'Kelas 6 SD',
    gradeEn: 'Grade 6',
    age: '11-12 tahun',
    title: 'Literasi Lanjutan',
    titleEn: 'Advanced Literacy',
    targets: [
      { id: '1', text: 'Membaca kritis & analitis', textEn: 'Critical & analytical reading', completed: true },
      { id: '2', text: 'Matematika pra-aljabar', textEn: 'Pre-algebra math', completed: true },
      { id: '3', text: 'English intermediate', textEn: 'Intermediate English', completed: false },
      { id: '4', text: 'Project pertama', textEn: 'First project', completed: false },
    ],
    certifications: ['Cambridge YLE Flyers', 'AMC 8 Participation'],
    status: 'current'
  },
  {
    id: 'kelas-9',
    grade: 'Kelas 9 SMP',
    gradeEn: 'Grade 9',
    age: '14-15 tahun',
    title: 'Eksplorasi Karir',
    titleEn: 'Career Exploration',
    targets: [
      { id: '1', text: 'Spesialisasi minat', textEn: 'Interest specialization', completed: false },
      { id: '2', text: 'Aljabar & Geometri', textEn: 'Algebra & Geometry', completed: false },
      { id: '3', text: 'English upper-intermediate', textEn: 'Upper-intermediate English', completed: false },
      { id: '4', text: 'Portfolio 3 proyek', textEn: 'Portfolio of 3 projects', completed: false },
    ],
    certifications: ['Cambridge PET', 'AMC 10', 'Coding Certificate'],
    status: 'locked'
  },
  {
    id: 'kelas-12',
    grade: 'Kelas 12 SMA',
    gradeEn: 'Grade 12',
    age: '17-18 tahun',
    title: 'Siap Universitas/Karir',
    titleEn: 'University/Career Ready',
    targets: [
      { id: '1', text: 'Mastery bidang pilihan', textEn: 'Mastery in chosen field', completed: false },
      { id: '2', text: 'Kalkulus/Statistik', textEn: 'Calculus/Statistics', completed: false },
      { id: '3', text: 'English advanced (IELTS 6.5+)', textEn: 'Advanced English (IELTS 6.5+)', completed: false },
      { id: '4', text: 'Portfolio komprehensif', textEn: 'Comprehensive portfolio', completed: false },
    ],
    certifications: ['IELTS/TOEFL', 'SAT/ACT', 'Industry Certification'],
    status: 'locked'
  }
]

export function MilestoneTracker() {
  const { t } = useApex()
  const [selectedMilestone, setSelectedMilestone] = useState<string>('kelas-6')

  const selected = milestones.find(m => m.id === selectedMilestone)

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
        <Flag size={20} className="text-blue-500" />
        {t('Milestone 12 Tahun Perjalanan Belajar', '12-Year Learning Journey Milestones')}
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        {t(
          'Roadmap pencapaian dari SD hingga SMA dengan target kompetensi dan sertifikasi',
          'Achievement roadmap from elementary to high school with competency targets and certifications'
        )}
      </p>

      {/* Timeline Visual */}
      <div className="relative mb-8">
        <div className="absolute top-6 left-0 right-0 h-1 bg-slate-200 rounded-full" />
        <div className="relative flex justify-between">
          {milestones.map((milestone) => {
            const isSelected = selectedMilestone === milestone.id
            
            return (
              <button
                key={milestone.id}
                onClick={() => setSelectedMilestone(milestone.id)}
                className="flex flex-col items-center z-10"
              >
                <div className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center border-4 transition-all',
                  milestone.status === 'completed' 
                    ? 'bg-emerald-500 border-emerald-300 text-white'
                    : milestone.status === 'current'
                      ? 'bg-blue-500 border-blue-300 text-white'
                      : 'bg-slate-200 border-slate-300 text-slate-400',
                  isSelected && 'ring-4 ring-blue-200 scale-110'
                )}>
                  {milestone.status === 'completed' ? (
                    <Check size={24} />
                  ) : milestone.status === 'locked' ? (
                    <Lock size={20} />
                  ) : (
                    <Star size={20} />
                  )}
                </div>
                <span className={cn(
                  'text-xs font-bold mt-2 text-center',
                  isSelected ? 'text-blue-600' : 'text-slate-500'
                )}>
                  {t(milestone.grade, milestone.gradeEn)}
                </span>
                <span className="text-[10px] text-slate-400">{milestone.age}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Milestone Details */}
      {selected && (
        <div className={cn(
          'p-5 rounded-2xl border-2',
          selected.status === 'completed' ? 'bg-emerald-50 border-emerald-200' :
          selected.status === 'current' ? 'bg-blue-50 border-blue-200' :
          'bg-slate-50 border-slate-200'
        )}>
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              selected.status === 'completed' ? 'bg-emerald-500 text-white' :
              selected.status === 'current' ? 'bg-blue-500 text-white' :
              'bg-slate-300 text-slate-500'
            )}>
              <GraduationCap size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">{t(selected.title, selected.titleEn)}</h3>
              <p className="text-sm text-slate-500">{t(selected.grade, selected.gradeEn)} ({selected.age})</p>
            </div>
            {selected.status === 'current' && (
              <span className="ml-auto px-3 py-1 bg-blue-500 text-white text-xs font-bold rounded-full">
                {t('Saat Ini', 'Current')}
              </span>
            )}
          </div>

          {/* Targets */}
          <div className="mb-4">
            <h4 className="text-sm font-bold text-slate-600 mb-2">
              {t('Target Kompetensi', 'Competency Targets')}
            </h4>
            <div className="space-y-2">
              {selected.targets.map(target => (
                <div key={target.id} className="flex items-center gap-2">
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center',
                    target.completed ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                  )}>
                    {target.completed && <Check size={12} />}
                  </div>
                  <span className={cn(
                    'text-sm',
                    target.completed ? 'text-slate-700' : 'text-slate-500'
                  )}>
                    {t(target.text, target.textEn)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Certifications */}
          <div>
            <h4 className="text-sm font-bold text-slate-600 mb-2 flex items-center gap-1">
              <Award size={14} />
              {t('Sertifikasi Target', 'Target Certifications')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {selected.certifications.map((cert) => (
                <span
                  key={cert}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium',
                    selected.status === 'locked' 
                      ? 'bg-slate-200 text-slate-500'
                      : 'bg-orange-100 text-orange-700'
                  )}
                >
                  <Globe size={12} className="inline mr-1" />
                  {cert}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
