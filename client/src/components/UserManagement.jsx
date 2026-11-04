import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import Modal from './Modal';
import api, { getErrorMessage } from '../api';

const roleColors = {
  Admin: { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' },
  HOD: { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
  Faculty: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
  Club: { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa' }
};

const departments = [
  'Computer Science and Engineering',
  'Information Technology',
  'Electronics Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Institutional / Student Activities'
];

const formatUserDisplayName = (u) => {
  if (!u) return '';
  if (u.role === 'Club' || u.role === 'Admin') return u.name;
  if (!u.salutation) return u.name;
  const prefixes = ['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.'];
  for (const p of prefixes) {
    if (u.name.startsWith(p)) return u.name;
  }
  return `${u.salutation} ${u.name}`;
};

const UserManagement = ({ user, showNotification }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modal States
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalUser, setEditModalUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // New User Form State
  const [newUser, setNewUser] = useState({
    salutation: 'Prof.',
    name: '',
    email: '',
    department: 'Computer Science and Engineering',
    designation: 'Assistant Professor',
    role: 'Faculty',
    password: '123'
  });

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data.users || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load users.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.name.trim() || !newUser.email.trim()) {
      showNotification('Please provide both full name and login email / username.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/admin/users', newUser);
      showNotification(res.data.message || 'User created successfully.');
      setAddModalOpen(false);
      setNewUser({
        salutation: 'Prof.',
        name: '',
        email: '',
        department: 'Computer Science and Engineering',
        designation: 'Assistant Professor',
        role: 'Faculty',
        password: '123'
      });
      await loadUsers();
    } catch (err) {
      showNotification(getErrorMessage(err, 'Unable to create user.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editModalUser?.name?.trim()) {
      showNotification('Name cannot be empty.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.put(`/admin/users/${editModalUser.id}`, editModalUser);
      showNotification(res.data.message || 'User updated successfully.');
      setEditModalUser(null);
      await loadUsers();
    } catch (err) {
      showNotification(getErrorMessage(err, 'Unable to update user.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (targetUser) => {
    const confirmed = window.confirm(`Reset password for "${targetUser.name}" (${targetUser.email}) back to default "123"?`);
    if (!confirmed) return;

    try {
      const res = await api.post(`/admin/users/${targetUser.id}/reset-password`, { newPassword: '123' });
      showNotification(res.data.message || 'Password reset successfully.');
    } catch (err) {
      showNotification(getErrorMessage(err, 'Unable to reset password.'), 'error');
    }
  };

  const handleToggleActive = async (targetUser) => {
    const nextStatus = !targetUser.is_active;
    const actionLabel = nextStatus ? 'activate' : 'deactivate';
    const confirmed = window.confirm(`Are you sure you want to ${actionLabel} account for "${targetUser.name}"?`);
    if (!confirmed) return;

    try {
      await api.put(`/admin/users/${targetUser.id}`, { ...targetUser, is_active: nextStatus });
      showNotification(`Account ${nextStatus ? 'activated' : 'deactivated'} successfully.`);
      await loadUsers();
    } catch (err) {
      showNotification(getErrorMessage(err, 'Unable to change status.'), 'error');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    const confirmed = window.confirm(`Remove user "${targetUser.name}" (${targetUser.email})? If they have existing activities, the account will be safely archived to preserve audit integrity.`);
    if (!confirmed) return;

    try {
      const res = await api.delete(`/admin/users/${targetUser.id}`);
      showNotification(res.data.message || 'User processed successfully.');
      await loadUsers();
    } catch (err) {
      showNotification(getErrorMessage(err, 'Unable to remove user.'), 'error');
    }
  };

  // Filtering
  const filteredUsers = users.filter((u) => {
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    const q = search.toLowerCase().trim();
    const matchSearch = !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.department?.toLowerCase().includes(q) ||
      u.designation?.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  const counts = users.reduce((acc, u) => {
    acc.ALL = (acc.ALL || 0) + 1;
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="records-page admin-user-page">
      <section className="dashboard-hero" style={{ marginBottom: '24px' }}>
        <div>
          <span className="eyebrow">Institutional User Directory</span>
          <h1>User Lifecycle &amp; Role Management</h1>
          <p>Provision faculty and club accounts, update departments, manage privileges, and resolve credential issues.</p>
        </div>
        <div className="hero-actions">
          <button className="btn btn-light" type="button" onClick={() => setAddModalOpen(true)}>
            <Icon name="plus" size={18} /> Add New User
          </button>
          <button className="btn btn-hero-outline" type="button" onClick={loadUsers}>
            <Icon name="refresh" size={18} /> Refresh Directory
          </button>
        </div>
      </section>

      {/* Stats Summary Bar */}
      <section className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: '24px' }}>
        <article>
          <span className="stat-icon navy"><Icon name="users" /></span>
          <div><span>Total Users</span><strong>{users.length}</strong><small>Institutional accounts</small></div>
        </article>
        <article>
          <span className="stat-icon green"><Icon name="check" /></span>
          <div><span>Active Users</span><strong>{users.filter(u => u.is_active).length}</strong><small>Able to sign in</small></div>
        </article>
        <article>
          <span className="stat-icon amber"><Icon name="user" /></span>
          <div><span>Faculty Members</span><strong>{counts.Faculty || 0}</strong><small>Teaching staff</small></div>
        </article>
        <article>
          <span className="stat-icon red"><Icon name="award" /></span>
          <div><span>Department Heads</span><strong>{counts.HOD || 0}</strong><small>Endorsement authorities</small></div>
        </article>
      </section>

      {/* Search & Filter Bar */}
      <section className="filter-card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['ALL', 'Faculty', 'HOD', 'Club', 'Admin'].map((role) => (
              <button
                key={role}
                type="button"
                className={`btn btn-sm ${roleFilter === role ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRoleFilter(role)}
                style={{ fontWeight: 600 }}
              >
                {role === 'ALL' ? 'All Roles' : role} ({counts[role] || 0})
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', minWidth: '280px', flex: '1 1 300px', maxWidth: '420px' }}>
            <input
              type="text"
              placeholder="Search by name, email, or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }}>
              <Icon name="search" size={17} />
            </span>
          </div>
        </div>
      </section>

      {/* User Directory Table */}
      {loading ? (
        <div className="table-loading"><span className="button-spinner dark" /> Loading user directory…</div>
      ) : error ? (
        <div className="inline-alert error"><Icon name="alert" /><span>{error}</span></div>
      ) : filteredUsers.length === 0 ? (
        <div className="compact-empty">
          <Icon name="users" size={32} />
          <p>No user accounts found matching your filter criteria.</p>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setSearch(''); setRoleFilter('ALL'); }}>Reset Filters</button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="records-table">
            <thead>
              <tr>
                <th>User / Name</th>
                <th>Login Username / Email</th>
                <th>Role</th>
                <th>Department &amp; Designation</th>
                <th style={{ textAlign: 'center' }}>Activities</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const style = roleColors[u.role] || roleColors.Faculty;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '50%',
                          background: style.bg,
                          color: style.text,
                          fontWeight: 800,
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: `1px solid ${style.border}`
                        }}>
                          {u.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <strong className="table-primary">{formatUserDisplayName(u)}</strong>
                          {Number(u.id) === Number(user.id) && (
                            <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700, marginLeft: '6px' }}>(You)</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <code style={{ background: '#f1f5f9', padding: '3px 6px', borderRadius: '4px', fontSize: '12px', color: '#0f172a' }}>
                        {u.email}
                      </code>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        background: style.bg,
                        color: style.text,
                        border: `1px solid ${style.border}`
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <div className="table-primary" style={{ fontSize: '12.5px' }}>{u.designation || 'Faculty'}</div>
                      <div className="table-secondary" style={{ fontSize: '11px' }}>{u.department}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="category-chip" style={{ fontSize: '11.5px', padding: '2px 8px' }}>
                        {u.activity_count || 0}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: u.is_active ? '#dcfce7' : '#fee2e2',
                        color: u.is_active ? '#15803d' : '#b91c1c'
                      }}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => setEditModalUser({ ...u })}
                          title="Edit User Details &amp; Privileges"
                          aria-label={`Edit ${u.name}`}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => handleResetPassword(u)}
                          title="Reset Password to default '123'"
                          aria-label={`Reset password for ${u.name}`}
                          style={{ color: '#b45309' }}
                        >
                          <Icon name="lock" size={16} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          disabled={Number(u.id) === Number(user.id)}
                          title={u.is_active ? 'Deactivate account' : 'Reactivate account'}
                          aria-label={`Toggle active status for ${u.name}`}
                          style={{ color: u.is_active ? '#d97706' : '#15803d' }}
                        >
                          <Icon name="refresh" size={16} />
                        </button>
                        {Number(u.id) !== Number(user.id) && (
                          <button
                            className="icon-button danger"
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            title="Remove or archive user"
                            aria-label={`Delete ${u.name}`}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE NEW USER MODAL */}
      {addModalOpen && (
        <Modal
          title="Add Institutional User Account"
          subtitle="Provision credentials and department assignments for new faculty or clubs."
          onClose={() => setAddModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" type="button" onClick={() => setAddModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" type="button" disabled={submitting} onClick={handleCreateUser}>
                {submitting ? 'Creating…' : 'Create Account'}
              </button>
            </>
          }
        >
          <form onSubmit={handleCreateUser} style={{ display: 'grid', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Salutation</label>
                <select
                  className="form-control"
                  disabled={newUser.role === 'Club' || newUser.role === 'Admin'}
                  value={newUser.role === 'Club' || newUser.role === 'Admin' ? '' : (newUser.salutation || '')}
                  onChange={(e) => setNewUser({ ...newUser, salutation: e.target.value })}
                >
                  <option value="Prof.">Prof.</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Mr.">Mr.</option>
                  <option value="Ms.">Ms.</option>
                  <option value="Mrs.">Mrs.</option>
                  <option value="">(None)</option>
                </select>
              </div>
              <div>
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="e.g. Dr. Ramesh K. Joshi"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Institutional Username / Email *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="e.g. rkjoshi@wce or rkjoshi@wce.ac.in"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label">Initial Password</label>
                <input
                  type="text"
                  className="form-control"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Default: 123"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Role *</label>
                <select
                  className="form-control"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="Faculty">Faculty (Standard Teacher)</option>
                  <option value="HOD">HOD (Department Head &amp; Reviewer)</option>
                  <option value="Club">Club (Student Chapter)</option>
                  <option value="Admin">Admin (System Administrator)</option>
                </select>
              </div>
              <div>
                <label className="form-label">Designation</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Assistant Professor"
                  value={newUser.designation}
                  onChange={(e) => setNewUser({ ...newUser, designation: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="form-label">Department</label>
              <select
                className="form-control"
                value={newUser.department}
                onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
              >
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </form>
        </Modal>
      )}

      {/* EDIT USER MODAL */}
      {editModalUser && (
        <Modal
          title={`Edit Account: ${editModalUser.name}`}
          subtitle={`Username / Email: ${editModalUser.email}`}
          onClose={() => setEditModalUser(null)}
          footer={
            <>
              <button className="btn btn-secondary" type="button" onClick={() => setEditModalUser(null)}>Cancel</button>
              <button className="btn btn-primary" type="button" disabled={submitting} onClick={handleUpdateUser}>
                {submitting ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          }
        >
          <form onSubmit={handleUpdateUser} style={{ display: 'grid', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Salutation</label>
                <select
                  className="form-control"
                  disabled={editModalUser.role === 'Club' || editModalUser.role === 'Admin'}
                  value={editModalUser.role === 'Club' || editModalUser.role === 'Admin' ? '' : (editModalUser.salutation || '')}
                  onChange={(e) => setEditModalUser({ ...editModalUser, salutation: e.target.value })}
                >
                  <option value="Prof.">Prof.</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Mr.">Mr.</option>
                  <option value="Ms.">Ms.</option>
                  <option value="Mrs.">Mrs.</option>
                  <option value="">(None)</option>
                </select>
              </div>
              <div>
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={editModalUser.name}
                  onChange={(e) => setEditModalUser({ ...editModalUser, name: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Role</label>
                <select
                  className="form-control"
                  value={editModalUser.role}
                  disabled={Number(editModalUser.id) === Number(user.id)}
                  onChange={(e) => setEditModalUser({ ...editModalUser, role: e.target.value })}
                >
                  <option value="Faculty">Faculty</option>
                  <option value="HOD">HOD</option>
                  <option value="Club">Club</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="form-label">Designation</label>
                <input
                  type="text"
                  className="form-control"
                  value={editModalUser.designation || ''}
                  onChange={(e) => setEditModalUser({ ...editModalUser, designation: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="form-label">Department</label>
              <select
                className="form-control"
                value={editModalUser.department || ''}
                onChange={(e) => setEditModalUser({ ...editModalUser, department: e.target.value })}
              >
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
              <input
                type="checkbox"
                id="editIsActive"
                checked={editModalUser.is_active !== false}
                disabled={Number(editModalUser.id) === Number(user.id)}
                onChange={(e) => setEditModalUser({ ...editModalUser, is_active: e.target.checked })}
              />
              <label htmlFor="editIsActive" style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
                Account is Active (Allow sign in to portal)
              </label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default UserManagement;

