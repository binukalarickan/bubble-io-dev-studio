import { 
  LayoutDashboard, 
  Database, 
  Stethoscope, 
  Languages, 
  Camera, 
  Settings, 
  Layers,
  Plus,
  ShieldAlert,
  Zap,
  Radio,
  BookOpen
} from 'lucide-react';
import { NavigationTab, ProjectProfile } from '../types';
import { ProjectDropdown } from './ProjectDropdown';
import { APP_VERSION_LABEL } from '../version';

interface SidebarProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  activeProject?: ProjectProfile;
  projects: ProjectProfile[];
  onSelectProject: (id: string) => void;
  onOpenConnectModal: () => void;
  onDeleteProject?: (project: ProjectProfile) => void;
  isOpen?: boolean;
  onCloseMobile?: () => void;
  hasUpdate?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  activeProject,
  projects,
  onSelectProject,
  onOpenConnectModal,
  onDeleteProject,
  isOpen,
  onCloseMobile,
  hasUpdate
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: null },
    { id: 'devops', label: 'DevOps & Schema', icon: Database, badge: 'CLI' },
    { id: 'security', label: 'Security & RBAC', icon: ShieldAlert, badge: 'Shield' },
    { id: 'wu-profiler', label: 'WU & Performance', icon: Zap, badge: 'Cost' },
    { id: 'audit', label: 'Dead Code & Health', icon: Stethoscope, badge: 'Audit' },
    { id: 'api-studio', label: 'Webhooks & API', icon: Radio, badge: 'Live' },
    { id: 'doc-gen', label: 'DocGen Book', icon: BookOpen, badge: 'Docs' },
    { id: 'translator', label: 'AI Localization', icon: Languages, badge: 'AI' },
    { id: 'visual-tester', label: 'Visual QA Suite', icon: Camera, badge: 'Visual' },
    { id: 'settings', label: 'Settings & Keys', icon: Settings, badge: hasUpdate ? 'UPDATE' : null }
  ];

  const handleNavClick = (tabId: NavigationTab) => {
    onTabChange(tabId);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {isOpen && (
        <div 
          className="mobile-sidebar-backdrop" 
          onClick={onCloseMobile} 
        />
      )}

      <aside className={`sidebar-container ${isOpen ? 'open' : ''}`} style={{
        width: 'var(--sidebar-width)',
        height: '100%',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 14px 14px 14px',
        gap: '12px',
        flexShrink: 0,
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}>
        {/* macOS Traffic Lights Clearance & Draggable Window Header Area */}
        <div 
          className="app-drag-region"
          style={{
            height: '42px',
            minHeight: '42px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            cursor: 'default'
          }}
          title="Drag window"
        />

        {/* App Branding */}
        <div className="app-no-drag" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 6px 12px 6px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '11px',
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            flexShrink: 0
          }}>
            <Layers size={21} color="#ffffff" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h1 style={{
                fontSize: '0.975rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
                margin: 0,
                whiteSpace: 'nowrap'
              }}>
                Bubble Studio
              </h1>
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '0.675rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              marginTop: '1px'
            }}>
              <span style={{
                background: 'rgba(99, 102, 241, 0.12)',
                color: 'var(--primary)',
                padding: '1px 6px',
                borderRadius: '4px',
                fontSize: '0.65rem',
                fontWeight: 700
              }}>
                {APP_VERSION_LABEL}
              </span>
            </div>
          </div>
        </div>

        {/* Custom Project Switcher Dropdown */}
        <div className="app-no-drag" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
            <span style={{
              fontSize: '0.675rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700
            }}>
              Active Application
            </span>
            <button
              onClick={onOpenConnectModal}
              title="Connect another Bubble application"
              style={{
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: '4px',
                color: 'var(--primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '0.675rem',
                fontWeight: 700,
                padding: '2px 7px',
                transition: 'all 0.15s ease'
              }}
            >
              <Plus size={11} />
              <span>Add</span>
            </button>
          </div>

          <ProjectDropdown
            activeProject={activeProject}
            projects={projects}
            onSelectProject={onSelectProject}
            onOpenConnectModal={onOpenConnectModal}
            onDeleteProject={onDeleteProject}
          />
        </div>

        {/* Navigation List */}
        <nav className="app-no-drag" style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          paddingRight: '2px'
        }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id as NavigationTab)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                  border: isActive ? '1px solid var(--border-active)' : '1px solid transparent',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.825rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                  textAlign: 'left'
                }}
              >
                {isActive && (
                  <span style={{
                    position: 'absolute',
                    left: 0,
                    top: '25%',
                    bottom: '25%',
                    width: '3px',
                    borderRadius: '0 4px 4px 0',
                    backgroundColor: 'var(--primary)',
                    boxShadow: '0 0 8px var(--primary)'
                  }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon size={17} color={isActive ? 'var(--primary)' : 'currentColor'} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`badge ${item.badge === 'UPDATE' ? 'badge-emerald animate-pulse' : isActive ? 'badge-indigo' : 'badge-cyan'}`} style={{ fontSize: '0.625rem', padding: '1px 6px' }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Environment / Footer */}
        <div className="app-no-drag" style={{
          padding: '10px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{
                position: 'relative',
                display: 'flex',
                width: '7px',
                height: '7px'
              }}>
                <span style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-emerald)',
                  opacity: 0.75,
                  animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite'
                }}></span>
                <span style={{
                  position: 'relative',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-emerald)'
                }}></span>
              </span>
              <span style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                System Ready
              </span>
            </div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              Live GUI
            </span>
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            Node 24 • Electron 34 • macOS & Win
          </span>
        </div>
      </aside>
    </>
  );
};
