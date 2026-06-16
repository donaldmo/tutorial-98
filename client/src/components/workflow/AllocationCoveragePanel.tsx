/**
 * AllocationCoveragePanel
 *
 * Two-level work-component coverage view:
 *   Level 1 — the job-type split: "Payroll takes 10% of the total job fee"
 *   Level 2 — staff coverage:    "Staff cover 60% of that Payroll slice"
 *
 * RoleBar reads:
 *   - Primary label  : component name (dept or role)
 *   - Secondary line : "X% of job · R xx,xxx budget"   ← Level 1
 *   - Right metric   : "60% covered · R xx / R xx"      ← Level 2
 *   - Progress bar   : fills to coverage % (0–100 of the component slice)
 *   - Staff pills    : "John 40%  R x,xxx" each
 *
 * Data source: GET /jobs/:job_id/allocation-coverage
 */

import { useEffect, useState } from 'react'
import api from '@/services/api'
import { formatWorkComponentBadge, normalizeCompKey, formatWorkComponentLabel } from '@/lib/workComponentLabels'
import { formatCurrency } from '@/components/workflow/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RequiredRole = {
  key: string
  service: string
  role: string | null
  label: string
  requiredPercentage: number
}

export type AllocatedRole = {
  key: string
  service: string | null
  role: string | null
  label: string
  allocatedPercentage: number
  withinTolerance: boolean
  staff: string[]
  staffDetails: { name: string; percentage: number }[]
}

export type CustomAllocation = {
  component_label: string
  component_service: string | null
  component_role: string | null
  allocated_fee: number
  percentage: number
  staff: string[]
  staff_id?: string
}

export type CoverageData = {
  job_id: string
  job_name: string
  job_type_label: string
  job_fee: number
  allocation_status: string
  requiredRoles: RequiredRole[]
  allocatedRoles: AllocatedRole[]
  missingRoles: string[]
  isComplete: boolean
  customAllocations?: CustomAllocation[]
}

