'use client'

import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import {
  X, LogOut, Plus, Trash2, Pencil, Save, Upload,
  Shield, Loader2, Check, AlertCircle, Search
} from 'lucide-react'
import * as admin from '@/lib/admin'

type Mode = 'closed' | 'login' | 'panel'

interface ColumnInfo {
  key: string
  type: string
  size: number
  required: boolean
  status: string
}

// ===================== MAIN COMPONENT =====================
export function AdminPanel() {
  const [mode, setMode] = useState<Mode>('closed')
  const [user, setUser] = useState<any>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    admin.getAdminUser().then((u) => {
      if (u) { setUser(u); setMode('panel') }
      setChecking(false)
    })
  }, [])

  const handleLogin = async (email: string, password: string) => {
    await admin.adminLogin(email, password)
    const u = await admin.getAdminUser()
    setUser(u)
    setMode('panel')
  }

  const handleLogout = async () => {
    await admin.adminLogout()
    setUser(null)
    setMode('closed')
  }

  if (checking) return null

  return (
    <>
      {mode !== 'panel' && (
        <button
          onClick={() => setMode('login')}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-background shadow-lg transition-all hover:scale-110 hover:shadow-xl"
          title="Admin Panel"
        >
          <Shield className="h-5 w-5" />
        </button>
      )}

      {mode === 'login' && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMode('closed')} />
          <div className="relative w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-2xl">
            <button onClick={() => setMode('closed')} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-gold/10">
                <Shield className="h-5 w-5 text-gold" />
              </div>
              <div>
                <h3 className="font-heading text-lg font-semibold">Admin Login</h3>
                <p className="text-xs text-muted-foreground">Enter your credentials</p>
              </div>
            </div>
            <LoginForm onSubmit={handleLogin} />
          </div>
        </div>
      )}

      {mode === 'panel' && (
        <Dashboard user={user} onLogout={handleLogout} />
      )}
    </>
  )
}

