import React from 'react';
import Icon from './Icon';
import { formatBytes, humanize } from '../utils';

const formatDateDMY = (dateStr) => {
  if (!dateStr) return '—';
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
};

const SummaryViewModal = ({ activity, onClose, onDownload, downloading }) => {
  if (!activity) return null;

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const attachments = activity.attachments || [];
  const imageAttachments = attachments.filter(a => a.kind === 'image' || a.mimeType?.startsWith('image/'));
  const nonImageAttachments = attachments.filter(a => a.kind !== 'image' && !a.mimeType?.startsWith('image/'));
  const detailEntries = Object.entries(activity.details || {}).filter(([, v]) => v !== null && v !== undefined && v !== '');

  const Row = ({ label, value }) => value == null || value === '' ? null : (
    <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '7px 0', alignItems: 'baseline' }}>
      <div style={{ width: '38%', minWidth: '130px', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', paddingRight: '12px', flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ fontSize: '12.5px', color: '#1e293b', flex: 1, wordBreak: 'break-word', fontWeight: '500' }}>
        {value}
      </div>
    </div>
  );

  const Section = ({ title, color = '#1a365d', children }) => (
    <div style={{ marginBottom: '14px', background: '#fafbfd', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', borderBottom: `2px solid ${color}`, paddingBottom: '4px' }}>
        <div style={{ width: '4px', height: '14px', background: color, borderRadius: '2px', flexShrink: 0 }} />
        <h4 style={{ margin: 0, fontSize: '11.5px', fontWeight: '800', color, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
          {title}
        </h4>
      </div>
      {children}
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        backdropFilter: 'blur(3px)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '92dvh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1a365d 0%, #2d4a99 100%)', color: '#fff', padding: '14px 18px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#90b4d8', marginBottom: '3px' }}>
                Activity Summary Overview
              </div>
              <h2 style={{ margin: 0, fontSize: '15.5px', fontWeight: '800', lineHeight: 1.3, wordBreak: 'break-word' }}>
                {activity.title || 'Faculty Activity'}
              </h2>
              <div style={{ fontSize: '11px', color: '#c7d8ed', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{activity.type_name}</span>
                <span>•</span>
                <span>{activity.acad_year}</span>
                <span>•</span>
                <span
                  style={{
                    background: activity.workflow_status === 'Approved' ? '#16a34a' : activity.workflow_status === 'Submitted' ? '#d97706' : '#64748b',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '1px 8px',
                    fontSize: '10px',
                    fontWeight: '700'
                  }}
                >
                  {activity.workflow_status || 'Submitted'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
              title="Close summary"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '16px', flex: 1, WebkitOverflowScrolling: 'touch' }}>
          {/* Brief Overview Callout */}
          {activity.summary && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '4px' }}>
                Executive Description
              </div>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#14532d', lineHeight: 1.55 }}>
                {activity.summary}
              </p>
              {activity.outcomes && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #86efac' }}>
                  <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '3px' }}>
                    Key Outcomes / Impact
                  </div>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#14532d', lineHeight: 1.55 }}>
                    {activity.outcomes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Core Info */}
          <Section title="Faculty & Schedule" color="#1a365d">
            <Row label="Faculty Name" value={activity.staff_name} />
            <Row label="Department" value={activity.department} />
            <Row label="Activity Category" value={activity.type_name} />
            <Row label="Involvement / Role" value={activity.faculty_role} />
            <Row label="Date / Duration" value={`${formatDateDMY(activity.start_date)} to ${formatDateDMY(activity.end_date || activity.start_date)}`} />
            {(activity.start_time || activity.end_time || activity.event_time) && (
              <Row
                label="Event Timing"
                value={
                  activity.start_time && activity.end_time
                    ? `${String(activity.start_time).slice(0, 5)} to ${String(activity.end_time).slice(0, 5)}`
                    : (activity.start_time ? `From ${String(activity.start_time).slice(0, 5)}` : (activity.end_time ? `Until ${String(activity.end_time).slice(0, 5)}` : activity.event_time))
                }
              />
            )}
            <Row label="Academic Year" value={activity.acad_year} />
            <Row label="Mode / Scope" value={[activity.mode, activity.scope].filter(Boolean).join(' · ')} />
            <Row label="Host Organisation" value={activity.host_organisation} />
            <Row label="Venue" value={activity.venue} />
            {activity.participant_count != null && <Row label="Participants" value={String(activity.participant_count)} />}
            {activity.official_url && (
              <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '7px 0', alignItems: 'baseline' }}>
                <div style={{ width: '38%', minWidth: '130px', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', paddingRight: '12px', flexShrink: 0 }}>
                  Official URL
                </div>
                <a href={activity.official_url} target="_blank" rel="noreferrer" style={{ fontSize: '12.5px', color: '#2563eb', wordBreak: 'break-all' }}>
                  {activity.official_url}
                </a>
              </div>
            )}
          </Section>

          {/* Specific Data */}
          {detailEntries.length > 0 && (
            <Section title="Specific Contribution Details" color="#2d4a99">
              {detailEntries.map(([key, val]) => (
                <Row key={key} label={humanize(key)} value={typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)} />
              ))}
            </Section>
          )}

          {/* Guests */}
          {activity.guests?.length > 0 && (
            <Section title="Invited Guests & Resource Persons" color="#276749">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {activity.guests.map((g, i) => (
                  <div key={g.id || i} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px' }}>
                    <div style={{ fontWeight: '700', fontSize: '12px', color: '#1a365d' }}>{g.name}</div>
                    {g.designation && <div style={{ fontSize: '11px', color: '#64748b' }}>{g.designation}</div>}
                    {g.organisation && <div style={{ fontSize: '11px', color: '#64748b' }}>{g.organisation} {g.country ? `· ${g.country}` : ''}</div>}
                    {g.guestRole && <div style={{ fontSize: '10px', color: '#276749', fontWeight: '700', marginTop: '2px' }}>{g.guestRole}</div>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Attachments Index */}
          <Section title="Evidence & Media Attachments" color="#92400e">
            {attachments.length === 0 ? (
              <span style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>No attachments uploaded.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {nonImageAttachments.map((att, i) => (
                  <div key={att.id || i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px' }}>
                    <Icon name={att.kind === 'attendance' ? 'users' : 'file'} size={15} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '11.5px', fontWeight: '700', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {att.fileName}
                      </div>
                      <div style={{ fontSize: '9.5px', color: '#64748b' }}>
                        {humanize(att.kind)} · {formatBytes(att.sizeBytes)}
                      </div>
                    </div>
                  </div>
                ))}
                {imageAttachments.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 10px' }}>
                    <Icon name="image" size={16} />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#92400e' }}>
                        {imageAttachments.length} image{imageAttachments.length > 1 ? 's' : ''} attached
                      </div>
                      <div style={{ fontSize: '9.5px', color: '#b45309' }}>
                        Event Photos verified in repository
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Footer note */}
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', fontSize: '9.5px', color: '#64748b', textAlign: 'center' }}>
            Generated by {activity.staff_name || 'Faculty'} on {today} · Walchand College of Engineering, Sangli
          </div>
        </div>

        {/* Action Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', justifyContent: 'flex-end', background: '#f8fafc', flexShrink: 0, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>
            Close
          </button>
          {onDownload && (
            <button className="btn btn-primary btn-sm" type="button" disabled={downloading} onClick={onDownload}>
              {downloading ? <span className="button-spinner" /> : <Icon name="download" size={14} />}
              {downloading ? 'Generating PDF…' : 'Download Summary PDF'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SummaryViewModal;
