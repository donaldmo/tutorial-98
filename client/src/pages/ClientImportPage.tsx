import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'

import { API } from '@/lib/workflowApi'
import { Icons } from '@/components/workflow/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportRow = Record<string, string>
type Step = 'upload' | 'preview' | 'results'

interface ImportResult {
  imported_count: number
  error_count: number
  errors: { row: number; error: string }[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CLIENT_HEADERS = [
  'name',
  'contact_person',
  'email',
  'phone',
  'address',
  'industry',
  'notes',
] as const

const HEADER_LABELS: Record<string, string> = {
  name: 'Client Name',
  contact_person: 'Contact Person',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  industry: 'Industry',
  notes: 'Notes',
}

const SAMPLE_CSV = [
  'name,contact_person,email,phone,address,industry,notes',
  'ABC Manufacturing Pty Ltd,James van der Berg,james@abcmfg.co.za,+27 11 234 5678,14 Industrial Road Johannesburg,Manufacturing,Long-standing client',
  'Cape Tech Solutions,Sara Botha,sara@capetech.co.za,+27 21 789 0123,22 Techno Park Stellenbosch,Technology,Management accounts monthly',
  'Prestige Hotels SA,Chantal du Plessis,chantal@prestigehotels.co.za,+27 21 234 6789,1 Waterfront Drive Cape Town,Hospitality,Full accounting services',
].join('\n')

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCSV(csv: string): ImportRow[] {
  const lines = csv.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map((line) => {
    // Handle quoted fields (e.g. addresses with commas)
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = '' }
      else { current += ch }
    }
    values.push(current.trim())

    const row: ImportRow = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  })
}

