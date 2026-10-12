import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import Icon from './Icon';
import { currentAcademicYears, hasValue, humanize, normalizeHost } from '../utils';
import { getActiveToken } from '../api';

const legacyTypeAliases = {
  'Value Added Course': 'Value-Added Course',
  'FDP/Workshop/Seminar/Webinar': 'Workshop (Attended)',
  'FTP/ Seminar / Webinar': 'Workshop (Attended)',
  'Guest Invitation/Expert Session': 'Guest Lecture Delivered',
  'Guest lecture Delivered': 'Guest Lecture Delivered',
  'Guest lec organized': 'Guest Lecture Organized',
  'Industrial visit': 'Industrial Visit',
  'Faculty Achievements': 'Faculty Achievement / Award',
  'Faculty Achievements / Awards': 'Faculty Achievement / Award',
  'MOU': 'Partnership / MoU Signed',
  'Grant Received': 'Research Project / Grant',
  'Research Published': 'Research Publication',
  'Book Chapter Published': 'Book / Book Chapter',
  'E-Learning Material': 'E-Learning / OER Content Developed',
  'Consultancy Corporate Activity': 'Consultancy / Corporate Training',
  Recognition: 'Faculty Achievement / Award',
  'CEP Program': 'Student Development / CEP Program',
  'Misc/Other': 'Other Institutional Activity'
};

const deriveAcademicYear = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
};

const formatDateDMY = (dateStr) => {
  if (!dateStr) return 'DD-MM-YYYY';
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
};

const normaliseInitial = (record, user) => {
  const details = { ...(record?.details || {}) };
  if (!details.funded) {
    details.funded = 'No';
  }
  return {
    typeName: legacyTypeAliases[record?.type_name] || record?.type_name || 'Workshop (Attended)',
    title: record?.title || '',
    department: record?.department || user?.department || 'Computer Science and Engineering',
    facultyRole: record?.faculty_role || record?.role || 'Participant / Attendee',
    academicYear: record?.acad_year || currentAcademicYears()[0],
    startDate: record?.start_date || '',
    endDate: record?.end_date && record.end_date !== record.start_date ? record.end_date : '',
    startTime: record?.start_time || '',
    endTime: record?.end_time || '',
    mode: record?.mode || 'Offline',
    scope: record?.scope || 'National',
    hostOrganisation: record?.host_organisation || '',
    venue: record?.venue || '',
    activityStatus: record?.activity_status || 'Completed',
    participantCount: record?.participant_count ?? '',
    summary: record?.summary || details.description || '',
    outcomes: record?.outcomes || '',
    evidenceAvailability: record?.evidence_availability || (record?.attachments?.length ? 'Available now' : 'Available now'),
    evidenceNote: record?.evidence_note || '',
    officialUrl: record?.official_url || '',
    details,
    guests: record?.guests?.length ? record.guests.map((guest) => ({ ...guest })) : [],
    existingAttachments: (record?.attachments || []).map((att) => ({
      ...att,
      isPrimary: Boolean(att.is_primary || att.isPrimary),
      isReportVisible: att.is_report_visible !== false && att.isReportVisible !== false
    })),
    removeAttachmentIds: [],
    newAttachments: []
  };
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
  reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
  reader.readAsDataURL(file);
});

