# Synopsis revision guide

Source reviewed: `BT5_B30_ProfInsights synopsis.pdf`, 21 pages, AY 2026–27. The current document describes a faculty-and-student platform, while the implemented and requested product is faculty-only. Revise the synopsis before submission so scope, diagrams, schedule, deliverables, and technology claims all describe the same system.

## Required document-wide corrections

1. Replace every `Faculty and Student Activity Management` claim with `Faculty Activity Evidence, Review and Reporting Portal` or equivalent faculty-only wording.
2. Remove student login, student profile, internship, placement, certification, project, class-level reporting, and student-module claims. Student names may appear only as attendees inside a faculty-owned event record.
3. Use the actors `Faculty Contributor`, `HOD / Faculty Reviewer`, and `System Administrator`. An optional `Accreditation / IQAC Viewer` may be a read-only future actor. A guest/resource person is data, not a user role.
4. Use the exact workflow `Draft → Submitted → Changes Requested / Approved → Archived`. Replace `Pending`, `Reject`, and permanent delete language unless explicitly shown as legacy terminology.
5. State that approved records are included in official reports by default. List PDF, DOCX, and CSV consistently throughout.
6. Describe conditional evidence: certificate/proof is not universally mandatory; `Not issued` and `Will upload later` are valid documented cases.
7. State that department comes from the authenticated faculty profile, and that HOD review is department-scoped.
8. Correct every section, table, and figure number. The table of contents says Customer Connect is section 4, but page 6 labels it section 3; all following headings and captions are shifted.
9. Use one product spelling—`Prof-Insights` or `ProfInsights`—and one institute/department naming style throughout.
10. Label planned work as planned and implemented work as implemented. Remove technologies that are not used in the final build.

## Page-by-page revision matrix

| PDF page | Current issue | Required revision |
|---|---|---|
| 1 | Cover is broadly suitable but product spelling and academic formatting are inconsistent elsewhere. | Confirm official course code, names/PRNs, guide/HOD titles, `AY 2026–27`, semester, and use the chosen product spelling everywhere. |
| 2 | TOC numbering does not match body headings from Customer Connect onward. | Regenerate the TOC after final pagination; include numbered subsections 9.1/9.2 and 10.1–10.5 only if they remain. |
| 3 | Problem Statement includes student records and separate student login. | Focus on fragmented faculty FDP, workshop, seminar, webinar, guest lecture, publication, grant, patent, consultancy, course, outreach, service, and MoU records. Explain duplicate entry, missing evidence, inconsistent formats, slow verification, and annual-report effort. |
| 4 | Abstract promises student modules, class reports, Chart.js, and only PDF/CSV. | Describe the faculty-only system, conditional forms, multiple attachments, protected attendance, department review, audit trail, and PDF/DOCX/CSV reports. Name only the final React/Express/PostgreSQL/JWT/Docker stack. |
| 5 | Problem Domain again says faculty and student management. | Define the domain as faculty activity information management, evidence governance, workflow, and institutional reporting. State boundaries: no LMS, payroll, student profile, placement, or full ERP. |
| 6 | Heading is incorrectly `3. Customer Connect`; Students are a primary user. | Rename to `4. Customer Connect`. Replace the table with Faculty, HOD/Reviewer, System Admin, and Accreditation/IQAC reporting stakeholder. Describe how faculty/guide feedback validated conditional evidence, activity categories, and reports. |
| 7 | Heading should be 5; SDG 8 rationale depends on the removed student employability module. | Retain SDG 4 (quality and evidence-based academic development), SDG 9 (institutional digital infrastructure), and SDG 16 (traceable governance) with restrained, measurable claims. Remove SDG 8 unless a direct faculty-development justification is approved by the guide. |
| 8 | Objectives are faculty-and-student and too broad. | Number 5–7 testable objectives: secure faculty access, structured conditional capture, evidence/attendance management, department-scoped review, auditability, chronological PDF/DOCX/CSV reports, and reproducible deployment. |
| 9 | Deliverables promise separate student module and only PDF/CSV. | List the actual faculty UI, role-based API, PostgreSQL schema/migrations, attachment access, workflow/audit, reporting formats, tests, Docker deployment, and documentation. |
| 10 | Startup/SaaS and future AI claims are not validated prototype deliverables. | Lead with departmental value and institute-wide configurability. Move ERP integration, accreditation templates, notifications, OCR, or SaaS to clearly labelled future scope; do not imply they are implemented. |
| 11 | Gantt labels omit data migration, multiple evidence, attendance, testing, and correction workflow; captions say Figure/Table 9.x while body says section 8. | Make the heading `9. Project Plan`, correct captions, and plan requirements, UX/schema, authentication, faculty catalogue/forms, evidence/workflow, reporting, security/accessibility tests, deployment, and documentation. Remove student module tasks. |
| 12 | Darshan's allocation is a student profile/activity module; LA2 and budget repeat student scope. | Redistribute concrete faculty-only work across the four members. Include integration/review for all members. Keep budget estimates dated and clearly optional; do not promise paid hosting/domain unless approved. |
| 13 | Methodology says faculty/student tables, Pending/Reject, department/class filters, Chart.js, PDF/CSV. | Use the exact domain model, validation rules, status lifecycle, approved-only official reports, PDF/DOCX/CSV, security controls, and migration/backup approach. Remove Chart.js unless it is actually included. |
| 14 | Architecture caption and diagram include Faculty, Student, and Admin/HOD modules. | Redraw as Browser/React → Express REST API → authentication/domain/report services → PostgreSQL, with Faculty, HOD, and Admin actors. Show protected attachment streaming, not public files. |
| 15 | Use-case diagram includes the obsolete student actor/use cases. | Redraw use cases for faculty draft/submit/edit/recall/archive/view/download/report; HOD review/request changes/approve/department report; Admin user management/cross-department report/archive. Show self-approval restriction. |
| 16 | Class diagram reflects the old student/legacy model and binary columns. | Model `User`, `ActivityType`, `Activity`, `ActivityAttachment`, `ActivityGuest`, and `ActivityAudit`. Show type vs faculty role separation, workflow/activity status, department snapshot, metadata-only list responses, and one-to-many attachment/guest/audit relations. |
| 17 | Sequence diagram uses generic approval/rejection and may return files inside the activity response. | Show sign-in, token verification, profile-derived department, validation/duplicate check, transaction, metadata response, reviewer decision/audit, and separate authorised attachment/report download. |
| 18 | Activity diagram uses the obsolete Pending/Reject model. | Redraw Draft → validate → Submitted → reviewer decision → Approved or Changes Requested → edit/resubmit; add Recall and soft Archive paths. |
| 19 | Deployment diagram must match the repository and production setup. | Show one production container serving static React + Express on port 3000, private PostgreSQL with persistent volume, startup migration, health checks, environment secrets, and an external HTTPS reverse proxy. Do not show a nonexistent `api/` directory. |
| 20 | References include an outdated NBA manual, a generic commercial blog, and bundled software-doc claims without URLs/access dates. | Replace with current official NBA/NIRF/INFLIBNET material, relevant faculty-activity-system sources, and individual official technology documentation. Use one citation style and add access dates. |
| 21 | Guide remarks page is blank as expected. | Keep space for dated guide remarks/signature; ensure the final exported page number and heading match the regenerated TOC. |

