import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AllocateStaffModal } from '@/components/workflow/AllocateStaffModal'
import { JobForm } from '@/components/workflow/JobForm'
import api from '@/services/api'

export function AddJobPage({ settings, enums, onRefresh }: any) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const symbol = settings?.currency_symbol || 'R'
  const [createdJob, setCreatedJob] = useState<any>(null)
  const initialTemplateId = searchParams.get('templateId')

  const navigateToJobs = async () => {
    await onRefresh?.()
    navigate('/app/jobs?tab=recurring')
  }

  const handleSubmit = async ({ payload }: { payload: any }) => {
    await api.post('/jobs', payload)
    toast.success('Job created!')
    await navigateToJobs()
  }

  return (
    <div className="w-full space-y-6">
      <JobForm
        onSubmit={handleSubmit}
        onCancel={() => navigateToJobs()}
        symbol={symbol}
        enums={enums}
        initialTemplateId={initialTemplateId}
      />

      <AllocateStaffModal
        job={createdJob}
        symbol={symbol}
        onClose={() => {
          setCreatedJob(null)
          navigateToJobs()
        }}
        onSuccess={async () => {
          setCreatedJob(null)
          await navigateToJobs()
        }}
      />
    </div>
  )
}
