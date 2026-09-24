import React, { useMemo, useState } from 'react';
import api, { downloadResponse, getBlobErrorMessage } from '../api';
import Icon from './Icon';
import DetailedReportModal from './DetailedReportModal';
import SummaryViewModal from './SummaryViewModal';
import { currentAcademicYears } from '../utils';

const Reports = ({ user, catalog, records, total, onDownload, showNotification }) => {
  const isReviewer = ['HOD', 'Admin'].includes(user.role);
  const [periodMode, setPeriodMode] = useState('academicYear');
  const [selectedSingleActId, setSelectedSingleActId] = useState('');
  const [detailedModalRecord, setDetailedModalRecord] = useState(null);
  const [summaryModalRecord, setSummaryModalRecord] = useState(null);
  const [summaryDownloading, setSummaryDownloading] = useState(false);
  const [filters, setFilters] = useState({
    academicYear: currentAcademicYears()[0],
    from: '',
    to: '',
    type: '',
    role: '',
    scope: '',
    mine: isReviewer ? 'false' : 'true',
    includePending: false
  });
  const [downloading, setDownloading] = useState('');

  const activityTypes = catalog.typeGroups.flatMap((group) => group.types.map((type) => type.name));
  const roles = useMemo(() => [...new Set(catalog.typeGroups.flatMap((group) => group.types.flatMap((type) => type.roles)))].sort(), [catalog]);
  const approvedVisible = records.filter((record) => record.workflow_status === 'Approved').length;

  const update = (name, value) => setFilters((previous) => ({ ...previous, [name]: value }));

  const download = async (format) => {
    const reportFilters = {
      type: filters.type,
      role: filters.role,
      scope: filters.scope,
      mine: filters.mine,
      includePending: filters.includePending ? 'true' : 'false',
      ...(periodMode === 'academicYear' ? { academicYear: filters.academicYear } : {}),
      ...(periodMode === 'dateRange' ? { from: filters.from, to: filters.to } : {})
    };
    setDownloading(format);
    try {
      await onDownload(format, reportFilters);
    } finally {
      setDownloading('');
    }
  };

  const downloadSingleSummary = async (record) => {
    setSummaryDownloading(true);
    try {
      const response = await api.get(`/activity/${record.act_id}/summary-report`, { responseType: 'blob' });
      downloadResponse(response, `activity-${record.act_id}-event-summary.pdf`);
    } catch (error) {
      const message = await getBlobErrorMessage(error, 'Unable to download the summary PDF.');
      alert(message);
    } finally {
      setSummaryDownloading(false);
    }
  };

  const openSingleDetailed = async (recordId) => {
    const found = records.find((r) => String(r.act_id) === String(recordId));
    if (!found) return;
    try {
      const response = await api.get(`/activity/${found.act_id}`);
      setDetailedModalRecord(response.data.activity);
    } catch {
      setDetailedModalRecord(found);
    }
  };

  const openSingleSummary = async (recordId) => {
    const found = records.find((r) => String(r.act_id) === String(recordId));
    if (!found) return;
    try {
      const response = await api.get(`/activity/${found.act_id}`);
      setSummaryModalRecord(response.data.activity);
    } catch {
      setSummaryModalRecord(found);
    }
  };

  return (
    <div className="reports-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Reusable faculty reporting</span>
          <h1>Build an activity report</h1>
          <p>Create a date-wise annual or combined report from the records already entered in Prof-Insights.</p>
        </div>
      </div>

      <div className="report-layout">
        <section className="form-card report-builder" aria-labelledby="report-builder-title">
          <div className="form-card-header"><div><span className="section-kicker">Report settings</span><h2 id="report-builder-title">Select coverage and output</h2></div><span className="privacy-chip"><Icon name="lock" size={14} /> Role-based access</span></div>
          <div className="form-card-body">
            {isReviewer && (
              <div className="form-group">
                <label>Report coverage</label>
                <div className="segmented-control">
                  <button type="button" className={filters.mine === 'true' ? 'active' : ''} onClick={() => update('mine', 'true')}>My activities</button>
                  <button type="button" className={filters.mine === 'false' ? 'active' : ''} onClick={() => update('mine', 'false')}>{user.role === 'HOD' ? 'My department' : 'All departments'}</button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Reporting period</label>
              <div className="segmented-control three-options">
                <button type="button" className={periodMode === 'academicYear' ? 'active' : ''} onClick={() => setPeriodMode('academicYear')}>Academic year</button>
                <button type="button" className={periodMode === 'dateRange' ? 'active' : ''} onClick={() => setPeriodMode('dateRange')}>Custom dates</button>
                <button type="button" className={periodMode === 'combined' ? 'active' : ''} onClick={() => setPeriodMode('combined')}>Combined years</button>
              </div>
            </div>

            {periodMode === 'academicYear' && <div className="form-group"><label htmlFor="report-year">Academic year</label><select id="report-year" className="form-control" value={filters.academicYear} onChange={(event) => update('academicYear', event.target.value)}>{currentAcademicYears(10).map((year) => <option key={year}>{year}</option>)}</select></div>}
            {periodMode === 'dateRange' && <div className="form-grid two-columns"><div className="form-group"><label htmlFor="report-from">From</label><input id="report-from" className="form-control" type="date" value={filters.from} onChange={(event) => update('from', event.target.value)} /></div><div className="form-group"><label htmlFor="report-to">To</label><input id="report-to" className="form-control" type="date" min={filters.from || undefined} value={filters.to} onChange={(event) => update('to', event.target.value)} /></div></div>}
            {periodMode === 'combined' && <div className="inline-alert info"><Icon name="info" size={19} /><span>The report will include every matching year and order activities chronologically by date.</span></div>}

            <div className="form-divider" />
            <h3 className="form-subheading">Optional filters</h3>
            <div className="form-grid two-columns">
              <div className="form-group"><label htmlFor="report-type">Activity type</label><select id="report-type" className="form-control" value={filters.type} onChange={(event) => update('type', event.target.value)}><option value="">All activity types</option>{activityTypes.map((type) => <option key={type}>{type}</option>)}</select></div>
              <div className="form-group"><label htmlFor="report-role">Faculty involvement</label><select id="report-role" className="form-control" value={filters.role} onChange={(event) => update('role', event.target.value)}><option value="">All roles</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></div>
              <div className="form-group"><label htmlFor="report-scope">Scope / level</label><select id="report-scope" className="form-control" value={filters.scope} onChange={(event) => update('scope', event.target.value)}><option value="">All levels</option>{catalog.scopes.map((scope) => <option key={scope}>{scope}</option>)}</select></div>
            </div>

            <label className="checkbox-card">
              <input type="checkbox" checked={filters.includePending} onChange={(event) => update('includePending', event.target.checked)} />
              <span><strong>Include records that are not approved</strong><small>Useful for internal review only. PDF and DOCX outputs will be clearly marked as draft.</small></span>
            </label>

            <div className="report-download-section">
              <div><h3>Download Combined / Period Reports</h3><p>All formats contain the same filters, date-wise ordering and executive summary.</p></div>
              <div className="download-button-grid">
                <button className="download-format-button pdf" type="button" onClick={() => download('pdf')} disabled={Boolean(downloading)}><span><Icon name="file" /></span><div><strong>PDF Register</strong><small>Chronological summary</small></div>{downloading === 'pdf' ? <span className="button-spinner dark" /> : <Icon name="download" size={18} />}</button>
                <button className="download-format-button docx" type="button" onClick={() => download('docx')} disabled={Boolean(downloading)}><span><Icon name="file" /></span><div><strong>DOCX Register</strong><small>Editable Word report</small></div>{downloading === 'docx' ? <span className="button-spinner dark" /> : <Icon name="download" size={18} />}</button>
                <button className="download-format-button csv" type="button" onClick={() => download('csv')} disabled={Boolean(downloading)}><span><Icon name="reports" /></span><div><strong>CSV Data</strong><small>Data analysis</small></div>{downloading === 'csv' ? <span className="button-spinner dark" /> : <Icon name="download" size={18} />}</button>
              </div>
            </div>

            <div className="form-divider" />
            <div className="form-group" style={{ backgroundColor: '#f0f4f8', padding: '16px', borderRadius: '10px', border: '1px solid #d0dae5' }}>
              <h3 style={{ color: 'var(--navy-900)', fontSize: '0.92rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="reports" size={18} /> Single Activity Reports &amp; Verification
              </h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--muted)', marginBottom: '12px' }}>
                View or download an official structured contribution document or event summary with photo gallery links and verified attachments.
              </p>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  id="single-activity-select"
                  className="form-control"
                  style={{ flex: 1, minWidth: '220px' }}
                  value={selectedSingleActId}
                  onChange={(e) => setSelectedSingleActId(e.target.value)}
                >
                  <option value="">-- Choose an activity from active records --</option>
                  {records.map((r) => (
                    <option key={r.act_id} value={r.act_id}>
                      {r.staff_name ? `${r.staff_name} · ` : ''}{r.type_name} — {r.title || 'Untitled'}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!selectedSingleActId}
                  onClick={() => openSingleSummary(selectedSingleActId)}
                >
                  <Icon name="eye" size={16} /> View Summary
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!selectedSingleActId}
                  onClick={() => openSingleDetailed(selectedSingleActId)}
                >
                  <Icon name="reports" size={16} /> View Official Report
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="report-side-panel">
          <section className="data-card report-readiness">
            <div className="data-card-header"><div><h2>Repository readiness</h2><p>Current loaded records</p></div></div>
            <div className="readiness-metrics"><div><span>Active records</span><strong>{total}</strong></div><div><span>Approved on page</span><strong>{approvedVisible}</strong></div><div><span>With attachments</span><strong>{records.filter((record) => record.attachments?.length).length}</strong></div></div>
          </section>
          <section className="data-card report-content-guide">
            <div className="data-card-header"><div><h2>Every report includes</h2></div></div>
            <ul>
              <li><Icon name="check" size={17} /><span>Faculty, department and selected reporting period</span></li>
              <li><Icon name="check" size={17} /><span>Activity date, type, involvement, host and level</span></li>
              <li><Icon name="check" size={17} /><span>Short description, outcomes and review status</span></li>
              <li><Icon name="check" size={17} /><span>Evidence attachment count without exposing private files</span></li>
              <li><Icon name="check" size={17} /><span>Category and approval totals</span></li>
            </ul>
          </section>
          <div className="inline-alert info"><Icon name="info" size={19} /><p>Raw attendance files remain protected. Reports include only the attendance/evidence index and participant count.</p></div>
        </aside>
      </div>

      {detailedModalRecord && (
        <DetailedReportModal
          activity={detailedModalRecord}
          user={user}
          onClose={() => setDetailedModalRecord(null)}
        />
      )}

      {summaryModalRecord && (
        <SummaryViewModal
          activity={summaryModalRecord}
          onClose={() => setSummaryModalRecord(null)}
          onDownload={() => downloadSingleSummary(summaryModalRecord)}
          downloading={summaryDownloading}
        />
      )}
    </div>
  );
};

export default Reports;