export type PendingAllocation = {
  work_component_key: string
  percentage: number // component-relative percentage (0-100)
  staffName?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const badgeColors: Record<string, string> = {
  not_allocated: 'bg-gray-100 text-gray-700 border-gray-200',
  partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  full: 'bg-green-100 text-green-800 border-green-200',
}

// ── RoleBar ───────────────────────────────────────────────────────────────────

function RoleBar({
  required,
  allocated,
}: {
  required: RequiredRole
  allocated: AllocatedRole | undefined
}) {
  // Level 2: how much of that slice staff cover (0–100%)
  const allocatedPct = allocated?.allocatedPercentage ?? 0
  const coveragePct = required.requiredPercentage > 0
    ? Math.min(100, (allocatedPct / required.requiredPercentage) * 100)
    : 0
  const isOver = allocatedPct > required.requiredPercentage + 0.5
  const isMet = !isOver && (allocated?.withinTolerance ?? false)
  const isEmpty = allocatedPct === 0

  const barColor = isOver ? 'bg-red-500' : isMet ? 'bg-green-500' : isEmpty ? 'bg-gray-200' : 'bg-yellow-400'

  return (
    <div className="space-y-2">
      {/* Row 1: component identity + coverage metric */}
      <div className="flex items-start justify-between gap-3">
        {/* Left: name + Level-1 secondary info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {(() => {
              const badge = formatWorkComponentBadge(required.service)
              return (
                <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-bold bg-gray-100 text-gray-600 rounded shrink-0">
                  {badge.label}
                </span>
              )
            })()}
            <span className="font-semibold text-gray-800 text-sm">{required.label}</span>
            {isMet && (
              <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">✓ Met</span>
            )}
            {isOver && (
              <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">Over limit</span>
            )}
            {isEmpty && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">Unassigned</span>
            )}
          </div>
          {/* Level 1 label: share of total job */}
          <p className="text-xs text-gray-400 mt-0.5">
            {required.requiredPercentage}% of job
          </p>
        </div>

        {/* Right: reserved for future metrics */}
      </div>

      {/* Progress bar — fills by coverage % (0–100 of this component's slice) */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${coveragePct}%` }}
        />
      </div>

      {/* Staff pills: each shows their individual % of the component */}
      {allocated && allocated.staffDetails && allocated.staffDetails.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allocated.staffDetails.map((s) => {
            const staffCoverage = required.requiredPercentage > 0
              ? Math.round((s.percentage / required.requiredPercentage) * 100)
              : 0
            return (
              <span
                key={s.name}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full"
                title={`${s.name}: ${s.percentage}% allocation = ${staffCoverage}% of component`}
              >
                <span className="font-medium">{s.name}</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── AllocationCoveragePanel ───────────────────────────────────────────────────

interface AllocationCoveragePanelProps {
  jobId: string
  month?: string
  /** Called whenever coverage data is refreshed so parent can react to status changes */
  onCoverageLoaded?: (coverage: CoverageData) => void
  /** Increment this to force a re-fetch after new allocations are created */
  refreshKey?: number
  /** Optional pending (unsaved) allocations to preview in the coverage view */
  pendingAllocations?: PendingAllocation[]
}

export function AllocationCoveragePanel({
  jobId,
  month,
  onCoverageLoaded,
  refreshKey,
  pendingAllocations = [],
}: AllocationCoveragePanelProps) {
  const [coverage, setCoverage] = useState<CoverageData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) { setCoverage(null); return }

    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (month) params.set('month', month)
        const suffix = params.toString() ? `?${params.toString()}` : ''
        const res = await api.get(`/jobs/${jobId}/allocation-coverage${suffix}`)
        if (!cancelled) {
          setCoverage(res.data)
          onCoverageLoaded?.(res.data)
        }
      } catch {
        if (!cancelled) setError('Failed to load coverage data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, month, refreshKey])

  if (!jobId) return null

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
        Loading coverage…
      </div>
    )
  }

  if (error) return <div className="text-sm text-red-600 py-2">{error}</div>
  if (!coverage) return null

  // Build effective requiredRoles: if the job has a predefined split (requiredRoles), use it.
  // Otherwise synthesize requiredRoles from existing allocated roles and pending allocations
  const effectiveRequiredRoles: RequiredRole[] = (() => {
    if (coverage.requiredRoles && coverage.requiredRoles.length > 0) return coverage.requiredRoles

    // synthesize from allocatedRoles and pendingAllocations
    const map = new Map<string, RequiredRole>()

    // start with existing allocated roles from server (use allocatedPercentage as the pseudo-required %)
    ;(coverage.allocatedRoles || []).forEach((a) => {
      const key = normalizeCompKey(a.key)
      map.set(key, {
        key,
        service: (a.service || '').toLowerCase(),
        role: a.role || null,
        label: a.label || formatWorkComponentLabel(key),
        requiredPercentage: Number(a.allocatedPercentage || 0),
      })
    })

    // include pending allocations (treat provided percentage as absolute job-% when no required split exists)
    for (const p of pendingAllocations || []) {
      const key = normalizeCompKey(p.work_component_key)
      const existing = map.get(key)
      const pendingAbs = Number(p.percentage || 0)
      if (existing) {
        existing.requiredPercentage = Number((existing.requiredPercentage || 0) + pendingAbs)
        map.set(key, existing)
      } else {
        map.set(key, {
          key,
          service: key.split(':')[0] || '',
          role: key.split(':').slice(1).join(':') || null,
          label: formatWorkComponentLabel(key),
          requiredPercentage: pendingAbs,
        })
      }
    }

    return Array.from(map.values())
  })()

  const totalRequiredPct = effectiveRequiredRoles.reduce(
    (sum, r) => sum + (r.requiredPercentage || 0),
    0,
  )

  const badgeKey = totalRequiredPct >= 99.995
    ? 'full'
    : totalRequiredPct > 0
      ? 'partial'
      : 'not_allocated'

  const badgeLabel = badgeKey === 'full'
    ? '100% Allocated'
    : badgeKey === 'partial'
      ? 'Partially Allocated'
      : 'Not Allocated'

  // Merge pending (unsaved) allocations into the coverage view for preview.
  // When the job defines requiredRoles, pendingAllocations percentages are component-relative (0-100)
  // and should be converted to absolute job-% contributions using the requiredRole.requiredPercentage.
  // When we synthesized requiredRoles (no job split), pending percentages are treated as absolute job-%.
  const mergedAllocatedRoles: AllocatedRole[] = (() => {
    const map = new Map<string, AllocatedRole>()
    // start with existing allocated roles from server
    ;(coverage.allocatedRoles || []).forEach((a) => {
      const key = normalizeCompKey(a.key)
      map.set(key, {
        ...a,
        key,
        label: a.label || formatWorkComponentLabel(key),
        staffDetails: Array.isArray(a.staffDetails) ? [...a.staffDetails] : [],
        staff: Array.isArray(a.staff) ? [...a.staff] : [],
      })
    })

    const hasPredefined = Boolean(coverage.requiredRoles && coverage.requiredRoles.length > 0)

    for (const p of pendingAllocations || []) {
      const key = normalizeCompKey(p.work_component_key)
      const req = effectiveRequiredRoles.find((r) => r.key === key)
      if (!req) {
        // If no requirement found (very unusual), skip
        continue
      }

      const pendingAbsolute = hasPredefined
        ? (Number(p.percentage || 0) / 100) * req.requiredPercentage
        : Number(p.percentage || 0)

      const existing = map.get(key)
      if (existing) {
        existing.allocatedPercentage = Number((Number(existing.allocatedPercentage || 0) + pendingAbsolute))
        existing.staffDetails = existing.staffDetails ? [...existing.staffDetails, { name: p.staffName || 'Preview', percentage: pendingAbsolute }] : [{ name: p.staffName || 'Preview', percentage: pendingAbsolute }]
        existing.staff = Array.from(new Set([...(existing.staff || []), p.staffName || 'Preview']))
        existing.withinTolerance = req.requiredPercentage > 0 && Math.abs(existing.allocatedPercentage - req.requiredPercentage) <= 0.5
        map.set(key, existing)
      } else {
        map.set(key, {
          key,
          service: req.service || null,
          role: req.role || null,
          label: req.label,
          allocatedPercentage: Number(pendingAbsolute),
          withinTolerance: req.requiredPercentage > 0 && Math.abs(pendingAbsolute - req.requiredPercentage) <= 0.5,
          staff: p.staffName ? [p.staffName] : [],
          staffDetails: p.staffName ? [{ name: p.staffName, percentage: pendingAbsolute }] : [],
        })
      }
    }

    return Array.from(map.values())
  })()

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-800 shrink-0">Work Component Coverage</span>
          <span className="text-xs text-gray-400 truncate">{coverage.job_type_label}</span>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ml-2 ${badgeColors[badgeKey]}`}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Two-level explanation */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-4 text-xs text-gray-400 border-b border-gray-50">
        <span><span className="font-medium text-gray-500">Level 1</span> — component % of job</span>
        <span>·</span>
        <span><span className="font-medium text-gray-500">Level 2</span> — staff coverage of that component slice</span>
      </div>

      {/* Component bars */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {effectiveRequiredRoles.map((req) => {
          const alloc = mergedAllocatedRoles.find((a) => a.key === req.key)
          return (
            <RoleBar
              key={req.key || req.role || req.label}
              required={req}
              allocated={alloc}
            />
          )
        })}
      </div>

      {/* Missing components alert */}
      {coverage.missingRoles.length > 0 && (
        <div className="mx-4 mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <span className="font-semibold">Missing: </span>
          {coverage.missingRoles.join(', ')}
        </div>
      )}

      {/* Complete banner */}
      {coverage.isComplete && (
        <div className="mx-4 mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium flex items-center gap-2">
          <span>✓</span> All required components are allocated within tolerance
        </div>
      )}

      {/* Custom Allocations section */}
      {coverage.customAllocations && coverage.customAllocations.length > 0 && (
        <div className="border-t border-dashed border-gray-300 mx-4 pt-3 pb-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Custom Allocations</p>
          <div className="space-y-2">
            {coverage.customAllocations.map((ca, i) => (
              <div key={i} className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-800">{ca.component_label}</span>
                  <span className="text-xs font-medium text-green-600">{ca.percentage.toFixed(2)}% · {formatCurrency(ca.allocated_fee, 'R')}</span>
                </div>
                {(ca.component_service || ca.component_role) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[ca.component_service, ca.component_role].filter(Boolean).join(' · ')}
                  </p>
                )}
                {ca.staff.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ca.staff.map((name, si) => (
                      <span key={si} className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{name}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
