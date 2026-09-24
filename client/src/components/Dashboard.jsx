import React from 'react';
import Icon from './Icon';
import { formatDateRange } from '../utils';

const statusClass = (status = '') => status.toLowerCase().replace(/\s+/g, '-');

const Dashboard = ({ user, records, total, loading, error, navigate, reload }) => {
  const isReviewer = ['HOD', 'Admin'].includes(user.role);
  const counts = records.reduce((result, record) => {
    result[record.workflow_status] = (result[record.workflow_status] || 0) + 1;
    return result;
  }, {});
  const typeCounts = records.reduce((result, record) => {
    result[record.type_name] = (result[record.type_name] || 0) + 1;
    return result;
  }, {});
  const leadingTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">{isReviewer ? 'Department faculty workspace' : 'Your faculty workspace'}</span>
          <h1>Welcome back, {user.name}</h1>
          <p>{user.designation} · {user.department}</p>
        </div>
        <div className="hero-actions">
          <button className="btn btn-light" type="button" onClick={() => navigate('submit')}><Icon name="plus" size={18} /> Add Activity</button>
          <button className="btn btn-hero-outline" type="button" onClick={() => navigate('reports')}><Icon name="download" size={18} /> Create Report</button>
        </div>
      </section>

      {error && <div className="inline-alert error" role="alert"><Icon name="alert" size={20} /><div><strong>Activity data is temporarily unavailable</strong><p>{error}</p></div><button className="text-button" type="button" onClick={reload}>Retry</button></div>}

      <section className="dashboard-stats" aria-label="Activity status overview">
        <article><span className="stat-icon navy"><Icon name="records" /></span><div><span>{isReviewer ? 'Department records' : 'Total records'}</span><strong>{loading ? '—' : total}</strong><small>Active faculty activity entries</small></div></article>
        <article><span className="stat-icon green"><Icon name="check" /></span><div><span>Approved</span><strong>{loading ? '—' : counts.Approved || 0}</strong><small>Verified on the current page</small></div></article>
        <article><span className="stat-icon amber"><Icon name="calendar" /></span><div><span>{isReviewer ? 'Awaiting review' : 'Submitted'}</span><strong>{loading ? '—' : counts.Submitted || 0}</strong><small>{isReviewer ? 'Requires faculty review' : 'Waiting for reviewer decision'}</small></div></article>
        <article><span className="stat-icon red"><Icon name="alert" /></span><div><span>Changes requested</span><strong>{loading ? '—' : counts['Changes Requested'] || 0}</strong><small>Needs a correction or response</small></div></article>
      </section>

      <section className="quick-actions-section">
        <div className="section-heading"><div><span className="eyebrow">Common tasks</span><h2>Move your faculty record forward</h2></div></div>
        <div className="quick-action-grid">
          <button type="button" onClick={() => navigate('submit')}><span className="quick-icon"><Icon name="plus" /></span><strong>Add faculty activity</strong><p>Use conditional fields and save a draft at any stage.</p><span className="quick-link">Start entry <Icon name="arrowRight" size={16} /></span></button>
          <button type="button" onClick={() => navigate('records')}><span className="quick-icon"><Icon name="records" /></span><strong>{isReviewer ? 'Review department records' : 'Manage my records'}</strong><p>View evidence, correct mistakes and follow review status.</p><span className="quick-link">Open timeline <Icon name="arrowRight" size={16} /></span></button>
          <button type="button" onClick={() => navigate('reports')}><span className="quick-icon"><Icon name="reports" /></span><strong>Generate activity report</strong><p>Download one year or combined years as PDF, DOCX or CSV.</p><span className="quick-link">Build report <Icon name="arrowRight" size={16} /></span></button>
        </div>
      </section>

      <div className="dashboard-content-grid">
        <section className="data-card">
          <div className="data-card-header"><div><h2>Recent activity</h2><p>Latest entries by activity date</p></div><button className="text-button" type="button" onClick={() => navigate('records')}>View all <Icon name="arrowRight" size={15} /></button></div>
          {loading ? <div className="table-loading">{[1, 2, 3].map((item) => <div className="skeleton-row" key={item}><span /><span /><span /></div>)}</div> : !records.length && !error ? <div className="compact-empty"><Icon name="records" size={28} /><p>No activity has been recorded yet.</p><button className="btn btn-primary btn-sm" type="button" onClick={() => navigate('submit')}>Add First Activity</button></div> : (
            <div className="recent-list">{records.slice(0, 6).map((record) => <button type="button" key={record.act_id} onClick={() => navigate('records')}><span className="recent-date"><Icon name="calendar" size={17} />{formatDateRange(record)}</span><span className="recent-main"><strong>{record.title}</strong><small>{record.type_name} · {record.faculty_role || 'Role not set'}</small></span><span className={`status-badge status-${statusClass(record.workflow_status)}`}>{record.workflow_status}</span><Icon name="chevronRight" size={17} /></button>)}</div>
          )}
        </section>

        <section className="data-card category-overview">
          <div className="data-card-header"><div><h2>Activity coverage</h2><p>Leading categories on this page</p></div></div>
          {leadingTypes.length ? <ol>{leadingTypes.map(([type, count], index) => <li key={type}><span>{index + 1}</span><div><strong>{type}</strong><small>{count} {count === 1 ? 'record' : 'records'}</small></div></li>)}</ol> : <div className="compact-empty"><p>Category coverage appears after activities are added.</p></div>}
          <div className="evidence-reminder"><Icon name="info" size={18} /><p><strong>Evidence can be more than a certificate.</strong> Invitations, official URLs, reports, attendance and photos are accepted according to the activity.</p></div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
