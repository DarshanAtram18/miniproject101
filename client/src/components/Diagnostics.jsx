import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import api, { getErrorMessage } from '../api';

const Diagnostics = ({ showNotification }) => {
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [queueRes, summaryRes] = await Promise.all([
        api.get('/admin/email-queue-status'),
        api.get('/admin/system-summary')
      ]);
      setData(queueRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load diagnostics data.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRetryEmails = async () => {
    setRetrying(true);
    try {
      const res = await api.post('/admin/email-queue-retry');
      showNotification(`Triggered retry for ${res.data.retriedCount || 0} queued email deliveries.`);
      await loadData();
    } catch (err) {
      showNotification(getErrorMessage(err, 'Unable to retry email deliveries.'), 'error');
    } finally {
      setRetrying(false);
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'SENT') return <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>SENT</span>;
    if (status === 'PENDING' || status === 'SENDING') return <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>{status}</span>;
    return <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>FAILED</span>;
  };

  return (
    <div className="records-page diagnostics-page">
      <section className="dashboard-hero" style={{ marginBottom: '24px' }}>
        <div>
          <span className="eyebrow">System Diagnostics &amp; Health</span>
          <h1>Background Worker &amp; Delivery Console</h1>
          <p>Monitor asynchronous appreciation letter dispatches, database connection health, and worker queue status.</p>
        </div>
        <div className="hero-actions">
          <button className="btn btn-light" type="button" disabled={retrying} onClick={handleRetryEmails}>
            {retrying ? <span className="button-spinner dark" /> : <Icon name="refresh" size={17} />} Retry Failed Deliveries
          </button>
          <button className="btn btn-hero-outline" type="button" onClick={loadData}>
            <Icon name="refresh" size={17} /> Refresh Stats
          </button>
        </div>
      </section>

      {/* System Health Cards */}
      {summary && (
        <section className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: '24px' }}>
          <article>
            <span className="stat-icon green"><Icon name="check" /></span>
            <div><span>Database</span><strong>Connected</strong><small>PostgreSQL 16 (Render)</small></div>
          </article>
          <article>
            <span className="stat-icon navy"><Icon name="users" /></span>
            <div><span>Total Accounts</span><strong>{summary.users?.total_users || 0}</strong><small>{summary.users?.active_users || 0} active users</small></div>
          </article>
          <article>
            <span className="stat-icon amber"><Icon name="records" /></span>
            <div><span>Total Activities</span><strong>{summary.activities?.total_activities || 0}</strong><small>{summary.activities?.approved_count || 0} approved records</small></div>
          </article>
          <article>
            <span className="stat-icon red"><Icon name="alert" /></span>
            <div><span>Email Worker</span><strong>{data?.activeProvider || 'SMTP'}</strong><small>{summary.emails?.sent_jobs || 0} letters delivered</small></div>
          </article>
        </section>
      )}

      {/* Email Queue Status Card */}
      <section className="data-card" style={{ marginBottom: '24px' }}>
        <div className="data-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Appreciation Letter Email Queue</h2>
            <p>Background asynchronous jobs for officially issued Letters of Appreciation with PDF attachments</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ fontSize: '12px', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', color: '#475569', fontWeight: 600 }}>
              Provider: {data?.activeProvider || 'SMTP'}
            </span>
            <span style={{ fontSize: '12px', background: '#f0fdf4', padding: '4px 10px', borderRadius: '6px', color: '#15803d', fontWeight: 600 }}>
              Worker: Running
            </span>
          </div>
        </div>

        {loading ? (
          <div className="table-loading"><span className="button-spinner dark" /> Inspecting email queue…</div>
        ) : error ? (
          <div className="inline-alert error"><Icon name="alert" /><span>{error}</span></div>
        ) : !data?.jobs?.length ? (
          <div className="compact-empty">
            <Icon name="award" size={32} />
            <p>No appreciation letter email jobs in the queue yet.</p>
            <small style={{ color: '#64748b' }}>Jobs are automatically created when the HOD issues an Appreciation Letter.</small>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="records-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Achievement ID</th>
                  <th>Recipient Faculty</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Last Error / Diagnostics</th>
                  <th>Sent / Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job.id}>
                    <td><code>#{job.id}</code></td>
                    <td><span className="category-chip">Activity #{job.achievement_id}</span></td>
                    <td><strong>{job.recipient_email}</strong></td>
                    <td>{getStatusBadge(job.status)}</td>
                    <td><span>{job.attempt_count} / {job.max_attempts}</span></td>
                    <td>
                      {job.last_error ? (
                        <span style={{ color: '#b91c1c', fontSize: '11px', display: 'block', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.last_error}>
                          {job.last_error}
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '11px' }}>None</span>
                      )}
                    </td>
                    <td>
                      <small style={{ color: '#64748b' }}>
                        {job.sent_at ? new Date(job.sent_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : 'Pending'}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default Diagnostics;
