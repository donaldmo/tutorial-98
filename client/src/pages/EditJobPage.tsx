import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { JobForm } from '@/components/workflow/JobForm'
import api from '@/services/api'

export function EditJobPage({ settings, enums }: any) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clientId = searchParams.get('clientId')
  const symbol = settings?.currency_symbol || 'R'
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)

    const fetchJob = api.get(`/jobs/${id}`).then((res) => res.data)
    const fetchClient = clientId
      ? api.get(`/clients/${clientId}`).then((res) => res.data).catch(() => null)
      : Promise.resolve(null)

    Promise.all([fetchJob, fetchClient])
      .then(([jobData, clientData]) => {
        if (clientData) {
          jobData.client_name = clientData.name
        }
        setJob(jobData)
      })
      .catch(() => {
        toast.error('Job not found')
        navigate('/app/jobs')
      })
      .finally(() => setLoading(false))
  }, [id, clientId, navigate])

  const handleSubmit = async ({ payload }: { payload: any }) => {
    await api.put(`/jobs/${id}`, payload)
    toast.success('Job updated!')
    navigate('/app/jobs')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <JobForm
        initialData={job}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/app/jobs')}
        symbol={symbol}
        enums={enums}
      />
    </div>
  )
}
