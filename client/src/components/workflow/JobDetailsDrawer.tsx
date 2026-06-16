import type React from 'react'

import { Sheet, SheetContent as SheetContentBase } from '@/components/ui/sheet'
import { formatCurrency, getStatusColor } from '@/components/workflow/shared'

// Cast to typed component — sheet.jsx has no TS declarations
const SheetContent = SheetContentBase as React.FC<{ side?: string; className?: string; style?: React.CSSProperties; children?: React.ReactNode }>
import { formatWorkComponentLabel } from '@/lib/workComponentLabels'

// ── Shared helpers ──────────────────────────────────────────

export const WORKFLOW_STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-gray-100 text-gray-700',
  Doing: 'bg-blue-100 text-blue-700',
  Completed: 'bg-green-100 text-green-700',
}

export function fmtCompLabel(key: string): string {
  return formatWorkComponentLabel(key)
}

function fmtDeadline(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(dateStr: string | null | undefined, status: string | null | undefined): boolean {
  if (!dateStr || status === 'Completed') return false
  return new Date(dateStr) < new Date()
}

// ── Component ─────────────────────────────────────────────────────────────────

interface JobDetailsDrawerProps {
  job: any | null
  symbol?: string
  refreshKey?: number
  onClose: () => void
  allJobTypes?: any[]
  monthEntry?: { month?: number; year?: number; deadline?: string; status?: string } | null
}

export function JobDetailsDrawer({ job, symbol = 'R', refreshKey: _refreshKey = 0, onClose, allJobTypes = [], monthEntry }: JobDetailsDrawerProps) {
  return (
    <Sheet open={!!job} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="sm:max-w-lg w-full flex flex-col p-0 overflow-hidden">
        {job && (
          <>
            {/* Drawer header */}
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50" style={{ paddingRight: '3.5rem' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Job Details</p>
                  <h2 className="text-lg font-bold text-gray-900 truncate">{job.client_name}</h2>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    {job.name}
                    {(() => {
                      const label = (job.job_type_entries || []).map((e: any) => e.job_type_name || '').filter(Boolean).join(' & ')
                      return label ? ` · ${label}` : ''
                    })()}
                  </p>
                  <div className="flex items-center flex-wrap gap-2 mt-2">
                    {monthEntry ? (
                      <>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(monthEntry.status || '')}`}>
                          {monthEntry.status || ''}
                        </span>
                        {monthEntry.deadline ? (
                          <span className={`flex items-center gap-1 text-xs ${isOverdue(monthEntry.deadline, monthEntry.status || '') ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {fmtDeadline(monthEntry.deadline)}
                            {isOverdue(monthEntry.deadline, monthEntry.status || '') && ' ⚠'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No deadline set</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status || '')}`}>
                          {job.status || ''}
                        </span>
                        {job.deadline ? (
                          <span className={`flex items-center gap-1 text-xs ${isOverdue(job.deadline, job.status) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {fmtDeadline(job.deadline)}
                            {isOverdue(job.deadline, job.status) && ' ⚠'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No deadline set</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Fee</p>
                  <p className="text-base font-bold text-green-600">{formatCurrency(Number(job.job_fee || 0), symbol)}</p>
                </div>
              </div>
            </div>

            {/* Component cards — scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Fee Breakdown — derived from job_type_entries */}
              {job.job_type_entries?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">Job Component Split</p>
                  <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-100">
                    {job.job_type_entries.map((entry: any, ei: number) => {
                      const entryTypeId = entry.job_type_id?._id ?? entry.job_type_id
                      const entryFee = Number(entry.fee) || 0
                      const type = allJobTypes.find((t: any) => String(t.id ?? t._id) === String(entryTypeId))
                      if (!type || !entryFee) return null
                      const comps = Array.isArray(entry.work_components) ? entry.work_components : (type.work_components || [])
                      return (
                        <div key={ei}>
                          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                            <span className="font-semibold text-sm text-gray-800">{type.name}</span>
                            <span className="text-xs font-medium text-green-700">{formatCurrency(entryFee, symbol)}</span>
                          </div>
                          {comps.length > 0 ? (
                            <div className="divide-y divide-gray-50">
                              {comps.map((c: any, ci: number) => {
                                const pct = Number(c.percentage || 0)
                                const amount = (entryFee * pct) / 100
                                return (
                                  <div key={ci} className="flex items-center justify-between px-4 py-2 text-sm">
                                    <span className="text-gray-700">{c.role || c.name}</span>
                                    <div className="flex items-center gap-4">
                                      <span className="text-gray-500 w-12 text-right">{pct.toFixed(0)}%</span>
                                      <span className="font-medium text-gray-800 w-24 text-right">{formatCurrency(amount, symbol)}</span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="px-4 py-3 text-xs text-gray-400 italic">No work components defined</div>
                          )}
                        </div>
                      )
                    })}
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
                      <span className="text-sm font-semibold text-gray-700">Total</span>
                      <span className="text-sm font-bold text-green-700">{formatCurrency(Number(job.job_fee || 0), symbol)}</span>
                    </div>
                  </div>
                </div>
              )}


            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
