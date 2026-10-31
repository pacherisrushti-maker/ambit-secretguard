import React, { useState, useEffect } from 'react';
import { getAccounts, connectAccount, disconnectAccount } from '../services/api';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!token.trim()) { setError('Please enter a GitHub Personal Access Token.'); return; }
    setConnecting(true); setError(''); setSuccess('');
    try {
      const result = await connectAccount(token.trim());
      setSuccess(result.message);
      setToken('');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id, username) => {
    if (!window.confirm(`Disconnect @${username}?`)) return;
    try {
      await disconnectAccount(id);
      setSuccess(`@${username} disconnected.`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🔗 GitHub Account Connection</h1>
        <p className="page-subtitle">Connect up to three authorized GitHub accounts using Personal Access Tokens</p>
      </div>
      <div className="page-body">
        {/* Info Banner */}
        <div className="alert-banner info" style={{ marginBottom: 20 }}>
          <span>ℹ️</span>
          <div>
            <strong>Required Token Scopes:</strong> Your GitHub PAT needs <code className="mono">repo</code>, <code className="mono">read:user</code>.
            For webhooks, also include <code className="mono">admin:repo_hook</code>.
            Generate at: <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--accent-cyan)' }}>github.com/settings/tokens</a>
          </div>
        </div>

        {error && <div className="alert-banner danger"><span>❌</span><span>{error}</span></div>}
        {success && <div className="alert-banner success"><span>✅</span><span>{success}</span></div>}

        {/* Connect Form */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>➕ Connect New GitHub Account</div>
          <form onSubmit={handleConnect}>
            <div className="input-group">
              <label className="input-label">Personal Access Token (PAT)</label>
              <input
                type="password"
                className="input input-mono"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                id="pat-input"
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Your token is used only for API calls and is never stored in full. Only the last 4 characters are saved for reference.
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={connecting || accounts.length >= 3}>
              {connecting ? <><div className="spinner spinner-sm" /> Connecting…</> : '🔗 Connect Account'}
            </button>
            {accounts.length >= 3 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 12 }}>
                Maximum 3 accounts connected. Disconnect one to add another.
              </span>
            )}
          </form>
        </div>

        {/* Connected Accounts */}
        <div className="section-header">
          <div className="section-title">🟢 Connected Accounts ({accounts.length}/3)</div>
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄 Refresh</button>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading accounts…</span></div>
        ) : accounts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔗</div>
            <div className="empty-title">No Accounts Connected</div>
            <div className="empty-desc">Add your GitHub Personal Access Token above to start monitoring repositories.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {accounts.map((acc, idx) => (
              <div key={acc.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Avatar */}
                {acc.avatar_url ? (
                  <img src={acc.avatar_url} alt={acc.username}
                    style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid var(--border-bright)' }} />
                ) : (
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'var(--gradient-brand)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, flexShrink: 0,
                  }}>👤</div>
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      @{acc.username}
                    </span>
                    {acc.token_active
                      ? <span className="badge badge-success">✅ Connected</span>
                      : <span className="badge badge-critical">⚠️ Reconnect Required</span>}
                    {idx === 0 && <span className="badge badge-info">Account 1</span>}
                    {idx === 1 && <span className="badge badge-info">Account 2</span>}
                    {idx === 2 && <span className="badge badge-purple">Account 3</span>}
                  </div>
                  {!acc.token_active && (
                    <div style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 4 }}>
                      ⚠️ Token lost after server restart — paste your PAT above to reconnect this account.
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>Token: <code className="mono">****{acc.token_hint?.slice(-4)}</code></span>
                    <span>Connected: {new Date(acc.connected_at).toLocaleString()}</span>
                    {acc.profile_url && (
                      <a href={acc.profile_url} target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--accent-cyan)' }}>View Profile ↗</a>
                    )}
                  </div>
                </div>

                <button className="btn btn-danger btn-sm"
                  onClick={() => handleDisconnect(acc.id, acc.username)}>
                  🔌 Disconnect
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Instructions */}
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>📋 Setup Instructions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['1', 'Go to github.com/settings/tokens and click "Generate new token (classic)"'],
              ['2', 'Select scopes: repo (full), read:user, admin:repo_hook'],
              ['3', 'Copy the generated token and paste it above'],
              ['4', 'Click "Connect Account" — SecretGuard will verify and store it securely'],
              ['5', 'After connecting accounts, go to "Repository Monitoring" to add repositories'],
              ['6', 'Optionally set WEBHOOK_PUBLIC_URL in .env and click "Setup Webhook" for live push detection'],
            ].map(([num, text]) => (
              <div key={num} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)' }}>
                <div style={{
                  background: 'var(--gradient-brand)', color: 'white',
                  width: 20, height: 20, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
                }}>{num}</div>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
