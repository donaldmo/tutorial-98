import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Plus, Upload } from 'lucide-react'
import { InviteTeamMemberModal } from '@/components/workflow/InviteTeamMemberModal'

import { AllocateJobPage } from '@/pages/AllocateJobPage'
import { AllocationsPage } from '@/pages/AllocationsPage'
import { ClientsPage } from '@/pages/ClientsPage'
import { ClientImportPage } from '@/pages/ClientImportPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DepartmentsPage } from '@/pages/DepartmentsPage'
import { EfficiencyDashboardPage } from '@/pages/EfficiencyDashboardPage'
import { JobTypesPage } from '@/pages/JobTypesPage'
import { JobTypeImportPage } from '@/pages/JobTypeImportPage'
import { JobsPage } from '@/pages/JobsPage'
import { JobsImportPage } from '@/pages/JobsImportPage'
import { AddJobPage } from '@/pages/AddJobPage'
import { EditJobPage } from '@/pages/EditJobPage'
import { JobTemplatesPage } from '@/pages/JobTemplatesPage'
import { MyAllocationsPage } from '@/pages/MyAllocationsPage'
import { MyTimesheetPage } from '@/pages/MyTimesheetPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { PersonalDashboardPage } from '@/pages/PersonalDashboardPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { StaffDetailPage } from '@/pages/StaffDetailPage'
import { StaffImportPage } from '@/pages/StaffImportPage'
import { StaffPage } from '@/pages/StaffPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { UserManagementPage } from '@/pages/UserManagementPage'
import { useWorkflowPageHeader } from './WorkflowPageHeaderContext'
import type { RouteKey, WorkflowDataState, WorkflowRecord, WorkflowUser } from '@/types/workflow'

interface WorkflowPageOutletProps {
  routeKey: RouteKey
  state: WorkflowDataState
  isAdmin: boolean
  hasFullAccess: boolean
  hasExtendedAccess: boolean
  user: WorkflowUser | null
  effectiveUser: WorkflowUser | null
  onSeedData: () => Promise<void>
  onCreateStaff: (data: WorkflowRecord) => Promise<void>
  onUpdateStaff: (id: number | string, data: WorkflowRecord) => Promise<void>
  onDeleteStaff: (id: number | string) => Promise<void>
  onCreateJob: (data: WorkflowRecord) => Promise<void>
  onUpdateJob: (id: number | string, data: WorkflowRecord) => Promise<void>
  onDeleteJob: (id: number | string) => Promise<void>
  onCreateAllocation: (data: WorkflowRecord) => Promise<void>
  onDeleteAllocation: (id: number | string) => Promise<void>
  onUpdateAllocation: (id: number | string, data: WorkflowRecord) => Promise<void>
  onUpdateSettings: (data: WorkflowRecord) => Promise<void>
  onRefresh: () => Promise<void>
  setSelectedMonth: (month: string) => void
  setSelectedDepartmentId: (departmentId: string) => void
  onUserUpdate: (user: WorkflowUser) => void
}

function JobsHeaderActions({ hasExtendedAccess, settings }: { hasExtendedAccess: boolean; settings: any }) {
  const navigate = useNavigate()
  const primaryColor = settings?.primary_color || '#3B82F6'
  if (!hasExtendedAccess) return null
  return (
    <div className="flex gap-2">
      <Button size="sm" style={{ backgroundColor: primaryColor }} onClick={() => navigate('/app/jobs/add')} data-testid="add-job-btn">
        <Plus className="h-4 w-4" /> Add Job
      </Button>
      <Button size="sm" variant="secondary" onClick={() => navigate('/app/jobs/import')}>
        <Upload className="h-4 w-4" /> Import Job
      </Button>
    </div>
  )
}

