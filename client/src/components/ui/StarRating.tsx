import { useState } from 'react'

interface StarRatingProps {
  value?: number
  onChange?: (value: number) => void
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function StarRating({ 
  value = 0, 
  onChange, 
  readonly = false, 
  size = 'md',
  className = '' 
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0)
  
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  }
  
  const Star = ({ filled, hover }: { filled: boolean; hover: boolean }) => (
    <svg
      className={`${sizeClasses[size]} ${filled ? 'text-yellow-400' : 'text-gray-300'} ${hover ? 'scale-110' : ''} transition-all duration-200`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )

  const handleClick = (rating: number) => {
    if (!readonly && onChange) {
      onChange(rating)
    }
  }

  const handleMouseEnter = (rating: number) => {
    if (!readonly) {
      setHoverValue(rating)
    }
  }

  const handleMouseLeave = () => {
    if (!readonly) {
      setHoverValue(0)
    }
  }

  const displayValue = readonly ? value : hoverValue || value

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => handleClick(star)}
          onMouseEnter={() => handleMouseEnter(star)}
          onMouseLeave={handleMouseLeave}
          disabled={readonly}
          className="focus:outline-none disabled:cursor-default"
        >
          <Star 
            filled={star <= displayValue} 
            hover={star <= hoverValue && !readonly} 
          />
        </button>
      ))}
      {!readonly && value > 0 && (
        <span className="ml-2 text-sm text-gray-600">
          {value} star{value !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}