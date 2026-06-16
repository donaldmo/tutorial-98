import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'

import { API } from '@/lib/workflowApi'
import { Icons } from '@/components/workflow/shared'

type ImportRow = Record<string, string>
type Step = 'upload' | 'preview' | 'results'

interface ImportResult {
  message?: string
  imported_count: number
  skipped_count: number
  records: any[]
}

const JT_HEADERS = [
  'name',
  'description',
  'component_name',
  'role',
  'percentage',
  'hours_multiplier',
] as const

const HEADER_LABELS: Record<string, string> = {
  name: 'Job Type Name',
  description: 'Description',
  component_name: 'Component Name',
  role: 'Role',
  percentage: '%',
  hours_multiplier: 'Hrs ×',
}

const SAMPLE_CSV = [
  'name,description,component_name,role,percentage,hours_multiplier',
  'Tax Advisory,"Tax compliance and advisory services.",TA: Manager,Manager,100,1',
  'Audit Compliance,"Annual audit and compliance.",AC: Auditor,Auditor,100,1',
].join('\n')

function parseCSV(csv: string): ImportRow[] {
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

function groupRowsByJobType(rows: ImportRow[]): { name: string; description: string; rows: ImportRow[] }[] {
  const groups = new Map<string, ImportRow[]>()
  const descriptions = new Map<string, string>()
  for (const row of rows) {
    const name = row.name?.trim()
    if (!name) continue
    if (!groups.has(name)) {
      groups.set(name, [])
      descriptions.set(name, row.description?.trim() || '')
    }
    groups.get(name)!.push(row)
  }
  return Array.from(groups.entries()).map(([name, groupRows]) => ({
    name,
    description: descriptions.get(name) || '',
    rows: groupRows,
  }))
}

function validateJobTypeGroup(group: { name: string; rows: ImportRow[] }): string[] {
  const errors: string[] = []
  if (!group.name) errors.push('Job type name required')
  if (group.rows.length === 0) errors.push('No work components')
  const totalPct = group.rows.reduce((sum, r) => sum + Number(r.percentage || 0), 0)
  if (Math.abs(totalPct - 100) > 0.01) {
    errors.push(`Components sum to ${totalPct}% (must be 100%)`)
  }
  for (const row of group.rows) {
    if (!row.role?.trim()) errors.push('Role required in component')
    if (!row.percentage || Number.isNaN(Number(row.percentage)) || Number(row.percentage) < 0) {
      errors.push('Valid percentage required')
    }
  }
  return errors
}

function deriveServiceFromName(name: string): string {
  const token = name.toLowerCase().replace(/[\s_-]+/g, '')
  if (!token || token === 'general' || token === 'gen') return 'general'
  if (token === 'payroll' || token === 'p') return 'payroll'
  if (token === 'ma' || token === 'managementaccounts' || token === 'managementaccount' || token === 'm') return 'ma'
  if (token === 'onceoff' || token === 'onceoffservice' || token === 'onceoffjob') return 'once_off'
  return 'general'
}

const autoComponentName = (jobTypeName: string, role: string): string => {
  if (!role) return ''
  const service = deriveServiceFromName(jobTypeName)
  if (service === 'payroll') return `P: ${role}`
  if (service === 'ma') return `MA: ${role}`
  if (service === 'once_off') return `Once-off: ${role}`
  const abbr = jobTypeName
    .split(/[\s-]+/)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
  return `${abbr}: ${role}`
}

function buildImportPayload(groups: { name: string; description: string; rows: ImportRow[] }[]) {
  return groups.map((group) => ({
    name: group.name,
    description: group.description || null,
    work_components: group.rows.map((r) => {
      const role = r.role?.trim() || ''
      return {
        name: r.component_name?.trim() || autoComponentName(group.name, role),
        role,
        percentage: Number(r.percentage || 0),
        hours_multiplier: Number(r.hours_multiplier || 1),
        service: deriveServiceFromName(group.name),
      }
    }),
  }))
}

export function JobTypeImportPage({ onRefresh }: any) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result || '')
        const parsed = parseCSV(text)
        if (parsed.length === 0) {
          toast.error('No valid rows found in CSV.')
          if (fileInputRef.current) fileInputRef.current.value = ''
          return
        }
        setRows(parsed)
        setStep('preview')
      } catch {
        toast.error('Failed to parse CSV file.')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.onerror = () => {
      toast.error('Failed to read file.')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      const groups = groupRowsByJobType(rows)
      const payload = buildImportPayload(groups)
      const { data } = await axios.post(
        `${API}/job-types/bulk-import`,
        { job_types: payload },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
      )
      setResult(data)
      setStep('results')
      toast.success(data.message || `${data.imported_count} job type${data.imported_count !== 1 ? 's' : ''} imported`)
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

  const groups = groupRowsByJobType(rows)
  const validGroups = groups.filter((g) => validateJobTypeGroup(g).length === 0)
  const invalidGroups = groups.filter((g) => validateJobTypeGroup(g).length > 0)
  const allErrors = groups.map((g) => ({ name: g.name, errors: validateJobTypeGroup(g) }))

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link
          to="/app/jobs/types"
          className="hover:text-blue-600 transition-colors flex items-center gap-1.5 font-medium"
        >
          <Icons.Tag />
          Job Types
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">Import CSV</span>
      </div>

      <StepBar current={step} />

      {step === 'upload' && (
        <div className="space-y-5">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault() }}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-2xl px-10 py-8 flex flex-row items-center justify-between gap-8 transition-all cursor-pointer border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40"
          >
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-xl">Drop your CSV file here</p>
                <p className="text-sm text-gray-500 mt-0.5">Drag and drop a .csv file, or click to browse</p>
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
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
            />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                  <Icons.Template />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">CSV Template</h4>
                  <p className="text-xs text-gray-500">6 columns · one row per work component</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
                  const link = document.createElement('a')
                  link.href = URL.createObjectURL(blob)
                  link.download = 'job_type_import_template.csv'
                  link.click()
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium"
              >
                <Icons.Download /> Download Template
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="text-sm w-full min-w-max">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="w-8 px-3 py-3 text-center text-xs font-medium text-slate-400 border-r border-slate-700">#</th>
                    {JT_HEADERS.map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap border-r border-slate-700 last:border-r-0">{HEADER_LABELS[h]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Tax Advisory', 'Tax compliance and advisory services.', 'TA: Manager', 'Manager', '100', '1'],
                    ['Audit Compliance', 'Annual audit and compliance.', 'AC: Auditor', 'Auditor', '100', '1'],
                  ].map((row, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2.5 text-center text-xs text-gray-400 border-r border-gray-100 font-mono select-none">{i + 1}</td>
                      {row.map((cell, j) => (
                        <td key={j} className={`px-4 py-2.5 whitespace-nowrap border-r border-gray-100 last:border-r-0 ${
                          j === 0 ? 'font-semibold text-gray-900' :
                          j === 3 ? 'text-purple-700 font-medium' :
                          j === 4 ? 'text-right font-mono text-gray-600 tabular-nums' :
                          j === 5 ? 'text-right font-mono text-gray-600 tabular-nums' :
                          'text-gray-600'
                        }`}>{cell || <span className="text-gray-300 italic">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
              <span className="text-amber-500 mt-0.5">⚠</span>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-amber-800">Import notes</p>
                <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                  <li>One row per work component — rows with the same <strong>name</strong> are grouped into a single job type</li>
                  <li>Components must sum to <strong>100%</strong> per job type</li>
                  <li><strong>name</strong> and <strong>role</strong> are required; <strong>description</strong> is optional (taken from first row)</li>
                  <li><strong>component_name</strong> is auto-generated if left blank (e.g. &ldquo;TA: Manager&rdquo;)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Total Job Types</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{groups.length}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
              <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Valid</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">{validGroups.length}</p>
              <p className="text-xs text-emerald-500 mt-0.5">will be imported</p>
            </div>
            <div className={`rounded-xl border p-4 ${invalidGroups.length > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${invalidGroups.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>Invalid</p>
              <p className={`text-3xl font-bold mt-1 ${invalidGroups.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{invalidGroups.length}</p>
              <p className={`text-xs mt-0.5 ${invalidGroups.length > 0 ? 'text-red-400' : 'text-gray-300'}`}>will be skipped</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/80">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Data Preview</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                  {groups.length} job type{groups.length !== 1 ? 's' : ''}
                </span>
                {invalidGroups.length > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">
                    {invalidGroups.length} invalid
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
                  disabled={importing || validGroups.length === 0}
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
                      Import {validGroups.length} Job Type{validGroups.length !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="overflow-auto max-h-[540px]">
              <table className="w-full text-sm border-collapse min-w-max">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800 text-white">
                    <th className="w-10 px-3 py-2.5 text-center text-xs font-medium text-slate-400 border-r border-slate-700 bg-slate-900">#</th>
                    <th className="w-8 px-2 py-2.5 border-r border-slate-700 bg-slate-900" />
                    <th className="px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap border-r border-slate-700">Job Type</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap border-r border-slate-700">Components</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold whitespace-nowrap border-r border-slate-700">Total %</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap border-r border-slate-700 last:border-r-0">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group, i) => {
                    const errors = validateJobTypeGroup(group)
                    const isValid = errors.length === 0
                    const totalPct = group.rows.reduce((sum, r) => sum + Number(r.percentage || 0), 0)
                    return (
                      <tr
                        key={i}
                        className={`border-b border-gray-100 transition-colors ${
                          isValid ? 'hover:bg-blue-50/30' : 'bg-red-50/60 hover:bg-red-100/40'
                        }`}
                      >
                        <td className="w-10 px-3 py-2 text-center text-xs text-gray-400 border-r border-gray-100 font-mono bg-gray-50/70 select-none">{i + 1}</td>
                        <td className="w-8 px-2 py-2 border-r border-gray-100 text-center">
                          {isValid ? (
                            <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 items-center justify-center text-xs font-bold">✓</span>
                          ) : (
                            <span className="inline-flex w-5 h-5 rounded-full bg-red-100 text-red-600 items-center justify-center text-xs font-bold cursor-help" title={errors.join(' · ')}>!</span>
                          )}
                        </td>
                        <td className="px-4 py-2 border-r border-gray-100">
                          <div className="font-semibold text-gray-900">{group.name}</div>
                          {group.description && <div className="text-xs text-gray-400">{group.description}</div>}
                        </td>
                        <td className="px-4 py-2 border-r border-gray-100">
                          <div className="flex flex-wrap gap-1">
                            {group.rows.map((r, j) => (
                              <span key={j} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                {r.component_name?.trim() || autoComponentName(group.name, r.role?.trim() || '')}
                                <span className="opacity-60">{r.percentage}%</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className={`px-4 py-2 border-r border-gray-100 text-right font-mono tabular-nums ${
                          Math.abs(totalPct - 100) < 0.01 ? 'text-green-700' : 'text-red-600'
                        }`}>{totalPct}%</td>
                        <td className="px-4 py-2 border-r border-gray-100 last:border-r-0">
                          {isValid ? (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Valid</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium" title={errors.join(' · ')}>Invalid</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {invalidGroups.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-800 mb-2">
                ⚠ {invalidGroups.length} job type{invalidGroups.length > 1 ? 's' : ''} will be skipped
              </p>
              <ul className="text-xs text-red-600 space-y-1">
                {allErrors.filter((e) => e.errors.length > 0).slice(0, 6).map((e, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="font-mono text-red-400">{e.name}:</span>
                    <span>{e.errors.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {step === 'results' && result && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-5">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">Import Complete</h3>
              <p className="text-sm text-gray-500 mt-1">Job types have been added to your system</p>
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
            <div className="flex gap-3 justify-center">
              <button
                onClick={reset}
                className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                Import More
              </button>
              <Link
                to="/app/jobs/types"
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                View Job Types →
              </Link>
            </div>
          </div>

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
                      <th className="px-4 py-2.5 text-left font-semibold">Code</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Components</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.records.map((r: any, i: number) => (
                      <tr key={r._id || i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-semibold text-gray-900">{r.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.code}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{r.description || '-'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700 tabular-nums">{r.work_components?.length || 0}</td>
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