const Stepper = ({ step, setStep }) => {
  const items = ['Activity basics', 'Details & evidence', 'Review & submit'];
  return (
    <ol className="stepper" aria-label="Submission progress" style={{ marginBottom: '16px' }}>
      {items.map((label, index) => {
        const number = index + 1;
        const state = number < step ? 'complete' : number === step ? 'current' : 'upcoming';
        return (
          <li
            key={label}
            className={state}
            aria-current={number === step ? 'step' : undefined}
            onClick={() => setStep(number)}
            style={{ cursor: 'pointer' }}
          >
            <span className="step-number">{number < step ? <Icon name="check" size={15} /> : number}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
};

const FieldError = ({ message }) => message ? <span className="field-error" role="alert">{message}</span> : null;

const Required = () => <span className="required-mark" aria-hidden="true">*</span>;

const DRAFT_KEY = 'wce_activity_draft_v1';

const SubmitActivity = ({ user, catalog, initialActivity, onSubmit, onCancel, submitting }) => {
  const [step, setStep] = useState(() => {
    if (!initialActivity) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
        if (saved?.step && saved.step >= 1 && saved.step <= 3) return saved.step;
      } catch (_err) {
        void _err;
      }
    }
    return 1;
  });

  const [form, setForm] = useState(() => {
    const base = normaliseInitial(initialActivity, user);
    if (!initialActivity) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
        if (saved?.form) {
          return {
            ...base,
            ...saved.form,
            details: { funded: 'No', ...base.details, ...(saved.form.details || {}) },
            guestLectures: saved.form.guestLectures || base.guestLectures,
            newAttachments: [],
            existingAttachments: []
          };
        }
      } catch (_err) {
        void _err;
      }
    }
    return base;
  });

  const [errors, setErrors] = useState({});
  const [diagnosticList, setDiagnosticList] = useState([]);
  const [zoomLevel, setZoomLevel] = useState('85');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [declaration, setDeclaration] = useState(false);
  const [galleryModalOpen, setGalleryModalOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const liveSheetRef = useRef(null);

  // Memoize whether proof document is present
  const hasProof = useMemo(() => {
    return form.newAttachments.some((a) => a.kind === 'evidence' || a.kind === 'report') ||
      form.existingAttachments.some((a) => (a.kind === 'evidence' || a.kind === 'report') && !form.removeAttachmentIds.includes(a.id));
  }, [form.newAttachments, form.existingAttachments, form.removeAttachmentIds]);

  // Build exact, clear problem diagnostics for faculty & clubs
  const buildDiagnostics = (s1Errors = {}, s2Errors = {}) => {
    const list = [];
    if (s1Errors.typeName) list.push({ step: 1, stepName: 'Step 1: Activity Basics', message: s1Errors.typeName, fieldId: 'input-type' });
    if (s1Errors.title) list.push({ step: 1, stepName: 'Step 1: Activity Basics', message: s1Errors.title, fieldId: 'input-title' });
    if (s1Errors.academicYear) list.push({ step: 1, stepName: 'Step 1: Activity Basics', message: s1Errors.academicYear, fieldId: 'input-acad-year' });
    if (s1Errors.startDate) list.push({ step: 1, stepName: 'Step 1: Activity Basics', message: s1Errors.startDate, fieldId: 'input-start-date' });
    if (s1Errors.endDate) list.push({ step: 1, stepName: 'Step 1: Activity Basics', message: s1Errors.endDate, fieldId: 'input-end-date' });
    if (s1Errors.mode) list.push({ step: 1, stepName: 'Step 1: Activity Basics', message: s1Errors.mode, fieldId: 'input-mode' });
    if (s1Errors.hostOrganisation) list.push({ step: 1, stepName: 'Step 1: Activity Basics', message: s1Errors.hostOrganisation, fieldId: 'input-host' });
    if (s1Errors.venue) list.push({ step: 1, stepName: 'Step 1: Activity Basics', message: s1Errors.venue, fieldId: 'input-venue' });

    if (s2Errors.summary) list.push({ step: 2, stepName: 'Step 2: Details & Evidence', message: s2Errors.summary, fieldId: 'activity-summary' });
    if (s2Errors['details.funded']) list.push({ step: 2, stepName: 'Step 2: Details & Evidence', message: s2Errors['details.funded'], fieldId: 'form-group-funding' });
    if (s2Errors['details.fundingAgency']) list.push({ step: 2, stepName: 'Step 2: Details & Evidence', message: s2Errors['details.fundingAgency'], fieldId: 'input-fund-agency' });
    if (s2Errors['details.fundingAmount']) list.push({ step: 2, stepName: 'Step 2: Details & Evidence', message: s2Errors['details.fundingAmount'], fieldId: 'input-fund-amt' });
    if (s2Errors.evidence) list.push({ step: 2, stepName: 'Step 2: Details & Evidence', message: s2Errors.evidence, fieldId: 'upload-proof' });
    if (s2Errors.guests) list.push({ step: 2, stepName: 'Step 2: Details & Evidence', message: s2Errors.guests, fieldId: 'form-group-guests' });

    Object.entries(s2Errors).forEach(([key, msg]) => {
      if (!list.some((item) => item.message === msg)) {
        list.push({ step: 2, stepName: 'Step 2: Details & Evidence', message: msg, fieldId: key });
      }
    });

    return list;
  };

  const jumpToDiagnosticField = (item) => {
    setStep(item.step);
    setTimeout(() => {
      if (item.fieldId) {
        const el = document.getElementById(item.fieldId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus?.();
        }
      }
    }, 120);
  };

  // Automatically persist form draft to sessionStorage on changes
  useEffect(() => {
    if (!initialActivity) {
      try {
        const draft = {
          step,
          form: {
            typeName: form.typeName,
            title: form.title,
            academicYear: form.academicYear,
            mode: form.mode,
            scope: form.scope,
            facultyRole: form.facultyRole,
            startDate: form.startDate,
            endDate: form.endDate,
            durationDays: form.durationDays,
            hostOrganisation: form.hostOrganisation,
            venue: form.venue,
            attendanceCount: form.attendanceCount,
            financialSupport: form.financialSupport,
            amountClaimed: form.amountClaimed,
            details: form.details,
            guestLectures: form.guestLectures
          }
        };
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch (_err) {
        void _err;
      }
    }
  }, [initialActivity, step, form]);

  const flatTypes = useMemo(
    () => catalog.typeGroups.flatMap((group) => group.types.map((type) => ({ ...type, group: group.label }))),
    [catalog]
  );
  
  const selectedType = flatTypes.find((type) => type.name === form.typeName) || flatTypes[0];

  const setValue = (name, value) => {
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: undefined }));
  };

  const setDetail = (name, value) => {
    setForm((previous) => ({ ...previous, details: { ...previous.details, [name]: value } }));
    setErrors((previous) => ({ ...previous, [`details.${name}`]: undefined }));
  };

  const changeType = (typeName) => {
    const nextType = flatTypes.find((type) => type.name === typeName);
    const defaultRole = nextType?.defaultRole || (nextType?.roles?.length ? nextType.roles[0] : 'Participant / Attendee');
    setForm((previous) => ({
      ...previous,
      typeName,
      facultyRole: defaultRole,
      mode: nextType?.eventBased ? (previous.mode || 'Offline') : '',
      scope: nextType?.requiresScope ? (previous.scope || 'National') : '',
      details: { funded: 'No' },
      guests: []
    }));
    setErrors({});
    setDiagnosticList([]);
  };

  const changeStartDate = (value) => {
    setForm((previous) => ({
      ...previous,
      startDate: value,
      endDate: previous.endDate && previous.endDate < value ? '' : previous.endDate,
      academicYear: previous.academicYear || deriveAcademicYear(value)
    }));
    setErrors((previous) => ({ ...previous, startDate: undefined, academicYear: undefined }));
  };

  const addGuest = () => {
    setForm((previous) => ({
      ...previous,
      guests: [
        ...previous.guests,
        { name: '', designation: '', organisation: '', country: 'India', guestRole: 'Resource Person', guestType: 'External', email: '', phone: '' }
      ]
    }));
  };

  const updateGuest = (index, name, value) => {
    setForm((previous) => ({
      ...previous,
      guests: previous.guests.map((guest, guestIndex) => guestIndex === index ? { ...guest, [name]: value } : guest)
    }));
    setErrors((previous) => ({ ...previous, [`guest.${index}.${name}`]: undefined }));
  };

  const removeGuest = (index) => {
    setForm((previous) => ({ ...previous, guests: previous.guests.filter((_, guestIndex) => guestIndex !== index) }));
  };

  const handleFileUpload = (kind, fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const fileErrors = [];
    const accepted = incoming.filter((file) => {
      if (file.size > 10 * 1024 * 1024) {
        fileErrors.push(`${file.name} exceeds 10 MB.`);
        return false;
      }
      return true;
    });

    if (kind === 'image') {
      const currentImageCount = form.newAttachments.filter((item) => item.kind === 'image').length
        + form.existingAttachments.filter((item) => item.kind === 'image' && !form.removeAttachmentIds.includes(item.id)).length;
      if (currentImageCount + accepted.length > 100) {
        fileErrors.push('You can attach up to 100 activity images.');
      }
    }

    if (fileErrors.length) {
      setErrors((previous) => ({ ...previous, files: fileErrors.join(' ') }));
      return;
    }

    setForm((previous) => {
      let filteredNew = previous.newAttachments;
      if (kind === 'attendance') {
        filteredNew = previous.newAttachments.filter((item) => item.kind !== 'attendance');
      } else if (kind === 'evidence' || kind === 'report') {
        filteredNew = previous.newAttachments.filter((item) => item.kind !== kind);
      }

      const hasAnyPrimary = previous.existingAttachments.some((a) => a.isPrimary && !previous.removeAttachmentIds.includes(a.id)) ||
        filteredNew.some((a) => a.isPrimary);

      const mappedAccepted = accepted.map((file, index) => {
        const isCert = kind === 'evidence' || kind === 'report' || /cert/i.test(file.name);
        const shouldBePrimary = isCert || (!hasAnyPrimary && index === 0);
        return {
          key: `${file.name}-${file.lastModified}-${kind}-${index}-${Date.now()}`,
          file,
          kind,
          caption: '',
          previewUrl: URL.createObjectURL(file),
          sortOrder: previous.newAttachments.length + index,
          isPrimary: shouldBePrimary,
          isReportVisible: true
        };
      });

      const hasNewPrimary = mappedAccepted.some((a) => a.isPrimary);
      const updatedExisting = hasNewPrimary
        ? previous.existingAttachments.map((a) => ({ ...a, isPrimary: false }))
        : previous.existingAttachments;
      const updatedFilteredNew = hasNewPrimary
        ? filteredNew.map((a) => ({ ...a, isPrimary: false }))
        : filteredNew;

      return {
        ...previous,
        existingAttachments: updatedExisting,
        newAttachments: [
          ...updatedFilteredNew,
          ...mappedAccepted
        ]
      };
    });
    setErrors((previous) => ({ ...previous, files: undefined, evidence: undefined }));
  };

  const setPrimaryAttachment = (target) => {
    setForm((previous) => ({
      ...previous,
      newAttachments: previous.newAttachments.map((na) => ({
        ...na,
        isPrimary: target.key ? na.key === target.key : false
      })),
      existingAttachments: previous.existingAttachments.map((ea) => ({
        ...ea,
        isPrimary: target.id ? ea.id === target.id : false
      }))
    }));
  };

  const removeNewFile = (key) => {
    setForm((previous) => ({ ...previous, newAttachments: previous.newAttachments.filter((item) => item.key !== key) }));
  };

  const toggleExistingAttachment = (id) => {
    setForm((previous) => ({
      ...previous,
      removeAttachmentIds: previous.removeAttachmentIds.includes(id)
        ? previous.removeAttachmentIds.filter((item) => item !== id)
        : [...previous.removeAttachmentIds, id]
    }));
  };

  const resetForm = () => {
    if (window.confirm('Clear all form fields and reset?')) {
      setForm(normaliseInitial(null, user));
      setErrors({});
      setStep(1);
    }
  };

  const validateStep1 = () => {
    const nextErrors = {};
    if (!form.typeName) nextErrors.typeName = 'Select an activity type.';
    if (!form.title.trim()) nextErrors.title = 'Enter the activity title / description.';
    if (!form.academicYear) nextErrors.academicYear = 'Select the academic year.';
    if (!form.startDate) nextErrors.startDate = 'Enter the start date.';
    if (form.endDate && form.endDate < form.startDate) nextErrors.endDate = 'End date cannot be earlier than start date.';
    if (selectedType?.eventBased && !form.mode) nextErrors.mode = 'Select the participation mode.';
    if (selectedType?.requiresHost && !form.hostOrganisation.trim()) nextErrors.hostOrganisation = 'Host organisation is required.';
    if (selectedType?.eventBased && ['Offline', 'Hybrid'].includes(form.mode) && !form.venue.trim()) nextErrors.venue = 'Venue is required for offline/hybrid events.';
    return nextErrors;
  };

  const validateStep2 = () => {
    const nextErrors = {};
    if (!form.summary.trim()) nextErrors.summary = 'Short description is required.';
    for (const field of selectedType?.fields || []) {
      if (field.required && !hasValue(form.details[field.name])) {
        nextErrors[`details.${field.name}`] = `${field.label} is required.`;
      }
    }
    if (selectedType?.supportsGuests && form.typeName.includes('Organized')) {
      if (!form.guests.length) nextErrors.guests = 'Add at least one guest / resource person.';
      form.guests.forEach((guest, index) => {
        if (!guest.name.trim()) nextErrors[`guest.${index}.name`] = 'Guest name is required.';
        if (!guest.organisation.trim()) nextErrors[`guest.${index}.organisation`] = 'Organisation is required.';
      });
    }

    if (selectedType?.supportsFunding) {
      if (!['Yes', 'No'].includes(form.details.funded)) {
        nextErrors['details.funded'] = 'Please select whether funding or fee support was involved (select "No" if not funded).';
      } else if (form.details.funded === 'Yes') {
        if (!form.details.fundingAgency?.trim()) {
          nextErrors['details.fundingAgency'] = 'Funding agency or sponsor is required when funding was involved.';
        }
        const amtClean = String(form.details.fundingAmount ?? '').replace(/[₹,Rs.\s]/gi, '').trim();
        if (amtClean === '' || isNaN(Number(amtClean)) || Number(amtClean) < 0) {
          nextErrors['details.fundingAmount'] = 'Please enter a valid funded amount in ₹ (enter 0 if waived / sponsored).';
        }
      }
    }

    if (!hasProof) {
      nextErrors.evidence = 'Certificate or proof document is mandatory for activity submission.';
    }

    return nextErrors;
  };

  const goToStep = (targetStep) => {
    if (targetStep > step) {
      if (step === 1) {
        const step1Errors = validateStep1();
        if (Object.keys(step1Errors).length > 0) {
          setErrors(step1Errors);
          setDiagnosticList(buildDiagnostics(step1Errors, {}));
          return;
        }
      } else if (step === 2) {
        const step2Errors = validateStep2();
        if (Object.keys(step2Errors).length > 0) {
          setErrors(step2Errors);
          setDiagnosticList(buildDiagnostics({}, step2Errors));
          return;
        }
      }
    }
    setErrors({});
    setDiagnosticList([]);
    setStep(targetStep);
  };

  const handleSubmit = async (event, targetStatus = 'Submitted') => {
    event?.preventDefault();
    const step1Errors = targetStatus === 'Submitted' ? validateStep1() : {};
    const step2Errors = targetStatus === 'Submitted' ? validateStep2() : {};
    const validationErrors = { ...step1Errors, ...step2Errors };

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      const diagnostics = buildDiagnostics(step1Errors, step2Errors);
      setDiagnosticList(diagnostics);
      if (Object.keys(step1Errors).length > 0) {
        setStep(1);
      } else if (Object.keys(step2Errors).length > 0) {
        setStep(2);
      }
      return;
    }

    try {
      setDiagnosticList([]);
      const serialisedNewAttachments = await Promise.all(
        form.newAttachments.map(async (item) => ({
          kind: item.kind,
          fileName: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          data: await fileToBase64(item.file),
          caption: item.caption || '',
          sortOrder: item.sortOrder,
          isPrimary: Boolean(item.isPrimary),
          isReportVisible: item.isReportVisible !== false
        }))
      );

      const activeExistingAttachments = form.existingAttachments
        .filter((item) => !form.removeAttachmentIds.includes(item.id))
        .map((item, index) => ({
          id: item.id,
          kind: item.kind,
          fileName: item.fileName,
          mimeType: item.mimeType,
          caption: item.caption,
          sortOrder: index,
          isPrimary: Boolean(item.isPrimary),
          isReportVisible: item.isReportVisible !== false
        }));

      const sanitizedDetails = { ...form.details };
      if (selectedType?.supportsFunding) {
        if (sanitizedDetails.funded === 'Yes') {
          sanitizedDetails.funded = 'Yes';
          if (sanitizedDetails.fundingAmount !== undefined && sanitizedDetails.fundingAmount !== null && sanitizedDetails.fundingAmount !== '') {
            sanitizedDetails.fundingAmount = String(sanitizedDetails.fundingAmount).replace(/[₹,Rs.\s]/gi, '').trim();
          }
        } else {
          sanitizedDetails.funded = 'No';
          delete sanitizedDetails.fundingAgency;
          delete sanitizedDetails.fundingAmount;
        }
      }

      const payload = {
        typeName: form.typeName,
        title: form.title.trim(),
        department: form.department || user.department,
        facultyRole: form.facultyRole || selectedType?.defaultRole || 'Participant / Attendee',
        academicYear: form.academicYear,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        mode: selectedType?.eventBased ? form.mode : null,
        scope: selectedType?.requiresScope ? form.scope : null,
        hostOrganisation: form.hostOrganisation.trim() || null,
        venue: form.venue.trim() || null,
        activityStatus: form.activityStatus,
        participantCount: form.participantCount !== '' ? Number(form.participantCount) : null,
        summary: form.summary.trim() || form.title.trim(),
        outcomes: form.outcomes.trim() || null,
        evidenceAvailability: form.evidenceAvailability,
        evidenceNote: form.evidenceNote.trim() || null,
        officialUrl: form.officialUrl.trim() || null,
        details: sanitizedDetails,
        guests: form.guests,
        attachments: [...activeExistingAttachments, ...serialisedNewAttachments],
        status: targetStatus
      };

      await onSubmit(payload, initialActivity?.act_id);
    } catch (err) {
      const serverMsg = err.response?.data?.error || err.message || 'Unable to save activity.';
      const serverErrors = err.response?.data?.errors || [serverMsg];
      
      const newDiagnostics = [];
      let targetStep = null;

      serverErrors.forEach((msg) => {
        const lower = String(msg).toLowerCase();
        if (lower.includes('funding') || lower.includes('funded') || lower.includes('fee')) {
          newDiagnostics.push({
            step: 2,
            stepName: 'Step 2: Details & Evidence',
            message: `Funding / Fee Support Issue: ${msg}`,
            fieldId: 'form-group-funding'
          });
          if (!targetStep) targetStep = 2;
        } else if (lower.includes('proof') || lower.includes('evidence') || lower.includes('url') || lower.includes('attachment') || lower.includes('photo')) {
          newDiagnostics.push({
            step: 2,
            stepName: 'Step 2: Details & Evidence',
            message: `Proof / Evidence Issue: ${msg}`,
            fieldId: 'upload-proof'
          });
          if (!targetStep) targetStep = 2;
        } else if (lower.includes('guest')) {
          newDiagnostics.push({
            step: 2,
            stepName: 'Step 2: Details & Evidence',
            message: `Guest Resource Persons Issue: ${msg}`,
            fieldId: 'form-group-guests'
          });
          if (!targetStep) targetStep = 2;
        } else if (lower.includes('title') || lower.includes('date') || lower.includes('mode') || lower.includes('venue') || lower.includes('academic year') || lower.includes('role')) {
          newDiagnostics.push({
            step: 1,
            stepName: 'Step 1: Activity Basics',
            message: `Activity Basics Issue: ${msg}`,
            fieldId: lower.includes('title') ? 'input-title' : lower.includes('venue') ? 'input-venue' : 'input-start-date'
          });
          if (!targetStep) targetStep = 1;
        } else {
          newDiagnostics.push({
            step: step,
            stepName: 'Submission Error',
            message: msg
          });
        }
      });

      setDiagnosticList(newDiagnostics);
      setErrors({ form: serverMsg });
      if (targetStep) {
        setStep(targetStep);
        setTimeout(() => {
          const firstDiag = newDiagnostics[0];
          if (firstDiag?.fieldId) {
            document.getElementById(firstDiag.fieldId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      }
    }
  };

  const handleDownloadLivePdf = async () => {
    setPdfGenerating(true);
    const safeTitle = String(form.title || form.typeName || 'Activity_Report')
      .replace(/[^a-zA-Z0-9-]+/g, '_')
      .slice(0, 45);
    const filename = `WCE_${safeTitle}.pdf`;

    try {
      const element = document.getElementById('live-preview-sheet');
      if (element) {
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        const imgData = canvas.toDataURL('image/png');
        
        // Exact single-page A4 format (210mm x 297mm)
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 6;
        const printableWidth = pageWidth - (margin * 2);
        const printableHeight = pageHeight - (margin * 2);

        let finalWidth = printableWidth;
        let finalHeight = (canvas.height * printableWidth) / canvas.width;

        // Guaranteed single page scaling
        if (finalHeight > printableHeight) {
          const scale = printableHeight / finalHeight;
          finalWidth = finalWidth * scale;
          finalHeight = printableHeight;
        }

        const xOffset = margin + (printableWidth - finalWidth) / 2;
        const yOffset = margin + (printableHeight - finalHeight) / 2;

        pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight);

        // Add real native clickable hyperlinks for all <a> tags inside the document
        const sheetRect = element.getBoundingClientRect();
        const linkElements = element.querySelectorAll('a[href]');

        linkElements.forEach((linkEl) => {
          const href = linkEl.getAttribute('href');
          if (!href || href === '#' || href.startsWith('javascript:')) return;

          const rect = linkEl.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;

          const scaleX = finalWidth / sheetRect.width;
          const scaleY = finalHeight / sheetRect.height;

          const linkX = xOffset + (rect.left - sheetRect.left) * scaleX;
          const linkY = yOffset + (rect.top - sheetRect.top) * scaleY;
          const linkW = rect.width * scaleX;
          const linkH = rect.height * scaleY;

          pdf.link(linkX, linkY, linkW, linkH, { url: href });
        });

        pdf.save(filename);
      }
    } catch (err) {
      alert('PDF generation error: ' + (err.message || 'Unknown'));
    } finally {
      setPdfGenerating(false);
    }
  };

  // Extract attached files
  const liveAttendance = form.newAttachments.find((a) => a.kind === 'attendance') || form.existingAttachments.find((a) => a.kind === 'attendance' && !form.removeAttachmentIds.includes(a.id));
  const liveProof = form.newAttachments.find((a) => a.kind === 'evidence' || a.kind === 'report') || form.existingAttachments.find((a) => (a.kind === 'evidence' || a.kind === 'report') && !form.removeAttachmentIds.includes(a.id));
  
  const authToken = getActiveToken();
  const tokenParam = authToken ? `&token=${encodeURIComponent(authToken)}` : '';

  // All active images (for multiple image gallery)
  const newImages = form.newAttachments.filter((a) => a.kind === 'image');
  const existingImages = form.existingAttachments.filter((a) => a.kind === 'image' && !form.removeAttachmentIds.includes(a.id));
  const allImages = [
    ...existingImages.map((img) => ({
      name: img.fileName,
      url: `/api/activity/${initialActivity?.act_id}/attachments/${img.id}?disposition=inline${tokenParam}`,
      isExisting: true,
      id: img.id,
      isPrimary: Boolean(img.isPrimary)
    })),
    ...newImages.map((img) => ({
      name: img.file.name,
      url: img.previewUrl,
      isExisting: false,
      key: img.key,
      isPrimary: Boolean(img.isPrimary)
    }))
  ];

  const attendanceUrl = liveAttendance?.previewUrl || (liveAttendance?.id && `/api/activity/${initialActivity?.act_id}/attachments/${liveAttendance.id}?disposition=inline${tokenParam}`) || '#';
  const proofUrl = liveProof?.previewUrl || (liveProof?.id && `/api/activity/${initialActivity?.act_id}/attachments/${liveProof.id}?disposition=inline${tokenParam}`) || '#';

  const zoomScale = zoomLevel === 'Fit' ? 0.75 : Number(zoomLevel) / 100;

  // Filtered detail entries for specific contribution data table
  const detailEntries = Object.entries(form.details || {}).filter(([, val]) => hasValue(val));

  return (
    <div className="builder-split-page">
      <div className="page-heading" style={{ marginBottom: '16px' }}>
        <div>
          <span className="eyebrow">{initialActivity ? 'Editing Activity' : 'Faculty Activity & Evidence Portal'}</span>
          <h1>{initialActivity ? `Update ${form.typeName}` : 'Activity Input & Live Document Generator'}</h1>
          <p>Fill in the step-by-step activity details on the left. The official structured WCE report on the right generates live as you type.</p>
        </div>
      </div>

      {diagnosticList.length > 0 && (
        <div
          className="submission-diagnostic-card"
          role="alert"
          style={{
            backgroundColor: '#fff1f2',
            border: '2px solid #e11d48',
            borderRadius: '10px',
            padding: '16px 18px',
            marginBottom: '20px',
            boxShadow: '0 4px 14px rgba(225, 29, 72, 0.12)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px', lineHeight: 1 }}>⚠️</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#9f1239' }}>
                  Submission Issue Detected: Why This Activity Cannot Be Submitted
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#881337', fontWeight: '500' }}>
                  The college activity portal requires the following item{diagnosticList.length > 1 ? 's' : ''} before submission for HOD review:
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDiagnosticList([])}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#9f1239', padding: '2px 6px', fontWeight: 'bold' }}
              title="Dismiss alert"
            >
              ✕
            </button>
          </div>

          <ul style={{ margin: '12px 0 14px', paddingLeft: '22px', fontSize: '13px', color: '#4c0519', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {diagnosticList.map((item, idx) => (
              <li key={idx} style={{ lineHeight: '1.45' }}>
                <strong style={{ color: item.step === 1 ? '#0369a1' : item.step === 2 ? '#b45309' : '#9f1239' }}>
                  [{item.stepName}]:
                </strong>{' '}
                {item.message}
                <button
                  type="button"
                  onClick={() => jumpToDiagnosticField(item)}
                  style={{
                    marginLeft: '8px',
                    background: '#e11d48',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  Fix in Step {item.step} →
                </button>
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid #fecdd3', paddingTop: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#9f1239', alignSelf: 'center' }}>Direct Navigation:</span>
            {diagnosticList.some((i) => i.step === 1) && (
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => goToStep(1)}>
                Go to Step 1 (Activity Basics)
              </button>
            )}
            {diagnosticList.some((i) => i.step === 2) && (
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => goToStep(2)}>
                Go to Step 2 (Details & Evidence)
              </button>
            )}
          </div>
        </div>
      )}

      {errors.form && diagnosticList.length === 0 && (
        <div className="inline-alert error" style={{ marginBottom: '16px' }}>
          <Icon name="alert" />
          <span>{errors.form}</span>
        </div>
      )}

      <div className="builder-split-layout">
        {/* LEFT COLUMN: STEP-WISE ACTIVITY INPUT FORM */}
        <section className="builder-form-panel">
          <div className="builder-panel-header">
            <div>
              <h2>Activity Input Form</h2>
              <span className="subtitle">Step {step} of 3</span>
            </div>
            <div>
              <button className="btn btn-secondary btn-sm" type="button" onClick={resetForm}>
                Reset Form
              </button>
            </div>
          </div>

          <div className="builder-form-body">
            <Stepper step={step} setStep={goToStep} />

            {/* STEP 1: ACTIVITY BASICS */}
            {step === 1 && (
              <div className="form-step-section">
                <div className="form-group form-full">
                  <label>Faculty Name</label>
                  <input
                    className="form-control"
                    type="text"
                    value={user?.name || 'Faculty Member'}
                    readOnly
                    disabled
                    style={{ backgroundColor: '#edf2f7', fontWeight: '600' }}
                  />
                </div>

                <div className="form-grid two-columns">
                  <div className="form-group form-full">
                    <label htmlFor="input-type">Activity / Event Type <Required /></label>
                    <select
                      id="input-type"
                      className="form-control"
                      value={form.typeName}
                      onChange={(e) => changeType(e.target.value)}
                    >
                      {catalog.typeGroups.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.types.map((type) => (
                            <option key={type.name} value={type.name}>
                              {type.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <FieldError message={errors.typeName} />
                  </div>

                  {selectedType?.eventBased && (
                    <div className="form-group">
                      <label htmlFor="input-mode">Mode of Participation <Required /></label>
                      <select
                        id="input-mode"
                        className="form-control"
                        value={form.mode}
                        onChange={(e) => setValue('mode', e.target.value)}
                      >
                        <option value="Offline">Offline</option>
                        <option value="Online">Online</option>
                        <option value="Hybrid">Hybrid</option>
                      </select>
                      <FieldError message={errors.mode} />
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="input-acad-year">Academic Year <Required /></label>
                    <select
                      id="input-acad-year"
                      className="form-control"
                      value={form.academicYear}
                      onChange={(e) => setValue('academicYear', e.target.value)}
                    >
                      {currentAcademicYears(10).map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <FieldError message={errors.academicYear} />
                  </div>

                  <div className="form-group form-full">
                    <label htmlFor="input-title">Description / Title of Activity <Required /></label>
                    <input
                      id="input-title"
                      className="form-control"
                      type="text"
                      value={form.title}
                      onChange={(e) => setValue('title', e.target.value)}
                      placeholder="e.g. Hands-on Workshop on Machine Learning & IoT"
                      required
                    />
                    <FieldError message={errors.title} />
                  </div>

                  <div className="form-group">
                    <label htmlFor="input-start-date">Start Date <Required /></label>
                    <input
                      id="input-start-date"
                      className="form-control"
                      type="date"
                      value={form.startDate}
                      onChange={(e) => changeStartDate(e.target.value)}
                      required
                    />
                    <FieldError message={errors.startDate} />
                  </div>

                  <div className="form-group">
                    <label htmlFor="input-end-date">End Date</label>
                    <input
                      id="input-end-date"
                      className="form-control"
                      type="date"
                      min={form.startDate || undefined}
                      value={form.endDate}
                      onChange={(e) => setValue('endDate', e.target.value)}
                    />
                    <FieldError message={errors.endDate} />
                  </div>

                  <div className="form-group">
                    <label htmlFor="input-start-time">Start Time</label>
                    <input
                      id="input-start-time"
                      className="form-control"
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setValue('startTime', e.target.value)}
                    />
                    <FieldError message={errors.startTime} />
                  </div>

                  <div className="form-group">
                    <label htmlFor="input-end-time">End Time</label>
                    <input
                      id="input-end-time"
                      className="form-control"
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setValue('endTime', e.target.value)}
                    />
                    <FieldError message={errors.endTime} />
                  </div>

                  {selectedType?.requiresHost && (
                    <div className="form-group form-full">
                      <label htmlFor="input-host">Host / Organising Body <Required /></label>
                      <input
                        id="input-host"
                        className="form-control"
                        type="text"
                        value={form.hostOrganisation}
                        onChange={(e) => setValue('hostOrganisation', e.target.value)}
                        placeholder="Institution, publisher, agency or professional body"
                      />
                      {Boolean(form.hostOrganisation && form.hostOrganisation.trim() && normalizeHost(form.hostOrganisation) !== form.hostOrganisation.trim()) && (
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#14284b', background: '#eff6ff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>Canonical suggestion:</span>
                          <button
                            type="button"
                            onClick={() => setValue('hostOrganisation', normalizeHost(form.hostOrganisation))}
                            style={{ background: 'none', border: 'none', color: '#1d4ed8', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                          >
                            {normalizeHost(form.hostOrganisation)}
                          </button>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>(Click to apply standard institute name)</span>
                        </div>
                      )}
                      <FieldError message={errors.hostOrganisation} />
                    </div>
                  )}

                  {selectedType?.eventBased && ['Offline', 'Hybrid'].includes(form.mode) && (
                    <div className="form-group">
                      <label htmlFor="input-venue">Venue / Location <Required /></label>
                      <input
                        id="input-venue"
                        className="form-control"
                        type="text"
                        value={form.venue}
                        onChange={(e) => setValue('venue', e.target.value)}
                        placeholder="Building, campus, city or hall"
                      />
                      <FieldError message={errors.venue} />
                    </div>
                  )}

                  {selectedType?.requiresScope && (
                    <div className="form-group">
                      <label htmlFor="input-scope">Scope / Level</label>
                      <select
                        id="input-scope"
                        className="form-control"
                        value={form.scope}
                        onChange={(e) => setValue('scope', e.target.value)}
                      >
                        {catalog.scopes.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="builder-form-actions">
                  <button className="btn btn-secondary" type="button" onClick={onCancel}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => goToStep(2)}>
                    Next: Details & Evidence <Icon name="arrowRight" size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: CATEGORY-SPECIFIC DETAILS & EVIDENCE */}
            {step === 2 && (
              <div className="form-step-section">
                <div className="form-group form-full">
                  <label htmlFor="activity-summary">Short Description <Required /></label>
                  <textarea
                    id="activity-summary"
                    className="form-control"
                    rows="3"
                    value={form.summary}
                    onChange={(e) => setValue('summary', e.target.value)}
                    placeholder="Brief description of work done and relevance"
                  />
                  <FieldError message={errors.summary} />
                </div>

                {/* Category-Specific Fields */}
                {selectedType?.fields && selectedType.fields.length > 0 && (
                  <>
                    <div className="builder-section-title">
                      <span>{selectedType.name} Specific Details</span>
                    </div>
                    <div className="form-grid two-columns">
                      {selectedType.fields.map((field) => (
                        <div className={`form-group ${field.type === 'textarea' ? 'form-full' : ''}`} key={field.name}>
                          <label htmlFor={`field-${field.name}`}>
                            {field.label} {field.required && <Required />}
                          </label>
                          {field.type === 'select' ? (
                            <select
                              id={`field-${field.name}`}
                              className="form-control"
                              value={form.details[field.name] || ''}
                              onChange={(e) => setDetail(field.name, e.target.value)}
                            >
                              <option value="">Select option</option>
                              {field.options?.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.type === 'textarea' ? (
                            <textarea
                              id={`field-${field.name}`}
                              className="form-control"
                              rows="2"
                              value={form.details[field.name] || ''}
                              onChange={(e) => setDetail(field.name, e.target.value)}
                              placeholder={field.placeholder || ''}
                            />
                          ) : (
                            <input
                              id={`field-${field.name}`}
                              className="form-control"
                              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                              value={form.details[field.name] || ''}
                              onChange={(e) => setDetail(field.name, e.target.value)}
                              placeholder={field.placeholder || ''}
                            />
                          )}
                          <FieldError message={errors[`details.${field.name}`]} />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Additional Event Details */}
                {selectedType?.eventBased && (
                  <div className="form-grid two-columns">
                    <div className="form-group">
                      <label htmlFor="input-collab">Collaboration / Professional Body</label>
                      <input
                        id="input-collab"
                        className="form-control"
                        type="text"
                        value={form.details.collabBody || ''}
                        onChange={(e) => setDetail('collabBody', e.target.value)}
                        placeholder="e.g. IEEE Pune Section / ACM / ISTE"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="input-participants">Number of Participants</label>
                      <input
                        id="input-participants"
                        className="form-control"
                        type="number"
                        min="0"
                        value={form.participantCount}
                        onChange={(e) => setValue('participantCount', e.target.value)}
                        placeholder="e.g. 45"
                      />
                    </div>
                  </div>
                )}

                {/* Funding info */}
                {selectedType?.supportsFunding && (
                  <div
                    className="form-group form-full"
                    id="form-group-funding"
                    style={{
                      background: errors['details.funded'] ? '#fef2f2' : '#f8fafc',
                      padding: '14px 16px',
                      borderRadius: '8px',
                      border: errors['details.funded'] ? '1.5px solid #ef4444' : '1px solid #e2e8f0',
                      transition: 'border-color 0.2s, background-color 0.2s'
                    }}
                  >
                    <label style={{ fontWeight: '700', color: '#1a365d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Registration Fees Funded / Financial Support? <Required />
                    </label>
                    <p style={{ margin: '3px 0 10px', fontSize: '12.5px', color: '#64748b' }}>
                      Did this activity receive financial support (e.g. registration fee reimbursement, TEQIP sponsorship, AICTE grant, college or club budget)?
                    </p>
                    <div style={{ display: 'flex', gap: '24px', marginTop: '6px', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: form.details.funded === 'Yes' ? '700' : '500', color: form.details.funded === 'Yes' ? '#1d4ed8' : '#334155' }}>
                        <input
                          id="radio-funded-yes"
                          type="radio"
                          name="funded"
                          value="Yes"
                          checked={form.details.funded === 'Yes'}
                          onChange={() => {
                            setDetail('funded', 'Yes');
                            setErrors((prev) => ({ ...prev, 'details.funded': undefined }));
                          }}
                        />
                        <span>Yes, Funding / Fee Support Involved</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: form.details.funded === 'No' ? '700' : '500', color: form.details.funded === 'No' ? '#15803d' : '#334155' }}>
                        <input
                          id="radio-funded-no"
                          type="radio"
                          name="funded"
                          value="No"
                          checked={form.details.funded === 'No' || !form.details.funded}
                          onChange={() => {
                            setForm((prev) => ({
                              ...prev,
                              details: {
                                ...prev.details,
                                funded: 'No',
                                fundingAgency: '',
                                fundingAmount: ''
                              }
                            }));
                            setErrors((prev) => ({
                              ...prev,
                              'details.funded': undefined,
                              'details.fundingAgency': undefined,
                              'details.fundingAmount': undefined
                            }));
                          }}
                        />
                        <span>No, Self-Funded / No Financial Support Involved</span>
                      </label>
                    </div>
                    <FieldError message={errors['details.funded']} />
                  </div>
                )}

                {selectedType?.supportsFunding && form.details.funded === 'Yes' && (
                  <div
                    className="form-grid two-columns"
                    id="form-grid-funding-details"
                    style={{
                      background: '#f0fdf4',
                      padding: '14px 16px',
                      borderRadius: '8px',
                      border: '1.5px solid #86efac',
                      marginTop: '6px'
                    }}
                  >
                    <div className="form-group">
                      <label htmlFor="input-fund-agency" style={{ fontWeight: '700', color: '#166534' }}>
                        Funding Agency / Sponsor <Required />
                      </label>
                      <input
                        id="input-fund-agency"
                        className="form-control"
                        type="text"
                        list="agency-suggestions"
                        value={form.details.fundingAgency || ''}
                        onChange={(e) => setDetail('fundingAgency', e.target.value)}
                        placeholder="Select or enter agency (e.g. TEQIP / AICTE / College / Club Budget)"
                      />
                      <datalist id="agency-suggestions">
                        <option value="TEQIP / College Institutional Support" />
                        <option value="AICTE" />
                        <option value="WCE Departmental Budget" />
                        <option value="Student Club / Chapter Budget" />
                        <option value="UGC" />
                        <option value="DST" />
                        <option value="ISTE" />
                        <option value="Industry Sponsored" />
                        <option value="Self-Funded / Reimbursed" />
                        <option value="Other" />
                      </datalist>
                      <small style={{ color: '#475569', fontSize: '11px', display: 'block', marginTop: '3px' }}>
                        Specify the body or scheme that provided registration fee or travel support.
                      </small>
                      <FieldError message={errors['details.fundingAgency']} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="input-fund-amt" style={{ fontWeight: '700', color: '#166534' }}>
                        Amount Funded (₹) <Required />
                      </label>
                      <input
                        id="input-fund-amt"
                        className="form-control"
                        type="number"
                        min="0"
                        step="any"
                        value={form.details.fundingAmount ?? ''}
                        onChange={(e) => setDetail('fundingAmount', e.target.value)}
                        placeholder="e.g. 5000 (enter 0 if waived / sponsored)"
                      />
                      <small style={{ color: '#475569', fontSize: '11px', display: 'block', marginTop: '3px' }}>
                        Enter amount in ₹. Enter 0 if the registration fee was completely waived or free.
                      </small>
                      <FieldError message={errors['details.fundingAmount']} />
                    </div>
                  </div>
                )}

                {/* Guest / Resource Persons */}
                {selectedType?.supportsGuests && (
                  <div className="form-group form-full" id="form-group-guests">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ margin: 0 }}>Guest Speakers / Resource Persons</label>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={addGuest}>
                        <Icon name="plus" size={14} /> Add Guest
                      </button>
                    </div>
                    {form.guests.map((guest, index) => (
                      <div key={index} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', marginBottom: '8px', background: '#fafbfd' }}>
                        <div className="form-grid two-columns">
                          <div className="form-group">
                            <label>Guest Name <Required /></label>
                            <input className="form-control" type="text" value={guest.name} onChange={(e) => updateGuest(index, 'name', e.target.value)} placeholder="Dr. Jane Doe" />
                            <FieldError message={errors[`guest.${index}.name`]} />
                          </div>
                          <div className="form-group">
                            <label>Designation</label>
                            <input className="form-control" type="text" value={guest.designation || ''} onChange={(e) => updateGuest(index, 'designation', e.target.value)} placeholder="Professor, IIT Bombay" />
                          </div>
                          <div className="form-group">
                            <label>Organisation <Required /></label>
                            <input className="form-control" type="text" value={guest.organisation} onChange={(e) => updateGuest(index, 'organisation', e.target.value)} placeholder="IIT Bombay / Microsoft" />
                            <FieldError message={errors[`guest.${index}.organisation`]} />
                          </div>
                          <div className="form-group">
                            <label>Role in Event</label>
                            <input className="form-control" type="text" value={guest.guestRole || ''} onChange={(e) => updateGuest(index, 'guestRole', e.target.value)} placeholder="e.g. Keynote Speaker" />
                          </div>
                        </div>
                        <button className="text-button danger" type="button" onClick={() => removeGuest(index)} style={{ fontSize: '11px', marginTop: '4px' }}>
                          Remove Guest
                        </button>
                      </div>
                    ))}
                    <FieldError message={errors.guests} />
                  </div>
                )}

                <div className="form-group form-full">
                  <label htmlFor="input-outcomes">Outcomes / Academic Takeaways</label>
                  <textarea
                    id="input-outcomes"
                    className="form-control"
                    rows="2"
                    value={form.outcomes}
                    onChange={(e) => setValue('outcomes', e.target.value)}
                    placeholder="Key takeaways, skills acquired, or syllabus enhancements"
                  />
                </div>

                {/* Document & Evidence Uploads */}
                <div className="builder-section-title">
                  <span>Evidence & Media Files</span>
                </div>

                <div className="form-grid two-columns">
                  <div className="form-group">
                    <label htmlFor="upload-attendance">
                      Attendance List <small>(PDF, Word, Excel, CSV, Image)</small>
                    </label>
                    <input
                      id="upload-attendance"
                      className="form-control"
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                      onChange={(e) => { handleFileUpload('attendance', e.target.files); e.target.value = ''; }}
                    />
                    {liveAttendance && (
                      <div style={{ marginTop: '4px' }}>
                        <a href={attendanceUrl} target="_blank" rel="noreferrer" className="file-attached-tag">
                          <Icon name="check" size={13} /> {liveAttendance.fileName || liveAttendance.file?.name}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="upload-proof">
                      Certificate / Proof Document <Required /> <small>(PDF, Word, Image – Mandatory)</small>
                    </label>
                    <input
                      id="upload-proof"
                      className="form-control"
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => { handleFileUpload('evidence', e.target.files); e.target.value = ''; }}
                    />
                    {liveProof && (
                      <div style={{ marginTop: '4px' }}>
                        <a href={proofUrl} target="_blank" rel="noreferrer" className="file-attached-tag">
                          <Icon name="check" size={13} /> {liveProof.fileName || liveProof.file?.name}
                        </a>
                      </div>
                    )}
                    <FieldError message={errors.evidence} />
                  </div>

                  <div className="form-group form-full">
                    <label htmlFor="upload-photo">
                      Photo(s) of Event <small>(Optional – Multiple JPG, PNG, WebP allowed, up to 100 photos)</small>
                    </label>
                    <input
                      id="upload-photo"
                      className="form-control"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => { handleFileUpload('image', e.target.files); e.target.value = ''; }}
                    />
                    {allImages.length > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#276749', fontWeight: '700', marginBottom: '6px' }}>
                          ✓ {allImages.length} photo(s) attached
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {allImages.map((img, idx) => (
                            <div key={idx} style={{ position: 'relative', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '2px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                              <img
                                src={img.url}
                                alt={img.name}
                                title={img.name}
                                style={{ width: '68px', height: '60px', objectFit: 'cover', borderRadius: '3px', cursor: 'pointer', display: 'block' }}
                                onClick={() => { setActiveImageIndex(idx); setGalleryModalOpen(true); }}
                              />
                              <button
                                type="button"
                                title={img.isPrimary ? 'Primary report photo (shown beside activity details)' : 'Click to make this the primary report photo'}
                                onClick={() => setPrimaryAttachment(img)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '2px 0',
                                  fontSize: '9.5px',
                                  fontWeight: 700,
                                  border: 'none',
                                  borderRadius: '2px',
                                  marginTop: '2px',
                                  cursor: 'pointer',
                                  background: img.isPrimary ? '#b7791f' : '#f1f5f9',
                                  color: img.isPrimary ? '#fff' : '#475569',
                                  textAlign: 'center'
                                }}
                              >
                                {img.isPrimary ? '★ Primary' : 'Set Primary'}
                              </button>
                              {/* Remove button */}
                              <button
                                type="button"
                                title="Remove this photo"
                                onClick={() => {
                                  if (img.isExisting) {
                                    toggleExistingAttachment(img.id);
                                  } else {
                                    removeNewFile(img.key);
                                  }
                                }}
                                style={{
                                  position: 'absolute', top: '-6px', right: '-6px',
                                  width: '18px', height: '18px',
                                  borderRadius: '50%', border: 'none',
                                  background: '#e53e3e', color: '#fff',
                                  fontSize: '11px', lineHeight: '18px', textAlign: 'center',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)', fontWeight: '700', padding: 0
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="builder-form-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => setStep(1)}>
                    <Icon name="arrowLeft" size={15} /> Back
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => goToStep(3)}>
                    Next: Review & Submit <Icon name="arrowRight" size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: REVIEW & SUBMIT */}
            {step === 3 && (
              <div className="form-step-section">
                <div className="builder-section-title">
                  <span>Review Activity Submission</span>
                </div>
                <div style={{ backgroundColor: '#fafbfd', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '16px', fontSize: '13px' }}>
                  <p style={{ margin: '0 0 6px' }}><strong>Activity:</strong> {form.title || 'Untitled'}</p>
                  <p style={{ margin: '0 0 6px' }}><strong>Category:</strong> {form.typeName}</p>
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>Duration:</strong> {formatDateDMY(form.startDate)} to {formatDateDMY(form.endDate || form.startDate)}
                    {form.startTime || form.endTime ? ` (${form.startTime || '--:--'} to ${form.endTime || '--:--'})` : ''}
                  </p>
                  <p style={{ margin: '0 0 6px' }}><strong>Academic Year:</strong> {form.academicYear}</p>
                  {selectedType?.supportsFunding && (
                    <p style={{ margin: '0 0 6px' }}>
                      <strong>Fee Funding / Support:</strong>{' '}
                      {form.details.funded === 'Yes' ? (
                        <span style={{ color: '#15803d', fontWeight: '700' }}>
                          ✓ Fee Funded ({form.details.fundingAgency || 'Agency not specified'} · ₹{form.details.fundingAmount ?? '0'})
                        </span>
                      ) : (
                        <span style={{ color: '#475569', fontWeight: '500' }}>
                          No Financial Support Involved (Self-Funded)
                        </span>
                      )}
                    </p>
                  )}
                  <p style={{ margin: 0 }}><strong>Evidence Files:</strong> {form.newAttachments.length + form.existingAttachments.length} attached ({allImages.length} photo(s))</p>
                </div>

                {/* Pre-submission readiness assessment */}
                <div style={{
                  background: (form.title?.trim() && form.startDate && (!selectedType?.supportsFunding || (form.details.funded === 'No' || (form.details.funded === 'Yes' && form.details.fundingAgency && form.details.fundingAmount !== ''))) && hasProof) ? '#f0fdf4' : '#fffbeb',
                  border: (form.title?.trim() && form.startDate && (!selectedType?.supportsFunding || (form.details.funded === 'No' || (form.details.funded === 'Yes' && form.details.fundingAgency && form.details.fundingAmount !== ''))) && hasProof) ? '1px solid #86efac' : '1px solid #fde047',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  fontSize: '12.5px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700', color: (form.title?.trim() && form.startDate && (!selectedType?.supportsFunding || (form.details.funded === 'No' || (form.details.funded === 'Yes' && form.details.fundingAgency && form.details.fundingAmount !== ''))) && hasProof) ? '#166534' : '#854d0e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {(form.title?.trim() && form.startDate && (!selectedType?.supportsFunding || (form.details.funded === 'No' || (form.details.funded === 'Yes' && form.details.fundingAgency && form.details.fundingAmount !== ''))) && hasProof) ? '✓ Submission Verification: Ready' : '⚠️ Submission Verification: Attention Needed'}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: (form.title?.trim() && form.startDate && (!selectedType?.supportsFunding || (form.details.funded === 'No' || (form.details.funded === 'Yes' && form.details.fundingAgency && form.details.fundingAmount !== ''))) && hasProof) ? '#15803d' : '#a16207' }}>
                      {(form.title?.trim() && form.startDate && (!selectedType?.supportsFunding || (form.details.funded === 'No' || (form.details.funded === 'Yes' && form.details.fundingAgency && form.details.fundingAmount !== ''))) && hasProof) ? 'All Criteria Met' : 'Check Incomplete Items Below'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: form.title?.trim() ? '#166534' : '#dc2626', fontWeight: '600' }}>
                      <span>{form.title?.trim() ? '✓' : '✗'}</span> Title & Category
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: form.startDate ? '#166534' : '#dc2626', fontWeight: '600' }}>
                      <span>{form.startDate ? '✓' : '✗'}</span> Dates & Academic Year
                    </div>
                    {selectedType?.supportsFunding && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: (form.details.funded === 'No' || (form.details.funded === 'Yes' && form.details.fundingAgency && form.details.fundingAmount !== '')) ? '#166534' : '#dc2626', fontWeight: '600' }}>
                        <span>{(form.details.funded === 'No' || (form.details.funded === 'Yes' && form.details.fundingAgency && form.details.fundingAmount !== '')) ? '✓' : '✗'}</span>
                        Funding: {form.details.funded === 'Yes' ? 'Fee Funded' : 'No Support (Self-Funded)'}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasProof ? '#166534' : '#dc2626', fontWeight: '600' }}>
                      <span>{hasProof ? '✓' : '✗'}</span> Evidence / Proof Document
                    </div>
                  </div>
                </div>

                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '16px', fontSize: '12px' }}>
                  <input
                    type="checkbox"
                    checked={declaration}
                    onChange={(e) => setDeclaration(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <span>
                    {user?.role === 'Club'
                      ? 'I confirm that the information provided is accurate and authentic for student club / chapter records compilation.'
                      : 'I confirm that the information provided is accurate and authentic for faculty record compilation.'}
                  </span>
                </label>

                <div className="builder-form-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => setStep(2)}>
                    <Icon name="arrowLeft" size={15} /> Back
                  </button>
                  <button className="btn btn-primary" type="button" disabled={submitting || !declaration} onClick={(e) => handleSubmit(e, 'Submitted')}>
                    {submitting ? <span className="button-spinner" /> : <Icon name="check" size={17} />}
                    {submitting ? 'Submitting…' : initialActivity ? 'Update Activity' : 'Save & Submit Activity'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: LIVE DOCUMENT PREVIEW */}
        <section className="builder-preview-panel">
          <div className="builder-panel-header">
            <div>
              <h2>Live Document Preview</h2>
              <span className="subtitle">Real-time structured official report</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="zoom-select" style={{ fontSize: '12px', fontWeight: '600', color: 'var(--navy-900)' }}>Zoom:</label>
              <select
                id="zoom-select"
                className="form-control"
                style={{ padding: '4px 8px', fontSize: '12px', width: '80px' }}
                value={zoomLevel}
                onChange={(e) => setZoomLevel(e.target.value)}
              >
                <option value="100">100%</option>
                <option value="85">85%</option>
                <option value="75">75%</option>
                <option value="Fit">Fit</option>
              </select>
            </div>
          </div>

          <div className="live-preview-viewport">
            <div
              className="live-preview-scaling-box"
              style={{
                transform: `scale(${zoomScale})`,
                transformOrigin: 'top center',
                transition: 'transform 0.2s ease'
              }}
            >
              {/* Structured Official Report Container */}
              <div
                ref={liveSheetRef}
                id="live-preview-sheet"
                style={{
                  backgroundColor: '#ffffff',
                  border: '2px solid #1a365d',
                  borderRadius: '6px',
                  padding: '28px',
                  width: '680px',
                  margin: '0 auto',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                  fontFamily: '"Segoe UI", Inter, system-ui, sans-serif'
                }}
              >
                {/* Top Date Badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '11px', fontWeight: 'bold', color: '#1a365d' }}>
                  <div style={{ border: '1.5px solid #1a365d', padding: '4px 10px', borderRadius: '4px', background: '#f0f4f8' }}>
                    From: <span>{formatDateDMY(form.startDate)}{form.startTime ? ` (${form.startTime})` : ''}</span>
                  </div>
                  <div style={{ border: '1.5px solid #1a365d', padding: '4px 10px', borderRadius: '4px', background: '#f0f4f8' }}>
                    To: <span>{formatDateDMY(form.endDate || form.startDate)}{form.endTime ? ` (${form.endTime})` : ''}</span>
                  </div>
                </div>

                {/* Header with WCE Crest Emblem */}
                <div style={{ textAlign: 'center', borderBottom: '2px double #1a365d', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <img src="/wce-logo.png" alt="WCE Emblem" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                    <div style={{ textAlign: 'left' }}>
                      <h2 style={{ fontFamily: 'Georgia, serif', color: '#1a365d', fontSize: '18px', fontWeight: 'bold', margin: 0 }}>
                        WALCHAND COLLEGE OF ENGINEERING, SANGLI
                      </h2>
                      <p style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '2px 0 0', fontWeight: '600' }}>
                        Faculty Activities & Contribution Portal • {form.department || user?.department || 'Department of Computer Science & Engineering'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dynamic Report Title */}
                <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                  <div style={{ display: 'inline-block', position: 'relative' }}>
                    <h3 style={{ fontSize: '14px', color: '#1a365d', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0, fontWeight: '700', paddingBottom: '6px' }}>
                      {form.typeName || 'FACULTY ACTIVITY'} CONTRIBUTION REPORT
                    </h3>
                    <div style={{ width: '100%', height: '2.5px', backgroundColor: '#b7791f', borderRadius: '2px' }}></div>
                  </div>
                </div>

                {/* Upper General Details Box (Blue Border) */}
                <div style={{ border: '1.5px solid #1a365d', borderRadius: '6px', padding: '12px', marginBottom: '14px', backgroundColor: '#fafbfd' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1a365d', width: '32%' }}>Faculty Name:</td>
                        <td style={{ padding: '6px 8px', color: '#172033', fontWeight: '600' }}>{user?.name || 'Faculty Member'}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1a365d' }}>Academic Year:</td>
                        <td style={{ padding: '6px 8px', color: '#172033' }}>{form.academicYear || '2025-26'}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1a365d' }}>Description of Activity:</td>
                        <td style={{ padding: '6px 8px', color: '#24507f', fontWeight: '600' }}>{form.title || 'Activity Description'}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1a365d' }}>Date Duration:</td>
                        <td style={{ padding: '6px 8px', color: '#172033' }}>
                          {form.startDate ? `${formatDateDMY(form.startDate)} to ${formatDateDMY(form.endDate || form.startDate)}` : 'DD-MM-YYYY to DD-MM-YYYY'}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1a365d' }}>Event Timing:</td>
                        <td style={{ padding: '6px 8px', color: '#172033' }}>
                          {form.startTime || form.endTime ? (
                            <span style={{ fontWeight: '600' }}>
                              {form.startTime && form.endTime
                                ? `${form.startTime} to ${form.endTime}`
                                : (form.startTime ? `From ${form.startTime}` : `Until ${form.endTime}`)}
                            </span>
                          ) : (
                            <span style={{ color: '#718096', fontStyle: 'italic' }}>Not Specified</span>
                          )}
                        </td>
                      </tr>
                      {selectedType?.eventBased && (
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1a365d' }}>Mode of Participation:</td>
                          <td style={{ padding: '6px 8px', color: '#172033' }}>{form.mode || 'Offline'}</td>
                        </tr>
                      )}
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1a365d' }}>Role / Capacity:</td>
                        <td style={{ padding: '6px 8px', color: '#172033' }}>{form.facultyRole || selectedType?.defaultRole || 'Participant / Attendee'}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1a365d' }}>Attendance List:</td>
                        <td style={{ padding: '6px 8px', color: '#172033' }}>
                          {liveAttendance ? (
                            <a
                              href={attendanceUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#176b47', fontWeight: '600', textDecoration: 'underline' }}
                            >
                              ✓ {liveAttendance.fileName || liveAttendance.file?.name} (Click to View)
                            </a>
                          ) : (
                            <span style={{ color: '#718096', fontStyle: 'italic' }}>Not Provided</span>
                          )}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1a365d' }}>Certificate / Proof:</td>
                        <td style={{ padding: '6px 8px', color: '#172033' }}>
                          {liveProof ? (
                            <a
                              href={proofUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#1e5d91', fontWeight: '600', textDecoration: 'underline' }}
                            >
                              ✓ {liveProof.fileName || liveProof.file?.name} (Click to View)
                            </a>
                          ) : (
                            <span style={{ color: '#718096', fontStyle: 'italic' }}>Not Provided</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#1a365d' }}>Photos of Event:</td>
                        <td style={{ padding: '6px 8px', color: '#172033' }}>
                          {allImages.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => { setActiveImageIndex(0); setGalleryModalOpen(true); }}
                              style={{ background: 'none', border: 'none', padding: 0, color: '#b7791f', fontWeight: '600', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px' }}
                            >
                              ✓ {allImages.length} Photo(s) Attached (Click to View Gallery)
                            </button>
                          ) : (
                            <span style={{ color: '#718096', fontStyle: 'italic' }}>Not Provided</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Lower Section (Side-by-Side: Specific Contribution Data + Previews Column) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '14px' }}>
                  {/* Left Column: Specific Contribution Data */}
                  <div style={{ border: '1.5px solid #24507f', borderRadius: '6px', padding: '10px', backgroundColor: '#ffffff' }}>
                    <div style={{ fontWeight: '700', color: '#1a365d', fontSize: '11px', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '4px', marginBottom: '8px', textTransform: 'uppercase' }}>
                      Specific Contribution Data
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #edf2f7' }}>
                          <td style={{ padding: '5px 6px', fontWeight: '600', color: '#24507f', width: '42%' }}>Activity Name:</td>
                          <td style={{ padding: '5px 6px', color: '#2d3748' }}>{form.title || 'Activity Title'}</td>
                        </tr>
                        {form.hostOrganisation && (
                          <tr style={{ borderBottom: '1px solid #edf2f7' }}>
                            <td style={{ padding: '5px 6px', fontWeight: '600', color: '#24507f' }}>Host / Body:</td>
                            <td style={{ padding: '5px 6px', color: '#2d3748' }}>{form.hostOrganisation}</td>
                          </tr>
                        )}
                        {form.venue && (
                          <tr style={{ borderBottom: '1px solid #edf2f7' }}>
                            <td style={{ padding: '5px 6px', fontWeight: '600', color: '#24507f' }}>Venue:</td>
                            <td style={{ padding: '5px 6px', color: '#2d3748' }}>{form.venue}</td>
                          </tr>
                        )}
                        {form.scope && (
                          <tr style={{ borderBottom: '1px solid #edf2f7' }}>
                            <td style={{ padding: '5px 6px', fontWeight: '600', color: '#24507f' }}>Scope / Level:</td>
                            <td style={{ padding: '5px 6px', color: '#2d3748' }}>{form.scope}</td>
                          </tr>
                        )}
                        {form.participantCount !== '' && (
                          <tr style={{ borderBottom: '1px solid #edf2f7' }}>
                            <td style={{ padding: '5px 6px', fontWeight: '600', color: '#24507f' }}>Participants:</td>
                            <td style={{ padding: '5px 6px', color: '#2d3748' }}>{form.participantCount}</td>
                          </tr>
                        )}
                        {detailEntries.map(([key, val]) => (
                          <tr key={key} style={{ borderBottom: '1px solid #edf2f7' }}>
                            <td style={{ padding: '5px 6px', fontWeight: '600', color: '#24507f' }}>{humanize(key)}:</td>
                            <td style={{ padding: '5px 6px', color: '#2d3748' }}>
                              {typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}
                            </td>
                          </tr>
                        ))}
                        {form.outcomes && (
                          <tr>
                            <td style={{ padding: '5px 6px', fontWeight: '600', color: '#24507f' }}>Outcomes:</td>
                            <td style={{ padding: '5px 6px', color: '#2d3748' }}>{form.outcomes}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Right Column: Previews with Live Generated Links */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Attendance Preview Box */}
                    <div style={{ border: '1.5px solid #176b47', borderRadius: '6px', padding: '8px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '90px', justifyContent: 'center' }}>
                      <div style={{ fontWeight: '700', color: '#176b47', fontSize: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '6px', textTransform: 'uppercase', width: '100%', textAlign: 'center' }}>
                        Attendance List Preview
                      </div>
                      {liveAttendance ? (
                        <div style={{ textAlign: 'center', width: '100%' }}>
                          <div style={{ fontSize: '20px', marginBottom: '2px' }}>📋</div>
                          <div style={{ fontSize: '10px', fontWeight: '600', color: '#172033' }}>{liveAttendance.fileName || liveAttendance.file?.name}</div>
                          <a
                            href={attendanceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '10px', padding: '2px 8px', marginTop: '4px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Icon name="eye" size={11} /> View Document
                          </a>
                        </div>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#718096', fontStyle: 'italic' }}>Not Provided</span>
                      )}
                    </div>

                    {/* Certificate / Proof Preview Box */}
                    <div style={{ border: '1.5px solid #a63232', borderRadius: '6px', padding: '8px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '90px', justifyContent: 'center' }}>
                      <div style={{ fontWeight: '700', color: '#a63232', fontSize: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '6px', textTransform: 'uppercase', width: '100%', textAlign: 'center' }}>
                        Certificate / Proof Preview
                      </div>
                      {liveProof ? (
                        <div style={{ textAlign: 'center', width: '100%' }}>
                          <div style={{ fontSize: '20px', marginBottom: '2px' }}>📕</div>
                          <div style={{ fontSize: '10px', fontWeight: '600', color: '#172033' }}>{liveProof.fileName || liveProof.file?.name}</div>
                          <a
                            href={proofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '10px', padding: '2px 8px', marginTop: '4px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Icon name="eye" size={11} /> View Certificate
                          </a>
                        </div>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#718096', fontStyle: 'italic' }}>Not Provided</span>
                      )}
                    </div>

                    {/* Photo of Event Preview Box */}
                    <div style={{ border: '1.5px solid #b7791f', borderRadius: '6px', padding: '8px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '90px', justifyContent: 'center' }}>
                      <div style={{ fontWeight: '700', color: '#b7791f', fontSize: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '6px', textTransform: 'uppercase', width: '100%', textAlign: 'center' }}>
                        Photos Preview ({allImages.length})
                      </div>
                      {allImages.length > 0 ? (
                        <div style={{ textAlign: 'center', width: '100%' }}>
                          <img
                            src={allImages[0].url}
                            alt="Event Thumbnail"
                            style={{ maxWidth: '100%', maxHeight: '70px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                            onClick={() => { setActiveImageIndex(0); setGalleryModalOpen(true); }}
                          />
                          <div style={{ fontSize: '9px', marginTop: '2px', fontWeight: '600', color: '#172033' }}>
                            {allImages.length === 1 ? allImages[0].name : `${allImages.length} images attached`}
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => { setActiveImageIndex(0); setGalleryModalOpen(true); }}
                            style={{ fontSize: '10px', padding: '2px 8px', marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Icon name="eye" size={11} /> View Gallery ({allImages.length})
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#718096', fontStyle: 'italic' }}>Not Provided</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="builder-preview-footer">
            <button
              className="btn btn-primary btn-block"
              type="button"
              disabled={pdfGenerating}
              onClick={handleDownloadLivePdf}
              style={{ backgroundColor: '#b7791f', borderColor: '#b7791f', cursor: pdfGenerating ? 'wait' : 'pointer' }}
            >
              {pdfGenerating ? <span className="button-spinner" /> : <Icon name="download" size={17} />}
              {pdfGenerating ? 'Generating PDF…' : 'Download PDF Report'}
            </button>
          </div>
        </section>
      </div>

      {/* POPUP MODAL: IMAGE GALLERY FOR MULTIPLE UPLOADED PHOTOS */}
      {galleryModalOpen && allImages.length > 0 && (
        <div
          className="modal-backdrop"
          onClick={() => setGalleryModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            className="gallery-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}
          >
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <strong style={{ fontSize: '14px', color: '#1a365d' }}>
                Activity Photos Gallery ({activeImageIndex + 1} of {allImages.length})
              </strong>
              <button className="text-button" type="button" onClick={() => setGalleryModalOpen(false)}>
                ✕ Close
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', minHeight: '340px' }}>
              <img
                src={allImages[activeImageIndex].url}
                alt={allImages[activeImageIndex].name}
                style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '6px' }}
              />
              <div style={{ marginTop: '10px', color: '#e2e8f0', fontSize: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span>{allImages[activeImageIndex].name}</span>
              </div>
            </div>

            {allImages.length > 1 && (
              <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={activeImageIndex === 0}
                  onClick={() => setActiveImageIndex((curr) => Math.max(0, curr - 1))}
                >
                  <Icon name="arrowLeft" size={14} /> Previous
                </button>
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', maxWidth: '400px' }}>
                  {allImages.map((img, idx) => (
                    <img
                      key={idx}
                      src={img.url}
                      alt={img.name}
                      style={{
                        width: '40px',
                        height: '40px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: idx === activeImageIndex ? '2px solid #b7791f' : '1px solid #cbd5e1'
                      }}
                      onClick={() => setActiveImageIndex(idx)}
                    />
                  ))}
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={activeImageIndex === allImages.length - 1}
                  onClick={() => setActiveImageIndex((curr) => Math.min(allImages.length - 1, curr + 1))}
                >
                  Next <Icon name="arrowRight" size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SubmitActivity;
