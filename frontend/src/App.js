import React, { useState, useEffect } from 'react';
import { checkHealth } from './services/api';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Repositories from './pages/Repositories';
import Modifications from './pages/Modifications';
import SecretLeaks from './pages/SecretLeaks';
import ScanPerformance from './pages/ScanPerformance';
import Remediation from './pages/Remediation';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import './index.css';

const NAV_ITEMS = [
  { id: 'dashboard',     icon: '⬡',  label: 'Dashboard',           section: 'OVERVIEW' },
  { id: 'accounts',      icon: '🔗',  label: 'Accounts',             section: 'GITHUB' },
  { id: 'repositories',  icon: '📦',  label: 'Repositories',         section: 'GITHUB' },
  { id: 'modifications', icon: '🔄',  label: 'Modifications',        section: 'DETECTION' },
  { id: 'leaks',         icon: '🚨',  label: 'Secret Leaks',         section: 'DETECTION' },
  { id: 'performance',   icon: '⚡',  label: 'Scan Performance',     section: 'ANALYSIS' },
  { id: 'remediation',   icon: '⏱️',  label: 'Remediation',         section: 'ANALYSIS' },
  { id: 'alerts',        icon: '🔔',  label: 'Alert Management',     section: 'MANAGEMENT' },
  { id: 'reports',       icon: '📊',  label: 'Reports',              section: 'MANAGEMENT' },
];

function Sidebar({ active, onNavigate, apiOnline, alertCount }) {
  const sections = [...new Set(NAV_ITEMS.map(i => i.section))];

  return (
    <nav className="sidebar" role="navigation" aria-label="Main navigation">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-shield">🛡️</div>
        <div>
          <div className="logo-text">AMBIT</div>
          <div className="logo-sub">SecretGuard v1.0</div>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        {sections.map(section => (
          <div key={section}>
            <div className="nav-section-title">{section}</div>
            {NAV_ITEMS.filter(i => i.section === section).map(item => (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                className={`nav-item ${active === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                aria-current={active === item.id ? 'page' : undefined}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
                {item.id === 'alerts' && alertCount > 0 && (
                  <span className="nav-badge">{alertCount > 99 ? '99+' : alertCount}</span>
                )}
                {item.id === 'leaks' && alertCount > 0 && (
                  <span className="nav-badge">{alertCount}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="api-status">
          <div className={`status-dot ${apiOnline ? '' : 'offline'}`} />
          <span>Backend {apiOnline ? 'Online' : 'Offline'}</span>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
          GitHub Repo Monitor<br />
          & Secret Leak Detector
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [apiOnline, setApiOnline] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [checking, setChecking] = useState(true);

  // Check API health
  useEffect(() => {
    const check = async () => {
      try {
        await checkHealth();
        setApiOnline(true);
      } catch {
        setApiOnline(false);
      } finally {
        setChecking(false);
      }
    };
    check();
    const iv = setInterval(check, 10000);
    return () => clearInterval(iv);
  }, []);

  // Fetch unresolved alert count for badge
  useEffect(() => {
    if (!apiOnline) return;
    const fetchCount = async () => {
      try {
        const { default: api } = await import('./services/api');
        const data = await api.get('/api/alerts?status=unresolved').then(r => r.data);
        setAlertCount(data.length);
      } catch {}
    };
    fetchCount();
    const iv = setInterval(fetchCount, 15000);
    return () => clearInterval(iv);
  }, [apiOnline]);

  const renderPage = () => {
    switch (page) {
      case 'dashboard':     return <Dashboard />;
      case 'accounts':      return <Accounts />;
      case 'repositories':  return <Repositories />;
      case 'modifications': return <Modifications />;
      case 'leaks':         return <SecretLeaks />;
      case 'performance':   return <ScanPerformance />;
      case 'remediation':   return <Remediation />;
      case 'alerts':        return <Alerts />;
      case 'reports':       return <Reports />;
      default:              return <Dashboard />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar active={page} onNavigate={setPage} apiOnline={apiOnline} alertCount={alertCount} />
      <main className="main-content" id="main-content">
        {!apiOnline && !checking && (
          <div className="offline-banner">
            <span>⚠️</span>
            <span>
              <strong>Backend Offline</strong> — Start Flask server:&nbsp;
              <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 8px', borderRadius: 4, fontFamily: 'JetBrains Mono' }}>
                cd backend &amp;&amp; python app.py
              </code>
              &nbsp;(port 5000)
            </span>
          </div>
        )}
        {renderPage()}
      </main>
    </div>
  );
}
