'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Database, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useApex } from '../apex-context'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { ConfirmActionModal } from '../shared/confirm-action-modal'

type LinkedParent = {
  profileId: string | null
  userId: string | null
  fullName: string | null
  parentLinkCode: string | null
  email: string | null
}

type LinkedStudent = {
  userId: string | null
  fullName: string | null
  gradeLevel: string | null
  email: string | null
}

type MemberRow = {
  id: string
  email: string
  role: string
  createdAt: string
  registrationApproved: boolean
  registrationApprovedAt: string | null
  displayName: string | null
  student: {
    fullName: string | null
    gradeLevel: string | null
    learningVision: string | null
    schoolOrigin: string | null
    birthDate: string | null
    parentId: string | null
    linkedParent: LinkedParent | null
  } | null
  parent: {
    profileId: string | null
    fullName: string | null
    parentLinkCode: string | null
    phoneNumber: string | null
    email: string
    linkedStudents: LinkedStudent[]
  } | null
  mentor: { expertiseArea: string | null } | null
}

type EditDraft = {
  id: string
  email: string
  registrationApproved: boolean
  role: string
  studentFullName: string
  studentGradeLevel: string
  studentLearningVision: string
  studentSchoolOrigin: string
  studentBirthDate: string
  parentFullName: string
  parentPhoneNumber: string
  parentLinkCode: string
  mentorExpertiseArea: string
}

type ConfirmAction =
  | { kind: 'update'; draft: EditDraft }
  | { kind: 'delete'; row: MemberRow }

const PAGE_SIZE = 25

