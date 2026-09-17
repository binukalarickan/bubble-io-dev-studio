import React, { useState, useMemo } from 'react';
import { 
  Globe, 
  Download, 
  Copy, 
  Check, 
  Code2, 
  Layers, 
  Search, 
  Sliders, 
  Sparkles, 
  FileJson, 
  FileCode, 
  ShieldCheck, 
  Terminal,
  Radio
} from 'lucide-react';
import { ProjectProfile, OpenApiExportOptions, ExportedOpenApiSpec } from '../types';
import { OpenApiExporterEngine } from '../core/api-studio/openApiExporter';
import { toast } from '../core/toast/toastManager';

interface OpenApiExportPanelProps {
  activeProject?: ProjectProfile;
  onLog: (module: 'api-studio', message: string, level?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const OpenApiExportPanel: React.FC<OpenApiExportPanelProps> = ({
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

  const [options, setOptions] = useState<OpenApiExportOptions>({
    includeWorkflowApis: true,
    includeDataApis: true,
    apiVersion: '1.1.0',
    serverBaseUrl: defaultBaseUrl,
    requireAuthentication: true,
    format: 'yaml'
  });

  const [activeViewTab, setActiveViewTab] = useState<'endpoints' | 'spec' | 'sdk'>('endpoints');
  const [endpointSearch, setEndpointSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [selectedEndpointPath, setSelectedEndpointPath] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [codeSnippetLang, setCodeSnippetLang] = useState<'curl' | 'typescript' | 'python'>('curl');

  // Generate OpenAPI Specification dynamically
  const spec: ExportedOpenApiSpec = useMemo(() => {
    return OpenApiExporterEngine.generateOpenApiSpec(
      activeProject?.blueprintExportJson,
      null, // automatically fallback to blueprint custom_types or default
      options
    );
  }, [activeProject?.blueprintExportJson, options]);

  // Serialized Spec String
  const serializedSpec = useMemo(() => {
    if (options.format === 'yaml') {
      return OpenApiExporterEngine.exportSpecAsYaml(spec);
    }
    return OpenApiExporterEngine.exportSpecAsJson(spec);
  }, [spec, options.format]);

  // Flattened Endpoint List for Browser
  const endpointList = useMemo(() => {
    const list: Array<{
      path: string;
      method: string;
      tag: string;
      summary: string;
      description?: string;
      raw: any;
    }> = [];

    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, def] of Object.entries<any>(methods || {})) {
        list.push({
          path,
          method: method.toUpperCase(),
          tag: def.tags?.[0] || 'General',
          summary: def.summary || `${method.toUpperCase()} ${path}`,
          description: def.description,
          raw: def
        });
      }
    }
    return list;
  }, [spec]);

  // Available tags
  const tags = useMemo(() => {
    const s = new Set<string>();
    s.add('ALL');
    for (const ep of endpointList) {
      s.add(ep.tag);
    }
    return Array.from(s);
  }, [endpointList]);

  // Filtered Endpoints
  const filteredEndpoints = useMemo(() => {
    return endpointList.filter(ep => {
      if (selectedTag !== 'ALL' && ep.tag !== selectedTag) return false;
      if (endpointSearch.trim()) {
        const q = endpointSearch.toLowerCase();
        return ep.path.toLowerCase().includes(q) || ep.summary.toLowerCase().includes(q);
      }
      return true;
    });
  }, [endpointList, selectedTag, endpointSearch]);

  const activeSelectedEndpoint = useMemo(() => {
    if (!selectedEndpointPath && filteredEndpoints.length > 0) {
      return filteredEndpoints[0];
    }
    return filteredEndpoints.find(e => `${e.method} ${e.path}` === selectedEndpointPath) || filteredEndpoints[0];
  }, [filteredEndpoints, selectedEndpointPath]);

  // Active Snippet
  const activeSnippet = useMemo(() => {
    if (!activeSelectedEndpoint) return '';
    const sampleBody = activeSelectedEndpoint.raw?.requestBody?.content?.['application/json']?.schema?.properties
      ? Object.fromEntries(
          Object.entries(activeSelectedEndpoint.raw.requestBody.content['application/json'].schema.properties).map(([k]) => [k, `sample_${k}`])
        )
      : undefined;

    const token = activeProject?.apiToken || 'YOUR_BUBBLE_API_TOKEN';

    if (codeSnippetLang === 'curl') {
      return OpenApiExporterEngine.generateCurlSnippet(
        activeSelectedEndpoint.path,
        activeSelectedEndpoint.method,
        options.serverBaseUrl,
        sampleBody,
        token
      );
    } else if (codeSnippetLang === 'typescript') {
      const typeName = activeSelectedEndpoint.tag.replace(/[^a-zA-Z0-9]/g, '') + 'Payload';
      return OpenApiExporterEngine.generateTypeScriptSnippet(
        activeSelectedEndpoint.path,
        activeSelectedEndpoint.method,
        options.serverBaseUrl,
        typeName,
        sampleBody
      );
    } else {
      return OpenApiExporterEngine.generatePythonSnippet(
        activeSelectedEndpoint.path,
        activeSelectedEndpoint.method,
        options.serverBaseUrl,
        sampleBody
      );
    }
  }, [activeSelectedEndpoint, codeSnippetLang, options.serverBaseUrl, activeProject?.apiToken]);

  const handleCopy = (text: string, label: string = 'Copied to clipboard!') => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(label);
    onLog('api-studio', `Copied ${label}`, 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSpec = () => {
    const ext = options.format === 'yaml' ? 'yaml' : 'json';
    const mime = options.format === 'yaml' ? 'text/yaml' : 'application/json';
    const blob = new Blob([serializedSpec], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bubble_openapi_3_1_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded OpenAPI 3.1 (${ext.toUpperCase()})`);
    onLog('api-studio', `Downloaded OpenAPI 3.1 specification (${ext.toUpperCase()})`, 'success');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Configuration & Options Header Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.07) 0%, rgba(99, 102, 241, 0.05) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={18} color="var(--primary)" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Reverse OpenAPI 3.1 & Interactive API Documentation Generator
              </h3>
              <span className="badge badge-cyan">OpenAPI 3.1.0</span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Automatically introspects Bubble backend workflows and database schema to output production-grade OpenAPI specifications and client SDKs.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleDownloadSpec} className="btn btn-primary btn-sm">
              <Download size={13} />
              <span>Download Spec ({options.format.toUpperCase()})</span>
            </button>
            <button onClick={() => handleCopy(serializedSpec, 'OpenAPI Spec')} className="btn btn-secondary btn-sm">
              {copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
              <span>Copy Spec</span>
            </button>
          </div>
        </div>

        {/* Options Toggles Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          background: 'var(--bg-input)',
          padding: '12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.8rem'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Target Server Base URL
            </label>
            <input
              type="text"
              value={options.serverBaseUrl}
              onChange={e => setOptions(prev => ({ ...prev, serverBaseUrl: e.target.value }))}
              className="input-field input-sm"
              style={{ width: '100%' }}
              placeholder="https://app.bubbleapps.io/version-test"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={options.includeWorkflowApis}
                onChange={e => setOptions(prev => ({ ...prev, includeWorkflowApis: e.target.checked }))}
              />
              <span>Include Workflow API (<code>/api/1.1/wf/...</code>)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={options.includeDataApis}
                onChange={e => setOptions(prev => ({ ...prev, includeDataApis: e.target.checked }))}
              />
              <span>Include Data API (<code>/api/1.1/obj/...</code>)</span>
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={options.requireAuthentication}
                onChange={e => setOptions(prev => ({ ...prev, requireAuthentication: e.target.checked }))}
              />
              <span>Require Bearer Authentication</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Format:</span>
              <button
                type="button"
                onClick={() => setOptions(prev => ({ ...prev, format: 'yaml' }))}
                className={`btn btn-xs ${options.format === 'yaml' ? 'btn-primary' : 'btn-secondary'}`}
              >
                YAML
              </button>
              <button
                type="button"
                onClick={() => setOptions(prev => ({ ...prev, format: 'json' }))}
                className={`btn btn-xs ${options.format === 'json' ? 'btn-primary' : 'btn-secondary'}`}
              >
                JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main View Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveViewTab('endpoints')}
          className={`btn btn-sm ${activeViewTab === 'endpoints' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Layers size={13} />
          <span>Interactive Endpoints ({endpointList.length})</span>
        </button>
        <button
          onClick={() => setActiveViewTab('spec')}
          className={`btn btn-sm ${activeViewTab === 'spec' ? 'btn-primary' : 'btn-secondary'}`}
        >
          {options.format === 'yaml' ? <FileCode size={13} /> : <FileJson size={13} />}
          <span>Specification Code View ({options.format.toUpperCase()})</span>
        </button>
        <button
          onClick={() => setActiveViewTab('sdk')}
          className={`btn btn-sm ${activeViewTab === 'sdk' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Code2 size={13} />
          <span>Interactive SDK & Snippets</span>
        </button>
      </div>

      {/* SUBTAB 1: ENDPOINTS BROWSER */}
      {activeViewTab === 'endpoints' && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '16px' }}>
          {/* Left Column: Filterable Endpoints List */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '640px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={endpointSearch}
                  onChange={e => setEndpointSearch(e.target.value)}
                  placeholder="Filter paths..."
                  className="input-field input-sm"
                  style={{ width: '100%', paddingLeft: '26px', fontSize: '0.775rem' }}
                />
              </div>
            </div>

            {/* Tag Filter Pills */}
            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
              {tags.map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedTag(t)}
                  className={`btn btn-xs ${selectedTag === t ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.7rem', padding: '2px 8px', whiteSpace: 'nowrap' }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Endpoint Scroll Area */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredEndpoints.map(ep => {
                const isSelected = activeSelectedEndpoint?.path === ep.path && activeSelectedEndpoint?.method === ep.method;
                const methodColor = 
                  ep.method === 'GET' ? 'var(--accent-cyan)' :
                  ep.method === 'POST' ? 'var(--accent-emerald)' :
                  ep.method === 'PATCH' ? 'var(--accent-amber)' : 'var(--accent-rose)';

                return (
                  <div
                    key={`${ep.method}_${ep.path}`}
                    onClick={() => setSelectedEndpointPath(`${ep.method} ${ep.path}`)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-input)',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span style={{
                        fontSize: '0.675rem',
                        fontWeight: 700,
                        color: methodColor,
                        padding: '1px 5px',
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: '3px'
                      }}>
                        {ep.method}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ep.path}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ep.summary}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Endpoint Detail & Inspector */}
          {activeSelectedEndpoint ? (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '640px', overflowY: 'auto' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span className="badge badge-indigo" style={{ fontWeight: 700 }}>
                    {activeSelectedEndpoint.method}
                  </span>
                  <code style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {activeSelectedEndpoint.path}
                  </code>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {activeSelectedEndpoint.summary}
                </div>
                {activeSelectedEndpoint.description && (
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {activeSelectedEndpoint.description}
                  </div>
                )}
              </div>

              {/* Parameters List */}
              {activeSelectedEndpoint.raw?.parameters && activeSelectedEndpoint.raw.parameters.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
                    Parameters ({activeSelectedEndpoint.raw.parameters.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {activeSelectedEndpoint.raw.parameters.map((p: any) => (
                      <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '0.775rem' }}>
                        <div>
                          <strong>{p.name}</strong>
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>({p.in})</span>
                          {p.required && <span style={{ color: 'var(--accent-rose)', marginLeft: '6px' }}>*required</span>}
                        </div>
                        <div style={{ color: 'var(--accent-cyan)' }}>
                          {p.schema?.type || 'string'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Request Body Definition */}
              {activeSelectedEndpoint.raw?.requestBody && (
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
                    Request Body Schema
                  </h4>
                  <pre style={{
                    padding: '10px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    overflowX: 'auto',
                    margin: 0
                  }}>
                    {JSON.stringify(activeSelectedEndpoint.raw.requestBody.content?.['application/json']?.schema || {}, null, 2)}
                  </pre>
                </div>
              )}

              {/* Responses Definition */}
              <div>
                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
                  HTTP Responses
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Object.entries(activeSelectedEndpoint.raw?.responses || {}).map(([code, r]: [string, any]) => (
                    <div key={code} style={{ padding: '6px 10px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '0.775rem' }}>
                      <span style={{ fontWeight: 700, color: code.startsWith('2') ? 'var(--accent-emerald)' : 'var(--accent-rose)', marginRight: '8px' }}>
                        {code}
                      </span>
                      <span>{r.description || 'Status definition'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '640px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Select an endpoint to inspect specification</span>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: RAW SPECIFICATION CODE */}
      {activeViewTab === 'spec' && (
        <div className="card" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              OpenAPI 3.1.0 Complete Manifest ({options.format.toUpperCase()})
            </span>
            <button onClick={() => handleCopy(serializedSpec, 'OpenAPI Spec')} className="btn btn-secondary btn-xs">
              <Copy size={12} />
              <span>Copy</span>
            </button>
          </div>
          <pre style={{
            margin: 0,
            padding: '14px',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            maxHeight: '580px',
            overflowY: 'auto',
            fontSize: '0.775rem',
            fontFamily: 'Consolas, Monaco, monospace',
            lineHeight: 1.45
          }}>
            {serializedSpec}
          </pre>
        </div>
      )}

      {/* SUBTAB 3: INTERACTIVE SDK SNIPPETS */}
      {activeViewTab === 'sdk' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setCodeSnippetLang('curl')}
                className={`btn btn-xs ${codeSnippetLang === 'curl' ? 'btn-primary' : 'btn-secondary'}`}
              >
                <Terminal size={12} />
                <span>cURL</span>
              </button>
              <button
                onClick={() => setCodeSnippetLang('typescript')}
                className={`btn btn-xs ${codeSnippetLang === 'typescript' ? 'btn-primary' : 'btn-secondary'}`}
              >
                <FileCode size={12} />
                <span>TypeScript (Fetch)</span>
              </button>
              <button
                onClick={() => setCodeSnippetLang('python')}
                className={`btn btn-xs ${codeSnippetLang === 'python' ? 'btn-primary' : 'btn-secondary'}`}
              >
                <Code2 size={12} />
                <span>Python (Requests)</span>
              </button>
            </div>

            <button onClick={() => handleCopy(activeSnippet, 'Code Snippet')} className="btn btn-secondary btn-xs">
              <Copy size={12} />
              <span>Copy Snippet</span>
            </button>
          </div>

          <pre style={{
            margin: 0,
            padding: '16px',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            maxHeight: '560px',
            overflowY: 'auto',
            fontSize: '0.8rem',
            fontFamily: 'Consolas, Monaco, monospace',
            color: 'var(--text-primary)',
            lineHeight: 1.5
          }}>
            {activeSnippet}
          </pre>
        </div>
      )}
    </div>
  );
};
