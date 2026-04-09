'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useApex } from '../apex-context'
import { getDailyGrowthMindsetMessage } from '../shared/growth-mindset'

type Role = 'student' | 'parent' | 'mentor' | 'admin'

type ProfilePayload = {
  role: Role
  userId?: string
  email: string
  avatarUrl?: string | null
  profile: Record<string, unknown>
}

export function UserProfile() {
  const { t } = useApex()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [data, setData] = useState<ProfilePayload | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarDeleting, setAvatarDeleting] = useState(false)
  const [cropSource, setCropSource] = useState<string | null>(null)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropX, setCropX] = useState(50)
  const [cropY, setCropY] = useState(50)
  const dragStartRef = useRef<{ x: number; y: number; cropX: number; cropY: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      if (!token) {
        setError(t('Sesi login tidak ditemukan.', 'Login session not found.'))
        return
      }
      const res = await fetch('/api/auth/profile', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = (await res.json()) as ProfilePayload & { message?: string }
      if (!res.ok) {
        setError(json.message ?? 'Request failed')
        return
      }
      setData(json)
      setForm(json.profile ?? {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const copyUserId = async () => {
    if (!data?.userId) return
    setNotice(null)
    setError(null)
    try {
      await navigator.clipboard.writeText(data.userId)
      setNotice(t('ID akun disalin ke papan klip.', 'Account ID copied to clipboard.'))
    } catch {
      setError(t('Gagal menyalin ID.', 'Failed to copy ID.'))
    }
  }

  const onSave = async () => {
    if (!data) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      if (!token) {
        setError(t('Sesi login tidak ditemukan.', 'Login session not found.'))
        return
      }
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(form),
      })
      const json = (await res.json().catch(() => ({}))) as { message?: string }
      if (!res.ok) {
        setError(json.message ?? t('Gagal menyimpan profil.', 'Failed to save profile.'))
        return
      }
      setNotice(t('Profil berhasil diperbarui.', 'Profile updated successfully.'))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const compressAvatar = async (
    file: File,
    crop?: { xPct: number; yPct: number; zoom: number },
  ): Promise<File> => {
    // Keep GIF as-is to preserve animation; optimize static images.
    if (file.type === 'image/gif') return file
    const bitmap = await createImageBitmap(file)
    const minSide = Math.min(bitmap.width, bitmap.height)
    const zoom = Math.max(1, Math.min(3, Number(crop?.zoom ?? 1)))
    const side = Math.max(1, Math.round(minSide / zoom))
    const cx = Math.round(((crop?.xPct ?? 50) / 100) * bitmap.width)
    const cy = Math.round(((crop?.yPct ?? 50) / 100) * bitmap.height)
    const half = Math.floor(side / 2)
    let sx = cx - half
    let sy = cy - half
    sx = Math.max(0, Math.min(bitmap.width - side, sx))
    sy = Math.max(0, Math.min(bitmap.height - side, sy))
    const target = Math.min(1024, side)
    const canvas = document.createElement('canvas')
    canvas.width = target
    canvas.height = target
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    )
    if (!blob) return file
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
  }

  const onAvatarFileSelected = async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(t('Avatar harus berupa gambar.', 'Avatar must be an image.'))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t('Ukuran avatar maksimal 2MB.', 'Avatar max size is 2MB.'))
      return
    }
    const url = URL.createObjectURL(file)
    setCropSource(url)
    setCropZoom(1)
    setCropX(50)
    setCropY(50)
    ;(window as unknown as { __apexAvatarFile?: File }).__apexAvatarFile = file
  }

  const onConfirmCropUpload = async () => {
    const sourceFile = (window as unknown as { __apexAvatarFile?: File }).__apexAvatarFile
    if (!sourceFile) return
    setAvatarUploading(true)
    setError(null)
    setNotice(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      if (!token) {
        setError(t('Sesi login tidak ditemukan.', 'Login session not found.'))
        return
      }
      const fd = new FormData()
      const optimized = await compressAvatar(sourceFile, { xPct: cropX, yPct: cropY, zoom: cropZoom })
      fd.append('file', optimized)
      const res = await fetch('/api/auth/profile/avatar', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: fd,
      })
      const json = (await res.json().catch(() => ({}))) as { message?: string; avatarUrl?: string }
      if (!res.ok) {
        setError(json.message ?? t('Gagal upload avatar.', 'Failed to upload avatar.'))
        return
      }
      setNotice(t('Avatar berhasil diperbarui.', 'Avatar updated successfully.'))
      setData((prev) => (prev ? { ...prev, avatarUrl: json.avatarUrl ?? prev.avatarUrl ?? null } : prev))
      setCropSource(null)
      delete (window as unknown as { __apexAvatarFile?: File }).__apexAvatarFile
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setAvatarUploading(false)
    }
  }

  const beginCropDrag = (clientX: number, clientY: number) => {
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      cropX,
      cropY,
    }
  }

  const moveCropDrag = (clientX: number, clientY: number) => {
    const start = dragStartRef.current
    if (!start) return
    // Drag sensitivity: pixel movement maps to percent movement in preview.
    const dx = (clientX - start.x) * 0.22
    const dy = (clientY - start.y) * 0.22
    setCropX(Math.max(0, Math.min(100, start.cropX + dx)))
    setCropY(Math.max(0, Math.min(100, start.cropY + dy)))
  }

  const endCropDrag = () => {
    dragStartRef.current = null
  }

  const onAvatarDelete = async () => {
    setAvatarDeleting(true)
    setError(null)
    setNotice(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      if (!token) {
        setError(t('Sesi login tidak ditemukan.', 'Login session not found.'))
        return
      }
      const res = await fetch('/api/auth/profile/avatar', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      const json = (await res.json().catch(() => ({}))) as { message?: string }
      if (!res.ok) {
        setError(json.message ?? t('Gagal menghapus avatar.', 'Failed to remove avatar.'))
        return
      }
      setData((prev) => (prev ? { ...prev, avatarUrl: null } : prev))
      setNotice(t('Avatar berhasil dihapus.', 'Avatar removed successfully.'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setAvatarDeleting(false)
    }
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400'
  const lockedInputClass =
    `${inputClass} bg-slate-100 text-slate-700 cursor-default border-slate-200/80 select-all`
  const labelClass = 'block text-sm font-semibold text-slate-700 mb-1.5'

  const roleTitle = useMemo(() => {
    if (!data) return ''
    if (data.role === 'student') return t('Profil Siswa', 'Student Profile')
    if (data.role === 'parent') return t('Profil Orang Tua', 'Parent Profile')
    if (data.role === 'mentor') return t('Profil Mentor', 'Mentor Profile')
    return t('Profil Admin', 'Admin Profile')
  }, [data, t])

  const studentGradeBadge = useMemo(() => {
    const grade = String(form.grade_level ?? '').toUpperCase()
    if (grade === 'SD') {
      return {
        label: 'SD',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      }
    }
    if (grade === 'SMK') {
      return {
        label: 'SMK',
        className: 'bg-violet-100 text-violet-800 border-violet-200',
      }
    }
    return {
      label: 'SMP',
      className: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    }
  }, [form.grade_level])

  const studentGrowthMindsetText = useMemo(() => {
    return getDailyGrowthMindsetMessage(
      t,
      'profile',
      `${String(data?.userId ?? data?.email ?? '')}:${String(form.grade_class_start ?? '')}`,
    )
  }, [data?.email, data?.userId, form.grade_class_start, t])

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        {t('Memuat profil…', 'Loading profile…')}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {error ?? t('Profil tidak ditemukan.', 'Profile not found.')}
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{roleTitle}</h2>
        <p className="text-sm text-slate-600 mt-1">
          {t('Email akun', 'Account email')}: <span className="font-semibold">{data.email}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-800">
          {t('Identitas & biodata (ringkas)', 'Identity & biodata summary')}
        </h3>
        <p className="text-xs text-slate-500">
          {t(
            'ID akun bersifat tetap dan tidak dapat diubah dari sini.',
            'Account ID is fixed and cannot be changed here.',
          )}
        </p>
        {data.userId ? (
          <div>
            <label className={labelClass}>{t('ID akun (UUID)', 'Account ID (UUID)')}</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                tabIndex={-1}
                className={`${lockedInputClass} flex-1 font-mono text-xs sm:text-sm`}
                value={data.userId}
                aria-readonly="true"
              />
              <button
                type="button"
                onClick={() => void copyUserId()}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 min-h-[44px]"
              >
                {t('Salin ID', 'Copy ID')}
              </button>
            </div>
          </div>
        ) : null}
        {data.role === 'student' ? (
          <dl className="grid gap-2 text-xs sm:grid-cols-2 sm:text-sm border-t border-slate-100 pt-3">
            <div>
              <dt className="font-semibold text-slate-500">{t('Nama (data tersimpan)', 'Name (saved)')}</dt>
              <dd className="text-slate-800">{String(form.full_name ?? '—')}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">{t('Jenjang (data tersimpan)', 'Grade band (saved)')}</dt>
              <dd className="text-slate-800">{String(form.grade_level ?? '—')}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">{t('Kelas awal / maks (baca saja)', 'Class start / max (read-only)')}</dt>
              <dd className="text-slate-800 font-mono">
                {form.grade_class_start != null ? String(form.grade_class_start) : '—'} /{' '}
                {form.grade_class_max != null ? String(form.grade_class_max) : '—'}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">{t('Tahun mulai kelas', 'Class start year')}</dt>
              <dd className="text-slate-800">{form.grade_class_start_year != null ? String(form.grade_class_start_year) : '—'}</dd>
            </div>
          </dl>
        ) : null}
        {data.role === 'parent' ? (
          <dl className="grid gap-2 text-xs sm:grid-cols-2 sm:text-sm border-t border-slate-100 pt-3">
            <div>
              <dt className="font-semibold text-slate-500">{t('Nama (data tersimpan)', 'Name (saved)')}</dt>
              <dd className="text-slate-800">{String(form.full_name ?? '—')}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">{t('ID Orang Tua (kunci)', 'Parent ID (locked)')}</dt>
              <dd className="text-slate-800 font-mono">{String(form.parent_link_code ?? '—')}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-slate-500">{t('HP (data tersimpan)', 'Phone (saved)')}</dt>
              <dd className="text-slate-800">{String(form.phone_number ?? '—')}</dd>
            </div>
          </dl>
        ) : null}
        {data.role === 'mentor' ? (
          <dl className="grid gap-2 text-xs border-t border-slate-100 pt-3">
            <div>
              <dt className="font-semibold text-slate-500">{t('Bidang (data tersimpan)', 'Expertise (saved)')}</dt>
              <dd className="text-slate-800">{String(form.expertise_area ?? '—')}</dd>
            </div>
          </dl>
        ) : null}
        {data.role === 'admin' ? (
          <p className="text-xs text-slate-600 border-t border-slate-100 pt-3">
            {t(
              'Admin: gunakan ID di atas untuk rujukan internal / dukungan.',
              'Admin: use the ID above for internal reference or support.',
            )}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="size-16 rounded-full overflow-hidden bg-slate-200 border border-slate-300 shrink-0">
          {data.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 font-bold">
              {String(form.full_name ?? data.email ?? 'U').slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 mb-1">{t('Foto Profil', 'Profile Photo')}</p>
          <p className="text-xs text-slate-500 mb-2">
            {t('Format: JPG/PNG/WEBP/GIF, maks 2MB.', 'Format: JPG/PNG/WEBP/GIF, max 2MB.')}
          </p>
          <p className="text-[11px] text-slate-500 mb-2">
            {t(
              'Foto otomatis di-crop kotak dari bagian tengah sebelum diunggah.',
              'Photos are auto center-cropped to square before upload.',
            )}
          </p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={avatarUploading || avatarDeleting}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              void onAvatarFileSelected(file)
              e.currentTarget.value = ''
            }}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700"
          />
          <button
            type="button"
            onClick={() => void onAvatarDelete()}
            disabled={!data.avatarUrl || avatarUploading || avatarDeleting}
            className="mt-2 inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {avatarDeleting ? t('Menghapus…', 'Removing…') : t('Hapus avatar', 'Remove avatar')}
          </button>
        </div>
      </div>

      {cropSource && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-bold text-slate-900">
                  {t('Atur Crop Avatar', 'Adjust Avatar Crop')}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {t(
                    'Geser posisi dan zoom sampai wajah pas di tengah.',
                    'Move and zoom until the face is centered.',
                  )}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                onClick={() => {
                  setCropSource(null)
                  delete (window as unknown as { __apexAvatarFile?: File }).__apexAvatarFile
                }}
                disabled={avatarUploading}
              >
                {t('Tutup', 'Close')}
              </button>
            </div>

            <div className="mx-auto size-64 max-w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cropSource}
                alt="crop-preview"
                className="absolute inset-0 h-full w-full object-cover cursor-grab active:cursor-grabbing select-none touch-none"
                style={{
                  transform: `scale(${cropZoom}) translate(${(cropX - 50) / 6}%, ${(cropY - 50) / 6}%)`,
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  beginCropDrag(e.clientX, e.clientY)
                }}
                onMouseMove={(e) => moveCropDrag(e.clientX, e.clientY)}
                onMouseUp={() => endCropDrag()}
                onMouseLeave={() => endCropDrag()}
                onTouchStart={(e) => {
                  const p = e.touches[0]
                  if (!p) return
                  beginCropDrag(p.clientX, p.clientY)
                }}
                onTouchMove={(e) => {
                  const p = e.touches[0]
                  if (!p) return
                  moveCropDrag(p.clientX, p.clientY)
                }}
                onTouchEnd={() => endCropDrag()}
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs text-slate-600 block">
                X
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={cropX}
                  onChange={(e) => setCropX(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <label className="text-xs text-slate-600 block">
                Y
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={cropY}
                  onChange={(e) => setCropY(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <label className="text-xs text-slate-600 block">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={cropZoom}
                  onChange={(e) => setCropZoom(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                onClick={() => {
                  setCropSource(null)
                  delete (window as unknown as { __apexAvatarFile?: File }).__apexAvatarFile
                }}
                disabled={avatarUploading}
              >
                {t('Batal', 'Cancel')}
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                onClick={() => void onConfirmCropUpload()}
                disabled={avatarUploading}
              >
                {avatarUploading ? t('Mengunggah…', 'Uploading…') : t('Simpan Crop', 'Save Crop')}
              </button>
            </div>
          </div>
        </div>
      )}

      {data.role === 'student' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-800">{t('Badge Jenjang Siswa', 'Student Grade Badge')}</p>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${studentGradeBadge.className}`}>
                {studentGradeBadge.label}
              </span>
            </div>
            <p className="text-xs text-slate-600 italic">
              {studentGrowthMindsetText}
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t('Nama Lengkap', 'Full Name')}</label>
            <input className={inputClass} value={String(form.full_name ?? '')} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>{t('Nama Orang Tua', 'Parent Name')}</label>
            <input className={lockedInputClass} value={String(form.parent_full_name ?? '')} readOnly tabIndex={-1} aria-readonly="true" />
          </div>
          <div>
            <label className={labelClass}>{t('Parent ID', 'Parent ID')}</label>
            <input className={lockedInputClass} value={String(form.parent_link_code ?? '')} readOnly tabIndex={-1} aria-readonly="true" />
          </div>
          <div>
            <label className={labelClass}>{t('Jenjang', 'Grade Level')}</label>
            <select className={inputClass} value={String(form.grade_level ?? 'SMP')} onChange={(e) => setForm((f) => ({ ...f, grade_level: e.target.value }))}>
              <option value="SD">SD</option>
              <option value="SMP">SMP</option>
              <option value="SMK">SMA/SMK</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('Tanggal Lahir', 'Birth Date')}</label>
            <input type="date" className={inputClass} value={String(form.birth_date ?? '')} onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t('Asal Sekolah', 'School Origin')}</label>
            <input className={inputClass} value={String(form.school_origin ?? '')} onChange={(e) => setForm((f) => ({ ...f, school_origin: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t('Visi Belajar', 'Learning Vision')}</label>
            <textarea className={`${inputClass} min-h-[90px]`} value={String(form.learning_vision ?? '')} onChange={(e) => setForm((f) => ({ ...f, learning_vision: e.target.value }))} />
          </div>
        </div>
      )}

      {data.role === 'parent' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>{t('Nama Lengkap', 'Full Name')}</label>
            <input className={inputClass} value={String(form.full_name ?? '')} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>{t('Nomor HP', 'Phone Number')}</label>
            <input className={inputClass} value={String(form.phone_number ?? '')} onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>{t('ID Orang Tua', 'Parent ID')}</label>
            <input
              className={lockedInputClass}
              value={String(form.parent_link_code ?? '')}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              {t(
                'ID Orang Tua dikunci untuk menjaga relasi akun. Hubungi admin jika perlu perubahan.',
                'Parent ID is locked to preserve account linkage. Contact admin if changes are needed.',
              )}
            </p>
          </div>
          <div>
            <label className={labelClass}>{t('Provinsi', 'Province')}</label>
            <input className={inputClass} value={String(form.province ?? '')} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>{t('Kota/Kabupaten', 'City/Regency')}</label>
            <input className={inputClass} value={String(form.city ?? '')} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t('Kecamatan', 'District')}</label>
            <input className={inputClass} value={String(form.district ?? '')} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t('Alamat Lengkap', 'Full Address')}</label>
            <textarea className={`${inputClass} min-h-[90px]`} value={String(form.address_line ?? '')} onChange={(e) => setForm((f) => ({ ...f, address_line: e.target.value }))} />
          </div>
        </div>
      )}

      {data.role === 'mentor' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>{t('Bidang Keahlian', 'Expertise Area')}</label>
            <input className={inputClass} value={String(form.expertise_area ?? '')} onChange={(e) => setForm((f) => ({ ...f, expertise_area: e.target.value }))} />
          </div>
        </div>
      )}

      {data.role === 'admin' && !data.userId && (
        <p className="text-sm text-slate-600">
          {t('Untuk admin, pengelolaan profil dasar saat ini menggunakan email akun.', 'For admins, basic profile is currently managed by account email.')}
        </p>
      )}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}

      {data.role !== 'admin' && (
        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60 min-h-[44px]"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}
          >
            {saving ? t('Menyimpan…', 'Saving…') : t('Simpan Profil', 'Save Profile')}
          </button>
        </div>
      )}
    </div>
  )
}

