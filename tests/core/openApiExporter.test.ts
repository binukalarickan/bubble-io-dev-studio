import { describe, it, expect } from 'vitest';
import { OpenApiExporterEngine } from '../../src/core/api-studio/openApiExporter';
import { BubbleSchema } from '../../src/types';

describe('OpenApiExporterEngine - OpenAPI 3.1.0 Exporter', () => {
  const mockSchema: BubbleSchema = {
    appName: 'SaaS Platform',
    version: '1.0.0',
    dataTypes: [
      {
        name: 'User',
        fields: [
          { name: 'email', type: 'text', required: true },
          { name: 'role', type: 'text' },
          { name: 'is_active', type: 'boolean' }
        ]
      },
      {
        name: 'Project',
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'budget', type: 'number' },
          { name: 'owner', type: 'custom.User' },
          { name: 'tags', type: 'text', isList: true }
        ]
      }
    ],
    optionSets: []
  };

  const mockBlueprint = {
    app_name: 'SaaS Platform',
    api_workflows: {
      send_invoice: {
        description: 'Dispatches invoice PDF via email',
        parameters: [
          { name: 'invoice_id', type: 'text', required: true },
          { name: 'amount', type: 'number', required: true },
          { name: 'notify_client', type: 'boolean', optional: true }
        ]
      }
    }
  };

  it('should generate a valid OpenAPI 3.1.0 specification with components and paths', () => {
    const spec = OpenApiExporterEngine.generateOpenApiSpec(mockBlueprint, mockSchema, {
      includeWorkflowApis: true,
      includeDataApis: true,
      serverBaseUrl: 'https://mysaas.bubbleapps.io/version-test',
      requireAuthentication: true
    });

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toContain('SaaS Platform');
    expect(spec.servers[0].url).toBe('https://mysaas.bubbleapps.io/version-test');

    // Schemas
    expect(spec.components.schemas['User']).toBeDefined();
    expect(spec.components.schemas['User'].properties.email.type).toBe('string');
    expect(spec.components.schemas['User'].properties.is_active.type).toBe('boolean');

    expect(spec.components.schemas['Project']).toBeDefined();
    expect(spec.components.schemas['Project'].properties.owner.$ref).toBe('#/components/schemas/User');
    expect(spec.components.schemas['Project'].properties.tags.type).toBe('array');

    // Security Scheme
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');

    // Workflow API Path
    expect(spec.paths['/api/1.1/wf/send_invoice']).toBeDefined();
    expect(spec.paths['/api/1.1/wf/send_invoice'].post).toBeDefined();
    expect(spec.paths['/api/1.1/wf/send_invoice'].post.summary).toContain('send_invoice');

    // Data API Paths
    expect(spec.paths['/api/1.1/obj/user']).toBeDefined();
    expect(spec.paths['/api/1.1/obj/user'].get).toBeDefined();
    expect(spec.paths['/api/1.1/obj/user'].post).toBeDefined();
    expect(spec.paths['/api/1.1/obj/user/{id}']).toBeDefined();
    expect(spec.paths['/api/1.1/obj/user/{id}'].patch).toBeDefined();
    expect(spec.paths['/api/1.1/obj/user/{id}'].delete).toBeDefined();

    expect(spec.paths['/api/1.1/obj/project']).toBeDefined();
  });

  it('should serialize specification cleanly to formatted JSON and YAML', () => {
    const spec = OpenApiExporterEngine.generateOpenApiSpec(mockBlueprint, mockSchema);
    
    const jsonStr = OpenApiExporterEngine.exportSpecAsJson(spec);
    expect(jsonStr).toContain('"openapi": "3.1.0"');
    expect(JSON.parse(jsonStr).info.title).toBe(spec.info.title);

    const yamlStr = OpenApiExporterEngine.exportSpecAsYaml(spec);
    expect(yamlStr).toContain('openapi: 3.1.0');
    expect(yamlStr).toContain('title:');
    expect(yamlStr).toContain('/api/1.1/wf/send_invoice:');
  });

  it('should generate accurate code snippets in cURL, TypeScript, and Python', () => {
    const curl = OpenApiExporterEngine.generateCurlSnippet(
      '/api/1.1/wf/send_invoice',
      'POST',
      'https://test.bubbleapps.io/version-test',
      { invoice_id: 'inv_123', amount: 500 },
      'test_token_xyz'
    );
    expect(curl).toContain('curl -X POST');
    expect(curl).toContain('https://test.bubbleapps.io/version-test/api/1.1/wf/send_invoice');
    expect(curl).toContain('Bearer test_token_xyz');

    const ts = OpenApiExporterEngine.generateTypeScriptSnippet(
      '/api/1.1/wf/send_invoice',
      'POST',
      'https://test.bubbleapps.io/version-test',
      'InvoicePayload',
      { invoice_id: 'inv_123', amount: 500 }
    );
    expect(ts).toContain('export interface InvoicePayload');
    expect(ts).toContain('export async function callBubbleApi');
    expect(ts).toContain('method: "POST"');

    const py = OpenApiExporterEngine.generatePythonSnippet(
      '/api/1.1/wf/send_invoice',
      'POST',
      'https://test.bubbleapps.io/version-test',
      { invoice_id: 'inv_123', amount: 500 }
    );
    expect(py).toContain('import requests');
    expect(py).toContain('requests.post');
  });
});
