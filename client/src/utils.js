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

export const currentAcademicYears = (count = 10) => {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: count }, (_, index) => {
    const year = start - index;
    return `${year}-${String(year + 1).slice(-2)}`;
  });
};

export const ACTIVITY_TYPE_COLORS = {
  'Workshop': '#0f766e',
  'Research Paper': '#7e22ce',
  'Research Paper / Publication': '#7e22ce',
  'Research Publication': '#7e22ce',
  'Industry Visit': '#b45309',
  'Industry Visit / Guest Visit': '#b45309',
  'Online Certification': '#1d4ed8',
  'Online Certification / Course': '#1d4ed8',
  'Faculty Development Programme (FDP)': '#14284b',
  'FDP': '#14284b',
  'Seminar': '#15803d',
  'Guest Lecture': '#be123c',
  'Value Added Course': '#0369a1',
  'Club Event': '#c2410c',
  'Other': '#475569'
};

export const getTypeColor = (typeName = '') => {
  const norm = String(typeName).toLowerCase();
  if (norm.includes('workshop')) return '#0f766e';
  if (norm.includes('research') || norm.includes('publication') || norm.includes('paper')) return '#7e22ce';
  if (norm.includes('industry') || norm.includes('guest visit')) return '#b45309';
  if (norm.includes('online certification') || norm.includes('certification') || norm.includes('course')) return '#1d4ed8';
  if (norm.includes('fdp') || norm.includes('faculty development')) return '#14284b';
  if (norm.includes('seminar')) return '#15803d';
  if (norm.includes('guest lecture')) return '#be123c';
  if (norm.includes('value added') || norm.includes('vac')) return '#0369a1';
  if (norm.includes('club')) return '#c2410c';
  return '#475569';
};

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const formatNarrativeDateRange = (record = {}) => {
  const sStr = String(record.start_date || record.startDate || '').split('T')[0];
  if (!sStr) return '—';
  const [sY, sM, sD] = sStr.split('-').map(Number);
  if (!sY || !sM || !sD) return sStr;

  const sMonth = MONTHS_LONG[sM - 1];
  const eStr = String(record.end_date || record.endDate || '').split('T')[0];

  if (!eStr || eStr === sStr) {
    return `${sD} ${sMonth} ${sY}`;
  }

  const [eY, eM, eD] = eStr.split('-').map(Number);
  if (!eY || !eM || !eD) return `${sD} ${sMonth} ${sY}`;

  const eMonth = MONTHS_LONG[eM - 1];

  if (sY === eY && sM === eM) {
    return `${sD}–${eD} ${sMonth} ${sY}`;
  }
  if (sY === eY) {
    return `${sD} ${sMonth} – ${eD} ${eMonth} ${sY}`;
  }
  return `${sD} ${sMonth} ${sY} – ${eD} ${eMonth} ${eY}`;
};

export const normalizeHost = (host = '') => {
  if (!host) return 'Walchand College of Engineering, Sangli';
  const trimmed = host.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'no' || lower === 'none' || lower === 'na' || lower === 'n/a') {
    return 'Walchand College of Engineering, Sangli';
  }
  if (
    lower.includes('walchand') ||
    lower.includes('walchaand') ||
    lower === 'wce' ||
    lower === 'wce sangli' ||
    lower === 'wce, sangli'
  ) {
    return 'Walchand College of Engineering, Sangli';
  }
  return trimmed;
};

export const formatFacultyNameWithSalutation = (record = {}) => {
  const raw = String(record.staff_name || record.staffName || 'Faculty Member').trim();
  const prefixes = ['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.', 'Dr ', 'Prof ', 'Mr ', 'Mrs ', 'Ms '];
  for (const p of prefixes) {
    if (raw.startsWith(p)) return raw;
  }
  const sal = record.staff_salutation || record.salutation || 'Prof.';
  return `${sal} ${raw}`;
};

