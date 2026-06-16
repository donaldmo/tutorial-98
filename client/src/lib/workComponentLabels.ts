export const normalizeCompKey = (key: string | null | undefined): string => {
  if (!key) return 'general:General'
  const [svcRaw = 'general', ...roleParts] = String(key).split(':')
  const role = roleParts.join(':').trim() || 'General'
  const svc = svcRaw.trim()
  const svcNorm = svc.toLowerCase().replace(/[\s_-]+/g, '')
  if (svcNorm === 'p' || svcNorm === 'payroll') return `payroll:${role}`
  if (svcNorm === 'm' || svcNorm === 'ma' || svcNorm.includes('management')) return `ma:${role}`
  if (svcNorm === 'onceoff' || svcNorm === 'once_off') return `once_off:${role}`
  return `${svc.toLowerCase()}:${role}`
}

const SERVICE_LABEL_MAP: Record<string, string> = {
  payroll: 'Payroll',
  ma: 'MA',
  once_off: 'Once-off',
  general: 'General',
}

export const getServiceLabel = (service: string | null | undefined): string => {
  if (!service) return 'General'
  const norm = service.trim().toLowerCase().replace(/[\s_-]+/g, '')
  return SERVICE_LABEL_MAP[norm] || service.trim()
}

export const formatWorkComponentLabel = (key?: string | null): string => {
  if (!key) return 'General allocation'
  const [serviceRaw = 'general', ...roleParts] = String(key).split(':')
  const role = roleParts.join(':').trim()
  const normalizedService = serviceRaw.trim().toLowerCase().replace(/[\s_-]+/g, '')
  const serviceLabel = SERVICE_LABEL_MAP[normalizedService] || serviceRaw.trim()
  if (!role) return serviceLabel
  return `${serviceLabel}: ${role}`
}

export const formatWorkComponentBadge = (service?: string | null): { label: string } => {
  return { label: getServiceLabel(service) }
}
