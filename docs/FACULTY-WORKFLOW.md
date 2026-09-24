# Faculty workflow and data rules

This document is the functional reference for Prof-Insights. It keeps the product focused on faculty activity records and prevents duplicate categories, irrelevant mandatory fields, and ambiguous reviewer decisions.

## Roles and boundaries

| Role | Scope | Main actions |
|---|---|---|
| Faculty | Own records | Create draft, submit, view, edit eligible records, recall a submitted record, archive an erroneous own record, download evidence and own reports |
| HOD | Own department | Faculty actions plus review department submissions, approve, or request changes with a reason; cannot approve their own record |
| Admin | All departments | Provision users, review across departments, generate institutional reports, and archive a record with a reason |

A guest, resource person, student attendee, or industry contact is record data—not a portal account. Attendance evidence is visible only to an authorised owner/reviewer and must not be exposed through a public URL.

## One activity, one clear classification

Activity type answers **what happened**. Faculty involvement answers **what the faculty member did**. Keep those values separate. A single event can therefore be recorded as `Seminar` with `Organizer / Coordinator`, or as `Webinar` with `Participant / Attendee`, without duplicating category names.

The catalogue groups, but does not merge, FDP, Workshop, Seminar, Webinar, Conference, Training/Certification, Guest Lecture, and Industrial Visit. Research, teaching, industry, outreach, service, MoU, and other categories have their own conditional fields.

Use `Other` only when no defined category applies, and require a short type description. Catalogue changes should be governed centrally so spelling variations do not fragment reports.

## Submission rules

The following are required for a submitted record:

- Valid activity type and a meaningful title
- Department taken from the authenticated faculty profile; it is not freely editable in the activity form
- Faculty involvement/role and academic year
- Valid start date; an end date cannot precede it
- Activity status and a short description
- Mode for event-based activities
- Scope when that activity type requires a level
- Host/organising institution when relevant
- Venue for offline or hybrid events
- Type-specific required details shown by the form

Participant count is required only for a completed, attendance-supporting activity when the faculty role is an organiser. Funding agency and amount appear only when the faculty member answers that funding or fee support was involved. Guest name and organisation are required only for an organised Guest Lecture.

Drafts may be incomplete. The server applies full validation only when a record is submitted.

## Evidence policy

For a completed activity, faculty choose one evidence state:

- `Available now`: upload at least one accepted file or provide an official HTTP(S) URL.
- `Not issued`: explain the absence when useful; a certificate is not invented or made mandatory.
- `Will upload later`: submit the record, then add evidence when it becomes available and before final verification where departmental policy requires it.

Evidence may include an invitation/order, participation or appreciation certificate, brochure, report, official result/DOI page, sanction letter, publication first page, or other category-appropriate proof. Event photographs are supplementary and do not automatically prove participation.

Limits per activity are 15 attachments in total, 8 images, 10 MB per file, and 35 MB combined. File type and content access are server-controlled. Give each image a useful caption when context is not obvious.

Attendance files should contain only the minimum necessary student data. Prefer a signed PDF; avoid unnecessary phone numbers, personal email addresses, or identification numbers. Download access must remain authenticated and auditable.

## Status lifecycle

```text
Draft → Submitted → Approved → Archived
           │
           └→ Changes Requested → Submitted
```

- `Draft`: visible to the owner and editable.
- `Submitted`: locked for review; the owner may recall it before a decision.
- `Changes Requested`: reviewer comment is mandatory; owner edits and resubmits.
- `Approved`: immutable in the ordinary faculty workflow and included in reports by default.
- `Archived`: hidden from normal lists but retained with its audit history.

Deletion is a soft archive, never a bulk deletion of all pending records. Every review or archival decision records actor, time, transition, and comment. Approved changes should be handled through an explicit return/correction process rather than silent editing.

## Faculty operating sequence

1. Sign in and confirm name, designation, and department in Profile.
2. Choose New Activity, then select the exact activity type and faculty role.
3. Complete only the relevant conditional fields, dates, scope, guests, funding, and participant information.
4. Add optional images, evidence, report, attendance PDF, or official URL.
5. Save a draft or review and submit. Resolve a possible-duplicate warning instead of creating the same event twice.
6. Track the status in My Records. Open a record to view attachments and the audit timeline.
7. If changes are requested, read the reviewer comment, edit, and resubmit.
8. Download an annual or combined-period PDF, DOCX, or CSV report from Reports.

## Reviewer operating sequence

1. Filter the review queue by academic year, faculty, type, or status.
2. Open the complete record; verify dates, role, department, conditional data, and evidence.
3. Compare suspected duplicates and confirm attachments are relevant and readable.
4. Approve only a complete and credible submission, or request changes with a specific, actionable comment.
5. Do not approve your own record. Do not download or redistribute attendance lists without an academic need.
6. Generate approved-only reports for official use; include non-approved states only for internal follow-up.

## Report interpretation

Annual reports use the selected academic year. Combined reports use an explicit date range and list records chronologically with type, title, role, dates, scope, status, and evidence index. PDF is intended for fixed review/submission, DOCX for authorised editing, and CSV for controlled analysis.

An empty report is not proof that activities were lost. First check the selected faculty, date/academic-year filters, workflow status, role scope, and API health. The previous blank-record symptom was caused by a stale frontend/API path and oversized binary history responses; record lists must return metadata only and stream attachments through protected endpoints.

## Release acceptance checklist

- No student login/profile/internship module is present.
- No combined or duplicate activity category is visible.
- Department is derived from the authenticated account.
- Certificate upload is not universally mandatory.
- All conditional requirements behave correctly for Planned/Ongoing/Completed activities.
- Multiple images and attendance/evidence downloads preserve access controls.
- Owner edit, recall, and archive actions affect exactly one activity.
- HOD access is department-scoped and self-approval is blocked.
- PDF, DOCX, and CSV reports are ordered correctly and exclude unapproved records by default.
- Sign-out clears the session; expired sessions return the user to sign-in with an understandable message.