// ===================== LOGIN FORM =====================
function LoginForm({ onSubmit }: { onSubmit: (e: string, p: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Fill all fields'); return }
    setLoading(true)
    setError('')
    try {
      await onSubmit(email, password)
    } catch (err: any) {
      setError(err?.message || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          placeholder="admin@globallab.com"
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          placeholder="••••••••"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-gold hover:text-gold-foreground disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  )
}

// ===================== DASHBOARD =====================
function Dashboard({ user, onLogout }: { user: any; onLogout: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-background">
      {/* Top Bar */}
      <div className="flex shrink-0 items-center justify-between bg-primary px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-gold" />
          <h2 className="font-heading text-lg font-semibold text-primary-foreground">
            Admin Panel
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-primary-foreground/60 sm:block">{user?.email}</span>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 rounded-md border border-gold/40 px-3 py-1.5 text-xs text-gold transition-all hover:bg-gold hover:text-gold-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <RowsTab />
      </div>
    </div>
  )
}

// ===================== ROWS TAB =====================
function RowsTab() {
  const [documents, setDocuments] = useState<any[]>([])
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [formMode, setFormMode] = useState<null | 'add' | { edit: any }>(null)
  const [search, setSearch] = useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [docs, attrs] = await Promise.all([
        admin.getAllDocuments(),
        admin.getAttributes(),
      ])
      setDocuments(docs)
      setColumns(
        attrs.map((a: any) => ({
          key: a.key,
          type: a.type,
          size: a.size || 0,
          required: a.required || false,
          status: a.status || 'available',
        }))
      )
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this row? This cannot be undone.')) return
    try {
      await admin.deleteDocument(docId)
      fetchData()
    } catch (err: any) {
      alert(err?.message || 'Failed to delete')
    }
  }

  const filtered = search
    ? documents.filter((doc) =>
        columns.some((col) =>
          String(doc[col.key] || '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : documents

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFormMode('add')}
            className="flex items-center gap-2 rounded-md bg-gold px-4 py-2.5 text-xs font-medium text-gold-foreground transition-all hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> Add Row
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-xs text-muted-foreground transition-all hover:border-gold/50 hover:text-foreground"
          >
            Refresh
          </button>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rows..."
            className="w-full rounded-md border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-muted-foreground">Actions</th>
              {columns.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-4 py-3 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  {col.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {search ? 'No matching rows found.' : 'No rows yet. Click "Add Row" to create one.'}
                </td>
              </tr>
            ) : (
              filtered.map((doc) => (
                <tr key={doc.$id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setFormMode({ edit: doc })}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-gold/10 hover:text-gold"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.$id)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className="max-w-[200px] truncate px-4 py-3 text-foreground">
                      {renderCell(col.key, doc[col.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{filtered.length} row(s)</p>

      {/* Row Form Modal */}
      {formMode && (
        <RowFormModal
          columns={columns}
          editData={formMode === 'add' ? null : formMode.edit}
          onClose={() => setFormMode(null)}
          onSave={() => { setFormMode(null); fetchData() }}
        />
      )}
    </div>
  )
}

function renderCell(key: string, value: any) {
  if (key === 'Certificate_photograph' && value) {
    try {
      const url = admin.getImageUrl(value)
      return <img src={url} alt="Certificate" className="h-10 w-10 rounded border border-border object-cover" />
    } catch {
      return <span className="text-muted-foreground">—</span>
    }
  }
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>
  }
  return <span>{String(value)}</span>
}

// ===================== ROW FORM MODAL =====================
function RowFormModal({
  columns,
  editData,
  onClose,
  onSave,
}: {
  columns: ColumnInfo[]
  editData: any
  onClose: () => void
  onSave: () => void
}) {
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    if (!editData) return {}
    const data: Record<string, string> = {}
    columns.forEach((col) => {
      data[col.key] = editData[col.key] != null ? String(editData[col.key]) : ''
    })
    return data
  })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState<string>(
    editData?.Certificate_photograph ? admin.getImageUrl(editData.Certificate_photograph) : ''
  )
  const fileRef = useRef<HTMLInputElement>(null)

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fileId = await admin.uploadImage(file)
      setFormData((prev) => ({ ...prev, Certificate_photograph: fileId }))
      setImagePreview(URL.createObjectURL(file))
    } catch {
      alert('Image upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const cleanData: Record<string, unknown> = {}
      columns.forEach((col) => {
        const val = formData[col.key]
        if (val !== undefined) cleanData[col.key] = val
      })
      if (editData) {
        await admin.updateDocument(editData.$id, cleanData)
      } else {
        await admin.createDocument(cleanData)
      }
      onSave()
    } catch (err: any) {
      alert(err?.message || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold">
            {editData ? 'Edit Row' : 'Add Row'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {columns.map((col) => (
            <div key={col.key}>
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                {col.key}
                {col.required && <span className="ml-1 text-destructive">*</span>}
              </label>

              {col.key === 'Certificate_photograph' ? (
                <div className="mt-2">
                  {imagePreview && (
                    <div className="mb-3 relative inline-block">
                      <img src={imagePreview} alt="Preview" className="max-h-48 rounded-md border border-border object-contain" />
                      <button
                        type="button"
                        onClick={() => { setImagePreview(''); setFormData((p) => ({ ...p, Certificate_photograph: '' })) }}
                        className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-xs text-muted-foreground transition-all hover:border-gold/50 hover:text-gold disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploading ? 'Uploading...' : imagePreview ? 'Replace Image' : 'Upload Certificate Image'}
                  </button>
                  {formData.Certificate_photograph && (
                    <p className="mt-1 text-[10px] text-muted-foreground">File ID: {formData.Certificate_photograph}</p>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={formData[col.key] || ''}
                  onChange={(e) => handleChange(col.key, e.target.value)}
                  required={col.required}
                  placeholder={`Enter ${col.key}`}
                  className="mt-2 w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border px-4 py-3 text-xs font-medium text-muted-foreground transition-all hover:border-gold/50 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-xs font-medium text-gold-foreground transition-all hover:brightness-110 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editData ? (
                <Save className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {loading ? 'Saving...' : editData ? 'Update Row' : 'Add Row'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