## Recommended replacement scope statement

> Prof-Insights is a faculty-only web portal for recording, evidencing, reviewing, and reporting academic and professional contributions. Faculty members create structured activity records using category-specific fields, attach relevant evidence and attendance documents, and track review status. HOD and authorised administrators verify submissions within their permitted scope, retain an audit trail, and generate chronological annual or multi-year reports. The system does not manage student profiles, learning content delivery, payroll, or placement processes.

## Recommended objectives

1. Design a secure role-based portal for faculty contributors, departmental reviewers, and system administrators.
2. Capture faculty activities through a controlled taxonomy with role-specific and category-specific validation.
3. Support multiple images and protected evidence, report, and attendance attachments without making certificates universally mandatory.
4. Implement an auditable draft, submission, correction, approval, and archival workflow with department-scoped access.
5. Generate chronological annual and combined-period reports in PDF, DOCX, and CSV using approved records by default.
6. Provide responsive, accessible interfaces and reproducible Docker-based deployment with database migrations and recovery documentation.

## Diagram consistency checklist

Every diagram must use the same actors, statuses, components, and entity names. The deployment diagram should correspond to `Dockerfile` and `docker-compose.yml`; the class diagram should correspond to `tables.sql` plus versioned migrations; the sequence/activity diagrams should correspond to the API workflow; and no diagram should contain a Student module.

## Stronger references to consider

- National Board of Accreditation, current accreditation manuals and documents: https://www.nbaind.org/Downloads/Documents/
- National Institutional Ranking Framework, ranking parameters: https://www.nirfindia.org/Home/parameter
- INFLIBNET, IRINS research information management platform: https://irins.inflibnet.ac.in/about
- University of Oxford, Research Information Management System: https://services.it.ox.ac.uk/Service/research-support/research-data-publications
- University of Cambridge, Symplectic Elements and integrated tools: https://library.ch.cam.ac.uk/symplectic-elements-and-integrated-tools
- React documentation: https://react.dev/
- Node.js documentation: https://nodejs.org/docs/latest/api/
- Express documentation: https://expressjs.com/
- PostgreSQL documentation: https://www.postgresql.org/docs/
- Docker Compose documentation: https://docs.docker.com/compose/

Use the exact document title, publication year/version, URL, and date accessed in the final reference style. References support design choices; they must not imply endorsement or that Prof-Insights implements every feature of a benchmark system.

