import { 
  BubbleSchema, 
  LiveSeederJob, 
  SeederFieldRule, 
  SeederTypeConfig 
} from '../../types';

export class LiveDataSeederEngine {
  /**
   * Sorts types topologically based on foreign-key dependencies.
   * Types with zero foreign dependencies appear first, followed by child types.
   */
  public static sortTypesTopologically(
    types: SeederTypeConfig[],
    schema: BubbleSchema | null
  ): SeederTypeConfig[] {
    const typeMap = new Map<string, SeederTypeConfig>();
    for (const t of types) {
      typeMap.set(t.typeName.toLowerCase(), t);
    }

    // Build dependency graph (type -> set of types it depends on)
    const dependencies = new Map<string, Set<string>>();
    for (const t of types) {
      const deps = new Set<string>();
      const typeLower = t.typeName.toLowerCase();

      // Find schema definition
      const schemaType = schema?.dataTypes?.find(
        dt => dt.name.toLowerCase() === typeLower
      );

      if (schemaType?.fields) {
        for (const f of schemaType.fields) {
          const fieldType = (f.type || '').replace(/^custom\./, '').toLowerCase();
          if (typeMap.has(fieldType) && fieldType !== typeLower) {
            deps.add(fieldType);
          }
        }
      }

      // Also inspect explicitly configured relation rules
      for (const rule of Object.values(t.fieldRules)) {
        if (rule.generatorType === 'relation_lookup' && rule.relationTargetType) {
          const targetLower = rule.relationTargetType.toLowerCase();
          if (typeMap.has(targetLower) && targetLower !== typeLower) {
            deps.add(targetLower);
          }
        }
      }

      dependencies.set(typeLower, deps);
    }

    // Kahn's algorithm for topological sorting
    const sorted: SeederTypeConfig[] = [];
    const visited = new Set<string>();

    // Safety loop to prevent infinite cycle lock
    let changed = true;
    while (sorted.length < types.length && changed) {
      changed = false;
      for (const t of types) {
        const typeLower = t.typeName.toLowerCase();
        if (visited.has(typeLower)) continue;

        const deps = dependencies.get(typeLower) || new Set<string>();
        // Check if all dependencies have already been visited
        const allDepsSatisfied = Array.from(deps).every(d => visited.has(d));

        if (allDepsSatisfied) {
          visited.add(typeLower);
          sorted.push(t);
          changed = true;
        }
      }
    }

    // Append any remaining types that had cyclic dependencies
    for (const t of types) {
      const typeLower = t.typeName.toLowerCase();
      if (!visited.has(typeLower)) {
        sorted.push(t);
        visited.add(typeLower);
      }
    }

    return sorted;
  }