export const buildActivityNarrative = (record = {}) => {
  const name = formatFacultyNameWithSalutation(record);
  const title = (record.title || 'Academic Activity').trim();
  const host = normalizeHost(record.host_organisation || record.hostOrganisation);
  const dates = formatNarrativeDateRange(record);
  const typeName = (record.type_name || record.typeName || 'Activity').toLowerCase();
  const role = String(record.faculty_role || record.facultyRole || record.role || '').toLowerCase();
  const venue = record.venue ? record.venue.trim() : '';
  const scope = record.scope ? record.scope.trim() : 'Institute';
  const participants = record.participant_count || record.participantCount;

  let tokens = [];

  if (typeName.includes('research') || typeName.includes('paper') || typeName.includes('publication')) {
    tokens = [
      { text: name, bold: true },
      { text: ' presented a research paper at the ', bold: false },
      { text: title, bold: true },
      { text: ', held at ', bold: false },
      { text: host, bold: true },
      { text: ', during ', bold: false },
      { text: dates, bold: true },
      { text: '. Through this presentation, she/he disseminated research findings, engaged with academicians and researchers, and contributed to the exchange of innovative ideas, thereby enhancing the institute’s research visibility.', bold: false }
    ];
  } else if (role.includes('organis') || role.includes('organiz') || role.includes('coordinat') || role.includes('conven')) {
    const venueText = venue && venue.toLowerCase() !== 'online' ? ` (${venue})` : '';
    const partText = participants ? ` for ${participants} registered participants.` : '.';
    tokens = [
      { text: name, bold: true },
      { text: ' organised and coordinated the ', bold: false },
      { text: title, bold: true },
      { text: ' at ', bold: false },
      { text: `${host}${venueText}`, bold: true },
      { text: ' from ', bold: false },
      { text: dates, bold: true },
      { text: `, held at the ${scope.toLowerCase()} level${partText}`, bold: false }
    ];
  } else if (typeName.includes('industry visit') || typeName.includes('guest visit')) {
    tokens = [
      { text: name, bold: true },
      { text: ' arranged the visit of ', bold: false },
      { text: title, bold: true },
      { text: ' to ', bold: false },
      { text: host, bold: true },
      { text: ' on ', bold: false },
      { text: dates, bold: true },
      { text: '. The visit showcased the vibrant open-source ecosystem, modern infrastructure, and collaborative initiatives undertaken by WCE, Sangli.', bold: false }
    ];
  } else if (typeName.includes('fdp') || typeName.includes('faculty development')) {
    tokens = [
      { text: name, bold: true },
      { text: ' attended the ', bold: false },
      { text: title, bold: true },
      { text: ' conducted by ', bold: false },
      { text: host, bold: true },
      { text: ' from ', bold: false },
      { text: dates, bold: true },
      { text: '. The FDP provided comprehensive insights into emerging technologies, including advanced computational methodologies, and their applications in research and education.', bold: false }
    ];
  } else if (typeName.includes('online certification') || typeName.includes('certification') || typeName.includes('course')) {
    tokens = [
      { text: name, bold: true },
      { text: ' successfully completed the ', bold: false },
      { text: `“${title}”`, bold: true },
      { text: ' online training conducted by ', bold: false },
      { text: host, bold: true },
      { text: ' during ', bold: false },
      { text: dates, bold: true },
      { text: ', enhancing core technical competence and applied proficiency in modern industry frameworks.', bold: false }
    ];
  } else if (role.includes('speaker') || role.includes('resource') || role.includes('expert')) {
    tokens = [
      { text: name, bold: true },
      { text: ' delivered an invited expert session on ', bold: false },
      { text: `“${title}”`, bold: true },
      { text: ' organised by ', bold: false },
      { text: host, bold: true },
      { text: ' on ', bold: false },
      { text: dates, bold: true },
      { text: `, sharing domain expertise with registered participants at the ${scope.toLowerCase()} level.`, bold: false }
    ];
  } else {
    tokens = [
      { text: name, bold: true },
      { text: ' successfully completed the ', bold: false },
      { text: title, bold: true },
      { text: ' organised by ', bold: false },
      { text: host, bold: true },
      { text: ' on ', bold: false },
      { text: dates, bold: true },
      { text: '. The programme provided hands-on training in effective methodologies, problem solving, and modern domain practices.', bold: false }
    ];
  }

  if (record.summary && record.summary.trim().length > 10) {
    const extraSummary = record.summary.trim();
    if (!tokens.some(t => t.text.includes(extraSummary))) {
      tokens.push({ text: ` ${extraSummary.endsWith('.') ? extraSummary : extraSummary + '.'}`, bold: false });
    }
  }

  if (record.outcomes && record.outcomes.trim().length > 10) {
    const extraOutcomes = record.outcomes.trim();
    tokens.push({ text: ` ${extraOutcomes.endsWith('.') ? extraOutcomes : extraOutcomes + '.'}`, bold: false });
  }

  return {
    tokens,
    fullText: tokens.map(t => t.text).join('')
  };
};
