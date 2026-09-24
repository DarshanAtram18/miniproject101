import React from 'react';
import Icon from './Icon';

const Breadcrumb = ({ current, navigate }) => (
  <nav className="breadcrumb-bar" aria-label="Breadcrumb">
    <button type="button" onClick={() => navigate('dashboard')}>Home</button>
    <Icon name="chevronRight" size={14} />
    <span aria-current="page">{current}</span>
  </nav>
);

export default Breadcrumb;