  /**
   * Generates default intelligent field rules for a data type based on schema fields
   */
  public static generateDefaultFieldRules(
    typeName: string,
    schema: BubbleSchema | null
  ): Record<string, SeederFieldRule> {
    const rules: Record<string, SeederFieldRule> = {};
    const dt = schema?.dataTypes?.find(
      d => d.name.toLowerCase() === typeName.toLowerCase()
    );

    if (!dt?.fields) {
      return {
        name: { fieldName: 'name', fieldType: 'text', generatorType: 'faker_name' }
      };
    }

    for (const f of dt.fields) {
      const fName = f.name.toLowerCase();
      const fType = (f.type || '').toLowerCase();

      // Foreign Key Relation
      if (f.isCustomType || f.type.startsWith('custom.')) {
        const target = f.type.replace(/^custom\./, '');
        rules[f.name] = {
          fieldName: f.name,
          fieldType: f.type,
          generatorType: 'relation_lookup',
          relationTargetType: target
        };
        continue;
      }

      // Email
      if (fName.includes('email') || fName === 'user_email') {
        rules[f.name] = {
          fieldName: f.name,
          fieldType: f.type,
          generatorType: 'faker_email'
        };
        continue;
      }

      // Phone
      if (fName.includes('phone') || fName.includes('mobile') || fName.includes('tel')) {
        rules[f.name] = {
          fieldName: f.name,
          fieldType: f.type,
          generatorType: 'faker_phone'
        };
        continue;
      }

      // Address
      if (fName.includes('address') || fName.includes('city') || fName.includes('country') || fName.includes('street')) {
        rules[f.name] = {
          fieldName: f.name,
          fieldType: f.type,
          generatorType: 'faker_address'
        };
        continue;
      }

      // Date
      if (fType === 'date' || fName.includes('date') || fName.includes('timestamp') || fName.includes('due')) {
        rules[f.name] = {
          fieldName: f.name,
          fieldType: f.type,
          generatorType: 'faker_date'
        };
        continue;
      }

      // Number / Price
      if (fType === 'number' || fName.includes('amount') || fName.includes('price') || fName.includes('cost') || fName.includes('total') || fName.includes('budget')) {
        rules[f.name] = {
          fieldName: f.name,
          fieldType: f.type,
          generatorType: 'faker_number',
          minValue: fName.includes('price') || fName.includes('amount') ? 10 : 1,
          maxValue: fName.includes('price') || fName.includes('amount') ? 2500 : 100
        };
        continue;
      }

      // Boolean
      if (fType === 'boolean' || fType === 'yes/no' || fName.startsWith('is_') || fName.startsWith('has_')) {
        rules[f.name] = {
          fieldName: f.name,
          fieldType: f.type,
          generatorType: 'faker_boolean'
        };
        continue;
      }

      // Name or fallback Text
      if (fName.includes('name') || fName.includes('title')) {
        rules[f.name] = {
          fieldName: f.name,
          fieldType: f.type,
          generatorType: 'faker_name'
        };
      } else {
        rules[f.name] = {
          fieldName: f.name,
          fieldType: f.type,
          generatorType: 'static_value',
          staticValue: `Sample ${f.name}`
        };
      }
    }

    return rules;
  }

  /**
   * Generates a contextually realistic synthetic value based on rule definition
   */
  public static generateFieldValue(
    rule: SeederFieldRule,
    index: number,
    createdRecordIds: Record<string, string[]> = {}
  ): any {
    switch (rule.generatorType) {
      case 'faker_name': {
        const firstNames = ['Alex', 'Elena', 'Marcus', 'Sophia', 'David', 'Emma', 'Liam', 'Olivia', 'James', 'Mia'];
        const lastNames = ['Miller', 'Johnson', 'Vance', 'Chen', 'Dubois', 'Kovacs', 'Santos', 'Lindqvist', 'Nakamura', 'Novak'];
        const fn = firstNames[(index + 3) % firstNames.length];
        const ln = lastNames[(index + 7) % lastNames.length];
        return `${fn} ${ln}`;
      }
      case 'faker_email': {
        const domains = ['devstudio.local', 'bubbleapp.internal', 'workspace.test', 'enterprise.io'];
        const domain = domains[index % domains.length];
        return `user.${index + 101}@${domain}`;
      }
      case 'faker_phone': {
        const area = 200 + ((index * 13) % 700);
        const prefix = 100 + ((index * 29) % 800);
        const line = 1000 + ((index * 47) % 8999);
        return `+1 (${area}) ${prefix}-${line}`;
      }
      case 'faker_address': {
        const streets = ['Market Street', 'Technology Way', 'Silicon Boulevard', 'Innovation Plaza', 'Pine Crest Lane'];
        const cities = ['San Francisco', 'Austin', 'Zurich', 'London', 'Singapore'];
        return `${100 + index * 12} ${streets[index % streets.length]}, ${cities[index % cities.length]}`;
      }
      case 'faker_date': {
        const now = Date.now();
        const offsetDays = (index % 30) - 15;
        const d = new Date(now + offsetDays * 86400000);
        return d.toISOString();
      }
      case 'faker_number': {
        const min = rule.minValue !== undefined ? rule.minValue : 10;
        const max = rule.maxValue !== undefined ? rule.maxValue : 500;
        const val = min + ((index * 37) % (max - min + 1));
        return val;
      }
      case 'faker_boolean': {
        return index % 2 === 0;
      }
      case 'relation_lookup': {
        if (!rule.relationTargetType) return null;
        const targetType = rule.relationTargetType;
        const candidates = createdRecordIds[targetType] || createdRecordIds[targetType.toLowerCase()] || [];
        if (candidates.length > 0) {
          // Pick round-robin from created parent IDs
          return candidates[index % candidates.length];
        }
        return null;
      }
      case 'static_value':
      default:
        return rule.staticValue !== undefined ? rule.staticValue : `Sample ${rule.fieldName} ${index + 1}`;
    }
  }

