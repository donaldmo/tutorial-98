import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'

import { API } from '@/lib/workflowApi'
import api from '@/services/api'
import { Icons } from '@/components/workflow/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportRow = Record<string, string>
type Step = 'upload' | 'preview' | 'results'

interface ImportResult {
  message?: string
  imported_count: number
  skipped_count: number
  created_new_count?: number
  linked_existing_count?: number
  already_exists_count?: number
  skipped_reasons?: {
    already_exists?: number
    missing_name?: number
    missing_email?: number
    invalid_department?: number
    duplicate_in_file?: number
  }
  records: any[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STAFF_HEADERS = [
  'name',
  'email',
  'role',
  'access_level',
  'hourly_rate',
  'available_hours_per_month',
  'productivity_factor',
  'efficiency',
  'annual_fee_budget',
  'annual_budgeted_hours',
  'department_name',
] as const

const HEADER_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  role: 'Role',
  access_level: 'Access Level',
  hourly_rate: 'Rate/hr',
  available_hours_per_month: 'Avail. Hrs',
  productivity_factor: 'Productivity',
  efficiency: 'Efficiency',
  annual_fee_budget: 'Annual Budget',
  annual_budgeted_hours: 'Budgeted Hrs',
  department_name: 'Department',
}

const NUM_COLS = new Set([
  'hourly_rate',
  'available_hours_per_month',
  'productivity_factor',
  'efficiency',
  'annual_fee_budget',
  'annual_budgeted_hours',
])

const CURRENCY_COLS = new Set(['hourly_rate', 'annual_fee_budget'])

const SAMPLE_CSV = [
  'name,email,role,access_level,hourly_rate,available_hours_per_month,productivity_factor,efficiency,annual_fee_budget,annual_budgeted_hours,department_name',
  'Jane Smith,jane.smith@firm.co.za,Accountant,Standard,500,160,0.85,1,500000,1000,Management Accounts',
  'John Doe,john.doe@firm.co.za,Auditor,Standard,650,160,0.88,1,650000,1000,Audit',
  'Mary Johnson,mary.j@firm.co.za,Bookkeeper,Standard,300,150,0.9,1,300000,1000,Payroll',
].join('\n')

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCSV(csv: string): ImportRow[] {
  // Basic robust CSV parser: handles quoted fields with commas and trims values.
  // Also strips UTF-8 BOM and supports CRLF.
  const cleaned = csv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = cleaned.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map((line) => {
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        // Toggle inQuotes (doesn't handle escaped quotes inside quotes, but
        // matches the simpler parsers used elsewhere in the app)
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

function validateRow(row: ImportRow): string[] {
  const errors: string[] = []
  if (!row.name?.trim()) errors.push('Name required')
  if (!row.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('Valid email required')
  if (!row.department_name?.trim()) errors.push('Department required')
  if (!row.hourly_rate || Number.isNaN(Number(row.hourly_rate)) || Number(row.hourly_rate) <= 0)
    errors.push('Valid hourly rate required')
  return errors
}

function formatCellValue(col: string, value: string, symbol: string): string {
  if (!value) return ''
  if (CURRENCY_COLS.has(col)) return `${symbol} ${Number(value || 0).toLocaleString('en-ZA')}`
  if (col === 'productivity_factor') return `${(Number(value) * 100).toFixed(0)}%`
  if (col === 'efficiency') return `${(Number(value) * 100).toFixed(0)}%`
  if (col === 'available_hours_per_month' || col === 'annual_budgeted_hours') return `${value}h`
  return value
}

// ── STEP BAR ─────────────────────────────────────────────────────────────────

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'preview', label: 'Preview' },
  { key: 'results', label: 'Results' },
]

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
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : done
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/25 text-xs font-bold">
                {done ? '✓' : i + 1}
              </span>
              {label}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export function StaffImportPage({ onRefresh, settings }: any) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [hasDepartments, setHasDepartments] = useState<boolean | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const symbol = settings?.currency_symbol || 'R'

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await api.get('/departments')
        const items = res.data?.data || []
        setHasDepartments(items.length > 0)
      } catch (error) {
        console.error(error)
        setHasDepartments(null)
      }
    }
    fetchDepartments()
  }, [])

  const isImportBlocked = hasDepartments === false

  // ── File handling ──────────────────────────────────────────────────────────

  const loadFile = (file: File) => {
    if (isImportBlocked) {
      toast.error('Add a department first before importing staff.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result || '')
        const parsed = parseCSV(text)
        if (parsed.length === 0) {
          toast.error('No valid rows found in CSV. Check the file format or delimiter.')
          // reset file input so user can re-select same file if needed
          if (fileInputRef.current) (fileInputRef.current as HTMLInputElement).value = ''
          return
        }
        setRows(parsed)
        setStep('preview')
      } catch (err) {
        console.error('CSV parse error', err)
        toast.error('Failed to parse CSV file. Check file encoding and format.')
      } finally {
        if (fileInputRef.current) (fileInputRef.current as HTMLInputElement).value = ''
      }
    }
    reader.onerror = (err) => {
      console.error('FileReader error', err)
      toast.error('Failed to read file. Try a different CSV or re-download the template.')
      if (fileInputRef.current) (fileInputRef.current as HTMLInputElement).value = ''
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (isImportBlocked) return
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (isImportBlocked) {
      toast.error('Add a department first before importing staff.')
      return
    }
    setImporting(true)
    try {
      const { data } = await axios.post(
        `${API}/staff/bulk-import`,
        { staff: rows },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
      )
      setResult(data)
      setStep('results')
      toast.success(data.message || `${data.imported_count} staff member${data.imported_count !== 1 ? 's' : ''} imported`)
      onRefresh?.()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      const reason = err.response?.data?.reason
      if (reason === 'all_already_exist') {
        toast.error(detail || 'All staff in this file already exist in your organisation.')
      } else {
        toast.error(detail || 'Import failed')
      }
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setRows([])
    setResult(null)
    setStep('upload')
  }

  const validRows = rows.filter((r) => validateRow(r).length === 0)
  const invalidRows = rows.filter((r) => validateRow(r).length > 0)

  return (
    <div className="space-y-6 max-w-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link
          to="/app/staff"
          className="hover:text-blue-600 transition-colors flex items-center gap-1.5 font-medium"
        >
          <Icons.Users />
          Staff
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">Import CSV</span>
      </div>

      {isImportBlocked && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add at least one department before importing staff.{' '}
          <Link to="/app/departments" className="font-semibold underline underline-offset-2 hover:text-amber-900">
            Go to Departments
          </Link>
        </div>
      )}

      {/* Step indicator */}
      <StepBar current={step} />

      {/* ── STEP 1: Upload ────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-5">
          {/* Drop zone — full-width, horizontal */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              if (isImportBlocked) return
              setDragOver(true)
            }}
            onDragLeave={() => {
              if (isImportBlocked) return
              setDragOver(false)
            }}
            onClick={() => { if (!isImportBlocked) fileInputRef.current?.click() }}
            className={`border-2 border-dashed rounded-2xl px-10 py-8 flex flex-row items-center justify-between gap-8 transition-all select-none ${
              isImportBlocked
                ? 'border-gray-200 bg-gray-100 opacity-70 cursor-not-allowed'
                : `cursor-pointer ${
                  dragOver
                    ? 'border-blue-400 bg-blue-50 scale-[1.005]'
                    : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40'
                }`
            }`}
          >
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-xl">Drop your CSV file here</p>
                <p className="text-sm text-gray-500 mt-0.5">Drag and drop a .csv file, or click anywhere to browse</p>
              </div>
            </div>
            <span className="shrink-0 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-md shadow-blue-200">
              Choose File
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              disabled={isImportBlocked}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
            />
          </div>

          {/* Template card — full-width, bigger table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                  <Icons.Template />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">CSV Template</h4>
                  <p className="text-xs text-gray-500">11 columns · matches Staff model</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
                  const link = document.createElement('a')
                  link.href = URL.createObjectURL(blob)
                  link.download = 'staff_import_template.csv'
                  link.click()
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium"
              >
                <Icons.Download /> Download Template
              </button>
            </div>

            {/* Full-size preview table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="text-sm w-full min-w-max">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="w-8 px-3 py-3 text-center text-xs font-medium text-slate-400 border-r border-slate-700">#</th>
                    {STAFF_HEADERS.map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap border-r border-slate-700 last:border-r-0">{HEADER_LABELS[h]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
  ['Jane Smith', 'jane@firm.co.za', 'Accountant', 'Standard', '500', '160', '0.85', '1', '500000', '1000', 'Management Accounts'],
  ['John Doe', 'john@firm.co.za', 'Auditor', 'Standard', '650', '160', '0.88', '1', '650000', '1000', 'Audit'],
  ['Mary Johnson', 'mary.j@firm.co.za', 'Bookkeeper', 'Standard', '300', '150', '0.9', '1', '300000', '1000', 'Payroll'],
  ['Sam Williams', 'sam.w@firm.co.za', 'Accountant', 'Supervisor', '600', '160', '0.87', '1', '600000', '1000', 'Management Accounts'],
  ].map((row, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2.5 text-center text-xs text-gray-400 border-r border-gray-100 font-mono select-none">{i + 1}</td>
                      {row.map((cell, j) => (
                        <td key={j} className={`px-4 py-2.5 whitespace-nowrap border-r border-gray-100 last:border-r-0 ${
                          j === 0 ? 'font-semibold text-gray-900' :
                          j === 1 ? 'text-blue-600 text-xs' :
                          j === 9 ? 'text-purple-700 font-medium' :
                          [4,5,6,7,8,9].includes(j) ? 'text-right font-mono text-gray-600 tabular-nums' :
                          'text-gray-600'
                        }`}>{cell}</td>
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
                  <li>Default password <span className="font-mono bg-amber-100 px-1 rounded">Stuff@12345678</span> assigned to all imports</li>
                  <li>Welcome email is queued only for newly created staff records</li>
                  <li>Rows with unrecognised department name are <strong>skipped</strong></li>
                  <li>Rows with existing email are linked to your organisation</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ───────────────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Total Rows</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{rows.length}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
              <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Valid</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">{validRows.length}</p>
              <p className="text-xs text-emerald-500 mt-0.5">will be imported</p>
            </div>
            <div className={`rounded-xl border p-4 ${invalidRows.length > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${invalidRows.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>Invalid</p>
              <p className={`text-3xl font-bold mt-1 ${invalidRows.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{invalidRows.length}</p>
              <p className={`text-xs mt-0.5 ${invalidRows.length > 0 ? 'text-red-400' : 'text-gray-300'}`}>will be skipped</p>
            </div>
          </div>

          {/* Excel-like preview table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Table toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/80">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Data Preview</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                  {rows.length} row{rows.length !== 1 ? 's' : ''}
                </span>
                {invalidRows.length > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">
                    {invalidRows.length} invalid
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={isImportBlocked || importing || validRows.length === 0}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  {importing ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Icons.Upload />
                      Import {validRows.length} Staff
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-auto max-h-[540px]">
              <table className="w-full text-sm border-collapse min-w-max">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800 text-white">
                    {/* Row number column */}
                    <th className="w-10 px-3 py-2.5 text-center text-xs font-medium text-slate-400 border-r border-slate-700 bg-slate-900">
                      #
                    </th>
                    {/* Status column */}
                    <th className="w-8 px-2 py-2.5 border-r border-slate-700 bg-slate-900" />
                    {/* Data columns */}
                    {STAFF_HEADERS.map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-r border-slate-700 last:border-r-0 ${
                          NUM_COLS.has(h) ? 'text-right' : 'text-left'
                        } ${h === 'department_name' ? 'text-purple-300' : ''}`}
                      >
                        {HEADER_LABELS[h]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const errors = validateRow(row)
                    const isValid = errors.length === 0
                    return (
                      <tr
                        key={i}
                        className={`border-b border-gray-100 transition-colors ${
                          isValid
                            ? 'hover:bg-blue-50/30'
                            : 'bg-red-50/60 hover:bg-red-100/40'
                        }`}
                      >
                        {/* Row number */}
                        <td className="w-10 px-3 py-2 text-center text-xs text-gray-400 border-r border-gray-100 font-mono bg-gray-50/70 select-none">
                          {i + 1}
                        </td>
                        {/* Status icon */}
                        <td className="w-8 px-2 py-2 border-r border-gray-100 text-center">
                          {isValid ? (
                            <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 items-center justify-center text-xs font-bold">
                              ✓
                            </span>
                          ) : (
                            <span
                              className="inline-flex w-5 h-5 rounded-full bg-red-100 text-red-600 items-center justify-center text-xs font-bold cursor-help"
                              title={errors.join(' · ')}
                            >
                              !
                            </span>
                          )}
                        </td>
                        {/* Data cells */}
                        {STAFF_HEADERS.map((h) => {
                          const raw = row[h] || ''
                          const formatted = raw ? formatCellValue(h, raw, symbol) : ''
                          return (
                            <td
                              key={h}
                              className={[
                                'px-4 py-2 border-r border-gray-100 last:border-r-0 whitespace-nowrap',
                                NUM_COLS.has(h) ? 'text-right font-mono text-gray-700 tabular-nums' : 'text-left',
                                h === 'name' ? 'font-semibold text-gray-900' : '',
                                h === 'email' ? 'text-blue-600 text-xs' : '',
                                h === 'department_name' ? 'text-purple-700 font-medium' : '',
                                h === 'role' || h === 'access_level' ? 'text-gray-600' : '',
                                !raw ? 'text-gray-300' : 'text-gray-600',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {formatted || <span className="italic text-xs text-gray-300">—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Invalid row details */}
          {invalidRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-800 mb-2">
                ⚠ {invalidRows.length} row{invalidRows.length > 1 ? 's' : ''} will be skipped due to validation errors
              </p>
              <ul className="text-xs text-red-600 space-y-1">
                {invalidRows.slice(0, 6).map((row, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="font-mono text-red-400">Row {rows.indexOf(row) + 1}:</span>
                    <span>{validateRow(row).join(' · ')}</span>
                  </li>
                ))}
                {invalidRows.length > 6 && (
                  <li className="text-red-400">…and {invalidRows.length - 6} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: Results ───────────────────────────────────────────────── */}
      {step === 'results' && result && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-5">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">Import Complete</h3>
              <p className="text-sm text-gray-500 mt-1">Staff members have been added to your system</p>
            </div>
            <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                <p className="text-4xl font-black text-emerald-700">{result.imported_count}</p>
                <p className="text-xs text-emerald-600 font-semibold mt-1 uppercase tracking-wide">Imported</p>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <p className="text-4xl font-black text-gray-400">{result.skipped_count}</p>
                <p className="text-xs text-gray-400 font-semibold mt-1 uppercase tracking-wide">Skipped</p>
              </div>
            </div>
            {(typeof result.created_new_count === 'number' || typeof result.linked_existing_count === 'number') && (
              <p className="text-xs text-gray-500">
                Created: {Number(result.created_new_count || 0)} · Linked existing: {Number(result.linked_existing_count || 0)}
              </p>
            )}
            {(Number(result.already_exists_count || 0) > 0 || Number(result.skipped_reasons?.already_exists || 0) > 0) && (
              <p className="text-xs text-amber-700">
                Already in your organisation and skipped: {Number(result.already_exists_count || result.skipped_reasons?.already_exists || 0)}
              </p>
            )}
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              Newly created staff can log in with default password{' '}
              <span className="font-mono bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs">Stuff@12345678</span>
              . Linked existing staff keep their current credentials.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={reset}
                className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                Import More
              </button>
              <Link
                to="/app/staff"
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                View Staff →
              </Link>
            </div>
          </div>

          {/* Imported records table */}
          {result.records?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/80 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Imported Records</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                  {result.records.length}
                </span>
              </div>
              <div className="overflow-auto max-h-80">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-800 text-white text-xs">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Name</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Email</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Role</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Access</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Rate/hr</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Annual Budget</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.records.map((r: any, i: number) => (
                      <tr key={r._id || i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-semibold text-gray-900">{r.name}</td>
                        <td className="px-4 py-2.5 text-blue-600 text-xs">{r.email}</td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">{r.role}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">{r.access_level}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700 tabular-nums">
                          {symbol} {Number(r.hourly_rate || 0).toLocaleString('en-ZA')}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-emerald-700 tabular-nums">
                          {symbol} {Number(r.annual_fee_budget || 0).toLocaleString('en-ZA')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
