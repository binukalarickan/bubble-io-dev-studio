import { 
  BubbleSchema, 
  ExportedOpenApiEndpoint, 
  ExportedOpenApiSpec, 
  OpenApiExportOptions 
} from '../../types';

export class OpenApiExporterEngine {
  /**
   * Default export configuration options
   */
  public static readonly DEFAULT_OPTIONS: OpenApiExportOptions = {
    includeWorkflowApis: true,
    includeDataApis: true,
    apiVersion: '1.1',
    serverBaseUrl: 'https://your-app.bubbleapps.io/version-test',
    requireAuthentication: true,
    format: 'json'
  };

  /**
   * Maps Bubble data types to OpenAPI 3.1 JSON Schema types
   */
  public static mapBubbleTypeToSchema(
    bubbleType: string,
    isList?: boolean,
    customTypeNames: Set<string> = new Set()
  ): Record<string, any> {
    const cleanType = bubbleType ? bubbleType.trim().toLowerCase() : 'text';

    let schema: Record<string, any>;

    if (cleanType === 'text') {
      schema = { type: 'string' };
    } else if (cleanType === 'number') {
      schema = { type: 'number' };
    } else if (cleanType === 'boolean' || cleanType === 'yes/no') {
      schema = { type: 'boolean' };
    } else if (cleanType === 'date') {
      schema = { type: 'string', format: 'date-time' };
    } else if (cleanType === 'file' || cleanType === 'image') {
      schema = { type: 'string', format: 'uri', description: 'Bubble hosted S3 file URL' };
    } else if (cleanType.startsWith('custom.')) {
      const targetName = bubbleType.replace(/^custom\./, '');
      schema = { $ref: `#/components/schemas/${targetName}` };
    } else if (customTypeNames.has(bubbleType)) {
      schema = { $ref: `#/components/schemas/${bubbleType}` };
    } else {
      schema = { type: 'string' };
    }

    if (isList) {
      return {
        type: 'array',
        items: schema
      };
    }

    return schema;
  }

  /**
   * Generates a standard OpenAPI 3.1.0 specification object
   */
  public static generateOpenApiSpec(
    blueprint: any,
    schema: BubbleSchema | null,
    optionsPartial?: Partial<OpenApiExportOptions>
  ): ExportedOpenApiSpec {
    const options: OpenApiExportOptions = {
      ...this.DEFAULT_OPTIONS,
      ...(optionsPartial || {})
    };

    const appName = schema?.appName || blueprint?.app_name || blueprint?.name || 'Bubble App';
    const serverUrl = (options.serverBaseUrl || 'https://your-app.bubbleapps.io/version-test').replace(/\/+$/, '');

    const componentsSchemas: Record<string, any> = {};
    const customTypeNames = new Set<string>();

    if (schema?.dataTypes) {
      for (const dt of schema.dataTypes) {
        customTypeNames.add(dt.name);
      }
    }

    // 1. Build components.schemas from Bubble Data Types
    if (schema?.dataTypes && schema.dataTypes.length > 0) {
      for (const dt of schema.dataTypes) {
        const properties: Record<string, any> = {
          _id: { type: 'string', description: 'Unique Bubble alphanumeric record identifier' },
          'Created Date': { type: 'string', format: 'date-time' },
          'Modified Date': { type: 'string', format: 'date-time' },
          'Created By': { type: 'string', description: 'User ID of creator' }
        };

        const requiredFields: string[] = ['_id'];

        for (const field of dt.fields || []) {
          properties[field.name] = this.mapBubbleTypeToSchema(field.type, field.isList, customTypeNames);
          if (field.description) {
            properties[field.name].description = field.description;
          }
          if (field.required) {
            requiredFields.push(field.name);
          }
        }

        componentsSchemas[dt.name] = {
          type: 'object',
          description: `Bubble database object definition for '${dt.name}'`,
          properties,
          required: requiredFields
        };
      }
    }

    const paths: Record<string, any> = {};

    // 2. Build Workflow API Endpoints (/api/1.1/wf/...)
    if (options.includeWorkflowApis) {
      const apiWorkflows = this.extractApiWorkflows(blueprint);
      for (const wf of apiWorkflows) {
        const path = `/api/1.1/wf/${wf.name}`;
        const reqProps: Record<string, any> = {};
        const reqRequired: string[] = [];

        for (const param of wf.parameters || []) {
          reqProps[param.name] = this.mapBubbleTypeToSchema(param.type, param.isList, customTypeNames);
          if (param.description) {
            reqProps[param.name].description = param.description;
          }
          if (param.optional !== true && param.required !== false) {
            reqRequired.push(param.name);
          }
        }

        const requestBody = Object.keys(reqProps).length > 0 ? {
          required: reqRequired.length > 0,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: reqProps,
                ...(reqRequired.length > 0 ? { required: reqRequired } : {})
              }
            }
          }
        } : undefined;

