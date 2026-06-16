import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { toast } from 'sonner'

import api from '@/services/api'
import type { WorkflowDataState, WorkflowRecord, WorkflowSettings, WorkflowUser } from '@/types/workflow'

const getCurrentMonth = () => new Date().toISOString().slice(0, 7)

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data as { detail?: string; errors?: string[] } | undefined
    return detail?.errors?.[0] ?? detail?.detail ?? fallback
  }

  return fallback
}

export function useWorkflowData(enabled: boolean) {
  const [staff, setStaff] = useState<WorkflowRecord[]>([])
  const [jobs, setJobs] = useState<WorkflowRecord[]>([])
  const [allocations, setAllocations] = useState<WorkflowRecord[]>([])
  const [clients, setClients] = useState<WorkflowRecord[]>([])
  const [departments, setDepartments] = useState<WorkflowRecord[]>([])
  const [jobTypes, setJobTypes] = useState<WorkflowRecord[]>([])
  const [summary, setSummary] = useState<WorkflowRecord | null>(null)
  const [capacity, setCapacity] = useState<WorkflowRecord | null>(null)
  const [insights, setInsights] = useState<WorkflowRecord | null>(null)
  const [timeSummary, setTimeSummary] = useState<WorkflowRecord | null>(null)
  const [workStatusByDepartment, setWorkStatusByDepartment] = useState<WorkflowRecord | null>(null)
  const [settings, setSettings] = useState<WorkflowSettings | null>(null)
  const [enums, setEnums] = useState<WorkflowRecord | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('all')
  const [loading, setLoading] = useState(true)

  const dashboardParams = useMemo(() => ({
    month: selectedMonth,
    ...(selectedDepartmentId !== 'all' ? { department_id: selectedDepartmentId } : {}),
  }), [selectedDepartmentId, selectedMonth])

  const fetchBranding = useCallback(async () => {
    try {
      const response = await api.get('/settings')
      setSettings(response.data as WorkflowSettings)
    } catch {
      console.error('Failed to fetch branding settings')
    }
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [staffRes, jobsRes, allocRes, summaryRes, capacityRes, insightsRes, timeSummaryRes, workStatusRes, settingsRes, enumsRes, clientsRes, departmentsRes, jobTypesRes] = await Promise.allSettled([
        api.get('/staff'),
        api.get('/jobs'),
        api.get('/allocations', { params: { month: selectedMonth, limit: 500 } }),
        api.get('/dashboard/summary-enhanced', { params: dashboardParams }),
        api.get('/dashboard/capacity', { params: dashboardParams }),
        api.get('/dashboard/insights', { params: dashboardParams }),
        api.get('/dashboard/time-summary', { params: dashboardParams }),
        api.get('/dashboard/work-status-by-department', { params: dashboardParams }),
        api.get('/settings'),
        api.get('/enums'),
        api.get('/clients?limit=1'),
        api.get('/departments?limit=200'),
        api.get('/job-types?limit=1'),
      ])

      // Helper: extract value from settled result, falling back to a default
      const val = <T>(result: PromiseSettledResult<{ data: T }>, fallback: T): T =>
        result.status === 'fulfilled' ? result.value.data : fallback

      // List endpoints return { data: [...], pagination: {} } — extract the inner array
      const staffData = val(staffRes, [] as any)
      const jobsData = val(jobsRes, [] as any)
      const allocData = val(allocRes, [] as any)
      const clientsData = val(clientsRes, [] as any)
      const departmentsData = val(departmentsRes, [] as any)
      const jobTypesData = val(jobTypesRes, [] as any)

      // All list endpoints return { data: [...], pagination: {...} } — extract the inner array
      setStaff(((staffData?.data ?? staffData) || []) as WorkflowRecord[])
      setJobs(((jobsData?.data ?? jobsData) || []) as WorkflowRecord[])
      setAllocations(((allocData?.data ?? allocData) || []) as WorkflowRecord[])
      setClients(((clientsData?.data ?? clientsData) || []) as WorkflowRecord[])
      setDepartments(((departmentsData?.data ?? departmentsData) || []) as WorkflowRecord[])
      setJobTypes(((jobTypesData?.data ?? jobTypesData) || []) as WorkflowRecord[])
      setSummary(val(summaryRes, null) as WorkflowRecord)
      setCapacity(val(capacityRes, null) as WorkflowRecord)
      setInsights(val(insightsRes, null) as WorkflowRecord)
      setTimeSummary(val(timeSummaryRes, null) as WorkflowRecord)
      setWorkStatusByDepartment(val(workStatusRes, null) as WorkflowRecord)
      if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.data as WorkflowSettings)
      if (enumsRes.status === 'fulfilled') setEnums(enumsRes.value.data as WorkflowRecord)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [dashboardParams, selectedMonth])

  useEffect(() => {
    void fetchBranding()
  }, [fetchBranding])

  useEffect(() => {
    if (enabled) {
      void fetchData()
    }
  }, [enabled, fetchData])

  const mutate = useCallback(
    async (request: () => Promise<unknown>, successMessage: string, fallbackMessage = 'Failed') => {
      try {
        await request()
        toast.success(successMessage)
        await fetchData()
      } catch (error) {
        toast.error(getErrorMessage(error, fallbackMessage))
      }
    },
    [fetchData],
  )

  const actions = useMemo(() => ({
    fetchData,
    setSelectedMonth,
    setSelectedDepartmentId,
    handleSeedData: () => mutate(() => api.post('/seed'), 'Sample data loaded!', 'Failed to load sample data'),
    handleCreateStaff: async (data: WorkflowRecord) => {
      const response = await api.post('/staff', data)
      if (response.data?.attached_existing_staff) {
        toast.success('Staff already existed and has been added to this organisation.')
      } else if (response.data?.email_queued || response.data?.email_sent) {
        toast.success('Staff account created! Invite email has been queued for delivery.')
      } else {
        toast.success('Staff account created! Invite email has been queued for delivery.')
      }
      await fetchData()
    },
    handleUpdateStaff: async (id: number | string, data: WorkflowRecord) => {
      await api.put(`/staff/${id}`, data)
      toast.success('Staff updated!')
      await fetchData()
    },
    handleDeleteStaff: (id: number | string) => mutate(() => api.delete(`/staff/${id}`), 'Deleted!'),
    handleCreateJob: (data: WorkflowRecord) => mutate(() => api.post('/jobs', data), 'Job created!'),
    handleUpdateJob: (id: number | string, data: WorkflowRecord) => mutate(() => api.put(`/jobs/${id}`, data), 'Job updated!'),
    handleDeleteJob: (id: number | string) => mutate(() => api.delete(`/jobs/${id}`), 'Deleted!'),
    handleCreateAllocation: async (data: any) => {
      const { edit, ...body } = data
      const query = edit ? '?edit=true' : ''
      const payload = body.months ? body : { ...body, month: body.month ?? selectedMonth }
      const response = await api.post(`/allocations${query}`, payload)
      const items = Array.isArray(response.data) ? response.data : [response.data]
      const first = items[0]
      const details = first?.calculation_details as { allocated_fee?: number; adjusted_hours?: number } | undefined
      const symbol = settings?.currency_symbol ?? 'R'
      const fee = typeof details?.allocated_fee === 'number' ? `${symbol}${details.allocated_fee.toFixed(2)}` : ''
      const hours = typeof details?.adjusted_hours === 'number' ? `${details.adjusted_hours}h` : ''
      const suffix = fee && hours ? ` Fee: ${fee} → ${hours}` : ''
      toast.success(items.length > 1 ? `Allocated ${items.length} months!${suffix}` : `Allocated!${suffix}`)
      await fetchData()
    },
    handleDeleteAllocation: (id: number | string) =>
      mutate(() => api.delete(`/allocations/${id}`), 'Removed!'),
    handleUpdateAllocation: (id: number | string, data: WorkflowRecord) =>
      mutate(() => api.put(`/allocations/${id}`, data), 'Allocation updated!'),
    handleUpdateSettings: (data: WorkflowRecord) => mutate(() => api.put('/settings', data), 'Settings updated!'),
  }), [fetchData, mutate, selectedMonth, settings?.currency_symbol])

  const state: WorkflowDataState = {
    staff,
    jobs,
    allocations,
    clients,
    departments,
    jobTypes,
    summary,
    capacity,
    insights,
    timeSummary,
    workStatusByDepartment,
    settings,
    enums,
    selectedMonth,
    selectedDepartmentId,
    loading,
  }

  const getEffectiveUser = useCallback(
    (user: WorkflowUser | null, isGuest: boolean): WorkflowUser | null => {
      if (user) {
        return user
      }

      if (isGuest && staff.length > 0) {
        const partner =
          staff.find((member: WorkflowRecord) => member.role === 'Partner' || member.role === 'Director') ?? staff[0]
        return {
          id: partner.id as number | string | undefined,
          staff_id: partner.id as number | string | undefined,
          name: String(partner.name ?? 'Guest'),
          role: String(partner.role ?? 'Administrator'),
          access_level: 'Full',
        }
      }

      return null
    },
    [staff],
  )

  return {
    state,
    actions,
    getEffectiveUser,
  }
}