function AllocationsHeaderActions({ hasExtendedAccess, settings }: { hasExtendedAccess: boolean; settings: any }) {
  const navigate = useNavigate()
  const primaryColor = settings?.primary_color || '#3B82F6'
  if (!hasExtendedAccess) return null
  return (
    <div className="flex gap-2">
      <Button size="sm" style={{ backgroundColor: primaryColor }} onClick={() => navigate('/app/allocations/add')}>
        <Plus className="h-4 w-4" /> Start Allocation
      </Button>
    </div>
  )
}

function ClientsHeaderActions({ hasExtendedAccess, settings, onAdd }: { hasExtendedAccess: boolean; settings: any; onAdd: () => void }) {
  const navigate = useNavigate()
  const primaryColor = settings?.primary_color || '#3B82F6'
  if (!hasExtendedAccess) return null
  return (
    <div className="flex gap-2">
      <Button size="sm" style={{ backgroundColor: primaryColor }} onClick={onAdd}>
        <Plus className="h-4 w-4" /> Add Client
      </Button>
      <Button size="sm" variant="secondary" onClick={() => navigate('/app/clients/import')}>
        <Upload className="h-4 w-4" /> Import CSV
      </Button>
    </div>
  )
}

function StaffHeaderActions({ hasExtendedAccess, settings, onAdd, isImportBlocked }: { hasExtendedAccess: boolean; settings: any; onAdd: () => void; isImportBlocked: boolean }) {
  const navigate = useNavigate()
  const primaryColor = settings?.primary_color || '#3B82F6'
  if (!hasExtendedAccess) return null
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" disabled={isImportBlocked} onClick={() => !isImportBlocked && navigate('/app/staff/import')} title={isImportBlocked ? 'Add a department first' : ''}>
        <Upload className="h-4 w-4" /> Import CSV
      </Button>
      <Button size="sm" style={{ backgroundColor: primaryColor }} onClick={onAdd}>
        <Plus className="h-4 w-4" /> Add Staff
      </Button>
    </div>
  )
}

function DepartmentsHeaderActions({ hasExtendedAccess, settings, onAdd }: { hasExtendedAccess: boolean; settings: any; onAdd: () => void }) {
  const primaryColor = settings?.primary_color || '#3B82F6'
  if (!hasExtendedAccess) return null
  return (
    <div className="flex gap-2">
      <Button size="sm" style={{ backgroundColor: primaryColor }} onClick={onAdd}>
        <Plus className="h-4 w-4" /> Add Department
      </Button>
    </div>
  )
}

function JobTemplatesHeaderActions({ hasExtendedAccess, settings, onAdd }: { hasExtendedAccess: boolean; settings: any; onAdd: () => void }) {
  const primaryColor = settings?.primary_color || '#3B82F6'
  if (!hasExtendedAccess) return null
  return (
    <div className="flex gap-2">
      <Button size="sm" style={{ backgroundColor: primaryColor }} onClick={onAdd}>
        <Plus className="h-4 w-4" /> New Custom Template
      </Button>
    </div>
  )
}

function JobTypesHeaderActions({ hasExtendedAccess, settings, onAdd }: { hasExtendedAccess: boolean; settings: any; onAdd: () => void }) {
  const navigate = useNavigate()
  const primaryColor = settings?.primary_color || '#3B82F6'
  if (!hasExtendedAccess) return null
  return (
    <div className="flex gap-2">
      <Button size="sm" style={{ backgroundColor: primaryColor }} onClick={onAdd}>
        <Plus className="h-4 w-4" /> Add Job Type
      </Button>
      <Button size="sm" variant="secondary" onClick={() => navigate('/app/jobs/types/import')}>
        <Upload className="h-4 w-4" /> Import Job Types
      </Button>
    </div>
  )
}

function SettingsHeaderActions() {
  const [inviteOpen, setInviteOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setInviteOpen(true)}>
        <Plus className="h-4 w-4" /> Add Team Member
      </Button>
      {inviteOpen && (
        <InviteTeamMemberModal
          onClose={() => setInviteOpen(false)}
        />
      )}
    </>
  )
}