        paths[path] = {
          post: {
            tags: ['Workflow API'],
            summary: `Trigger '${wf.name}' backend workflow`,
            description: wf.description || `Triggers the Bubble backend API workflow '${wf.name}' synchronously or asynchronously.`,
            operationId: `workflow_${wf.name}`,
            ...(requestBody ? { requestBody } : {}),
            responses: {
              '200': {
                description: 'Workflow execution acknowledged or completed successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'success' },
                        response: { type: 'object', description: 'Values returned via Return data from API action' }
                      }
                    }
                  }
                }
              },
              '400': {
                description: 'Missing or invalid workflow parameters'
              },
              '401': {
                description: 'Unauthorized - Invalid or missing Bubble API token'
              }
            }
          }
        };
      }
    }

    // 3. Build Data API Endpoints (/api/1.1/obj/...)
    if (options.includeDataApis && schema?.dataTypes) {
      for (const dt of schema.dataTypes) {
        const slug = dt.name.toLowerCase();
        const listPath = `/api/1.1/obj/${slug}`;
        const itemPath = `/api/1.1/obj/${slug}/{id}`;

        const inputProperties: Record<string, any> = {};
        for (const field of dt.fields || []) {
          inputProperties[field.name] = this.mapBubbleTypeToSchema(field.type, field.isList, customTypeNames);
        }

        // GET List & POST Create
        paths[listPath] = {
          get: {
            tags: [`Data API: ${dt.name}`],
            summary: `List '${dt.name}' records`,
            description: `Query multiple '${dt.name}' records with pagination constraints, limits, and sorting.`,
            operationId: `list_${slug}`,
            parameters: [
              {
                name: 'cursor',
                in: 'query',
                required: false,
                schema: { type: 'integer', default: 0 },
                description: 'Offset cursor for pagination'
              },
              {
                name: 'limit',
                in: 'query',
                required: false,
                schema: { type: 'integer', default: 50, maximum: 100 },
                description: 'Number of records to return (max 100)'
              },
              {
                name: 'constraints',
                in: 'query',
                required: false,
                schema: { type: 'string' },
                description: 'JSON array of constraint objects: [{"key":"field","constraint_type":"equals","value":"foo"}]'
              },
              {
                name: 'sort_field',
                in: 'query',
                required: false,
                schema: { type: 'string' },
                description: 'Field name to sort results by'
              },
              {
                name: 'descending',
                in: 'query',
                required: false,
                schema: { type: 'boolean', default: false },
                description: 'Sort direction'
              }
            ],
            responses: {
              '200': {
                description: `Successfully retrieved list of '${dt.name}'`,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        response: {
                          type: 'object',
                          properties: {
                            cursor: { type: 'integer' },
                            results: {
                              type: 'array',
                              items: { $ref: `#/components/schemas/${dt.name}` }
                            },
                            remaining: { type: 'integer' },
                            count: { type: 'integer' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            tags: [`Data API: ${dt.name}`],
            summary: `Create new '${dt.name}' record`,
            description: `Creates a single new '${dt.name}' entity in the Bubble database.`,
            operationId: `create_${slug}`,
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: inputProperties
                  }
                }
              }
            },
            responses: {
              '201': {
                description: `Record '${dt.name}' created successfully`,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'success' },
                        id: { type: 'string', example: '1709123456789x123456789012345678' }
                      }
                    }
                  }
                }
              },
              '400': { description: 'Bad Request' },
              '401': { description: 'Unauthorized' }
            }
          }
        };

        // GET by ID, PATCH, DELETE
        paths[itemPath] = {
          get: {
            tags: [`Data API: ${dt.name}`],
            summary: `Retrieve '${dt.name}' by ID`,
            description: `Fetches full field payload for a single '${dt.name}' by its unique ID.`,
            operationId: `get_${slug}_by_id`,
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                description: 'Alphanumeric Bubble record ID'
              }
            ],
            responses: {
              '200': {
                description: `Record '${dt.name}' found`,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        response: { $ref: `#/components/schemas/${dt.name}` }
                      }
                    }
                  }
                }
              },
              '404': { description: 'Record not found' }
            }
          },
          patch: {
            tags: [`Data API: ${dt.name}`],
            summary: `Update '${dt.name}' record`,
            description: `Partially updates fields of an existing '${dt.name}' record by ID.`,
            operationId: `update_${slug}`,
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                description: 'Record ID to update'
              }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: inputProperties
                  }
                }
              }
            },
            responses: {
              '204': { description: 'Record updated successfully' },
              '404': { description: 'Record not found' }
            }
          },
          delete: {
            tags: [`Data API: ${dt.name}`],
            summary: `Delete '${dt.name}' record`,
            description: `Permanently deletes an existing '${dt.name}' record by ID.`,
            operationId: `delete_${slug}`,
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                description: 'Record ID to delete'
              }
            ],
            responses: {
              '204': { description: 'Record deleted successfully' },
              '404': { description: 'Record not found' }
            }
          }
        };
      }
    }

    const securitySchemes: Record<string, any> = {};
    if (options.requireAuthentication) {
      securitySchemes.bearerAuth = {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Bubble API Token',
        description: 'Bubble.io Private API Token obtained from Settings > API in the Bubble editor'
      };
    }

    const spec: ExportedOpenApiSpec = {
      openapi: '3.1.0',
      info: {
        title: `${appName} API`,
        version: options.apiVersion || '1.1.0',
        description: `Official OpenAPI 3.1.0 specification for ${appName}, generated dynamically by Bubble.io Dev Studio. Includes Workflow API endpoints and Data API relational collections.`
      },
      servers: [
        {
          url: serverUrl,
          description: 'Bubble Target Server'
        }
      ],
      paths,
      components: {
        securitySchemes,
        schemas: componentsSchemas
      }
    };

    return spec;
  }

  /**
   * Helper to extract backend API workflows from blueprint JSON
   */
  public static extractApiWorkflows(blueprint: any): Array<{
    name: string;
    description?: string;
    parameters: Array<{ name: string; type: string; isList?: boolean; optional?: boolean; required?: boolean; description?: string }>;
  }> {
    const results: Array<{
      name: string;
      description?: string;
      parameters: Array<{ name: string; type: string; isList?: boolean; optional?: boolean; required?: boolean; description?: string }>;
    }> = [];

    if (!blueprint) {
      // Return representative default API workflows if no blueprint loaded
      return [
        {
          name: 'send_welcome_email',
          description: 'Dispatches onboarding email sequence to new registered user',
          parameters: [
            { name: 'user_email', type: 'text', required: true },
            { name: 'full_name', type: 'text', required: true },
            { name: 'invitation_code', type: 'text', optional: true }
          ]
        },
        {
          name: 'process_payment_webhook',
          description: 'Receives and validates asynchronous payment events from payment gateway',
          parameters: [
            { name: 'event_id', type: 'text', required: true },
            { name: 'amount', type: 'number', required: true },
            { name: 'currency', type: 'text', required: true },
            { name: 'metadata', type: 'text', optional: true }
          ]
        }
      ];
    }

    // Check blueprint.api_workflows
    if (blueprint.api_workflows && typeof blueprint.api_workflows === 'object') {
      const entries = Array.isArray(blueprint.api_workflows) 
        ? blueprint.api_workflows 
        : Object.entries(blueprint.api_workflows).map(([key, val]: [string, any]) => ({ name: key, ...(val || {}) }));

      for (const entry of entries) {
        const wfName = entry.name || entry.id || entry.slug;
        if (!wfName) continue;

        const params: Array<{ name: string; type: string; isList?: boolean; optional?: boolean; required?: boolean }> = [];
        const rawParams = entry.parameters || entry.parameter_definitions || entry.inputs || {};

        if (Array.isArray(rawParams)) {
          for (const p of rawParams) {
            params.push({
              name: p.name || p.key,
              type: p.type || 'text',
              isList: !!p.is_list || !!p.isList,
              optional: p.optional === true,
              required: p.optional !== true
            });
          }
        } else if (typeof rawParams === 'object') {
          for (const [pKey, pVal] of Object.entries<any>(rawParams)) {
            params.push({
              name: pKey,
              type: (typeof pVal === 'string' ? pVal : pVal?.type) || 'text',
              isList: !!pVal?.is_list || !!pVal?.isList,
              optional: pVal?.optional === true,
              required: pVal?.optional !== true
            });
          }
        }

        results.push({
          name: wfName,
          description: entry.description || entry.notes,
          parameters: params
        });
      }
    }

    // Check backend workflows inside blueprint.workflows if marked as api
    if (results.length === 0 && blueprint.workflows && typeof blueprint.workflows === 'object') {
      for (const [key, wf] of Object.entries<any>(blueprint.workflows)) {
        if (wf?.type === 'api' || wf?.is_api || key.startsWith('api_')) {
          results.push({
            name: key.replace(/^api_/, ''),
            description: wf?.description || `API workflow ${key}`,
            parameters: [
              { name: 'payload', type: 'text', required: true }
            ]
          });
        }
      }
    }

    return results;
  }

  /**
   * Converts the OpenAPI specification to a formatted JSON string
   */
  public static exportSpecAsJson(spec: ExportedOpenApiSpec): string {
    return JSON.stringify(spec, null, 2);
  }

  /**
   * Converts the OpenAPI specification to a clean YAML string
   */
  public static exportSpecAsYaml(spec: ExportedOpenApiSpec): string {
    return this.objectToYaml(spec);
  }

  /**
   * Lightweight, robust recursive YAML generator
   */
  private static objectToYaml(obj: any, indent = 0): string {
    const spaces = '  '.repeat(indent);

    if (obj === null || obj === undefined) {
      return 'null';
    }

    if (typeof obj === 'boolean' || typeof obj === 'number') {
      return String(obj);
    }

    if (typeof obj === 'string') {
      if (
        obj === '' ||
        obj.includes('\n') ||
        /[\:\{\}\[\]\,\&\*\#\?\|\-\<\>\=\!\%\@\`]/.test(obj) ||
        /^(true|false|null|yes|no)$/i.test(obj)
      ) {
        return `"${obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return obj.map(item => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          const formatted = this.objectToYaml(item, indent + 1);
          const lines = formatted.split('\n');
          const firstLine = lines[0].trimStart();
          const restLines = lines.slice(1).join('\n');
          return `${spaces}- ${firstLine}${restLines ? `\n${restLines}` : ''}`;
        }
        return `${spaces}- ${this.objectToYaml(item, indent + 1)}`;
      }).join('\n');
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';

      return keys.map(key => {
        const value = obj[key];
        const safeKey = /[\s\:\#\{\}\[\]]/.test(key) ? `"${key}"` : key;

        if (value === null || value === undefined) {
          return `${spaces}${safeKey}: null`;
        }

        if (typeof value === 'object') {
          if (Array.isArray(value)) {
            if (value.length === 0) return `${spaces}${safeKey}: []`;
            return `${spaces}${safeKey}:\n${this.objectToYaml(value, indent + 1)}`;
          }
          if (Object.keys(value).length === 0) return `${spaces}${safeKey}: {}`;
          return `${spaces}${safeKey}:\n${this.objectToYaml(value, indent + 1)}`;
        }

        return `${spaces}${safeKey}: ${this.objectToYaml(value, indent)}`;
      }).join('\n');
    }

    return String(obj);
  }

  /**
   * Generates a ready-to-run cURL command snippet
   */
  public static generateCurlSnippet(
    path: string,
    method: string,
    baseUrl: string,
    requestBodySample?: any,
    apiToken: string = 'YOUR_BUBBLE_API_TOKEN'
  ): string {
    const fullUrl = `${baseUrl.replace(/\/+$/, '')}${path}`;
    const upperMethod = method.toUpperCase();

    let snippet = `curl -X ${upperMethod} "${fullUrl}" \\\n`;
    snippet += `  -H "Authorization: Bearer ${apiToken}" \\\n`;
    snippet += `  -H "Content-Type: application/json"`;

    if (requestBodySample && (upperMethod === 'POST' || upperMethod === 'PATCH' || upperMethod === 'PUT')) {
      const formattedJson = JSON.stringify(requestBodySample, null, 2)
        .replace(/"/g, '\\"')
        .split('\n')
        .join('\n  ');
      snippet += ` \\\n  -d "${formattedJson}"`;
    }

    return snippet;
  }

  /**
   * Generates a modern TypeScript fetch client snippet with type interfaces
   */
  public static generateTypeScriptSnippet(
    path: string,
    method: string,
    baseUrl: string,
    typeName: string = 'RecordPayload',
    requestBodySample?: any
  ): string {
    const fullUrl = `${baseUrl.replace(/\/+$/, '')}${path}`;
    const upperMethod = method.toUpperCase();
    const hasBody = requestBodySample && (upperMethod === 'POST' || upperMethod === 'PATCH' || upperMethod === 'PUT');

    let code = `// TypeScript Bubble.io API Client Snippet\n`;
    code += `export interface ${typeName} {\n`;
    if (requestBodySample && typeof requestBodySample === 'object') {
      for (const [k, v] of Object.entries(requestBodySample)) {
        const tsType = typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
        code += `  ${k}?: ${tsType};\n`;
      }
    } else {
      code += `  [key: string]: any;\n`;
    }
    code += `}\n\n`;

    code += `export async function callBubbleApi(payload?: ${typeName}, apiToken: string = process.env.BUBBLE_API_TOKEN!) {\n`;
    code += `  const response = await fetch("${fullUrl}", {\n`;
    code += `    method: "${upperMethod}",\n`;
    code += `    headers: {\n`;
    code += `      "Authorization": \`Bearer \${apiToken}\`,\n`;
    code += `      "Content-Type": "application/json"\n`;
    code += `    },\n`;
    if (hasBody) {
      code += `    body: JSON.stringify(payload || ${JSON.stringify(requestBodySample)})\n`;
    }
    code += `  });\n\n`;
    code += `  if (!response.ok) {\n`;
    code += `    throw new Error(\`Bubble API error: \${response.status} \${response.statusText}\`);\n`;
    code += `  }\n\n`;
    code += `  return response.json();\n`;
    code += `}\n`;

    return code;
  }

  /**
   * Generates a Python requests client snippet
   */
  public static generatePythonSnippet(
    path: string,
    method: string,
    baseUrl: string,
    requestBodySample?: any
  ): string {
    const fullUrl = `${baseUrl.replace(/\/+$/, '')}${path}`;
    const lowerMethod = method.toLowerCase();
    const hasBody = requestBodySample && (lowerMethod === 'post' || lowerMethod === 'patch' || lowerMethod === 'put');

    let code = `# Python Bubble API Client (requests)\n`;
    code += `import requests\n`;
    code += `import os\n\n`;
    code += `BUBBLE_API_TOKEN = os.getenv("BUBBLE_API_TOKEN", "YOUR_API_TOKEN")\n`;
    code += `BASE_URL = "${fullUrl}"\n\n`;
    code += `headers = {\n`;
    code += `    "Authorization": f"Bearer {BUBBLE_API_TOKEN}",\n`;
    code += `    "Content-Type": "application/json"\n`;
    code += `}\n\n`;

    if (hasBody) {
      code += `payload = ${JSON.stringify(requestBodySample, null, 4)}\n\n`;
      code += `response = requests.${lowerMethod}(BASE_URL, headers=headers, json=payload)\n`;
    } else {
      code += `response = requests.${lowerMethod}(BASE_URL, headers=headers)\n`;
    }

    code += `response.raise_for_status()\n`;
    code += `data = response.json()\n`;
    code += `print("Bubble API Response:", data)\n`;

    return code;
  }
}
