'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  X, LogOut, Plus, Trash2, Pencil, Save, Upload, Download,
  Shield, Loader2, AlertCircle, Search, FileArchive, RefreshCw, Check, QrCode, ScanLine
} from 'lucide-react'
import * as admin from '@/lib/admin'
import {
  buildCertificateImagesZip,
  bulkFixCertificateQrs,
  certificatesZipFileName,
  type BulkProgress,
  type BulkQrFixSummary,
  type CertificateZipResult,
} from '@/lib/admin-bulk'
import {
  buildExportZip,
  exportFileName,
  fetchAllDocuments,
  type ExportProgress,
} from '@/lib/admin-export'
import { CertificateQrAction, CertificateQrCell } from '@/components/certificate-qr-dialog'
import { CertificateQrFixAction } from '@/components/certificate-qr-fix-dialog'
import { csvRowToDocument, getCsvMapping as mapCsvHeaders } from '@/lib/csv-import'
import { parseCSV, type ParsedCSV } from '@/lib/csv'
import { recognizeCertificateText } from '@/lib/certificate-ocr'
import {
  AUTOFILL_CONFIDENCE,
  extractCertificateFields,
  verifyCertificateNumber,
  type ExtractedField,
} from '@/lib/certificate-field-extractor'

type Mode = 'closed' | 'login' | 'panel'

interface ColumnInfo {
  key: string
  type: string
  size: number
  required: boolean
  status: string
}

type UploadedImagePayload = {
  objectKey: string
  attachmentToken: string
  originalName: string
  thumbnailDataUrl?: string
}

