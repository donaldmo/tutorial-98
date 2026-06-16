import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { DestructiveConfirmModal } from '@/components/common/DestructiveConfirmModal'
import { JobDetailsDrawer } from '@/components/workflow/JobDetailsDrawer'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Search, ChevronDown, ChevronRight, MoreVertical, Eye, PencilLine, Trash2, Briefcase } from 'lucide-react'
import { getStatusColor, TableLoading } from '@/components/workflow/shared'
import api from '@/services/api'

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    Critical: 'bg-red-100 text-red-800 border-red-200',
    High: 'bg-orange-100 text-orange-800 border-orange-200',
    Medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    Low: 'bg-green-100 text-green-800 border-green-200',
  }
  return colors[priority] || 'bg-gray-100 text-gray-800 border-gray-200'
}

export function JobsPage({
  jobs: _jobs,
  enums: _enums,
  onUpdateJob: _onUpdateJob,
  onDeleteJob,
  settings,
  onRefresh,
  hidePageHeader = false,
  readOnly = false,
}: any) {
  const emptyJobTypeMapping = { department_id: '', percentage: 0 }
  const navigate = useNavigate()
  const [departments, setDepartments] = useState<any[]>([])
  const [_jobTypes, setJobTypes] = useState<string[]>([])
  const [jobTypesCatalog, setJobTypesCatalog] = useState({ system_types: [], custom_types: [] } as any)
  const [_isJobTypeModalOpen, setIsJobTypeModalOpen] = useState(false)
  const [editingJobTypeRow, setEditingJobTypeRow] = useState<any>(null)
  const [_loadingDepartments, setLoadingDepartments] = useState(false)
  const [pendingDeleteJob, setPendingDeleteJob] = useState<any>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [jobDrawer, setJobDrawer] = useState<any>(null)
  const [jobDrawerRefreshKey] = useState(0)
  const [jobTypeMapForm, setJobTypeMapForm] = useState({ name: '', mappings: [{ ...emptyJobTypeMapping, percentage: 100 }] })
  const [_savingJobTypeMap, setSavingJobTypeMap] = useState(false)
  const symbol = settings?.currency_symbol || 'R'
  const [pagedJobs, setPagedJobs] = useState<any[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsTotal, setJobsTotal] = useState(0)
  const [loadedJobsPage, setLoadedJobsPage] = useState(0)
  const [jobsHasMore, setJobsHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const jobsLoadingRef = useRef(jobsLoading)
  jobsLoadingRef.current = jobsLoading
  const jobsPageRef = useRef(loadedJobsPage)
  jobsPageRef.current = loadedJobsPage
  const jobsHasMoreRef = useRef(jobsHasMore)
  jobsHasMoreRef.current = jobsHasMore
  const [showJobNameColumn, setShowJobNameColumn] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')
  const [sortBy] = useState('created_at')
  const [sortOrder] = useState<'asc' | 'desc'>('desc')
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') === 'recurring' ? 'recurring' : searchParams.get('tab') === 'once-off' ? 'once-off' : 'all') as 'all' | 'once-off' | 'recurring'
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const filtersRef = useRef({ is_recurring: null as boolean | null, month: '', search: '', status: '', priority: '', department_id: '', sort_by: 'created_at', sort_order: 'desc' as 'asc' | 'desc' })

  const fetchJobsPage = useCallback(async (page: number, isRecurring?: boolean, month?: string, extraFilters?: { search?: string; status?: string; priority?: string; department_id?: string; sort_by?: string; sort_order?: string }) => {
    try {
      setJobsLoading(true)
      const params = new URLSearchParams({ page: page.toString(), limit: '6' })
      const isRecurringVal = isRecurring ?? filtersRef.current.is_recurring
      const monthVal = month ?? filtersRef.current.month
      if (isRecurringVal !== null) params.append('is_recurring', isRecurringVal.toString())
      if (monthVal) params.append('month', monthVal)
      const searchVal = extraFilters?.search ?? filtersRef.current.search
      const statusVal = extraFilters?.status ?? filtersRef.current.status
      const priorityVal = extraFilters?.priority ?? filtersRef.current.priority
      const deptVal = extraFilters?.department_id ?? filtersRef.current.department_id
      const sortByVal = extraFilters?.sort_by ?? filtersRef.current.sort_by
      const sortOrderVal = extraFilters?.sort_order ?? filtersRef.current.sort_order
      if (searchVal) params.append('search', searchVal)
      if (statusVal) params.append('status', statusVal)
      if (priorityVal) params.append('priority', priorityVal)
      if (deptVal) params.append('department_id', deptVal)
      params.append('sort_by', sortByVal)
      params.append('sort_order', sortOrderVal)
      if (readOnly) params.append('assigned_to_me', 'true')
      const res = await api.get(`/jobs?${params}`)
      const items = res.data.data || []
      const total = res.data.pagination?.total ?? 0
      const totalPages = res.data.pagination?.total_pages ?? 1

      if (page === 1) {
        setPagedJobs(items)
      } else {
        setPagedJobs(prev => {
          const existingIds = new Set(prev.map((j: any) => j.id))
          return [...prev, ...items.filter((j: any) => !existingIds.has(j.id))]
        })
      }
      setJobsTotal(total)
      setJobsHasMore(page < totalPages)
      setLoadedJobsPage(page)
    } catch {
      toast.error('Failed to load jobs')
    } finally {
      setJobsLoading(false)
    }
  }, [readOnly])

  const triggerFetch = useCallback(() => {
    const tab = searchParams.get('tab') === 'recurring' ? 'recurring' : searchParams.get('tab') === 'once-off' ? 'once-off' : 'all'
    filtersRef.current = {
      is_recurring: tab === 'recurring' ? true : tab === 'once-off' ? false : null,
      month: tab === 'recurring' ? selectedMonth : '',
      search: debouncedSearch,
      status: filterStatus,
      priority: filterPriority,
      department_id: filterDepartment,
      sort_by: sortBy,
      sort_order: sortOrder,
    }
    fetchJobsPage(1)
  }, [searchParams, selectedMonth, debouncedSearch, filterStatus, filterPriority, filterDepartment, sortBy, sortOrder, fetchJobsPage])

  useEffect(() => {
    triggerFetch()
  }, [triggerFetch])

  const handleTabChange = (tab: 'all' | 'once-off' | 'recurring') => {
    setSearchParams({ tab })
  }

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month)
  }

  useEffect(() => {
    if (!jobsHasMoreRef.current || jobsLoadingRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !jobsLoadingRef.current && jobsHasMoreRef.current) {
          fetchJobsPage(jobsPageRef.current + 1)
        }
      },
      { rootMargin: '200px' }
    )
    const el = sentinelRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [jobsLoading, jobsHasMore, fetchJobsPage])

  const fetchDepartments = useCallback(async () => {
    setLoadingDepartments(true)
    try {
      const response = await api.get('/departments')
      const departmentList = (response.data?.data || []).filter((department: any) => department.is_active !== false)
      setDepartments(departmentList)
      return departmentList
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load departments')
      return []
    } finally {
      setLoadingDepartments(false)
    }
  }, [])

  const loadJobsMeta = useCallback(async () => {
    try {
      const [departmentList, typesRes] = await Promise.all([
        fetchDepartments(),
        api.get('/job-types'),
      ])
      setDepartments(departmentList)
      setJobTypesCatalog(typesRes.data || { system_types: [], custom_types: [] })
      const allTypes = [
        ...(typesRes.data?.custom_types || []).filter((item: any) => item.is_active).map((item: any) => item.name),
      ]
      setJobTypes(allTypes)
    } catch (error) {
      console.error(error)
    }
  }, [fetchDepartments])

  useEffect(() => {
    loadJobsMeta()
  }, [loadJobsMeta])

  const resetJobTypeMapForm = () => setJobTypeMapForm({ name: '', mappings: [{ ...emptyJobTypeMapping, percentage: 100 }] })

  const _handleJobTypeMappingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jobTypeMapForm.name.trim()) {
      toast.error('Job type name is required')
      return
    }
    if (!jobTypeMapForm.mappings.length) {
      toast.error('Add at least one department allocation')
      return
    }

    const usedDepartments = new Set<string>()
    const workComponents = []

    for (const mapping of jobTypeMapForm.mappings) {
      if (!mapping.department_id) {
        toast.error('Please select a department for each allocation')
        return
      }
      if (usedDepartments.has(mapping.department_id)) {
        toast.error('Each department can only be used once per job type')
        return
      }
      usedDepartments.add(mapping.department_id)

      const percentage = Number(mapping.percentage || 0)
      if (Number.isNaN(percentage) || percentage < 0 || percentage > 100) {
        toast.error('Each percentage must be between 0 and 100')
        return
      }

      const selectedDept = departments.find((item) => item.id === mapping.department_id)
      if (!selectedDept) {
        toast.error('Selected department not found')
        return
      }

      workComponents.push({
        name: `${selectedDept.name} Work`,
        role: selectedDept.name,
        percentage,
        hours_multiplier: 1,
      })
    }

    const totalPercentage = workComponents.reduce((sum, component) => sum + Number(component.percentage || 0), 0)
    if (totalPercentage !== 100) {
      toast.error('Department percentages must add up to 100%')
      return
    }

    setSavingJobTypeMap(true)
    try {
      if (editingJobTypeRow) {
        const targetType = (jobTypesCatalog.custom_types || []).find((item: any) => item.id === editingJobTypeRow.typeId)
        if (!targetType) {
          toast.error('Only custom job types can be edited')
          return
        }
        await api.put(`/job-types/${targetType.id}`, {
          name: jobTypeMapForm.name.trim(),
          description: targetType.description || null,
          is_active: targetType.is_active !== false,
          work_components: workComponents,
        })
      } else {
        const existingCustom = (jobTypesCatalog.custom_types || []).find(
          (item: any) => String(item.name || '').trim().toLowerCase() === jobTypeMapForm.name.trim().toLowerCase(),
        )
        if (existingCustom) {
          await api.put(`/job-types/${existingCustom.id}`, {
            name: jobTypeMapForm.name.trim(),
            description: existingCustom.description || null,
            is_active: existingCustom.is_active !== false,
            work_components: workComponents,
          })
        } else {
          await api.post('/job-types', {
            name: jobTypeMapForm.name.trim(),
            description: null,
            work_components: workComponents,
          })
        }
      }
      toast.success(editingJobTypeRow ? 'Job type mapping updated' : 'Job type mapping saved')
      resetJobTypeMapForm()
      setEditingJobTypeRow(null)
      setIsJobTypeModalOpen(false)
      await loadJobsMeta()
      onRefresh?.()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || `Failed to ${editingJobTypeRow ? 'update' : 'save'} job type mapping`)
    } finally {
      setSavingJobTypeMap(false)
    }
  }

  const _openCreateJobTypeModal = async () => {
    await fetchDepartments()
    setEditingJobTypeRow(null)
    resetJobTypeMapForm()
    setIsJobTypeModalOpen(true)
  }

  const _openEditJobTypeModal = async (jobType: any) => {
    if (!jobType.isCustom) {
      toast.info('Built-in job types cannot be edited here')
      return
    }
    await fetchDepartments()
    setEditingJobTypeRow(jobType)
    setJobTypeMapForm({
      name: jobType.typeName,
      mappings: (jobType.mappings || []).length
        ? jobType.mappings.map((mapping: any) => ({
            department_id: mapping.departmentId || '',
            percentage: mapping.percentage,
          }))
        : [{ ...emptyJobTypeMapping, percentage: 100 }],
    })
    setIsJobTypeModalOpen(true)
  }

  const _addJobTypeMappingRow = () => {
    setJobTypeMapForm((prev) => ({
      ...prev,
      mappings: [...prev.mappings, { ...emptyJobTypeMapping }],
    }))
  }

  const _updateJobTypeMappingRow = (index: number, field: 'department_id' | 'percentage', value: string | number) => {
    setJobTypeMapForm((prev) => ({
      ...prev,
      mappings: prev.mappings.map((mapping, mappingIndex) => (
        mappingIndex === index
          ? { ...mapping, [field]: field === 'percentage' ? Number(value) : value }
          : mapping
      )),
    }))
  }

  const _removeJobTypeMappingRow = (index: number) => {
    setJobTypeMapForm((prev) => ({
      ...prev,
      mappings: prev.mappings.length === 1
        ? [{ ...emptyJobTypeMapping, percentage: 100 }]
        : prev.mappings.filter((_, mappingIndex) => mappingIndex !== index),
    }))
  }

  const openJobDrawer = (job: any) => setJobDrawer(job)

  const getSelectedMonthEntry = (job: any) => {
    const entries = job.recurring_month_entries || []
    if (!entries.length) return null
    if (!selectedMonth) return entries[0]
    const [yearStr, monthStr] = selectedMonth.split('-')
    const year = parseInt(yearStr)
    const month = parseInt(monthStr)
    return entries.find((e: any) => e.month === month && e.year === year) || entries[0]
  }

  const currentTabSummary = useMemo(() => {
    return `${pagedJobs.length} of ${jobsTotal} jobs`
  }, [pagedJobs.length, jobsTotal])

  const _jobTypeRows = useMemo(() => {
    const buildRows = (types: any[], isCustom: boolean) => types.map((type: any) => {
      const mappings = (type.work_components?.length ? type.work_components : [{ role: 'General', percentage: 0 }]).map((component: any) => {
        const matchedDepartment = departments.find((department) => department.name === (component.role || 'General'))
        return {
          departmentId: matchedDepartment?.id || '',
          departmentName: component.role || 'General',
          percentage: Number(component.percentage || 0),
        }
      })

      return {
        key: type.id || type.name,
        typeId: type.id || null,
        typeName: type.name,
        mappings,
        totalPercentage: mappings.reduce((sum: number, mapping: any) => sum + Number(mapping.percentage || 0), 0),
        isCustom,
      }
    })

    return [
      ...buildRows(jobTypesCatalog.custom_types || [], true),
    ]
  }, [departments, jobTypesCatalog.custom_types])

  const allJobTypes = useMemo(() => {
    return [...(jobTypesCatalog.system_types || []), ...(jobTypesCatalog.custom_types || [])]
  }, [jobTypesCatalog])

  const abbreviate = (name: string) =>
    (name || '').split(/\s+/).filter(Boolean).map((w: string) => w[0].toUpperCase()).join('')

  const computeRoleAmounts = useCallback((job: any) => {
    const totalFee = Number(job.job_fee || 0)
    const components: any[] = []
    const typeNames: string[] = []
    let hasBreakdown = false

    // Primary: iterate job_type_entries (flexible dynamic array)
    const entries = job.job_type_entries || []
    if (entries.length > 0) {
      entries.forEach((entry: any) => {
        const entryTypeId = entry.job_type_id?._id ?? entry.job_type_id
        if (!entryTypeId) return
        const type = allJobTypes.find((t: any) => String(t.id ?? t._id) === String(entryTypeId))
        if (!type) return
        typeNames.push(type.name)
        hasBreakdown = true
        const comps = Array.isArray(entry.work_components) ? entry.work_components : (type.work_components || [])
        comps.forEach((c: any) => {
          const pct = Number(c.percentage || 0)
          components.push({
            role: `${abbreviate(type.name)}: ${c.role || c.name}`,
            percentage: pct,
            amount: (totalFee * pct) / 100,
          })
        })
      })
      if (hasBreakdown) {
        return { total: totalFee, components, hasBreakdown: true, typeName: typeNames.join(' & ') }
      }
    }

    const typeName = typeNames.join(' & ')
    return { total: totalFee, components, hasBreakdown, typeName }
  }, [allJobTypes])

  return (
    <div className="space-y-6" data-testid="jobs-page">
      {!hidePageHeader && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{readOnly ? 'My Jobs' : 'Jobs & Engagements'}</h2>
          <p className="text-gray-500 mt-1">
            {readOnly ? 'View the jobs you are allocated to. This page is read-only.' : currentTabSummary}
          </p>
        </div>
      )}

      {/* Tab switcher & Month filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => handleTabChange('all')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'all'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            All Jobs
          </button>
          <button
            onClick={() => handleTabChange('once-off')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'once-off'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Once Off
          </button>
          <button
            onClick={() => handleTabChange('recurring')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'recurring'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Recurring
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
          />
          <button
            onClick={() => handleMonthChange('')}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Partially Allocated">Partially Allocated</option>
          <option value="Fully Allocated">Fully Allocated</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="On Hold">On Hold</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All Priorities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All Departments</option>
          {departments.map((dept: any) => (
            <option key={dept.id} value={dept.id}>{dept.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]" data-testid="jobs-table">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {showJobNameColumn && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <button onClick={() => setShowJobNameColumn(false)} className="inline-flex items-center gap-1 hover:text-gray-700">
                      <ChevronDown className="h-3.5 w-3.5" /> Job Name
                    </button>
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {!showJobNameColumn && (
                    <button onClick={() => setShowJobNameColumn(true)} className="inline-flex items-center gap-1 hover:text-gray-700 mr-1">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  Client
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Job Type</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-green-700 uppercase tracking-wide">Fee</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Deadline</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Alloc. %</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobsLoading && pagedJobs.length === 0 ? (
                <TableLoading colSpan={showJobNameColumn ? 10 : 9} />
              ) : !(Array.isArray(pagedJobs) && pagedJobs.length) ? (
                <tr>
                  <td colSpan={showJobNameColumn ? 10 : 9} className="px-6 py-16 text-center">
                    <p className="text-sm font-medium text-gray-400">No {activeTab === 'all' ? '' : activeTab === 'recurring' ? 'recurring ' : ''}jobs yet</p>
                    <p className="text-xs text-gray-300 mt-1">
                      {readOnly ? 'You do not have any matching jobs for this view yet.' : <>Click <strong className="text-gray-400">+ Add</strong> to create your first job.</>}
                    </p>
                  </td>
                </tr>
              ) : pagedJobs.map((job: any) => {
                const r = computeRoleAmounts(job)
                const monthEntry = getSelectedMonthEntry(job)
                const displayDeadline = monthEntry?.deadline || job.deadline
                const monthData = job.monthly_allocations?.[selectedMonth] || {}
                const displayStatus = activeTab === 'recurring' && selectedMonth
                  ? (monthEntry?.status || job.status)
                  : job.status
                const allocPct = activeTab === 'recurring' && selectedMonth
                  ? Number(monthData.allocated_percentage || 0)
                  : Number(job.total_allocated_percentage)
                return (
                  <tr key={job.id} className="hover:bg-gray-50">
                    {/* Job Name */}
                    {showJobNameColumn && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openJobDrawer(job)}
                          className="font-semibold text-gray-900 text-sm hover:text-blue-600 transition-colors text-left"
                          title="View job details"
                        >
                          {job.name}
                        </button>
                        {job.is_recurring && (
                          <span className="ml-2 px-1.5 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">Recurring</span>
                        )}
                      </td>
                    )}
                    {/* Client Name */}
                    <td className="px-4 py-3 text-sm text-gray-500">{job.client_name}</td>
                    {/* Job Type */}
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const types = r.typeName ? r.typeName.split(' & ') : []
                        if (types.length === 0) return <span className="text-gray-300 text-xs">—</span>
                        return (
                          <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                            {types.slice(0, 2).map((t: string, i: number) => (
                              <span key={i} className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-md whitespace-nowrap">{t}</span>
                            ))}
                            {types.length > 2 && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button type="button" className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-gray-100 text-gray-400">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto min-w-[120px] p-1.5">
                                  <div className="flex flex-col gap-1">
                                    {types.map((t: string, i: number) => (
                                      <span key={i} className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-md">{t}</span>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    {/* Fee */}
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-700">{symbol} {r.total.toFixed(2)}</td>
                    {/* Deadline */}
                    <td className="px-4 py-3 text-center text-sm text-gray-500 whitespace-nowrap">
                      {displayDeadline
                        ? new Date(displayDeadline).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    {/* Department */}
                    <td className="px-4 py-3 text-center text-sm text-gray-500">
                      {(() => {
                        const dept = departments.find((d: any) => d.id === job.department_id)
                        return dept?.name || '—'
                      })()}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(displayStatus || '')}`}>
                        {displayStatus || 'Pending'}
                      </span>
                    </td>
                    {/* Priority */}
                    <td className="px-4 py-3 text-center"><span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${getPriorityColor(job.priority)}`}>{job.priority || 'Medium'}</span></td>
                    {/* Allocation % */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(allocPct, 100)}%`,
                              backgroundColor:
                                allocPct >= 100 ? '#22c55e' :
                                allocPct > 0 ? '#f59e0b' : '#e5e7eb',
                            }}
                          />
                        </div>
                        <span className={`text-xs font-medium ${
                          allocPct >= 100 ? 'text-green-600' :
                          allocPct > 0 ? 'text-amber-600' : 'text-gray-400'
                        }`}>
                          {allocPct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onSelect={() => openJobDrawer(job)}>
                            <Eye className="h-4 w-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          {!readOnly && (
                            <>
                              <DropdownMenuItem onSelect={() => navigate(`/app/allocations/add?clientId=${job.client_id}&jobId=${job.id}`)}>
                                <Briefcase className="h-4 w-4 mr-2" /> Add Allocation
                              </DropdownMenuItem>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-default hover:bg-gray-100 rounded">
                                  <ChevronDown className="h-4 w-4 mr-2" /> Change Status
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-48">
                                  {['Pending', 'Partially Allocated', 'Fully Allocated', 'In Progress', 'Completed', 'On Hold'].map((s) => (
                                    <DropdownMenuItem
                                      key={s}
                                      disabled={s === displayStatus}
                                      onSelect={async () => {
                                        try {
                                          if (job.is_recurring && activeTab === 'recurring' && selectedMonth) {
                                            const [yearStr, monthStr] = selectedMonth.split('-')
                                            const year = Number(yearStr)
                                            const month = Number(monthStr)

                                            if (!Number.isInteger(year) || !Number.isInteger(month)) {
                                              toast.error('Invalid selected month')
                                              return
                                            }

                                            await api.patch(`/jobs/${job.id}/recurring-month`, { status: s, year, month })
                                          } else {
                                            await api.patch(`/jobs/${job.id}/status`, { status: s })
                                          }
                                          toast.success(`Status changed to "${s}"`)
                                          fetchJobsPage(1)
                                        } catch (err: any) {
                                          toast.error(err.response?.data?.detail || 'Failed to update status')
                                        }
                                      }}
                                    >
                                      <span className={`h-2 w-2 rounded-full mr-2 ${getStatusColor(s).split(' ')[0]}`} />
                                      {s}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuItem onSelect={() => navigate(`/app/jobs/${job.id}/edit?clientId=${job.client_id}&edit=true`)}>
                                <PencilLine className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setPendingDeleteJob(job)} className="text-red-600 focus:text-red-700 focus:bg-red-50">
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {jobsHasMore && pagedJobs.length > 0 && (
        <div ref={sentinelRef} className="flex justify-center mt-4">
          {jobsLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading more...
            </div>
          )}
        </div>
      )}

      {/* ── Job Details Drawer ── */}
      <JobDetailsDrawer
        job={jobDrawer}
        symbol={symbol}
        refreshKey={jobDrawerRefreshKey}
        onClose={() => setJobDrawer(null)}
        allJobTypes={allJobTypes}
        monthEntry={jobDrawer && activeTab === 'recurring' ? getSelectedMonthEntry(jobDrawer) : null}
      />

      <DestructiveConfirmModal
        isOpen={!!pendingDeleteJob}
        onClose={() => !deleteSubmitting && setPendingDeleteJob(null)}
        onConfirm={async () => {
          if (!pendingDeleteJob?.id) return
          try {
            setDeleteSubmitting(true)
            await onDeleteJob(pendingDeleteJob.id)
            setPagedJobs((prev) => prev.filter((j) => j.id !== pendingDeleteJob.id))
            setPendingDeleteJob(null)
          } finally {
            setDeleteSubmitting(false)
          }
        }}
        title="Delete Job"
        description={`Delete ${pendingDeleteJob?.name || 'this job'}? This action cannot be undone.`}
        confirmLabel="Delete Job"
        isSubmitting={deleteSubmitting}
      />

    </div>
  )
}
