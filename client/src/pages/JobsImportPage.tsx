import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'

import { API } from '@/lib/workflowApi'
import { Icons } from '@/components/workflow/shared'

type ImportRow = Record<string, string>
type Step = 'upload' | 'preview' | 'results'

const RECURRENCE_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'bi-monthly', label: 'Bi-Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'biannually', label: 'Biannually' },
  { value: 'annually', label: 'Annually' },
] as const

interface ImportError {
  row: number
  reasons?: string[]
  error?: string
}

interface ImportResult {
  imported_count?: number
  inserted_count?: number
  skipped_count?: number
  error_count?: number
  errors?: ImportError[]
  records?: Array<Record<string, unknown>>
}

interface ImportSettings {
  frequency: 'once-off' | 'recurring'
  recurrence_type: string
  recurrence_start_date: string
  recurrence_end_date: string
  deadline_day: string
}

interface JobsImportPageProps {
  onRefresh?: () => void | Promise<void>
  settings?: {
    currency_symbol?: string
  }
}

const JOB_HEADERS = [
  'name',
  'client_name',
  'job_type',
  'job_fee',
  'priority',
  'deadline',
  'description',
] as const

const HEADER_LABELS: Record<string, string> = {
  name: 'Job Name',
  client_name: 'Client',
  job_type: 'Job Type',
  job_fee: 'Job Fee',
  priority: 'Priority',
  deadline: 'Deadline',
  description: 'Description',
}

const SAMPLE_CSV = [
  'name,client_name,job_type,job_fee,priority,deadline,description',
  'Payroll April 2026,ABC Pty Ltd,Payroll,15000,High,2026-05-31,Monthly payroll processing',
  'Management Accounts Q2,XYZ Holdings,Management Accounts,22000,Medium,2026-06-30,Quarterly reporting pack',
  'Tax Compliance June,ABC Pty Ltd,Tax Compliance,18000,Medium,2026-06-30,Tax return preparation',
].join('\n')

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'preview', label: 'Preview' },
  { key: 'results', label: 'Results' },
]

const EMPTY_SETTINGS: ImportSettings = {
  frequency: 'once-off',
  recurrence_type: '',
  recurrence_start_date: '',
  recurrence_end_date: '',
  deadline_day: '',
}

function buildDefaultRecurringFields() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return {
    recurrence_type: 'monthly',
    recurrence_start_date: `${year}-${month}-${day}`,
    recurrence_end_date: `${year}-${month}-${day}`,
  }
}

function parseCSV(csv: string): ImportRow[] {
  const lines = csv.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map((line) => {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }

    values.push(current.trim())

    const row: ImportRow = {}
    headers.forEach((h, i) => {
      row[h] = values[i] || ''
    })

    return row
  })
}

function normalizeForSubmit(row: ImportRow): ImportRow {
  return {
    name: row.name?.trim() || '',
    client_name: row.client_name?.trim() || '',
    job_type: row.job_type?.trim() || '',
    job_fee: row.job_fee?.trim() || '0',
    priority: row.priority?.trim() || 'Medium',
    deadline: row.deadline?.trim() || '',
    description: row.description?.trim() || '',
  }
}

function validateRow(row: ImportRow): string[] {
  const errors: string[] = []

  if (!row.name?.trim()) errors.push('Job name required')
  if (!row.client_name?.trim()) errors.push('Client name required')
  if (!row.job_type?.trim()) errors.push('Job type required')

  if (row.deadline?.trim() && Number.isNaN(new Date(row.deadline).getTime())) {
    errors.push('Deadline must be a valid date')
  }

  return errors
}

