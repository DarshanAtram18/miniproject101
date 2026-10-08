import React, { useState, useEffect, useRef } from 'react';
import api, { downloadResponse, getBlobErrorMessage } from '../api';
import Icon from './Icon';
import wceLogo from '../assets/wce-logo.png';

/* ── helpers ── */
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

/* ── auto letter text ── */
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
    typeSpecific = `Your commitment to continuous professional development and lifelong learning is an inspiration to colleagues and students alike. Attending and ${roleDesc === 'organiser and coordinator' ? 'organising' : 'participating in'} such programmes directly strengthens our department's academic capacity and research culture.`;
  else if (type.includes('research') || type.includes('publication') || type.includes('paper') || type.includes('journal'))
    typeSpecific = `Research dissemination at ${act.scope || 'reputed'} forums is a cornerstone of academic excellence. Your scholarly contribution advances the department's research profile and brings recognition to Walchand College of Engineering on the ${act.scope || 'academic'} stage.`;
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

/* ── Signature Pad with smooth curve drawing & upload ── */
const SignaturePad = ({ onSave, existingSignature, isHod }) => {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const pointsRef = useRef([]);
  const historyRef = useRef([]);
  const [mode, setMode] = useState('draw'); // 'draw' | 'upload'
  const [penColor, setPenColor] = useState('#1a365d');
  const [lineWidth, setLineWidth] = useState(2.8);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedPreview, setUploadedPreview] = useState(null);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const fileInputRef = useRef(null);

  const colors = [
    { label: 'Navy Blue', value: '#1a365d' },
    { label: 'Charcoal Black', value: '#0f172a' },
    { label: 'Royal Blue', value: '#2563eb' }
  ];

  const widths = [
    { label: 'Fine', value: 1.8 },
    { label: 'Medium', value: 2.8 },
    { label: 'Bold', value: 4.2 }
  ];

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const saveCanvasState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > 20) historyRef.current.shift();
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveCanvasState();
    isDrawingRef.current = true;
    const pos = getPos(e, canvas);
    pointsRef.current = [pos];
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = penColor;
    ctx.fill();
    setHasDrawn(true);
  };

  const draw = (e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pos = getPos(e, canvas);
    pointsRef.current.push(pos);
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = penColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pts = pointsRef.current;
    if (pts.length >= 3) {
      const xc = (pts[pts.length - 2].x + pts[pts.length - 1].x) / 2;
      const yc = (pts[pts.length - 2].y + pts[pts.length - 1].y) / 2;
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 3].x, pts[pts.length - 3].y);
      ctx.quadraticCurveTo(pts[pts.length - 2].x, pts[pts.length - 2].y, xc, yc);
      ctx.stroke();
    } else if (pts.length === 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.stroke();
    }
  };

  const stopDraw = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    pointsRef.current = [];
  };

  const undoLast = () => {
    const canvas = canvasRef.current;
    if (!canvas || historyRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    const prevState = historyRef.current.pop();
    ctx.putImageData(prevState, 0, 0);
    if (historyRef.current.length === 0) setHasDrawn(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveCanvasState();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const useDrawn = () => {
    if (!canvasRef.current || !hasDrawn) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl, saveToProfile);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedPreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const useUploaded = () => {
    if (uploadedPreview) onSave(uploadedPreview, saveToProfile);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Mode Toggle */}
      <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '4px' }}>
        {[['draw', '✍️ Draw Signature Canvas'], ['upload', '📁 Upload Image File']].map(([m, label]) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            style={{ flex: 1, padding: '9px 14px', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
              background: mode === m ? '#1a365d' : 'transparent',
              color: mode === m ? '#fff' : '#64748b' }}>
            {label}
          </button>
        ))}
      </div>

      {existingSignature && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src={existingSignature} alt="Profile signature" style={{ height: '40px', maxWidth: '140px', objectFit: 'contain', background: '#fff', padding: '3px', border: '1px solid #e2e8f0', borderRadius: '4px' }} />
          <div>
            <div style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 700 }}>Profile signature is configured</div>
            <div style={{ fontSize: '10.5px', color: '#64748b' }}>You can draw or upload below to customize for this letter or update your default</div>
          </div>
        </div>
      )}

      {mode === 'draw' && (
        <>
          {/* Controls toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Pen Color:</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {colors.map(c => (
                  <button key={c.value} type="button" onClick={() => setPenColor(c.value)}
                    style={{ width: '22px', height: '22px', borderRadius: '50%', background: c.value, border: penColor === c.value ? '2px solid #f59e0b' : '1px solid #cbd5e1', cursor: 'pointer', transform: penColor === c.value ? 'scale(1.15)' : 'none' }}
                    title={c.label} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Stroke:</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {widths.map(w => (
                  <button key={w.value} type="button" onClick={() => setLineWidth(w.value)}
                    style={{ padding: '2px 8px', borderRadius: '4px', border: lineWidth === w.value ? '1.5px solid #1a365d' : '1px solid #e2e8f0', background: lineWidth === w.value ? '#eff6ff' : '#fff', color: lineWidth === w.value ? '#1a365d' : '#64748b', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={undoLast}
              style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '11.5px', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>
              ↩ Undo
            </button>
          </div>

          <div style={{ border: '2px dashed #94a3b8', borderRadius: '10px', background: '#fafcff', overflow: 'hidden', touchAction: 'none', position: 'relative' }}>
            <canvas ref={canvasRef} width={640} height={160}
              style={{ display: 'block', width: '100%', height: '160px', cursor: 'crosshair', userSelect: 'none' }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
            />
            {!hasDrawn && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>
                ✍️ Draw your signature here using mouse or touch screen
              </div>
            )}
          </div>

          {isHod && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#1e293b', cursor: 'pointer', userSelect: 'none', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <input type="checkbox" checked={saveToProfile} onChange={e => setSaveToProfile(e.target.checked)} />
              <span><strong>Save permanently to my HOD profile</strong> (will auto-apply to all future letters)</span>
            </label>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={clearCanvas}
              style={{ flex: 1, padding: '10px', border: '1.5px solid #cbd5e1', borderRadius: '8px', background: '#fff', fontSize: '13px', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
              🗑 Clear Canvas
            </button>
            <button type="button" onClick={useDrawn} disabled={!hasDrawn}
              style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', background: !hasDrawn ? '#cbd5e1' : 'linear-gradient(135deg,#1a365d,#2a4d8f)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: !hasDrawn ? 'not-allowed' : 'pointer' }}>
              ✅ Apply This Signature
            </button>
          </div>
        </>
      )}

      {mode === 'upload' && (
        <>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ border: '2px dashed #94a3b8', borderRadius: '10px', background: '#fafcff', minHeight: '130px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', padding: '20px', transition: 'border-color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#1a365d'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#94a3b8'}
          >
            {uploadedPreview ? (
              <img src={uploadedPreview} alt="Uploaded signature" style={{ maxHeight: '100px', maxWidth: '300px', objectFit: 'contain', borderRadius: '4px', background: '#fff', padding: '6px', border: '1px solid #e2e8f0' }} />
            ) : (
              <>
                <div style={{ fontSize: '32px' }}>📂</div>
                <div style={{ fontSize: '13.5px', color: '#1a365d', fontWeight: 700 }}>Click to browse signature image</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Supports PNG, JPG, or GIF (transparent PNG recommended)</div>
              </>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </div>

          {isHod && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#1e293b', cursor: 'pointer', userSelect: 'none', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <input type="checkbox" checked={saveToProfile} onChange={e => setSaveToProfile(e.target.checked)} />
              <span><strong>Save permanently to my HOD profile</strong> (will auto-apply to all future letters)</span>
            </label>
          )}

          {uploadedPreview && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => { setUploadedPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                style={{ flex: 1, padding: '10px', border: '1.5px solid #cbd5e1', borderRadius: '8px', background: '#fff', fontSize: '13px', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
                🗑 Remove
              </button>
              <button type="button" onClick={useUploaded}
                style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', background: 'linear-gradient(135deg,#1a365d,#2a4d8f)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                ✅ Apply Uploaded Signature
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ── Letter Preview ── */
const LetterPreview = ({ act, edits, hodSignature, drawnSignature }) => {
  const auto = buildBody(act);
  const opening = edits.opening || auto.opening;
  const body = edits.body || auto.body;
  const closing = edits.closing || auto.closing;
  const reviewerName = edits.reviewerName || act.details?.appreciation_letter?.issued_by_name || act.reviewer_name || 'Dr. A. R. Surve';
  const reviewerTitle = edits.reviewerTitle || act.details?.appreciation_letter?.issued_by_title || 'Head of Department';
  const dept = act.department || 'Computer Science and Engineering';
  const deptAbbr = dept.replace(/[^A-Z]/g, '').slice(0, 3) || 'CSE';
  const refCode = `WCE/${deptAbbr}/APPR/${act.acad_year || '2025-26'}/${String(act.act_id || 101).padStart(4, '0')}`;
  
  const issueDateRaw = act.details?.appreciation_letter?.issued_at || act.reviewed_at || new Date();
  const issueDateStr = new Date(issueDateRaw).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const sigToShow = drawnSignature || hodSignature;
  const isClub = String(act.staff_designation || '').toLowerCase().includes('club') ||
    String(act.faculty_role || '').toLowerCase().includes('club') ||
    String(act.type_name || '').toLowerCase().includes('club');
  const recipientRole = isClub
    ? `Club — ${act.staff_name || 'Club Representative'}`
    : (act.staff_designation || 'Faculty Member');

  return (
    <div style={{ background: '#fff', border: '2.5px solid #1a365d', borderRadius: '2px', padding: '28px 32px 24px', fontFamily: 'Georgia, serif', fontSize: '10.5px', color: '#1e293b', boxShadow: '0 4px 24px rgba(0,0,0,0.13)', position: 'relative', minHeight: '880px' }}>
      <div style={{ position: 'absolute', inset: '5px', border: '1px solid #b7791f', borderRadius: '1px', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '10px' }}>
        <img
          src={wceLogo || '/wce-logo.png'}
          alt="Walchand College of Engineering Logo"
          style={{ flexShrink: 0, width: '56px', height: '56px', objectFit: 'contain' }}
        />
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
            {!sigToShow && <div style={{ fontSize: '7.5px', color: '#64748b', fontStyle: 'italic', marginBottom: '4px' }}>(Signature not yet added)</div>}
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

/* ── Main Modal ── */
const AppreciationLetterModal = ({ activityId, activityTitle, user, onClose, showNotification }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState(null);
  const [hodSignature, setHodSignature] = useState(null);
  const [drawnSignature, setDrawnSignature] = useState(null);
  const [activeTab, setActiveTab] = useState('preview');
  const [downloading, setDownloading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [isIssued, setIsIssued] = useState(false);
  const [issuedAt, setIssuedAt] = useState(null);
  const [issuedBy, setIssuedBy] = useState(null);
  const [edits, setEdits] = useState({ opening: '', body: '', closing: '', reviewerName: '', reviewerTitle: '' });
  const [serverIsHod, setServerIsHod] = useState(false); // default false — never expose HOD controls to Faculty/Club
  // isHod is true ONLY if BOTH client-side role AND server explicitly confirmed it
  // Faculty and Club roles can NEVER be isHod under any circumstance
  const clientIsHod = user?.role === 'HOD' || user?.role === 'Admin';
  const isHod = Boolean(clientIsHod && serverIsHod === true);

  useEffect(() => {
    setLoading(true);
    api.get(`/activity/${activityId}/appreciation-letter/preview`)
      .then(res => {
        setActivity(res.data.activity);
        setHodSignature(res.data.hodSignatureData || null);
        setIsIssued(Boolean(res.data.isIssued));
        setIssuedAt(res.data.issuedAt || null);
        setIssuedBy(res.data.issuedBy || null);
        setServerIsHod(Boolean(res.data.isHod));

        const saved = res.data.letterData || {};
        setEdits({
          opening: saved.custom_opening || '',
          body: saved.custom_body || '',
          closing: saved.custom_closing || '',
          reviewerName: saved.issued_by_name || res.data.activity?.reviewer_name || 'Dr. A. R. Surve',
          reviewerTitle: saved.issued_by_title || 'Head of Department'
        });
        if (saved.custom_signature) {
          setDrawnSignature(saved.custom_signature);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err?.response?.data?.error || 'Unable to load appreciation letter.');
        setLoading(false);
      });
  }, [activityId]);

  const autoText = activity ? buildBody(activity) : {};

  const handleSignatureCaptured = async (sigData, saveToProfile) => {
    setDrawnSignature(sigData);
    if (saveToProfile && isHod) {
      try {
        await api.put('/auth/profile', { signature_image: sigData });
        setHodSignature(sigData);
        showNotification?.('Signature saved to your profile and applied to letter!');
      } catch {
        showNotification?.('Signature applied for this session (profile update failed).', 'warning');
      }
    } else {
      showNotification?.('Signature captured! Switched to Preview tab.');
    }
    setActiveTab('preview');
  };

  const handleIssueLetter = async () => {
    setIssuing(true);
    try {
      const overrides = {};
      if (edits.opening) overrides.custom_opening = edits.opening;
      if (edits.body) overrides.custom_body = edits.body;
      if (edits.closing) overrides.custom_closing = edits.closing;
      if (edits.reviewerName) overrides.custom_reviewer_name = edits.reviewerName;
      if (edits.reviewerTitle) overrides.custom_reviewer_title = edits.reviewerTitle;

      const res = await api.post(`/activity/${activityId}/appreciation-letter/issue`, {
        overrides,
        customSignature: drawnSignature || undefined
      });
      setIsIssued(true);
      setIssuedAt(new Date().toISOString());
      setActivity(res.data.activity);
      showNotification?.('Official Appreciation Letter successfully issued and delivered to faculty member!', 'success');
      setActiveTab('preview');
    } catch (err) {
      showNotification?.(err?.response?.data?.error || 'Unable to issue appreciation letter.', 'error');
    } finally {
      setIssuing(false);
    }
  };

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
      const hasOverrides = isHod && (Object.keys(overrides).length > 0 || drawnSignature);
      let response;
      if (hasOverrides) {
        response = await api.post(
          `/activity/${activityId}/appreciation-letter`,
          { overrides, customSignature: drawnSignature || undefined },
          { responseType: 'blob' }
        );
      } else {
        response = await api.get(`/activity/${activityId}/appreciation-letter`, { responseType: 'blob' });
      }
      const safeName = String(activityTitle || activity?.title || 'activity').replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 40);
      downloadResponse(response, `appreciation-letter-${activityId}-${safeName}.pdf`);
      showNotification?.('Appreciation letter downloaded successfully!');
    } catch (err) {
      const msg = await getBlobErrorMessage(err, 'Unable to generate the appreciation letter.');
      showNotification?.(msg, 'error');
    } finally {
      setDownloading(false);
    }
  };

  // Hard guard — faculty/club absolutely cannot switch to edit/sign tabs
  const switchTab = (id) => {
    if (!isHod) return; // Block all tab switching for non-HOD
    setActiveTab(id);
  };

  const tabBtn = (id, label, badge) => (
    <button type="button" onClick={() => switchTab(id)}
      style={{ padding: '10px 18px', border: 'none', borderBottom: activeTab === id ? '3px solid #1a365d' : '3px solid transparent', background: 'transparent', color: activeTab === id ? '#1a365d' : '#64748b', fontWeight: activeTab === id ? 800 : 500, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px', transition: 'color 0.15s' }}>
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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', padding: '40px 36px', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ width: '64px', height: '64px', background: 'linear-gradient(135deg,#1a365d,#2a4d8f)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '28px' }}>🔒</div>
        <div style={{ color: '#0f172a', fontWeight: 900, marginBottom: '8px', fontSize: '18px', fontFamily: 'Arial, sans-serif' }}>Appreciation Letter Not Yet Issued</div>
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px', marginBottom: '16px', textAlign: 'left' }}>
          <div style={{ color: '#0369a1', fontWeight: 700, fontSize: '12px', marginBottom: '6px' }}>📋 How it works:</div>
          <ol style={{ margin: 0, paddingLeft: '18px', color: '#0c4a6e', fontSize: '12px', lineHeight: 1.7 }}>
            <li>Your activity must be <strong>approved</strong> by HOD</li>
            <li>HOD reviews and personalises the appreciation letter</li>
            <li>HOD officially issues and sends it to your account</li>
            <li>You will receive a <strong>bell notification</strong> when it is ready</li>
          </ol>
        </div>
        <div style={{ color: '#64748b', fontSize: '12.5px', marginBottom: '20px', lineHeight: 1.6 }}>{error}</div>
        <button onClick={onClose} style={{ padding: '11px 36px', background: 'linear-gradient(135deg,#1a365d,#2a4d8f)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Understood</button>
      </div>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.82)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#f8fafc', borderRadius: '14px', width: '100%', maxWidth: isHod ? '1100px' : '760px', maxHeight: '96dvh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 64px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1a365d 0%, #2a4d8f 100%)', color: '#fff', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '10px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="award" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#90b4d8', marginBottom: '2px' }}>
              {isHod ? 'Appreciation Letter Management' : 'Official Letter of Appreciation'}
            </div>
            <div style={{ fontWeight: 800, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activityTitle || activity?.title || 'Faculty Activity'}
            </div>
          </div>
          {isHod ? (
            <div style={{ background: '#f59e0b', color: '#78350f', padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 800, flexShrink: 0 }}>
              HOD ISSUER MODE
            </div>
          ) : (
            <div style={{ background: '#16a34a', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 800, flexShrink: 0 }}>
              🏅 AWARDED TO YOU
            </div>
          )}
          <button type="button" onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '34px', height: '34px', color: '#fff', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>✕</button>
        </div>

        {/* Status bar for HOD */}
        {isHod && (
          <div style={{ background: isIssued ? '#f0fdf4' : '#fffbeb', borderBottom: '1px solid ' + (isIssued ? '#bbf7d0' : '#fde68a'), padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>{isIssued ? '✅' : '⏳'}</span>
              <strong style={{ color: isIssued ? '#15803d' : '#b45309' }}>
                {isIssued ? `Officially Issued & Sent to Faculty on ${fmtDate(issuedAt)}` : 'Draft Mode: Not yet issued to faculty'}
              </strong>
            </div>
            <span style={{ color: '#64748b', fontSize: '11px' }}>
              {isIssued ? 'Faculty can view & download this letter in their login' : 'Faculty cannot access this letter until you click "Issue & Send to Faculty"'}
            </span>
          </div>
        )}

        {/* Tabs for HOD ONLY */}
        {isHod && (
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff', paddingLeft: '12px', flexShrink: 0, overflowX: 'auto' }}>
            {tabBtn('preview', '👁 Preview Letter')}
            {tabBtn('edit', '✏️ Edit Content', (edits.opening || edits.body || edits.closing) ? '✎' : null)}
            {tabBtn('sign', '✍️ Signature', drawnSignature ? '✓' : null)}
          </div>
        )}

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

          {/* PREVIEW TAB (Visible to both; strictly read-only for faculty) */}
          {activeTab === 'preview' && (
            <div style={{ padding: '20px', maxWidth: '720px', margin: '0 auto' }}>
              {!isHod && (
                <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #86efac', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 8px rgba(22,101,52,0.08)' }}>
                  <span style={{ fontSize: '24px' }}>🎉</span>
                  <div>
                    <div style={{ fontWeight: 800, color: '#166534', fontSize: '13px' }}>Official Commendation from Head of Department</div>
                    <div style={{ color: '#15803d', fontSize: '11.5px', marginTop: '2px' }}>
                      Walchand College of Engineering and your Head of Department have awarded you this official Letter of Appreciation in recognition of your academic contribution.
                    </div>
                  </div>
                </div>
              )}

              {isHod && activity?.workflow_status !== 'Approved' && (
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#92400e', fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'center' }}>
                  ⚠️ <span>This activity is currently Submitted. Clicking "Issue & Send to Faculty" below will automatically approve it and award the letter to the faculty member.</span>
                </div>
              )}

              {isHod && (edits.opening || edits.body || edits.closing) && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#1e40af', fontWeight: 600 }}>
                  ✎ Custom edits are active and reflected in this preview.
                </div>
              )}

              {isHod && drawnSignature && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#166534', fontWeight: 600, display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <img src={drawnSignature} alt="Sig" style={{ height: '32px', objectFit: 'contain', background: '#fff', borderRadius: '4px', border: '1px solid #e2e8f0', padding: '2px' }} />
                  Session signature ready — will appear in issued letter and PDF
                </div>
              )}

              <LetterPreview act={activity} edits={edits} hodSignature={hodSignature} drawnSignature={drawnSignature} />
            </div>
          )}

          {/* EDIT TAB (HOD ONLY) */}
          {activeTab === 'edit' && isHod && (
            <div style={{ padding: '20px', maxWidth: '820px', margin: '0 auto' }}>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px', marginBottom: '20px', fontSize: '12.5px', color: '#1e40af' }}>
                <strong>HOD Edit Mode:</strong> Personalize the official appreciation letter for this faculty member. Leave fields blank to keep institutional auto-generated wording. Changes will be saved and reflected in the faculty member's portal when you click <strong>"Issue & Send to Faculty"</strong>.
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
                <button type="button"
                  onClick={() => setEdits({ opening: '', body: '', closing: '', reviewerName: activity?.reviewer_name || 'Dr. A. R. Surve', reviewerTitle: 'Head of Department' })}
                  style={{ alignSelf: 'flex-start', padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '12px', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
                  ↺ Reset All to Auto-Generated
                </button>
              </div>
            </div>
          )}

          {/* SIGNATURE TAB (HOD ONLY) */}
          {activeTab === 'sign' && isHod && (
            <div style={{ padding: '20px', maxWidth: '680px', margin: '0 auto' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px', marginBottom: '20px', fontSize: '12.5px', color: '#166534' }}>
                <strong>Add Your Signature:</strong> Draw smoothly with your mouse or touch screen, or upload a clear signature image. Check "Save to my HOD profile" to store it permanently for all future letters.
              </div>
              <SignaturePad
                existingSignature={hodSignature}
                isHod={isHod}
                onSave={handleSignatureCaptured}
              />
              {drawnSignature && (
                <div style={{ marginTop: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <img src={drawnSignature} alt="Current signature" style={{ height: '46px', maxWidth: '160px', objectFit: 'contain', background: '#fff', padding: '4px', border: '1px solid #e2e8f0', borderRadius: '4px' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: '#15803d' }}>✅ Signature ready</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Will appear in the issued letter and PDF</div>
                    <button type="button" onClick={() => setDrawnSignature(null)}
                      style={{ marginTop: '4px', background: 'none', border: 'none', color: '#dc2626', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: 600 }}>Remove</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ borderTop: '1px solid #e2e8f0', background: '#fff', padding: '12px 20px', display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
              Close
            </button>
            {/* HOD-only shortcut buttons */}
            {isHod && (
              <>
                <button type="button" onClick={() => switchTab('edit')}
                  style={{ padding: '9px 18px', border: '1px solid #bfdbfe', borderRadius: '8px', background: '#eff6ff', fontSize: '13px', color: '#1e40af', cursor: 'pointer', fontWeight: 600 }}>
                  ✏️ Edit Content
                </button>
                <button type="button" onClick={() => switchTab('sign')}
                  style={{ padding: '9px 18px', border: '1px solid #bbf7d0', borderRadius: '8px', background: '#f0fdf4', fontSize: '13px', color: '#166534', cursor: 'pointer', fontWeight: 600 }}>
                  {drawnSignature ? '✍️ Update Signature' : '✍️ Add Signature'}
                </button>
              </>
            )}
            {/* Faculty/Club: verified badge only */}
            {!isHod && (
              <span style={{ fontSize: '11.5px', color: '#166534', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Icon name="check" size={14} /> Official Document · Issued & Verified by HOD · Read-Only
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* HOD: Issue & Send button */}
            {isHod && (
              <button
                type="button"
                onClick={handleIssueLetter}
                disabled={issuing}
                style={{
                  padding: '10px 22px', border: 'none', borderRadius: '8px',
                  background: isIssued ? '#16a34a' : 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
                  color: '#fff', fontSize: '13px', fontWeight: 800,
                  cursor: issuing ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  boxShadow: '0 4px 12px rgba(22,163,74,0.3)', transition: 'all 0.15s'
                }}
              >
                {issuing ? '⏳ Sending Letter...' : isIssued ? '✅ Re-Send to Faculty / Club' : '📤 Issue & Send to Faculty / Club'}
              </button>
            )}

            {/* Download: HOD always, Faculty/Club ONLY if letter is officially issued */}
            {(isHod || isIssued) && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  padding: '10px 24px', border: 'none', borderRadius: '8px',
                  background: downloading ? '#94a3b8' : isHod
                    ? 'linear-gradient(135deg,#1a365d,#2a4d8f)'
                    : 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
                  color: '#fff', fontSize: '13px', fontWeight: 800,
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  boxShadow: isHod ? undefined : '0 4px 14px rgba(22,163,74,0.3)',
                  transition: 'opacity 0.2s'
                }}
              >
                {downloading ? '⏳ Generating PDF...' : <><Icon name="download" size={16} /> {isHod ? 'Download PDF' : 'Download Official Letter (PDF)'}</>}
              </button>
            )}
          </div>
        </div>
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
};

export default AppreciationLetterModal;
