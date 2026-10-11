import React from 'react';
import Icon from './Icon';
import { getActiveToken } from '../api';
import {
  getTypeColor,
  formatNarrativeDateRange,
  formatFacultyNameWithSalutation,
  normalizeHost,
  buildActivityNarrative
} from '../utils';

const CombinedReportPreviewModal = ({
  user,
  records = [],
  periodLabel = 'Current Academic Year',
  onClose,
  onDownloadPdf,
  downloading = false
}) => {
  if (!records) return null;

  const token = getActiveToken();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';

  const totalActivities = records.length;
  const approvedCount = records.filter(r => r.workflow_status === 'Approved').length;
  const withCertsCount = records.filter(r => (r.attachments || []).some(a => a.mimeType?.startsWith('image/') || a.kind === 'image' || a.kind === 'evidence')).length;
  const activityTypesCount = new Set(records.map(r => r.type_name)).size;

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

  const refCode = `WCE/CSE/RPT/2026-27/${String(totalActivities).padStart(4, '0')}`;

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
          maxWidth: '920px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Top Bar */}
        <div style={{ background: '#14284b', color: '#fff', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px' }}>
              Official Activity Report Preview ({totalActivities} activities)
            </span>
            <span style={{ background: '#b7791f', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }}>
              A4 Target Spec
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {onDownloadPdf && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onDownloadPdf}
                disabled={downloading}
                style={{ background: '#fff', color: '#14284b', fontWeight: '700', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '5px', cursor: 'pointer' }}
              >
                <Icon name="download" size={14} /> {downloading ? 'Generating PDF...' : 'Download PDF'}
              </button>
            )}
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
        </div>

        {/* Modal Scrollable Canvas */}
        <div style={{ overflowY: 'auto', padding: '20px', background: '#dde4ef', flex: 1 }}>
          <div
            id="combined-report-sheet"
            style={{
              background: '#fff',
              position: 'relative',
              maxWidth: '820px',
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
              {/* Corner Square Markers */}
              <div style={{ position: 'absolute', top: '-3px', left: '-3px', width: '6px', height: '6px', background: '#b7791f' }} />
              <div style={{ position: 'absolute', top: '-3px', right: '-3px', width: '6px', height: '6px', background: '#b7791f' }} />
              <div style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '6px', height: '6px', background: '#b7791f' }} />
              <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '6px', height: '6px', background: '#b7791f' }} />
            </div>

            {/* Header: WCE Crest & Institute Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px', position: 'relative' }}>
              <img
                src="/wce-logo.png"
                alt="WCE Crest"
                style={{ width: '60px', height: '60px', objectFit: 'contain', flexShrink: 0 }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div style={{ flex: 1 }}>
                <h1 style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '18px', fontWeight: '700', color: '#14284b', letterSpacing: '0.4px', lineHeight: 1.2 }}>
                  WALCHAND COLLEGE OF ENGINEERING, SANGLI
                </h1>
                <div style={{ fontSize: '10.5px', color: '#475569', marginTop: '2px', fontStyle: 'italic' }}>
                  (An Autonomous Institute · Government Aided · Established 1947)
                </div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#b7791f', letterSpacing: '0.5px', marginTop: '3px' }}>
                  DEPARTMENT OF COMPUTER SCIENCE AND ENGINEERING
                </div>
              </div>
            </div>

            <div style={{ height: '2px', background: '#14284b', marginBottom: '16px' }} />

            {/* Title & Subtitle */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: '0 0 6px', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '17px', color: '#14284b', fontWeight: '700' }}>
                Faculty Activity &amp; Contribution Report
              </h2>
              <div style={{ fontSize: '10.5px', color: '#475569', lineHeight: 1.4 }}>
                Computer Science and Engineering · Period: {periodLabel} · Generated {istDateStr}, {istTimeStr} IST · Ref: {refCode}
              </div>
            </div>

            {/* Stat Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', background: '#f8fafc' }}>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#14284b', lineHeight: 1 }}>{totalActivities}</div>
                <div style={{ fontSize: '9.5px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', marginTop: '4px' }}>ACTIVITIES</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', background: '#f8fafc' }}>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#15803d', lineHeight: 1 }}>{approvedCount}</div>
                <div style={{ fontSize: '9.5px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', marginTop: '4px' }}>APPROVED</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', background: '#f8fafc' }}>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#1d4ed8', lineHeight: 1 }}>{withCertsCount}</div>
                <div style={{ fontSize: '9.5px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', marginTop: '4px' }}>WITH CERTIFICATES</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', background: '#f8fafc' }}>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#7e22ce', lineHeight: 1 }}>{activityTypesCount}</div>
                <div style={{ fontSize: '9.5px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', marginTop: '4px' }}>ACTIVITY TYPES</div>
              </div>
            </div>

            {/* Activity Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              {records.map((act, index) => {
                const cardColor = getTypeColor(act.type_name);
                const narrativeTokens = buildActivityNarrative(act);
                const cardDate = formatNarrativeDateRange(act);
                const cardHost = normalizeHost(act.host_organisation);
                const cardRole = act.faculty_role || act.role || 'Participant';
                const cardMode = act.mode || 'Online';
                const cardLevel = act.scope || 'National';
                const cardVenue = act.venue || (act.mode === 'Online' ? 'Online Platform' : 'WCE Sangli');

                const atts = act.attachments || [];
                const primaryImage = atts.find(a => a.isPrimary && (a.mimeType?.startsWith('image/') || a.kind === 'image'))
                  || atts.find(a => (a.kind === 'evidence' || a.fileName?.toLowerCase().includes('cert')) && a.mimeType?.startsWith('image/'))
                  || atts.find(a => a.mimeType?.startsWith('image/') || a.kind === 'image')
                  || null;

                const otherImages = atts.filter(a => (a.mimeType?.startsWith('image/') || a.kind === 'image') && a !== primaryImage);

                let imageCaption = 'Certificate of Completion';
                const actTypeLower = (act.type_name || '').toLowerCase();
                if (primaryImage?.caption) {
                  imageCaption = primaryImage.caption;
                } else if (actTypeLower.includes('research') || actTypeLower.includes('publication')) {
                  imageCaption = 'Certificate of Appreciation';
                } else if (actTypeLower.includes('fdp') || actTypeLower.includes('seminar') || actTypeLower.includes('conference')) {
                  imageCaption = 'Certificate of Participation';
                } else if (actTypeLower.includes('visit') || primaryImage?.kind === 'image') {
                  imageCaption = 'Event Photograph';
                }

                const cardImageUrl = primaryImage
                  ? `/api/activity/${act.act_id}/attachments/${primaryImage.id}${tokenQuery}`
                  : null;

                return (
                  <div
                    key={act.act_id || index}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderLeft: `4px solid ${cardColor}`,
                      borderRadius: '8px',
                      padding: '14px 16px',
                      background: '#fff',
                      position: 'relative',
                      pageBreakInside: 'avoid'
                    }}
                  >
                    {/* Top Row: Sr No circle, Type chip, Date, Approved tick */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: cardColor,
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: '700',
                            flexShrink: 0
                          }}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </div>
                        <span
                          style={{
                            background: cardColor,
                            color: '#fff',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '9.5px',
                            fontWeight: '700',
                            letterSpacing: '0.4px',
                            textTransform: 'uppercase'
                          }}
                        >
                          {act.type_name}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>
                          {cardDate}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#15803d', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ✓ Approved by HOD
                      </div>
                    </div>

                    {/* Side-by-side: Details column & Media column (~58mm / 220px) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '16px', alignItems: 'start' }}>
                      {/* Left Details Column */}
                      <div>
                        {/* Narrative Paragraph with bold navy highlights */}
                        <div style={{ fontSize: '12px', lineHeight: 1.5, color: '#334155', textAlign: 'justify', marginBottom: '12px' }}>
                          {narrativeTokens.map((t, idx) => (
                            <span key={idx} style={{ fontWeight: t.bold ? '700' : '400', color: t.bold ? '#14284b' : 'inherit' }}>
                              {t.text}
                            </span>
                          ))}
                        </div>

                        {/* Detail Grid: Role, Mode Level, Host, Venue */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 14px', fontSize: '11px', background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                          <div>
                            <div style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px' }}>ROLE</div>
                            <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '1px' }}>{cardRole}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px' }}>MODE · LEVEL</div>
                            <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '1px' }}>{cardMode} · {cardLevel}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px' }}>HOST / ORGANISER</div>
                            <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '1px' }}>{cardHost}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px' }}>VENUE</div>
                            <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '1px' }}>{cardVenue}</div>
                          </div>
                        </div>
                      </div>

                      {/* Right Media Column (~58mm wide) */}
                      <div>
                        {cardImageUrl ? (
                          <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '5px', background: '#fff', textAlign: 'center' }}>
                            <img
                              src={cardImageUrl}
                              alt={imageCaption}
                              style={{ width: '100%', height: '140px', objectFit: 'contain', background: '#f8fafc', borderRadius: '4px', display: 'block' }}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.nextSibling) {
                                  e.currentTarget.nextSibling.style.display = 'block';
                                }
                              }}
                            />
                            <div style={{ fontSize: '9.5px', color: '#64748b', fontStyle: 'italic', marginTop: '5px' }}>
                              {imageCaption}
                            </div>
                            {/* Thumbnails if extra images exist */}
                            {otherImages.length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', marginTop: '6px', justifyContent: 'center', alignItems: 'center' }}>
                                {otherImages.slice(0, 2).map((oi, oidx) => (
                                  <img
                                    key={oidx}
                                    src={`/api/activity/${act.act_id}/attachments/${oi.id}${tokenQuery}`}
                                    alt="Thumbnail"
                                    style={{ width: '38px', height: '28px', objectFit: 'cover', borderRadius: '3px', border: '1px solid #cbd5e1' }}
                                  />
                                ))}
                                {otherImages.length > 2 && (
                                  <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '700' }}>
                                    +{otherImages.length - 2} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              border: '1.5px dashed #cbd5e1',
                              borderRadius: '6px',
                              height: '140px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '12px',
                              textAlign: 'center',
                              color: '#94a3b8',
                              fontSize: '10.5px',
                              fontStyle: 'italic',
                              lineHeight: 1.4,
                              background: '#fcfdfe'
                            }}
                          >
                            No certificate or photo uploaded for this activity
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ONLY HOD Signature block at bottom right (NO Faculty Coordinator) */}
            <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ textAlign: 'center', minWidth: '220px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: '700', color: '#14284b', marginBottom: '32px' }}>
                  Head of Department
                </div>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#334155' }}>
                  (Dr. A. R. Surve)
                </div>
                <div style={{ fontSize: '9.5px', color: '#64748b' }}>
                  Professor &amp; Head, CSE
                </div>
              </div>
            </div>

            {/* Running Footer on every page */}
            <div style={{ marginTop: '20px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9.5px', color: '#64748b' }}>
              <div>
                Generated from WCE Prof-Insights · Verify at miniproject-app.onrender.com/verify/{refCode.replace(/\//g, '-')}
              </div>
              <div style={{ fontWeight: '700', color: '#14284b' }}>
                Page 1 of 1
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CombinedReportPreviewModal;
