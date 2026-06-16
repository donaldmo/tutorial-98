import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface PasswordFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  required?: boolean
  minLength?: number
  autoComplete?: string
  dataTestId?: string
}

export function PasswordField({
  label,
  value,
  onChange,
  placeholder = '••••••••',
  className = 'w-full px-4 py-3 border border-gray-200 rounded-xl',
  required = false,
  minLength,
  autoComplete,
  dataTestId,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false)

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${className} pr-12`}
          placeholder={placeholder}
          autoComplete={autoComplete}
          data-testid={dataTestId}
        />
        <button
          type="button"
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow((prev) => !prev)}
          className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
