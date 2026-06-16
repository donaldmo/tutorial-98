import React, { useState } from 'react'
import axios from 'axios'
import { toast } from 'sonner'

import { API } from '@/lib/workflowApi'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

export const Icons = {
  Dashboard: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  User: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  Users: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  Briefcase: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  Calendar: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  Chart: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  Settings: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Plus: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  Trash: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-4 h-4 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Edit: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-4 h-4 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  Eye: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-4 h-4 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
  Close: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  AlertCircle: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Check: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  Warning: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  Bell: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  Menu: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-6 h-6 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  SidebarClose: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h4v14H4zM20 12h-9m0 0l3-3m-3 3l3 3" /></svg>,
  Upload: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
  Download: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
  Logout: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  Clock: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  TrendingUp: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  TrendingDown: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>,
  Template: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>,
  Building: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  BarChart: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  Shield: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Archive: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-4 h-4 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>,
  Restore: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-4 h-4 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  Repeat: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-4 h-4 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  Tag: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>,
  Swap: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  Key: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-4 h-4 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>,
  Lightbulb: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-5 h-5 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  Star: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} className={`w-4 h-4 ${props.className ?? ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
} as const

export const formatCurrency = (amount: number, symbol = 'R') =>
  `${symbol}${Number(amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    Pending: 'bg-gray-100 text-gray-800',
    'Partially Allocated': 'bg-orange-100 text-orange-800',
    'Fully Allocated': 'bg-blue-100 text-blue-800',
    'In Progress': 'bg-purple-100 text-purple-800',
    Completed: 'bg-green-100 text-green-800',
    'On Hold': 'bg-yellow-100 text-yellow-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: any) {
  if (!isOpen) return null
  const sizeClass = size === 'lg' ? 'max-w-4xl' : size === 'xl' ? 'max-w-6xl' : 'max-w-lg'
  const maxHeightClass = size === 'xl' ? 'max-h-[88vh]' : size === 'lg' ? 'max-h-[80vh]' : 'max-h-[70vh]'
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid="modal">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />
        <div className={`relative inline-block w-full ${sizeClass} p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><Icons.Close /></button>
          </div>
          <div className={`${maxHeightClass} overflow-y-auto`}>{children}</div>
        </div>
      </div>
    </div>
  )
}

export function TableLoading({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-16 text-center text-gray-500">
        Loading...
      </td>
    </tr>
  )
}

export function ContentLoading() {
  return (
    <div className="p-12 text-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  )
}

export function BulkImportSection({
  onSuccess,
  importType = 'staff',
  isOpen: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: any) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [csvData, setCsvData] = useState('')
  const [results, setResults] = useState<any>(null)

  const isControlled = typeof controlledOpen === 'boolean'
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setIsOpen = (value: boolean) => {
    if (!isControlled) setInternalOpen(value)
    onOpenChange?.(value)
  }

  const handleFileUpload = (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => setCsvData(String(event.target?.result || ''))
    reader.readAsText(file)
  }

  const parseCSV = (csv: string) => {
    const lines = csv.split('\n').filter((line) => line.trim())
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim())
      const row: Record<string, string> = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })
      return row
    })
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      const parsed = parseCSV(csvData)
      if (parsed.length === 0) {
        toast.error('No valid data found in CSV')
        return
      }
      const endpoint = importType === 'staff' ? `${API}/staff/bulk-import` : `${API}/jobs/bulk-import`
      const response = await axios.post(endpoint, { [importType]: parsed })
      setResults(response.data)
      toast.success(`Imported ${response.data.imported_count} ${importType} successfully`)
      if (response.data.error_count > 0) {
        toast.warning(`${response.data.error_count} rows had errors`)
      }
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const sampleCSV = importType === 'staff'
    ? `name,email,role,access_level,hourly_rate,available_hours_per_month,productivity_factor,annual_fee_budget,annual_budgeted_hours,department_name\nJohn Smith,john@firm.co.za,Accountant,Standard,500,160,0.85,500000,1000,Management Accounts\nJane Doe,jane@firm.co.za,Accountant,Standard,750,160,0.9,750000,1000,Management Accounts\nBob Wilson,bob@firm.co.za,Auditor,Standard,1000,160,0.85,1000000,1000,Audit`
    : `name,client_name,job_type,job_fee,deadline,priority\nTax Return 2024,ABC Company,Tax Returns,15000,2024-12-31,High\nMonthly Bookkeeping,XYZ Ltd,Bookkeeping,5000,2024-11-30,Medium`

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      {!hideTrigger && (
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900">Bulk Import</h4>
            <p className="text-sm text-gray-500">Import multiple {importType} from CSV file</p>
          </div>
          <button onClick={() => setIsOpen(!isOpen)} className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-medium">
            {isOpen ? 'Close' : '📥 Import CSV'}
          </button>
        </div>
      )}

      {isOpen && (
        <div className={hideTrigger ? '' : 'mt-4 space-y-4'}>
          <div className="bg-gray-50 rounded-xl p-4">
            <h5 className="font-medium text-gray-700 mb-2">Sample CSV Format:</h5>
            <pre className="text-xs bg-white p-3 rounded-lg border overflow-x-auto">{sampleCSV}</pre>
            <button
              onClick={() => {
                const blob = new Blob([sampleCSV], { type: 'text/csv' })
                const link = document.createElement('a')
                link.href = URL.createObjectURL(blob)
                link.download = `sample_${importType}.csv`
                link.click()
              }}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800"
            >
              Download sample template →
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV File</label>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
          </div>

          {csvData && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preview (first 500 chars)</label>
              <textarea value={csvData.substring(0, 500)} readOnly className="w-full px-4 py-2 border border-gray-200 rounded-xl text-xs h-24" />
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleImport} disabled={!csvData || importing} className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-gray-300 font-medium">
              {importing ? 'Importing...' : `Import ${importType}`}
            </button>
            <button onClick={() => { setCsvData(''); setResults(null) }} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50">
              Clear
            </button>
          </div>

          {results && (
            <div className={`p-4 rounded-xl ${results.error_count > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
              <h5 className="font-medium text-gray-900 mb-2">Import Results</h5>
              <p className="text-sm text-green-700">✓ {results.imported_count} {importType} imported successfully</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Sidebar({
  activeTab,
  setActiveTab,
  isMobileOpen,
  setIsMobileOpen,
  isDesktopOpen,
  setIsDesktopOpen,
  user,
  hasFullAccess,
  onLogout,
  settings,
  organisations = [],
  selectedOrg = '',
  switchingOrg = false,
  unreadCount = 0,
  onOrganisationChange,
  onCreateOrganisation,
}: any) {
  const primaryColor = settings?.primary_color || '#3B82F6'
  const logoUrl = settings?.logo_url || settings?.logo_base64 || settings?.logo
  const firmName = settings?.firm_name || 'Workflow'
  const tagline = settings?.tagline || 'SA Accounting'
  const accessLevel = user?.access_level
  const isSupervisor = accessLevel === 'Supervisor'
  const userType = localStorage.getItem('userType')
  const showOrganisationSelector = userType === 'admin'
  const selectorOptions = organisations.length > 0
    ? organisations
    : (user?.organisation_id
      ? [{
        id: String(user.organisation_id),
        organisation_id: String(user.organisation_id),
        firm_name: 'Current organisation',
      }]
      : [])
  const selectedOrgName = selectorOptions.find((org: any) => String(org.organisation_id || org.id) === String(selectedOrg || user?.organisation_id))?.firm_name || ''

  const handleOrganisationChange = async (value: string) => {
    try {
      const result = onOrganisationChange?.(value)
      if (result && typeof (result as any).then === 'function') {
        await result
      }
    } catch {
      // ignore errors here; still attempt reload to pick up any client-side changes
    }
    // reload to fetch new selected organisation data
    try {
      window.location.reload()
    } catch {
      // noop in non-browser environments
    }
  }

  const fullAccessNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
    { id: 'my-timesheet', label: 'My Timesheet', icon: Icons.Clock },
    { id: 'staff', label: 'Staff', icon: Icons.Users },
    { id: 'clients', label: 'Clients', icon: Icons.Building },
    { id: 'jobs', label: 'Jobs', icon: Icons.Briefcase },
    { id: 'jobs-types', label: 'Job Types', icon: Icons.Tag },
    { id: 'job-templates', label: 'Job Template', icon: Icons.Template },
    { id: 'allocations', label: 'Allocations', icon: Icons.Calendar },
    { id: 'departments', label: 'Departments', icon: Icons.Building },
    { id: 'reports', label: 'Reports', icon: Icons.BarChart },
    { id: 'settings?tab=userManagement', label: 'User Management', icon: Icons.Shield },
    { id: 'efficiency', label: 'Efficiency', icon: Icons.TrendingUp },
    { id: 'notifications', label: 'Notifications', icon: Icons.Bell },
    { id: 'settings', label: 'Settings', icon: Icons.Settings },
  ]

  const supervisorNavItems = [
    { id: 'dashboard', label: 'Team Dashboard', icon: Icons.Dashboard },
    { id: 'my-timesheet', label: 'My Timesheet', icon: Icons.Clock },
    { id: 'staff', label: 'Team Members', icon: Icons.Users },
    { id: 'jobs', label: 'Jobs', icon: Icons.Briefcase },
    { id: 'allocations', label: 'Allocations', icon: Icons.Calendar },
    { id: 'reports', label: 'Reports', icon: Icons.BarChart },
    { id: 'efficiency', label: 'Efficiency', icon: Icons.TrendingUp },
    { id: 'notifications', label: 'Notifications', icon: Icons.Bell },
  ]

  const limitedNavItems = [
    { id: 'my-timesheet', label: 'My Timesheet', icon: Icons.Clock },
    { id: 'my-allocations', label: 'My Allocations', icon: Icons.Calendar },
    { id: 'notifications', label: 'Notifications', icon: Icons.Bell },
  ]

  const navItems = hasFullAccess ? fullAccessNavItems : (isSupervisor ? supervisorNavItems : limitedNavItems)

  return (
    <>
      {isMobileOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setIsMobileOpen(false)} />}
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-slate-900 transform transition-transform duration-300 ease-in-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} ${isDesktopOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full'}`} data-testid="sidebar">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between gap-3 px-4 py-5 border-b border-slate-800">
            <div className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded-xl" onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
              ) : null}
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor, display: logoUrl ? 'none' : 'flex' }}>
                <span className="text-white font-bold text-lg">{firmName.substring(0, 2).toUpperCase()}</span>
              </div>
              <div><h1 className="text-white font-bold text-lg">{firmName.split(' ')[0]}</h1><p className="text-slate-400 text-xs">{tagline}</p></div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsMobileOpen(false)
                setIsDesktopOpen?.(false)
              }}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl"
              aria-label="Close sidebar"
            >
              <Icons.SidebarClose />
            </button>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">{navItems.map((item) => (<button key={item.id} onClick={() => { setActiveTab(item.id); setIsMobileOpen(false); if (item.id === 'reports') setIsDesktopOpen?.(false) }} data-testid={`nav-${item.id}`} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === item.id ? 'text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} style={activeTab === item.id ? { backgroundColor: primaryColor, boxShadow: `0 10px 15px -3px ${primaryColor}50` } : {}}><item.icon className="w-4 h-4" /><span className="flex-1 text-left">{item.label}</span>{item.id === 'notifications' && unreadCount > 0 ? <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount}</span> : null}</button>))}</nav>
          <div className="px-4 pb-4 pt-3 border-t border-slate-800">
            {showOrganisationSelector && selectorOptions.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Organisation</p>
                <Select
                  value={selectedOrg || String(user?.organisation_id || '')}
                  onValueChange={(value: string) => handleOrganisationChange(value)}
                  disabled={switchingOrg || selectorOptions.length <= 1}
                >
                  <SelectTrigger className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-100 px-2 py-2 text-xs focus:ring-2 focus:ring-slate-600">
                    <SelectValue placeholder="Select organisation" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 text-slate-100 border border-slate-800">
                    {selectorOptions.map((org: any) => (
                      <SelectItem key={org.id || org.organisation_id} value={String(org.organisation_id)}>
                        {org.firm_name || 'Organisation'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={onCreateOrganisation}
                  >
                    + Create organisation
                  </Button>
                </div>
              </div>
            )}
            {user && (
              <div className="flex items-center gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                      aria-label="Open user menu"
                    >
                      <Avatar className="h-10 w-10 bg-slate-700 text-slate-100">
                        {user.profile_picture_url ? (
                          <AvatarImage src={user.profile_picture_url} alt={user.name || 'User'} />
                        ) : null}
                        <AvatarFallback>{user.name?.charAt(0).toUpperCase() ?? 'U'}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 bg-slate-950 border border-slate-800 p-3">
                    <div>
                      <p className="text-sm font-semibold text-white truncate">{user.name || 'Guest'}</p>
                      <p className="text-xs text-slate-400 truncate">{user.role === 'owner' ? (selectedOrgName || 'Owner') : (user.role || 'Administrator')}</p>
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-100 truncate">{user.name || 'Guest'}</p>
                  <p className="text-xs text-slate-400 truncate">{user.role === 'owner' ? (selectedOrgName || 'Owner') : (user.role || 'Administrator')}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto shrink-0 text-red-400 hover:bg-slate-800 hover:text-white"
                  onClick={onLogout}
                  aria-label="Sign out"
                >
                  <Icons.Logout className="w-5 h-5" />
                </Button>
              </div>
            )}

          </div>
        </div>
      </aside>
    </>
  )
}
