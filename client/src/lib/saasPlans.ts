export type SaasPlan = {
  id: string
  name: string
  price_monthly: number
  price_annual: number
  max_users: number
  max_clients: number
  max_jobs: number
  max_admins_per_organisation: number
  max_organisations_per_owner_email: number
  recommended?: boolean
  features?: string[]
}

export const toTitleCase = (value: string) =>
  String(value || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

export const normalizePlan = (plan: any): SaasPlan => ({
  id: String(plan?.id || ''),
  name: String(plan?.name || '').trim() || toTitleCase(String(plan?.id || '')),
  price_monthly: Number(plan?.price_monthly || 0),
  price_annual: Number(plan?.price_annual || 0),
  max_users: Number(plan?.max_users ?? 0),
  max_clients: Number(plan?.max_clients ?? 0),
  max_jobs: Number(plan?.max_jobs ?? 0),
  max_admins_per_organisation: Number(plan?.max_admins_per_organisation ?? 0),
  max_organisations_per_owner_email: Number(plan?.max_organisations_per_owner_email ?? 0),
  recommended: Boolean(plan?.recommended),
  features: Array.isArray(plan?.features)
    ? plan.features.filter((feature: unknown) => typeof feature === 'string')
    : [],
})

export const normalizePlans = (plans: unknown): SaasPlan[] =>
  Array.isArray(plans)
    ? plans
        .map((plan) => normalizePlan(plan))
        .filter((plan) => plan.id)
        .sort((a, b) => a.price_monthly - b.price_monthly)
    : []

export const formatSeatFeature = (rawValue: unknown) => {
  const value = Number(rawValue)
  if (!Number.isFinite(value) || value < 0) return 'Unlimited staff'
  return `Up to ${value} staff`
}

const formatCountLine = (rawValue: unknown, singular: string, plural = `${singular}s`) => {
  const value = Number(rawValue)
  if (!Number.isFinite(value) || value < 0) return `Unlimited ${plural}`
  return `${value} ${value === 1 ? singular : plural}`
}

export const formatPlanPrice = (rawValue: unknown) => {
  const value = Number(rawValue || 0)
  if (!Number.isFinite(value) || value <= 0) return 'Free'
  return `R${value.toLocaleString()}`
}

export const getPlanFeatures = (plan: Partial<SaasPlan> | null | undefined) => [
  formatSeatFeature(plan?.max_users),
  ...((Array.isArray(plan?.features) ? plan.features : []).filter((feature): feature is string => typeof feature === 'string')),
]

export const getPlanCardLines = (plan: Partial<SaasPlan> | null | undefined) => [
  formatSeatFeature(plan?.max_users),
  `${formatCountLine(plan?.max_admins_per_organisation, 'admin seat')}`,
  `${formatCountLine(plan?.max_organisations_per_owner_email, 'organisation', 'organisations')} per owner email`,
  formatCountLine(plan?.max_clients, 'client'),
  formatCountLine(plan?.max_jobs, 'job'),
  `${formatPlanPrice(plan?.price_annual)} annual billing`,
  ...((Array.isArray(plan?.features) ? plan.features : []).filter((feature): feature is string => typeof feature === 'string')),
]

export const isRecommendedPlan = (plan: Partial<SaasPlan> | null | undefined) =>
  Boolean(plan?.recommended) || plan?.id === 'professional'
