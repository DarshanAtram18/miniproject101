import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import api, { downloadResponse, getActiveToken } from '../api';
import { formatBytes, humanize } from '../utils';

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const formatDateDMY = (dateStr) => {
  if (!dateStr) return '—';
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
};

const DetailedReportModal = ({ activity, user, onClose }) => {
  const [downloading, setDownloading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loadedBlobs, setLoadedBlobs] = useState({});
  const touchStartX = useRef(null);

  if (!activity) return null;

  const startDMY = formatDateDMY(activity.start_date);
  const endDMY   = formatDateDMY(activity.end_date || activity.start_date);
  const today    = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const attachments  = activity.attachments || [];
  const attendFile   = attachments.find(a => a.kind === 'attendance' || a.fileName?.toLowerCase().includes('attend'));
  const proofFile    = attachments.find(a => a.kind === 'evidence' || a.kind === 'report' || a.fileName?.toLowerCase().includes('cert') || a.fileName?.toLowerCase().includes('proof'));
  const photoFiles   = attachments.filter(a => a.kind === 'image' || a.mimeType?.startsWith('image/'));

  useEffect(() => {
    let mounted = true;
    photoFiles.forEach(async (photo) => {
      if (!photo.id || loadedBlobs[photo.id]) return;
      try {
        const resp = await api.get(`/activity/${activity.act_id}/attachments/${photo.id}`, { responseType: 'blob' });
        if (mounted) setLoadedBlobs(p => ({ ...p, [photo.id]: URL.createObjectURL(resp.data) }));
      } catch {}
    });
    return () => { mounted = false; };
  }, [activity.act_id, photoFiles.map(p => p.id).join(',')]);

  const token = getActiveToken();

  const url = (att, inline = true) => {
    if (!att?.id) return '#';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const tok = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${origin}/api/activity/${activity.act_id}/attachments/${att.id}?disposition=${inline ? 'inline' : 'attachment'}${tok}`;
  };

  const galleryUrl = (photoIdx = 0) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const tok = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${origin}/api/activity/${activity.act_id}/gallery?photo=${photoIdx}${tok}`;
  };

  const imgSrc = (photo) => loadedBlobs[photo.id] || url(photo, true);

  const downloadAtt = async (att) => {
    try {
      const r = await api.get(`/activity/${activity.act_id}/attachments/${att.id}`, { responseType: 'blob' });
      downloadResponse(r, att.fileName);
    } catch (e) { alert('Download failed: ' + e.message); }
  };

  // PDF generation
  const handleDownloadPDF = async () => {
    setDownloading(true);
    const safe = String(activity.title || `activity-${activity.act_id}`).replace(/[^a-zA-Z0-9-]+/g, '_').slice(0, 50);
    try {
      const el = document.getElementById('detailed-report-sheet');
      if (!el) throw new Error('Report not found');
      const canvas = await html2canvas(el, { scale: 3, useCORS: true, allowTaint: true, logging: false, backgroundColor: '#ffffff', imageTimeout: 30000 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: false });
      const W = 210, H = 297, mg = 4;
      const pw = W - mg * 2, ph = H - mg * 2;
      let fw = pw, fh = (canvas.height * pw) / canvas.width;
      if (fh > ph) { const s = ph / fh; fw *= s; fh = ph; }
      const xo = mg + (pw - fw) / 2, yo = mg;
      pdf.addImage(imgData, 'PNG', xo, yo, fw, fh, '', 'NONE');
      const sr = el.getBoundingClientRect();
      el.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || href === '#') return;
        const r = a.getBoundingClientRect();
        if (r.width <= 0) return;
        const sx = fw / sr.width, sy = fh / sr.height;
        pdf.link(xo + (r.left - sr.left) * sx, yo + (r.top - sr.top) * sy, r.width * sx, r.height * sy, { url: href });
      });
      pdf.save(`WCE_Activity_Report_${safe}.pdf`);
    } catch (e) { alert('PDF error: ' + e.message); }
    finally { setDownloading(false); }
  };

  const details = activity.details || {};
  const detailRows = Object.entries(details).filter(([, v]) => v !== null && v !== undefined && v !== '');

  const TH = { background: '#1a365d', color: '#fff', padding: '5px 10px', fontWeight: '700', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.7px' };
  const tdL = { padding: '5px 9px', fontWeight: '700', color: '#1a365d', width: '33%', fontSize: '11.5px', verticalAlign: 'top', borderBottom: '1px solid #e8f2ff' };
  const tdV = { padding: '5px 9px', color: '#1e293b', fontSize: '11.5px', verticalAlign: 'top', borderBottom: '1px solid #e8f2ff' };

  // Gallery swipe
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) setActiveIdx(i => Math.min(photoFiles.length - 1, i + 1));
    else         setActiveIdx(i => Math.max(0, i - 1));
  };

  const facultyName = activity.staff_name || user?.name || 'Faculty Member';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-dialog" style={{ maxWidth: '980px', width: '96vw', maxHeight: '94vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* HEADER */}
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--navy-900)' }}>Activity Contribution Report</h2>
            <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '2px 0 0' }}>Walchand College of Engineering, Sangli</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        {/* BODY */}
        <div className="modal-body" style={{ overflowY: 'auto', padding: '14px', background: '#dde4ef' }}>

          {/* ═══════════════════════════════════════════════
              PRINTABLE A4 DOCUMENT
              Layout:
              ┌──── Header (full width) ────┐
              ├──── Title (full width) ─────┤
              ├──── General Details ─────────────────────┤  (full width)
              ├── Specific Data (left) │ Attachments (right) ─┤
              └──── Footer ────────────────────────────────┘
              ═══════════════════════════════════════════════ */}
          <div id="detailed-report-sheet" style={{
            background: '#fff',
            border: '2.5px solid #1a365d',
            borderRadius: '7px',
            padding: '18px 20px 14px',
            maxWidth: '860px',
            margin: '0 auto',
            boxShadow: '0 4px 18px rgba(0,0,0,0.12)',
            fontFamily: '"Segoe UI", Inter, system-ui, sans-serif',
            minHeight: '1060px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>

            {/* Date badges */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {[['From', startDMY], ['To', endDMY]].map(([lbl, val]) => (
                <div key={lbl} style={{ border: '1.5px solid #1a365d', padding: '2px 14px', borderRadius: '4px', background: '#ebf4ff', fontSize: '10.5px', fontWeight: '700', color: '#1a365d' }}>
                  {lbl}: {val}
                </div>
              ))}
            </div>

            {/* Institution header */}
            <div style={{ textAlign: 'center', borderBottom: '2px double #1a365d', paddingBottom: '10px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
                <img src="/wce-logo.png" alt="WCE" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: 'Georgia, serif', color: '#1a365d', fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.3px', lineHeight: 1.2 }}>
                    WALCHAND COLLEGE OF ENGINEERING, SANGLI
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '3px', fontWeight: '600' }}>
                    Faculty Activities &amp; Contribution Portal &nbsp;|&nbsp; {activity.department || user?.department || 'Computer Science &amp; Engineering'}
                  </div>
                </div>
              </div>
            </div>

            {/* Report title */}
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '14px', color: '#1a365d', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '800' }}>
                {activity.type_name || 'FACULTY ACTIVITY'} CONTRIBUTION REPORT
              </span>
              <div style={{ height: '3px', background: 'linear-gradient(90deg,#b7791f,#d69e2e)', borderRadius: '2px', marginTop: '5px' }} />
            </div>

            {/* ── GENERAL ACTIVITY DETAILS — full width ── */}
            <div style={{ border: '1.5px solid #bee3f8', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={TH}>General Activity Details</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    ['Faculty Name', facultyName, true],
                    ['Academic Year', activity.acad_year || '—'],
                    ['Description of Activity', activity.title || 'Untitled', true],
                    ['Date Duration', `${startDMY} to ${endDMY}${activity.start_time ? ` (${activity.start_time}–${activity.end_time || ''})` : ''}`],
                    activity.mode ? ['Mode of Participation', activity.mode] : null,
                    ['Role / Capacity', activity.faculty_role || activity.role || 'Participant / Attendee'],
                  ].filter(Boolean).map(([lbl, val, bold], i) => (
                    <tr key={lbl} style={{ background: i % 2 === 0 ? '#f7fbff' : '#fff' }}>
                      <td style={tdL}>{lbl}:</td>
                      <td style={{ ...tdV, fontWeight: bold ? '600' : '400', color: bold ? '#24507f' : '#1e293b' }}>{val}</td>
                    </tr>
                  ))}

                  {/* Attendance */}
                  <tr style={{ background: '#f7fbff' }}>
                    <td style={tdL}>Attendance List:</td>
                    <td style={tdV}>
                      {attendFile
                        ? <a href={url(attendFile, true)} target="_blank" rel="noreferrer"
                            style={{ color: '#276749', fontWeight: '700', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            📋 <span style={{ borderBottom: '1.5px solid #276749' }}>{attendFile.fileName}</span>
                            <span style={{ fontSize: '9px', background: '#c6f6d5', color: '#276749', padding: '1px 6px', borderRadius: '10px', fontWeight: '700' }}>View ↗</span>
                          </a>
                        : <span style={{ color: '#a0aec0', fontStyle: 'italic', fontSize: '11px' }}>Not Provided</span>}
                    </td>
                  </tr>

                  {/* Certificate */}
                  <tr>
                    <td style={tdL}>Certificate / Proof:</td>
                    <td style={tdV}>
                      {proofFile
                        ? <a href={url(proofFile, true)} target="_blank" rel="noreferrer"
                            style={{ color: '#1e5d91', fontWeight: '700', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            📄 <span style={{ borderBottom: '1.5px solid #1e5d91' }}>{proofFile.fileName}</span>
                            <span style={{ fontSize: '9px', background: '#bee3f8', color: '#1e5d91', padding: '1px 6px', borderRadius: '10px', fontWeight: '700' }}>View ↗</span>
                          </a>
                        : <span style={{ color: '#a0aec0', fontStyle: 'italic', fontSize: '11px' }}>Not Provided</span>}
                    </td>
                  </tr>

                  {/* Photos — count only, no filenames */}
                  <tr style={{ background: '#fffbeb' }}>
                    <td style={{ ...tdL, borderBottom: 'none' }}>Photos of Event:</td>
                    <td style={{ ...tdV, borderBottom: 'none' }}>
                      {photoFiles.length > 0
                        ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '700', color: '#92400e', fontSize: '12px' }}>
                              ✓ {photoFiles.length} photo{photoFiles.length > 1 ? 's' : ''} attached
                            </span>
                            <a href={galleryUrl(0)} target="_blank" rel="noreferrer"
                              onClick={e => { e.preventDefault(); setActiveIdx(0); setGalleryOpen(true); }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#92400e', color: '#fff', textDecoration: 'none', borderRadius: '5px', padding: '3px 10px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>
                              🖼️ View Photos
                            </a>
                          </div>
                        : <span style={{ color: '#a0aec0', fontStyle: 'italic', fontSize: '11px' }}>Not Provided</span>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── BOTTOM: Specific Data (left) + Attachments (right) ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr', gap: '10px', flex: 1 }}>

              {/* LEFT: Specific Contribution Data */}
              <div style={{ border: '1.5px solid #c3dafe', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ ...TH, background: '#2d4a99' }}>Specific Contribution Data</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      activity.host_organisation ? ['Host / Organiser', activity.host_organisation] : null,
                      activity.venue             ? ['Venue', activity.venue] : null,
                      activity.scope             ? ['Level / Scope', activity.scope] : null,
                      activity.participant_count != null ? ['Participants Count', String(activity.participant_count)] : null,
                      ...(activity.guests?.length ? activity.guests.map((g, idx) => [
                        activity.guests.length > 1 ? `Invited Guest ${idx + 1}` : 'Invited Guest / Speaker',
                        `${g.name}${g.designation || g.organisation ? ` (${[g.designation, g.organisation, g.country].filter(Boolean).join(', ')})` : ''}${g.guestRole ? ` — ${g.guestRole}` : ''}`
                      ]) : []),
                      ...detailRows.map(([k, v]) => [humanize(k), typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)]),
                      activity.outcomes          ? ['Recorded Outcomes', activity.outcomes] : null,
                    ].filter(Boolean).map(([lbl, val], i) => (
                      <tr key={lbl} style={{ background: i % 2 === 0 ? '#f0f5ff' : '#fff' }}>
                        <td style={{ ...tdL, color: '#2d4a99', borderBottom: '1px solid #e0eaff' }}>{lbl}:</td>
                        <td style={{ ...tdV, color: '#1e293b', borderBottom: '1px solid #e0eaff' }}>{val}</td>
                      </tr>
                    ))}
                    {activity.official_url && (
                      <tr>
                        <td style={{ ...tdL, color: '#2d4a99', borderBottom: 'none' }}>Official Source:</td>
                        <td style={{ ...tdV, borderBottom: 'none' }}>
                          <a href={activity.official_url} target="_blank" rel="noreferrer" style={{ color: '#2d4a99', wordBreak: 'break-all', fontSize: '10.5px' }}>{activity.official_url}</a>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* RIGHT: Attachment panels */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                {/* Attendance */}
                <div style={{ border: '1.5px solid #9ae6b4', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ ...TH, background: '#276749' }}>Attendance List</div>
                  <div style={{ padding: '9px 10px' }}>
                    {attendFile
                      ? <>
                          <div style={{ fontSize: '10.5px', fontWeight: '600', color: '#1e293b', wordBreak: 'break-all', marginBottom: '2px' }}>📋 {attendFile.fileName}</div>
                          <div style={{ fontSize: '9px', color: '#718096', marginBottom: '6px' }}>{formatBytes(attendFile.sizeBytes)}</div>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <a href={url(attendFile, true)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm"
                              style={{ fontSize: '10px', padding: '3px 8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Icon name="eye" size={11} /> View
                            </a>
                            <a href={url(attendFile, false)} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm"
                              style={{ fontSize: '10px', padding: '3px 8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Icon name="download" size={11} /> Download
                            </a>
                          </div>
                        </>
                      : <span style={{ fontSize: '10px', color: '#a0aec0', fontStyle: 'italic' }}>Not Provided</span>}
                  </div>
                </div>

                {/* Certificate */}
                <div style={{ border: '1.5px solid #feb2b2', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ ...TH, background: '#c53030' }}>Certificate / Proof</div>
                  <div style={{ padding: '9px 10px' }}>
                    {proofFile
                      ? <>
                          <div style={{ fontSize: '10.5px', fontWeight: '600', color: '#1e293b', wordBreak: 'break-all', marginBottom: '2px' }}>📄 {proofFile.fileName}</div>
                          <div style={{ fontSize: '9px', color: '#718096', marginBottom: '6px' }}>{formatBytes(proofFile.sizeBytes)}</div>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <a href={url(proofFile, true)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm"
                              style={{ fontSize: '10px', padding: '3px 8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Icon name="eye" size={11} /> View
                            </a>
                            <a href={url(proofFile, false)} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm"
                              style={{ fontSize: '10px', padding: '3px 8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Icon name="download" size={11} /> Download
                            </a>
                          </div>
                        </>
                      : <span style={{ fontSize: '10px', color: '#a0aec0', fontStyle: 'italic' }}>Not Provided</span>}
                  </div>
                </div>

                {/* Event Photos */}
                <div style={{ border: '1.5px solid #f6d860', borderRadius: '5px', overflow: 'hidden', flex: 1 }}>
                  <div style={{ ...TH, background: '#92400e' }}>Event Photos ({photoFiles.length})</div>
                  <div style={{ padding: '9px 10px' }}>
                    {photoFiles.length > 0
                      ? <>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                            {photoFiles.slice(0, 9).map((photo, idx) => (
                              <a key={photo.id || idx} href={galleryUrl(idx)} target="_blank" rel="noreferrer"
                                onClick={e => { e.preventDefault(); setActiveIdx(idx); setGalleryOpen(true); }}
                                style={{ width: '40px', height: '32px', borderRadius: '3px', overflow: 'hidden', border: '1.5px solid #f6d860', display: 'inline-block', cursor: 'pointer', textDecoration: 'none', background: '#f1f5f9' }}>
                                <img src={imgSrc(photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              </a>
                            ))}
                            {photoFiles.length > 9 && (
                              <div style={{ width: '40px', height: '32px', borderRadius: '3px', background: '#92400e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '700', cursor: 'pointer' }}
                                onClick={() => { setActiveIdx(0); setGalleryOpen(true); }}>
                                +{photoFiles.length - 9}
                              </div>
                            )}
                          </div>
                          <a href={galleryUrl(0)} target="_blank" rel="noreferrer"
                            onClick={e => { e.preventDefault(); setActiveIdx(0); setGalleryOpen(true); }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: 'linear-gradient(135deg,#92400e,#b7791f)', color: '#fff', textDecoration: 'none', borderRadius: '5px', padding: '6px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                            🖼️ View All Photos ({photoFiles.length})
                          </a>
                        </>
                      : <span style={{ fontSize: '10px', color: '#a0aec0', fontStyle: 'italic' }}>Not Provided</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer — "Generated by" */}
            <div style={{ borderTop: '1.5px solid #e2e8f0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '9.5px', color: '#718096' }}>
                Generated by <strong style={{ color: '#1a365d' }}>{facultyName}</strong> on {today} · Walchand College of Engineering, Sangli
              </div>
              <div style={{ fontSize: '9.5px', color: '#718096', fontStyle: 'italic' }}>
                Status: {activity.workflow_status || 'Submitted'}
              </div>
            </div>
          </div>
          {/* END PRINTABLE SHEET */}
        </div>

        {/* FOOTER */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            {attachments.length} file(s) · Status: <strong>{activity.workflow_status || 'Submitted'}</strong>
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" type="button" onClick={onClose}>Close</button>
            <button className="btn btn-primary" type="button" disabled={downloading} onClick={handleDownloadPDF}>
              {downloading ? <span className="button-spinner" /> : <Icon name="download" size={16} />}
              {downloading ? 'Generating…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ GALLERY LIGHTBOX — mobile-friendly with swipe ═══ */}
      {galleryOpen && photoFiles.length > 0 && (
        <div onClick={() => setGalleryOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#0f172a', width: '100%', maxWidth: '900px', maxHeight: '100dvh', display: 'flex', flexDirection: 'column', borderRadius: '0', overflow: 'hidden' }}>

            {/* Top bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#1a365d', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: '700', fontSize: '14px' }}>Photo {activeIdx + 1} / {photoFiles.length}</div>
                <div style={{ color: '#90b4d8', fontSize: '10px', marginTop: '1px', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photoFiles[activeIdx]?.fileName}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button type="button" onClick={() => downloadAtt(photoFiles[activeIdx])}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Icon name="download" size={14} /> Save
                </button>
                <button type="button" onClick={() => setGalleryOpen(false)}
                  style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>

            {/* Main image area */}
            <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 0, padding: '8px' }}>
              <button type="button" onClick={() => setActiveIdx(i => Math.max(0, i - 1))} disabled={activeIdx === 0}
                style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 2, background: activeIdx === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.22)', border: 'none', borderRadius: '50%', width: '52px', height: '52px', cursor: activeIdx === 0 ? 'default' : 'pointer', color: '#fff', fontSize: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: activeIdx === 0 ? 0.3 : 1, touchAction: 'manipulation' }}>‹</button>
              <img key={activeIdx} src={imgSrc(photoFiles[activeIdx])} alt={photoFiles[activeIdx].fileName}
                style={{ maxWidth: 'calc(100% - 120px)', maxHeight: 'calc(100dvh - 200px)', objectFit: 'contain', borderRadius: '4px', userSelect: 'none' }} />
              <button type="button" onClick={() => setActiveIdx(i => Math.min(photoFiles.length - 1, i + 1))} disabled={activeIdx === photoFiles.length - 1}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 2, background: activeIdx === photoFiles.length - 1 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.22)', border: 'none', borderRadius: '50%', width: '52px', height: '52px', cursor: activeIdx === photoFiles.length - 1 ? 'default' : 'pointer', color: '#fff', fontSize: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: activeIdx === photoFiles.length - 1 ? 0.3 : 1, touchAction: 'manipulation' }}>›</button>
            </div>

            {/* Dot indicators */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '10px', flexShrink: 0 }}>
              {photoFiles.map((_, idx) => (
                <button key={idx} type="button" onClick={() => setActiveIdx(idx)}
                  style={{ width: idx === activeIdx ? '22px' : '8px', height: '8px', borderRadius: '4px', background: idx === activeIdx ? '#f6d860' : 'rgba(255,255,255,0.3)', border: 'none', cursor: 'pointer', transition: 'all 0.2s', padding: 0, touchAction: 'manipulation' }} />
              ))}
            </div>

            {/* Thumbnail strip */}
            {photoFiles.length > 1 && (
              <div style={{ padding: '8px 12px 12px', background: '#1e293b', display: 'flex', gap: '6px', overflowX: 'auto', flexShrink: 0, WebkitOverflowScrolling: 'touch' }}>
                {photoFiles.map((img, idx) => (
                  <img key={img.id || idx} src={imgSrc(img)} alt="" onClick={() => setActiveIdx(idx)}
                    style={{ width: '56px', height: '44px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', flexShrink: 0, border: idx === activeIdx ? '2.5px solid #f6d860' : '2px solid transparent', opacity: idx === activeIdx ? 1 : 0.55, transition: 'all 0.15s', touchAction: 'manipulation' }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DetailedReportModal;