export function AdminMembersDatabase() {
  const { t } = useApex()
  const [items, setItems] = useState<MemberRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  const [role, setRole] = useState<string>('ALL')
  const [approval, setApproval] = useState<string>('all')
  const [q, setQ] = useState('')
  const [qDraft, setQDraft] = useState('')
  const [sort, setSort] = useState<'created_at' | 'email' | 'role'>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      if (!token) {
        setMessage(t('Sesi tidak ditemukan.', 'Session not found.'))
        return
      }
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sort,
        order,
        role,
        approval,
      })
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/members?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = (await res.json()) as {
        items?: MemberRow[]
        total?: number
        message?: string
      }
      if (!res.ok) {
        setMessage(data.message ?? t('Gagal memuat data.', 'Failed to load data.'))
        return
      }
      setItems(data.items ?? [])
      setTotal(typeof data.total === 'number' ? data.total : 0)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [approval, offset, order, q, role, sort, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!editDraft?.id) return
    const row = rowRefs.current[editDraft.id]
    if (!row) return
    row.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [editDraft?.id])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirmAction) {
        setConfirmAction(null)
        return
      }
      if (editDraft) {
        setEditDraft(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmAction, editDraft])

  const onSearch = () => {
    setOffset(0)
    setQ(qDraft)
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const roleLabel = (r: string) => {
    if (r === 'STUDENT') return t('Siswa', 'Student')
    if (r === 'PARENT') return t('Orang tua', 'Parent')
    if (r === 'MENTOR') return t('Mentor', 'Mentor')
    if (r === 'ADMIN') return t('Admin', 'Admin')
    return r
  }

  const beginEdit = (row: MemberRow) => {
    setEditDraft({
      id: row.id,
      email: row.email,
      registrationApproved: row.registrationApproved,
      role: row.role,
      studentFullName: row.student?.fullName ?? '',
      studentGradeLevel: row.student?.gradeLevel ?? 'SMP',
      studentLearningVision: row.student?.learningVision ?? '',
      studentSchoolOrigin: row.student?.schoolOrigin ?? '',
      studentBirthDate: row.student?.birthDate ?? '',
      parentFullName: row.parent?.fullName ?? '',
      parentPhoneNumber: row.parent?.phoneNumber ?? '',
      parentLinkCode: row.parent?.parentLinkCode ?? '',
      mentorExpertiseArea: row.mentor?.expertiseArea ?? '',
    })
  }

  const doUpdateMember = async (draft: EditDraft) => {
    setActingId(draft.id)
    setMessage(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      if (!token) throw new Error(t('Sesi tidak ditemukan.', 'Session not found.'))

      const body: Record<string, unknown> = {
        id: draft.id,
        email: draft.email,
        registrationApproved: draft.registrationApproved,
      }
      if (draft.role === 'STUDENT') {
        body.student = {
          fullName: draft.studentFullName,
          gradeLevel: draft.studentGradeLevel,
          learningVision: draft.studentLearningVision,
          schoolOrigin: draft.studentSchoolOrigin,
          birthDate: draft.studentBirthDate || null,
        }
      } else if (draft.role === 'PARENT') {
        body.parent = {
          fullName: draft.parentFullName,
          phoneNumber: draft.parentPhoneNumber,
          parentLinkCode: draft.parentLinkCode,
        }
      } else if (draft.role === 'MENTOR') {
        body.mentor = {
          expertiseArea: draft.mentorExpertiseArea,
        }
      }

      const res = await fetch('/api/admin/members', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? t('Gagal mengubah data.', 'Failed to update data.'))
      setMessage(data.message ?? t('Perubahan disimpan.', 'Changes saved.'))
      setEditDraft(null)
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('Gagal mengubah data.', 'Failed to update data.'))
    } finally {
      setActingId(null)
    }
  }

  const doDeleteMember = async (row: MemberRow) => {
    setActingId(row.id)
    setMessage(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      if (!token) throw new Error(t('Sesi tidak ditemukan.', 'Session not found.'))
      const res = await fetch(`/api/admin/members?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? t('Gagal menghapus data.', 'Failed to delete data.'))
      setMessage(data.message ?? t('Member dihapus.', 'Member deleted.'))
      if (editDraft?.id === row.id) setEditDraft(null)
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('Gagal menghapus data.', 'Failed to delete data.'))
    } finally {
      setActingId(null)
    }
  }

  const submitEdit = () => {
    if (!editDraft) return
    setConfirmAction({ kind: 'update', draft: editDraft })
  }

  const deleteMember = (row: MemberRow) => {
    setConfirmAction({ kind: 'delete', row })
  }

  const runConfirmedAction = async () => {
    if (!confirmAction) return
    const action = confirmAction
    setConfirmAction(null)
    if (action.kind === 'update') {
      await doUpdateMember(action.draft)
      return
    }
    await doDeleteMember(action.row)
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Database size={22} className="text-cyan-600" />
            {t('Database Member', 'Member database')}
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            {t(
              'Daftar seluruh pengguna, filter, urutkan, dan lihat relasi orang tua ↔ siswa.',
              'Browse all users with filters, sorting, and parent–student linkage.',
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('Muat ulang', 'Refresh')}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">{t('Peran', 'Role')}</label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value)
                setOffset(0)
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">{t('Semua', 'All')}</option>
              <option value="STUDENT">{t('Siswa', 'Student')}</option>
              <option value="PARENT">{t('Orang tua', 'Parent')}</option>
              <option value="MENTOR">{t('Mentor', 'Mentor')}</option>
              <option value="ADMIN">{t('Admin', 'Admin')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">{t('Verifikasi', 'Approval')}</label>
            <select
              value={approval}
              onChange={(e) => {
                setApproval(e.target.value)
                setOffset(0)
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">{t('Semua', 'All')}</option>
              <option value="approved">{t('Disetujui', 'Approved')}</option>
              <option value="pending">{t('Menunggu', 'Pending')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">{t('Urutkan', 'Sort by')}</label>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as typeof sort)
                setOffset(0)
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="created_at">{t('Tanggal daftar', 'Registered at')}</option>
              <option value="email">Email</option>
              <option value="role">{t('Peran', 'Role')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">{t('Arah', 'Order')}</label>
            <select
              value={order}
              onChange={(e) => {
                setOrder(e.target.value as typeof order)
                setOffset(0)
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="desc">{t('Terbaru / Z-A', 'Newest / Z-A')}</option>
              <option value="asc">{t('Terlama / A-Z', 'Oldest / A-Z')}</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-bold text-slate-600 block mb-1">
              {t('Cari (email atau nama)', 'Search (email or name)')}
            </label>
            <input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              placeholder="email / nama…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={onSearch}
            className="rounded-xl bg-slate-900 text-white px-5 py-2 text-sm font-bold hover:bg-slate-800"
          >
            {t('Cari', 'Search')}
          </button>
        </div>
      </div>

      {message ? (
        <p className="text-sm text-red-600 rounded-xl bg-red-50 border border-red-100 px-3 py-2">{message}</p>
      ) : null}

      <div className="text-xs text-slate-500">
        {t('Menampilkan', 'Showing')} {items.length} / {total} {t('anggota', 'members')}
        {totalPages > 1 ? ` · ${t('Halaman', 'Page')} ${page} / ${totalPages}` : ''}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm min-w-[1040px]">
          <thead>
            <tr className="bg-slate-100 text-slate-700 text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 font-bold">{t('Pengguna', 'User')}</th>
              <th className="px-3 py-2.5 font-bold">{t('Peran', 'Role')}</th>
              <th className="px-3 py-2.5 font-bold">{t('Status', 'Status')}</th>
              <th className="px-3 py-2.5 font-bold min-w-[280px]">{t('Relasi orang tua ↔ siswa', 'Parent ↔ student link')}</th>
              <th className="px-3 py-2.5 font-bold">{t('Aksi', 'Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  {t('Memuat…', 'Loading…')}
                </td>
              </tr>
            ) : null}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  {t('Tidak ada data.', 'No rows.')}
                </td>
              </tr>
            ) : null}
            {items.map((row) => (
              <Fragment key={row.id}>
                <tr
                  ref={(el) => {
                    rowRefs.current[row.id] = el
                  }}
                  className={`hover:bg-slate-50/80 align-top ${
                    editDraft?.id === row.id ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-200' : ''
                  }`}
                >
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-900">{row.displayName ?? '—'}</p>
                  <p className="text-slate-600 text-xs mt-0.5">{row.email}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-1 select-all">{row.id}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(row.createdAt).toLocaleString()}
                  </p>
                </td>
                <td className="px-3 py-3 text-slate-800">{roleLabel(row.role)}</td>
                <td className="px-3 py-3">
                  {row.registrationApproved ? (
                    <span className="inline-flex rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5">
                      {t('Disetujui', 'Approved')}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-amber-100 text-amber-900 text-xs font-bold px-2 py-0.5">
                      {t('Menunggu', 'Pending')}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-slate-700 space-y-2">
                  {row.role === 'STUDENT' && row.student ? (
                    <div className="rounded-xl bg-cyan-50 border border-cyan-100/80 p-2.5">
                      <p className="font-bold text-cyan-900 text-[11px] uppercase mb-1">
                        {t('Siswa → orang tua', 'Student → parent')}
                      </p>
                      {row.student.linkedParent ? (
                        <ul className="space-y-1 text-[11px]">
                          <li>
                            <span className="text-slate-500">{t('Nama', 'Name')}: </span>
                            {row.student.linkedParent.fullName ?? '—'}
                          </li>
                          <li>
                            <span className="text-slate-500">ID link: </span>
                            <code className="bg-white px-1 rounded">{row.student.linkedParent.parentLinkCode ?? '—'}</code>
                          </li>
                          <li>
                            <span className="text-slate-500">Email OT: </span>
                            {row.student.linkedParent.email ?? '—'}
                          </li>
                          <li className="font-mono text-slate-500">
                            user_id OT: {row.student.linkedParent.userId ?? '—'}
                          </li>
                        </ul>
                      ) : (
                        <p className="text-amber-800">{t('Belum terhubung ke profil orang tua.', 'Not linked to a parent profile.')}</p>
                      )}
                    </div>
                  ) : null}
                  {row.role === 'PARENT' && row.parent ? (
                    <div className="rounded-xl bg-violet-50 border border-violet-100/80 p-2.5">
                      <p className="font-bold text-violet-900 text-[11px] uppercase mb-1">
                        {t('Orang tua → siswa', 'Parent → students')}
                      </p>
                      <p className="text-[11px] mb-1">
                        <span className="text-slate-500">ID link: </span>
                        <code className="bg-white px-1 rounded">{row.parent.parentLinkCode ?? '—'}</code>
                        {row.parent.phoneNumber ? (
                          <>
                            {' '}
                            · HP: {row.parent.phoneNumber}
                          </>
                        ) : null}
                      </p>
                      {row.parent.linkedStudents.length === 0 ? (
                        <p className="text-slate-600">{t('Belum ada siswa terhubung.', 'No linked students yet.')}</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {row.parent.linkedStudents.map((s) => (
                            <li key={s.userId ?? s.fullName} className="border-t border-violet-100/80 pt-1.5 first:border-0 first:pt-0">
                              <span className="font-semibold">{s.fullName ?? '—'}</span>
                              <span className="text-slate-500"> · {s.gradeLevel ?? '—'}</span>
                              <br />
                              <span className="text-slate-600">{s.email ?? '—'}</span>
                              <span className="font-mono text-[10px] text-slate-400 block">{s.userId}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                  {row.role !== 'STUDENT' && row.role !== 'PARENT' ? (
                    <span className="text-slate-400">—</span>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={actingId === row.id}
                      onClick={() => beginEdit(row)}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      {t('Edit', 'Edit')}
                    </button>
                    <button
                      type="button"
                      disabled={actingId === row.id}
                      onClick={() => deleteMember(row)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {t('Hapus', 'Delete')}
                    </button>
                  </div>
                </td>
                </tr>

                {editDraft?.id === row.id ? (
                  <tr className="bg-slate-50/70">
                    <td colSpan={5} className="px-3 py-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-bold text-slate-900">
                            {t('Edit Data Member', 'Edit member data')} ·{' '}
                            <span className="font-mono text-xs">{editDraft.id}</span>
                          </h3>
                          <button
                            type="button"
                            onClick={() => setEditDraft(null)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            title={t('Tutup editor', 'Close editor')}
                          >
                            {t('Tutup', 'Close')}
                          </button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Email</label>
                            <input
                              value={editDraft.email}
                              onChange={(e) =>
                                setEditDraft((p) => (p ? { ...p, email: e.target.value } : p))
                              }
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 block mb-1">
                              {t('Status verifikasi', 'Approval status')}
                            </label>
                            <select
                              value={editDraft.registrationApproved ? 'approved' : 'pending'}
                              onChange={(e) =>
                                setEditDraft((p) =>
                                  p ? { ...p, registrationApproved: e.target.value === 'approved' } : p,
                                )
                              }
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="approved">{t('Disetujui', 'Approved')}</option>
                              <option value="pending">{t('Menunggu', 'Pending')}</option>
                            </select>
                          </div>
                          {editDraft.role === 'STUDENT' ? (
                            <>
                              <div>
                                <label className="text-xs font-semibold text-slate-600 block mb-1">
                                  {t('Nama siswa', 'Student name')}
                                </label>
                                <input
                                  value={editDraft.studentFullName}
                                  onChange={(e) =>
                                    setEditDraft((p) =>
                                      p ? { ...p, studentFullName: e.target.value } : p,
                                    )
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600 block mb-1">
                                  {t('Jenjang', 'Grade level')}
                                </label>
                                <select
                                  value={editDraft.studentGradeLevel}
                                  onChange={(e) =>
                                    setEditDraft((p) =>
                                      p ? { ...p, studentGradeLevel: e.target.value } : p,
                                    )
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                >
                                  <option value="SD">SD</option>
                                  <option value="SMP">SMP</option>
                                  <option value="SMK">SMK</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600 block mb-1">
                                  {t('Tanggal lahir', 'Birth date')}
                                </label>
                                <input
                                  type="date"
                                  value={editDraft.studentBirthDate}
                                  onChange={(e) =>
                                    setEditDraft((p) =>
                                      p ? { ...p, studentBirthDate: e.target.value } : p,
                                    )
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600 block mb-1">
                                  {t('Asal sekolah', 'School origin')}
                                </label>
                                <input
                                  value={editDraft.studentSchoolOrigin}
                                  onChange={(e) =>
                                    setEditDraft((p) =>
                                      p ? { ...p, studentSchoolOrigin: e.target.value } : p,
                                    )
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="text-xs font-semibold text-slate-600 block mb-1">
                                  {t('Visi belajar', 'Learning vision')}
                                </label>
                                <textarea
                                  value={editDraft.studentLearningVision}
                                  onChange={(e) =>
                                    setEditDraft((p) =>
                                      p ? { ...p, studentLearningVision: e.target.value } : p,
                                    )
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[86px]"
                                />
                              </div>
                            </>
                          ) : null}
                          {editDraft.role === 'PARENT' ? (
                            <>
                              <div>
                                <label className="text-xs font-semibold text-slate-600 block mb-1">
                                  {t('Nama orang tua', 'Parent name')}
                                </label>
                                <input
                                  value={editDraft.parentFullName}
                                  onChange={(e) =>
                                    setEditDraft((p) =>
                                      p ? { ...p, parentFullName: e.target.value } : p,
                                    )
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600 block mb-1">
                                  {t('Nomor HP', 'Phone')}
                                </label>
                                <input
                                  value={editDraft.parentPhoneNumber}
                                  onChange={(e) =>
                                    setEditDraft((p) =>
                                      p ? { ...p, parentPhoneNumber: e.target.value } : p,
                                    )
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="text-xs font-semibold text-slate-600 block mb-1">
                                  {t('Parent Link Code', 'Parent link code')}
                                </label>
                                <input
                                  value={editDraft.parentLinkCode}
                                  onChange={(e) =>
                                    setEditDraft((p) =>
                                      p ? { ...p, parentLinkCode: e.target.value } : p,
                                    )
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                                />
                              </div>
                            </>
                          ) : null}
                          {editDraft.role === 'MENTOR' ? (
                            <div className="sm:col-span-2">
                              <label className="text-xs font-semibold text-slate-600 block mb-1">
                                {t('Keahlian mentor', 'Mentor expertise')}
                              </label>
                              <input
                                value={editDraft.mentorExpertiseArea}
                                onChange={(e) =>
                                  setEditDraft((p) =>
                                    p ? { ...p, mentorExpertiseArea: e.target.value } : p,
                                  )
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              />
                            </div>
                          ) : null}
                        </div>
                        <div className="hidden sm:flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditDraft(null)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                          >
                            {t('Batal', 'Cancel')}
                          </button>
                          <button
                            type="button"
                            disabled={actingId === editDraft.id}
                            onClick={() => void submitEdit()}
                            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                          >
                            {actingId === editDraft.id
                              ? t('Menyimpan…', 'Saving…')
                              : t('Simpan perubahan', 'Save changes')}
                          </button>
                        </div>
                        <div className="sm:hidden sticky bottom-0 -mx-4 px-4 py-3 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setEditDraft(null)}
                              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                            >
                              {t('Batal', 'Cancel')}
                            </button>
                            <button
                              type="button"
                              disabled={actingId === editDraft.id}
                              onClick={() => void submitEdit()}
                              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                            >
                              {actingId === editDraft.id
                                ? t('Menyimpan…', 'Saving…')
                                : t('Simpan', 'Save')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmActionModal
        open={Boolean(confirmAction)}
        title={
          confirmAction?.kind === 'update'
            ? t('Konfirmasi perubahan data', 'Confirm data update')
            : t('Konfirmasi hapus data', 'Confirm member deletion')
        }
        description={
          confirmAction?.kind === 'update'
            ? t(
                'Apakah Anda yakin ingin menyimpan perubahan pada data member ini?',
                'Are you sure you want to save changes to this member?',
              )
            : t(
                `Apakah Anda yakin ingin menghapus member ${confirmAction?.kind === 'delete' ? confirmAction.row.email : ''}? Tindakan ini tidak bisa dibatalkan.`,
                `Are you sure to delete member ${confirmAction?.kind === 'delete' ? confirmAction.row.email : ''}? This action cannot be undone.`,
              )
        }
        confirmLabel={confirmAction?.kind === 'update' ? t('Ya, simpan', 'Yes, save') : t('Ya, hapus', 'Yes, delete')}
        cancelLabel={t('Batal', 'Cancel')}
        tone={confirmAction?.kind === 'update' ? 'primary' : 'danger'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void runConfirmedAction()}
      />

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
          >
            <ChevronLeft size={18} />
            {t('Sebelumnya', 'Previous')}
          </button>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
          >
            {t('Berikutnya', 'Next')}
            <ChevronRight size={18} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