export function WorkflowPageOutlet({
  routeKey,
  state,
  isAdmin,
  hasFullAccess,
  hasExtendedAccess,
  user,
  effectiveUser,
  onSeedData,
  onCreateStaff,
  onUpdateStaff,
  onDeleteStaff,
  onCreateJob,
  onUpdateJob,
  onDeleteJob,
  onCreateAllocation,
  onDeleteAllocation,
  onUpdateAllocation,
  onUpdateSettings,
  onRefresh,
  setSelectedMonth,
  setSelectedDepartmentId,
  onUserUpdate,
}: WorkflowPageOutletProps) {
  const { setHeader } = useWorkflowPageHeader()
  const [jobTypesAddKey, setJobTypesAddKey] = useState(0)
  const [jobTemplatesAddKey, setJobTemplatesAddKey] = useState(0)
  const [clientsAddKey, setClientsAddKey] = useState(0)
  const [departmentsAddKey, setDepartmentsAddKey] = useState(0)
  const [staffAddKey, setStaffAddKey] = useState(0)

  useEffect(() => {
    const pageHeaders: Record<RouteKey, { title: string; description: string; actions?: ReactNode }> = {
      dashboard: {
        title: 'Firm Dashboard',
        description: 'Monitor workload, utilization, and workflow performance',
      },
      'my-timesheet': {
        title: 'My Timesheet',
        description: 'Log and track time spent on your allocated jobs',
      },
      'my-allocations': {
        title: 'My Allocations',
        description: 'View jobs allocated to you for the selected month',
      },
      staff: {
        title: 'Staff Management',
        description: 'Manage team members and staffing records',
        actions: <StaffHeaderActions hasExtendedAccess={hasExtendedAccess} settings={state.settings} onAdd={() => setStaffAddKey((k) => k + 1)} isImportBlocked={!state.departments?.length} />,
      },
      'staff-import': {
        title: 'Import Staff',
        description: 'Bulk import staff members from a CSV file',
      },
      'staff-detail': {
        title: 'Staff Profile',
        description: 'View staff allocation summary and monthly performance',
      },
      'staff-users': {
        title: 'User Management',
        description: 'Manage user roles, permissions, and access levels',
      },
      clients: {
        title: 'Client Management',
        description: 'Manage your client list for job creation',
        actions: <ClientsHeaderActions hasExtendedAccess={hasExtendedAccess} settings={state.settings} onAdd={() => setClientsAddKey((k) => k + 1)} />,
      },
      'client-import': {
        title: 'Import Clients',
        description: 'Bulk import clients from a CSV file',
      },
      jobs: {
        title: 'Jobs & Engagements',
        description: 'Create jobs and manage job types and departments',
        actions: <JobsHeaderActions hasExtendedAccess={hasExtendedAccess} settings={state.settings} />,
      },
      'jobs-import': {
        title: 'Import Jobs',
        description: 'Bulk import jobs from a CSV file',
      },
      'jobs-add': {
        title: 'Add Job',
        description: 'Create a new job engagement from scratch or from a template',
      },
      'jobs-edit': {
        title: 'Edit Job',
        description: 'Update job details and service fees',
      },
      'jobs-detail': {
        title: 'Job Details',
        description: 'Review job details, allocations, and activity',
      },
      templates: {
        title: 'Templates',
        description: 'View and manage system and custom templates',
      },
      'job-templates': {
        title: 'Job Templates',
        description: 'Manage system and custom job templates for the add-job flow',
        actions: <JobTemplatesHeaderActions hasExtendedAccess={hasExtendedAccess} settings={state.settings} onAdd={() => setJobTemplatesAddKey((k) => k + 1)} />,
      },
      'jobs-types': {
        title: 'Job Types Management',
        description: 'Manage custom job types for your firm',
        actions: <JobTypesHeaderActions hasExtendedAccess={hasExtendedAccess} settings={state.settings} onAdd={() => setJobTypesAddKey((k) => k + 1)} />,
      },
      'job-types-import': {
        title: 'Import Job Types',
        description: 'Bulk import job types from a CSV file',
      },
      allocations: {
        title: 'Job Allocations',
        description: 'Assign jobs to staff and monitor workload',
        actions: <AllocationsHeaderActions hasExtendedAccess={hasExtendedAccess} settings={state.settings} />,
      },
      'allocations-add': {
        title: 'Allocate Job to Staff',
        description: 'Assign staff to a job based on work-component split rules',
      },
      departments: {
        title: 'Departments',
        description: 'Manage organizational structure and job categorization',
        actions: <DepartmentsHeaderActions hasExtendedAccess={hasExtendedAccess} settings={state.settings} onAdd={() => setDepartmentsAddKey((k) => k + 1)} />,
      },
      reports: {
        title: 'Reports & Analytics',
        description: 'Advanced analytics and insights for your firm',
      },
      efficiency: {
        title: 'Efficiency & Analytics',
        description: 'Track performance and identify improvement areas',
      },
      notifications: {
        title: 'Notifications',
        description: 'View and manage workflow notifications',
      },      onboarding: {
        title: 'Onboarding Guide',
        description: 'Walk through setup steps to get your firm running',
      },      settings: {
        title: 'Settings',
        description: 'Configure your firm preferences',
        actions: <SettingsHeaderActions />,
      },
    }

    setHeader(pageHeaders[routeKey])
  }, [routeKey, setHeader, hasExtendedAccess, state])
  // Only show the global loading spinner for the dashboard route when there is
  // no staff data yet. Allow pages like imports to render immediately while
  // background data loads so UI actions (file selection) are responsive.
  if (routeKey === 'dashboard' && state.loading && state.staff.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  // legacy check removed — unused

  // Do not navigate away from dashboard; let Dashboard render onboarding inline when appropriate

  switch (routeKey) {
    case 'dashboard':
      if (isAdmin && user?.show_onboarding !== false) {
        return <Navigate to="/app/onboarding" replace />
      }

      return hasExtendedAccess ? (
        <DashboardPage
          summary={state.summary}
          capacity={state.capacity}
          insights={state.insights}
          timeSummary={state.timeSummary}
          workStatusByDept={state.workStatusByDepartment}
          departments={state.departments}
          settings={state.settings}
          onSeedData={onSeedData}
          selectedMonth={state.selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedDepartmentId={state.selectedDepartmentId}
          setSelectedDepartmentId={setSelectedDepartmentId}
          hidePageHeader
        />
      ) : (
        <PersonalDashboardPage user={effectiveUser} settings={state.settings} onUserUpdate={onUserUpdate} hidePageHeader />
      )
    case 'my-timesheet':
      return (
        <MyTimesheetPage
          user={effectiveUser}
          settings={state.settings}
          staff={state.staff}
          canSelectStaff={hasExtendedAccess}
          hidePageHeader
        />
      )
    case 'my-allocations':
      return <MyAllocationsPage user={effectiveUser} settings={state.settings} hidePageHeader />
    case 'staff':
      return hasExtendedAccess ? (
        <StaffPage
          staff={state.staff}
          enums={state.enums}
          onCreateStaff={onCreateStaff}
          onUpdateStaff={onUpdateStaff}
          onDeleteStaff={onDeleteStaff}
          settings={state.settings}
          onRefresh={onRefresh}
          user={user}
          hidePageHeader
          addTriggerKey={staffAddKey}
        />
      ) : null
    case 'staff-import':
      return hasExtendedAccess ? (
        <StaffImportPage onRefresh={onRefresh} settings={state.settings} />
      ) : null
    case 'staff-detail':
      return hasExtendedAccess ? (
        <StaffDetailPage selectedMonth={state.selectedMonth} settings={state.settings} />
      ) : null
    case 'staff-users':
      return hasFullAccess ? <UserManagementPage staff={state.staff} onRefresh={onRefresh} user={user} settings={state.settings} hidePageHeader /> : null
    case 'clients':
      return hasFullAccess ? <ClientsPage settings={state.settings} onRefresh={onRefresh} hidePageHeader addTriggerKey={clientsAddKey} /> : null
    case 'client-import':
      return hasFullAccess ? <ClientImportPage onRefresh={onRefresh} settings={state.settings} /> : null
    case 'jobs':
      return hasExtendedAccess ? (
        <JobsPage
          jobs={state.jobs}
          enums={state.enums}
          onCreateJob={onCreateJob}
          onUpdateJob={onUpdateJob}
          onDeleteJob={onDeleteJob}
          settings={state.settings}
          onRefresh={onRefresh}
          hidePageHeader
        />
      ) : null
    case 'jobs-import':
      return hasExtendedAccess ? (
        <JobsImportPage onRefresh={onRefresh} settings={state.settings ?? undefined} />
      ) : null
    case 'jobs-add':
      return hasExtendedAccess ? (
        <AddJobPage settings={state.settings} enums={state.enums} onRefresh={onRefresh} />
      ) : null
    case 'jobs-edit':
      return hasExtendedAccess ? (
        <EditJobPage settings={state.settings} enums={state.enums} />
      ) : null
    case 'templates':
      return hasFullAccess ? <TemplatesPage settings={state.settings} enums={state.enums} onRefresh={onRefresh} hidePageHeader /> : null
    case 'job-templates':
      return hasFullAccess ? <JobTemplatesPage settings={state.settings} enums={state.enums} onRefresh={onRefresh} hidePageHeader addTriggerKey={jobTemplatesAddKey} /> : null
    case 'jobs-types':
      return hasFullAccess ? <JobTypesPage settings={state.settings} onRefresh={onRefresh} hidePageHeader addTriggerKey={jobTypesAddKey} /> : null
    case 'job-types-import':
      return hasFullAccess ? <JobTypeImportPage onRefresh={onRefresh} settings={state.settings} /> : null
    case 'allocations':
      return hasExtendedAccess ? (
        <AllocationsPage
          allocations={state.allocations}
          jobs={state.jobs}
          staff={state.staff}
          onDeleteAllocation={onDeleteAllocation}
          onUpdateAllocation={onUpdateAllocation}
          selectedMonth={state.selectedMonth}
          settings={state.settings}
          onRefresh={onRefresh}
          user={user}
          hidePageHeader
        />
      ) : null
    case 'allocations-add':
      return hasExtendedAccess ? (
        <AllocateJobPage
          jobs={state.jobs}
          staff={state.staff}
          capacity={state.capacity}
          enums={state.enums}
          onCreateAllocation={onCreateAllocation}
          selectedMonth={state.selectedMonth}
          setSelectedMonth={setSelectedMonth}
          settings={state.settings}
          onRefresh={onRefresh}
        />
      ) : null
    case 'departments':
      return hasFullAccess ? <DepartmentsPage staff={state.staff} onRefresh={onRefresh} hidePageHeader addTriggerKey={departmentsAddKey} /> : null
    case 'reports':
      return hasExtendedAccess ? <ReportsPage settings={state.settings} hidePageHeader /> : null
    case 'onboarding':
      return hasExtendedAccess ? (
        <OnboardingPage
          state={state}
          settings={state.settings}
          user={user}
          onUserUpdate={onUserUpdate}
        />
      ) : null
    case 'efficiency':
      return hasExtendedAccess ? (
        <EfficiencyDashboardPage settings={state.settings} hidePageHeader />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
          You do not currently have permission to view Efficiency analytics. Ask an admin to grant Supervisor, Admin, or Full access.
        </div>
      )
    case 'notifications':
      return hasExtendedAccess ? <NotificationsPage user={user} settings={state.settings} hidePageHeader /> : null
    case 'settings':
      return hasFullAccess ? (
        <SettingsPage settings={state.settings} enums={state.enums} onUpdateSettings={onUpdateSettings} onRefresh={onRefresh} user={user} onUserUpdate={onUserUpdate} hidePageHeader />
      ) : null
    default:
      return <PersonalDashboardPage user={effectiveUser} settings={state.settings} onUserUpdate={onUserUpdate} hidePageHeader />
  }
}
