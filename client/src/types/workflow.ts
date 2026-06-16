export type AccessLevel = 'Standard' | 'Supervisor' | 'Admin' | 'Full' | string

export type WorkflowRecord = Record<string, unknown>

export interface WorkflowOrganisation extends WorkflowRecord {
  id: string
  organisation_id: string
  firm_name: string
  subdomain?: string | null
  role?: string
}

export interface WorkflowUser extends WorkflowRecord {
  id?: number | string
  staff_id?: number | string
  name: string
  role?: string
  email?: string
  phone?: string
  access_level?: AccessLevel
  organisation_id?: string
  orgSession?: string
  organisations?: WorkflowOrganisation[]
  mustChangePassword?: boolean
  show_onboarding?: boolean
  profile_picture_url?: string
}

export interface WorkflowSettings extends WorkflowRecord {
  firm_name?: string
  tagline?: string
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  currency_symbol?: string
  logo_url?: string
  logo_base64?: string
  logo?: string
}

export interface WorkflowDataState {
  staff: WorkflowRecord[]
  jobs: WorkflowRecord[]
  allocations: WorkflowRecord[]
  clients: WorkflowRecord[]
  departments: WorkflowRecord[]
  jobTypes: WorkflowRecord[]
  summary: WorkflowRecord | null
  capacity: WorkflowRecord | null
  insights: WorkflowRecord | null
  timeSummary: WorkflowRecord | null
  workStatusByDepartment: WorkflowRecord | null
  settings: WorkflowSettings | null
  enums: WorkflowRecord | null
  selectedMonth: string
  selectedDepartmentId: string
  loading: boolean
}

export type RouteKey =
  | 'dashboard'
  | 'onboarding'

  | 'my-timesheet'
  | 'my-allocations'
  | 'staff'
  | 'staff-import'
  | 'staff-detail'
  | 'staff-users'
  | 'clients'
  | 'client-import'
  | 'jobs'
  | 'jobs-import'
  | 'jobs-add'
  | 'jobs-detail'
  | 'jobs-edit'
  | 'templates'
  | 'job-templates'
  | 'jobs-types'
  | 'job-types-import'
  | 'allocations'
  | 'allocations-add'
  | 'departments'
  | 'reports'
  | 'efficiency'
  | 'notifications'
  | 'settings'