function validateRow(row: ImportRow): string[] {
  const errors: string[] = []
  if (!row.name?.trim()) errors.push('Client name required')
  if (!row.industry?.trim()) errors.push('Industry required')
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
    errors.push('Invalid email format')
  return errors
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
                  ? 'bg-green-600 text-white shadow-md shadow-green-200'
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

export function ClientImportPage({ onRefresh }: any) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── File handling ──────────────────────────────────────────────────────────

  const loadFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result || '')
      const parsed = parseCSV(text)
      if (parsed.length === 0) {
        toast.error('No valid rows found in CSV. Check the file format.')
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

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    setImporting(true)
    try {
      const { data } = await axios.post(
        `${API}/clients/import`,
        { clients: rows },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
      )
      setResult(data)
      setStep('results')
      toast.success(`${data.imported_count} client${data.imported_count !== 1 ? 's' : ''} imported`)
      if (data.error_count > 0) toast.warning(`${data.error_count} rows had errors`)
      onRefresh?.()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Import failed')
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
          to="/app/clients"
          className="hover:text-green-600 transition-colors flex items-center gap-1.5 font-medium"
        >
          <Icons.Building />
          Clients
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">Import CSV</span>
      </div>

      {/* Step indicator */}
      <StepBar current={step} />

      {/* ── STEP 1: Upload ────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-5">
          {/* Drop zone — full-width, horizontal */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl px-10 py-8 flex flex-row items-center justify-between gap-8 cursor-pointer transition-all select-none ${
              dragOver
                ? 'border-green-400 bg-green-50 scale-[1.005]'
                : 'border-gray-200 bg-gray-50 hover:border-green-300 hover:bg-green-50/40'
            }`}
          >
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center text-green-600 shrink-0">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-xl">Drop your CSV file here</p>
                <p className="text-sm text-gray-500 mt-0.5">Drag and drop a .csv file, or click anywhere to browse</p>
              </div>
            </div>
            <span className="shrink-0 px-6 py-3 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 shadow-md shadow-green-200">
              Choose File
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
            />
          </div>

          {/* Template card — full-width, bigger table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
                  <Icons.Template />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">CSV Template</h4>
                  <p className="text-xs text-gray-500">7 columns · matches Client model</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
                  const link = document.createElement('a')
                  link.href = URL.createObjectURL(blob)
                  link.download = 'client_import_template.csv'
                  link.click()
                }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium"
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
                    {CLIENT_HEADERS.map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap border-r border-slate-700 last:border-r-0">
                        {HEADER_LABELS[h]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['ABC Manufacturing Pty Ltd', 'James van der Berg', 'james@abcmfg.co.za', '+27 11 234 5678', '14 Industrial Road Germiston JHB', 'Manufacturing', 'Long-standing client since 2019'],
                    ['Sunrise Retail Group', 'Priya Naidoo', 'priya@sunriseretail.co.za', '+27 21 456 7890', '88 Bree Street Cape Town', 'Retail', 'Monthly payroll and quarterly VAT'],
                    ['Goldfields Mining Co', 'David Dlamini', 'david@goldfields.co.za', '+27 18 321 0987', '1 Mine Drive Carletonville', 'Mining', 'Annual audit and tax compliance'],
                    ['Cape Tech Solutions', 'Sara Botha', 'sara@capetech.co.za', '+27 21 789 0123', '22 Techno Park Stellenbosch', 'Technology', 'Management accounts monthly'],
                  ].map((row, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2.5 text-center text-xs text-gray-400 border-r border-gray-100 font-mono select-none">{i + 1}</td>
                      {row.map((cell, j) => (
                        <td key={j} className={`px-4 py-2.5 border-r border-gray-100 last:border-r-0 ${
                          j === 0 ? 'font-semibold text-gray-900 whitespace-nowrap' :
                          j === 2 ? 'text-blue-600 text-xs whitespace-nowrap' :
                          j === 3 ? 'font-mono text-xs text-gray-600 whitespace-nowrap' :
                          j === 5 ? 'whitespace-nowrap' :
                          j === 6 ? 'text-gray-500 text-xs max-w-[200px] truncate' :
                          'text-gray-600 whitespace-nowrap'
                        }`}>
                          {j === 5 && cell ? (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{cell}</span>
                          ) : cell}
                        </td>
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
                  <li><strong>Client name</strong> and <strong>Industry</strong> are required fields</li>
                  <li>Duplicate names are <strong>upserted</strong> (existing record updated)</li>
                  <li>Rows with no name are <strong>skipped</strong></li>
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
            <div className="bg-green-50 rounded-xl border border-green-100 p-4">
              <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Valid</p>
              <p className="text-3xl font-bold text-green-700 mt-1">{validRows.length}</p>
              <p className="text-xs text-green-500 mt-0.5">will be imported</p>
            </div>
            <div className={`rounded-xl border p-4 ${invalidRows.length > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${invalidRows.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>Invalid</p>
              <p className={`text-3xl font-bold mt-1 ${invalidRows.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{invalidRows.length}</p>
              <p className={`text-xs mt-0.5 ${invalidRows.length > 0 ? 'text-red-400' : 'text-gray-300'}`}>will be skipped</p>
            </div>
          </div>

          {/* Excel-like preview table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/80">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Data Preview</span>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
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
                  disabled={importing || validRows.length === 0}
                  className="px-4 py-1.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  {importing ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Icons.Upload />
                      Import {validRows.length} Clients
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
                    <th className="w-10 px-3 py-2.5 text-center text-xs font-medium text-slate-400 border-r border-slate-700 bg-slate-900">
                      #
                    </th>
                    <th className="w-8 px-2 py-2.5 border-r border-slate-700 bg-slate-900" />
                    {CLIENT_HEADERS.map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-r border-slate-700 last:border-r-0 text-left ${
                          h === 'name' ? 'text-green-300' : ''
                        }`}
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
                          isValid ? 'hover:bg-green-50/20' : 'bg-red-50/60 hover:bg-red-100/40'
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
                        {CLIENT_HEADERS.map((h) => {
                          const raw = row[h] || ''
                          return (
                            <td
                              key={h}
                              className={[
                                'px-4 py-2 border-r border-gray-100 last:border-r-0',
                                h === 'name' ? 'font-semibold text-gray-900 whitespace-nowrap' : '',
                                h === 'email' ? 'text-blue-600 text-xs whitespace-nowrap' : '',
                                h === 'phone' ? 'font-mono text-xs text-gray-600 whitespace-nowrap' : '',
                                h === 'industry'
                                  ? 'whitespace-nowrap'
                                  : '',
                                h === 'notes' || h === 'address'
                                  ? 'max-w-[180px] truncate text-gray-500 text-xs'
                                  : '',
                                !raw ? 'text-gray-300' : 'text-gray-600',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {h === 'industry' && raw ? (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium whitespace-nowrap">
                                  {raw}
                                </span>
                              ) : raw || (
                                <span className="italic text-xs text-gray-300">—</span>
                              )}
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
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">Import Complete</h3>
              <p className="text-sm text-gray-500 mt-1">Clients have been added to your system</p>
            </div>
            <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <p className="text-4xl font-black text-green-700">{result.imported_count}</p>
                <p className="text-xs text-green-600 font-semibold mt-1 uppercase tracking-wide">Imported</p>
              </div>
              <div className={`border rounded-xl p-4 ${result.error_count > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                <p className={`text-4xl font-black ${result.error_count > 0 ? 'text-red-500' : 'text-gray-400'}`}>{result.error_count}</p>
                <p className={`text-xs font-semibold mt-1 uppercase tracking-wide ${result.error_count > 0 ? 'text-red-400' : 'text-gray-400'}`}>Errors</p>
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-left max-w-md mx-auto">
                <p className="text-sm font-semibold text-red-800 mb-2">Row errors</p>
                <ul className="text-xs text-red-600 space-y-1">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}><span className="font-mono text-red-400">Row {e.row}:</span> {e.error}</li>
                  ))}
                  {result.errors.length > 5 && <li className="text-red-400">…and {result.errors.length - 5} more</li>}
                </ul>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={reset}
                className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                Import More
              </button>
              <Link
                to="/app/clients"
                className="px-5 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium transition-colors"
              >
                View Clients →
              </Link>
            </div>
          </div>

          {/* Imported records preview */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/80 flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">Processed Rows</span>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                {rows.length}
              </span>
            </div>
            <div className="overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-800 text-white text-xs">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Client Name</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Contact</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Email</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Phone</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Industry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-gray-900">{r.name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.contact_person || '—'}</td>
                      <td className="px-4 py-2.5 text-blue-600 text-xs">{r.email || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{r.phone || '—'}</td>
                      <td className="px-4 py-2.5">
                        {r.industry ? (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{r.industry}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
