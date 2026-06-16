import { Modal } from '@/components/workflow/shared'

type DestructiveConfirmModalProps = {
  isOpen: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  isSubmitting?: boolean
  tone?: 'danger' | 'warning'
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

export function DestructiveConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  tone = 'danger',
  onConfirm,
  onClose,
}: DestructiveConfirmModalProps) {
  const panelClass = tone === 'warning'
    ? 'rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'
    : 'rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900'

  const confirmButtonClass = tone === 'warning'
    ? 'px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:bg-gray-400'
    : 'px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400'

  return (
    <Modal isOpen={isOpen} onClose={() => !isSubmitting && onClose()} title={title}>
      <div className="space-y-4">
        <div className={panelClass}>{description}</div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={confirmButtonClass}
          >
            {isSubmitting ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}