function StepBar({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current)

  return (
    <div className="flex items-center gap-0">
      {STEPS.map(({ key, label }, i) => {
        const done = i < currentIdx
        const active = i === currentIdx

        return (
          <div key={key} className="flex items-center">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : done
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/25 text-xs font-bold">
                {done ? '✓' : i + 1}
              </span>
              {label}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 ${done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function JobsImportPage({ onRefresh, settings }: JobsImportPageProps) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importSettings, setImportSettings] = useState<ImportSettings>(EMPTY_SETTINGS)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const symbol = settings?.currency_symbol || 'R'

  const isRecurring = importSettings.frequency === 'recurring'
  const recurringValid = isRecurring
    ? importSettings.recurrence_type &&
      importSettings.recurrence_start_date &&
      importSettings.recurrence_end_date &&
      importSettings.deadline_day
    : true

  const loadFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result || '')
      const parsed = parseCSV(text)
      if (!parsed.length) {
        toast.error('No valid rows found in CSV. Check the template format.')
        return
      }
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  const validRows = rows.filter((row) => validateRow(row).length === 0)
  const invalidRows = rows.filter((row) => validateRow(row).length > 0)

  const handleImport = async () => {
    if (!validRows.length) {
      toast.error('There are no valid rows to import')
      return
    }

    setImporting(true)
    try {
      const payloadRows = validRows.map(normalizeForSubmit)
      const importSettingsPayload: Record<string, unknown> = {
        frequency: importSettings.frequency,
      }
      if (importSettings.frequency === 'recurring') {
        importSettingsPayload.recurrence_type = importSettings.recurrence_type
        importSettingsPayload.recurrence_start_date = importSettings.recurrence_start_date
        importSettingsPayload.recurrence_end_date = importSettings.recurrence_end_date
        importSettingsPayload.deadline_day = parseInt(importSettings.deadline_day, 10)
      }

      const { data } = await axios.post(
        `${API}/jobs/bulk-import`,
        { jobs: payloadRows, import_settings: importSettingsPayload },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
      )

      const importedCount = Number(data.imported_count ?? data.inserted_count ?? 0)
      const skippedCount = Number(data.skipped_count ?? 0)
      const responseErrors = Array.isArray(data.errors) ? data.errors.length : Number(data.error_count || 0)

      setResult(data)
      setStep('results')

      toast.success(`${importedCount} job${importedCount !== 1 ? 's' : ''} imported`)
      if (skippedCount > 0 || responseErrors > 0) {
        toast.warning(`${Math.max(skippedCount, responseErrors)} row${Math.max(skippedCount, responseErrors) !== 1 ? 's were' : ' was'} skipped`)
      }

      onRefresh?.()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string; errors?: ImportError[]; imported_count?: number; skipped_count?: number } } }
      const errData = axiosErr?.response?.data
      if (errData && Array.isArray(errData.errors)) {
        setResult({
          imported_count: errData.imported_count ?? 0,
          inserted_count: errData.imported_count ?? 0,
          skipped_count: errData.skipped_count ?? validRows.length,
          error_count: errData.errors.length,
          errors: errData.errors,
          records: [],
        })
        setStep('results')
        toast.warning(`${errData.errors.length} row${errData.errors.length !== 1 ? 's' : ''} failed validation`)
      } else {
        toast.error(errData?.detail || 'Import failed')
      }
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setRows([])
    setResult(null)
    setImportSettings(EMPTY_SETTINGS)
    setStep('upload')
  }

  const formatCellValue = (key: string, value: string) => {
    if (!value) return ''
    if (key === 'job_fee') {
      const fee = Number(value)
      return Number.isFinite(fee) ? `${symbol} ${fee.toLocaleString('en-ZA')}` : value
    }
    return value
  }

  const setFreq = (value: string) => {
    const isRec = value === 'recurring'
    const defs = buildDefaultRecurringFields()
    setImportSettings({
      ...importSettings,
      frequency: value as 'once-off' | 'recurring',
      recurrence_type: isRec ? (importSettings.recurrence_type || defs.recurrence_type) : '',
      recurrence_start_date: isRec ? (importSettings.recurrence_start_date || defs.recurrence_start_date) : '',
      recurrence_end_date: isRec ? (importSettings.recurrence_end_date || defs.recurrence_end_date) : '',
      deadline_day: isRec ? importSettings.deadline_day : '',
    })
  }

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link
          to="/app/jobs"
          className="hover:text-indigo-600 transition-colors flex items-center gap-1.5 font-medium"
        >
          <Icons.Briefcase />
          Jobs
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">Import CSV</span>
      </div>

      <StepBar current={step} />

      {step === 'upload' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                <Icons.Repeat />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Import Settings</h4>
                <p className="text-xs text-gray-500">{isRecurring ? 'Recurring jobs with monthly entries' : 'Once-off jobs with optional deadlines'}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequency *</label>
                <select
                  value={importSettings.frequency}
                  onChange={(e) => setFreq(e.target.value)}
                  className="w-full h-10 px-4 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                >
                  <option value="once-off">Once Off</option>
                  <option value="recurring">Recurring</option>
                </select>
              </div>

              {isRecurring && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence *</label>
                    <select
                      value={importSettings.recurrence_type}
                      onChange={(e) => setImportSettings({ ...importSettings, recurrence_type: e.target.value })}
                      className="w-full h-10 px-4 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                    >
                      <option value="">Select recurrence...</option>
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={importSettings.recurrence_start_date}
                      onChange={(e) => setImportSettings({ ...importSettings, recurrence_start_date: e.target.value })}
                      className="w-full h-10 px-4 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                    <input
                      type="date"
                      value={importSettings.recurrence_end_date}
                      min={importSettings.recurrence_start_date || undefined}
                      onChange={(e) => setImportSettings({ ...importSettings, recurrence_end_date: e.target.value })}
                      className="w-full h-10 px-4 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Deadline Day *</label>
                    <select
                      value={importSettings.deadline_day}
                      onChange={(e) => setImportSettings({ ...importSettings, deadline_day: e.target.value })}
                      className="w-full h-10 px-4 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                    >
                      <option value="">Select day...</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {isRecurring && !recurringValid && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
                <span className="text-amber-500 mt-0.5">⚠</span>
                <p className="text-xs text-amber-800">Complete all recurring settings (Recurrence, Start Date, End Date, and Deadline Day) before selecting a CSV file.</p>
              </div>
            )}
          </div>

          <div
            onDrop={recurringValid ? handleDrop : undefined}
            onDragOver={(e) => { if (recurringValid) { e.preventDefault(); setDragOver(true) } }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => { if (recurringValid) fileInputRef.current?.click() }}
            className={`border-2 border-dashed rounded-2xl px-10 py-8 flex flex-row items-center justify-between gap-8 transition-all select-none ${
              !recurringValid
                ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                : dragOver
                  ? 'border-indigo-400 bg-indigo-50 scale-[1.005] cursor-pointer'
                  : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer'
            }`}
          >
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-xl">Drop your jobs CSV here</p>
                <p className="text-sm text-gray-500 mt-0.5">Drag and drop a .csv file, or click anywhere to browse</p>
              </div>
            </div>
            <span className="shrink-0 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-md shadow-indigo-200">
              Choose File
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f && recurringValid) loadFile(f) }}
            />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                  <Icons.Template />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">CSV Template</h4>
                  <p className="text-xs text-gray-500">7 columns · organisation-scoped client matching</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
                  const link = document.createElement('a')
                  link.href = URL.createObjectURL(blob)
                  link.download = 'jobs_import_template.csv'
                  link.click()
                }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium"
              >
                <Icons.Download /> Download Template
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="text-sm w-full min-w-max">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="w-8 px-3 py-3 text-center text-xs font-medium text-slate-400 border-r border-slate-700">#</th>
                    {JOB_HEADERS.map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap border-r border-slate-700 last:border-r-0">
                        {HEADER_LABELS[h]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Payroll April 2026', 'ABC Pty Ltd', 'Payroll', '15000', 'High', '2026-05-31', 'Monthly payroll processing'],
                    ['Management Accounts Q2', 'XYZ Holdings', 'Management Accounts', '22000', 'Medium', '2026-06-30', 'Quarterly reporting pack'],
                    ['Tax Compliance June', 'ABC Pty Ltd', 'Tax Compliance', '18000', 'Medium', '2026-06-30', 'Tax return preparation'],
                  ].map((row, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2.5 text-center text-xs text-gray-400 border-r border-gray-100 font-mono select-none">{i + 1}</td>
                      {row.map((cell, j) => (
                        <td key={j} className={`px-4 py-2.5 border-r border-gray-100 last:border-r-0 ${
                          j === 0 ? 'font-semibold text-gray-900 whitespace-nowrap' :
                          j === 1 ? 'text-blue-700 whitespace-nowrap' :
                          j === 3 ? 'text-right font-mono text-gray-700 whitespace-nowrap' :
                          j === 6 ? 'text-gray-500 max-w-[220px] truncate' :
                          'text-gray-600 whitespace-nowrap'
                        }`}>{j === 3 ? `${symbol} ${Number(cell).toLocaleString('en-ZA')}` : cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
              <span className="text-amber-500 mt-0.5">⚠</span>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-amber-800">Import rules</p>
                <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                  <li>Name, client_name and job_type are required</li>
                  <li>Client name must exist in your organisation</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              isRecurring ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
            }`}>
              {isRecurring ? <Icons.Repeat className="w-3.5 h-3.5" /> : <Icons.Tag className="w-3.5 h-3.5" />}
              {isRecurring ? 'Recurring Import' : 'Once-Off Import'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Total Rows</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{rows.length}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
              <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Valid</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">{validRows.length}</p>
              <p className="text-xs text-emerald-500 mt-0.5">ready to import</p>
            </div>
            <div className={`rounded-xl border p-4 ${invalidRows.length > 0 ? 'bg-rose-50 border-rose-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${invalidRows.length > 0 ? 'text-rose-500' : 'text-gray-400'}`}>Invalid</p>
              <p className={`text-3xl font-bold mt-1 ${invalidRows.length > 0 ? 'text-rose-600' : 'text-gray-400'}`}>{invalidRows.length}</p>
              <p className={`text-xs mt-0.5 ${invalidRows.length > 0 ? 'text-rose-400' : 'text-gray-300'}`}>will not be sent</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/80">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Data Preview</span>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                  {rows.length} row{rows.length !== 1 ? 's' : ''}
                </span>
              </div>
              <span className="text-xs text-gray-400">Only valid rows are submitted</span>
            </div>

            <div className="overflow-x-auto">
              <table className="text-sm w-full min-w-[1100px]">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="w-10 px-3 py-2 text-center text-xs font-medium text-slate-400 border-r border-slate-700">#</th>
                    {JOB_HEADERS.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap border-r border-slate-700 last:border-r-0">
                        {HEADER_LABELS[h]}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-semibold">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const rowErrors = validateRow(row)
                    const isValid = rowErrors.length === 0
                    return (
                      <tr key={idx} className={`border-b border-gray-100 ${isValid ? (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30') : 'bg-rose-50/50'}`}>
                        <td className="px-3 py-2 text-center text-xs text-gray-500 border-r border-gray-100">{idx + 1}</td>
                        {JOB_HEADERS.map((header) => (
                          <td key={header} className={`px-3 py-2 border-r border-gray-100 ${header === 'job_fee' ? 'text-right font-mono' : ''}`}>
                            {formatCellValue(header, row[header] || '')}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {isValid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                              <Icons.Check /> Valid
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {rowErrors.map((error, errorIdx) => (
                                <p key={errorIdx} className="text-xs text-rose-600">• {error}</p>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
            >
              Start Over
            </button>
            <button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 font-medium"
            >
              {importing ? 'Importing...' : `Import ${validRows.length} Job${validRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {step === 'results' && result && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Import Complete</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-600 font-semibold">Imported</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{Number(result.imported_count ?? result.inserted_count ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-xs uppercase tracking-wide text-amber-600 font-semibold">Skipped</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{Number(result.skipped_count ?? result.error_count ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="text-xs uppercase tracking-wide text-indigo-600 font-semibold">Submitted</p>
                <p className="text-2xl font-bold text-indigo-700 mt-1">{validRows.length}</p>
              </div>
            </div>

            {Array.isArray(result.errors) && result.errors.length > 0 && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800 mb-2">Skipped row details</p>
                <div className="space-y-1">
                  {result.errors.slice(0, 10).map((err, idx) => {
                    const reasons = Array.isArray(err.reasons)
                      ? err.reasons.join(', ')
                      : (err.error || 'Unknown error')
                    return (
                      <p key={idx} className="text-xs text-amber-700">
                        Row {err.row}: {reasons}
                      </p>
                    )
                  })}
                  {result.errors.length > 10 && (
                    <p className="text-xs text-amber-700">+ {result.errors.length - 10} more</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
            >
              Import Another File
            </button>
            <Link
              to="/app/jobs"
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium"
            >
              Back to Jobs
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
