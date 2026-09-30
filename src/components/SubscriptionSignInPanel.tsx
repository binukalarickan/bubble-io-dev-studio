import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, LogIn, LogOut, RefreshCw, ExternalLink, X, Terminal } from 'lucide-react';
import { SubscriptionAuth, SubscriptionStatus, SUBSCRIPTION_PROVIDERS } from '../core/ai/subscriptionAuth';
import { toast } from '../core/toast/toastManager';

interface SubscriptionSignInPanelProps {
  providerId: string;
  cliPath?: string;
  onCliPathChange?: (path: string) => void;
  onStatusChange?: (status: SubscriptionStatus) => void;
}

/**
 * Browser sign-in for Claude / ChatGPT subscription plans, delegated to the official CLI.
 */
export const SubscriptionSignInPanel: React.FC<SubscriptionSignInPanelProps> = ({
  providerId,
  cliPath,
  onCliPathChange,
  onStatusChange
}) => {
  const meta = SUBSCRIPTION_PROVIDERS[providerId];
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInLog, setSignInLog] = useState('');
  const [signInUrl, setSignInUrl] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState('');
  const [showPath, setShowPath] = useState(Boolean(cliPath));
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const refresh = useCallback(async () => {
    setIsChecking(true);
    try {
      const s = await SubscriptionAuth.getStatus(providerId, cliPath);
      setStatus(s);
      onStatusChangeRef.current?.(s);
    } finally {
      setIsChecking(false);
    }
  }, [providerId, cliPath]);

  useEffect(() => {
    setSignInLog('');
    setSignInUrl(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!meta) return;
    return SubscriptionAuth.onSignInOutput(payload => {
      if (payload.tool !== meta.tool) return;
      setSignInLog(prev => (prev + payload.text).slice(-2000));
      if (payload.urls.length > 0) setSignInUrl(prev => prev || payload.urls[0]);
    });
  }, [meta]);

  if (!meta) return null;

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setSignInLog('');
    setSignInUrl(null);
    setAuthCode('');
    toast.info(`Opening your browser to sign in with ${meta.planLabel}...`);
    const res = await SubscriptionAuth.signIn(providerId, cliPath);
    setIsSigningIn(false);
    if (res.success) toast.success('Signed in successfully');
    else toast.error(`Sign-in did not complete: ${res.detail}`);
    await refresh();
  };

  const handleCancel = async () => {
    await SubscriptionAuth.cancelSignIn(providerId);
    setIsSigningIn(false);
  };

  const handleSubmitCode = async () => {
    if (!authCode.trim()) return;
    const sent = await SubscriptionAuth.sendSignInCode(providerId, authCode);
    if (sent) {
      setAuthCode('');
      toast.info('Authorization code sent');
    }
  };

  const handleSignOut = async () => {
    const res = await SubscriptionAuth.signOut(providerId, cliPath);
    if (res.success) toast.info(`Signed out of ${meta.cliName}`);
    else toast.error(res.detail || 'Sign-out failed');
    await refresh();
  };

  const signedIn = Boolean(status?.signedIn);
  const tone = signedIn ? 'var(--accent-emerald)' : status && !status.installed ? 'var(--accent-rose)' : 'var(--accent-amber)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', minWidth: 0 }}>
          {signedIn ? <CheckCircle2 size={16} color={tone} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertCircle size={16} color={tone} style={{ flexShrink: 0, marginTop: 2 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {signedIn ? `Connected to ${meta.planLabel.split(' ')[0]}` : `Sign in with your ${meta.planLabel} plan`}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-word' }}>
              {isChecking && !status ? 'Checking sign-in status...' : status?.detail}
            </div>
            {status?.version && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {meta.cliName} {status.version}
              </div>
            )}
          </div>
        </div>
        <button type="button" onClick={refresh} disabled={isChecking} className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem', padding: '3px 8px', flexShrink: 0 }} title="Re-check sign-in status">
          <RefreshCw size={11} className={isChecking ? 'spin' : ''} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {status && !status.installed ? (
          <a href={meta.installUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', textDecoration: 'none' }}>
            <ExternalLink size={12} />
            <span>Install {meta.cliName}</span>
          </a>
        ) : isSigningIn ? (
          <button type="button" onClick={handleCancel} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
            <X size={12} />
            <span>Cancel sign-in</span>
          </button>
        ) : (
          <button type="button" onClick={handleSignIn} disabled={!status} className="btn btn-primary btn-sm" style={{ fontSize: '0.75rem' }}>
            <LogIn size={12} />
            <span>{signedIn ? 'Switch account' : 'Sign in with browser'}</span>
          </button>
        )}
        {signedIn && !isSigningIn && (
          <button type="button" onClick={handleSignOut} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
            <LogOut size={12} />
            <span>Sign out</span>
          </button>
        )}
        {onCliPathChange && (
          <button type="button" onClick={() => setShowPath(!showPath)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
            <Terminal size={12} />
            <span>CLI path</span>
          </button>
        )}
      </div>

      {isSigningIn && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Finish signing in in your browser. If no browser window opened, use the link below.
          </div>
          {signInUrl && (
            <a href={signInUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px', wordBreak: 'break-all' }}>
              <ExternalLink size={11} style={{ flexShrink: 0 }} />
              <span>Open sign-in page</span>
            </a>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder="Paste authorization code here if the page shows one"
              value={authCode}
              onChange={e => setAuthCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmitCode(); }}
              className="input"
              style={{ fontSize: '0.75rem' }}
            />
            <button type="button" onClick={handleSubmitCode} disabled={!authCode.trim()} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
              Submit
            </button>
          </div>
          {signInLog.trim() && (
            <pre style={{ margin: 0, maxHeight: '90px', overflow: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {signInLog.trim()}
            </pre>
          )}
        </div>
      )}

      {onCliPathChange && showPath && (
        <div>
          <label className="input-label">{meta.cliName} executable path (optional)</label>
          <input
            type="text"
            placeholder={status?.binaryPath || `Auto-detect ${meta.tool} on PATH`}
            value={cliPath || ''}
            onChange={e => onCliPathChange(e.target.value)}
            className="input"
            style={{ fontSize: '0.75rem' }}
          />
        </div>
      )}

      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Requests run through the official {meta.cliName} on this computer and count against your plan's usage limits. Your sign-in tokens stay with {meta.cliName}; Bubble Studio never stores them.
      </div>
    </div>
  );
};