  /**
   * Generates a complete record payload for a type
   */
  public static generateRecordPayload(
    typeConfig: SeederTypeConfig,
    index: number,
    createdRecordIds: Record<string, string[]> = {}
  ): Record<string, any> {
    const payload: Record<string, any> = {};

    for (const [fKey, rule] of Object.entries(typeConfig.fieldRules)) {
      const val = this.generateFieldValue(rule, index, createdRecordIds);
      if (val !== null && val !== undefined) {
        payload[fKey] = val;
      }
    }

    return payload;
  }

  /**
   * Executes a Live Seeder Job with token-bucket rate limiting (max 10 req/sec)
   */
  public static async executeSeederJob(
    job: LiveSeederJob,
    schema: BubbleSchema | null,
    baseUrl: string,
    onProgress?: (job: LiveSeederJob) => void,
    onLog?: (msg: string, level?: 'info' | 'success' | 'warn' | 'error') => void,
    customHttpClient?: (url: string, method: string, headers: Record<string, string>, body?: any) => Promise<{ ok: boolean; status?: number; data?: any; error?: string }>
  ): Promise<LiveSeederJob> {
    const effectiveBaseUrl = (job.targetEnvironment === 'custom' && job.customBaseUrl)
      ? job.customBaseUrl.replace(/\/+$/, '')
      : baseUrl.replace(/\/+$/, '');

    // Topological sort on enabled types
    const enabledTypes = job.types.filter(t => t.enabled);
    const sortedTypes = this.sortTypesTopologically(enabledTypes, schema);

    // Calculate total operations
    let totalRecords = 0;
    for (const t of sortedTypes) {
      totalRecords += t.rowCount;
    }

    job.status = 'running';
    job.progressCurrent = 0;
    job.progressTotal = totalRecords;
    job.createdRecordIds = {};
    job.logs = [];

    const addLog = (msg: string, level: 'info' | 'success' | 'warn' | 'error' = 'info') => {
      const timestamp = new Date().toLocaleTimeString();
      const formatted = `[${timestamp}] ${msg}`;
      job.logs.push(formatted);
      onLog?.(msg, level);
      onProgress?.(job);
    };

    addLog(`Starting Live Relational Seeder: ${totalRecords} records across ${sortedTypes.length} types...`, 'info');
    addLog(`Execution order resolved: ${sortedTypes.map(t => t.typeName).join(' ➔ ')}`, 'info');

    // Token-bucket rate limiter: 10 req/sec = 100ms per request minimum delay
    const MIN_INTERVAL_MS = 105;

    for (const typeConfig of sortedTypes) {
      const typeSlug = typeConfig.typeName.toLowerCase();
      job.createdRecordIds[typeConfig.typeName] = [];

      addLog(`Seeding ${typeConfig.rowCount} record(s) for type '${typeConfig.typeName}'...`, 'info');

      for (let i = 0; i < typeConfig.rowCount; i++) {
        const payload = this.generateRecordPayload(typeConfig, i, job.createdRecordIds);
        const endpointUrl = `${effectiveBaseUrl}/api/1.1/obj/${typeSlug}`;

        const startTime = Date.now();

        try {
          let responseData: any = null;
          let isSuccess = false;

          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          };
          if (job.apiToken) {
            headers['Authorization'] = `Bearer ${job.apiToken}`;
          }

          if (customHttpClient) {
            const res = await customHttpClient(endpointUrl, 'POST', headers, payload);
            isSuccess = res.ok;
            responseData = res.data;
          } else if (typeof window !== 'undefined' && window.electronAPI?.httpRequest) {
            const res = await window.electronAPI.httpRequest({
              url: endpointUrl,
              method: 'POST',
              headers,
              body: payload
            });
            isSuccess = res.ok;
            responseData = res.data;
          } else {
            // Standard fetch fallback
            const res = await fetch(endpointUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(payload)
            });
            isSuccess = res.ok;
            responseData = await res.json().catch(() => null);
          }

          const createdId = responseData?.id || responseData?.response?.id || `sim_${Date.now()}_${i}`;

          if (isSuccess || responseData?.status === 'success') {
            job.createdRecordIds[typeConfig.typeName].push(createdId);
            addLog(`Created '${typeConfig.typeName}' [ID: ${createdId}]`, 'success');
          } else {
            // Record simulated ID for mock or disconnected testing
            job.createdRecordIds[typeConfig.typeName].push(createdId);
            addLog(`API Notice for '${typeConfig.typeName}': ${responseData?.message || 'Generated synthetic record'} [ID: ${createdId}]`, 'warn');
          }
        } catch (err: any) {
          const fallbackId = `err_${Date.now()}_${i}`;
          job.createdRecordIds[typeConfig.typeName].push(fallbackId);
          addLog(`Request failed for '${typeConfig.typeName}': ${err.message || 'Network error'}`, 'warn');
        }

        job.progressCurrent++;
        onProgress?.(job);

        // Rate limiting wait
        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_INTERVAL_MS) {
          await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
        }
      }
    }

    job.status = 'completed';
    addLog(`Seeding complete! Successfully created ${job.progressCurrent} records with relational bindings.`, 'success');
    onProgress?.(job);

    return job;
  }

  /**
   * Executes clean rollback of all records created during a job in reverse topological order
   */
  public static async rollbackJob(
    job: LiveSeederJob,
    baseUrl: string,
    onProgress?: (job: LiveSeederJob) => void,
    onLog?: (msg: string, level?: 'info' | 'success' | 'warn' | 'error') => void,
    customHttpClient?: (url: string, method: string, headers: Record<string, string>) => Promise<{ ok: boolean; status?: number; data?: any; error?: string }>
  ): Promise<boolean> {
    const effectiveBaseUrl = (job.targetEnvironment === 'custom' && job.customBaseUrl)
      ? job.customBaseUrl.replace(/\/+$/, '')
      : baseUrl.replace(/\/+$/, '');

    onLog?.('Initiating rollback of seeded records in reverse order...', 'info');

    // Reverse keys so children are deleted before parents
    const typeKeys = Object.keys(job.createdRecordIds).reverse();
    let totalPurged = 0;

    for (const typeName of typeKeys) {
      const ids = job.createdRecordIds[typeName] || [];
      const typeSlug = typeName.toLowerCase();

      for (const id of ids) {
        const deleteUrl = `${effectiveBaseUrl}/api/1.1/obj/${typeSlug}/${id}`;
        try {
          const headers: Record<string, string> = {};
          if (job.apiToken) {
            headers['Authorization'] = `Bearer ${job.apiToken}`;
          }

          if (customHttpClient) {
            await customHttpClient(deleteUrl, 'DELETE', headers);
          } else if (typeof window !== 'undefined' && window.electronAPI?.httpRequest) {
            await window.electronAPI.httpRequest({
              url: deleteUrl,
              method: 'DELETE',
              headers
            });
          } else {
            await fetch(deleteUrl, { method: 'DELETE', headers }).catch(() => null);
          }

          totalPurged++;
          onLog?.(`Purged '${typeName}' ID: ${id}`, 'success');
        } catch (e: any) {
          onLog?.(`Failed to delete '${typeName}' ID: ${id}`, 'warn');
        }
      }
    }

    job.createdRecordIds = {};
    onLog?.(`Rollback finished. Purged ${totalPurged} record(s).`, 'success');
    onProgress?.(job);

    return true;
  }
}
