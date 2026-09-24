import React, { useState } from 'react';
import Icon from './Icon';
import { initials } from '../utils';

const Profile = ({ user, onChangePassword, onSignOut }) => {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="profile-page">
      <div className="page-heading">
        <div><span className="eyebrow">Faculty identity</span><h1>My profile and security</h1><p>Your department is used as the verified source for every new activity and report.</p></div>
      </div>

      <div className="profile-layout">
        <section className="data-card profile-summary-card">
          <div className="profile-cover" />
          <div className="profile-summary-content">
            <span className="profile-large-avatar">{initials(user.name)}</span>
            <h2>{user.name}</h2>
            <p>{user.designation || 'Faculty'} · {user.department}</p>
            <span className="role-badge">{user.role}</span>
            <dl>
              <div><dt>Faculty email</dt><dd>{user.email}</dd></div>
              <div><dt>Primary department</dt><dd>{user.department}</dd></div>
              <div><dt>Designation</dt><dd>{user.designation || 'Faculty'}</dd></div>
              <div><dt>Portal role</dt><dd>{user.role}</dd></div>
            </dl>
            <div className="inline-alert info"><Icon name="lock" size={18} /><p>Identity and department fields are centrally managed to prevent spelling variations in institutional reports.</p></div>
          </div>
        </section>

        <div className="profile-main-column">
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
