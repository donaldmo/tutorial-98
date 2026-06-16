export interface AllocationMetricContext {
  hourlyRate?: number
  efficiency?: number
}

export interface DerivedAllocationMetrics {
  fee: number
  jobFee: number
  budgetedWip: number
  budgetedHrs: number
  hourlyRate: number
  efficiency: number
}

export interface AllocationTotals {
  jobFee: number
  budgetedWip: number
  budgetedHrs: number
  loggedHrs: number
}

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export const getAllocationJobKey = (allocation: any) => String(
  allocation?.job_id
  || `${allocation?.client_name || ''}::${allocation?.job_name || ''}`,
)

export const getDerivedAllocationMetrics = (
  allocation: any,
  context?: AllocationMetricContext,
): DerivedAllocationMetrics => {
  const jobFee = toNumber(allocation?.job_fee)
  const percentage = toNumber(allocation?.percentage)
  const computedFee = jobFee * (percentage / 100)
  const fee = allocation?.allocated_fee != null ? toNumber(allocation.allocated_fee) : computedFee
  const hourlyRate = toNumber(context?.hourlyRate)
  const efficiency = toNumber(context?.efficiency, 1)
  const budgetedHrs = hourlyRate > 0 ? (fee * efficiency) / hourlyRate : 0
  const budgetedWip = hourlyRate * budgetedHrs

  return {
    fee,
    jobFee,
    budgetedWip,
    budgetedHrs,
    hourlyRate,
    efficiency,
  }
}

export const getFirstJobFeeRowIds = (allocations: any[]) => {
  const seenJobKeys = new Set<string>()
  const firstRowIds = new Set<string>()

  for (const allocation of allocations) {
    const jobKey = getAllocationJobKey(allocation)
    if (seenJobKeys.has(jobKey)) continue
    seenJobKeys.add(jobKey)
    firstRowIds.add(String(allocation?.id || jobKey))
  }

  return firstRowIds
}

export const getAllocationTotals = (
  allocations: any[],
  resolveContext: (allocation: any) => AllocationMetricContext,
): AllocationTotals => {
  const seenJobKeys = new Set<string>()
  let jobFee = 0
  let budgetedWip = 0
  let budgetedHrs = 0
  let loggedHrs = 0

  for (const allocation of allocations) {
    const derived = getDerivedAllocationMetrics(allocation, resolveContext(allocation))
    const jobKey = getAllocationJobKey(allocation)

    if (!seenJobKeys.has(jobKey)) {
      seenJobKeys.add(jobKey)
      jobFee += derived.jobFee
    }

    budgetedWip += derived.budgetedWip
    budgetedHrs += derived.budgetedHrs
    loggedHrs += toNumber(allocation?.total_logged_hours)
  }

  return { jobFee, budgetedWip, budgetedHrs, loggedHrs }
}
