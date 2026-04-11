'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Home, BrainCircuit, RotateCw, Globe, LineChart, ShieldCheck, Clock,
  Timer, Calendar, BookOpen, ClipboardList, Flag, Settings, Heart,
  Sparkles, ChevronRight, X, LogOut, Menu, Database,
} from 'lucide-react'
import { ApexProvider, useApex, UserRole } from './apex-context'
import { NavButton } from './nav-button'
import { WellbeingOverlay } from './wellbeing-overlay'
import { LanguageToggle } from './language-toggle'
import { GradeSelector } from './grade-selector'
import { ApexLogo } from './apex-logo'
import { LearningHub } from './modules/learning-hub'
import { AIClassroom } from './modules/ai-classroom'
import { SpacedRepetition } from './modules/spaced-repetition'
import { Portfolio } from './modules/portfolio'
import { ParentAnalytics } from './modules/parent-analytics'
import { MentorPortal } from './modules/mentor-portal'
import { PomodoroTimer } from './modules/pomodoro-timer'
import { WeeklySchedule } from './modules/weekly-schedule'
import { ModuleMaterials } from './modules/module-materials'
import { BrainDump } from './modules/brain-dump'
import { WeeklyReflection } from './modules/weekly-reflection'
import { AssessmentHub } from './modules/assessment-hub'
import { MilestoneTracker } from './modules/milestone-tracker'
import { AdminPanel } from './modules/admin-panel'
import { AdminMembersDatabase } from './modules/admin-members-database'
import { UserProfile } from './modules/user-profile'

type ViewType =
  | 'hub' | 'classroom' | 'spaced-rep' | 'portfolio'
  | 'parent' | 'mentor' | 'pomodoro' | 'schedule'
  | 'brain-dump' | 'reflection' | 'assessment' | 'milestone' | 'profile' | 'admin' | 'members-db' | 'materials'

/* ── View metadata ────────────────────────────────────────────────────────── */
const VIEW_META: Record<ViewType, { id: string; en: string; icon: React.ReactNode; section: string }> = {
  'hub':        { id: 'Hub Belajar',        en: 'Learning Hub',       icon: <Home size={18} />,          section: 'student' },
  'classroom':  { id: 'Ruang Kelas AI',     en: 'AI Classroom',       icon: <BrainCircuit size={18} />,  section: 'student' },
  'spaced-rep': { id: 'Mesin Memori',        en: 'Memory Engine',      icon: <RotateCw size={18} />,      section: 'student' },
  'portfolio':  { id: 'Karya Global',        en: 'Global Portfolio',   icon: <Globe size={18} />,         section: 'student' },
  'pomodoro':   { id: 'Pomodoro Timer',      en: 'Pomodoro Timer',     icon: <Timer size={18} />,         section: 'tools' },
  'schedule':   { id: 'Jadwal Mingguan',     en: 'Weekly Schedule',    icon: <Calendar size={18} />,      section: 'tools' },
  'materials':  { id: 'Modul Materi (Ringkasan)', en: 'Module Summary', icon: <BookOpen size={18} />,       section: 'student' },
  'brain-dump': { id: 'Brain Dump',          en: 'Brain Dump',         icon: <BrainCircuit size={18} />,  section: 'tools' },
  'reflection': { id: 'Refleksi Mingguan',   en: 'Weekly Reflection',  icon: <BookOpen size={18} />,      section: 'tools' },
  'assessment': { id: 'Penilaian Holistik',  en: 'Holistic Assessment',icon: <ClipboardList size={18} />, section: 'eval' },
  'milestone':  { id: 'Milestone Tracker',   en: 'Milestone Tracker',  icon: <Flag size={18} />,          section: 'eval' },
  'profile':    { id: 'Profil Saya',         en: 'My Profile',         icon: <Settings size={18} />,      section: 'tools' },
  'parent':     { id: 'Portal Orang Tua',    en: 'Parent Portal',      icon: <LineChart size={18} />,     section: 'eval' },
  'mentor':     { id: 'Validasi Mentor',     en: 'Mentor Validation',  icon: <ShieldCheck size={18} />,   section: 'eval' },
  'admin':      { id: 'Panel Admin',         en: 'Admin Panel',        icon: <Settings size={18} />,      section: 'eval' },
  'members-db': { id: 'Database Member',     en: 'Member Database',    icon: <Database size={18} />,       section: 'eval' },
}

/* ── Badge counts (nanti dari context/API) ───────────────────────────────── */
const VIEW_BADGES: Partial<Record<ViewType, number>> = {
  'spaced-rep': 3,   // 3 kartu perlu di-review
  'reflection': 1,   // 1 refleksi mingguan belum diisi
}

/* ── Section labels ──────────────────────────────────────────────────────── */
const SECTIONS: Record<string, { id: string; en: string }> = {
  student: { id: 'Area Siswa',   en: 'Student Area' },
  tools:   { id: 'Tools Belajar', en: 'Learning Tools' },
  eval:    { id: 'Area Evaluasi', en: 'Evaluation' },
}

const ROLE_ACCESS: Record<UserRole, ViewType[]> = {
  student: ['hub', 'materials', 'classroom', 'spaced-rep', 'portfolio', 'pomodoro', 'schedule', 'brain-dump', 'reflection', 'assessment', 'milestone', 'profile'],
  parent: ['parent', 'assessment', 'milestone', 'profile'],
  mentor: ['mentor', 'assessment', 'portfolio', 'profile'],
  admin: ['hub', 'materials', 'classroom', 'spaced-rep', 'portfolio', 'parent', 'mentor', 'pomodoro', 'schedule', 'brain-dump', 'reflection', 'assessment', 'milestone', 'profile', 'admin', 'members-db'],
}

