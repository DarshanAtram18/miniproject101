import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import { initials } from '../utils';
import api, { getErrorMessage } from '../api';

const Profile = ({ user, onUpdateUser, onChangePassword, onSignOut }) => {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Name & Profile details state
  const [name, setName] = useState(user.name || '');
  const [salutation, setSalutation] = useState(user.salutation || 'Prof.');
  const [designation, setDesignation] = useState(user.designation || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const nameInputRef = useRef(null);

  useEffect(() => {
    setName(user.name || '');
    setSalutation(user.salutation || 'Prof.');
    setDesignation(user.designation || '');
  }, [user.name, user.salutation, user.designation]);

  // Signature state (HOD / Admin only)
  const [hasSignature, setHasSignature] = useState(false);
  const [sigLoading, setSigLoading] = useState(false);
  const [sigMsg, setSigMsg] = useState('');
  const [sigError, setSigError] = useState('');
  const [sigPreview, setSigPreview] = useState(null);
  const fileRef = useRef(null);

  const isReviewer = ['HOD', 'Admin'].includes(user.role);

  // Load signature status on mount for HOD/Admin
  useEffect(() => {
    if (!isReviewer) return;
    api.get('/auth/signature-status')
      .then(res => setHasSignature(res.data.hasSignature))
      .catch(() => {});
  }, [isReviewer]);

  const submit = async (event) => {
    event.preventDefault();
    if (form.newPassword.length < 8) {
      setError('The new password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('The new password and confirmation do not match.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onChangePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const updateProfileDetails = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setProfileError('Full name must contain at least 2 characters.');
      return;
    }
    setProfileSaving(true);
    setProfileMsg('');
    setProfileError('');
    try {
      const res = await api.patch('/auth/profile', {
        name: trimmedName,
        salutation,
        designation: designation.trim()
      });
      setProfileMsg('Name and profile details updated successfully! Your corrected name is now active across all reports, certificates, and activity records.');
      if (onUpdateUser && res.data?.user) {
        onUpdateUser(res.data.user);
      }
    } catch (err) {
      setProfileError(getErrorMessage(err, 'Unable to update profile.'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSignatureFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSigError('Please upload a PNG or JPEG image file.');
      return;
    }
    if (file.size > 400_000) {
      setSigError('Signature image must be smaller than 400 KB. Crop or compress the image first.');
      return;
    }
    setSigError('');
    const reader = new FileReader();
    reader.onload = (e) => setSigPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const uploadSignature = async () => {
    if (!sigPreview) return;
    setSigLoading(true);
    setSigMsg('');
    setSigError('');
    try {
      await api.post('/auth/upload-signature', { signatureImage: sigPreview });
      setHasSignature(true);
      setSigMsg('Signature uploaded successfully. It will appear in all future Appreciation Letters.');
      setSigPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setSigError(getErrorMessage(err, 'Unable to upload signature.'));
    } finally {
      setSigLoading(false);
    }
  };

  const removeSignature = async () => {
    if (!window.confirm('Remove your uploaded signature? Appreciation letters will show a "signature pending" note until you upload a new one.')) return;
    setSigLoading(true);
    setSigMsg('');
    setSigError('');
    try {
      await api.delete('/auth/signature');
      setHasSignature(false);
      setSigPreview(null);
      setSigMsg('Signature removed.');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setSigError(getErrorMessage(err, 'Unable to remove signature.'));
    } finally {
      setSigLoading(false);
    }
  };

  return (
    <div className="profile-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{user.role === 'Club' ? 'Club identity' : user.role === 'HOD' || user.role === 'Admin' ? 'HOD identity' : 'Faculty identity'}</span>
          <h1>My profile and security</h1>
          <p>{user.role === 'Club' ? 'Your club name and department are used as the verified source for every activity submission and report.' : 'Your department is used as the verified source for every new activity and report.'}</p>
        </div>
      </div>

      <div className="profile-layout">
        <section className="data-card profile-summary-card">
          <div className="profile-cover" />
          <div className="profile-summary-content">
            <span className="profile-large-avatar">{initials(user.name)}</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              <h2 style={{ margin: 0 }}>{user.name}</h2>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#1E3A8A' }}
                onClick={() => {
                  nameInputRef.current?.focus();
                  nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                title="Edit name and surname"
              >
                <Icon name="edit" size={13} /> Edit
              </button>
            </div>
            <p>{user.designation || (user.role === 'Club' ? 'Club Coordinator' : 'Faculty')} · {user.department}</p>
            <span className={`role-badge role-${(user.role || '').toLowerCase()}`}>{user.role}</span>
            <dl>
              <div><dt>{user.role === 'Club' ? 'Account email' : 'Faculty email'}</dt><dd>{user.email}</dd></div>
              <div><dt>Primary department</dt><dd>{user.department}</dd></div>
              <div><dt>Designation</dt><dd>{user.designation || (user.role === 'Club' ? 'Club Coordinator' : 'Faculty')}</dd></div>
              <div><dt>Portal role</dt><dd>{user.role}</dd></div>
            </dl>
            <div className="inline-alert info">
              <Icon name="info" size={18} />
              <p>Department and portal role are managed by administrator. You can edit your full name, surname, title, and password anytime.</p>
            </div>
          </div>
        </section>

        <div className="profile-main-column">

          {/* ── Personal Identity & Name Correction Form ── */}
          <section className="form-card" aria-labelledby="profile-info-title" style={{ marginBottom: '1.5rem' }}>
            <div className="form-card-header">
              <div>
                <span className="section-kicker">Personal Identity</span>
                <h2 id="profile-info-title">{user.role === 'Club' ? 'Club & Coordinator Details' : 'Full Name & Academic Salutation'}</h2>
              </div>
              <Icon name="edit" />
            </div>
            <form className="form-card-body" onSubmit={updateProfileDetails}>
              <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.5 }}>
                {user.role === 'Club'
                  ? 'Update your official club or student chapter display name. This name is used across all event records and activity summaries.'
                  : 'Update your official full name (First Name, Surname) or academic prefix. If your surname or spelling was entered incorrectly, correct it here to reflect accurately across all reports, registers, and certificates.'}
              </p>

              {profileError && <div className="inline-alert error" role="alert" style={{ marginBottom: '0.75rem' }}><Icon name="alert" size={18} /><span>{profileError}</span></div>}
              {profileMsg && <div className="inline-alert success" role="status" style={{ marginBottom: '0.75rem' }}><Icon name="check" size={18} /><span>{profileMsg}</span></div>}

              <div className="form-grid two-columns" style={{ gap: '1rem', alignItems: 'flex-start' }}>
                {user.role !== 'Club' && (
                  <div className="form-group" style={{ maxWidth: '240px' }}>
                    <label htmlFor="select-salutation">Official Salutation</label>
                    <select
                      id="select-salutation"
                      className="form-control"
                      value={salutation}
                      onChange={(e) => setSalutation(e.target.value)}
                    >
                      <option value="Prof.">Prof. (Professor)</option>
                      <option value="Dr.">Dr. (Doctor)</option>
                      <option value="Mr.">Mr.</option>
                      <option value="Mrs.">Mrs.</option>
                      <option value="Ms.">Ms.</option>
                    </select>
                    <span className="helper-text">Prefix used in all reports.</span>
                  </div>
                )}

                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="input-full-name">
                    {user.role === 'Club' ? 'Club / Chapter Name' : 'Full Name (First Name & Surname)'} <span className="required-mark">*</span>
                  </label>
                  <input
                    id="input-full-name"
                    ref={nameInputRef}
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={user.role === 'Club' ? 'e.g. ACM Student Chapter' : 'e.g. Abhay Kulkarni'}
                    required
                  />
                  <span className="helper-text">
                    {user.role === 'Club'
                      ? 'Official organization name formatted in summaries.'
                      : 'Your official full name formatted across all institutional reports.'}
                  </span>
                </div>
              </div>

              {user.role !== 'Club' && (
                <div className="form-group" style={{ marginTop: '0.75rem', maxWidth: '380px' }}>
                  <label htmlFor="input-designation">Academic Designation</label>
                  <input
                    id="input-designation"
                    type="text"
                    className="form-control"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Assistant Professor, Associate Professor"
                  />
                  <span className="helper-text">Current academic designation.</span>
                </div>
              )}

              <div className="form-inline-actions" style={{ marginTop: '1.25rem' }}>
                <button className="btn btn-primary" type="submit" disabled={profileSaving}>
                  {profileSaving ? <span className="button-spinner" /> : <Icon name="check" size={17} />}
                  {profileSaving ? 'Saving…' : 'Save Name & Details'}
                </button>
              </div>
            </form>
          </section>

          {/* ── HOD Digital Signature Panel ── */}
          {isReviewer && (
            <section className="form-card" aria-labelledby="sig-title" style={{ marginBottom: '1.5rem' }}>
              <div className="form-card-header">
                <div>
                  <span className="section-kicker">Appreciation letters</span>
                  <h2 id="sig-title">HOD Digital Signature</h2>
                </div>
                <Icon name="check" />
              </div>
              <div className="form-card-body">

                {/* Status pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.3rem 0.85rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700,
                    background: hasSignature ? '#dcfce7' : '#fef9c3',
                    color: hasSignature ? '#15803d' : '#92400e',
                    border: `1px solid ${hasSignature ? '#86efac' : '#fde047'}`
                  }}>
                    {hasSignature ? '✓ Signature on file' : '⚠ No signature uploaded'}
                  </span>
                  {hasSignature && (
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.3rem 0.8rem' }}
                      type="button"
                      onClick={removeSignature}
                      disabled={sigLoading}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.6 }}>
                  Upload your handwritten signature as a <strong>PNG or JPEG</strong> (max 400 KB, transparent background preferred).
                  It will automatically appear in every <em>Appreciation Letter</em> PDF generated for activities in your department.
                </p>

                {/* File picker */}
                <div className="form-group">
                  <label htmlFor="sig-file-input">Select signature image</label>
                  <input
                    id="sig-file-input"
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="form-control"
                    style={{ padding: '0.45rem' }}
                    onChange={handleSignatureFile}
                  />
                  <span className="helper-text">Recommended: scan or photograph your signature on white paper, crop tightly, save as PNG.</span>
                </div>

                {/* Live preview */}
                {sigPreview && (
                  <div style={{
                    margin: '1rem 0',
                    padding: '1rem',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '0.5rem'
                  }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signature preview</span>
                    <div style={{ background: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                      <img
                        src={sigPreview}
                        alt="Signature preview"
                        style={{ maxWidth: '220px', maxHeight: '90px', objectFit: 'contain', display: 'block' }}
                      />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>This is how it will appear in the PDF</span>
                  </div>
                )}

                {/* Feedback messages */}
                {sigError && <div className="inline-alert error" role="alert" style={{ marginBottom: '0.75rem' }}><Icon name="alert" size={18} /><span>{sigError}</span></div>}
                {sigMsg && <div className="inline-alert success" role="status" style={{ marginBottom: '0.75rem' }}><Icon name="check" size={18} /><span>{sigMsg}</span></div>}

                <div className="form-inline-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!sigPreview || sigLoading}
                    onClick={uploadSignature}
                  >
                    {sigLoading ? <span className="button-spinner" /> : <Icon name="check" size={17} />}
                    {sigLoading ? 'Uploading…' : hasSignature ? 'Replace Signature' : 'Upload Signature'}
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="form-card" aria-labelledby="password-title">
            <div className="form-card-header"><div><span className="section-kicker">Account security</span><h2 id="password-title">Change password</h2></div><Icon name="lock" /></div>
            <form className="form-card-body" onSubmit={submit}>
              {error && <div className="inline-alert error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
              <div className="form-group"><label htmlFor="current-password">Current password</label><input id="current-password" className="form-control" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm((previous) => ({ ...previous, currentPassword: event.target.value }))} required /></div>
              <div className="form-grid two-columns">
                <div className="form-group"><label htmlFor="new-password">New password</label><input id="new-password" className="form-control" type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm((previous) => ({ ...previous, newPassword: event.target.value }))} minLength="8" required /><span className="helper-text">Use at least 8 characters and avoid a reused password.</span></div>
                <div className="form-group"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" className="form-control" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm((previous) => ({ ...previous, confirmPassword: event.target.value }))} minLength="8" required /></div>
              </div>
              <div className="form-inline-actions"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? <span className="button-spinner" /> : <Icon name="check" size={17} />}{saving ? 'Updating…' : 'Update Password'}</button></div>
            </form>
          </section>

          <section className="data-card session-card">
            <div><span className="stat-icon navy"><Icon name="lock" /></span><div><h2>Current session</h2><p>Sign out when you finish, especially on a shared department computer.</p></div></div>
            <button className="btn btn-secondary" type="button" onClick={onSignOut}><Icon name="logout" size={17} /> Sign Out</button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Profile;
