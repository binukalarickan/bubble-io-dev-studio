import React from 'react';
import { 
  Terminal, 
  Moon, 
  Sun, 
  Globe, 
  ShieldCheck, 
  Sparkles,
  Menu,
  BookOpen,
  ChevronRight
} from 'lucide-react';
import { NavigationTab, ProjectProfile, ThemeMode } from '../types';
import { NotificationCenter } from './NotificationCenter';

interface HeaderProps {
  currentTab: NavigationTab;
  activeProject?: ProjectProfile;
  theme: ThemeMode;
  onToggleTheme: () => void;
  isTerminalOpen: boolean;
  onToggleTerminal: () => void;
  logCount: number;
  onToggleMobileSidebar?: () => void;
  onOpenCopilot?: () => void;
  onNavigate?: (tab: NavigationTab) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  activeProject,
  theme,
  onToggleTheme,
  isTerminalOpen,
  onToggleTerminal,
  logCount,
  onToggleMobileSidebar,
  onOpenCopilot,
  onNavigate
}) => {
  const getTabDetails = (tab: NavigationTab) => {
    switch (tab) {
      case 'dashboard':
        return { title: 'Workspace Overview', desc: 'Unified monitoring, health score, and quick actions' };
      case 'devops':
        return { title: 'DevOps & Database Studio', desc: 'Interactive Data Studio (CRUD), schema migrations, ERD & snapshots' };
      case 'security':
        return { title: 'Security & Privacy Rules Auditor', desc: 'RBAC permissions matrix, vulnerable public endpoints & exposed sensitive fields' };
      case 'wu-profiler':
        return { title: 'Workload Units (WU) & Query Profiler', desc: 'Detect unindexed searches, nested N+1 loops & estimate monthly costs' };
      case 'audit':
        return { title: 'Dead Code & Health Scorer', desc: 'AST dependency graph, orphaned workflows & performance recommendations' };
      case 'api-studio':
        return { title: 'Live Webhook & API Connector Studio', desc: 'Inspect live incoming webhooks, test payload contracts & convert cURL / Plugin SDK' };
      case 'doc-gen':
        return { title: '1-Click Developer Documentation Book', desc: 'Auto-generated Data Dictionary, ERD, Security Matrix & API reference' };
      case 'translator':
        return { title: 'AI Localization Studio', desc: 'Translate Bubble apps with OpenAI, Anthropic, Gemini, Groq & glossaries' };
      case 'visual-tester':
        return { title: 'Visual QA & Regression Suite', desc: 'Multi-viewport pixel diff testing, baseline comparisons & automated reports' };
      case 'settings':
        return { title: 'Settings & Credentials', desc: 'Manage Bubble app credentials, AI provider keys, and studio preferences' };
      default:
        return { title: 'Bubble Studio', desc: 'Professional developer and DevOps environment' };
    }
  };

  const details = getTabDetails(currentTab);

  return (
    <header className="header-container app-drag-region" style={{
      height: 'var(--header-height)',
      backgroundColor: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      flexShrink: 0,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      gap: '16px'
    }}>
      {/* Mobile Toggle & Title */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
        {onToggleMobileSidebar && (
          <button
            onClick={onToggleMobileSidebar}
            className="btn btn-secondary btn-sm"
            style={{ padding: '6px 8px' }}
            title="Toggle Navigation Menu"
          >
            <Menu size={16} />
          </button>
        )}

        <div style={{ minWidth: 0 }}>
          {/* Breadcrumbs Trail */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
            <span 
              onClick={() => onNavigate?.('dashboard')} 
              style={{ cursor: onNavigate ? 'pointer' : 'default', transition: 'color 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              title="Return to Workspace Overview"
            >
              {activeProject ? activeProject.name : 'Bubble Studio'}
            </span>
            <ChevronRight size={11} style={{ opacity: 0.6 }} />
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{details.title}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{
              fontSize: '1.1rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              margin: 0,
              whiteSpace: 'nowrap'
            }}>
              {details.title}
            </h2>
            {activeProject && (
              <span className={`badge ${activeProject.environment === 'live' ? 'badge-emerald' : 'badge-amber'}`} style={{ fontWeight: 700, letterSpacing: '0.04em' }}>
                <ShieldCheck size={12} />
                {activeProject.environment.toUpperCase()}
              </span>
            )}
          </div>
          <p className="mobile-hide" style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            marginTop: '2px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {details.desc}
          </p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {activeProject?.customDomain && (
          <div className="mobile-hide" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.775rem',
            fontWeight: 500,
            color: 'var(--text-muted)',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-md)'
          }}>
            <Globe size={13} color="var(--primary)" />
            <span>{activeProject.customDomain}</span>
          </div>
        )}

        {/* AI Copilot Button */}
        {onOpenCopilot && (
          <button
            onClick={onOpenCopilot}
            className="btn btn-secondary btn-sm"
            title="Open Bubble AI Copilot & Query Assistant (Ctrl + I / Cmd + I)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(6, 182, 212, 0.12))',
              border: '1px solid rgba(99, 102, 241, 0.3)'
            }}
          >
            <Sparkles size={14} color="var(--accent-cyan)" />
            <span className="mobile-hide" style={{ fontWeight: 700 }}>AI Copilot</span>
            <span style={{
              fontSize: '0.625rem',
              fontWeight: 700,
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '1px 5px',
              borderRadius: '4px',
              color: 'var(--text-secondary)'
            }}>
              ⌘I
            </span>
          </button>
        )}

        {/* Notification Center */}
        <NotificationCenter onNavigate={onNavigate} />

        {/* Theme Toggle */}
        <button 
          onClick={onToggleTheme}
          className="btn btn-secondary btn-sm"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          style={{ width: '34px', height: '34px', padding: 0 }}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Terminal / Logs Toggle */}
        <button 
          onClick={onToggleTerminal}
          className={`btn btn-sm ${isTerminalOpen ? 'btn-primary' : 'btn-secondary'}`}
          title="Toggle Studio Logs Console (Ctrl + `)"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Terminal size={14} />
          <span>Console</span>
          {logCount > 0 && (
            <span style={{
              background: isTerminalOpen ? 'rgba(255, 255, 255, 0.25)' : 'rgba(99, 102, 241, 0.2)',
              color: isTerminalOpen ? '#ffffff' : 'var(--primary)',
              borderRadius: '99px',
              padding: '1px 6px',
              fontSize: '0.675rem',
              fontWeight: 700
            }}>
              {logCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
