import React, { useState, useEffect, useRef } from 'react';
import api, { downloadResponse, getBlobErrorMessage } from '../api';
import Icon from './Icon';

const fmtDate = (d) => {
  if (!d) return '-';
  const s = String(d).split('T')[0];
  const [y, m, dd] = s.split('-');
  if (!y) return d;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${Number(dd)} ${months[Number(m)-1]} ${y}`;
};
const fmtRange = (act) => {
  const s = fmtDate(act.start_date);
  const e = act.end_date && act.end_date !== act.start_date ? fmtDate(act.end_date) : '';
  return e ? `${s} to ${e}` : s;
};

function buildBody(act) {
  const role = String(act.faculty_role || '').toLowerCase();
  const scope = String(act.scope || '').toLowerCase();
  const type = (act.type_name || 'activity').toLowerCase();
  const dept = act.department || 'Computer Science and Engineering';
  const mode = String(act.mode || '').toLowerCase();
  const host = act.host_organisation;
  const outcomes = act.outcomes;
  const participants = act.participant_count;
  let involvementPhrase = 'participated in';
  let roleDesc = 'participant';
  if (role.includes('organis') || role.includes('organiz') || role.includes('coordinator') || role.includes('convenor') || role.includes('head')) {
    involvementPhrase = 'successfully organised and coordinated'; roleDesc = 'organiser and coordinator';
  } else if (role.includes('speaker') || role.includes('resource person') || role.includes('keynote') || role.includes('expert')) {
    involvementPhrase = 'delivered an expert talk and served as a resource person at'; roleDesc = 'invited speaker';
  } else if (role.includes('judge') || role.includes('evaluator') || role.includes('reviewer')) {
    involvementPhrase = 'served as a distinguished judge and evaluator at'; roleDesc = 'evaluator';
  } else if (role.includes('trainer') || role.includes('facilitator')) {
    involvementPhrase = 'led and facilitated training sessions at'; roleDesc = 'trainer and facilitator';
  } else if (role.includes('chair') || role.includes('session')) {
    involvementPhrase = 'chaired a technical session at'; roleDesc = 'session chair';
  }
  let scopePhrase = 'at the institute level';
  if (scope.includes('international')) scopePhrase = 'at the international level';
  else if (scope.includes('national')) scopePhrase = 'at the national level';
  else if (scope.includes('state')) scopePhrase = 'at the state level';
  else if (scope.includes('university') || scope.includes('inter-college')) scopePhrase = 'at the university/inter-college level';
  const hostPhrase = host && host.toLowerCase() !== 'no' && host.toLowerCase() !== 'none' && host.toLowerCase() !== 'wce' ? ` organised by / at ${host}` : '';
  const modePhrase = mode && mode !== 'offline' ? ` (conducted in ${mode} mode)` : '';
  const outcomesSentence = outcomes && outcomes.trim().length > 10 ? ` The outcomes of this engagement were particularly noteworthy: ${outcomes.trim().endsWith('.') ? outcomes.trim() : outcomes.trim() + '.'}` : '';
  const participantsSentence = participants && Number(participants) > 0 ? ` The activity benefited ${participants} participants, directly contributing to the enrichment of our academic community.` : '';
  let typeSpecific = 'Your consistent efforts in enriching the academic and professional environment of our department reflect the highest ideals of a dedicated educator and researcher.';
  if (type.includes('fdp') || type.includes('faculty development') || type.includes('training'))
    typeSpecific = `Your commitment to continuous professional development and lifelong learning is an inspiration to colleagues and students alike. Attending and ${roleDesc === 'organiser and coordinator' ? 'organising' : 'participating in'} such programmes directly strengthens our department\'s academic capacity and research culture.`;
  else if (type.includes('research') || type.includes('publication') || type.includes('paper') || type.includes('journal'))
    typeSpecific = `Research dissemination at ${act.scope || 'reputed'} forums is a cornerstone of academic excellence. Your scholarly contribution advances the department\'s research profile and brings recognition to Walchand College of Engineering on the ${act.scope || 'academic'} stage.`;
  else if (type.includes('guest') || type.includes('lecture') || type.includes('seminar'))
    typeSpecific = 'Organising distinguished guest sessions bridges the gap between industry and academia, and provides students with invaluable exposure to expert practitioners and thought leaders. Your role in facilitating this knowledge exchange is deeply valued.';
  else if (type.includes('workshop') || type.includes('conference') || type.includes('symposium'))
    typeSpecific = `Events of this nature are pivotal in creating collaborative academic environments and sharing cutting-edge knowledge across disciplines. Your ${roleDesc} role has helped foster an intellectually vibrant atmosphere in our institution.`;
  else if (type.includes('club') || type.includes('student') || type.includes('co-curricular'))
    typeSpecific = 'Student-centric activities are the hallmark of a holistic educational experience. Your guidance and mentorship in co-curricular pursuits have a lasting and meaningful impact on student development, leadership, and innovation.';
  else if (type.includes('award') || type.includes('achievement') || type.includes('recognition'))
    typeSpecific = 'Achievements of this calibre reflect not only personal excellence but also the high standards of scholarship maintained at Walchand College of Engineering. This recognition is a testament to your sustained dedication and outstanding professional conduct.';
  const opening = `The Department of ${dept} takes great pleasure in recognising and placing on official record its sincere appreciation to ${act.staff_name || 'the faculty member'} for ${involvementPhrase} the ${type} titled "${act.title || 'the activity'}"${hostPhrase}${modePhrase}, held on ${fmtRange(act)} ${scopePhrase}.`;
  const body = `${typeSpecific}${outcomesSentence}${participantsSentence}`;
  const closing = 'Your dedication, initiative, and hard work have made a substantial contribution to the academic stature, vibrant knowledge sharing, and overall excellence of the department. The Department and Walchand College of Engineering are proud of your achievement and extend heartfelt congratulations with best wishes for continued success in all your future academic and professional endeavours.';
  return { opening, body, closing };
}

