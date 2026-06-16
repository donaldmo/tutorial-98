type BillingAccessGate = {
  requires_billing_completion?: boolean
  target_url?: string | null
}

type SubscriptionSnapshot = {
  access_gate?: BillingAccessGate | null
}

export const BILLING_GATE_PATH = '/app/settings?tab=subscription'

export const getBillingGatePath = (snapshot?: SubscriptionSnapshot | BillingAccessGate | null) => {
  const target = 'access_gate' in Object(snapshot || {}) ? (snapshot as SubscriptionSnapshot)?.access_gate?.target_url : (snapshot as BillingAccessGate | null)?.target_url
  return target || BILLING_GATE_PATH
}

export const requiresBillingCompletion = (snapshot?: SubscriptionSnapshot | null) =>
  Boolean(snapshot?.access_gate?.requires_billing_completion)

export const isBillingGateLocation = (pathname: string, search: string) => {
  if (pathname !== '/app/settings') return false
  const params = new URLSearchParams(search)
  return params.get('tab') === 'subscription'
}
