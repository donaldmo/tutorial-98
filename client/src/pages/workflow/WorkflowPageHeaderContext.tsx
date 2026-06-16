import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type WorkflowPageHeader = {
  title: string
  description: string
  actions?: ReactNode
}

type WorkflowPageHeaderContextValue = {
  header: WorkflowPageHeader
  setHeader: React.Dispatch<React.SetStateAction<WorkflowPageHeader>>
}

const defaultHeader: WorkflowPageHeader = {
  title: 'Workflow Planner',
  description: 'Manage your workflow and operations',
}

const WorkflowPageHeaderContext = createContext<WorkflowPageHeaderContextValue | null>(null)

export function WorkflowPageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<WorkflowPageHeader>(defaultHeader)

  const value = useMemo(() => ({ header, setHeader }), [header])

  return <WorkflowPageHeaderContext.Provider value={value}>{children}</WorkflowPageHeaderContext.Provider>
}

export function useWorkflowPageHeader() {
  const context = useContext(WorkflowPageHeaderContext)

  if (!context) {
    throw new Error('useWorkflowPageHeader must be used within WorkflowPageHeaderProvider')
  }

  return context
}
