import React, { useState, useMemo, useEffect } from 'react';
import { 
  Database, 
  Play, 
  X, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  Sliders, 
  Server, 
  ShieldCheck, 
  ArrowRight, 
  Terminal,
  RefreshCw
} from 'lucide-react';
import { BubbleSchema, LiveSeederJob, ProjectProfile, SeederTypeConfig } from '../types';
import { LiveDataSeederEngine } from '../core/devops/liveDataSeeder';
import { toast } from '../core/toast/toastManager';

interface LiveSeederModalProps {
  isOpen: boolean;
  onClose: () => void;
  schema: BubbleSchema | null;
  activeProject?: ProjectProfile;
  onLog?: (module: 'devops', message: string, level?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const LiveSeederModal: React.FC<LiveSeederModalProps> = ({
  isOpen,
  onClose,
  schema,
  activeProject,
  onLog
}) => {
  const defaultBaseUrl = useMemo(() => {
    if (activeProject) {
      const domain = activeProject.customDomain || `${activeProject.appId}.bubbleapps.io`;
      const env = activeProject.environment || 'version-test';
      return `https://${domain}/${env}`;
    }
    return 'https://your-app.bubbleapps.io/version-test';
  }, [activeProject]);

  // Initial Types Config based on Schema
  const [typesConfig, setTypesConfig] = useState<SeederTypeConfig[]>(() => {
    if (!schema?.dataTypes || schema.dataTypes.length === 0) {
      return [
        {
          typeName: 'Company',
          rowCount: 3,
          enabled: true,
          fieldRules: {
            name: { fieldName: 'name', fieldType: 'text', generatorType: 'faker_name' },
            email: { fieldName: 'email', fieldType: 'text', generatorType: 'faker_email' }
          }
        },
        {
          typeName: 'Project',
          rowCount: 5,
          enabled: true,
          fieldRules: {
            title: { fieldName: 'title', fieldType: 'text', generatorType: 'faker_name' },
            budget: { fieldName: 'budget', fieldType: 'number', generatorType: 'faker_number', minValue: 1000, maxValue: 50000 },
            company: { fieldName: 'company', fieldType: 'custom.Company', generatorType: 'relation_lookup', relationTargetType: 'Company' }
          }
        }
      ];
    }

    return schema.dataTypes.map(dt => ({
      typeName: dt.name,
      rowCount: 5,
      enabled: true,
      fieldRules: LiveDataSeederEngine.generateDefaultFieldRules(dt.name, schema)
    }));
  });

  // Re-sync typesConfig if schema changes
  useEffect(() => {
    if (schema?.dataTypes && schema.dataTypes.length > 0) {
      setTypesConfig(
        schema.dataTypes.map(dt => ({
          typeName: dt.name,
          rowCount: 5,
          enabled: true,
          fieldRules: LiveDataSeederEngine.generateDefaultFieldRules(dt.name, schema)
        }))
      );
    }
  }, [schema]);

  const [targetEnv, setTargetEnv] = useState<'version-test' | 'custom'>('version-test');
  const [customUrl, setCustomUrl] = useState(defaultBaseUrl);
  const [apiToken, setApiToken] = useState(activeProject?.apiToken || '');
  const [isSeeding, setIsSeeding] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const [jobState, setJobState] = useState<LiveSeederJob>({
    targetEnvironment: 'version-test',
    apiToken: '',
    types: typesConfig,
    status: 'idle',
    progressCurrent: 0,
    progressTotal: 0,
    createdRecordIds: {},
    logs: []
  });

  // Compute Topological Execution Sequence
  const sortedSequence = useMemo(() => {
    const enabled = typesConfig.filter(t => t.enabled);
    return LiveDataSeederEngine.sortTypesTopologically(enabled, schema);
  }, [typesConfig, schema]);

  if (!isOpen) return null;

  const totalSelectedRecords = typesConfig
    .filter(t => t.enabled)
    .reduce((acc, t) => acc + (t.rowCount || 0), 0);

  const hasCreatedRecords = Object.values(jobState.createdRecordIds).some(arr => arr.length > 0);

  const handleToggleType = (typeName: string) => {
    setTypesConfig(prev =>
      prev.map(t => (t.typeName === typeName ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const handleRowCountChange = (typeName: string, count: number) => {
    const safeCount = Math.max(1, Math.min(100, count || 1));
    setTypesConfig(prev =>
      prev.map(t => (t.typeName === typeName ? { ...t, rowCount: safeCount } : t))
    );
  };

  const handleExecuteSeed = async () => {
    if (isSeeding) return;
    setIsSeeding(true);

    const initialJob: LiveSeederJob = {
      targetEnvironment: targetEnv,
      customBaseUrl: customUrl,
      apiToken: apiToken.trim(),
      types: typesConfig,
      status: 'running',
      progressCurrent: 0,
      progressTotal: totalSelectedRecords,
      createdRecordIds: {},
      logs: []
    };
    setJobState(initialJob);

    try {
      const finishedJob = await LiveDataSeederEngine.executeSeederJob(
        initialJob,
        schema,
        defaultBaseUrl,
        updatedJob => {
          setJobState({ ...updatedJob });
        },
        (msg, level) => {
          onLog?.('devops', msg, level);
        }
      );

      setJobState(finishedJob);
      toast.success(`Seeding complete! Generated ${finishedJob.progressCurrent} linked records.`);
    } catch (e: any) {
      toast.error(`Seeding encountered error: ${e.message}`);
      onLog?.('devops', `Seeding error: ${e.message}`, 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleRollback = async () => {
    if (isRollingBack || !hasCreatedRecords) return;
    setIsRollingBack(true);
    try {
      await LiveDataSeederEngine.rollbackJob(
        jobState,
        defaultBaseUrl,
        updatedJob => {
          setJobState({ ...updatedJob });
        },
        (msg, level) => {
          onLog?.('devops', msg, level);
        }
      );
      toast.success('Successfully rolled back seeded records from Bubble database!');
    } catch (e: any) {
      toast.error(`Rollback error: ${e.message}`);
      onLog?.('devops', `Rollback error: ${e.message}`, 'error');
    } finally {
      setIsRollingBack(false);
    }
  };

  const progressPct = jobState.progressTotal > 0
    ? Math.round((jobState.progressCurrent / jobState.progressTotal) * 100)
    : 0;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.82)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-active)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: '820px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(99, 102, 241, 0.08) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Database size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Live Relational Synthetic Seeder (Bubble Data API)
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Seeds test environments directly via authenticated Data API with topological DAG foreign-key resolution.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSeeding}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Target Environment & Token Card */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '12px',
            background: 'var(--bg-input)',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Target Environment URL
              </label>
              <input
                type="text"
                value={customUrl}
                onChange={e => setCustomUrl(e.target.value)}
                placeholder="https://app.bubbleapps.io/version-test"
                className="input-field input-sm"
                style={{ width: '100%', fontSize: '0.775rem' }}
                disabled={isSeeding}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Bubble API Bearer Token (Optional for public endpoints)
              </label>
              <input
                type="password"
                value={apiToken}
                onChange={e => setApiToken(e.target.value)}
                placeholder="Bearer Token from Settings > API"
                className="input-field input-sm"
                style={{ width: '100%', fontSize: '0.775rem' }}
                disabled={isSeeding}
              />
            </div>
          </div>

          {/* Topological Sequence Visualization */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.05)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px' }}>
              <Sparkles size={13} />
              <span>Resolved Topological Creation Sequence (Dependency Order)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontSize: '0.75rem' }}>
              {sortedSequence.map((t, idx) => (
                <React.Fragment key={t.typeName}>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontWeight: 600
                  }}>
                    {t.typeName} ({t.rowCount} rows)
                  </span>
                  {idx < sortedSequence.length - 1 && (
                    <ArrowRight size={12} color="var(--text-secondary)" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Types Selection Table */}
          <div>
            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
              Select Data Types & Counts to Generate
            </h4>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '180px',
              overflowY: 'auto'
            }}>
              {typesConfig.map(tc => (
                <div
                  key={tc.typeName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.8rem'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={tc.enabled}
                      onChange={() => handleToggleType(tc.typeName)}
                      disabled={isSeeding}
                    />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tc.typeName}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      ({Object.keys(tc.fieldRules).length} fields configured)
                    </span>
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Rows:</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={tc.rowCount}
                      onChange={e => handleRowCountChange(tc.typeName, parseInt(e.target.value) || 1)}
                      className="input-field input-xs"
                      style={{ width: '60px', textAlign: 'center' }}
                      disabled={isSeeding || !tc.enabled}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Progress Bar */}
          {jobState.progressTotal > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                <span>Seeder Progress ({jobState.progressCurrent} / {jobState.progressTotal} records)</span>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{progressPct}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #06b6d4 0%, #6366f1 100%)',
                  transition: 'width 0.2s ease'
                }} />
              </div>
            </div>
          )}

          {/* Real-time Execution Terminal Logs */}
          {jobState.logs.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <Terminal size={12} />
                <span>Execution Logs</span>
              </div>
              <pre style={{
                margin: 0,
                padding: '10px 12px',
                background: '#090d16',
                borderRadius: 'var(--radius-sm)',
                height: '120px',
                overflowY: 'auto',
                fontSize: '0.725rem',
                fontFamily: 'Consolas, Monaco, monospace',
                color: '#a5b4fc',
                lineHeight: 1.45
              }}>
                {jobState.logs.join('\n')}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-input)'
        }}>
          <div>
            {hasCreatedRecords && (
              <button
                onClick={handleRollback}
                disabled={isRollingBack || isSeeding}
                className="btn btn-danger btn-sm"
                title="Deletes all records generated during this session"
              >
                <RotateCcw size={13} className={isRollingBack ? 'spin' : ''} />
                <span>{isRollingBack ? 'Undoing Seed...' : 'Undo Seed / Rollback'}</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              disabled={isSeeding}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteSeed}
              disabled={isSeeding || totalSelectedRecords === 0}
              className="btn btn-primary btn-sm"
            >
              <Play size={13} className={isSeeding ? 'spin' : ''} />
              <span>{isSeeding ? 'Seeding Database...' : `Seed ${totalSelectedRecords} Records (Data API)`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
