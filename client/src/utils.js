export const formatDate = (value, fallback = 'Not specified') => {
  if (!value) return fallback;
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split('-');
  if (!year || !month || !day) return raw;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${raw}T00:00:00Z`));
};

export const formatDateRange = (record) => {
  const start = formatDate(record.start_date || record.startDate);
  const endValue = record.end_date || record.endDate;
  const startValue = record.start_date || record.startDate;
  return endValue && String(endValue).slice(0, 10) !== String(startValue).slice(0, 10)
    ? `${start} – ${formatDate(endValue)}`
    : start;
};

export const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const humanize = (key) => String(key || '')
  .replace(/_/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())
  .replace(/Doi/g, 'DOI')
  .replace(/Isbn/g, 'ISBN')
  .replace(/Issn/g, 'ISSN');

export const hasValue = (value) => value !== null && value !== undefined && value !== '';

export const initials = (name = '') => {
  const parts = name.replace(/\b(Dr|Mr|Mrs|Ms|Prof)\.?\s*/gi, '').trim().split(/\s+/).filter(Boolean);
  return (parts.length ? `${parts[0][0] || ''}${parts.at(-1)?.[0] || ''}` : 'FP').toUpperCase();
};

export const currentAcademicYears = (count = 8) => {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: count }, (_, index) => {
    const year = start - index;
    return `${year}-${String(year + 1).slice(-2)}`;
  });
};
