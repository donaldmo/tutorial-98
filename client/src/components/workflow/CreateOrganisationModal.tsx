import { useMemo, useState } from 'react'

import { Modal } from '@/components/workflow/shared'

interface CreateOrganisationPayload {
  firm_name: string
}

interface CreateOrganisationModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: CreateOrganisationPayload) => Promise<void>
}

export function CreateOrganisationModal({ isOpen, onClose, onSubmit }: CreateOrganisationModalProps) {
  const [form, setForm] = useState({ firm_name: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const trimmedFirmName = form.firm_name.trim()

  const subdomainPreview = useMemo(() => {
    const value = trimmedFirmName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 25)
    return value || 'organisation-name'
  }, [trimmedFirmName])

  const resetAndClose = () => {
    setForm({ firm_name: '' })
    setError('')
    setSaving(false)
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (trimmedFirmName.length < 2) {
      setError('Organisation name must be at least 2 characters.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await onSubmit({
        firm_name: trimmedFirmName,
      })
      resetAndClose()
    } catch (submitError: any) {
      setError(submitError?.response?.data?.detail || 'Failed to create organisation.')
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title="Create Organisation">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 p-4">
          <p className="text-sm font-semibold text-slate-800">New workspace setup</p>
          <p className="mt-1 text-xs text-slate-600">
            A dedicated organisation will be created and switched as your active context.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/80 px-3 py-1.5 text-xs text-slate-600 border border-sky-100">
            <span className="font-medium text-slate-700">Subdomain preview:</span>
            <span className="font-mono text-sky-700">{subdomainPreview}</span>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Organisation name</label>
          <input
            type="text"
            value={form.firm_name}
            onChange={(event) => setForm((current) => ({ ...current, firm_name: event.target.value }))}
            placeholder="Acme Advisory"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            disabled={saving}
            required
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={resetAndClose}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
            disabled={saving}
          >
            {saving ? 'Creating...' : 'Create Organisation'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
