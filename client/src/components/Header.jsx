import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { initials } from '../utils';

const Header = ({ activeNav, navigate, logout, user }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const headerRef = useRef(null);
  const isReviewer = ['HOD', 'Admin'].includes(user?.role);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'submit', label: 'New Activity', icon: 'plus' },
    { id: 'records', label: isReviewer ? 'Department Records' : 'My Records', icon: 'records' },
    { id: 'reports', label: 'Reports', icon: 'reports' },
    { id: 'profile', label: 'My Profile', icon: 'user' }
  ];

  useEffect(() => {
    const closeMenus = (event) => {
      if (!headerRef.current?.contains(event.target)) {
        setMenuOpen(false);
        setProfileOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setProfileOpen(false);
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
            <small>Faculty Activity & Evidence Portal</small>
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

        <div className="profile-menu-wrap">
          <button
            className="profile-trigger"
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
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