// ===================== MAIN COMPONENT =====================
export function AdminPanel() {
  const [mode, setMode] = useState<Mode>('closed')
  const [user, setUser] = useState<any>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    admin.getAdminUser().then((u) => {
      if (u) {
        setUser(u)
        setMode('panel')
      }
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
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
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [totalRows, setTotalRows] = useState(0)
  const hasLoadedRef = useRef(false)
  const searchDebounceReadyRef = useRef(false)

  // CSV state
  const [csvModal, setCsvModal] = useState(false)
  const [csvData, setCsvData] = useState<ParsedCSV | null>(null)
  const [csvFileName, setCsvFileName] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvProgress, setCsvProgress] = useState({ done: 0, failed: 0, total: 0 })
  const [csvRowErrors, setCsvRowErrors] = useState<string[]>([])
  const [csvDone, setCsvDone] = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const csvStopRef = useRef(false)

  // Export state
  const [exportModal, setExportModal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [exportResult, setExportResult] = useState<{ rows: number; warning: boolean } | null>(null)
  const [exportError, setExportError] = useState('')
  const exportAbortRef = useRef<AbortController | null>(null)

  // Refresh state
  const [showQrs, setShowQrs] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState<null | 'updated' | 'failed'>(null)
  const refreshStatusTimerRef = useRef<number | null>(null)

  // Row selection and bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulk, setBulk] = useState<
    | null
    | { kind: 'fix-qr'; running: boolean; progress: BulkProgress | null; result?: BulkQrFixSummary; error?: string }
    | { kind: 'download'; running: boolean; progress: BulkProgress | null; result?: CertificateZipResult; error?: string }
  >(null)
  const bulkAbortRef = useRef<AbortController | null>(null)

  // Resolves true when the page loaded, false when the request failed.
  const fetchData = useCallback(async (nextPage: number, nextSearch: string): Promise<boolean> => {
    if (!hasLoadedRef.current) {
      setLoading(true)
    }
    try {
      const [list, attrs] = await Promise.all([
        admin.getDocumentsPage({ page: nextPage, pageSize, search: nextSearch }),
        admin.getAttributes(),
      ])
      setDocuments(list.documents)
      // Keep only selections still visible on the loaded page (a page or search change clears them).
      const visible = new Set(list.documents.map((doc) => String(doc.$id)))
      setSelectedIds((prev) => {
        const next = new Set([...prev].filter((id) => visible.has(id)))
        return next.size === prev.size ? prev : next
      })
      setPage(list.page)
      setTotalRows(list.total)
      setColumns(
        attrs.map((a: any) => ({
          key: a.key,
          type: a.type,
          size: a.size || 0,
          required: a.required || false,
          status: a.status || 'available',
        }))
      )
      return true
    } catch (err) {
      console.error(err)
      return false
    } finally {
      hasLoadedRef.current = true
      setLoading(false)
    }
  }, [pageSize])

  useEffect(() => { fetchData(1, '') }, [fetchData])

  useEffect(() => {
    if (!searchDebounceReadyRef.current) {
      searchDebounceReadyRef.current = true
      return
    }

    const timeout = window.setTimeout(() => {
      fetchData(1, search)
    }, 500)

    return () => window.clearTimeout(timeout)
  }, [fetchData, search])

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this row? This cannot be undone.')) return
    try {
      await admin.deleteDocument(docId)
      fetchData(page, search)
    } catch (err: any) {
      alert(err?.message || 'Failed to delete')
    }
  }

  // CSV handlers
  const handleCsvSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.rows.length > 500) {
        parsed.errors.push({ row: 0, message: 'CSV import is limited to 500 rows at a time' })
      }
      setCsvData(parsed)
      setCsvModal(true)
      setCsvDone(false)
      setCsvRowErrors([])
      setCsvProgress({ done: 0, failed: 0, total: 0 })
    }
    reader.readAsText(file)
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  const handleCsvImport = async () => {
    if (!csvData) return
    if (csvData.errors.length > 0) {
      alert('Fix the CSV errors before importing.')
      return
    }
    csvStopRef.current = false
    setCsvImporting(true)
    setCsvDone(false)
    setCsvRowErrors([])
    const columnKeys = columns.map((c) => c.key)
    const total = csvData.rows.length
    let done = 0
    let failed = 0
    setCsvProgress({ done: 0, failed: 0, total })

    for (let rowIndex = 0; rowIndex < csvData.rows.length; rowIndex++) {
      if (csvStopRef.current) break
      const row = csvData.rows[rowIndex]
      const doc = csvRowToDocument(csvData.headers, row, columnKeys)
      try {
        await admin.createDocument(doc)
        done++
      } catch (err) {
        failed++
        const rowNumber = rowIndex + 2
        const message = err instanceof Error ? err.message : 'Import failed'
        setCsvRowErrors((prev) => [...prev, `Row ${rowNumber}: ${message}`])
      }
      setCsvProgress({ done, failed, total })
    }

    setCsvImporting(false)
    setCsvDone(true)
    fetchData(1, search)
  }

  const closeCsvModal = () => {
    if (csvImporting) {
      csvStopRef.current = true
      return
    }
    setCsvModal(false)
  }

  // Refresh handlers
  useEffect(() => () => {
    if (refreshStatusTimerRef.current !== null) window.clearTimeout(refreshStatusTimerRef.current)
  }, [])

  const handleRefresh = async () => {
    if (refreshStatusTimerRef.current !== null) window.clearTimeout(refreshStatusTimerRef.current)
    setRefreshing(true)
    setRefreshStatus(null)
    const ok = await fetchData(page, search)
    setRefreshing(false)
    setRefreshStatus(ok ? 'updated' : 'failed')
    // Keep failures visible until the next attempt; success fades after a moment.
    refreshStatusTimerRef.current = ok
      ? window.setTimeout(() => setRefreshStatus(null), 2500)
      : null
  }

  // Export handlers
  const handleExport = async () => {
    const controller = new AbortController()
    exportAbortRef.current = controller
    setExportModal(true)
    setExporting(true)
    setExportProgress(null)
    setExportResult(null)
    setExportError('')

    try {
      const options = { signal: controller.signal, onProgress: setExportProgress }
      const { documents, changedDuringExport } = await fetchAllDocuments(
        (nextPage, nextPageSize) => admin.getDocumentsPage({ page: nextPage, pageSize: nextPageSize }),
        options
      )
      const zip = await buildExportZip(documents, columns.map((c) => c.key), options)

      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = exportFileName()
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      setExportResult({ rows: documents.length, warning: changedDuringExport })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setExportModal(false)
      } else {
        setExportError(err instanceof Error ? err.message : 'Export failed')
      }
    } finally {
      exportAbortRef.current = null
      setExporting(false)
    }
  }

  const closeExportModal = () => {
    if (exporting) {
      exportAbortRef.current?.abort()
      return
    }
    setExportModal(false)
  }

  const exportStatus = (progress: ExportProgress | null) => {
    if (!progress) return 'Starting...'
    if (progress.phase === 'fetching') return `Fetching rows ${progress.done} / ${progress.total}`
    if (progress.phase === 'qr') return `Generating QR ${progress.done} / ${progress.total}`
    return 'Building zip...'
  }

  // Selection + bulk handlers
  const selectedDocs = documents.filter((doc) => selectedIds.has(String(doc.$id)))
  const allSelected = documents.length > 0 && selectedDocs.length === documents.length
  const someSelected = selectedDocs.length > 0 && !allSelected

  const toggleRow = (docId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(documents.map((doc) => String(doc.$id))))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleBulkFixQr = async () => {
    const controller = new AbortController()
    bulkAbortRef.current = controller
    setBulk({ kind: 'fix-qr', running: true, progress: null })
    try {
      const result = await bulkFixCertificateQrs(selectedDocs, admin.fixCertificateQr, {
        signal: controller.signal,
        onProgress: (progress) => setBulk((prev) => (prev ? { ...prev, progress } : prev)),
      })
      setBulk({ kind: 'fix-qr', running: false, progress: null, result })
    } catch (err) {
      setBulk(
        err instanceof DOMException && err.name === 'AbortError'
          ? null
          : { kind: 'fix-qr', running: false, progress: null, error: err instanceof Error ? err.message : 'Bulk Fix QR failed' }
      )
    } finally {
      bulkAbortRef.current = null
      fetchData(page, search)
    }
  }

  const handleBulkDownload = async () => {
    const controller = new AbortController()
    bulkAbortRef.current = controller
    setBulk({ kind: 'download', running: true, progress: null })
    try {
      const result = await buildCertificateImagesZip(
        selectedDocs,
        (url, signal) => fetch(url, { credentials: 'include', signal }),
        {
          signal: controller.signal,
          onProgress: (progress) => setBulk((prev) => (prev ? { ...prev, progress } : prev)),
        }
      )
      const url = URL.createObjectURL(new Blob([result.zip as BlobPart], { type: 'application/zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = certificatesZipFileName()
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setBulk({ kind: 'download', running: false, progress: null, result })
    } catch (err) {
      setBulk(
        err instanceof DOMException && err.name === 'AbortError'
          ? null
          : { kind: 'download', running: false, progress: null, error: err instanceof Error ? err.message : 'Download failed' }
      )
    } finally {
      bulkAbortRef.current = null
    }
  }

  const closeBulkModal = () => {
    if (bulk?.running) {
      bulkAbortRef.current?.abort()
      return
    }
    setBulk(null)
  }

  const getCsvMapping = () => {
    if (!csvData) return []
    const columnKeys = columns.map((c) => c.key)
    return mapCsvHeaders(csvData.headers, columnKeys)
  }

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const goToPage = (nextPage: number) => {
    fetchData(Math.min(totalPages, Math.max(1, nextPage)), search)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="mb-6 flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {selectedDocs.length > 0 ? (
        <div className="flex items-center gap-3" role="toolbar" aria-label="Bulk actions for selected rows">
          <button
            type="button"
            onClick={clearSelection}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Clear selection"
            title="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-xs text-foreground">{selectedDocs.length} selected</span>
          <button
            type="button"
            onClick={handleBulkFixQr}
            disabled={bulk?.running}
            className="flex items-center gap-2 rounded-md bg-gold px-4 py-2.5 text-xs font-medium text-gold-foreground transition-all hover:brightness-110 disabled:opacity-50"
          >
            <ScanLine className="h-4 w-4" /> Bulk Fix QR
          </button>
          <button
            type="button"
            onClick={handleBulkDownload}
            disabled={bulk?.running}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-xs text-muted-foreground transition-all hover:border-gold/50 hover:text-foreground disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download Certificates (zip)
          </button>
        </div>
        ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFormMode('add')}
            className="flex items-center gap-2 rounded-md bg-gold px-4 py-2.5 text-xs font-medium text-gold-foreground transition-all hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> Add Row
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvSelect}
            className="hidden"
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-xs text-muted-foreground transition-all hover:border-gold/50 hover:text-foreground"
          >
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <a
            href="/templates/certificates-import-template.csv"
            download
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-xs text-muted-foreground transition-all hover:border-gold/50 hover:text-foreground"
          >
            <Download className="h-4 w-4" /> CSV Template
          </a>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-xs text-muted-foreground transition-all hover:border-gold/50 hover:text-foreground disabled:opacity-50"
          >
            <FileArchive className="h-4 w-4" /> Export All
          </button>
          <button
            type="button"
            onClick={() => setShowQrs((v) => !v)}
            aria-pressed={showQrs}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-xs transition-all ${showQrs ? 'border-gold bg-gold/10 text-gold' : 'border-border text-muted-foreground hover:border-gold/50 hover:text-foreground'}`}
          >
            <QrCode className="h-4 w-4" /> {showQrs ? 'Hide QRs' : 'Show QRs'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-xs text-muted-foreground transition-all hover:border-gold/50 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <span role="status" aria-live="polite" className="text-xs">
            {refreshStatus === 'updated' && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Check className="h-4 w-4" /> Updated
              </span>
            )}
            {refreshStatus === 'failed' && (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> Couldn&apos;t refresh. Try again.
              </span>
            )}
          </span>
        </div>
        )}
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchData(1, search)
            }}
            placeholder="Search rows..."
            className="w-full rounded-md border border-border bg-card py-2.5 pl-9 pr-12 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <button
            type="button"
            onClick={() => fetchData(1, search)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-secondary px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Go
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected }}
                  onChange={toggleAll}
                  disabled={documents.length === 0}
                  aria-label={allSelected ? 'Deselect all rows on this page' : 'Select all rows on this page'}
                  className="h-4 w-4 cursor-pointer accent-[var(--gold)]"
                />
              </th>
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-muted-foreground">Actions</th>
              {showQrs && (
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-muted-foreground">QR</th>
              )}
              {columns.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-4 py-3 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  {col.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (showQrs ? 3 : 2)} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {search ? 'No matching rows found.' : 'No rows yet. Click "Add Row" to create one.'}
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr
                  key={doc.$id}
                  aria-selected={selectedIds.has(String(doc.$id))}
                  className={`border-b border-border/50 transition-colors ${selectedIds.has(String(doc.$id)) ? 'bg-gold/10' : 'hover:bg-secondary/30'}`}
                >
                  <td className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(String(doc.$id))}
                      onChange={() => toggleRow(String(doc.$id))}
                      aria-label={`Select row ${doc.CERTIFICATE_NO || doc.$id}`}
                      className="h-4 w-4 cursor-pointer accent-[var(--gold)]"
                    />
                  </td>
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
                      <CertificateQrAction certificateNo={doc.CERTIFICATE_NO} />
                      <CertificateQrFixAction doc={doc} onFixed={() => fetchData(page, search)} />
                    </div>
                  </td>
                  {showQrs && (
                    <td className="px-4 py-3">
                      <CertificateQrCell certificateNo={doc.CERTIFICATE_NO} />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="max-w-[200px] truncate px-4 py-3 text-foreground">
                      {renderCell(col.key, doc[col.key], doc)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing {documents.length} of {totalRows} row(s)
          {search ? ` matching "${search}"` : ''}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded border border-border px-3 py-1 disabled:opacity-50"
          >
            Previous
          </button>
          <span>Page {page} / {totalPages}</span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="rounded border border-border px-3 py-1 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* CSV Import Modal */}
      {csvModal && csvData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeCsvModal} />
          <div className="relative w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl">
            <button onClick={closeCsvModal} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>

            <h3 className="font-heading text-lg font-semibold">Import CSV</h3>
            <p className="mt-1 text-xs text-muted-foreground">{csvFileName} — {csvData.rows.length} row(s)</p>

            {csvData.errors.length > 0 && (
              <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-xs font-medium text-destructive">CSV has errors. Import is disabled.</p>
                <ul className="mt-2 space-y-1 text-xs text-destructive/90">
                  {csvData.errors.slice(0, 5).map((error) => (
                    <li key={`${error.row}-${error.message}`}>
                      Row {error.row}: {error.message}
                    </li>
                  ))}
                </ul>
                {csvData.errors.length > 5 && (
                  <p className="mt-2 text-xs text-destructive/80">
                    {csvData.errors.length - 5} more error(s)
                  </p>
                )}
              </div>
            )}

            <div className="mt-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Column Mapping</p>
              <div className="space-y-2">
                {getCsvMapping().map((m) => (
                  <div key={m.csv} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm text-foreground">{m.csv}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className={`text-sm ${m.matched ? 'text-green-500' : 'text-destructive'}`}>
                      {m.matched ? m.db : 'Not matched (skipped)'}
                    </span>
                  </div>
                ))}
              </div>
              {csvData.headers.some((h) =>
                columns.some((c) => c.key.toLowerCase() === h.toLowerCase().trim() && c.key === 'Certificate_photograph')
              ) && (
                <p className="mt-3 text-xs text-yellow-500">⚠ Certificate_photograph found — images must be uploaded separately per row.</p>
              )}
            </div>

            {csvImporting && (
              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                  <span>Importing...</span>
                  <span>{csvProgress.done + csvProgress.failed} / {csvProgress.total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gold transition-all duration-300"
                    style={{ width: `${((csvProgress.done + csvProgress.failed) / csvProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {csvDone && (
              <div className="mt-6 rounded-md border border-border bg-secondary/50 p-4">
                <p className="text-sm font-medium text-foreground">
                  {csvProgress.done + csvProgress.failed < csvProgress.total ? 'Import Stopped' : 'Import Complete'}
                </p>
                <div className="mt-2 flex gap-6 text-xs">
                  <span className="text-green-500">✓ {csvProgress.done} imported</span>
                  {csvProgress.failed > 0 && (
                    <span className="text-destructive">✗ {csvProgress.failed} failed</span>
                  )}
                </div>
                {csvRowErrors.length > 0 && (
                  <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-xs text-destructive">
                    {csvRowErrors.slice(0, 20).map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={closeCsvModal}
                className="flex-1 rounded-md border border-border px-4 py-3 text-xs font-medium text-muted-foreground transition-all hover:border-gold/50 hover:text-foreground disabled:opacity-50"
              >
                {csvImporting ? 'Stop' : 'Close'}
              </button>
              {!csvDone && (
                <button
                  onClick={handleCsvImport}
                  disabled={csvImporting || csvData.errors.length > 0}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-xs font-medium text-gold-foreground transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {csvImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {csvImporting ? 'Importing...' : 'Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {exportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeExportModal} />
          <div className="relative w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-2xl">
            <button onClick={closeExportModal} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>

            <h3 className="font-heading text-lg font-semibold">Export All</h3>
            <p className="mt-1 text-xs text-muted-foreground">All rows as CSV plus one QR PNG per certificate, in a single zip.</p>

            {exporting && (
              <div className="mt-6">
                <div className="mb-2 text-xs text-muted-foreground">{exportStatus(exportProgress)}</div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gold transition-all duration-300"
                    style={{ width: `${exportProgress?.total ? (exportProgress.done / exportProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {exportResult && (
              <div className="mt-6 rounded-md border border-border bg-secondary/50 p-4">
                <p className="text-sm font-medium text-foreground">Export Complete</p>
                <p className="mt-2 text-xs text-green-500">✓ {exportResult.rows} row(s) exported</p>
                {exportResult.warning && (
                  <p className="mt-2 text-xs text-yellow-500">
                    ⚠ Rows were added or deleted while exporting. Run the export again for an exact snapshot.
                  </p>
                )}
              </div>
            )}

            {exportError && (
              <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-xs text-destructive">{exportError}</p>
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={closeExportModal}
                className="w-full rounded-md border border-border px-4 py-3 text-xs font-medium text-muted-foreground transition-all hover:border-gold/50 hover:text-foreground"
              >
                {exporting ? 'Cancel' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Modal */}
      {bulk && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeBulkModal} />
          <div role="dialog" aria-modal="true" aria-labelledby="bulk-title" className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl">
            <button onClick={closeBulkModal} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>

            <h3 id="bulk-title" className="font-heading text-lg font-semibold">
              {bulk.kind === 'fix-qr' ? 'Bulk Fix QR' : 'Download Certificates'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {bulk.kind === 'fix-qr'
                ? 'Fixes the QR on every selected certificate image that needs it. Rows already correct or without an image are ignored.'
                : 'Original certificate images of the selected rows in a single zip. Rows without an image are ignored.'}
            </p>

            {bulk.running && (
              <div className="mt-6">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {bulk.progress
                    ? `${bulk.kind === 'fix-qr' ? 'Fixing' : 'Downloading'} ${bulk.progress.done} / ${bulk.progress.total}`
                    : 'Starting...'}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gold transition-all duration-300"
                    style={{ width: `${bulk.progress?.total ? (bulk.progress.done / bulk.progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {bulk.error && (
              <div role="alert" className="mt-6 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> {bulk.error}
              </div>
            )}

            {bulk.kind === 'fix-qr' && bulk.result && (
              <div className="mt-6 rounded-md border border-border bg-secondary/50 p-4 text-xs">
                <p className="text-sm font-medium text-foreground">Bulk Fix QR Complete</p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                  <span className="text-green-500">✓ {bulk.result.fixed.length} fixed</span>
                  <span className="text-muted-foreground">{bulk.result.alreadyCorrect.length} already correct</span>
                  {bulk.result.skipped.length > 0 && (
                    <span className="text-muted-foreground">{bulk.result.skipped.length} skipped (no image)</span>
                  )}
                  {bulk.result.failed.length > 0 && (
                    <span className="text-destructive">✗ {bulk.result.failed.length} failed</span>
                  )}
                </div>
                {bulk.result.failed.length > 0 && (
                  <>
                    <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-destructive">
                      {bulk.result.failed.map((f, i) => (
                        <li key={`${f.certificateNo}-${i}`}>{f.certificateNo}: {f.message}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-muted-foreground">Use Fix QR on a failed row to select the QR region manually.</p>
                  </>
                )}
              </div>
            )}

            {bulk.kind === 'download' && bulk.result && (
              <div className="mt-6 rounded-md border border-border bg-secondary/50 p-4 text-xs">
                <p className="text-sm font-medium text-foreground">Download Ready</p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                  <span className="text-green-500">✓ {bulk.result.added} certificate(s) zipped</span>
                  {bulk.result.skipped.length > 0 && (
                    <span className="text-muted-foreground">{bulk.result.skipped.length} without image ignored</span>
                  )}
                  {bulk.result.failed.length > 0 && (
                    <span className="text-destructive">✗ {bulk.result.failed.length} failed</span>
                  )}
                </div>
                {bulk.result.failed.length > 0 && (
                  <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-destructive">
                    {bulk.result.failed.map((f, i) => (
                      <li key={`${f.certificateNo}-${i}`}>{f.certificateNo}: {f.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={closeBulkModal}
                className="w-full rounded-md border border-border px-4 py-3 text-xs font-medium text-muted-foreground transition-all hover:border-gold/50 hover:text-foreground"
              >
                {bulk.running ? 'Stop' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row Form Modal */}
      {formMode && (
        <RowFormModal
          columns={columns}
          editData={formMode === 'add' ? null : formMode.edit}
          onClose={() => setFormMode(null)}
          onSave={() => { setFormMode(null); fetchData(page, search) }}
        />
      )}
    </div>
  )
}

function renderCell(key: string, value: any, doc: any) {
  if (key === 'Certificate_photograph' && value) {
    if (doc.$thumbnailUrl) {
      return <img src={doc.$thumbnailUrl} alt="Certificate" className="h-10 w-10 rounded border border-border object-cover" />
    }
    return <span className="text-muted-foreground">Image</span>
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
    editData?.$imageUrl ? admin.getImageUrl(editData) : ''
  )
  const [uploadedImage, setUploadedImage] = useState<UploadedImagePayload | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const previewObjectUrlRef = useRef<string | null>(null)
  const formDataRef = useRef(formData)
  useEffect(() => {
    formDataRef.current = formData
  }, [formData])
  const [extraction, setExtraction] = useState<
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'failed' }
    | { status: 'rejected'; message: string }
    | {
        status: 'done'
        filled: Record<string, ExtractedField>
        suggestions: Record<string, ExtractedField>
        /** Previous values that the certificate replaced, keyed by column. */
        replaced: Record<string, string>
      }
  >({ status: 'idle' })

  const revokePreviewObjectUrl = useCallback(() => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current)
      previewObjectUrlRef.current = null
    }
  }, [])

  useEffect(() => revokePreviewObjectUrl, [revokePreviewObjectUrl])

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    setExtraction((prev) => {
      if (prev.status !== 'done' || !(key in prev.filled)) return prev
      const filled = Object.fromEntries(Object.entries(prev.filled).filter(([name]) => name !== key))
      return { ...prev, filled }
    })
  }

  type CertificateRead = { fields: Record<string, ExtractedField> }
  type CertificateReadResult = ({ ok: true } & CertificateRead) | { ok: false; message: string }

  // Reads the certificate locally (no AI service). When the form edits an existing
  // row, the certificate number printed on the image must match the row's number.
  const readCertificate = async (file: File): Promise<CertificateReadResult> => {
    const [textResult, knownResult] = await Promise.allSettled([
      recognizeCertificateText(file),
      admin.getKnownValues(),
    ])
    if (textResult.status === 'rejected') {
      return {
        ok: false,
        message: editData
          ? 'This certificate could not be read, so its number could not be checked against this row. The row was not changed and the image was not attached. Try a clearer image.'
          : 'This certificate could not be read automatically. Fill the fields manually.',
      }
    }
    if (knownResult.status === 'rejected') {
      return {
        ok: false,
        message: 'Existing records could not be loaded to check this certificate. Nothing was changed. Please try again.',
      }
    }

    let text = textResult.value
    const known = { ...knownResult.value }

    if (editData) {
      const expected = String(editData.CERTIFICATE_NO ?? '').trim()
      let check = verifyCertificateNumber(text, expected, known.CERTIFICATE_NO ?? [])
      if (check.status !== 'match') {
        // Second pass on an enlarged copy: small print is often missed at 1x.
        const retry = await recognizeCertificateText(file, { scale: 2 }).catch(() => null)
        if (retry) {
          const retryCheck = verifyCertificateNumber(retry, expected, known.CERTIFICATE_NO ?? [])
          if (retryCheck.status === 'match' || check.status === 'unreadable') {
            check = retryCheck
            text = `${text}\n${retry}`
          }
        }
      }
      if (check.status === 'mismatch') {
        return {
          ok: false,
          message: `Certificate number mismatch: this image shows "${check.found}" but this row is "${expected}". The row was not changed and the image was not attached. Make sure you selected the certificate for this row.`,
        }
      }
      if (check.status === 'unreadable') {
        return {
          ok: false,
          message: `No certificate number could be read from this image, so it could not be matched to "${expected}". The row was not changed and the image was not attached. Try a clearer image.`,
        }
      }
      // The row's own number is not a duplicate of itself.
      known.CERTIFICATE_NO = (known.CERTIFICATE_NO ?? []).filter((value) => value !== expected)
    }

    const columnKeys = columns.map((col) => col.key)
    const { fields } = extractCertificateFields(text, columnKeys, { values: known })
    if (!editData && !fields.CERTIFICATE_NO && columnKeys.includes('CERTIFICATE_NO')) {
      const retry = await recognizeCertificateText(file, { scale: 2 }).catch(() => null)
      const number = retry ? extractCertificateFields(retry, ['CERTIFICATE_NO'], { values: known }).fields.CERTIFICATE_NO : undefined
      if (number) fields.CERTIFICATE_NO = number
    }
    return { ok: true, fields }
  }

  // Edit mode: confident certificate values replace the row's current values.
  // Add mode: they only fill fields that are still empty.
  // Low-confidence reads are always suggestions, never applied.
  const applyExtraction = (fields: Record<string, ExtractedField>, replaceExisting: boolean) => {
    const current = formDataRef.current
    const filled: Record<string, ExtractedField> = {}
    const suggestions: Record<string, ExtractedField> = {}
    const replaced: Record<string, string> = {}

    for (const [key, field] of Object.entries(fields)) {
      if (key === 'CERTIFICATE_NO' && replaceExisting) continue
      const existing = (current[key] ?? '').trim()
      if (existing === field.value.trim()) continue
      if (field.confidence >= AUTOFILL_CONFIDENCE) {
        if (existing && !replaceExisting) continue
        filled[key] = field
        if (existing) replaced[key] = existing
      } else if (field.confidence >= 0.3) {
        suggestions[key] = field
      }
    }

    setFormData((prev) => {
      const next = { ...prev }
      for (const [key, field] of Object.entries(filled)) {
        if (replaceExisting || !(next[key] ?? '').trim()) next[key] = field.value
      }
      return next
    })
    setExtraction({ status: 'done', filled, suggestions, replaced })
  }

  const extractFromImage = async (file: File) => {
    setExtraction({ status: 'running' })
    const result = await readCertificate(file)
    if (!result.ok) setExtraction({ status: 'failed' })
    else applyExtraction(result.fields, false)
  }

  const acceptSuggestion = (key: string, field: ExtractedField) => {
    setFormData((prev) => ({ ...prev, [key]: field.value }))
    setExtraction((prev) => {
      if (prev.status !== 'done') return prev
      const suggestions = Object.fromEntries(Object.entries(prev.suggestions).filter(([name]) => name !== key))
      const previous = (formDataRef.current[key] ?? '').trim()
      return {
        ...prev,
        suggestions,
        filled: { ...prev.filled, [key]: field },
        replaced: previous ? { ...prev.replaced, [key]: previous } : prev.replaced,
      }
    })
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      // Editing an existing row: verify the certificate belongs to it before anything is uploaded.
      let verified: CertificateRead | null = null
      if (editData) {
        setExtraction({ status: 'running' })
        const result = await readCertificate(file)
        if (!result.ok) {
          setExtraction({ status: 'rejected', message: result.message })
          return
        }
        verified = result
      }

      const [upload, thumbnailDataUrl] = await Promise.all([
        admin.uploadImage(file, formData.CERTIFICATE_NO),
        createThumbnailDataUrl(file),
      ])
      const uploaded = { ...upload, thumbnailDataUrl }
      const previewUrl = URL.createObjectURL(file)
      revokePreviewObjectUrl()
      previewObjectUrlRef.current = previewUrl
      setUploadedImage(uploaded)
      setRemoveImage(false)
      setFormData((prev) => ({ ...prev, Certificate_photograph: uploaded.originalName }))
      setImagePreview(previewUrl)
      if (verified) applyExtraction(verified.fields, true)
      else void extractFromImage(file)
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
      if (uploadedImage) cleanData.__uploadedImage = uploadedImage
      if (removeImage) cleanData.__removeImage = true
      if (editData?.$revision) cleanData.__expectedRevision = editData.$revision
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
          {extraction.status === 'running' && (
            <p className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading certificate…
            </p>
          )}
          {extraction.status === 'rejected' && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {extraction.message}
            </p>
          )}
          {extraction.status === 'failed' && (
            <p className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4" /> Could not read this certificate automatically. Fill the fields manually.
            </p>
          )}
          {extraction.status === 'done' && (
            <div className="space-y-2 rounded-md border border-border bg-background px-3 py-3 text-xs">
              <p className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-gold" />
                {Object.keys(extraction.filled).length > 0
                  ? `Updated ${Object.keys(extraction.filled).length} field(s) from the certificate${
                      Object.keys(extraction.replaced).length > 0
                        ? `, replacing ${Object.keys(extraction.replaced).length} existing value(s)`
                        : ''
                    }. Check the highlighted fields before saving.`
                  : 'No fields needed updating from the certificate.'}
              </p>
              {Object.entries(extraction.suggestions).length > 0 && (
                <div>
                  <p className="mb-1 uppercase tracking-wide text-muted-foreground">Suggestions (not applied)</p>
                  <ul className="space-y-1">
                    {Object.entries(extraction.suggestions).map(([key, field]) => (
                      <li key={key} className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-muted-foreground">
                          <span className="font-medium text-foreground">{key}:</span> {field.value}
                          {field.source === 'pattern' && field.evidence ? (
                            <span className="block text-[10px] text-destructive">{field.evidence}</span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          onClick={() => acceptSuggestion(key, field)}
                          className="shrink-0 rounded border border-border px-2 py-0.5 text-[10px] hover:border-gold/50 hover:text-gold"
                        >
                          Use
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

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
                        onClick={() => {
                          revokePreviewObjectUrl()
                          setImagePreview('')
                          setUploadedImage(null)
                          setRemoveImage(true)
                          setFormData((p) => ({ ...p, Certificate_photograph: '' }))
                        }}
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
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? 'Uploading...' : imagePreview ? 'Replace Image' : 'Upload Certificate Image'}
                  </button>
                  {formData.Certificate_photograph && (
                    <p className="mt-1 text-[10px] text-muted-foreground">Image: {formData.Certificate_photograph}</p>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={formData[col.key] || ''}
                  onChange={(e) => handleChange(col.key, e.target.value)}
                  required={col.required}
                  placeholder={`Enter ${col.key}`}
                  className={`mt-2 w-full rounded-md border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold ${
                    extraction.status === 'done' && col.key in extraction.filled ? 'border-gold' : 'border-border'
                  }`}
                />
              )}
              {extraction.status === 'done' && col.key in extraction.filled && col.key !== 'Certificate_photograph' && (
                <p className="mt-1 text-[10px] text-gold">
                  Read from certificate — please verify
                  {col.key in extraction.replaced ? ` (replaced “${extraction.replaced[col.key]}”)` : ''}
                </p>
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
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : editData ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {loading ? 'Saving...' : editData ? 'Update Row' : 'Add Row'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

async function createThumbnailDataUrl(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/')) return undefined

  const image = await loadImage(file)
  const maxSize = 120
  const scale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight, 1)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return undefined

  context.drawImage(image, 0, 0, width, height)
  const rawDataUrl = canvas.toDataURL('image/jpeg', 0.72)
  const base64 = rawDataUrl.split(',')[1]
  return base64 ? `data:image/jpeg;width=${width};height=${height};base64,${base64}` : undefined
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    image.src = url
  })
}
