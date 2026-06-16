import { useState, useEffect } from 'react'
import api from '@/services/api'
import { toast } from 'sonner'
import { Modal } from '@/components/workflow/shared'
import { StarRating } from '@/components/ui/StarRating'

interface ReviewModalProps {
  isOpen: boolean
  onClose: () => void
  allocation: any
  onReviewSubmitted: () => void
  mode?: 'create' | 'edit'
}

export function ReviewModal({
  isOpen,
  onClose,
  allocation,
  onReviewSubmitted,
  mode = 'create',
}: ReviewModalProps) {
  const [rating, setRating] = useState<number>(allocation?.review_rating || 0)
  const [comments, setComments] = useState<string>(allocation?.review_comments || '')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)

  const title = mode === 'edit' ? 'Edit Review' : 'Add Review'
  const buttonText = mode === 'edit' ? 'Update Review' : 'Submit Review'

  // In edit mode, ensure review data is loaded
  useEffect(() => {
    if (mode === 'edit' && allocation && !allocation.review_rating) {
      // Fetch fresh allocation data to ensure we have current review info
      setLoading(true)
      api.get(`/allocations/${allocation.id}`)
        .then((res) => {
          const freshData = res.data
          setRating(freshData.review_rating || 0)
          setComments(freshData.review_comments || '')
        })
        .finally(() => setLoading(false))
    }
  }, [mode, allocation])

  // Handle cases where allocation is not available
  if (!allocation) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Review Allocation" size="lg">
        <div className="text-center py-8">
          <p className="text-gray-500">No allocation data available</p>
        </div>
      </Modal>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    
    // In edit mode, allow empty rating to clear review
    const isValid = mode === 'edit' ? true : rating > 0
    
    if (!isValid) {
      toast.error(mode === 'edit' ? 'Clear both rating and comments to remove review' : 'Please select a rating')
      return
    }
    
    setSubmitting(true)
    try {
      if (!allocation?.id) {
        toast.error('Allocation ID is missing')
        return
      }
      
      // If in edit mode with no rating, delete the review
      if (mode === 'edit' && rating === 0) {
        await api.delete(`/allocations/${allocation.id}/review`)
        toast.success('Review removed successfully')
      } else {
        await api.post(`/allocations/${allocation.id}/review`, {
          rating,
          comments: comments || null
        })
        toast.success(mode === 'edit' ? 'Review updated successfully' : 'Review submitted successfully')
      }
      
      onReviewSubmitted()
    } catch (e: any) {
      const detail = String(e.response?.data?.detail || '')
      toast.error(detail || 'Failed to update review')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setRating(0)
    setComments('')
  }

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={title} 
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Allocation info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-medium text-blue-800 mb-1">Reviewing allocation</p>
          <p className="text-sm text-blue-700">
            {allocation?.job_name || 'Unknown Job'} → {allocation?.staff_name || 'Unknown Staff'}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Component: {allocation?.work_component_key || 'General allocation'}
          </p>
        </div>

  {/* Rating section */}
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-3">
      Rating <span className="text-gray-400 font-normal">{mode === 'edit' ? '(optional to clear review)' : '(required)'}</span>
    </label>
    <StarRating 
      value={rating} 
      onChange={setRating} 
      size="lg"
      className="mb-3"
    />
    <p className="text-xs text-gray-500">
      Rate the quality and completion of this allocation
    </p>
  </div>

        {/* Comments section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Comments <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={4}
            placeholder="Share your feedback about this allocation..."
            className="w-full px-4 py-2 border border-gray-200 rounded-xl resize-y min-h-[112px]"
            maxLength={1000}
          />
          <p className="text-xs text-gray-500 mt-1">
            {comments.length}/1000 characters
          </p>
        </div>

          {/* Review summary */}
          {rating > 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Review Summary</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Rating:</span>
                <span className="text-sm font-medium text-gray-900">
                  {rating} star{rating !== 1 ? 's' : ''}
                </span>
              </div>
              {comments && (
                <div className="flex items-start justify-between">
                  <span className="text-sm text-gray-600">Comments:</span>
                  <span className="text-sm text-gray-900 flex-1 ml-2">
                    {comments}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Clear review option for edit mode */}
          {mode === 'edit' && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-sm text-gray-600 mb-2">To remove this review, clear both rating and comments.</p>
            </div>
          )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              handleReset()
              onClose()
            }}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
            disabled={submitting || loading}
          >
            {loading ? 'Loading…' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting || loading || (mode === 'create' && rating === 0)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300"
          >
            {submitting ? 'Processing…' : buttonText}
          </button>
        </div>
      </form>
    </Modal>
  )
}