import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import axios from 'axios'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { BarChart3, CheckIcon, CreditCard, History, Scale, Settings2, type LucideIcon } from 'lucide-react'

import { API } from '@/lib/workflowApi'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import type { WorkflowUser } from '@/types/workflow'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatPlanPrice, getPlanCardLines, getPlanFeatures, isRecommendedPlan, normalizePlan, normalizePlans, toTitleCase } from '@/lib/saasPlans'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import { Icons, Modal } from '@/components/workflow/shared'
import { InviteTeamMemberModal } from '@/components/workflow/InviteTeamMemberModal'
import { EditProfileModal } from '@/components/workflow/EditProfileModal'
import { PendingBillingView } from '@/components/workflow/PendingBillingView'

// ─── helpers ────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-100 text-blue-700',
  professional: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trial: 'bg-blue-100 text-blue-700',
  past_due: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-600',
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-gray-100 text-gray-700',
}

const WARNING_STYLES: Record<string, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
}

const formatBillingDate = (
  value: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-ZA', options)
}

const formatBillingDateTime = (value: string | number | Date | null | undefined) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatBillingMoney = (currency: string | null | undefined, amount: unknown) => {
  const value = Number(amount || 0)
  return `${currency || 'ZAR'} ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatStatusLabel = (value: string | null | undefined) =>
  String(value || 'unknown')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase())

function UsageBar({
  label,
  used,
  max,
  remaining,
  color = 'bg-blue-500',
}: {
  label: string
  used: number
  max: number
  remaining?: number | null
  color?: string
}) {
  const unlimited = max < 0
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100))
  const danger = !unlimited && pct >= 90
  const warn = !unlimited && pct >= 70 && pct < 90
  const remainingLabel = unlimited ? 'Unlimited remaining' : `${Math.max(0, remaining ?? (max - used))} left`

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-semibold ${danger ? 'text-red-600' : warn ? 'text-amber-600' : 'text-gray-600'}`}>
          {unlimited ? `${used} / ∞` : `${used} / ${max}`}
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        {unlimited ? (
          <div className="h-full w-full bg-gray-200 rounded-full" />
        ) : (
          <div
            className={`h-full rounded-full transition-all ${danger ? 'bg-red-500' : warn ? 'bg-amber-400' : color}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {!unlimited && (
        <p className="text-xs text-gray-400 mt-1">{`${pct}% used · ${remainingLabel}`}</p>
      )}
      {unlimited && (
        <p className="text-xs text-gray-400 mt-1">{remainingLabel}</p>
      )}
    </div>
  )
}

type SubscriptionSectionKey = 'overview' | 'usage' | 'comparison' | 'history' | 'manage'

type SubscriptionSection = {
  key: SubscriptionSectionKey
  label: string
  description: string
  icon: LucideIcon
}

const SUBSCRIPTION_SECTIONS: SubscriptionSection[] = [
  {
    key: 'overview',
    label: 'Billing Overview',
    description: 'Status, renewals, and payment method',
    icon: CreditCard,
  },
  {
    key: 'usage',
    label: 'Resource Usage',
    description: 'Current plan consumption and limits',
    icon: BarChart3,
  },
  {
    key: 'comparison',
    label: 'Plan Comparison',
    description: 'Compare available plans and limits',
    icon: Scale,
  },
  {
    key: 'history',
    label: 'Payment History',
    description: 'Recent transactions and outcomes',
    icon: History,
  },
  {
    key: 'manage',
    label: 'Manage Subscription',
    description: 'Supported checkout and billing actions',
    icon: Settings2,
  },
]

const SettingsCard: any = Card
const SettingsCardContent: any = CardContent
const SettingsCardDescription: any = CardDescription
const SettingsCardHeader: any = CardHeader
const SettingsCardTitle: any = CardTitle
const SettingsSeparator: any = Separator

function SubscriptionSectionCard({
  title,
  description,
  children,
  className,
  contentClassName,
}: {
  title: string
  description: string
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <SettingsCard className={className}>
      <SettingsCardHeader>
        <SettingsCardTitle>{title}</SettingsCardTitle>
        <SettingsCardDescription>{description}</SettingsCardDescription>
      </SettingsCardHeader>
      <SettingsCardContent className={cn('space-y-6', contentClassName)}>
        {children}
      </SettingsCardContent>
    </SettingsCard>
  )
}

// ─── main component ─────────────────────────────────────────────────────────

const TABS = [
  { key: 'general', label: 'General', icon: 'Building' },
  { key: 'branding', label: 'Branding', icon: 'Palette' },
  { key: 'email', label: 'Email Configuration', icon: 'Mail' },
  { key: 'subscription', label: 'Subscription & Billing', icon: 'CreditCard' },
  { key: 'userManagement', label: 'User Management', icon: 'Users' },
  { key: 'danger', label: 'Danger Zone', icon: 'Warning' },
] as const
type TabKey = typeof TABS[number]['key']

export function SettingsPage({ settings, enums, onUpdateSettings, onRefresh, user, hidePageHeader = false, onUserUpdate }: any) {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState<TabKey>('general')
  const paystackCallbackStatus = new URLSearchParams(location.search).get('paystack')
  const paystackCallbackReference = new URLSearchParams(location.search).get('reference')
  const paystackCallbackReason = new URLSearchParams(location.search).get('reason')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab')
    if (tab && TABS.find((t) => t.key === tab)) {
      setActiveTab(tab as TabKey)
    }
  }, [location.search])

  // ── general / branding form ─────────────────────────────────────────────
  const [formData, setFormData] = useState({
    firm_name: settings?.firm_name || '',
    currency: settings?.currency || 'ZAR',
    currency_symbol: settings?.currency_symbol || 'R',
    default_working_hours: settings?.default_working_hours || 160,
    logo_url: settings?.logo_url || '',
    primary_color: settings?.primary_color || '',
    secondary_color: settings?.secondary_color || '',
    accent_color: settings?.accent_color || '',
    tagline: settings?.tagline || '',
    company_address: settings?.company_address || '',
    company_phone: settings?.company_phone || '',
    company_email: settings?.company_email || '',
    company_website: settings?.company_website || '',
    tax_registration_number: settings?.tax_registration_number || '',
  })
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoPreview, setLogoPreview] = useState(settings?.logo_url || settings?.logo_base64 || settings?.logo || null)

  const defaultWorkingYear = useMemo(() => new Date().getUTCFullYear(), [])
  const [workingDaysYear, setWorkingDaysYear] = useState(defaultWorkingYear)
  const [workingDaysLoading, setWorkingDaysLoading] = useState(false)
  const [workingDaysRows, setWorkingDaysRows] = useState<any[]>([])
  const [editingWorkingMonth, setEditingWorkingMonth] = useState<string | null>(null)
  const [workingMonthDraft, setWorkingMonthDraft] = useState<any>({
    month: '',
    daily_capacity_hours: 8,
    working_days_override: '',
    holiday_configs: [],
    extra_working_days: [],
  })
  const [savingWorkingMonth, setSavingWorkingMonth] = useState(false)

  const loadWorkingDaysYear = useCallback(async (year: number) => {
    setWorkingDaysLoading(true)
    try {
      const res = await api.get(`/planning/calendar-year?year=${year}`)
      setWorkingDaysRows(res.data?.months || [])
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to load working days')
      setWorkingDaysRows([])
    } finally {
      setWorkingDaysLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'general') return
    void loadWorkingDaysYear(workingDaysYear)
  }, [activeTab, loadWorkingDaysYear, workingDaysYear])

  const monthLabel = useCallback((month: string) => {
    const [y, m] = String(month || '').split('-').map((v) => Number(v))
    if (!y || !m) return month
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-ZA', { month: 'long' })
  }, [])

  const startEditWorkingMonth = useCallback((row: any) => {
    const month = String(row?.month || '')
    setEditingWorkingMonth(month)
    setWorkingMonthDraft({
      month,
      daily_capacity_hours: Number(row?.daily_capacity_hours || 8),
      working_days_override: row?.working_days_override != null ? Number(row.working_days_override) : '',
      holiday_configs: Array.isArray(row?.holiday_configs) ? row.holiday_configs.map((h: any) => ({ date: String(h.date || ''), label: h.label != null ? String(h.label) : '' })) : [],
      extra_working_days: Array.isArray(row?.extra_working_days) ? row.extra_working_days.map((d: any) => String(d || '')) : [],
    })
  }, [])

  const cancelEditWorkingMonth = useCallback(() => {
    setEditingWorkingMonth(null)
    setWorkingMonthDraft({ month: '', daily_capacity_hours: 8, working_days_override: '', holiday_configs: [], extra_working_days: [] })
  }, [])

  const saveWorkingMonth = useCallback(async () => {
    if (savingWorkingMonth) return
    const month = String(workingMonthDraft.month || '')
    if (!month) return

    const daily_capacity_hours = Number(workingMonthDraft.daily_capacity_hours || 0)
    if (!Number.isFinite(daily_capacity_hours) || daily_capacity_hours <= 0) {
      toast.error('Daily capacity hours must be greater than 0')
      return
    }

    const workingDaysOverrideRaw = workingMonthDraft.working_days_override
    const working_days_override = workingDaysOverrideRaw === '' || workingDaysOverrideRaw == null ? null : Number(workingDaysOverrideRaw)
    if (working_days_override != null) {
      if (!Number.isFinite(working_days_override) || working_days_override < 0 || Math.floor(working_days_override) !== working_days_override) {
        toast.error('Working days override must be a whole number (0 or more)')
        return
      }
    }

    const holiday_configs = (Array.isArray(workingMonthDraft.holiday_configs) ? workingMonthDraft.holiday_configs : [])
      .map((h: any) => ({ date: String(h?.date || ''), label: String(h?.label || '').trim() || null }))
      .filter((h: any) => /^\d{4}-\d{2}-\d{2}$/.test(h.date))

    const holidayDates = holiday_configs.map((h: any) => h.date)
    if (new Set(holidayDates).size !== holidayDates.length) {
      toast.error('Duplicate holiday dates are not allowed')
      return
    }

    const extra_working_days = (Array.isArray(workingMonthDraft.extra_working_days) ? workingMonthDraft.extra_working_days : [])
      .map((d: any) => String(d || ''))
      .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d))

    if (new Set(extra_working_days).size !== extra_working_days.length) {
      toast.error('Duplicate extra working days are not allowed')
      return
    }

    setSavingWorkingMonth(true)
    try {
      await api.put('/planning/calendar', {
        month,
        daily_capacity_hours,
        working_days_override,
        holidays: holiday_configs,
        extra_working_days,
      })
      toast.success('Working days updated')
      setEditingWorkingMonth(null)
      await loadWorkingDaysYear(workingDaysYear)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save working days')
    } finally {
      setSavingWorkingMonth(false)
    }
  }, [loadWorkingDaysYear, savingWorkingMonth, workingDaysYear, workingMonthDraft])

  // Sync formData and logoPreview when settings prop loads/changes
  useEffect(() => {
    if (!settings) return
    setFormData({
      firm_name: settings.firm_name || '',
      currency: settings.currency || 'ZAR',
      currency_symbol: settings.currency_symbol || 'R',
      default_working_hours: settings.default_working_hours || 160,
      logo_url: settings.logo_url || '',
      primary_color: settings.primary_color || '',
      secondary_color: settings.secondary_color || '',
      accent_color: settings.accent_color || '',
      tagline: settings.tagline || '',
      company_address: settings.company_address || '',
      company_phone: settings.company_phone || '',
      company_email: settings.company_email || '',
      company_website: settings.company_website || '',
      tax_registration_number: settings.tax_registration_number || '',
    })
    setLogoPreview(settings.logo_url || settings.logo_base64 || settings.logo || null)
  }, [settings])

  // ── registration approvals ─────────────────────────────────────────────
  const [pendingRegistrations, setPendingRegistrations] = useState<any[]>([])
  const [approvalModal, setApprovalModal] = useState<any>({ open: false, registration: null })
  const [approvalData, setApprovalData] = useState({ role: 'Accountant', access_level: 'Standard', rejection_reason: '' })

  // ── reset ───────────────────────────────────────────────────────────────
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetting, setResetting] = useState(false)

  // ── subscription ────────────────────────────────────────────────────────
  const [subscription, setSubscription] = useState<any>(null)
  const [subscriptionUsage, setSubscriptionUsage] = useState<any>(null)
  const [subLoading, setSubLoading] = useState(false)
  const [billingActionLoading, setBillingActionLoading] = useState<string | null>(null)
  const [billingPlanSelection, setBillingPlanSelection] = useState('')
  const [billingCycleSelection, setBillingCycleSelection] = useState('monthly')
  const [activeSubscriptionSection, setActiveSubscriptionSection] = useState<SubscriptionSectionKey>('overview')
  const [showPlanChangeModal, setShowPlanChangeModal] = useState(false)

  // ── organisation members ─────────────────────────────────────────────────
  const [orgDetails, setOrgDetails] = useState<any>(null)
  const [orgMembers, setOrgMembers] = useState<any[]>([])
  const [orgInvites, setOrgInvites] = useState<any[]>([])
  const [orgLoading, setOrgLoading] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [selectedAdmin, setSelectedAdmin] = useState<any>(null)
  const [permissionModal, setPermissionModal] = useState(false)

  // ── email config ─────────────────────────────────────────────────────────
  const [emailConfig, setEmailConfig] = useState({
    host: settings?.emailConfig?.host || '',
    port: settings?.emailConfig?.port || 587,
    secure: settings?.emailConfig?.secure ?? false,
    user: settings?.emailConfig?.user || '',
    password: '',
    fromName: settings?.emailConfig?.fromName || '',
    fromAddress: settings?.emailConfig?.fromAddress || '',
    enabled: settings?.emailConfig?.enabled ?? false,
  })
  const [savingEmail, setSavingEmail] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [testEmailTo, setTestEmailTo] = useState('')

  // Sync emailConfig when settings prop loads/changes (password intentionally kept blank)
  useEffect(() => {
    if (!settings?.emailConfig) return
    setEmailConfig((prev) => ({
      host: settings.emailConfig.host || '',
      port: settings.emailConfig.port || 587,
      secure: settings.emailConfig.secure ?? false,
      user: settings.emailConfig.user || '',
      password: prev.password, // keep any in-progress password entry
      fromName: settings.emailConfig.fromName || '',
      fromAddress: settings.emailConfig.fromAddress || '',
      enabled: settings.emailConfig.enabled ?? false,
    }))
  }, [settings])

  const currencySymbols: Record<string, string> = { ZAR: 'R', USD: '$', EUR: '€', GBP: '£' }
  const handleCurrencyChange = (currency: string) => setFormData({ ...formData, currency, currency_symbol: currencySymbols[currency] || 'R' })
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); await onUpdateSettings(formData) }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp']
    if (!validTypes.includes(file.type)) { toast.error('Invalid file type'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('File size must be less than 5MB'); return }
    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const response = await api.post('/settings/upload-logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setLogoPreview(response.data.logo_url)
      toast.success('Logo uploaded successfully')
      if (onRefresh) onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to upload logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleRemoveLogo = async () => {
    try {
      await onUpdateSettings({ ...formData, logo_url: null })
      setLogoPreview(null)
      setFormData({ ...formData, logo_url: '' })
      toast.success('Logo removed')
      if (onRefresh) onRefresh()
    } catch { toast.error('Failed to remove logo') }
  }

  const presetColors = [
    { name: 'Blue', primary: '#3B82F6', secondary: '#10B981' },
    { name: 'Purple', primary: '#8B5CF6', secondary: '#EC4899' },
    { name: 'Green', primary: '#10B981', secondary: '#3B82F6' },
    { name: 'Red', primary: '#EF4444', secondary: '#F59E0B' },
    { name: 'Indigo', primary: '#6366F1', secondary: '#14B8A6' },
  ]

  useEffect(() => {
    axios.get(`${API}/auth/registrations`).then((res) => {
      setPendingRegistrations(res.data.filter((r: any) => r.status === 'Pending'))
    }).catch(() => {})
  }, [])

  const loadSubscriptionData = useCallback(async ({ silent = false } = {}) => {
    if (activeTab !== 'subscription') return
    if (!silent) setSubLoading(true)
    try {
      const [subscriptionRes, usageRes] = await Promise.all([
        api.get('/settings/subscription'),
        api.get('/saas/usage'),
      ])
      setSubscription(subscriptionRes.data)
      setSubscriptionUsage(usageRes.data)
    } catch {
      if (!silent) toast.error('Could not load subscription data')
    } finally {
      if (!silent) setSubLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    if (!subscription) return
    setBillingPlanSelection((current) => current || String(subscription.checkout?.plan || subscription.plan || ''))
    setBillingCycleSelection((current) => current || String(subscription.checkout?.billing_cycle || 'monthly'))
  }, [subscription])

  const openPlanChangeModal = useCallback(() => {
    setBillingPlanSelection(String(subscription?.checkout?.plan || subscription?.plan || ''))
    setBillingCycleSelection(String(subscription?.checkout?.billing_cycle || subscription?.paystack?.subscription?.billing_cycle || 'monthly'))
    setShowPlanChangeModal(true)
  }, [subscription])

  const handleRetryCheckout = async (
    existingCheckoutUrl?: string | null,
    existingCheckoutStatus?: string | null,
    overrides?: { plan?: string | null; billing_cycle?: string | null; intent?: string | null },
  ) => {
    const payload = {
      plan: overrides?.plan || undefined,
      billing_cycle: overrides?.billing_cycle || undefined,
      intent: overrides?.intent || undefined,
    }
    const wantsExistingCheckout =
      existingCheckoutUrl &&
      existingCheckoutStatus === 'pending' &&
      (!payload.plan || payload.plan === subscription?.checkout?.plan) &&
      (!payload.billing_cycle || payload.billing_cycle === subscription?.checkout?.billing_cycle) &&
      (!payload.intent || payload.intent === subscription?.checkout?.intent || !subscription?.checkout?.intent)

    if (wantsExistingCheckout) {
      window.location.assign(String(existingCheckoutUrl))
      return
    }

    setBillingActionLoading('retry')
    try {
      const response = await api.post('/settings/subscription/retry-checkout', payload)
      if (response.data?.mode === 'free') {
        toast.success(response.data?.message || 'Plan updated successfully')
        await loadSubscriptionData({ silent: true })
        return
      }
      const authorizationUrl = response.data?.checkout?.authorization_url
      if (!authorizationUrl) {
        throw new Error('Paystack checkout URL was not returned.')
      }
      toast.success('Redirecting to Paystack checkout')
      window.location.assign(String(authorizationUrl))
    } catch (error: any) {
      toast.error(error.response?.data?.detail || error.message || 'Could not retry checkout')
    } finally {
      setBillingActionLoading(null)
    }
  }

  const handleConfirmPlanChange = async () => {
    if (!subscription) return

    const availablePlans = normalizePlans(subscription.available_plans)
    const activePlanId = String(subscription.plan || '')
    const activeBillingCycle = String(subscription.paystack?.subscription?.billing_cycle || 'monthly')
    const nextPlanId = String(billingPlanSelection || subscription.checkout?.plan || subscription.plan || '')
    const nextPlan = availablePlans.find((planOption) => planOption.id === nextPlanId) || null
    const nextBillingCycle = nextPlan?.id === 'free' ? 'monthly' : billingCycleSelection

    if (!nextPlanId) {
      toast.error('Select a plan first')
      return
    }

    if (nextPlanId === activePlanId && (nextPlanId === 'free' || nextBillingCycle === activeBillingCycle)) {
      toast.error('Choose a different plan or billing cycle to continue')
      return
    }

    setShowPlanChangeModal(false)
    await handleRetryCheckout(subscription.checkout?.authorization_url, subscription.checkout?.status, {
      plan: nextPlanId,
      billing_cycle: nextBillingCycle,
      intent: activePlanId && activePlanId !== 'free' ? 'plan_change' : 'retry',
    })
  }

  const handleCancelRenewal = async () => {
    setBillingActionLoading('cancel')
    try {
      const response = await api.post('/settings/subscription/cancel-renewal')
      toast.success(response.data?.message || 'Renewal cancellation requested')
      await loadSubscriptionData({ silent: true })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Could not cancel renewal')
    } finally {
      setBillingActionLoading(null)
    }
  }

  const handleResumeRenewal = async () => {
    setBillingActionLoading('resume')
    try {
      const response = await api.post('/settings/subscription/resume-renewal')
      toast.success(response.data?.message || 'Renewal resumed successfully')
      await loadSubscriptionData({ silent: true })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Could not resume renewal')
    } finally {
      setBillingActionLoading(null)
    }
  }

  const handleUpdatePaymentDetails = async () => {
    setBillingActionLoading('payment-method')
    try {
      const response = await api.post('/settings/subscription/payment-method-link')
      const link = response.data?.link
      if (!link) {
        throw new Error('Paystack management link was not returned.')
      }
      const openedWindow = window.open(String(link), '_blank', 'noopener,noreferrer')
      toast.success(openedWindow ? 'Opened Paystack payment details in a new tab' : 'Opening Paystack payment details')
      if (!openedWindow) {
        window.location.assign(String(link))
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || error.message || 'Could not open payment details')
    } finally {
      setBillingActionLoading(null)
    }
  }

  const handleEmailPaymentMethodLink = async () => {
    setBillingActionLoading('payment-method-email')
    try {
      const response = await api.post('/settings/subscription/payment-method-email')
      toast.success(response.data?.message || 'Payment method management email sent')
      await loadSubscriptionData({ silent: true })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Could not send payment method email')
    } finally {
      setBillingActionLoading(null)
    }
  }

  useEffect(() => {
    if (activeTab !== 'subscription') return

    loadSubscriptionData()

    const intervalId = window.setInterval(() => {
      loadSubscriptionData({ silent: true })
    }, 30_000)

    const handleFocus = () => { loadSubscriptionData({ silent: true }) }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadSubscriptionData({ silent: true })
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [activeTab, loadSubscriptionData])

  const loadOrgData = () => {
    setOrgLoading(true)
    Promise.all([
      api.get('/settings/organisation'),
      api.get('/settings/organisation/members'),
      api.get('/settings/organisation/invites'),
    ]).then(([detailsRes, membersRes, invitesRes]) => {
      setOrgDetails(detailsRes.data)
      setOrgMembers(membersRes.data)
      setOrgInvites(invitesRes.data)
    }).catch((err) => {
      console.error('loadOrgData error', err?.response?.status, err?.response?.data)
      toast.error('Could not load organisation data')
    }).finally(() => setOrgLoading(false))
  }

  useEffect(() => {
    if (activeTab === 'userManagement') loadOrgData()
  }, [activeTab])

  const handleResetSystem = async () => {
    if (resetConfirm !== 'RESET') return
    setResetting(true)
    try {
      await axios.post(`${API}/system/reset`)
      toast.success('System reset successfully.')
      setShowResetModal(false)
      setResetConfirm('')
      if (onRefresh) onRefresh()
      localStorage.clear()
      window.location.reload()
    } catch { toast.error('Failed to reset system') } finally { setResetting(false) }
  }

  const handleApproveReject = async (approved: boolean) => {
    try {
      await axios.put(`${API}/auth/registrations/${approvalModal.registration.id}`, {
        approved,
        role: approved ? approvalData.role : undefined,
        access_level: approved ? approvalData.access_level : undefined,
        rejection_reason: !approved ? approvalData.rejection_reason : undefined,
      })
      toast.success(approved ? 'Registration approved' : 'Registration rejected')
      setApprovalModal({ open: false, registration: null })
      setPendingRegistrations((prev) => prev.filter((r) => r.id !== approvalModal.registration.id))
      if (onRefresh) onRefresh()
    } catch { toast.error('Failed to process registration') }
  }

  // ── tab content ──────────────────────────────────────────────────────────

  const renderEmail = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Transactional Email (SMTP)</h3>
        <p className="text-sm text-gray-500 mb-6">Configure how emails are sent from your organisation (invites, notifications, etc.).</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
            <input type="text" value={emailConfig.host} onChange={(e) => setEmailConfig({ ...emailConfig, host: e.target.value })} placeholder="smtp.example.com" className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
            <input type="number" value={emailConfig.port} onChange={(e) => setEmailConfig({ ...emailConfig, port: Number(e.target.value) })} placeholder="587" className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input type="text" value={emailConfig.user} onChange={(e) => setEmailConfig({ ...emailConfig, user: e.target.value })} placeholder="user@example.com" className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" autoComplete="off" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-xs text-gray-400">(leave blank to keep existing)</span></label>
            <input type="password" value={emailConfig.password} onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })} placeholder="••••••••" className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
            <input type="text" value={emailConfig.fromName} onChange={(e) => setEmailConfig({ ...emailConfig, fromName: e.target.value })} placeholder="My Firm" className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Address</label>
            <input type="email" value={emailConfig.fromAddress} onChange={(e) => setEmailConfig({ ...emailConfig, fromAddress: e.target.value })} placeholder="noreply@example.com" className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={emailConfig.secure} onChange={(e) => setEmailConfig({ ...emailConfig, secure: e.target.checked })} className="rounded" />
            Use SSL/TLS (port 465)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={emailConfig.enabled} onChange={(e) => setEmailConfig({ ...emailConfig, enabled: e.target.checked })} className="rounded" />
            Enable org email config
          </label>
        </div>
        <div className="mt-6 space-y-3">
          <div className="flex gap-3">
            <button
              type="button"
              disabled={savingEmail}
              onClick={async () => {
                setSavingEmail(true)
                try {
                  await onUpdateSettings({ emailConfig })
                  toast.success('Email configuration saved')
                } catch { toast.error('Failed to save email configuration') }
                finally { setSavingEmail(false) }
              }}
              className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400"
            >
              {savingEmail ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              type="button"
              disabled={testingEmail}
              onClick={async () => {
                setTestingEmail(true)
                try {
                  const res = await api.post('/settings/email/test', testEmailTo.trim() ? { to: testEmailTo.trim() } : {})
                  toast.success(res.data?.message || 'Test email sent — check your inbox')
                } catch (err: any) { toast.error(err.response?.data?.detail || 'Test email failed') }
                finally { setTestingEmail(false) }
              }}
              className="px-5 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
            >
              {testingEmail ? 'Sending...' : 'Send Test Email'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 whitespace-nowrap">Send test to:</label>
            <input
              type="email"
              value={testEmailTo}
              onChange={(e) => setTestEmailTo(e.target.value)}
              placeholder={user?.email || 'logged-in admin email'}
              className="w-64 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700"
            />
            <span className="text-xs text-gray-400">(leave blank to use your account email)</span>
          </div>
        </div>
      </div>
    </div>
  )

  const renderGeneral = () => (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Icons.Building /><span>Company Details</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company/Firm Name</label>
            <input type="text" value={formData.firm_name} onChange={(e) => setFormData({ ...formData, firm_name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl" placeholder="SA Accounting & Consulting" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
            <input type="text" value={formData.tagline} onChange={(e) => setFormData({ ...formData, tagline: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl" placeholder="Your trusted accounting partner" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea value={formData.company_address} onChange={(e) => setFormData({ ...formData, company_address: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl" rows={2} placeholder="123 Business Street, City, Country" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input type="tel" value={formData.company_phone} onChange={(e) => setFormData({ ...formData, company_phone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl" placeholder="+27 11 123 4567" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={formData.company_email} onChange={(e) => setFormData({ ...formData, company_email: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl" placeholder="info@company.co.za" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <input type="url" value={formData.company_website} onChange={(e) => setFormData({ ...formData, company_website: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl" placeholder="https://www.company.co.za" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax/VAT Number</label>
            <input type="text" value={formData.tax_registration_number} onChange={(e) => setFormData({ ...formData, tax_registration_number: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl" placeholder="VAT123456789" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Currency Settings</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
          <select value={formData.currency} onChange={(e) => handleCurrencyChange(e.target.value)} className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-xl">
            {enums?.currencies?.map((c: string) => <option key={c} value={c}>{c} ({currencySymbols[c]})</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Working Days</h3>
            <p className="text-sm text-gray-500">Monday to Friday excluding public holidays (organisation-based)</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Year</label>
            <input
              type="number"
              min={2000}
              max={2100}
              value={workingDaysYear}
              onChange={(e) => setWorkingDaysYear(Number(e.target.value || defaultWorkingYear))}
              className="w-28 px-3 py-2 border border-gray-200 rounded-xl text-sm"
            />
            <button
              type="button"
              onClick={() => loadWorkingDaysYear(workingDaysYear)}
              disabled={workingDaysLoading}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
            >
              {workingDaysLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Month</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Working Days</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Working Hours</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workingDaysRows.map((row: any) => (
                <Fragment key={row.month}>
                  <tr className="border-t border-gray-200">
                    <td className="px-4 py-2 text-sm text-gray-900">{monthLabel(row.month)}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 text-right">{Number(row.working_days_count || 0)}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 text-right">{Number(row.capacity_hours || 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">
                      {editingWorkingMonth === row.month ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={saveWorkingMonth}
                            disabled={savingWorkingMonth}
                            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300"
                          >
                            {savingWorkingMonth ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditWorkingMonth}
                            disabled={savingWorkingMonth}
                            className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditWorkingMonth(row)}
                          className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>

                  {editingWorkingMonth === row.month && (
                    <tr className="border-t border-gray-200 bg-white">
                      <td colSpan={4} className="px-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Daily Hours</label>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={workingMonthDraft.daily_capacity_hours}
                              onChange={(e) => setWorkingMonthDraft((d: any) => ({ ...d, daily_capacity_hours: Number(e.target.value || 0) }))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                            />
                            <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">Working Days (override)</label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={workingMonthDraft.working_days_override}
                              onChange={(e) => setWorkingMonthDraft((d: any) => ({ ...d, working_days_override: e.target.value === '' ? '' : Number(e.target.value) }))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                              placeholder="Auto"
                            />
                            <div className="mt-2 flex items-center justify-between">
                              <p className="text-xs text-gray-500">Leave blank to calculate from weekdays, holidays and extra days.</p>
                              <button
                                type="button"
                                onClick={() => setWorkingMonthDraft((d: any) => ({ ...d, working_days_override: '' }))}
                                className="text-xs font-medium text-gray-700 hover:underline"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Holidays</label>
                            <div className="space-y-2">
                              {(workingMonthDraft.holiday_configs || []).map((h: any, idx: number) => (
                                <div key={`${idx}-${h.date}`} className="flex gap-2">
                                  <input
                                    type="date"
                                    value={h.date}
                                    onChange={(e) => setWorkingMonthDraft((d: any) => ({
                                      ...d,
                                      holiday_configs: (d.holiday_configs || []).map((x: any, i: number) => i === idx ? { ...x, date: e.target.value } : x),
                                    }))}
                                    className="w-44 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                  />
                                  <input
                                    type="text"
                                    value={h.label || ''}
                                    onChange={(e) => setWorkingMonthDraft((d: any) => ({
                                      ...d,
                                      holiday_configs: (d.holiday_configs || []).map((x: any, i: number) => i === idx ? { ...x, label: e.target.value } : x),
                                    }))}
                                    placeholder="Name (optional)"
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setWorkingMonthDraft((d: any) => ({
                                      ...d,
                                      holiday_configs: (d.holiday_configs || []).filter((_: any, i: number) => i !== idx),
                                    }))}
                                    className="px-3 py-2 border border-red-200 text-red-700 rounded-xl text-sm hover:bg-red-50"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => setWorkingMonthDraft((d: any) => ({
                                  ...d,
                                  holiday_configs: [...(d.holiday_configs || []), { date: '', label: '' }],
                                }))}
                                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Add Holiday
                              </button>
                            </div>
                          </div>
                          <div className="md:col-span-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Extra Working Days</label>
                            <div className="space-y-2">
                              {(workingMonthDraft.extra_working_days || []).map((dval: string, idx: number) => (
                                <div key={`${idx}-${dval}`} className="flex gap-2">
                                  <input
                                    type="date"
                                    value={dval}
                                    onChange={(e) => setWorkingMonthDraft((d: any) => ({
                                      ...d,
                                      extra_working_days: (d.extra_working_days || []).map((x: any, i: number) => i === idx ? e.target.value : x),
                                    }))}
                                    className="w-44 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setWorkingMonthDraft((d: any) => ({
                                      ...d,
                                      extra_working_days: (d.extra_working_days || []).filter((_: any, i: number) => i !== idx),
                                    }))}
                                    className="px-3 py-2 border border-red-200 text-red-700 rounded-xl text-sm hover:bg-red-50"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => setWorkingMonthDraft((d: any) => ({
                                  ...d,
                                  extra_working_days: [...(d.extra_working_days || []), ''],
                                }))}
                                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Add Extra Day
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {workingDaysRows.length === 0 && !workingDaysLoading && (
                <tr className="border-t border-gray-200">
                  <td colSpan={4} className="px-4 py-4 text-sm text-gray-500">No data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium">Save Settings</button>
      </div>
    </form>
  )

  const renderBranding = () => (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
          Corporate Branding
        </h3>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors">
              {logoPreview ? (
                <div className="space-y-3">
                  <img src={logoPreview} alt="Company Logo" className="max-h-24 mx-auto object-contain" />
                  <div className="flex justify-center gap-2">
                    <label className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg cursor-pointer hover:bg-blue-700">
                      Change Logo
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
                    </label>
                    <button type="button" onClick={handleRemoveLogo} className="px-4 py-2 bg-red-100 text-red-600 text-sm rounded-lg hover:bg-red-200">Remove</button>
                  </div>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <div className="space-y-2">
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto"><Icons.Upload /></div>
                    <p className="text-sm font-medium text-gray-700">{uploadingLogo ? 'Uploading...' : 'Click to upload logo'}</p>
                    <p className="text-xs text-gray-500">PNG, JPG, GIF, SVG or WebP (max 5MB)</p>
                  </div>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
                </label>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">Or enter a URL:</p>
            <input type="url" value={formData.logo_url} onChange={(e) => { setFormData({ ...formData, logo_url: e.target.value }); if (e.target.value) setLogoPreview(e.target.value) }} className="w-full px-4 py-2 border border-gray-200 rounded-xl mt-1" placeholder="https://example.com/logo.png" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Brand Colors</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {(['primary_color', 'secondary_color', 'accent_color'] as const).map((key) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1 capitalize">{key.replace('_color', '')} Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={formData[key] || '#000000'} onChange={(e) => setFormData({ ...formData, [key]: e.target.value })} className="w-10 h-10 border border-gray-200 rounded-lg cursor-pointer" />
                    <input type="text" value={formData[key]} onChange={(e) => setFormData({ ...formData, [key]: e.target.value })} placeholder="#000000 — not set" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-2">Quick Presets</label>
              <div className="flex flex-wrap gap-2">
                {presetColors.map((preset) => (
                  <button key={preset.name} type="button" onClick={() => setFormData({ ...formData, primary_color: preset.primary, secondary_color: preset.secondary })} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.primary }} />
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.secondary }} />
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Preview</label>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-4 mb-4">
                {formData.logo_url ? (
                  <img src={formData.logo_url} alt="Logo" className="w-12 h-12 object-contain" onError={(e: any) => { e.target.style.display = 'none' }} />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: formData.primary_color }}>
                    <span className="text-white font-bold text-lg">WP</span>
                  </div>
                )}
                <div>
                  <h4 className="font-bold text-gray-900">{formData.firm_name || 'Your Firm Name'}</h4>
                  <p className="text-sm text-gray-500">{formData.tagline || 'Workflow Planner'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="px-4 py-2 text-white text-sm rounded-lg" style={{ backgroundColor: formData.primary_color }}>Primary</button>
                <button type="button" className="px-4 py-2 text-white text-sm rounded-lg" style={{ backgroundColor: formData.secondary_color }}>Secondary</button>
                <button type="button" className="px-4 py-2 text-white text-sm rounded-lg" style={{ backgroundColor: formData.accent_color }}>Accent</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium">Save Branding</button>
      </div>
    </form>
  )

  const renderSubscription = () => {
    if (subLoading) {
      return (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      )
    }
    if (!subscription) return null

    const {
      plan,
      current_plan,
      subscription_status,
      trial_ends_at,
      subscription_ends_at,
      limits: subscriptionLimits,
      usage: subscriptionUsageCounts,
      remaining: subscriptionRemaining,
      percent_used: subscriptionPercentUsed,
      payments,
      available_plans,
      paystack,
      checkout,
      actions,
      next_renewal_at,
      billing_provider,
      access_gate,
    } = subscription
    const liveUsage = subscriptionUsage || subscription
    const limits = liveUsage?.limits || subscriptionLimits
    const usage = liveUsage?.usage || subscriptionUsageCounts || {}
    const remaining = liveUsage?.remaining || subscriptionRemaining || {}
    const percentUsed = liveUsage?.percent_used || subscriptionPercentUsed || {}
    const usageAsOf = liveUsage?.as_of || null
    const plans = normalizePlans(available_plans)
    const currentPlan = current_plan ? normalizePlan(current_plan) : plans.find((p) => p.id === plan)
    const currentPlanName = currentPlan?.name || toTitleCase(plan)
    const currentPlanFeatures = getPlanFeatures(currentPlan)
    const isTrial = subscription_status === 'trial'
    const trialDaysLeft = trial_ends_at ? Math.max(0, Math.ceil((new Date(trial_ends_at).getTime() - Date.now()) / 86_400_000)) : null
    const paystackSubscription = paystack?.subscription || {}
    const paystackRenewal = paystack?.renewal || {}
    const paystackTransaction = paystack?.transaction || {}
    const isBillingGated = Boolean(access_gate?.requires_billing_completion)
    const paidPlans = plans.filter((planOption) => Number(planOption.price_monthly || 0) > 0)
    const selectedBillingPlan =
      plans.find((planOption) => planOption.id === billingPlanSelection) ||
      plans.find((planOption) => planOption.id === checkout?.plan) ||
      plans.find((planOption) => planOption.id === plan) ||
      plans[0] ||
      null
    const selectedBillingCycle = billingCycleSelection === 'annual' ? 'annual' : 'monthly'
    const selectedBillingPrice = selectedBillingPlan
      ? selectedBillingCycle === 'annual'
        ? selectedBillingPlan.price_annual
        : selectedBillingPlan.price_monthly
      : 0
    const currentBillingCycle = paystackSubscription?.billing_cycle || checkout?.billing_cycle || 'monthly'
    const isPendingCheckoutSelection =
      checkout?.status === 'pending' &&
      checkout?.plan === selectedBillingPlan?.id &&
      (checkout?.billing_cycle || 'monthly') === selectedBillingCycle &&
      (checkout?.intent || 'retry') === (plan !== 'free' ? 'plan_change' : 'retry')
    const hasPendingPlanChange = checkout?.intent === 'plan_change'
    const pendingTargetPlan = plans.find((planOption) => planOption.id === checkout?.plan) || null
    const pendingTargetPrice = pendingTargetPlan
      ? checkout?.billing_cycle === 'annual'
        ? Number(pendingTargetPlan.price_annual || 0)
        : Number(pendingTargetPlan.price_monthly || 0)
      : 0
    const nextRenewal = next_renewal_at || paystackSubscription?.next_renewal_at || paystackRenewal?.next_charge_at || subscription_ends_at || null
    const subEndsAt = nextRenewal ? formatBillingDate(nextRenewal) : null
    const primaryPaymentMethod = [
      paystackSubscription?.authorization_card_type,
      paystackSubscription?.authorization_bank,
      paystackSubscription?.authorization_last4 ? `ending ${paystackSubscription.authorization_last4}` : null,
    ].filter(Boolean).join(' · ')
    const warnings = [
      isBillingGated
        ? {
            id: 'billing-access-gate',
            tone: 'error',
            title: 'Complete payment to continue',
            detail: 'This paid account is restricted to Subscription & Billing until checkout is completed or the organisation switches to the free plan.',
          }
        : null,
      isTrial && trialDaysLeft !== null && trialDaysLeft <= 3
        ? {
            id: 'trial-ending',
            tone: trialDaysLeft === 0 ? 'error' : 'warning',
            title: trialDaysLeft === 0 ? 'Trial expires today' : `Trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''}`,
            detail: 'Choose a paid plan before the trial ends to avoid billing interruption.',
          }
        : null,
      subscription_status === 'past_due'
        ? {
            id: 'past-due',
            tone: 'error',
            title: 'Payment needs attention',
            detail: paystackRenewal?.failure_message || paystackRenewal?.warning || checkout?.gateway_response || 'The latest Paystack charge did not complete successfully.',
          }
        : null,
      checkout?.status === 'failed'
        ? {
            id: 'checkout-failed',
            tone: 'error',
            title: 'Checkout was not completed',
            detail: checkout?.gateway_response || 'Retry the checkout to finish activating or updating this subscription.',
          }
        : null,
      checkout?.status === 'pending'
        ? {
            id: 'checkout-pending',
            tone: 'info',
            title: 'Checkout is still pending',
            detail: 'You can resume the open Paystack checkout using the retry action below.',
          }
        : null,
      paystackRenewal?.cancel_at_period_end || paystackSubscription?.cancel_requested_at
        ? {
            id: 'cancel-renewal',
            tone: 'warning',
            title: 'Renewal has been cancelled',
            detail: nextRenewal
              ? `This subscription remains active until ${formatBillingDate(nextRenewal)} and will not renew automatically after that date.`
              : 'This subscription is set to stop renewing at the end of the current billing period.',
          }
        : null,
      paystackRenewal?.warning && subscription_status !== 'past_due'
        ? {
            id: 'renewal-warning',
            tone: 'warning',
            title: 'Billing warning',
            detail: paystackRenewal.warning,
          }
        : null,
    ].filter(Boolean) as Array<{ id: string; tone: string; title: string; detail: string }>
    const fmtLimit = (v: number) => v < 0 ? 'Unlimited' : String(v)
    const activeSection = SUBSCRIPTION_SECTIONS.find((section) => section.key === activeSubscriptionSection) || SUBSCRIPTION_SECTIONS[0]
    const cancellationScheduled = Boolean(paystackRenewal?.cancel_at_period_end || paystackSubscription?.cancel_requested_at)
    const canShowCancelRenewal = Boolean(actions?.can_cancel_renewal) && !cancellationScheduled
    const hasVisibleManageActions = Boolean(
      actions?.can_change_plan ||
      actions?.can_manage_payment_method ||
      actions?.can_email_payment_method_link ||
      actions?.can_resume_renewal ||
      canShowCancelRenewal ||
      actions?.can_retry_checkout,
    )

    if (isBillingGated) {
      return (
        <div className="space-y-6">
          {paystackCallbackStatus === 'failed' && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
              <p className="text-sm font-semibold">Payment was not confirmed</p>
              <p className="text-sm mt-1">
                {paystackCallbackReason
                  ? `Paystack returned: ${formatStatusLabel(paystackCallbackReason)}.`
                  : 'We could not confirm the latest Paystack payment.'}
                {paystackCallbackReference ? ` Reference: ${paystackCallbackReference}.` : ''}
              </p>
            </div>
          )}
          <PendingBillingView
            paidPlans={paidPlans}
            selectedBillingPlan={selectedBillingPlan}
            selectedBillingCycle={selectedBillingCycle}
            selectedBillingPrice={selectedBillingPrice}
            checkout={checkout}
            isPendingCheckoutSelection={isPendingCheckoutSelection}
            billingActionLoading={billingActionLoading}
            onSelectPlan={setBillingPlanSelection}
            onSelectBillingCycle={setBillingCycleSelection}
            onContinueToCheckout={() =>
              handleRetryCheckout(checkout?.authorization_url, checkout?.status, {
                plan: selectedBillingPlan?.id || plan,
                billing_cycle: selectedBillingCycle,
              })}
            formatStatusLabel={formatStatusLabel}
          />
        </div>
      )
    }

    return (
      <div className="space-y-6">
        {paystackCallbackStatus === 'success' && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
            <p className="text-sm font-semibold">Payment confirmed and subscription activated</p>
            <p className="text-sm mt-1">
              Your Paystack payment has been verified, the selected plan is now active, and the payment history below is loaded from the backend.
              {paystackCallbackReference ? ` Reference: ${paystackCallbackReference}.` : ''}
            </p>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="space-y-3">
            {warnings.map((warning) => (
              <div
                key={warning.id}
                className={`rounded-xl border px-4 py-3 ${WARNING_STYLES[warning.tone] || WARNING_STYLES.warning}`}
              >
                <p className="text-sm font-semibold">{warning.title}</p>
                <p className="text-sm mt-1">{warning.detail}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <SettingsCard className="h-fit xl:sticky xl:top-6">
            <SettingsCardHeader className="space-y-4 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${PLAN_COLORS[plan] || 'bg-gray-100 text-gray-700'}`}>
                  {currentPlanName}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[subscription_status] || 'bg-gray-100 text-gray-600'}`}>
                  {formatStatusLabel(subscription_status)}
                </span>
              </div>
              <div>
                <SettingsCardTitle className="text-base">Subscription Settings</SettingsCardTitle>
                <SettingsCardDescription>Open one billing section at a time from this mini-sidebar.</SettingsCardDescription>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Active section</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{activeSection.label}</p>
              </div>
            </SettingsCardHeader>
            <SettingsSeparator className="bg-gray-100" />
            <SettingsCardContent className="p-3">
              <nav className="space-y-1">
                {SUBSCRIPTION_SECTIONS.map((section) => {
                  const isActive = section.key === activeSubscriptionSection
                  const Icon = section.icon

                  return (
                    <Button
                      key={section.key}
                      type="button"
                      variant="ghost"
                      onClick={() => setActiveSubscriptionSection(section.key)}
                      className={cn(
                        'h-auto w-full justify-start rounded-lg px-3 py-3 text-left hover:bg-gray-100',
                        isActive && 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                      )}
                      size="sm"
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-blue-600' : 'text-gray-400')} />
                      <span className="min-w-0 text-sm font-medium">{section.label}</span>
                    </Button>
                  )
                })}
              </nav>
            </SettingsCardContent>
          </SettingsCard>

          <div className="min-w-0 space-y-6">
            {activeSubscriptionSection === 'overview' && (
              <div className="space-y-6">
                <SubscriptionSectionCard
                  title="Billing Overview"
                  description="Current status and renewal details sourced from the latest local Paystack subscription state."
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                        <CreditCard className="h-7 w-7 text-blue-600" />
                      </div>
                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${PLAN_COLORS[plan] || 'bg-gray-100 text-gray-700'}`}>
                            {currentPlanName}
                          </span>
                          {isRecommendedPlan(currentPlan) && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                              Most popular
                            </span>
                          )}
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[subscription_status] || 'bg-gray-100 text-gray-600'}`}>
                            {formatStatusLabel(subscription_status)}
                          </span>
                        </div>
                        <p className="text-lg font-bold text-gray-900">{currentPlanName} Plan</p>
                        <p className="mt-0.5 text-sm text-gray-500">
                          {currentPlan?.price_monthly === 0 ? 'Free plan' : `R${currentPlan?.price_monthly?.toLocaleString?.() || 0}/mo`}
                          {currentPlanFeatures[0] ? ` · ${currentPlanFeatures[0]}` : ''}
                        </p>
                        {isTrial && trialDaysLeft !== null && (
                          <p className={`mt-0.5 text-sm ${trialDaysLeft <= 3 ? 'font-medium text-red-600' : 'text-amber-600'}`}>
                            {trialDaysLeft === 0 ? 'Trial expires today!' : `Trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''}`}
                          </p>
                        )}
                        {subEndsAt && !isTrial && (
                          <p className="mt-0.5 text-sm text-gray-500">
                            {cancellationScheduled ? 'Access ends' : 'Next renewal'}: {subEndsAt}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => setActiveSubscriptionSection('comparison')}>
                        Compare Plans
                      </Button>
                      <Button type="button" onClick={() => setActiveSubscriptionSection('manage')}>
                        Manage Subscription
                      </Button>
                    </div>
                  </div>
                </SubscriptionSectionCard>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.7fr]">
                  <SubscriptionSectionCard
                    title="Billing Details"
                    description="Renewal timing, billing cycle, and Paystack identifiers."
                    className="h-full"
                    contentClassName="space-y-3"
                  >
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
                      <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Subscription status</dt>
                        <dd className="text-sm font-semibold text-gray-900">{formatStatusLabel(subscription_status)}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Next renewal</dt>
                        <dd className="text-sm font-semibold text-gray-900">{subEndsAt || '—'}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Billing cycle</dt>
                        <dd className="text-sm font-semibold text-gray-900">{formatStatusLabel(paystackSubscription?.billing_cycle || checkout?.billing_cycle || 'monthly')}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Billing provider</dt>
                        <dd className="text-sm font-semibold text-gray-900">{formatStatusLabel(billing_provider || 'none')}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Paystack subscription</dt>
                        <dd className="text-right text-sm font-semibold text-gray-900">{paystackSubscription?.subscription_code || '—'}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Last transaction</dt>
                        <dd className="break-all text-right text-sm font-semibold text-gray-900">{paystackTransaction?.reference || checkout?.reference || '—'}</dd>
                      </div>
                    </dl>
                  </SubscriptionSectionCard>

                  <SubscriptionSectionCard
                    title="Payment Method"
                    description="Stored card details from the latest successful Paystack authorization."
                    className="h-full"
                  >
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Card on file</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">{primaryPaymentMethod || 'No Paystack card details available yet'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Subscribed at</p>
                        <p className="mt-1 text-sm text-gray-700">{formatBillingDateTime(paystackSubscription?.subscribed_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Last successful payment</p>
                        <p className="mt-1 text-sm text-gray-700">{formatBillingDateTime(paystackRenewal?.last_success_at || paystackTransaction?.paid_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Last failed attempt</p>
                        <p className="mt-1 text-sm text-gray-700">{formatBillingDateTime(paystackRenewal?.last_failed_at)}</p>
                      </div>
                    </div>
                  </SubscriptionSectionCard>
                </div>
              </div>
            )}

            {activeSubscriptionSection === 'usage' && (
              <SubscriptionSectionCard
                title="Resource Usage"
                description={`Usage counts for your organisation under the ${currentPlanName} plan.`}
              >
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                  <UsageBar label="Staff Members" used={usage.staff || 0} max={limits.max_users} remaining={remaining.staff} color="bg-blue-500" />
                  <UsageBar label="Clients" used={usage.clients || 0} max={limits.max_clients} remaining={remaining.clients} color="bg-purple-500" />
                  <UsageBar label="Jobs" used={usage.jobs || 0} max={limits.max_jobs} remaining={remaining.jobs} color="bg-green-500" />
                  <UsageBar label="Admin Seats" used={usage.admins || 0} max={limits.max_admins_per_organisation} remaining={remaining.admins} color="bg-amber-500" />
                  <UsageBar label="Organisations Per Owner Email" used={usage.organisations || 0} max={limits.max_organisations_per_owner_email} remaining={remaining.organisations} color="bg-indigo-500" />
                </div>
                <div className="flex flex-col gap-2 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Current plan usage is pulled from the SaaS API and recalculated against your active plan limits.
                  </span>
                  {usageAsOf && (
                    <span>
                      Updated {new Date(usageAsOf).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </div>
                {(limits.max_users > 0 && usage.staff >= limits.max_users * 0.9) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    You&apos;re approaching your staff limit.
                    <Button type="button" variant="link" className="h-auto px-1 py-0 text-amber-900" onClick={() => setActiveSubscriptionSection('comparison')}>
                      Compare plans
                    </Button>
                    to add more team members.
                  </div>
                )}
                {(limits.max_clients > 0 && (percentUsed.clients ?? 0) >= 90) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    You&apos;re approaching your client limit. Compare plans if you need to add more clients.
                  </div>
                )}
              </SubscriptionSectionCard>
            )}

            {activeSubscriptionSection === 'comparison' && (
              <div className="space-y-6">
                <SubscriptionSectionCard
                  title="Plan Limits Matrix"
                  description="Compare included limits and prices across available plans."
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="w-1/4 py-2 pr-4 text-left font-medium text-gray-500">Plan</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-500">Staff</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-500">Admins</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-500">Orgs</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-500">Clients</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-500">Jobs</th>
                          <th className="py-2 pl-2 text-right font-medium text-gray-500">Monthly</th>
                          <th className="py-2 pl-2 text-right font-medium text-gray-500">Annual</th>
                          <th className="py-2 pl-4" />
                        </tr>
                      </thead>
                      <tbody>
                        {plans.map((p) => {
                          const isCurrent = p.id === plan
                          return (
                            <tr key={p.id} className={`border-b border-gray-50 ${isCurrent ? 'bg-blue-50' : ''}`}>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${PLAN_COLORS[p.id] || 'bg-gray-100 text-gray-600'}`}>{p.name}</span>
                                  {isCurrent && <span className="text-xs font-medium text-blue-600">current</span>}
                                </div>
                              </td>
                              <td className="px-2 py-3 text-center font-medium text-gray-700">{fmtLimit(p.max_users)}</td>
                              <td className="px-2 py-3 text-center font-medium text-gray-700">{fmtLimit(p.max_admins_per_organisation)}</td>
                              <td className="px-2 py-3 text-center font-medium text-gray-700">{fmtLimit(p.max_organisations_per_owner_email)}</td>
                              <td className="px-2 py-3 text-center font-medium text-gray-700">{fmtLimit(p.max_clients)}</td>
                              <td className="px-2 py-3 text-center font-medium text-gray-700">{fmtLimit(p.max_jobs)}</td>
                              <td className="py-3 pl-2 text-right text-gray-700">{p.price_monthly === 0 ? 'Free' : `R${p.price_monthly.toLocaleString()}`}</td>
                              <td className="py-3 pl-2 text-right text-gray-700">{p.price_annual === 0 ? 'Free' : `R${p.price_annual.toLocaleString()}`}</td>
                              <td className="py-3 pl-4 text-right">
                                {!isCurrent && actions?.can_change_plan && (
                                  <Button
                                    type="button"
                                    variant="link"
                                    className="h-auto p-0 text-xs"
                                    onClick={openPlanChangeModal}
                                  >
                                    Switch
                                  </Button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </SubscriptionSectionCard>

                <SubscriptionSectionCard
                  title="Plan Comparison"
                  description="Available plans are loaded from the current SaaS plans configuration."
                >
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {plans.map((planOption) => {
                      const isCurrent = planOption.id === plan
                      const isRecommended = isRecommendedPlan(planOption)
                      const cardLines = getPlanCardLines(planOption)

                      return (
                        <div
                          key={planOption.id}
                          className={`rounded-xl border p-4 ${
                            isCurrent
                              ? 'border-blue-200 bg-blue-50'
                              : isRecommended
                                ? 'border-purple-200 bg-purple-50'
                                : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-base font-semibold text-gray-900">{planOption.name}</h4>
                              <p className="mt-1 text-sm text-gray-500">
                                {formatPlanPrice(planOption.price_monthly)}
                                {Number(planOption.price_monthly || 0) > 0 ? '/mo' : ''}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                              {isRecommended && (
                                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                                  Most popular
                                </span>
                              )}
                              {isCurrent && (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                  Current plan
                                </span>
                              )}
                            </div>
                          </div>
                          <ul className="mt-3 space-y-2">
                            {cardLines.slice(0, 4).map((line) => (
                              <li key={line} className="flex items-start gap-2 text-sm text-gray-600">
                                <CheckIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isCurrent || isRecommended ? 'text-blue-500' : 'text-green-500'}`} />
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </SubscriptionSectionCard>
              </div>
            )}

            {activeSubscriptionSection === 'history' && (
              <SubscriptionSectionCard
                title="Payment History"
                description="Recent checkout, renewal, and webhook-updated transaction records."
              >
                {payments && payments.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="py-2 pr-4 text-left font-medium text-gray-500">Date</th>
                          <th className="py-2 pr-4 text-left font-medium text-gray-500">Plan</th>
                          <th className="py-2 pr-4 text-left font-medium text-gray-500">Status</th>
                          <th className="py-2 pr-4 text-left font-medium text-gray-500">Details</th>
                          <th className="py-2 text-right font-medium text-gray-500">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p: any) => (
                          <tr key={p.id} className="border-b border-gray-50">
                            <td className="py-3 pr-4 text-gray-600">
                              <div>{formatBillingDate(p.completed_at || p.created_at)}</div>
                              <div className="text-xs text-gray-400">{formatBillingDateTime(p.completed_at || p.created_at)}</div>
                            </td>
                            <td className="py-3 pr-4">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_COLORS[p.plan] || 'bg-gray-100 text-gray-600'}`}>{p.plan || '—'}</span>
                                <span className="text-xs text-gray-400 capitalize">{p.billing_cycle || '—'}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'}`}>
                                {formatStatusLabel(p.status)}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-gray-600">
                              <div className="font-medium text-gray-900">{p.description || 'Paystack transaction'}</div>
                              {p.reference && <div className="text-xs text-gray-400 break-all">Ref: {p.reference}</div>}
                              {p.webhook_event && <div className="text-xs text-gray-400">{formatStatusLabel(p.webhook_event)}</div>}
                              {p.gateway_response && <div className="text-xs text-gray-400">{p.gateway_response}</div>}
                            </td>
                            <td className="py-3 text-right font-semibold text-gray-900">
                              {formatBillingMoney(p.currency, p.amount_net ?? p.amount_gross ?? p.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-gray-400">
                    <svg className="mx-auto mb-2 h-10 w-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-sm">No payment history yet.</p>
                    {plan === 'free' && <p className="mt-1 text-xs">Upgrade to a paid plan to see transactions here.</p>}
                  </div>
                )}
              </SubscriptionSectionCard>
            )}

            {activeSubscriptionSection === 'manage' && (
              <div className="space-y-6">
                <SubscriptionSectionCard
                  title="Manage Subscription"
                  description="Update your plan and manage billing actions for this subscription."
                >
                  {hasPendingPlanChange && pendingTargetPlan && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      A plan change is waiting for payment: <span className="font-semibold">{pendingTargetPlan.name}</span> · {formatStatusLabel(checkout?.billing_cycle || 'monthly')} · {formatPlanPrice(pendingTargetPrice)}.
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {actions?.can_change_plan && (
                      <div className="rounded-xl border border-gray-100 p-4">
                        <p className="text-sm font-semibold text-gray-900">Change Plan</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Choose another plan or billing cycle, then continue to payment if a new charge is required.
                        </p>
                        <Button type="button" className="mt-4" onClick={openPlanChangeModal}>
                          Change Plan
                        </Button>
                      </div>
                    )}
                    {actions?.can_retry_checkout && checkout && checkout.status !== 'pending' && (
                      <div className="rounded-xl border border-gray-100 p-4">
                        <p className="text-sm font-semibold text-gray-900">Retry Payment</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Continue the most recent {checkout.intent === 'plan_change' ? 'plan change' : 'checkout'} if payment was not completed.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-4"
                          disabled={billingActionLoading === 'retry'}
                          onClick={() =>
                            handleRetryCheckout(checkout.authorization_url, checkout.status, {
                              plan: checkout.plan || plan,
                              billing_cycle: checkout.billing_cycle || currentBillingCycle,
                              intent: checkout.intent || 'retry',
                            })}
                        >
                          {billingActionLoading === 'retry'
                            ? 'Opening checkout...'
                            : 'Retry Payment'}
                        </Button>
                      </div>
                    )}
                    {actions?.can_manage_payment_method && (
                      <div className="rounded-xl border border-gray-100 p-4">
                        <p className="text-sm font-semibold text-gray-900">Payment Method</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Open Paystack&apos;s hosted management page to update card details for future renewals.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-4"
                          disabled={billingActionLoading === 'payment-method'}
                          onClick={handleUpdatePaymentDetails}
                        >
                          {billingActionLoading === 'payment-method' ? 'Opening...' : 'Manage Payment Method'}
                        </Button>
                      </div>
                    )}
                    {actions?.can_email_payment_method_link && (
                      <div className="rounded-xl border border-gray-100 p-4">
                        <p className="text-sm font-semibold text-gray-900">Email Payment Method Link</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Ask Paystack to email the hosted payment-method management link for this subscription.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-4"
                          disabled={billingActionLoading === 'payment-method-email'}
                          onClick={handleEmailPaymentMethodLink}
                        >
                          {billingActionLoading === 'payment-method-email' ? 'Sending...' : 'Email Payment Method Link'}
                        </Button>
                        <p className="mt-3 text-xs text-gray-500">
                          Last sent: {formatBillingDateTime(paystackSubscription?.manage_link_sent_at)}
                        </p>
                      </div>
                    )}
                    {canShowCancelRenewal && (
                      <div className="rounded-xl border border-red-100 p-4">
                        <p className="text-sm font-semibold text-gray-900">Cancel Renewal</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Stop automatic renewal at the end of the current billing period while keeping access until then.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-4 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
                          disabled={billingActionLoading === 'cancel'}
                          onClick={handleCancelRenewal}
                        >
                          {billingActionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Renewal'}
                        </Button>
                      </div>
                    )}
                    {actions?.can_resume_renewal && (
                      <div className="rounded-xl border border-green-100 p-4">
                        <p className="text-sm font-semibold text-gray-900">Resume Renewal</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Re-enable automatic renewal for this Paystack subscription before the current period ends.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-4 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-700"
                          disabled={billingActionLoading === 'resume'}
                          onClick={handleResumeRenewal}
                        >
                          {billingActionLoading === 'resume' ? 'Resuming...' : 'Resume Renewal'}
                        </Button>
                        {subEndsAt && (
                          <p className="mt-3 text-xs text-gray-500">
                            Current access is scheduled through {subEndsAt}.
                          </p>
                        )}
                      </div>
                    )}
                    {!hasVisibleManageActions && (
                      <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500 md:col-span-2">
                        No backend-supported management actions are currently available for this subscription.
                      </div>
                    )}
                  </div>

                  {cancellationScheduled && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Renewal has already been cancelled.
                      {subEndsAt ? ` Access remains available until ${subEndsAt}.` : ''}
                    </div>
                  )}
                </SubscriptionSectionCard>

                {checkout && (
                  <SubscriptionSectionCard
                    title="Latest Checkout"
                    description="Most recent locally recorded checkout session and reference."
                  >
                    <div className="grid grid-cols-1 gap-3 text-sm text-gray-600 md:grid-cols-2">
                      <p>Status: <span className="font-medium text-gray-900">{formatStatusLabel(checkout.status)}</span></p>
                      <p>Plan: <span className="font-medium text-gray-900">{toTitleCase(checkout.plan || plan)}</span></p>
                      <p>Billing cycle: <span className="font-medium text-gray-900">{formatStatusLabel(checkout.billing_cycle)}</span></p>
                      <p>Type: <span className="font-medium text-gray-900">{checkout.intent === 'plan_change' ? 'Plan change' : 'Checkout'}</span></p>
                      <p>Created: <span className="font-medium text-gray-900">{formatBillingDateTime(checkout.created_at)}</span></p>
                    </div>
                    {checkout.reference && (
                      <p className="text-xs text-gray-500 break-all">Reference: {checkout.reference}</p>
                    )}
                  </SubscriptionSectionCard>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderOrganisation = () => {
    const activeMembers = orgMembers.filter((m: any) => m.status === 'active')
    const invitedMembers = orgMembers.filter((m: any) => m.status === 'invited')

    return (
      <div className="space-y-6">
        {/* ── Organisation Details ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Organisation Details</h3>
          {orgLoading ? (
            <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
          ) : orgDetails ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {([
                ['Name', orgDetails.firm_name],
                ['Subdomain', orgDetails.subdomain],
                ['Email', orgDetails.email],
                ['Phone', orgDetails.phone || '—'],
                ['Plan', orgDetails.saas_plan?.name || orgDetails.plan],
                ['Subscription', orgDetails.subscription_status],
                ['Owner', orgDetails.owner?.name || '—'],
                ['Member since', orgDetails.created_at ? new Date(orgDetails.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</dt>
                  <dd className="text-sm text-gray-800 font-medium mt-0.5 capitalize">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-gray-400">No organisation details available.</p>
          )}
        </div>

        {/* ── Invite form ─────────────────────────────────────────────── */}
        {/* ── Team Members ────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-gray-900">Team Members</h3>
            <button
              type="button"
              onClick={() => setInviteModalOpen(true)}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
            >
              + Add Team Member
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-5">Admins, supervisors, and other senior members with elevated access to this organisation.</p>

          {orgLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : activeMembers.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No team members yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeMembers.map((m: any) => {
                const name = m.name || '—'
                const initials = name !== '—' ? name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '?'
                const accessLevel = m.role === 'owner' ? 'Admin' : m.role === 'supervisor' ? 'Supervisor' : 'Admin'
                const canDelete = m.role_title === 'Admin' || m.role_title === 'Partner' || m.role_title === 'Director' || m.role_title === 'Manager'
                const isCurrentUser = user?._id && m.id === String(user._id)
                return (
                <div key={m.id} className="border border-gray-100 rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    {m.profile_picture_url ? (
                      <img src={m.profile_picture_url} alt={name} className="h-10 w-10 rounded-full object-cover border border-gray-200" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-gray-900 text-sm truncate">{name}</h3>
                        {isCurrentUser && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500 font-medium shrink-0">You</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{m.email}</p>
                    </div>
                  </div>

                  <table className="w-full text-sm mb-4">
                    <tbody>
                      <tr className="border-b border-gray-50">
                        <td className="py-1.5 text-xs text-gray-500">Role</td>
                        <td className="py-1.5 text-xs font-medium text-gray-700 text-right">{m.role_title || m.role}</td>
                      </tr>
                      <tr className="border-b border-gray-50">
                        <td className="py-1.5 text-xs text-gray-500">Phone</td>
                        <td className="py-1.5 text-xs text-gray-700 text-right">{m.phone || '—'}</td>
                      </tr>
                      <tr className="border-b border-gray-50">
                        <td className="py-1.5 text-xs text-gray-500">Access Level</td>
                        <td className="py-1.5 text-right">
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                            m.role === 'supervisor' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {accessLevel}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-xs text-gray-500">Can Delete</td>
                        <td className={`py-1.5 text-xs font-medium text-right ${canDelete ? 'text-green-600' : 'text-red-600'}`}>
                          {canDelete ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {m.role !== 'owner' && (
                    <button
                      onClick={() => { setSelectedAdmin(m); setPermissionModal(true) }}
                      className="w-full px-4 py-2 text-sm font-medium rounded-xl border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Icons.Edit />
                      Edit Permissions
                    </button>
                  )}
                  {isCurrentUser && (
                    <button
                      onClick={() => setEditProfileOpen(true)}
                      className="w-full px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                    >
                      Edit Profile
                    </button>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Pending Invites ────────────────────────────────────────────── */}
        {orgInvites.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Pending Invites</h3>
          <div className="divide-y divide-gray-50">
            {orgInvites.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-700 text-sm truncate">{inv.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Role: {inv.role_title || inv.invite_role || 'admin'}
                    {' · '}Invited {new Date(inv.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}expires {new Date(inv.expires_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">pending</span>
                  <button
                    onClick={async () => {
                      try {
                        await api.delete(`/settings/organisation/invites/${inv.id}`)
                        toast.success('Invite revoked')
                        loadOrgData()
                      } catch { toast.error('Failed to revoke invite') }
                    }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    )
  }

  const renderDanger = () => (
    <div className="bg-red-50 rounded-xl border border-red-200 p-6">
      <h3 className="text-base font-semibold text-red-800 mb-2 flex items-center gap-2">
        <Icons.Warning />Danger Zone
      </h3>
      <p className="text-sm text-red-700 mb-4">These actions are irreversible. Please proceed with caution.</p>
      <button onClick={() => setShowResetModal(true)} className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-medium">
        Reset System &amp; Clear All Data
      </button>
    </div>
  )

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" data-testid="settings-page">
      {!hidePageHeader && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          <p className="text-gray-500 mt-1">Configure your firm preferences</p>
        </div>
      )}

      {pendingRegistrations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-800 mb-3">
            <Icons.Bell />
            <span className="font-semibold">Pending User Registrations ({pendingRegistrations.length})</span>
          </div>
          <div className="space-y-2">
            {pendingRegistrations.map((reg: any) => (
              <div key={reg.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-amber-100">
                <div>
                  <p className="font-medium text-gray-900">{reg.name}</p>
                  <p className="text-sm text-gray-500">{reg.email}</p>
                </div>
                <button
                  onClick={() => { setApprovalModal({ open: true, registration: reg }); setApprovalData({ role: 'Accountant', access_level: 'Standard', rejection_reason: '' }) }}
                  className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
                >
                  Review
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } ${tab.key === 'danger' ? 'text-red-500 hover:text-red-600 hover:border-red-300' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab panels */}
      <div>
        {activeTab === 'general' && renderGeneral()}
        {activeTab === 'branding' && renderBranding()}
        {activeTab === 'email' && renderEmail()}
        {activeTab === 'subscription' && renderSubscription()}
        {activeTab === 'userManagement' && renderOrganisation()}
        {activeTab === 'danger' && renderDanger()}
      </div>

      {/* Modals */}
      <Modal
        isOpen={permissionModal && selectedAdmin}
        onClose={() => { setPermissionModal(false); setSelectedAdmin(null) }}
        title="Edit User Permissions"
      >
        {selectedAdmin && (
          <AdminPermissionView
            member={selectedAdmin}
            onSaved={loadOrgData}
            onCancel={() => { setPermissionModal(false); setSelectedAdmin(null) }}
          />
        )}
      </Modal>

      {inviteModalOpen && (
        <InviteTeamMemberModal
          onClose={() => setInviteModalOpen(false)}
          onSuccess={loadOrgData}
        />
      )}

      {editProfileOpen && (
        <EditProfileModal
          user={user}
          onClose={() => setEditProfileOpen(false)}
          onUserUpdate={onUserUpdate}
        />
      )}

      <Modal
        isOpen={showPlanChangeModal}
        onClose={() => setShowPlanChangeModal(false)}
        title="Change Plan"
        size="lg"
      >
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Current Plan</p>
            <p className="mt-1 text-sm text-gray-600">
              {subscription?.current_plan?.name || toTitleCase(subscription?.plan || 'free')} · {formatStatusLabel(subscription?.paystack?.subscription?.billing_cycle || 'monthly')}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Your current access stays active until the new payment succeeds.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900">Choose a plan</p>
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {normalizePlans(subscription?.available_plans).map((planOption) => {
                const isSelected = planOption.id === billingPlanSelection
                const isCurrent = planOption.id === subscription?.plan
                const cardLines = getPlanCardLines(planOption)
                const priceLabel = Number(planOption.price_monthly || 0) > 0
                  ? `${formatPlanPrice(Number(planOption.price_monthly || 0))}/mo or ${formatPlanPrice(Number(planOption.price_annual || 0))}/yr`
                  : 'Free'

                return (
                  <button
                    key={planOption.id}
                    type="button"
                    onClick={() => {
                      setBillingPlanSelection(planOption.id)
                      if (planOption.id === 'free') {
                        setBillingCycleSelection('monthly')
                      }
                    }}
                    className={cn(
                      'rounded-2xl border p-5 text-left transition-colors',
                      isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-base font-semibold text-gray-900">{planOption.name}</h4>
                          {isCurrent && (
                            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-gray-500">{priceLabel}</p>
                      </div>
                      <span className={cn('mt-1 h-4 w-4 rounded-full border', isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white')} />
                    </div>
                    <ul className="mt-4 space-y-2">
                      {cardLines.slice(0, 3).map((line) => (
                        <li key={line} className="flex items-start gap-2 text-sm text-gray-600">
                          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>
          </div>

          {billingPlanSelection !== 'free' && (
            <div>
              <p className="text-sm font-semibold text-gray-900">Billing cycle</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['monthly', 'annual'] as const).map((cycle) => {
                  const modalPlan = normalizePlans(subscription?.available_plans).find((planOption) => planOption.id === billingPlanSelection)
                  const amount = modalPlan
                    ? cycle === 'annual'
                      ? Number(modalPlan.price_annual || 0)
                      : Number(modalPlan.price_monthly || 0)
                    : 0

                  return (
                    <Button
                      key={cycle}
                      type="button"
                      size="sm"
                      variant={billingCycleSelection === cycle ? 'secondary' : 'outline'}
                      className={cn(billingCycleSelection === cycle && 'bg-blue-50 text-blue-700 hover:bg-blue-100')}
                      onClick={() => setBillingCycleSelection(cycle)}
                    >
                      {cycle === 'annual' ? 'Annual' : 'Monthly'} · {formatPlanPrice(amount)}
                    </Button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowPlanChangeModal(false)}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmPlanChange}
              disabled={billingActionLoading === 'retry' || !billingPlanSelection}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {billingActionLoading === 'retry'
                ? 'Opening checkout...'
                : billingPlanSelection === 'free'
                  ? 'Switch to Free Plan'
                  : 'Continue to Paystack'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showResetModal} onClose={() => { setShowResetModal(false); setResetConfirm('') }} title="Reset System">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-800 font-medium">⚠️ Warning: This action cannot be undone!</p>
            <ul className="text-sm text-red-700 mt-2 list-disc list-inside space-y-0.5">
              <li>All staff members and their accounts</li>
              <li>All jobs and allocations</li>
              <li>All time entries</li>
              <li>All departments</li>
              <li>All pending registrations</li>
            </ul>
            <p className="text-sm text-red-700 mt-2">Settings and branding will be preserved.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type "RESET" to confirm</label>
            <input type="text" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-xl" placeholder="RESET" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setShowResetModal(false); setResetConfirm('') }} className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleResetSystem} disabled={resetConfirm !== 'RESET' || resetting} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:bg-gray-400">
              {resetting ? 'Resetting...' : 'Reset System'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={approvalModal.open} onClose={() => setApprovalModal({ open: false, registration: null })} title="Review Registration">
        {approvalModal.registration && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="font-medium text-gray-900">{approvalModal.registration.name}</p>
              <p className="text-sm text-gray-500">{approvalModal.registration.email}</p>
              {approvalModal.registration.phone && <p className="text-sm text-gray-500">Phone: {approvalModal.registration.phone}</p>}
              <p className="text-xs text-gray-400 mt-2">Registered: {new Date(approvalModal.registration.created_at).toLocaleString()}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign Role</label>
              <select value={approvalData.role} onChange={(e) => setApprovalData({ ...approvalData, role: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                <option value="Partner">Partner</option>
                <option value="Manager">Manager</option>
                <option value="Senior Accountant">Senior Accountant</option>
                <option value="Accountant">Accountant</option>
                <option value="Junior Accountant">Junior Accountant</option>
                <option value="Trainee">Trainee</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Access Level</label>
              <select value={approvalData.access_level} onChange={(e) => setApprovalData({ ...approvalData, access_level: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                <option value="Standard">Standard - Personal dashboard only</option>
                <option value="Supervisor">Supervisor - Team access</option>
                <option value="Admin">Admin - Full access, no delete</option>
                <option value="Full">Full - Complete access</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason (if rejecting)</label>
              <textarea value={approvalData.rejection_reason} onChange={(e) => setApprovalData({ ...approvalData, rejection_reason: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl" rows={2} placeholder="Optional reason for rejection..." />
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleApproveReject(false)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700">Reject</button>
              <button onClick={() => handleApproveReject(true)} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700">Approve</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function AdminPermissionView({ member, onSaved, onCancel }: { member: any; onSaved: () => void; onCancel: () => void }) {
  const [role, setRole] = useState(member.role === 'supervisor' ? 'supervisor' : 'admin')
  const [saving, setSaving] = useState(false)

  const accessLevelLabel = role === 'supervisor' ? 'Supervisor' : 'Admin'
  const canDelete = role === 'admin'

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/settings/organisation/members/${member.id}/role`, { role })
      toast.success('Permissions updated')
      onSaved()
      onCancel()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update permissions')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="font-medium text-gray-900">{member.name || '—'}</p>
        <p className="text-sm text-gray-500">{member.role_title || member.role} • {member.email}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Access Level</label>
        <div className="space-y-2">
          {['Admin', 'Supervisor'].map((level) => {
            const value = level === 'Admin' ? 'admin' : 'supervisor'
            return (
              <label
                key={level}
                className={`flex items-start gap-3 p-3 bg-white border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors ${
                  role === value ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="access_level"
                  value={value}
                  checked={role === value}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-0.5 text-blue-600"
                />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{level}</p>
                  <p className="text-xs text-gray-500">
                    {level === 'Admin'
                      ? 'Complete system access, can manage all permissions, users, settings, jobs, and delete records'
                      : 'Can approve timesheets, view reports, team dashboards — but cannot manage users, settings, or delete records'
                    }
                  </p>
                </div>
              </label>
            )
          })}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={canDelete}
            disabled
            className="text-blue-600 rounded"
          />
          <div>
            <p className="font-medium text-gray-900">Can Delete Records</p>
            <p className="text-xs text-gray-500">
              {role === 'admin'
                ? 'Admin level users can delete records'
                : 'Supervisor level users cannot delete records by design'
              }
            </p>
          </div>
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || role === member.role}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
