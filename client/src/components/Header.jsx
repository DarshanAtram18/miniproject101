import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { initials } from '../utils';

const Header = ({ activeNav, navigate, logout, user, notifications, unreadCount, onMarkAllRead, onMarkRead }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const headerRef = useRef(null);
  const isReviewer = ['HOD', 'Admin'].includes(user?.role);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'submit', label: 'New Activity', icon: 'plus' },
    { id: 'records', label: isReviewer ? 'Department Records' : user?.role === 'Club' ? 'Club Records' : 'My Records', icon: 'records' },
    { id: 'reports', label: 'Reports', icon: 'reports' },
    { id: 'profile', label: 'My Profile', icon: 'user' }
  ];

  useEffect(() => {
    const closeMenus = (event) => {
      if (!headerRef.current?.contains(event.target)) {
        setMenuOpen(false);
        setProfileOpen(false);
        setNotifOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setProfileOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', closeMenus);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenus);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const openView = (id) => {
    navigate(id);
    setMenuOpen(false);
    setProfileOpen(false);
    setNotifOpen(false);
  };

  const handleNotifClick = (notif) => {
    onMarkRead?.(notif.id);
    if (notif.activity_id) {
      navigate('records');
      setNotifOpen(false);
    }
  };

  const fmtNotifTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  return (
    <header className="app-header" ref={headerRef}>
      <div className="header-inner">
        <button className="mobile-menu-button" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Open navigation" aria-expanded={menuOpen}>
          <Icon name="menu" />
        </button>

        <button className="brand" type="button" onClick={() => openView('dashboard')} aria-label="WCE Prof-Insights dashboard">
          <img src="/wce-logo.png" alt="WCE Logo" className="brand-logo" />
          <span className="brand-copy">
            <strong>WCE Prof-Insights</strong>
            <small>Faculty Activity &amp; Evidence Portal</small>
          </span>
        </button>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`header-nav-item ${activeNav === item.id ? 'active' : ''}`}
              onClick={() => openView(item.id)}
              aria-current={activeNav === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="profile-menu-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

          {/* ── Notification Bell ── */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              onClick={() => { setNotifOpen((o) => !o); setProfileOpen(false); }}
              style={{
                position: 'relative', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0,
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '4px', right: '4px', background: '#ef4444',
                  color: '#fff', borderRadius: '50%', width: '16px', height: '16px',
                  fontSize: '9px', fontWeight: 800, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', border: '2px solid var(--header-bg, #1a365d)', lineHeight: 1
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: '340px',
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.18)', zIndex: 9000, overflow: 'hidden'
              }} role="menu" aria-label="Notifications">
                <div style={{ background: 'linear-gradient(135deg,#1a365d,#2a4d8f)', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '13px' }}>🔔 Notifications</strong>
                  {unreadCount > 0 && (
                    <button type="button" onClick={() => onMarkAllRead?.()} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px', padding: '3px 8px', color: '#fff', fontSize: '10px', cursor: 'pointer', fontWeight: 600 }}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                  {(!notifications || notifications.length === 0) ? (
                    <div style={{ textAlign: 'center', padding: '28px 16px', color: '#94a3b8', fontSize: '13px' }}>
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>
                      No notifications yet
                    </div>
                  ) : notifications.map((notif) => (
                    <button
                      key={notif.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleNotifClick(notif)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none',
                        borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', gap: '10px',
                        background: notif.is_read ? '#fff' : '#f0f9ff', transition: 'background 0.1s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = notif.is_read ? '#fff' : '#f0f9ff'}
                    >
                      <div style={{ fontSize: '20px', flexShrink: 0, marginTop: '1px' }}>
                        {notif.kind === 'appreciation' ? '🏅'
                          : notif.kind === 'approved' ? '✅'
                          : notif.kind === 'changes_requested' ? '🔄'
                          : notif.kind === 'submission' ? '📋'
                          : notif.kind === 'resubmission' ? '🔁'
                          : 'ℹ️'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: notif.is_read ? 600 : 800, fontSize: '12.5px', color: '#1e293b', marginBottom: '2px' }}>
                          {notif.title}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {notif.message}
                        </div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                          {fmtNotifTime(notif.created_at)}
                          {notif.activity_id && <span style={{ marginLeft: '8px', color: '#3b82f6', fontWeight: 600 }}>→ View record</span>}
                        </div>
                      </div>
                      {!notif.is_read && <div style={{ width: '7px', height: '7px', background: '#3b82f6', borderRadius: '50%', flexShrink: 0, marginTop: '6px' }} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Profile dropdown ── */}
          <button
            className="profile-trigger"
            type="button"
            onClick={() => { setProfileOpen((open) => !open); setNotifOpen(false); }}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
          >
            <span className="profile-avatar">{initials(user?.name)}</span>
            <span className="profile-trigger-copy">
              <strong>{user?.name}</strong>
              <small>{user?.designation || user?.role}</small>
            </span>
            <Icon name="chevronDown" size={16} />
          </button>

          {profileOpen && (
            <div className="profile-dropdown" role="menu">
              <div className="profile-dropdown-summary">
                <strong>{user?.name}</strong>
                <span>{user?.department}</span>
              </div>
              <button type="button" role="menuitem" onClick={() => openView('profile')}>
                <Icon name="user" size={18} /> My Profile
              </button>
              <button type="button" role="menuitem" onClick={logout}>
                <Icon name="logout" size={18} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {menuOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeNav === item.id ? 'active' : ''}
              onClick={() => openView(item.id)}
              aria-current={activeNav === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </button>
          ))}
          <button type="button" onClick={logout}>
            <Icon name="logout" size={19} />
            <span>Sign Out</span>
          </button>
        </nav>
      )}
    </header>
  );
};

export default Header;
