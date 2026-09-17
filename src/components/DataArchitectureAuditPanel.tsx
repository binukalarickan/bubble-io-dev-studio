import React, { useState, useMemo } from 'react';
import { 
  Database, 
  AlertOctagon, 
  AlertTriangle, 
  Info, 
  CheckCircle2, 
  Copy, 
  Check, 
  RefreshCw, 
  Sparkles, 
  Filter, 
  Search, 
  Layers, 
  Zap,
  TrendingDown
} from 'lucide-react';
import { ProjectProfile, DataArchitectureAuditReport, DataAntiPatternIssue } from '../types';
import { DataArchitectureAuditor } from '../core/audit/dataArchitectureAuditor';
import { toast } from '../core/toast/toastManager';

interface DataArchitectureAuditPanelProps {
  activeProject?: ProjectProfile;
  onLog: (module: 'audit', message: string, level?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const DataArchitectureAuditPanel: React.FC<DataArchitectureAuditPanelProps> = ({
  activeProject,
  onLog
}) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Perform audit on active project blueprint
  const [report, setReport] = useState<DataArchitectureAuditReport>(() => {
    return DataArchitectureAuditor.auditDataArchitecture(
      activeProject?.blueprintExportJson,
      null
    );
  });

  const handleRescan = async () => {
    setIsScanning(true);
    onLog('audit', 'Running Data Architecture & Relational Anti-Pattern scan...', 'info');
    await new Promise(r => setTimeout(r, 200));

    try {
      const rep = DataArchitectureAuditor.auditDataArchitecture(
        activeProject?.blueprintExportJson,
        null
      );
      setReport(rep);
      onLog('audit', `Data Architecture audit completed. Health Score: ${rep.dataHealthScore}/100 with ${rep.issues.length} anti-patterns identified.`, rep.dataHealthScore >= 80 ? 'success' : 'warn');
      toast.success(`Scan complete! Health Score: ${rep.dataHealthScore}%`);
    } finally {
      setIsScanning(false);
    }
  };

  const filteredIssues = useMemo(() => {
    return report.issues.filter(issue => {
      if (severityFilter !== 'ALL' && issue.severity !== severityFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          issue.title.toLowerCase().includes(q) ||
          issue.typeName.toLowerCase().includes(q) ||
          issue.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [report.issues, severityFilter, searchTerm]);

  const handleCopyPlan = (issue: DataAntiPatternIssue) => {
    const text = `### Refactor Plan for ${issue.title}\n\n**Anti-Pattern:** ${issue.type}\n**Severity:** ${issue.severity}\n**Affected Type:** ${issue.typeName}${issue.fieldName ? ` (Field: ${issue.fieldName})` : ''}\n\n**Problem:**\n${issue.description}\n\n**Performance & WU Impact:**\n${issue.impact}\n\n**Recommended Action:**\n${issue.recommendedRefactor}\n`;
    navigator.clipboard.writeText(text);
    setCopiedId(issue.id);
    toast.success('Refactor plan copied to clipboard!');
    onLog('audit', `Copied refactor plan for '${issue.title}'`, 'info');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const scoreColor = report.dataHealthScore >= 85 
    ? 'var(--accent-emerald)' 
    : report.dataHealthScore >= 60 
      ? 'var(--accent-amber)' 
      : 'var(--accent-rose)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Health Overview Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(6, 182, 212, 0.05) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Visual Gauge */}
            <div style={{
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              border: `4px solid ${scoreColor}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-input)',
              boxShadow: `0 0 20px -4px ${scoreColor}`
            }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                {report.dataHealthScore}
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '2px' }}>
                Health
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Data Architecture & Relational Anti-Pattern Auditor
                </h3>
                <span className="badge badge-indigo">Bubble Engine Static Analysis</span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                Audits unbounded lists, wide table payload bloat, and in-memory client filters to reduce Work Unit (WU) waste and boost query performance.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleRescan}
              disabled={isScanning}
              className="btn btn-primary btn-sm"
            >
              <RefreshCw size={13} className={isScanning ? 'spin' : ''} />
              <span>{isScanning ? 'Auditing Schema...' : 'Re-scan Architecture'}</span>
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '10px',
          marginTop: '16px'
        }}>
          <div style={{ background: 'var(--bg-input)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Types Audited</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
              {report.totalTypesAudited}
            </div>
          </div>
          <div style={{ background: 'var(--bg-input)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Fields Checked</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
              {report.totalFieldsAudited}
            </div>
          </div>
          <div style={{ background: 'var(--bg-input)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.725rem', color: 'var(--accent-rose)', textTransform: 'uppercase', fontWeight: 600 }}>Critical Risks</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-rose)', marginTop: '2px' }}>
              {report.criticalIssuesCount}
            </div>
          </div>
          <div style={{ background: 'var(--bg-input)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.725rem', color: 'var(--accent-amber)', textTransform: 'uppercase', fontWeight: 600 }}>High Risks</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-amber)', marginTop: '2px' }}>
              {report.highIssuesCount}
            </div>
          </div>
          <div style={{ background: 'var(--bg-input)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.725rem', color: 'var(--accent-emerald)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingDown size={12} />
              <span>Est. WU Savings</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-emerald)', marginTop: '2px' }}>
              ~{report.estimatedWuSavingsPercent}%
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setSeverityFilter('ALL')}
            className={`btn btn-xs ${severityFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
          >
            All Issues ({report.issues.length})
          </button>
          <button
            onClick={() => setSeverityFilter('CRITICAL')}
            className={`btn btn-xs ${severityFilter === 'CRITICAL' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <AlertOctagon size={11} color="var(--accent-rose)" />
            <span>Critical ({report.criticalIssuesCount})</span>
          </button>
          <button
            onClick={() => setSeverityFilter('HIGH')}
            className={`btn btn-xs ${severityFilter === 'HIGH' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <AlertTriangle size={11} color="var(--accent-amber)" />
            <span>High ({report.highIssuesCount})</span>
          </button>
          <button
            onClick={() => setSeverityFilter('MEDIUM')}
            className={`btn btn-xs ${severityFilter === 'MEDIUM' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Info size={11} color="var(--accent-cyan)" />
            <span>Medium ({report.mediumIssuesCount})</span>
          </button>
        </div>

        <div style={{ position: 'relative', width: '260px' }}>
          <Search size={13} style={{ position: 'absolute', left: '8px', top: '8px', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search anti-patterns or types..."
            className="input-field input-sm"
            style={{ width: '100%', paddingLeft: '26px', fontSize: '0.775rem' }}
          />
        </div>
      </div>

      {/* Issues List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredIssues.length === 0 ? (
          <div className="card" style={{ padding: '36px', textAlign: 'center' }}>
            <CheckCircle2 size={32} color="var(--accent-emerald)" style={{ margin: '0 auto 10px auto' }} />
            <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>No Architectural Anti-Patterns Found</h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              All evaluated schemas, relational lists, and search queries comply with optimal Bubble data design standards.
            </p>
          </div>
        ) : (
          filteredIssues.map(issue => {
            const severityBadgeClass = 
              issue.severity === 'CRITICAL' ? 'badge-rose' :
              issue.severity === 'HIGH' ? 'badge-amber' : 'badge-cyan';

            return (
              <div
                key={issue.id}
                className="card"
                style={{
                  borderLeft: `4px solid ${
                    issue.severity === 'CRITICAL' ? 'var(--accent-rose)' :
                    issue.severity === 'HIGH' ? 'var(--accent-amber)' : 'var(--accent-cyan)'
                  }`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span className={`badge ${severityBadgeClass}`} style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                        {issue.severity}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                        Type: {issue.typeName}
                      </span>
                      <span className="badge badge-indigo" style={{ fontSize: '0.675rem' }}>
                        WU Risk: {issue.wuWasteRisk}
                      </span>
                    </div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {issue.title}
                    </h4>
                  </div>

                  <button
                    onClick={() => handleCopyPlan(issue)}
                    className="btn btn-secondary btn-xs"
                    title="Copy comprehensive refactor plan to clipboard"
                  >
                    {copiedId === issue.id ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                    <span>{copiedId === issue.id ? 'Copied' : 'Copy Refactor Plan'}</span>
                  </button>
                </div>

                <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {issue.description}
                </p>

                {/* Impact & Recommended Action Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '10px',
                  background: 'var(--bg-input)',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.775rem'
                }}>
                  <div>
                    <strong style={{ color: 'var(--accent-rose)', display: 'block', marginBottom: '2px' }}>
                      Why this hurts performance & WU:
                    </strong>
                    <span style={{ color: 'var(--text-secondary)' }}>{issue.impact}</span>
                  </div>
                  <div>
                    <strong style={{ color: 'var(--accent-emerald)', display: 'block', marginBottom: '2px' }}>
                      Recommended Architecture Refactoring:
                    </strong>
                    <span style={{ color: 'var(--text-secondary)' }}>{issue.recommendedRefactor}</span>
                  </div>
                </div>

                {issue.diagramSnippet && (
                  <div style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Relational Architecture Model:
                    </span>
                    <pre style={{
                      margin: 0,
                      padding: '8px 12px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.725rem',
                      fontFamily: 'monospace',
                      color: 'var(--accent-cyan)'
                    }}>
                      {issue.diagramSnippet}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
