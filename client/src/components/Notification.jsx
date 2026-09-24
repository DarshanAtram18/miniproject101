import React from 'react';
import Icon from './Icon';

const Notification = ({ notification, onClose }) => {
  if (!notification?.message) return null;
  const kind = notification.kind || 'success';

  return (
    <div className={`toast toast-${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live="polite">
      <span className="toast-icon"><Icon name={kind === 'error' ? 'alert' : kind === 'info' ? 'info' : 'check'} size={19} /></span>
      <span>{notification.message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification"><Icon name="close" size={17} /></button>
    </div>
  );
};

export default Notification;
