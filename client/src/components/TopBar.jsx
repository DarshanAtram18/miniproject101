import React from 'react';

const TopBar = ({ user, navigate }) => {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="college-name">Walchand College of Engineering, Sangli</span>
        <span className="topbar-sep">|</span>
        <span className="subtitle-top">Academic Portal</span>
      </div>
      <div className="topbar-right">
        {user ? (
          <div className="user-profile-corner" onClick={() => navigate && navigate('profile')} style={{ cursor: navigate ? 'pointer' : 'default' }}>
            <div className="profile-info">
              <span className="profile-name">{user.name}</span>
              <span className="profile-role">{user.role} • {user.dept}</span>
            </div>
            <div className="profile-avatar">
              {user.name ? user.name.split(' ').filter(n => !n.includes('.')).map(n => n[0]).join('') : 'U'}
            </div>
          </div>
        ) : (
          <span>Academic Year: 2025-26</span>
        )}
      </div>
    </div>
  );
};

export default TopBar;
