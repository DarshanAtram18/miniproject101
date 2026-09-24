import React, { useState } from 'react';
import api, { downloadResponse, getErrorMessage } from '../api';
import Icon from './Icon';
import Modal from './Modal';
import DetailedReportModal from './DetailedReportModal';
import SummaryViewModal from './SummaryViewModal';
import { currentAcademicYears, formatBytes, formatDateRange, hasValue, humanize } from '../utils';

const editableStatuses = new Set(['Draft', 'Submitted', 'Changes Requested']);

const statusClass = (status = '') => status.toLowerCase().replace(/\s+/g, '-');

const Records = ({
  user,
  records,
  loading,
  error,
  pagination,
  catalog,
  onReload,
  onEdit,
  onDelete,
  onReview,
  navigate
}) => {
  const isReviewer = ['HOD', 'Admin'].includes(user.role);
  const [filters, setFilters] = useState({ search: '', type: '', academicYear: '', status: '', scope: '', page: 1 });
  const [viewedRecord, setViewedRecord] = useState(null);
  const [detailedReportActivity, setDetailedReportActivity] = useState(null);
  const [summaryViewRecord, setSummaryViewRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [imageUrls, setImageUrls] = useState([]);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [summaryDownloading, setSummaryDownloading] = useState(false);

  const activeTypes = catalog.typeGroups.flatMap((group) => group.types.map((type) => type.name));

  const setFilter = (name, value) => setFilters((previous) => ({ ...previous, [name]: value, page: 1 }));

  const applyFilters = (event) => {
    event?.preventDefault();
    onReload({ ...filters, page: 1 });
  };

  const clearFilters = () => {
    const cleared = { search: '', type: '', academicYear: '', status: '', scope: '', page: 1 };
    setFilters(cleared);
    onReload(cleared);
  };

  const changePage = (page) => {
    const next = { ...filters, page };
    setFilters(next);
    onReload(next);
  };

  const closeRecord = () => {
    imageUrls.forEach((item) => URL.revokeObjectURL(item.url));
    setImageUrls([]);
    setViewedRecord(null);
    setDetailError('');
    setReviewComment('');
  };

  const openRecord = async (record) => {
    setViewedRecord(record);
    setDetailLoading(true);
    setDetailError('');
    setReviewComment(record.review_comment || '');
    try {
      const response = await api.get(`/activity/${record.act_id}`);
      const detail = response.data.activity;
      setViewedRecord(detail);
      const images = detail.attachments.filter((attachment) => attachment.kind === 'image');
      const loaded = await Promise.all(images.map(async (attachment) => {
        try {
          const imageResponse = await api.get(`/activity/${detail.act_id}/attachments/${attachment.id}?disposition=inline`, { responseType: 'blob' });
          return { id: attachment.id, url: URL.createObjectURL(imageResponse.data), caption: attachment.caption, fileName: attachment.fileName };
        } catch {
          return null;
        }
      }));
      setImageUrls(loaded.filter(Boolean));
    } catch (requestError) {
      setDetailError(getErrorMessage(requestError, 'Unable to load activity details.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetailedReport = async (record) => {
    try {
      const response = await api.get(`/activity/${record.act_id}`);
      setDetailedReportActivity(response.data.activity);
    } catch {
      setDetailedReportActivity(record);
    }
  };

  const openSummaryView = async (record) => {
    try {
      const response = await api.get(`/activity/${record.act_id}`);
      setSummaryViewRecord(response.data.activity);
    } catch {
      setSummaryViewRecord(record);
    }
  };

  const downloadAttachment = async (record, attachment) => {
    const response = await api.get(`/activity/${record.act_id}/attachments/${attachment.id}`, { responseType: 'blob' });
    downloadResponse(response, attachment.fileName);
  };

  const viewAttachment = async (record, attachment) => {
    const response = await api.get(`/activity/${record.act_id}/attachments/${attachment.id}?disposition=inline`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const downloadActivitySummary = async (record) => {
    setSummaryDownloading(true);
    try {
      const response = await api.get(`/activity/${record.act_id}/summary-report`, { responseType: 'blob' });
      downloadResponse(response, `activity-${record.act_id}-event-summary.pdf`);
    } finally {
      setSummaryDownloading(false);
    }
  };

  const requestDelete = async (record) => {
    const confirmed = window.confirm(`Remove "${record.title}" from your active records? The audit entry will be retained.`);
    if (confirmed) await onDelete(record);
  };

  const submitReview = async (decision) => {
    setReviewing(true);
    try {
      await onReview(viewedRecord, decision, reviewComment);
      closeRecord();
    } finally {
      setReviewing(false);
    }
  };

  const pageStats = {
    approved: records.filter((record) => record.workflow_status === 'Approved').length,
    submitted: records.filter((record) => record.workflow_status === 'Submitted').length,
    changes: records.filter((record) => record.workflow_status === 'Changes Requested').length
  };

  return (
    <div className="records-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Canonical activity repository</span>
          <h1>{isReviewer ? 'Department activity records' : 'My activity records'}</h1>
          <p>{isReviewer ? 'Review faculty evidence and track every decision without losing submission history.' : 'View, correct and reuse your faculty contributions for annual reporting.'}</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => navigate('submit')}><Icon name="plus" size={18} /> New Activity</button>
      </div>

      <div className="record-stat-strip" aria-label="Visible record status summary">
        <div><span>Total matching</span><strong>{pagination.total}</strong></div>
        <div><span>Approved on page</span><strong>{pageStats.approved}</strong></div>
        <div><span>Awaiting review</span><strong>{pageStats.submitted}</strong></div>
        <div><span>Changes requested</span><strong>{pageStats.changes}</strong></div>
      </div>

      <form className="filter-panel" onSubmit={applyFilters}>
        <div className="filter-panel-heading"><Icon name="filter" size={18} /><strong>Find records</strong></div>
        <div className="filter-grid">
          <div className="form-group search-field">
            <label htmlFor="records-search">Search</label>
            <div className="input-icon-wrap"><Icon name="search" size={17} /><input id="records-search" className="form-control" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Title, host or faculty" /></div>
          </div>
          <div className="form-group"><label htmlFor="records-type">Activity type</label><select id="records-type" className="form-control" value={filters.type} onChange={(event) => setFilter('type', event.target.value)}><option value="">All types</option>{activeTypes.map((type) => <option key={type}>{type}</option>)}</select></div>
          <div className="form-group"><label htmlFor="records-year">Academic year</label><select id="records-year" className="form-control" value={filters.academicYear} onChange={(event) => setFilter('academicYear', event.target.value)}><option value="">All years</option>{currentAcademicYears(10).map((year) => <option key={year}>{year}</option>)}</select></div>
          <div className="form-group"><label htmlFor="records-status">Review status</label><select id="records-status" className="form-control" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}><option value="">All statuses</option>{catalog.workflowStatuses.filter((status) => status !== 'Archived').map((status) => <option key={status}>{status}</option>)}</select></div>
          <div className="form-group"><label htmlFor="records-scope">Level</label><select id="records-scope" className="form-control" value={filters.scope} onChange={(event) => setFilter('scope', event.target.value)}><option value="">All levels</option>{catalog.scopes.map((scope) => <option key={scope}>{scope}</option>)}</select></div>
        </div>
        <div className="filter-actions"><button className="btn btn-secondary" type="button" onClick={clearFilters}>Clear</button><button className="btn btn-primary" type="submit"><Icon name="search" size={17} /> Apply Filters</button></div>
      </form>

      <section className="data-card" aria-labelledby="record-history-title">
        <div className="data-card-header">
          <div><h2 id="record-history-title">Activity timeline</h2><p>Newest activity date first</p></div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => onReload(filters)} disabled={loading}><Icon name="refresh" size={16} /> Refresh</button>
        </div>

        {error && records.length > 0 && (
          <div className="inline-alert warning" role="status">
            <Icon name="alert" size={18} />
            <div><strong>Showing the last loaded records</strong><p>{error}</p></div>
            <button className="text-button" type="button" onClick={() => onReload(filters)}>Try again</button>
          </div>
        )}

        {loading ? (
          <div className="table-loading" aria-label="Loading activity records">
            {[1, 2, 3, 4].map((item) => <div className="skeleton-row" key={item}><span /><span /><span /><span /></div>)}
          </div>
        ) : error && records.length === 0 ? (
          <div className="state-panel error-state" role="alert">
            <span className="state-icon"><Icon name="alert" size={30} /></span>
            <h3>We could not load your activity records</h3>
            <p>{error}</p>
            <button className="btn btn-primary" type="button" onClick={() => onReload(filters)}><Icon name="refresh" size={17} /> Try Again</button>
          </div>
        ) : records.length === 0 ? (
          <div className="state-panel empty-state">
            <span className="state-icon"><Icon name="records" size={30} /></span>
            <h3>No activities match these filters</h3>
            <p>{Object.values(filters).some((value) => value && value !== 1) ? 'Clear the filters or adjust the search.' : 'Add your first faculty activity to begin the timeline.'}</p>
            <div className="state-actions"><button className="btn btn-secondary" type="button" onClick={clearFilters}>Clear Filters</button><button className="btn btn-primary" type="button" onClick={() => navigate('submit')}><Icon name="plus" size={17} /> Add Activity</button></div>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="records-table">
                <thead><tr>{isReviewer && <th>Faculty</th>}<th>Date</th><th>Activity</th><th>Type &amp; role</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
                <tbody>
                  {records.map((record) => {
                    const isOwner = Number(record.staff_id) === Number(user.id);
                    return (
                      <tr key={record.act_id}>
                        {isReviewer && <td data-label="Faculty"><strong className="table-primary">{record.staff_name}</strong><span className="table-secondary">{record.department}</span></td>}
                        <td data-label="Date"><strong className="table-primary">{formatDateRange(record)}</strong><span className="table-secondary">{record.acad_year || 'Year not set'}</span></td>
                        <td data-label="Activity"><button className="activity-title-button" type="button" onClick={() => openRecord(record)}>{record.title || 'Untitled activity'}</button><span className="table-secondary">{record.host_organisation || record.summary || 'No host recorded'}</span></td>
                        <td data-label="Type &amp; role"><span className="category-chip">{record.type_name}</span><span className="table-secondary">{record.faculty_role || 'Role not set'}</span></td>
                        <td data-label="Status"><span className={`status-badge status-${statusClass(record.workflow_status)}`}>{record.workflow_status}</span>{record.review_comment && <span className="table-secondary review-note-preview">Reviewer note available</span>}</td>
                        <td data-label="Actions">
                          <div className="row-actions">
                            <button className="icon-button" type="button" onClick={() => openRecord(record)} aria-label={`View ${record.title}`} title="View details"><Icon name="eye" size={18} /></button>
                            <button className="icon-button" type="button" onClick={() => openDetailedReport(record)} aria-label="Official Detailed Report" title="View &amp; Download Detailed Event Report"><Icon name="reports" size={18} /></button>
                            {isOwner && editableStatuses.has(record.workflow_status) && <button className="icon-button" type="button" onClick={() => onEdit(record)} aria-label={`Edit ${record.title}`} title="Edit"><Icon name="edit" size={18} /></button>}
                            {isOwner && editableStatuses.has(record.workflow_status) && <button className="icon-button danger" type="button" onClick={() => requestDelete(record)} aria-label={`Remove ${record.title}`} title="Remove"><Icon name="trash" size={18} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pagination.totalPages > 1 && (
              <nav className="pagination" aria-label="Activity record pages">
                <button type="button" className="btn btn-secondary btn-sm" disabled={pagination.page <= 1} onClick={() => changePage(pagination.page - 1)}><Icon name="arrowLeft" size={15} /> Previous</button>
                <span>Page {pagination.page} of {pagination.totalPages}</span>
                <button type="button" className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => changePage(pagination.page + 1)}>Next <Icon name="arrowRight" size={15} /></button>
              </nav>
            )}
          </>
        )}
      </section>

      {/* RECORD DETAIL MODAL */}
      {viewedRecord && (
        <Modal
          title={viewedRecord.title || 'Activity details'}
          subtitle={viewedRecord.type_name}
          onClose={closeRecord}
          footer={
            <>
              <button className="btn btn-secondary" type="button" onClick={closeRecord}>Close</button>
              <button className="btn btn-secondary" type="button" disabled={summaryDownloading} onClick={() => downloadActivitySummary(viewedRecord)}>
                {summaryDownloading ? <span className="button-spinner dark" /> : <Icon name="download" size={16} />} {summaryDownloading ? 'Preparing…' : 'Download Summary'}
              </button>
              <button className="btn btn-primary" type="button" onClick={() => { closeRecord(); openDetailedReport(viewedRecord); }}>
                <Icon name="reports" size={16} /> Download Official Report
              </button>
              {Number(viewedRecord.staff_id) === Number(user.id) && editableStatuses.has(viewedRecord.workflow_status) && (
                <button className="btn btn-primary" type="button" onClick={() => { closeRecord(); onEdit(viewedRecord); }}>
                  <Icon name="edit" size={17} /> Edit Activity
                </button>
              )}
            </>
          }
        >
          {detailLoading ? <div className="modal-loading"><span className="button-spinner dark" /> Loading record…</div> : detailError ? <div className="inline-alert error"><Icon name="alert" /><span>{detailError}</span></div> : (
            <div className="record-detail">
              <div className="detail-status-row"><span className={`status-badge status-${statusClass(viewedRecord.workflow_status)}`}>{viewedRecord.workflow_status}</span><span>{formatDateRange(viewedRecord)} · {viewedRecord.acad_year || 'Academic year not set'}</span></div>

              {viewedRecord.review_comment && <div className="inline-alert warning"><Icon name="alert" size={19} /><div><strong>Reviewer comment</strong><p>{viewedRecord.review_comment}</p></div></div>}

              <section className="detail-section"><h3>Core information</h3><dl className="detail-grid">
                <div><dt>Faculty</dt><dd>{viewedRecord.staff_name}</dd></div><div><dt>Department</dt><dd>{viewedRecord.department}</dd></div>
                <div><dt>Involvement</dt><dd>{viewedRecord.faculty_role || 'Not specified'}</dd></div><div><dt>Activity status</dt><dd>{viewedRecord.activity_status}</dd></div>
                <div><dt>Mode / level</dt><dd>{[viewedRecord.mode, viewedRecord.scope].filter(Boolean).join(' · ') || 'Not applicable'}</dd></div><div><dt>Host / organiser</dt><dd>{viewedRecord.host_organisation || 'Not applicable'}</dd></div>
                {viewedRecord.venue && <div><dt>Venue</dt><dd>{viewedRecord.venue}</dd></div>}{hasValue(viewedRecord.participant_count) && <div><dt>Participants</dt><dd>{viewedRecord.participant_count}</dd></div>}
              </dl></section>

              <section className="detail-section"><h3>Description and outcomes</h3><p>{viewedRecord.summary || 'No description provided.'}</p>{viewedRecord.outcomes && <p><strong>Outcomes:</strong> {viewedRecord.outcomes}</p>}{viewedRecord.official_url && <a href={viewedRecord.official_url} target="_blank" rel="noreferrer">Open official source</a>}</section>

              {Object.entries(viewedRecord.details || {}).some(([, value]) => hasValue(value)) && <section className="detail-section"><h3>Specific details</h3><dl className="detail-grid">{Object.entries(viewedRecord.details || {}).filter(([, value]) => hasValue(value)).map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)}</dd></div>)}</dl></section>}

              {viewedRecord.guests?.length > 0 && <section className="detail-section"><h3>Guests / resource persons</h3><div className="guest-summary-list">{viewedRecord.guests.map((guest) => <article key={guest.id}><strong>{guest.name}</strong><span>{[guest.designation, guest.organisation, guest.country].filter(Boolean).join(' · ')}</span><small>{[guest.guestRole, guest.guestType].filter(Boolean).join(' · ')}</small></article>)}</div></section>}

              {imageUrls.length > 0 && <section className="detail-section"><h3>Activity photos</h3><div className="image-gallery">{imageUrls.map((image) => <figure key={image.id}><img src={image.url} alt={image.caption || image.fileName} loading="lazy" /><figcaption>{image.caption || image.fileName}</figcaption></figure>)}</div></section>}

              <section className="detail-section">
                <div className="detail-section-heading">
                  <div><h3>Evidence and event report</h3><p>View or download the activity summary and official report.</p></div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => openSummaryView(viewedRecord)}>
                      <Icon name="eye" size={14} /> View Summary
                    </button>
                    <button className="btn btn-primary btn-sm" type="button" onClick={() => openDetailedReport(viewedRecord)}>
                      <Icon name="reports" size={14} /> View Official Report
                    </button>
                  </div>
                </div>
                {viewedRecord.attachments?.length ? <div className="attachment-list">{viewedRecord.attachments.map((attachment) => <div className="attachment-row" key={attachment.id}><Icon name={attachment.kind === 'image' ? 'image' : attachment.kind === 'attendance' ? 'users' : 'file'} size={18} /><div><strong>{attachment.fileName}</strong><span>{humanize(attachment.kind)} · {formatBytes(attachment.sizeBytes)}{attachment.kind === 'attendance' ? ' · Restricted student data' : ''}</span></div><div className="attachment-actions">{(attachment.mimeType?.startsWith('image/') || attachment.mimeType === 'application/pdf') && <button className="text-button" type="button" onClick={() => viewAttachment(viewedRecord, attachment)}><Icon name="eye" size={15} /> View</button>}<button className="text-button" type="button" onClick={() => downloadAttachment(viewedRecord, attachment)}><Icon name="download" size={15} /> Download</button></div></div>)}</div> : <p className="muted-copy">No file attachments. Evidence status: {viewedRecord.evidence_availability || 'not recorded'}.</p>}
              </section>

              {viewedRecord.audit?.length > 0 && <section className="detail-section"><h3>Review and change history</h3><ol className="audit-timeline">{viewedRecord.audit.map((entry) => <li key={entry.id}><span className="audit-dot" /><div><strong>{entry.action}</strong><span>{entry.actorName || 'System'} · {new Date(entry.createdAt).toLocaleString('en-IN')}</span>{entry.note && <p>{entry.note}</p>}</div></li>)}</ol></section>}

              {isReviewer && viewedRecord.workflow_status === 'Submitted' && Number(viewedRecord.staff_id) !== Number(user.id) && <section className="review-decision-panel"><h3>Reviewer decision</h3><label htmlFor="review-comment">Comment <span>{reviewComment ? '' : 'required when requesting changes'}</span></label><textarea id="review-comment" className="form-control" rows="3" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Give clear, actionable corrections when returning a record." /><div className="review-actions"><button className="btn btn-secondary" type="button" disabled={reviewing || !reviewComment.trim()} onClick={() => submitReview('Changes Requested')}>Request Changes</button><button className="btn btn-primary" type="button" disabled={reviewing} onClick={() => submitReview('Approved')}><Icon name="check" size={17} /> Approve Activity</button></div></section>}
            </div>
          )}
        </Modal>
      )}

      {/* DETAILED OFFICIAL REPORT MODAL */}
      {detailedReportActivity && (
        <DetailedReportModal
          activity={detailedReportActivity}
          user={user}
          onClose={() => setDetailedReportActivity(null)}
        />
      )}

      {/* IN-BROWSER SUMMARY VIEW MODAL */}
      {summaryViewRecord && (
        <SummaryViewModal
          activity={summaryViewRecord}
          onClose={() => setSummaryViewRecord(null)}
          onDownload={() => downloadActivitySummary(summaryViewRecord)}
          downloading={summaryDownloading}
        />
      )}
    </div>
  );
};

export default Records;