const SignaturePad = ({ onSave, onClear, existingSignature }) => {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef(null);
  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const startDraw = (e) => { e.preventDefault(); isDrawingRef.current = true; lastPosRef.current = getPos(e, canvasRef.current); };
  const draw = (e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y); ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a365d'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    lastPosRef.current = pos;
  };
  const stopDraw = () => { isDrawingRef.current = false; };
  const clearCanvas = () => { canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); onClear?.(); };
  const saveSignature = () => { onSave(canvasRef.current.toDataURL('image/png')); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {existingSignature && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src={existingSignature} alt="Uploaded signature" style={{ height: '40px', maxWidth: '160px', objectFit: 'contain', background: '#fff', padding: '2px', border: '1px solid #e2e8f0', borderRadius: '4px' }} />
          <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>Profile signature uploaded - draw a session-only override below</span>
        </div>
      )}
      <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', background: '#fafbff', touchAction: 'none', overflow: 'hidden' }}>
        <canvas ref={canvasRef} width={480} height={110} style={{ display: 'block', width: '100%', cursor: 'crosshair' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
      </div>
      <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>Draw your signature above with mouse or finger</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={clearCanvas} style={{ flex: 1, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>Clear</button>
        <button type="button" onClick={saveSignature} style={{ flex: 2, padding: '8px', border: 'none', borderRadius: '6px', background: '#1a365d', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Use This Signature</button>
      </div>
    </div>
  );
};

const LetterPreview = ({ act, edits, hodSignature, drawnSignature }) => {
  const auto = buildBody(act);
  const opening = edits.opening || auto.opening;
  const body = edits.body || auto.body;
  const closing = edits.closing || auto.closing;
  const reviewerName = edits.reviewerName || act.reviewer_name || 'Dr. A. R. Surve';
  const reviewerTitle = edits.reviewerTitle || 'Head of Department';
  const dept = act.department || 'Computer Science and Engineering';
  const deptAbbr = dept.replace(/[^A-Z]/g, '').slice(0, 3) || 'CSE';
  const refCode = `WCE/${deptAbbr}/APPR/${act.acad_year || '2025-26'}/${String(act.act_id || 101).padStart(4, '0')}`;
  const issueDateStr = act.reviewed_at ? new Date(act.reviewed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const sigToShow = drawnSignature || hodSignature;
  const recipientRole = act.staff_designation || (String(act.faculty_role || '').toLowerCase().includes('club') ? 'Club Representative' : 'Faculty Member');
  return (
    <div style={{ background: '#fff', border: '2.5px solid #1a365d', borderRadius: '2px', padding: '28px 32px 24px', fontFamily: 'Georgia, serif', fontSize: '10.5px', color: '#1e293b', boxShadow: '0 4px 24px rgba(0,0,0,0.13)', position: 'relative', minHeight: '900px' }}>
      <div style={{ position: 'absolute', inset: '5px', border: '1px solid #b7791f', borderRadius: '1px', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '10px' }}>
        <div style={{ flexShrink: 0, width: '50px', height: '50px', background: '#1a365d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '14px' }}>WCE</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#1a365d', fontWeight: 900, fontSize: '12.5px', fontFamily: 'Arial, sans-serif' }}>WALCHAND COLLEGE OF ENGINEERING, SANGLI</div>
          <div style={{ color: '#64748b', fontSize: '8px', fontFamily: 'Arial, sans-serif', marginTop: '1px' }}>(An Autonomous Institute - Government Aided - Established 1947)</div>
          <div style={{ color: '#b7791f', fontWeight: 800, fontSize: '10px', fontFamily: 'Arial, sans-serif', marginTop: '2px' }}>DEPARTMENT OF {dept.toUpperCase()}</div>
          <div style={{ color: '#64748b', fontSize: '7.5px', fontFamily: 'Arial, sans-serif' }}>Vishrambag, Sangli, Maharashtra - 416415 | www.walchandsangli.ac.in</div>
        </div>
      </div>
      <div style={{ borderTop: '2px solid #1a365d', borderBottom: '0.5px solid #b7791f', marginBottom: '8px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#475569', fontFamily: 'Arial, sans-serif', marginBottom: '10px' }}>
        <span>Ref: {refCode}</span>
        <span>Date of Issue: {issueDateStr}</span>
      </div>
      <div style={{ border: '1.5px solid #b7791f', background: '#fffbeb', textAlign: 'center', padding: '7px 20px', margin: '0 40px 14px', borderRadius: '3px' }}>
        <span style={{ color: '#1a365d', fontWeight: 900, fontSize: '14px', fontFamily: 'Arial, sans-serif', letterSpacing: '2px' }}>LETTER OF APPRECIATION</span>
      </div>
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <div style={{ color: '#64748b', fontStyle: 'italic', fontSize: '9px', marginBottom: '4px' }}>This letter of appreciation is proudly presented to</div>
        <div style={{ color: '#1a365d', fontWeight: 900, fontSize: '17px', fontFamily: 'Arial, sans-serif', marginBottom: '4px' }}>{act.staff_name || 'Contributor'}</div>
        <div style={{ width: '180px', height: '1.2px', background: '#b7791f', margin: '0 auto 4px' }} />
        <div style={{ color: '#334155', fontSize: '9.5px' }}>{recipientRole} | {dept}</div>
        <div style={{ color: '#64748b', fontSize: '8.5px' }}>Walchand College of Engineering, Sangli</div>
      </div>
      <p style={{ textAlign: 'justify', lineHeight: 1.65, marginBottom: '10px', fontSize: '10px', fontFamily: 'Arial, sans-serif' }}>{opening}</p>
      <div style={{ border: '1px solid #cbd5e1', borderRadius: '5px', background: '#f8fafc', marginBottom: '12px', borderLeft: '4px solid #b7791f', padding: '10px 14px' }}>
        <div style={{ color: '#1a365d', fontWeight: 800, fontSize: '11.5px', fontFamily: 'Arial, sans-serif', marginBottom: '4px' }}>{act.title || 'Untitled Activity'}</div>
        <div style={{ color: '#475569', fontSize: '8.5px', fontFamily: 'Arial, sans-serif', marginBottom: '8px' }}>
          Category: {act.type_name || 'Faculty Activity'} | Involvement: {act.faculty_role || 'Participant'} | Academic Year: {act.acad_year || '2025-26'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '2px 8px', fontSize: '9px', fontFamily: 'Arial, sans-serif' }}>
          <b>DURATION AND DATE:</b><span>{fmtRange(act)}</span>
          <b>MODE AND SCOPE:</b><span>{[act.mode, act.scope ? act.scope + ' Level' : null].filter(Boolean).join(' / ') || 'Institute Level'}</span>
          {(act.host_organisation && act.host_organisation.toLowerCase() !== 'no') ? <><b>HOST / ORGANISER:</b><span>{act.host_organisation}{act.venue ? ' / ' + act.venue : ''}</span></> : null}
          {act.participant_count ? <><b>BENEFICIARIES:</b><span>{act.participant_count} Registered Participants</span></> : null}
          {act.summary ? <><b>KEY HIGHLIGHT:</b><span>{String(act.summary).slice(0, 160)}{act.summary.length > 160 ? '...' : ''}</span></> : null}
        </div>
      </div>
      <p style={{ textAlign: 'justify', lineHeight: 1.65, marginBottom: '10px', fontSize: '10px', fontFamily: 'Arial, sans-serif' }}>{body}</p>
      <p style={{ textAlign: 'justify', lineHeight: 1.65, marginBottom: '16px', fontSize: '10px', fontFamily: 'Arial, sans-serif' }}>{closing}</p>
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <div style={{ flex: '0 0 195px', border: '1px solid #94a3b8', borderRadius: '5px', background: '#f8fafc', padding: '8px', fontSize: '8px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '8.5px', color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>SEAL OF AUTHORITY</div>
          <div style={{ fontWeight: 700, fontSize: '7.5px', color: '#1e293b' }}>DEPARTMENT OF {dept.toUpperCase().slice(0, 35)}</div>
          <div style={{ color: '#64748b', marginTop: '2px' }}>Walchand College of Engineering, Sangli</div>
          <div style={{ color: '#64748b' }}>Autonomous Institute of Govt. of Maharashtra</div>
          <div style={{ color: '#15803d', fontWeight: 800, marginTop: '6px' }}>INSTITUTIONAL RECORD: VERIFIED</div>
          <div style={{ color: '#64748b', marginTop: '2px' }}>Approval Status: {act.workflow_status || 'Approved'}</div>
          <div style={{ color: '#94a3b8', fontSize: '7px', marginTop: '2px' }}>{refCode}</div>
        </div>
        <div style={{ flex: 1, border: '1.5px solid #16a34a', borderRadius: '5px', background: '#f0fdf4', overflow: 'hidden' }}>
          <div style={{ background: '#16a34a', color: '#fff', textAlign: 'center', padding: '5px', fontSize: '8.5px', fontWeight: 800, fontFamily: 'Arial, sans-serif' }}>HOD APPROVED - DIGITAL SIGNATURE</div>
          <div style={{ padding: '8px 12px' }}>
            {sigToShow ? (
              <img src={sigToShow} alt="HOD Signature" style={{ height: '52px', maxWidth: '160px', objectFit: 'contain', display: 'block', marginBottom: '4px' }} />
            ) : (
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '15px', color: '#14532d', fontStyle: 'italic', fontWeight: 700, marginBottom: '2px' }}>{reviewerName}</div>
            )}
            {!sigToShow && <div style={{ fontSize: '7.5px', color: '#64748b', fontStyle: 'italic', marginBottom: '4px' }}>(Signature not yet uploaded)</div>}
            <div style={{ fontWeight: 800, fontSize: '9px', color: '#166534', fontFamily: 'Arial, sans-serif' }}>{reviewerTitle}</div>
            <div style={{ fontSize: '8px', color: '#15803d', fontFamily: 'Arial, sans-serif' }}>{dept}</div>
            <div style={{ fontSize: '7.5px', color: '#166534', fontFamily: 'Arial, sans-serif', marginTop: '2px' }}>Approved: {issueDateStr}</div>
          </div>
        </div>
      </div>
      <div style={{ borderTop: '0.5px solid #cbd5e1', marginTop: '12px', paddingTop: '8px', textAlign: 'center', fontSize: '7px', color: '#94a3b8', fontFamily: 'Arial, sans-serif' }}>
        This is an official digitally signed Letter of Appreciation generated from the verified WCE Prof-Insights Academic Repository.
      </div>
    </div>
  );
};

const AppreciationLetterModal = ({ activityId, activityTitle, user, onClose, showNotification }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState(null);
  const [hodSignature, setHodSignature] = useState(null);
  const [drawnSignature, setDrawnSignature] = useState(null);
  const [activeTab, setActiveTab] = useState('preview');
  const [downloading, setDownloading] = useState(false);
  const [edits, setEdits] = useState({ opening: '', body: '', closing: '', reviewerName: '', reviewerTitle: '' });
  const isHod = ['HOD', 'Admin'].includes(user?.role);

  useEffect(() => {
    setLoading(true);
    api.get(`/activity/${activityId}/appreciation-letter/preview`)
      .then(res => {
        setActivity(res.data.activity);
        setHodSignature(res.data.hodSignatureData || null);
        setEdits(e => ({ ...e, reviewerName: res.data.activity?.reviewer_name || 'Dr. A. R. Surve', reviewerTitle: 'Head of Department' }));
        setLoading(false);
      })
      .catch(err => {
        setError(err?.response?.data?.error || 'Unable to load letter preview.');
        setLoading(false);
      });
  }, [activityId]);

  const autoText = activity ? buildBody(activity) : {};

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const overrides = {};
      if (isHod) {
        if (edits.opening) overrides.custom_opening = edits.opening;
        if (edits.body) overrides.custom_body = edits.body;
        if (edits.closing) overrides.custom_closing = edits.closing;
        if (edits.reviewerName) overrides.custom_reviewer_name = edits.reviewerName;
        if (edits.reviewerTitle) overrides.custom_reviewer_title = edits.reviewerTitle;
      }
      const hasOverrides = Object.keys(overrides).length > 0 || drawnSignature;
      let response;
      if (hasOverrides) {
        response = await api.post(`/activity/${activityId}/appreciation-letter`, { overrides, customSignature: drawnSignature || undefined }, { responseType: 'blob' });
      } else {
        response = await api.get(`/activity/${activityId}/appreciation-letter`, { responseType: 'blob' });
      }
      const safeName = String(activityTitle || 'activity').replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 40);
      downloadResponse(response, `appreciation-letter-${activityId}-${safeName}.pdf`);
      showNotification?.('Appreciation letter downloaded successfully!');
    } catch (err) {
      const msg = await getBlobErrorMessage(err, 'Unable to generate the appreciation letter.');
      showNotification?.(msg, 'error');
    } finally {
      setDownloading(false);
    }
  };

  const tabBtn = (id, label, badge) => (
    <button type="button" onClick={() => setActiveTab(id)}
      style={{ padding: '9px 18px', border: 'none', borderBottom: activeTab === id ? '3px solid #1a365d' : '3px solid transparent', background: 'transparent', color: activeTab === id ? '#1a365d' : '#64748b', fontWeight: activeTab === id ? 800 : 500, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
      {label}
      {badge && <span style={{ background: '#16a34a', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px' }}>{badge}</span>}
    </button>
  );

  if (loading) return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '48px 64px', textAlign: 'center' }}>
        <div style={{ width: '36px', height: '36px', border: '4px solid #e2e8f0', borderTopColor: '#1a365d', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <div style={{ color: '#475569', fontWeight: 600 }}>Loading appreciation letter...</div>
      </div>
    </div>
  );

  if (error) return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '32px', maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: '8px', fontSize: '16px' }}>Unable to load letter</div>
        <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>{error}</div>
        <button onClick={onClose} style={{ padding: '10px 28px', background: '#1a365d', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Close</button>
      </div>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.82)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#f8fafc', borderRadius: '14px', width: '100%', maxWidth: isHod ? '1100px' : '700px', maxHeight: '96dvh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 64px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #1a365d 0%, #2a4d8f 100%)', color: '#fff', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '10px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="award" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#90b4d8', marginBottom: '2px' }}>Appreciation Letter</div>
            <div style={{ fontWeight: 800, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activityTitle || 'Faculty Activity'}</div>
          </div>
          {isHod && <div style={{ background: '#f59e0b', color: '#78350f', padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 800, flexShrink: 0 }}>HOD MODE</div>}
          <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>x</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff', paddingLeft: '12px', flexShrink: 0, overflowX: 'auto' }}>
          {tabBtn('preview', 'Preview Letter')}
          {isHod && tabBtn('edit', 'Edit Content')}
          {isHod && tabBtn('sign', 'Draw Signature', drawnSignature ? 'Done' : null)}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {activeTab === 'preview' && (
            <div style={{ padding: '20px', maxWidth: '700px', margin: '0 auto' }}>
              {activity.workflow_status !== 'Approved' && (
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#92400e', fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Icon name="alert" size={16} />
                  <span>This activity is not yet approved. The letter shown is a preview only.</span>
                </div>
              )}
              {isHod && (edits.opening || edits.body || edits.closing) && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#1e40af', fontWeight: 600 }}>
                  Custom edits are active and reflected in this preview.
                </div>
              )}
              <LetterPreview act={activity} edits={edits} hodSignature={hodSignature} drawnSignature={drawnSignature} />
            </div>
          )}
          {activeTab === 'edit' && isHod && (
            <div style={{ padding: '20px', maxWidth: '820px', margin: '0 auto' }}>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px', marginBottom: '20px', fontSize: '12.5px', color: '#1e40af' }}>
                <strong>HOD Edit Mode:</strong> All fields are pre-filled with auto-generated content. Leave blank to keep auto-generated text. Changes appear live in the Preview tab.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                  { key: 'opening', label: 'Opening Paragraph', placeholder: autoText.opening, rows: 4 },
                  { key: 'body', label: 'Main Body Paragraph', placeholder: autoText.body, rows: 5 },
                  { key: 'closing', label: 'Closing / Congratulatory Paragraph', placeholder: autoText.closing, rows: 4 },
                ].map(({ key, label, placeholder, rows }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '12.5px', color: '#1a365d', marginBottom: '6px' }}>{label}</label>
                    <div style={{ position: 'relative' }}>
                      <textarea rows={rows} value={edits[key]} onChange={e => setEdits(ed => ({ ...ed, [key]: e.target.value }))} placeholder={placeholder}
                        style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }} />
                      {edits[key] && (
                        <button type="button" onClick={() => setEdits(ed => ({ ...ed, [key]: '' }))}
                          style={{ position: 'absolute', top: '8px', right: '8px', background: '#fee2e2', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>
                          Reset
                        </button>
                      )}
                    </div>
                    {!edits[key] && <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '3px' }}>Using auto-generated text (leave blank to keep)</div>}
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '12.5px', color: '#1a365d', marginBottom: '6px' }}>HOD / Signatory Name</label>
                    <input type="text" value={edits.reviewerName} onChange={e => setEdits(ed => ({ ...ed, reviewerName: e.target.value }))} placeholder="Dr. A. R. Surve"
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '12.5px', color: '#1a365d', marginBottom: '6px' }}>Signatory Title</label>
                    <input type="text" value={edits.reviewerTitle} onChange={e => setEdits(ed => ({ ...ed, reviewerTitle: e.target.value }))} placeholder="Head of Department"
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <button type="button" onClick={() => setEdits({ opening: '', body: '', closing: '', reviewerName: activity?.reviewer_name || 'Dr. A. R. Surve', reviewerTitle: 'Head of Department' })}
                  style={{ alignSelf: 'flex-start', padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '12px', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
                  Reset All to Auto-Generated
                </button>
              </div>
            </div>
          )}
          {activeTab === 'sign' && isHod && (
            <div style={{ padding: '20px', maxWidth: '620px', margin: '0 auto' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px', marginBottom: '20px', fontSize: '12.5px', color: '#166534' }}>
                <strong>Session Signature:</strong> Draw your signature below for this download only. To save permanently, go to My Profile - HOD Digital Signature.
              </div>
              <SignaturePad existingSignature={hodSignature}
                onSave={(sig) => { setDrawnSignature(sig); showNotification?.('Signature captured! Check the Preview tab.'); setActiveTab('preview'); }}
                onClear={() => setDrawnSignature(null)} />
              {drawnSignature && (
                <div style={{ marginTop: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={drawnSignature} alt="Drawn signature" style={{ height: '44px', maxWidth: '160px', objectFit: 'contain', background: '#fff', padding: '4px', border: '1px solid #e2e8f0', borderRadius: '4px' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: '#15803d' }}>Session signature ready</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Will appear in the downloaded PDF</div>
                    <button type="button" onClick={() => setDrawnSignature(null)} style={{ marginTop: '4px', background: 'none', border: 'none', color: '#dc2626', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: 600 }}>Remove</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', background: '#fff', padding: '12px 20px', display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>Close</button>
            {isHod && (
              <>
                <button type="button" onClick={() => setActiveTab('edit')} style={{ padding: '9px 18px', border: '1px solid #bfdbfe', borderRadius: '8px', background: '#eff6ff', fontSize: '13px', color: '#1e40af', cursor: 'pointer', fontWeight: 600 }}>
                  Edit Content
                </button>
                <button type="button" onClick={() => setActiveTab('sign')} style={{ padding: '9px 18px', border: '1px solid #bbf7d0', borderRadius: '8px', background: '#f0fdf4', fontSize: '13px', color: '#166534', cursor: 'pointer', fontWeight: 600 }}>
                  {drawnSignature ? 'Update Signature' : 'Draw Signature'}
                </button>
              </>
            )}
          </div>
          <button type="button" onClick={handleDownload} disabled={downloading}
            style={{ padding: '10px 24px', border: 'none', borderRadius: '8px', background: downloading ? '#94a3b8' : 'linear-gradient(135deg, #1a365d, #2a4d8f)', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: downloading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'opacity 0.2s' }}>
            {downloading ? 'Generating PDF...' : <><Icon name="download" size={16} /> Download PDF</>}
          </button>
        </div>
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
};

export default AppreciationLetterModal;