function LoginGate() {
  const { login, signup, requestPasswordReset, resendSignupEmail, t, appName } = useApex()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [signupPhase, setSignupPhase] = useState<'form' | 'awaiting_email' | 'awaiting_admin'>('form')
  const [selectedRole, setSelectedRole] = useState<UserRole>('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendBusy, setResendBusy] = useState(false)
  const [resendNotice, setResendNotice] = useState<string | null>(null)
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotNotice, setForgotNotice] = useState<string | null>(null)
  const [awaitingRole, setAwaitingRole] = useState<UserRole>('student')
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [studentGradeLevel, setStudentGradeLevel] = useState<'sd' | 'smp' | 'smk'>('smp')
  const [studentBirthDate, setStudentBirthDate] = useState('')
  const [studentSchoolOrigin, setStudentSchoolOrigin] = useState('')
  const [studentClassLevel, setStudentClassLevel] = useState(1)
  const [learningVision, setLearningVision] = useState('')
  const [parentLinkCode, setParentLinkCode] = useState('')
  const [parentAddressLine, setParentAddressLine] = useState('')
  const [parentProvinceId, setParentProvinceId] = useState('')
  const [parentProvinceName, setParentProvinceName] = useState('')
  const [parentCityId, setParentCityId] = useState('')
  const [parentCityName, setParentCityName] = useState('')
  const [parentDistrictId, setParentDistrictId] = useState('')
  const [parentDistrictName, setParentDistrictName] = useState('')
  const [provinceOptions, setProvinceOptions] = useState<Array<{ id: string; name: string }>>([])
  const [cityOptions, setCityOptions] = useState<Array<{ id: string; name: string }>>([])
  const [districtOptions, setDistrictOptions] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [parentLinkCheck, setParentLinkCheck] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle')

  const normalizePhoneNumber = (raw: string) => raw.replace(/[\s-]/g, '')
  const isValidIndonesiaPhone = (raw: string) => /^(?:\+62|62|08)\d{8,13}$/.test(normalizePhoneNumber(raw))
  const generateStrongPassword = (length = 12) => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const lower = 'abcdefghijkmnopqrstuvwxyz'
    const digits = '23456789'
    const symbols = '!@#$%^&*'
    const all = `${upper}${lower}${digits}${symbols}`
    const rand = (chars: string) => chars[Math.floor(Math.random() * chars.length)]
    const out = [rand(upper), rand(lower), rand(digits), rand(symbols)]
    while (out.length < length) out.push(rand(all))
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out.join('')
  }

  const cards: { role: UserRole; title: string; en: string; icon: React.ReactNode }[] = [
    { role: 'student', title: 'Siswa', en: 'Student', icon: <div className="w-2 h-2 rounded-full bg-blue-500" /> },
    { role: 'parent', title: 'Orang Tua', en: 'Parent', icon: <div className="w-2 h-2 rounded-full bg-orange-500" /> },
  ]

  const classOptions = useMemo(() => {
    if (studentGradeLevel === 'sd') return [1, 2, 3, 4, 5, 6]
    return [1, 2, 3]
  }, [studentGradeLevel])
  const effectiveStudentClassLevel = classOptions.includes(studentClassLevel)
    ? studentClassLevel
    : (classOptions[0] ?? 1)

  const passwordStrength = useMemo(() => {
    const value = password ?? ''
    if (!value) {
      return {
        score: 0,
        label: t('Belum diisi', 'Not set'),
        barClass: 'bg-slate-200',
        textClass: 'text-slate-500',
      }
    }
    let score = 0
    if (value.length >= 8) score += 1
    if (value.length >= 12) score += 1
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
    if (/\d/.test(value)) score += 1
    if (/[^A-Za-z0-9]/.test(value)) score += 1

    if (score <= 2) {
      return {
        score,
        label: t('Lemah', 'Weak'),
        barClass: 'bg-red-500',
        textClass: 'text-red-600',
      }
    }
    if (score <= 4) {
      return {
        score,
        label: t('Sedang', 'Medium'),
        barClass: 'bg-amber-500',
        textClass: 'text-amber-600',
      }
    }
    return {
      score,
      label: t('Kuat', 'Strong'),
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-600',
    }
  }, [password, t])

  const passwordStrengthInputClass =
    passwordStrength.score === 0
      ? ''
      : passwordStrength.score <= 2
        ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
        : passwordStrength.score <= 4
          ? 'border-amber-300 focus:ring-amber-500/20 focus:border-amber-400'
          : 'border-emerald-300 focus:ring-emerald-500/20 focus:border-emerald-400'

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = window.setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(id)
  }, [resendCooldown])

  useEffect(() => {
    const loadProvinces = async () => {
      try {
        const res = await fetch('https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json')
        const json = (await res.json()) as Array<{ id: string; name: string }>
        setProvinceOptions(json)
      } catch {
        setProvinceOptions([])
      }
    }
    if (mode === 'signup' && selectedRole === 'parent') void loadProvinces()
  }, [mode, selectedRole])

  useEffect(() => {
    const loadCities = async () => {
      try {
        if (!parentProvinceId) {
          setCityOptions([])
          return
        }
        const res = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${parentProvinceId}.json`)
        const json = (await res.json()) as Array<{ id: string; name: string }>
        setCityOptions(json)
      } catch {
        setCityOptions([])
      }
    }
    void loadCities()
  }, [parentProvinceId])

  useEffect(() => {
    const loadDistricts = async () => {
      try {
        if (!parentCityId) {
          setDistrictOptions([])
          return
        }
        const res = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/districts/${parentCityId}.json`)
        const json = (await res.json()) as Array<{ id: string; name: string }>
        setDistrictOptions(json)
      } catch {
        setDistrictOptions([])
      }
    }
    void loadDistricts()
  }, [parentCityId])

  const onSubmit = async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
    if (mode === 'signin') {
      const result = await login(email, password)
      if (!result.ok) {
        setError(result.message)
      }
    } else {
      if (!fullName.trim()) {
        setError(t('Nama lengkap wajib diisi.', 'Full name is required.'))
        setLoading(false)
        return
      }
      if (selectedRole === 'student' && !parentLinkCode.trim()) {
        setError(t('ID Orang Tua wajib diisi untuk akun siswa.', 'Parent ID is required for student accounts.'))
        setLoading(false)
        return
      }
      if (selectedRole === 'student' && !studentBirthDate) {
        setError(t('Tanggal lahir siswa wajib diisi.', 'Student birth date is required.'))
        setLoading(false)
        return
      }
      if (selectedRole === 'student' && !studentSchoolOrigin.trim()) {
        setError(t('Asal sekolah siswa wajib diisi.', 'Student school origin is required.'))
        setLoading(false)
        return
      }
      if (selectedRole === 'parent' && !parentLinkCode.trim()) {
        setError(t('ID Orang Tua wajib diisi untuk akun orang tua.', 'Parent ID is required for parent accounts.'))
        setLoading(false)
        return
      }
      if (selectedRole === 'parent' && !phoneNumber.trim()) {
        setError(t('Nomor HP wajib diisi untuk akun orang tua.', 'Phone number is required for parent accounts.'))
        setLoading(false)
        return
      }
      if (phoneNumber.trim() && !isValidIndonesiaPhone(phoneNumber)) {
        setError(
          t(
            'Format nomor HP tidak valid. Gunakan format 08xxxxxxxxxx atau +62xxxxxxxxxx.',
            'Invalid phone number format. Use 08xxxxxxxxxx or +62xxxxxxxxxx.',
          ),
        )
        setLoading(false)
        return
      }
      if (selectedRole === 'parent' && (!parentAddressLine.trim() || !parentProvinceName || !parentCityName || !parentDistrictName)) {
        setError(t('Alamat orang tua wajib lengkap (alamat, provinsi, kota/kabupaten, kecamatan).', 'Parent address is required (address, province, city/regency, district).'))
        setLoading(false)
        return
      }
      if (password.length < 6) {
        setError(t('Password minimal 6 karakter.', 'Password must be at least 6 characters.'))
        setLoading(false)
        return
      }
      if (password !== passwordConfirm) {
        setError(t('Konfirmasi password tidak sama.', 'Password confirmation does not match.'))
        setLoading(false)
        return
      }

      const result = await signup(email, password, selectedRole, {
        fullName,
        phoneNumber: phoneNumber.trim() ? normalizePhoneNumber(phoneNumber) : '',
        gradeLevel: selectedRole === 'student' ? studentGradeLevel : undefined,
        birthDate: selectedRole === 'student' ? studentBirthDate : undefined,
        schoolOrigin: selectedRole === 'student' ? studentSchoolOrigin : undefined,
        gradeClassStart: selectedRole === 'student' ? effectiveStudentClassLevel : undefined,
        gradeClassMax: selectedRole === 'student' ? (studentGradeLevel === 'sd' ? 6 : 3) : undefined,
        learningVision: selectedRole === 'student' ? learningVision : undefined,
        parentLinkCode,
        addressLine: selectedRole === 'parent' ? parentAddressLine : undefined,
        province: selectedRole === 'parent' ? parentProvinceName : undefined,
        city: selectedRole === 'parent' ? parentCityName : undefined,
        district: selectedRole === 'parent' ? parentDistrictName : undefined,
      })
      if (!result.ok) {
        setError(result.message)
      } else if (result.pendingAdminApproval) {
        setAwaitingRole(selectedRole)
        setResendNotice(null)
        setSignupPhase('awaiting_admin')
      } else if (result.needsEmailConfirmation) {
        setAwaitingRole(selectedRole)
        setResendNotice(null)
        setSignupPhase('awaiting_email')
      } else {
        if (selectedRole === 'student') {
          try {
            window.sessionStorage.setItem('apex-open-assessment', '1')
          } catch {
            /* ignore */
          }
          setNotice(
            t(
              'Akun siswa berhasil dibuat. Membuka tes penempatan…',
              'Student account created. Opening placement assessment…',
            ),
          )
        } else {
          setNotice(
            t(
              'Akun orang tua berhasil dibuat. Membuka portal…',
              'Parent account created. Opening the app…',
            ),
          )
        }
      }
    }
    setLoading(false)
  }

  const onLoginOnly = async () => {
    setLoading(true)
    setError(null)
    const result = await login(email, password)
    if (!result.ok) setError(result.message)
    setLoading(false)
  }

  const onForgotPassword = async () => {
    setError(null)
    setForgotNotice(null)
    setForgotBusy(true)
    const result = await requestPasswordReset(email)
    setForgotBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setForgotNotice(t('Email reset dikirim. Mengalihkan…', 'Reset email sent. Redirecting…'))
    const target = `/auth/reset-sent?email=${encodeURIComponent(email.trim())}`
    window.setTimeout(() => {
      window.location.replace(target)
    }, 250)
  }

  const onResendVerification = async () => {
    if (resendCooldown > 0 || resendBusy) return
    setResendBusy(true)
    setResendNotice(null)
    const result = await resendSignupEmail(email)
    setResendBusy(false)
    if (!result.ok) {
      setResendNotice(result.message)
      return
    }
    setResendNotice(t('Email verifikasi telah dikirim ulang.', 'Verification email has been resent.'))
    setResendCooldown(60)
  }

  if (signupPhase === 'awaiting_email' || signupPhase === 'awaiting_admin') {
    const isAwaitingAdmin = signupPhase === 'awaiting_admin'
    return (
      <div className="min-h-screen bg-[#EFF2F6] flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-md shadow-slate-200/50">
          <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                <ApexLogo size={24} showWordmark={false} />
              </div>
              <h1 className="text-lg font-bold text-[#0A1128] truncate">{appName}</h1>
            </div>
            <LanguageToggle />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2 leading-snug">
            {isAwaitingAdmin
              ? t('Pendaftaran berhasil — menunggu verifikasi admin', 'Sign-up successful — awaiting admin verification')
              : t('Pendaftaran berhasil — verifikasi email', 'Sign-up successful — verify your email')}
          </h2>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            {isAwaitingAdmin ? (
              <>
                {t('Pendaftaran atas email', 'Registration for email')}{' '}
                <span className="font-semibold text-slate-800">{email || '—'}</span>{' '}
                {t(
                  'sudah diterima dan sedang menunggu persetujuan admin APEX. Anda akan bisa masuk setelah disetujui.',
                  'has been accepted and is waiting for APEX admin approval. You can sign in after approval.',
                )}
              </>
            ) : (
              <>
                {t(
                  'Kami mengirim tautan verifikasi ke',
                  'We sent a verification link to',
                )}{' '}
                <span className="font-semibold text-slate-800">{email || '—'}</span>.
                {awaitingRole === 'student'
                  ? t(
                      ' Buka email tersebut dan klik tautan. Setelah verifikasi, kamu akan melihat halaman sukses; siswa akan diarahkan ke tes penempatan saat masuk.',
                      ' Open that email and tap the link. After verifying, you will see a success page; students are taken to the placement test when they enter the app.',
                    )
                  : t(
                      ' Buka email tersebut dan klik tautan. Setelah verifikasi, kamu akan melihat halaman sukses lalu bisa masuk ke portal orang tua.',
                      ' Open that email and tap the link. After verifying, you will see a success page and can sign in to the parent portal.',
                    )}
              </>
            )}
          </p>
          <ul className="text-xs text-slate-600 space-y-2 mb-4 list-disc pl-4 leading-relaxed">
            <li>
              {t(
                'Cek folder Spam / Promosi — email dari Supabase kadang tertahan.',
                'Check Spam / Promotions — messages from Supabase are sometimes filtered.',
              )}
            </li>
            {!isAwaitingAdmin ? (
              <>
                <li>
                  {t(
                    'Pastikan alamat email benar. Jika tidak ada email sama sekali, di Supabase aktifkan Custom SMTP (Authentication → Emails) agar pengiriman lebih andal.',
                    'Make sure the address is correct. If nothing arrives, enable Custom SMTP in Supabase (Authentication → Emails) for reliable delivery.',
                  )}
                </li>
                <li>
                  {t(
                    'Di Supabase: Authentication → Users — pastikan user baru muncul; jika muncul tapi inbox kosong, cek Project Settings → Auth (rate limit) dan gunakan penyedia SMTP transaksional (mis. Resend, SendGrid).',
                    'In Supabase: Authentication → Users — confirm the new user exists; if it exists but the inbox is empty, check Project Settings → Auth (rate limits) and use a transactional SMTP provider (e.g. Resend, SendGrid).',
                  )}
                </li>
              </>
            ) : (
              <li>
                {t(
                  'Status approval dapat dicek lewat admin APEX. Jika sudah disetujui, Anda bisa langsung masuk dengan email dan password yang sama.',
                  'Approval status is managed by APEX admins. Once approved, you can sign in with the same email and password.',
                )}
              </li>
            )}
          </ul>
          {!isAwaitingAdmin ? (
            <>
              <button
                type="button"
                disabled={resendBusy || resendCooldown > 0 || !email.trim()}
                onClick={() => void onResendVerification()}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 mb-2 min-h-[44px]"
              >
                {resendBusy
                  ? t('Mengirim…', 'Sending…')
                  : resendCooldown > 0
                    ? t(`Kirim ulang (${resendCooldown}s)`, `Resend (${resendCooldown}s)`)
                    : t('Kirim ulang email verifikasi', 'Resend verification email')}
              </button>
              {resendNotice ? <p className="text-sm text-emerald-600 mb-4">{resendNotice}</p> : null}
            </>
          ) : null}

          <div className="border-t border-slate-100 pt-5 mt-1">
            <h3 className="text-sm font-bold text-slate-800 mb-3">
              {t('Sudah verifikasi? Masuk di sini', 'Already verified? Sign in here')}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('Password', 'Password')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm min-h-[44px]"
                />
              </div>
              {error ? <p className="text-sm text-red-500">{error}</p> : null}
              <button
                type="button"
                disabled={loading}
                onClick={() => void onLoginOnly()}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white min-h-[44px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}
              >
                {loading ? t('Memproses…', 'Processing…') : t('Masuk', 'Sign in')}
              </button>
            </div>
          </div>

          <button
            type="button"
            className="mt-6 w-full text-sm text-slate-500 hover:text-slate-800"
            onClick={() => {
              setSignupPhase('form')
              setResendNotice(null)
              setError(null)
            }}
          >
            {t('← Kembali ke formulir pendaftaran', '← Back to sign-up form')}
          </button>
        </div>
      </div>
    )
  }

  const fieldClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-shadow'
  const textareaFieldClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-shadow resize-y min-h-[5rem]'
  const labelClass = 'block text-sm font-semibold text-slate-700 mb-1.5'

  return (
    <div className="min-h-screen bg-[#EFF2F6] flex items-center justify-center p-4 sm:p-6">
      <div
        className={`w-full ${mode === 'signin' ? 'max-w-md' : 'max-w-2xl'} bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-md shadow-slate-200/50`}
      >
        <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
              <ApexLogo size={24} showWordmark={false} />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[#0A1128] truncate">{appName}</h1>
          </div>
          <LanguageToggle />
        </div>

        <h2 className="text-2xl sm:text-[1.65rem] font-bold text-[#23314A] mb-2 leading-tight tracking-tight">
          {t('Selamat Datang di APEX! 🌍', 'Welcome to APEX! 🌍')}
        </h2>
        <p className="text-sm sm:text-base text-slate-500 mb-6 leading-relaxed max-w-xl">
          {mode === 'signin'
            ? t('Masuk dengan akun Supabase kamu untuk melanjutkan.', 'Sign in with your Supabase account to continue.')
            : t('Daftar akun baru dan pilih peran aksesmu.', 'Create a new account and choose your access role.')}
        </p>

        <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50/80 p-1 mb-6 gap-1">
          <button
            type="button"
            onClick={() => {
              setMode('signin')
              setSignupPhase('form')
            }}
            className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${mode === 'signin' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            {t('Masuk', 'Sign In')}
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${mode === 'signup' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            {t('Daftar', 'Sign Up')}
          </button>
        </div>

        <div className={mode === 'signup' ? 'space-y-5' : 'space-y-4'}>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
              placeholder={t('nama@email.com', 'name@email.com')}
            />
          </div>
          {mode === 'signup' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{t('Password', 'Password')}</label>
                <div className="flex gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${fieldClass} ${passwordStrengthInputClass}`}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {showPassword ? t('Sembunyikan', 'Hide') : t('Lihat', 'Show')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(password)
                        setPasswordCopied(true)
                        window.setTimeout(() => setPasswordCopied(false), 1600)
                      } catch {
                        setError(t('Gagal menyalin password.', 'Failed to copy password.'))
                      }
                    }}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {passwordCopied ? t('Tersalin', 'Copied') : t('Salin', 'Copy')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generateStrongPassword(12)
                      setPassword(generated)
                      setPasswordConfirm(generated)
                      setShowPassword(true)
                      setShowPasswordConfirm(true)
                    }}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {t('Generate', 'Generate')}
                  </button>
                </div>
                <div className="mt-2">
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full transition-all ${passwordStrength.barClass}`}
                      style={{ width: `${Math.min(100, (passwordStrength.score / 5) * 100)}%` }}
                    />
                  </div>
                  <p className={`mt-1 text-xs ${passwordStrength.textClass}`}>
                    {t('Kekuatan password', 'Password strength')}: {passwordStrength.label}
                  </p>
                </div>
              </div>
              <div>
                <label className={labelClass}>{t('Ulangi password', 'Confirm password')}</label>
                <input
                  type={showPasswordConfirm ? 'text' : 'password'}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className={fieldClass}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirm((v) => !v)}
                  className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {showPasswordConfirm ? t('Sembunyikan', 'Hide') : t('Lihat', 'Show')}
                </button>
                <p className="text-xs text-slate-500 mt-1.5 leading-snug">
                  {t('Ketik ulang password yang sama untuk diingat.', 'Type the same password again to confirm.')}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <label className={labelClass}>{t('Password', 'Password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void onForgotPassword()}
                  disabled={forgotBusy || !email.trim()}
                  className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
                >
                  {forgotBusy
                    ? t('Mengirim…', 'Sending…')
                    : t('Lupa password?', 'Forgot password?')}
                </button>
                <span className="text-[11px] text-slate-400">
                  {t('Isi email dulu.', 'Enter email first.')}
                </span>
              </div>
              {forgotNotice ? (
                <p className="text-xs text-emerald-600 mt-1.5 leading-snug">{forgotNotice}</p>
              ) : null}
            </div>
          )}
          {mode === 'signup' && (
            <div>
              <label className={`${labelClass} mb-2`}>{t('Pilih Role', 'Choose Role')}</label>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {cards.map((card) => {
                  const active = selectedRole === card.role
                  return (
                    <button
                      key={card.role}
                      type="button"
                      onClick={() => {
                        setSelectedRole(card.role)
                        if (card.role !== 'student') setParentLinkCheck('idle')
                      }}
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold flex items-center justify-center gap-2 min-h-[44px] transition-colors ${active ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500/20' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      {card.icon}
                      {t(card.title, card.en)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {mode === 'signup' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>{t('Nama Lengkap', 'Full Name')}</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={fieldClass}
                  placeholder={t('Contoh: Bima Pratama', 'Example: Bima Pratama')}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  {selectedRole === 'parent'
                    ? t('Nomor HP', 'Phone Number')
                    : t('Nomor HP (opsional)', 'Phone Number (optional)')}
                </label>
                <input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className={fieldClass}
                  placeholder={t('08xxxxxxxxxx', '+62xxxxxxxxxx')}
                />
                <p className="text-xs text-slate-500 mt-1.5 leading-snug">
                  {t('Format: 08xxxxxxxxxx atau +62xxxxxxxxxx', 'Format: 08xxxxxxxxxx or +62xxxxxxxxxx')}
                </p>
              </div>
            </div>
          )}
          {mode === 'signup' && selectedRole === 'student' && (
            <>
              <div>
                <label className={labelClass}>{t('ID Orang Tua', 'Parent ID')}</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <input
                    value={parentLinkCode}
                    onChange={(e) => {
                      setParentLinkCode(e.target.value.toUpperCase())
                      setParentLinkCheck('idle')
                    }}
                    className={`${fieldClass} flex-1 sm:min-w-0`}
                    placeholder={t('Masukkan ID Orang Tua', 'Enter Parent ID')}
                  />
                  <button
                    type="button"
                    disabled={!parentLinkCode.trim() || parentLinkCheck === 'checking'}
                    onClick={async () => {
                      const code = parentLinkCode.trim()
                      if (!code) return
                      setParentLinkCheck('checking')
                      try {
                        const res = await fetch(
                          `/api/auth/validate-parent-link?code=${encodeURIComponent(code)}`,
                          { cache: 'no-store' },
                        )
                        const json = (await res.json()) as { valid?: boolean }
                        setParentLinkCheck(json.valid ? 'ok' : 'bad')
                      } catch {
                        setParentLinkCheck('bad')
                      }
                    }}
                    className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 min-h-[44px] sm:w-36"
                  >
                    {parentLinkCheck === 'checking'
                      ? t('Memeriksa…', 'Checking…')
                      : t('Periksa ID', 'Verify ID')}
                  </button>
                </div>
                {parentLinkCheck === 'ok' && (
                  <p className="text-xs text-emerald-600 mt-1">
                    {t('ID cocok dengan data orang tua di sistem.', 'ID matches a parent account in the system.')}
                  </p>
                )}
                {parentLinkCheck === 'bad' && parentLinkCode.trim() && (
                  <p className="text-xs text-amber-700 mt-1">
                    {t(
                      'ID tidak ditemukan. Minta orang tua membuka Portal Orang Tua dan menyalin ID mereka.',
                      'ID not found. Ask your parent to open the Parent Portal and copy their ID.',
                    )}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-1.5 leading-snug">
                  {t('Gunakan ID dari akun orang tua agar monitoring terhubung otomatis.', 'Use parent account ID for automatic monitoring linkage.')}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>{t('Jenjang Siswa', 'Student Grade Level')}</label>
                  <select
                    value={studentGradeLevel}
                    onChange={(e) => setStudentGradeLevel(e.target.value as 'sd' | 'smp' | 'smk')}
                    className={fieldClass}
                  >
                    <option value="sd">SD</option>
                    <option value="smp">SMP</option>
                    <option value="smk">SMA/SMK</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t('Kelas', 'Class')}</label>
                  <select
                    value={effectiveStudentClassLevel}
                    onChange={(e) => setStudentClassLevel(Number(e.target.value))}
                    className={fieldClass}
                  >
                    {classOptions.map((cls) => (
                      <option key={cls} value={cls}>
                        {t('Kelas', 'Class')} {cls}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1.5 leading-snug">
                    {t(
                      'Tingkat kelas akan bertambah otomatis setiap tahun hingga batas jenjang.',
                      'Class level will increase automatically each year up to level limit.',
                    )}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>{t('Tanggal Lahir', 'Birth Date')}</label>
                  <input
                    type="date"
                    value={studentBirthDate}
                    onChange={(e) => setStudentBirthDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t('Asal Sekolah', 'School Origin')}</label>
                  <input
                    value={studentSchoolOrigin}
                    onChange={(e) => setStudentSchoolOrigin(e.target.value)}
                    className={fieldClass}
                    placeholder={t('Contoh: SMP Negeri 1 Bandung', 'Example: Public Junior High School 1 Bandung')}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>{t('Visi Belajar (opsional)', 'Learning Vision (optional)')}</label>
                <textarea
                  value={learningVision}
                  onChange={(e) => setLearningVision(e.target.value)}
                  className={textareaFieldClass}
                  rows={3}
                  placeholder={t('Apa target belajar kamu tahun ini?', 'What is your learning goal this year?')}
                />
              </div>
            </>
          )}
          {mode === 'signup' && selectedRole === 'parent' && (
            <>
              <div>
                <label className={labelClass}>{t('Buat ID Orang Tua', 'Create Parent ID')}</label>
                <input
                  value={parentLinkCode}
                  onChange={(e) => setParentLinkCode(e.target.value.toUpperCase())}
                  className={fieldClass}
                  placeholder={t('Contoh: APEXPARENT01', 'Example: APEXPARENT01')}
                />
                <p className="text-xs text-slate-500 mt-1.5 leading-snug">
                  {t('ID ini dibagikan ke anak agar akun siswa terhubung ke akun orang tua.', 'Share this ID with your child to connect student account automatically.')}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>{t('Provinsi', 'Province')}</label>
                  <select
                    value={parentProvinceId}
                    onChange={(e) => {
                      const id = e.target.value
                      setParentProvinceId(id)
                      const selected = provinceOptions.find((p) => p.id === id)
                      setParentProvinceName(selected?.name ?? '')
                      setParentCityId('')
                      setParentCityName('')
                      setParentDistrictId('')
                      setParentDistrictName('')
                    }}
                    className={fieldClass}
                  >
                    <option value="">{t('Pilih provinsi', 'Select province')}</option>
                    {provinceOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t('Kota/Kabupaten', 'City/Regency')}</label>
                  <select
                    value={parentCityId}
                    onChange={(e) => {
                      const id = e.target.value
                      setParentCityId(id)
                      const selected = cityOptions.find((c) => c.id === id)
                      setParentCityName(selected?.name ?? '')
                      setParentDistrictId('')
                      setParentDistrictName('')
                    }}
                    className={fieldClass}
                    disabled={!parentProvinceId}
                  >
                    <option value="">{t('Pilih kota/kabupaten', 'Select city/regency')}</option>
                    {cityOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>{t('Kecamatan', 'District')}</label>
                <select
                  value={parentDistrictId}
                  onChange={(e) => {
                    const id = e.target.value
                    setParentDistrictId(id)
                    const selected = districtOptions.find((d) => d.id === id)
                    setParentDistrictName(selected?.name ?? '')
                  }}
                  className={fieldClass}
                  disabled={!parentCityId}
                >
                  <option value="">{t('Pilih kecamatan', 'Select district')}</option>
                  {districtOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t('Alamat Lengkap', 'Full Address')}</label>
                <textarea
                  value={parentAddressLine}
                  onChange={(e) => setParentAddressLine(e.target.value)}
                  className={textareaFieldClass}
                  rows={3}
                  placeholder={t('Contoh: Jl. Merdeka No. 10 RT 01 RW 02', 'Example: 10 Merdeka Street')}
                />
              </div>
            </>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {notice && <p className="text-sm text-emerald-600">{notice}</p>}
        </div>

        <div className="mt-8 flex justify-end pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="w-full sm:w-auto sm:min-w-[200px] rounded-xl px-6 py-3 text-base font-bold text-white min-h-[48px] shadow-sm shadow-blue-600/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}
          >
            {loading
              ? t('Memproses...', 'Processing...')
              : mode === 'signin'
                ? `${t('Masuk', 'Sign In')} →`
                : `${t('Daftar', 'Sign Up')} →`}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────────────── */
function ApexAppContent() {
  const { t, language, charityPoints, addCharityPoints, gradeLevel, isAuthenticated, userRole, logout, appName, appTagline, wellbeingMinutes } = useApex()

  const [activeView, setActiveView]       = useState<ViewType>(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem('apex-open-assessment') === '1') {
        window.sessionStorage.removeItem('apex-open-assessment')
        return 'assessment'
      }
    } catch {
      /* ignore */
    }
    return 'hub'
  })
  const [openChatSignal, setOpenChatSignal] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [showWellbeing, setShowWellbeing] = useState(false)
  const [showSettings, setShowSettings]   = useState(false)
  const [dyslexicMode, setDyslexicMode]   = useState(false)
  const allowedViews = useMemo(() => (userRole ? ROLE_ACCESS[userRole] : []), [userRole])
  const safeActiveView = (allowedViews.includes(activeView) ? activeView : allowedViews[0]) ?? 'hub'

  useEffect(() => {
    if (!mobileNavOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileNavOpen])

  if (!isAuthenticated || !userRole) {
    return <LoginGate />
  }

  /* Grade badge color */
  const gradeBadge = {
    sd:  { label: 'SD',      bg: '#10B981', text: 'white' },
    smp: { label: 'SMP',     bg: '#06B6D4', text: 'white' },
    smk: { label: 'SMA/SMK', bg: '#8B5CF6', text: 'white' },
  }[gradeLevel]

  const renderBySection = (section: string) =>
    (Object.entries(VIEW_META) as [ViewType, typeof VIEW_META[ViewType]][])
      .filter(([, m]) => m.section === section)
      .filter(([key]) => allowedViews.includes(key))
      .map(([key, m]) => (
        <NavButton
          key={key}
          icon={m.icon}
          label={t(m.id, m.en)}
          isActive={safeActiveView === key}
          onClick={() => {
            setOpenChatSignal(0)
            setActiveView(key)
          }}
          badge={VIEW_BADGES[key]}
        />
      ))

  const renderSidebarContent = () => (
    <>
      {/* Logo header */}
      <div
        className="h-[64px] flex items-center justify-center md:justify-start md:px-5 shrink-0"
        style={{ borderBottom: '1px solid #1E293B' }}
      >
        <ApexLogo size={32} showWordmark={true} wordmarkColor="#FFFFFF" layout="horizontal" />
      </div>

      {/* Tagline (desktop only) */}
      <div
        className="hidden md:block px-5 py-3"
        style={{ borderBottom: '1px solid #1E293B' }}
      >
        <p className="text-[10px] text-slate-500 leading-relaxed">
          {appTagline}
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {(['student', 'tools', 'eval'] as const).map((sec) => (
          <div key={sec} className="mb-1">
            <p
              className="text-[10px] font-bold uppercase tracking-widest text-slate-600 px-3 pt-3 pb-1.5"
              style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
            >
              {t(SECTIONS[sec].id, SECTIONS[sec].en)}
            </p>
            <div
              onClick={() => setMobileNavOpen(false)}
              onKeyDown={() => setMobileNavOpen(false)}
            >
              {renderBySection(sec)}
            </div>
          </div>
        ))}
      </nav>

      {/* Charity Points — Mutaba'ah teaser */}
      <div
        className="hidden md:block mx-3 mb-3 p-3 rounded-xl"
        style={{ background: 'rgba(249, 115, 22, 0.10)', border: '1px solid rgba(249, 115, 22, 0.2)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Heart size={13} style={{ color: '#F97316' }} />
          <span className="text-xs font-bold" style={{ color: '#F97316', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
            Charity Points
          </span>
        </div>
          <p className="text-lg font-black text-white">
            {charityPoints.toLocaleString(language === 'en' ? 'en-US' : 'id-ID')}
          </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          {t('Poin ibadah harianmu', 'Your daily ibadah points')}
        </p>
      </div>

      {/* Version */}
      <div
        className="hidden md:flex items-center justify-between px-4 py-3"
        style={{ borderTop: '1px solid #1E293B' }}
      >
        <p className="text-[10px] text-slate-600">{appName}</p>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06B6D4' }}
        >
          v2.0
        </span>
      </div>
    </>
  )

  return (
    <div
      className={`min-h-screen flex text-[#0A1128] relative overflow-hidden ${dyslexicMode ? 'font-dyslexic' : ''}`}
      style={{ background: '#F8FAFC', fontFamily: dyslexicMode ? undefined : "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Wellbeing overlay ──────────────────────────────────────────── */}
      <WellbeingOverlay show={showWellbeing} onClose={() => setShowWellbeing(false)} />

      {/* ── Settings Modal ─────────────────────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h2
                className="text-xl font-bold text-[#0A1128]"
                style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
              >
                {t('Pengaturan Platform', 'Platform Settings')}
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {/* Jenjang */}
            {userRole === 'admin' ? (
              <GradeSelector />
            ) : (
              <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <p
                  className="text-sm font-bold text-slate-700 mb-1"
                  style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
                >
                  🎓 {t('Jenjang Pendidikan', 'Education Level')}
                </p>
                <p className="text-xs text-slate-500">
                  {t(
                    'Jenjang pendidikan dikunci untuk siswa dan hanya dapat diubah oleh admin.',
                    'Education level is locked for students and can only be changed by admin.',
                  )}
                </p>
                <span
                  className="inline-flex mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: gradeBadge.bg, color: gradeBadge.text }}
                >
                  {gradeBadge.label}
                </span>
              </div>
            )}

            {/* Aksesibilitas */}
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <p
                className="text-sm font-bold text-slate-700 mb-3"
                style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
              >
                ♿ {t('Aksesibilitas', 'Accessibility')}
              </p>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-semibold text-slate-700">OpenDyslexic Font</p>
                  <p className="text-xs text-slate-500">{t('Membantu anak dengan disleksia', 'Helps children with dyslexia')}</p>
                </div>
                {/* Toggle switch */}
                <button
                  onClick={() => setDyslexicMode(!dyslexicMode)}
                  className="relative w-12 h-6 rounded-full transition-all duration-200"
                  style={{ background: dyslexicMode ? '#06B6D4' : '#CBD5E1' }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                    style={{ transform: dyslexicMode ? 'translateX(24px)' : 'translateX(0)' }}
                  />
                </button>
              </label>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full mt-4 py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 hover:opacity-90"
              style={{
                background: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              }}
            >
              {t('Simpan & Tutup', 'Save & Close')}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SIDEBAR — Deep Space Navy (#0F172A)
          Brand Blueprint: sidebar warna navy, aksen cyan, font Plus Jakarta Sans
          ════════════════════════════════════════════════════════════════════ */}
      <aside
        className="hidden md:flex w-64 flex-col shrink-0 h-screen sticky top-0 overflow-y-auto"
        style={{ background: '#0F172A', borderRight: '1px solid #1E293B' }}
      >
        {renderSidebarContent()}
      </aside>

      {/* Mobile sidebar drawer */}
      <div className={`md:hidden fixed inset-0 z-50 ${mobileNavOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${mobileNavOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileNavOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-[84%] max-w-[320px] flex flex-col transition-transform duration-300 ease-out ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ background: '#0F172A', borderRight: '1px solid #1E293B' }}
        >
          {renderSidebarContent()}
        </aside>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MAIN CONTENT
          ════════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">

        {/* ── Topbar ─────────────────────────────────────────────────── */}
        <header
          className="h-16 bg-white flex items-center justify-between px-4 md:px-6 shrink-0 gap-3"
          style={{ borderBottom: '1px solid #E2E8F0' }}
        >
          {/* Left: breadcrumb view title */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden p-2 rounded-xl hover:bg-slate-100 transition-colors"
              title={t('Buka Menu', 'Open Menu')}
              aria-label={t('Buka Menu', 'Open Menu')}
            >
              <Menu size={18} className="text-slate-600" />
            </button>
            <span className="text-slate-400 hidden md:block">
              {VIEW_META[safeActiveView].icon}
            </span>
            <ChevronRight size={14} className="text-slate-300 hidden md:block" />
            <h1
              className="font-bold text-[#0A1128] text-base truncate"
              style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
            >
              {t(VIEW_META[safeActiveView].id, VIEW_META[safeActiveView].en)}
            </h1>

            {/* Grade badge */}
            <span
              className="hidden md:inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ml-1"
              style={{ background: gradeBadge.bg, color: gradeBadge.text }}
            >
              {gradeBadge.label}
            </span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0">
            <LanguageToggle />

            {/* Wellbeing timer pill */}
            <button
              onClick={() => setShowWellbeing(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:opacity-90"
              style={{
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#059669',
              }}
              title={t('Klik untuk wellbeing break', 'Click for wellbeing break')}
            >
              <Clock size={13} />
              <span>{wellbeingMinutes} {t('mnt fokus', 'min focus')}</span>
            </button>

            {/* Sparkle — AI tutor shortcut */}
            <button
              onClick={() => {
                setOpenChatSignal(0)
                setActiveView('classroom')
              }}
              className="p-2 rounded-full transition-colors hover:opacity-80"
              style={{
                background: 'rgba(6, 182, 212, 0.10)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                color: '#06B6D4',
              }}
              title={t('Diskusi dengan Socrates 🦉', 'Discuss with Socrates 🦉')}
            >
              <Sparkles size={16} />
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-full hover:bg-slate-100 transition-colors"
              title={t('Pengaturan', 'Settings')}
            >
              <Settings size={18} className="text-slate-400" />
            </button>

            <button
              onClick={() => {
                void logout()
              }}
              className="p-2 rounded-full hover:bg-slate-100 transition-colors"
              title={t('Logout', 'Logout')}
            >
              <LogOut size={18} className="text-slate-500" />
            </button>
          </div>
        </header>

        {/* ── Content area ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6" style={{ background: '#F8FAFC' }}>
          <div className={`mx-auto ${safeActiveView === 'members-db' ? 'max-w-7xl' : 'max-w-4xl'}`}>
            {safeActiveView === 'hub'        && <LearningHub charityPoints={charityPoints} onAddCharityPoints={addCharityPoints} />}
            {safeActiveView === 'classroom'  && <AIClassroom openChatSignal={openChatSignal} />}
            {safeActiveView === 'spaced-rep' && <SpacedRepetition />}
            {safeActiveView === 'portfolio'  && <Portfolio />}
            {safeActiveView === 'parent'     && <ParentAnalytics />}
            {safeActiveView === 'mentor'     && <MentorPortal />}
            {safeActiveView === 'pomodoro'   && <PomodoroTimer />}
            {safeActiveView === 'schedule'   && <WeeklySchedule />}
            {safeActiveView === 'materials' && (
              <ModuleMaterials onOpenLearningHub={() => setActiveView('hub')} />
            )}
            {safeActiveView === 'brain-dump' && <BrainDump />}
            {safeActiveView === 'reflection' && <WeeklyReflection />}
            {safeActiveView === 'assessment' && <AssessmentHub />}
            {safeActiveView === 'milestone'  && <MilestoneTracker />}
            {safeActiveView === 'profile'    && <UserProfile />}
            {safeActiveView === 'admin'      && <AdminPanel />}
            {safeActiveView === 'members-db' && <AdminMembersDatabase />}
          </div>
        </div>

        {/* ── Bottom nav — Mobile ─────────────────────────────────────── */}
        <nav
          className="md:hidden flex items-center justify-around px-2 py-2 bg-white shrink-0"
          style={{ borderTop: '1px solid #E2E8F0' }}
        >
          {allowedViews.slice(0, 5).map((key) => {
            const m = VIEW_META[key]
            const isAct = safeActiveView === key
            return (
              <button
                key={key}
                onClick={() => {
                  setOpenChatSignal(0)
                  setActiveView(key)
                }}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all"
                style={{ color: isAct ? '#06B6D4' : '#94A3B8' }}
              >
                {m.icon}
                <span
                  className="text-[9px] font-bold"
                  style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
                >
                  {t(m.id.split(' ')[0], m.en.split(' ')[0])}
                </span>
                {isAct && (
                  <span className="w-1 h-1 rounded-full" style={{ background: '#06B6D4' }} />
                )}
              </button>
            )
          })}
        </nav>
      </main>

      <button
        onClick={() => {
          setActiveView('classroom')
          setOpenChatSignal((prev) => prev + 1)
        }}
        className="fixed right-4 bottom-20 md:right-5 md:bottom-5 z-40 w-12 h-12 md:w-auto md:h-auto md:px-4 py-3 rounded-full text-white font-bold text-sm shadow-lg inline-flex items-center justify-center md:justify-start gap-2"
        style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #2563EB 100%)' }}
        title={t('Tanya Socrates AI', 'Ask Socrates AI')}
        aria-label={t('Tanya Socrates AI', 'Ask Socrates AI')}
      >
        <Sparkles size={16} />
        <span className="hidden md:inline">{t('Tanya Socrates AI', 'Ask Socrates AI')}</span>
      </button>
    </div>
  )
}

/* ── Root export ─────────────────────────────────────────────────────────── */
export function ApexApp() {
  return (
    <ApexProvider>
      <ApexAppContent />
    </ApexProvider>
  )
}

