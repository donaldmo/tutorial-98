import axios from 'axios'
import { API_BASE_URL } from '@/config/env'
import type { WorkflowOrganisation } from '@/types/workflow'

const api = axios.create({
  baseURL: API_BASE_URL,
})

api.interceptors.request.use((config) => {
  const isSuperAdminRoute = config.url?.startsWith('/saas/admin/')
  const token = isSuperAdminRoute
    ? localStorage.getItem('super_admin_token')
    : localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// Auto-logout when the server rejects the token (stale session after DB wipe / server restart)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isAuthEndpoint =
        error.config?.url?.includes('/auth/login') ||
        error.config?.url?.includes('/auth/admin-login') ||
        error.config?.url?.includes('/auth/logout')
      const isSuperAdminRoute = error.config?.url?.startsWith('/saas/admin/')
      if (!isAuthEndpoint && !isSuperAdminRoute) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        // Soft redirect — let the React router handle the unauthenticated state
        window.dispatchEvent(new Event('session:expired'))
      }
    }
    return Promise.reject(error)
  }
)

export default api

export interface StaffOrganisationResponse {
  organisations: WorkflowOrganisation[]
  active_organisation_id: string | null
}

export const fetchUserOrganisations = async () => {
  const response = await api.get<StaffOrganisationResponse>('/auth/me/organisations')
  return response.data
}

export const selectUserOrganisation = async (organisationId: string) => {
  const response = await api.post('/auth/select-organisation', { organisation_id: organisationId })
  return response.data
}

export const createAdminOrganisation = async (payload: { firm_name: string; email?: string; phone?: string }) => {
  const response = await api.post('/auth/admin/create-organisation', payload)
  return response.data
}

export const fetchStaffOrganisations = async () => {
  return fetchUserOrganisations()
}

export const selectStaffOrganisation = async (organisationId: string) => {
  return selectUserOrganisation(organisationId)
}

// Review interfaces
export interface ReviewData {
  rating: number
  comments?: string
}

export interface AllocationWithReview {
  id: string
  job_id: string
  staff_id: string
  percentage: number
  allocated_fee: number
  calculated_hours: number
  adjusted_hours: number
  month: string
  notes?: string
  is_reallocated: boolean
  reallocated_from_id?: string
  reallocated_to_id?: string
  reallocation_reason?: string
  reallocated_at?: string
  is_auto_generated: boolean
  source_allocation_id?: string
  is_over_capacity: boolean
  over_capacity_utilization_percentage?: number
  over_capacity_projected_hours?: number
  over_capacity_effective_capacity_hours?: number
  over_capacity_threshold: number
  status: string
  completed_percentage: number
  work_component_key?: string
  workflow_status: 'Pending' | 'Doing' | 'Completed'
  started_at?: string
  started_by?: string
  started_timezone?: string
  completed_at?: string
  completed_by?: string
  completed_timezone?: string
  assigned_to_started_minutes?: number
  started_to_completed_minutes?: number
  snapshot_current_version: number
  last_completed_snapshot_version: number
  snapshot_current?: any
  snapshot_versions: any[]
  organisation_id: string
  created_by?: string
  review_rating?: number
  review_comments?: string
  reviewed_at?: string
  reviewed_by?: string
}

// Review API functions
export const submitAllocationReview = async (allocationId: string, reviewData: ReviewData) => {
  const response = await api.post(`/allocations/${allocationId}/review`, reviewData)
  return response.data
}

export const deleteAllocationReview = async (allocationId: string) => {
  const response = await api.delete(`/allocations/${allocationId}/review`)
  return response.data
}
