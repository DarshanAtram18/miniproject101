import React, { useState } from 'react';
import Icon from './Icon';
import AppreciationLetterModal from './AppreciationLetterModal';
import { getActiveToken } from '../api';
import {
  getTypeColor,
  formatNarrativeDateRange,
  formatFacultyNameWithSalutation,
  normalizeHost,
  buildActivityNarrative
} from '../utils';

const SummaryViewModal = ({ activity, onClose, onDownload, downloading, user, showNotification }) => {
  const [showLetterModal, setShowLetterModal] = useState(false);
  if (!activity) return null;

  const isReviewer = ['HOD', 'Admin'].includes(user?.role);
  const isAppreciationIssued = (() => {
    let det = activity.details;
    if (typeof det === 'string') {
      try { det = JSON.parse(det); } catch { det = null; }
    }
    return Boolean(det?.appreciation_letter?.issued || activity.appreciation_issued);
  })();

  const token = getActiveToken();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';

  // Identify primary certificate/photo attachment
  const attachments = activity.attachments || [];
  const primaryAtt = attachments.find(a => a.isPrimary && (a.mimeType?.startsWith('image/') || a.kind === 'image'))
    || attachments.find(a => (a.kind === 'evidence' || a.fileName?.toLowerCase().includes('cert')) && a.mimeType?.startsWith('image/'))
    || attachments.find(a => a.mimeType?.startsWith('image/') || a.kind === 'image')
    || null;

  const typeColor = getTypeColor(activity.type_name);
  const narrative = buildActivityNarrative(activity);
  const facultyName = formatFacultyNameWithSalutation(activity);
  const hostName = normalizeHost(activity.host_organisation);
  const dateStr = formatNarrativeDateRange(activity);

  const now = new Date();
  const istDateStr = now.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const istTimeStr = now.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase();

  const refCode = `WCE/CSE/RPT/${activity.acad_year || '2026-27'}/0007`;

  let caption = 'Certificate of Completion';
  const typeLower = (activity.type_name || '').toLowerCase();
  if (primaryAtt?.caption) {
    caption = primaryAtt.caption;
  } else if (typeLower.includes('research') || typeLower.includes('publication')) {
    caption = 'Certificate of Appreciation';
  } else if (typeLower.includes('fdp') || typeLower.includes('seminar') || typeLower.includes('conference')) {
    caption = 'Certificate of Participation';
  } else if (typeLower.includes('visit') || primaryAtt?.kind === 'image') {
    caption = 'Event Photograph';
  }

  const imageUrl = primaryAtt
    ? `/api/activity/${activity.act_id}/attachments/${primaryAtt.id}${tokenQuery}`
    : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.78)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(4px)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '860px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Top Bar */}
        <div style={{ background: '#14284b', color: '#fff', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px' }}>
              Official Activity Report Preview
            </span>
            <span style={{ background: '#b7791f', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }}>
              A4 Print Spec
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Canvas */}
        <div style={{ overflowY: 'auto', padding: '20px', background: '#dde4ef', flex: 1 }}>
          {/* Printable A4 Page with Double Decorative Border */}
          <div
            id="summary-report-sheet"
            style={{
              background: '#fff',
              position: 'relative',
              maxWidth: '780px',
              margin: '0 auto',
              padding: '24px 28px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              border: '2.4px solid #14284b',
              boxSizing: 'border-box',
              minHeight: '880px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Inner Gold Border */}
            <div
              style={{
                position: 'absolute',
                inset: '5px',
                border: '0.8px solid #b7791f',
                pointerEvents: 'none'
              }}
            >
              {/* Corner Markers */}
              <div style={{ position: 'absolute', top: '-3px', left: '-3px', width: '6px', height: '6px', background: '#b7791f' }} />
              <div style={{ position: 'absolute', top: '-3px', right: '-3px', width: '6px', height: '6px', background: '#b7791f' }} />
              <div style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '6px', height: '6px', background: '#b7791f' }} />
              <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '6px', height: '6px', background: '#b7791f' }} />
            </div>

            {/* Page 1 Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
              <img src="/wce-logo.png" alt="WCE Crest" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
              <div style={{ flex: 1 }}>
                <h1 style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: '15px', fontWeight: '800', color: '#14284b', letterSpacing: '0.4px', lineHeight: 1.2 }}>
                  WALCHAND COLLEGE OF ENGINEERING, SANGLI
                </h1>
                <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>
                  (An Autonomous Institute · Government Aided · Established 1947)
                </div>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#b7791f', marginTop: '2px', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                  DEPARTMENT OF {(activity.department || 'Computer Science and Engineering').toUpperCase()}
                </div>
              </div>
            </div>

            {/* Navy rule under header */}
            <div style={{ height: '2px', background: '#14284b', marginBottom: '14px' }} />

            {/* Title & Subtitle */}
            <div style={{ textAlign: 'center', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: '18px', fontWeight: '800', color: '#14284b' }}>
                Faculty Activity &amp; Contribution Report
              </h2>
              <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '4px' }}>
                {activity.department || 'Computer Science and Engineering'} · Period: {activity.acad_year || '2026-27'} · Generated {istDateStr}, {istTimeStr} IST · Ref: {refCode}
              </div>
            </div>

            {/* Stat Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {[
                { num: '1', label: 'ACTIVITIES' },
                { num: activity.workflow_status === 'Approved' ? '1' : '0', label: 'APPROVED' },
                { num: primaryAtt ? '1' : '0', label: 'WITH CERTIFICATES' },
                { num: '1', label: 'ACTIVITY TYPES' }
              ].map((s, idx) => (
                <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#14284b' }}>{s.num}</div>
                  <div style={{ fontSize: '7px', fontWeight: '800', color: '#64748b', letterSpacing: '0.5px' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Activity Card */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                position: 'relative',
                overflow: 'hidden',
                background: '#fff',
                display: 'grid',
                gridTemplateColumns: '1fr 180px',
                gap: '14px',
                padding: '12px 14px',
                marginBottom: 'auto'
              }}
            >
              {/* Left Accent Bar */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px', background: typeColor }} />

              {/* Details Column */}
              <div style={{ paddingLeft: '32px', position: 'relative' }}>
                {/* Sr. No Circle */}
                <div
                  style={{
                    position: 'absolute',
                    top: '0px',
                    left: '4px',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: typeColor,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9.5px',
                    fontWeight: '800'
                  }}
                >
                  01
                </div>

                {/* Top Row: Pill Chip + Date + Approved Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <span
                    style={{
                      background: '#f1f5f9',
                      border: `1px solid ${typeColor}`,
                      color: typeColor,
                      fontSize: '8.5px',
                      fontWeight: '800',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {activity.type_name || 'ACTIVITY'}
                  </span>
                  <span style={{ fontSize: '10.5px', fontWeight: '700', color: '#1e293b' }}>
                    {dateStr}
                  </span>
                  {activity.workflow_status === 'Approved' && (
                    <span style={{ marginLeft: 'auto', fontSize: '9.5px', fontWeight: '700', color: '#15803d' }}>
                      ✓ Approved by HOD
                    </span>
                  )}
                </div>

                {/* Narrative Paragraph with Bold navy highlights */}
                <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#1e293b', lineHeight: 1.55, textAlign: 'justify' }}>
                  {narrative.tokens.map((tok, idx) => tok.bold ? (
                    <strong key={idx} style={{ color: '#14284b' }}>{tok.text}</strong>
                  ) : (
                    <span key={idx}>{tok.text}</span>
                  ))}
                </p>

                {/* Detail Grid (2x2) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                  <div>
                    <div style={{ fontSize: '7.5px', fontWeight: '800', color: '#64748b', letterSpacing: '0.5px' }}>ROLE</div>
                    <div style={{ fontSize: '10px', color: '#1e293b', fontWeight: '600' }}>{activity.faculty_role || 'Participant'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '7.5px', fontWeight: '800', color: '#64748b', letterSpacing: '0.5px' }}>MODE · LEVEL</div>
                    <div style={{ fontSize: '10px', color: '#1e293b', fontWeight: '600' }}>{[activity.mode, activity.scope].filter(Boolean).join(' · ') || 'Offline · Institute'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '7.5px', fontWeight: '800', color: '#64748b', letterSpacing: '0.5px' }}>HOST / ORGANISER</div>
                    <div style={{ fontSize: '10px', color: '#1e293b', fontWeight: '600' }}>{hostName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '7.5px', fontWeight: '800', color: '#64748b', letterSpacing: '0.5px' }}>VENUE</div>
                    <div style={{ fontSize: '10px', color: '#1e293b', fontWeight: '600' }}>{activity.venue || 'Online Platform'}</div>
                  </div>
                </div>
              </div>

              {/* Right Media Column (~58mm wide) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {imageUrl ? (
                  <div style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', padding: '4px', background: '#f8fafc', textAlign: 'center' }}>
                    <img
                      src={imageUrl}
                      alt={caption}
                      style={{ width: '100%', height: '110px', objectFit: 'contain', display: 'block', borderRadius: '2px' }}
                    />
                    <div style={{ fontSize: '8.5px', color: '#64748b', fontStyle: 'italic', marginTop: '4px' }}>
                      {caption}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '130px',
                      border: '1.5px dashed #cbd5e1',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px',
                      textAlign: 'center',
                      background: '#fafbfd'
                    }}
                  >
                    <Icon name="file" size={24} style={{ color: '#94a3b8', marginBottom: '6px' }} />
                    <span style={{ fontSize: '9px', color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.3 }}>
                      No certificate or photo uploaded for this activity
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Signatures: ONLY Head of Department (NO Faculty Coordinator) */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '28px', marginBottom: '14px' }}>
              <div style={{ textAlign: 'center', minWidth: '200px' }}>
                <div style={{ height: '36px' }} />
                <div style={{ borderTop: '1px solid #14284b', paddingTop: '4px' }}>
                  <div style={{ fontSize: '10.5px', fontWeight: '800', color: '#14284b' }}>Head of Department</div>
                  <div style={{ fontSize: '9.5px', color: '#334155' }}>(Dr. A. R. Surve)</div>
                  <div style={{ fontSize: '8px', color: '#64748b' }}>Department of Computer Science &amp; Engineering</div>
                  <div style={{ fontSize: '8px', color: '#64748b' }}>Walchand College of Engineering, Sangli</div>
                </div>
              </div>
            </div>

            {/* Running Footer */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8.5px', color: '#64748b' }}>
              <span>
                Generated from WCE Prof-Insights · Verify at miniproject-app.onrender.com/verify/{refCode.replace(/\//g, '-')}
              </span>
              <span>Page 1 of 1</span>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div style={{ padding: '10px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', justifyContent: 'flex-end', background: '#f8fafc', flexShrink: 0, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>
            Close
          </button>
          {isReviewer ? (
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              style={{
                background: isAppreciationIssued ? '#f0fdf4' : '#fef3c7',
                borderColor: isAppreciationIssued ? '#bbf7d0' : '#fde68a',
                color: isAppreciationIssued ? '#15803d' : '#92400e',
                fontWeight: 650
              }}
              onClick={() => setShowLetterModal(true)}
              title={isAppreciationIssued ? 'Manage and view issued Appreciation Letter' : 'Review, customize, sign and issue Appreciation Letter to faculty'}
            >
              <Icon name="award" size={14} /> {isAppreciationIssued ? '✓ Appreciation Letter (Issued)' : 'Issue Appreciation Letter'}
            </button>
          ) : (activity.workflow_status === 'Approved' && isAppreciationIssued) ? (
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              style={{ background: '#dcfce7', borderColor: '#86efac', color: '#166534', fontWeight: 700 }}
              onClick={() => setShowLetterModal(true)}
              title="View and download the official Letter of Appreciation awarded to you by HOD"
            >
              <Icon name="award" size={14} /> 🏅 Awarded Appreciation Letter
            </button>
          ) : null}
          {onDownload && (
            <button className="btn btn-primary btn-sm" type="button" disabled={downloading} onClick={onDownload}>
              {downloading ? <span className="button-spinner" /> : <Icon name="download" size={14} />}
              {downloading ? 'Generating PDF…' : 'Download Summary PDF'}
            </button>
          )}
        </div>
      </div>

      {showLetterModal && (
        <AppreciationLetterModal
          activityId={activity.act_id}
          activityTitle={activity.title}
          user={user}
          onClose={() => setShowLetterModal(false)}
          showNotification={showNotification}
        />
      )}
    </div>
  );
};

export default SummaryViewModal;
