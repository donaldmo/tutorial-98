export type WorkflowViewPreference = 'guide' | 'dashboard'

const STORAGE_KEY = 'workflowOnboardingView'

export function getWorkflowViewPreference(): WorkflowViewPreference | null {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'dashboard' || value === 'guide' ? value : null
}

export function setWorkflowViewPreference(value: WorkflowViewPreference) {
  localStorage.setItem(STORAGE_KEY, value)
}
