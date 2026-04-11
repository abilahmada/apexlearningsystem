'use client'

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import {
  createSupabaseBrowserClient,
  isRefreshTokenAuthError,
  purgeStaleSupabaseAuthStorage,
  resetSupabaseBrowserClientSingleton,
} from '@/lib/supabase/client'

export type GradeLevel = 'sd' | 'smp' | 'smk'
export type Language = 'id' | 'en'
export type UserRole = 'student' | 'parent' | 'mentor' | 'admin'

interface GradeLevelConfig {
  label: string
  labelEn: string
  pomodoroFocus: number // in minutes
  pomodoroBreak: number
  dailyTarget: number // hours
  subjects: string[]
}

export const gradeLevelConfigs: Record<GradeLevel, GradeLevelConfig> = {
  sd: {
    label: 'Sekolah Dasar (Kelas 1-6)',
    labelEn: 'Elementary School (Grade 1-6)',
    pomodoroFocus: 15,
    pomodoroBreak: 5,
    dailyTarget: 2,
    subjects: ['Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'IPA', 'IPS', 'Agama', 'Seni & Olahraga']
  },
  smp: {
    label: 'Sekolah Menengah Pertama (Kelas 7-9)',
    labelEn: 'Junior High School (Grade 7-9)',
    pomodoroFocus: 25,
    pomodoroBreak: 5,
    dailyTarget: 3,
    subjects: ['Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'IPA Terpadu', 'IPS Terpadu', 'Agama', 'TIK', 'Prakarya']
  },
  smk: {
    label: 'Sekolah Menengah Atas/Kejuruan (Kelas 10-12)',
    labelEn: 'Senior High/Vocational School (Grade 10-12)',
    pomodoroFocus: 50,
    pomodoroBreak: 10,
    dailyTarget: 4,
    subjects: ['Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'Fisika/Kimia/Biologi', 'Ekonomi/Sosiologi', 'Kejuruan/Peminatan', 'Project Based Learning']
  }
}

interface ApexContextType {
  gradeLevel: GradeLevel
  setGradeLevel: (level: GradeLevel) => void
  language: Language
  setLanguage: (lang: Language) => void
  config: GradeLevelConfig
  charityPoints: number
  addCharityPoints: (points: number) => void
  t: (id: string, en: string) => string
  userRole: UserRole | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>
  requestPasswordReset: (email: string) => Promise<{ ok: true } | { ok: false; message: string }>
  /** Kirim ulang email konfirmasi pendaftaran (Supabase). */
  resendSignupEmail: (email: string) => Promise<{ ok: true } | { ok: false; message: string }>
  signup: (
    email: string,
    password: string,
    role: UserRole,
    profile: {
      fullName: string
      phoneNumber?: string
      gradeLevel?: GradeLevel
      birthDate?: string
      schoolOrigin?: string
      gradeClassStart?: number
      gradeClassMax?: number
      learningVision?: string
      parentLinkCode?: string
      addressLine?: string
      province?: string
      city?: string
      district?: string
    },
  ) => Promise<
    | { ok: true; pendingAdminApproval: boolean; needsEmailConfirmation: boolean }
    | { ok: false; message: string }
  >
  logout: () => Promise<void>
  appName: string
  setAppName: (name: string) => void
  appTagline: string
  setAppTagline: (tagline: string) => void
  wellbeingMinutes: number
  setWellbeingMinutes: (minutes: number) => void
}

const ApexContext = createContext<ApexContextType | undefined>(undefined)

export function ApexProvider({ children }: { children: ReactNode }) {
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('smp')
  const [language, setLanguage] = useState<Language>('id')
  const [charityPoints, setCharityPoints] = useState(1250)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [appName, setAppName] = useState('APEX System')
  const [appTagline, setAppTagline] = useState('Belajar Mandiri, Bersaing Global.')
  const [wellbeingMinutes, setWellbeingMinutes] = useState(45)

  const config = gradeLevelConfigs[gradeLevel]

  const addCharityPoints = (points: number) => {
    setCharityPoints(prev => prev + points)
  }

  const t = (id: string, en: string) => language === 'id' ? id : en

  const normalizeGradeLevel = useCallback((raw: unknown): GradeLevel | null => {
    const t = String(raw ?? '').trim().toLowerCase()
    if (t === 'sd' || t === 'smp' || t === 'smk') return t
    return null
  }, [])

  const syncStudentGradeLevel = useCallback(async (accessToken: string) => {
    try {
      const res = await fetch('/api/auth/profile', {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as {
        role?: UserRole
        profile?: { grade_level?: string }
      }
      if (data.role !== 'student') return
      const normalized = normalizeGradeLevel(data.profile?.grade_level)
      if (normalized) setGradeLevel(normalized)
    } catch {
      // keep fallback default if profile endpoint unavailable
    }
  }, [normalizeGradeLevel])

  const fetchAppRole = useCallback(async (accessToken: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({ message: 'Unauthorized' }))) as { message?: string }
        return { ok: false as const, message: errorData.message ?? 'Unauthorized' }
      }

      const data = (await res.json()) as { role: UserRole }
      setUserRole(data.role)
      if (data.role === 'student') {
        await syncStudentGradeLevel(accessToken)
      }
      return { ok: true as const }
    } catch (e) {
      const failedFetch =
        e instanceof TypeError &&
        (String(e.message).includes('fetch') || String(e.message).includes('Load failed'))
      return {
        ok: false as const,
        message: failedFetch
          ? 'Tidak terhubung ke server aplikasi (Failed to fetch). Pastikan `npm run dev` berjalan dan buka lewat http://localhost:3000 (bukan file://).'
          : e instanceof Error
            ? e.message
            : 'Jaringan bermasalah.',
      }
    }
  }, [syncStudentGradeLevel])

  const login = async (email: string, password: string) => {
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        return { ok: false as const, message: error.message }
      }

      let accessToken: string | null = data.session?.access_token ?? null
      if (!accessToken) {
        // Fallback: on some clients, session can be set a moment after signIn resolves.
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
        accessToken = sessionData.session?.access_token ?? null
        if (sessionErr) {
          return { ok: false as const, message: sessionErr.message }
        }
      }

      if (!accessToken) {
        return {
          ok: false as const,
          message: t(
            'Login berhasil tetapi token sesi belum tersedia. Coba lagi dalam beberapa detik.',
            'Login succeeded but session token is not available yet. Please try again in a few seconds.',
          ),
        }
      }
      return await fetchAppRole(accessToken)
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : 'Login gagal' }
    }
  }

  const mapSignupDbError = (raw: string) => {
    const lower = raw.toLowerCase()
    if (raw.includes('AUTH_PUBLIC_USERS_EMAIL_CONFLICT_DIFFERENT_ID')) {
      return t(
        'Email sudah dipakai baris lama di database yang tidak selaras dengan Auth (beda ID). Hubungi admin untuk merapikan public.users atau gunakan email lain.',
        'This email is tied to a legacy public.users row with a different id than Auth. Ask an admin to fix the data or use another email.',
      )
    }
    if (
      lower.includes('already registered') ||
      lower.includes('already been registered') ||
      lower.includes('user already exists') ||
      lower.includes('email address is already') ||
      lower.includes('duplicate key') ||
      lower.includes('unique constraint')
    ) {
      return t(
        'Email ini sudah terdaftar. Gunakan tab Masuk, atau reset password dari layar login jika lupa.',
        'This email is already registered. Use Sign in, or reset your password from the login screen if you forgot it.',
      )
    }
    if (raw.includes('STUDENT_SIGNUP_INVALID_PARENT_LINK_CODE')) {
      return t(
        'ID Orang Tua tidak terdaftar. Minta kode dari orang tua di menu Portal Orang Tua.',
        'Parent ID is not registered. Ask your parent for their code from the Parent Portal.',
      )
    }
    if (raw.includes('STUDENT_SIGNUP_MISSING_PARENT_LINK_CODE')) {
      return t('ID Orang Tua wajib diisi untuk siswa.', 'Parent ID is required for students.')
    }
    if (/Database error (saving|creating) new user/i.test(raw)) {
      return t(
        'Pendaftaran gagal: trigger database (public.users / profil) menolak. Buka Supabase → Logs → Postgres, cari ERROR saat signup, atau jalankan migrasi SQL terbaru lalu coba lagi.',
        'Sign-up failed: the database trigger (public.users / profiles) rejected the operation. Open Supabase → Logs → Postgres, search for ERROR at signup time, or apply the latest SQL migrations and retry.',
      )
    }
    if (lower.includes('email address not authorized')) {
      return t(
        'Email penerima tidak diizinkan oleh SMTP bawaan Supabase. Aktifkan Custom SMTP di Dashboard (Authentication → SMTP) atau daftarkan email ke tim organisasi.',
        'This recipient is not allowed on Supabase default SMTP. Enable Custom SMTP (Authentication → SMTP) in the Dashboard, or add the address to your org team.',
      )
    }
    if (
      lower.includes('error sending') ||
      lower.includes('sending confirmation') ||
      lower.includes('smtp') ||
      lower.includes('mailer')
    ) {
      return t(
        'Gagal mengirim email verifikasi. Cek pengaturan SMTP di Supabase (host, port 587, user, password, alamat pengirim) dan domain di Mailketing.',
        'Failed to send verification email. Check SMTP in Supabase (host, port 587, user, password, sender) and your domain in Mailketing.',
      )
    }
    return raw
  }

  const signup = async (
    email: string,
    password: string,
    role: UserRole,
    profile: {
      fullName: string
      phoneNumber?: string
      gradeLevel?: GradeLevel
      birthDate?: string
      schoolOrigin?: string
      gradeClassStart?: number
      gradeClassMax?: number
      learningVision?: string
      parentLinkCode?: string
      addressLine?: string
      province?: string
      city?: string
      district?: string
    },
  ) => {
    try {
      if (role === 'admin') {
        return { ok: false as const, message: 'Signup admin tidak diizinkan dari form publik.' }
      }

      const emailTrimmed = email.trim()
      if (!emailTrimmed) {
        return { ok: false as const, message: t('Email wajib diisi.', 'Email is required.') }
      }

      const regRes = await fetch(
        `/api/auth/email-registered?email=${encodeURIComponent(emailTrimmed)}`,
        { cache: 'no-store' },
      )
      const regJson = (await regRes.json().catch(() => ({}))) as {
        registered?: boolean
        message?: string
      }
      if (regRes.ok && regJson.registered === true) {
        return {
          ok: false as const,
          message: t(
            'Email ini sudah terdaftar. Gunakan Masuk dengan email dan password yang sama.',
            'This email is already registered. Please sign in with that email and password.',
          ),
        }
      }

      if (role === 'student') {
        const code = profile.parentLinkCode?.trim()
        if (!code) {
          return { ok: false as const, message: t('ID Orang Tua wajib diisi.', 'Parent ID is required.') }
        }
        const vRes = await fetch(
          `/api/auth/validate-parent-link?code=${encodeURIComponent(code)}`,
          { cache: 'no-store' },
        )
        const vJson = (await vRes.json().catch(() => ({}))) as { valid?: boolean; message?: string }
        if (!vRes.ok || !vJson.valid) {
          return {
            ok: false as const,
            message:
              vJson.message ??
              t('ID Orang Tua tidak valid.', 'Invalid parent ID.'),
          }
        }
      }

      const signupRes = await fetch('/api/auth/signup-admin-verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailTrimmed,
          password,
          role,
          profile,
        }),
      })
      const signupJson = (await signupRes.json().catch(() => ({}))) as {
        message?: string
        pendingAdminApproval?: boolean
      }
      if (!signupRes.ok) {
        if (signupRes.status === 404) {
          return {
            ok: false as const,
            message: t(
              'Endpoint signup admin belum aktif (404). Restart server `npm run dev` lalu coba lagi. Jika production, pastikan deploy terbaru sudah jalan.',
              'Admin signup endpoint is not active (404). Restart `npm run dev` and try again. For production, ensure latest deploy is running.',
            ),
          }
        }
        if (signupRes.status >= 500) {
          return {
            ok: false as const,
            message: t(
              'Server signup error. Cek ENV server: SUPABASE_SERVICE_ROLE_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, APP_BASE_URL.',
              'Server signup error. Check server ENV: SUPABASE_SERVICE_ROLE_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, APP_BASE_URL.',
            ),
          }
        }
        return {
          ok: false as const,
          message: mapSignupDbError(signupJson.message ?? 'Signup gagal'),
        }
      }

      return {
        ok: true as const,
        pendingAdminApproval: signupJson.pendingAdminApproval === true,
        needsEmailConfirmation: false,
      }
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : 'Signup gagal' }
    }
  }

  const resendSignupEmail = async (email: string) => {
    try {
      const supabase = createSupabaseBrowserClient()
      const trimmed = email.trim()
      if (!trimmed) {
        return { ok: false as const, message: t('Email wajib diisi.', 'Email is required.') }
      }
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        return { ok: false as const, message: error.message }
      }
      return { ok: true as const }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : t('Gagal mengirim email.', 'Failed to send email.'),
      }
    }
  }

  const requestPasswordReset = async (email: string) => {
    try {
      const supabase = createSupabaseBrowserClient()
      const trimmed = email.trim()
      if (!trimmed) {
        return { ok: false as const, message: t('Email wajib diisi.', 'Email is required.') }
      }
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (error) {
        return { ok: false as const, message: error.message }
      }
      return { ok: true as const }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : t('Gagal mengirim email.', 'Failed to send email.'),
      }
    }
  }

  const logout = async () => {
    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
    } finally {
      setUserRole(null)
    }
  }

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem('apex-language')
    if (savedLanguage === 'id' || savedLanguage === 'en') {
      setLanguage(savedLanguage)
    }

    const clearBrokenAuthSession = async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        /* ignore */
      }
      purgeStaleSupabaseAuthStorage()
      resetSupabaseBrowserClientSingleton()
      setUserRole(null)
    }

    const initAuth = async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase.auth.getSession()
        if (error && isRefreshTokenAuthError(error.message)) {
          await clearBrokenAuthSession()
          return
        }
        const token = data.session?.access_token
        if (!token) {
          setUserRole(null)
          return
        }
        const result = await fetchAppRole(token)
        if (!result.ok) setUserRole(null)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isRefreshTokenAuthError(msg)) {
          await clearBrokenAuthSession()
          return
        }
        setUserRole(null)
      }
    }

    void initAuth()

    const supabase = createSupabaseBrowserClient()
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        const token = session?.access_token
        if (!token) {
          setUserRole(null)
          return
        }
        const result = await fetchAppRole(token)
        // Jangan hapus sesi UI hanya karena /api/auth/me error sementara (jaringan, deploy).
        if (!result.ok && event === 'SIGNED_OUT') setUserRole(null)
      } catch {
        /* fetchAppRole tidak boleh melempar setelah try/catch di dalamnya; ini cadangan agar Supabase subscriber tidak crash */
      }
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }, [fetchAppRole])

  useEffect(() => {
    window.localStorage.setItem('apex-language', language)
    window.dispatchEvent(new CustomEvent('apex-language-change', { detail: language }))
  }, [language])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' })
        if (!res.ok) return

        const data = (await res.json()) as {
          app_name?: string
          app_tagline?: string
          wellbeing_minutes?: number
        }

        if (data.app_name) setAppName(data.app_name)
        if (data.app_tagline) setAppTagline(data.app_tagline)
        if (typeof data.wellbeing_minutes === 'number') {
          setWellbeingMinutes(data.wellbeing_minutes)
        }
      } catch {
        // keep defaults if backend is unavailable
      }
    }

    loadSettings()
  }, [])

  return (
    <ApexContext.Provider value={{
      gradeLevel,
      setGradeLevel,
      language,
      setLanguage,
      config,
      charityPoints,
      addCharityPoints,
      t,
      userRole,
      isAuthenticated: userRole !== null,
      login,
      requestPasswordReset,
      resendSignupEmail,
      signup,
      logout,
      appName,
      setAppName,
      appTagline,
      setAppTagline,
      wellbeingMinutes,
      setWellbeingMinutes
    }}>
      {children}
    </ApexContext.Provider>
  )
}

export function useApex() {
  const context = useContext(ApexContext)
  if (!context) {
    throw new Error('useApex must be used within an ApexProvider')
  }
  return context
}
