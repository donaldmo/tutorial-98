export const normalizeStatusLabel = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Unknown';
  if (raw.toLowerCase() === 'doing') return 'In Progress';
  return raw;
};

export const toStatusKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');

export const withStatusMeta = (status) => {
  const statusLabel = normalizeStatusLabel(status);
  return {
    status,
    status_label: statusLabel,
    status_key: toStatusKey(statusLabel),
  };
};

export const withRiskMeta = (riskLevel) => {
  const label = normalizeStatusLabel(riskLevel);
  return {
    risk_level: riskLevel,
    risk_level_label: label,
    risk_level_key: toStatusKey(label),
    risk_label: label,
    risk_key: toStatusKey(label),
  };
};

export const withPerformanceMeta = (performance) => {
  const label = normalizeStatusLabel(performance);
  return {
    performance,
    performance_label: label,
    performance_key: toStatusKey(label),
  };
};
