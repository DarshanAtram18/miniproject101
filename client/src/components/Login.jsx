import React, { useState, useEffect } from 'react';
import Icon from './Icon';

const Login = ({ onLogin, loading, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Strictly ensure fields start completely blank without browser auto-population
  useEffect(() => {
    setEmail('');
    setPassword('');
    const t1 = setTimeout(() => { setEmail(''); setPassword(''); }, 50);
    const t2 = setTimeout(() => { setEmail(''); setPassword(''); }, 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const enableTyping = () => {
    if (!unlocked) setUnlocked(true);
  };

  const submit = (event) => {
    event.preventDefault();
    onLogin({ email: email.trim(), password });
  };

  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-product-title">
        <div className="login-brand-line">
          <img src="/wce-logo.png" alt="Walchand College of Engineering Logo" className="login-brand-logo" />
          <span>Walchand College of Engineering, Sangli</span>
        </div>
        <div className="login-intro-copy">
          <span className="eyebrow">Faculty Activity & Evidence Portal</span>
          <h1 id="login-product-title">Document once. Report with confidence.</h1>
          <p>Maintain a verified faculty activity timeline, preserve evidence, and produce annual or multi-year reports without repeated data entry.</p>
          <ul className="login-feature-list">
            <li><Icon name="check" size={18} /> Conditional forms for teaching, research and institutional work</li>
            <li><Icon name="check" size={18} /> Photos, reports, attendance and alternative evidence</li>
            <li><Icon name="check" size={18} /> Review history and PDF, DOCX or CSV reports</li>
          </ul>
        </div>
        <p className="login-intro-footnote">WCE Prof-Insights · Academic Excellence Framework</p>
      </section>

      <section className="login-form-panel">
        <form className="login-card" onSubmit={submit} autoComplete="off" noValidate>
          {/* Invisible decoy inputs to capture browser autofill heuristics */}
          <input
            type="text"
            name="decoy_username"
            style={{ position: 'absolute', top: '-9999px', left: '-9999px', opacity: 0, height: 0, width: 0 }}
            tabIndex={-1}
            aria-hidden="true"
            autoComplete="off"
          />
          <input
            type="password"
            name="decoy_password"
            style={{ position: 'absolute', top: '-9999px', left: '-9999px', opacity: 0, height: 0, width: 0 }}
            tabIndex={-1}
            aria-hidden="true"
            autoComplete="new-password"
          />

          <div className="login-card-heading">
            <span className="eyebrow">Secure portal access</span>
            <h2>Sign in to Prof-Insights</h2>
            <p>Use the username or email and password issued for your account.</p>
          </div>

          {error && (
            <div className="inline-alert error" role="alert">
              <Icon name="alert" size={20} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="login-username">Username <span className="required-mark">*</span></label>
            <input
              id="login-username"
              name="portal_user_identity"
              className="form-control"
              type="text"
              value={email}
              readOnly={!unlocked}
              onFocus={enableTyping}
              onClick={enableTyping}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter username (e.g. acm@wce, darshan@wce)"
              autoComplete="off"
              data-lpignore="true"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password <span className="required-mark">*</span></label>
            <div className="password-field">
              <input
                id="login-password"
                name="portal_user_secret"
                className="form-control"
                type={showPassword ? 'text' : 'password'}
                value={password}
                readOnly={!unlocked}
                onFocus={enableTyping}
                onClick={enableTyping}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="new-password"
                data-lpignore="true"
                required
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((show) => !show)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={loading || !email.trim() || !password}>
            {loading ? <span className="button-spinner" aria-hidden="true" /> : <Icon name="lock" size={18} />}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <div className="login-support">
            <span>Unable to access your account?</span>
            <a href="mailto:admin@walchandsangli.ac.in">Contact IT support</a>
          </div>
        </form>
      </section>
    </main>
  );
};

export default Login;
