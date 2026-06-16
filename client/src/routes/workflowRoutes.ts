import type { RouteKey, WorkflowUser } from '@/types/workflow'

export const routeKeyToPath: Record<RouteKey, string> = {
  dashboard: '/app/dashboard',
  onboarding: '/app/onboarding',

  'my-timesheet': '/app/my/timesheet',
  'my-allocations': '/app/my/allocations',
  staff: '/app/staff',
  'staff-import': '/app/staff/import',
  'staff-detail': '/app/staff',
  'staff-users': '/app/staff/users',
  clients: '/app/clients',
  'client-import': '/app/clients/import',
  jobs: '/app/jobs',
  'jobs-import': '/app/jobs/import',
  'jobs-add': '/app/jobs/add',
  'jobs-detail': '/app/jobs',
  'jobs-edit': '/app/jobs',
  templates: '/app/templates',
  'job-templates': '/app/job-templates',
  'jobs-types': '/app/jobs/types',
  'job-types-import': '/app/jobs/types/import',
  allocations: '/app/allocations',
  'allocations-add': '/app/allocations/add',
  departments: '/app/departments',
  reports: '/app/reports',
  efficiency: '/app/analytics/efficiency',
  notifications: '/app/notifications',
  settings: '/app/settings',
}

const orderedEntries = Object.entries(routeKeyToPath).sort((a, b) => b[1].length - a[1].length) as Array<[RouteKey, string]>

export function inferRouteKey(pathname: string): RouteKey {
  const found = orderedEntries.find(([, path]) => pathname === path || pathname.startsWith(`${path}/`))
  return found?.[0] ?? 'dashboard'
}

export function getDefaultAppPath(user: WorkflowUser | null, isGuest: boolean): string {
  if (isGuest) return routeKeyToPath.dashboard

  const userType = localStorage.getItem('userType')
  if (userType === 'staff') return '/staff/dashboard'

  // Admin or untyped legacy session
  return user?.show_onboarding === false ? routeKeyToPath.dashboard : routeKeyToPath.onboarding
}
