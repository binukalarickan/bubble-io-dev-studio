import { 
  BubbleSchema, 
  DataAntiPatternIssue, 
  DataArchitectureAuditReport 
} from '../../types';

export class DataArchitectureAuditor {
  /**
   * Performs deep static analysis on Bubble schemas and blueprint AST
   * to detect relational anti-patterns, unbounded lists, wide tables, and client filter abuse.
   */
  public static auditDataArchitecture(
    blueprint: any,
    schema: BubbleSchema | null
  ): DataArchitectureAuditReport {
    const issues: DataAntiPatternIssue[] = [];
    const timestamp = new Date().toISOString();

    const dataTypes = schema?.dataTypes || this.extractDataTypesFromBlueprint(blueprint);
    const customTypeNames = new Set<string>(dataTypes.map(d => d.name));

    let totalFieldsAudited = 0;

    // =========================================================================
    // RULE 1: UNBOUNDED LIST ANTI-PATTERN (list of [Custom Things])
    // =========================================================================
    for (const dt of dataTypes) {
      for (const field of dt.fields || []) {
        totalFieldsAudited++;
        const isList = !!field.isList;
        const cleanType = field.type ? field.type.replace(/^custom\./, '') : '';
        const isRelationList = isList && (field.isCustomType || customTypeNames.has(cleanType) || field.type.startsWith('custom.'));

        if (isRelationList) {
          const targetType = cleanType || 'Entity';
          issues.push({
            id: `anti_unbounded_${dt.name}_${field.name}`,
            type: 'UNBOUNDED_LIST',
            severity: 'CRITICAL',
            typeName: dt.name,
            fieldName: field.name,
            title: `Unbounded List of Things: '${dt.name}.${field.name}' (${targetType}[])`,
            description: `Field '${field.name}' on type '${dt.name}' stores a direct list of '${targetType}'. Bubble stores lists as an array of IDs on the parent record, which degrades performance quadratically and risks hitting Bubble's hard limit of 10,000 items.`,
            impact: `Massive WU consumption when hydrating parent records, slow search queries, and potential data corruption if lists exceed Bubble's 10,000 item threshold.`,
            wuWasteRisk: 'CRITICAL',
            recommendedRefactor: `Convert the 1:N relationship by placing a single '${dt.name}' foreign-key field on '${targetType}', or implement a dedicated junction table '${dt.name}_${targetType}' for N:M relations.`,
            diagramSnippet: `erDiagram\n    ${dt.name} ||--o{ ${targetType} : "Refactor: store parent ID on child instead of list on parent"`
          });
        }
      }
    }

    // =========================================================================
    // RULE 2: WIDE TABLE PAYLOAD BLOAT (>25 fields or >10 heavy text fields)
    // =========================================================================
    for (const dt of dataTypes) {
      const fieldCount = (dt.fields || []).length;
      const heavyTextFields = (dt.fields || []).filter((f: any) => {
        const t = (f.type || '').toLowerCase();
        return t === 'text' || t === 'html' || t === 'json' || t === 'file' || t === 'image';
      });

      if (fieldCount > 25) {
        issues.push({
          id: `anti_wide_table_${dt.name}`,
          type: 'WIDE_TABLE_BLOAT',
          severity: 'HIGH',
          typeName: dt.name,
          title: `Wide Table Payload Bloat: '${dt.name}' has ${fieldCount} fields`,
          description: `Data type '${dt.name}' contains ${fieldCount} fields (>25 threshold). Because Bubble fetches all fields of an object in database searches and Repeating Groups, every query pulls large redundant payloads across the network.`,
          impact: `High bandwidth usage, sluggish frontend rendering in Repeating Groups, and inflated server WU costs during searches.`,
          wuWasteRisk: 'HIGH',
          recommendedRefactor: `Partition '${dt.name}' into 1:1 satellite entities. Keep high-frequency search fields on '${dt.name}' and move heavy or rarely accessed fields to '${dt.name}_Profile_Extended' or '${dt.name}_Settings'.`,
          diagramSnippet: `erDiagram\n    ${dt.name} ||--|| ${dt.name}_Extended : "1:1 Satellite Partition"`
        });
      } else if (heavyTextFields.length > 10) {
        issues.push({
          id: `anti_heavy_text_${dt.name}`,
          type: 'WIDE_TABLE_BLOAT',
          severity: 'MEDIUM',
          typeName: dt.name,
          title: `Heavy Text Density: '${dt.name}' contains ${heavyTextFields.length} text/media fields`,
          description: `Data type '${dt.name}' contains ${heavyTextFields.length} text or media fields. Searching this type without database constraints causes high payload overhead.`,
          impact: `Slow search transfers and increased client DOM rendering time.`,
          wuWasteRisk: 'MEDIUM',
          recommendedRefactor: `Move large descriptive content, logs, or HTML markup to an associated detail type.`
        });
      }
    }

    // =========================================================================
    // RULE 3: IN-MEMORY CLIENT FILTER ANTI-PATTERN (:filter on searches)
    // =========================================================================
    const filterAbuseFindings = this.detectClientSideFilterAbuse(blueprint);
    issues.push(...filterAbuseFindings);

    // =========================================================================
    // RULE 4: DANGLING GHOST RELATIONS
    // =========================================================================
    for (const dt of dataTypes) {
      for (const field of dt.fields || []) {
        if (field.isCustomType || (field.type && field.type.startsWith('custom.'))) {
          const targetName = field.type.replace(/^custom\./, '');
          if (!customTypeNames.has(targetName) && targetName !== 'user' && targetName !== 'User') {
            issues.push({
              id: `anti_dangling_${dt.name}_${field.name}`,
              type: 'DANGLING_GHOST_RELATION',
              severity: 'MEDIUM',
              typeName: dt.name,
              fieldName: field.name,
              title: `Dangling Relation: '${dt.name}.${field.name}' points to missing type '${targetName}'`,
              description: `Field '${field.name}' on '${dt.name}' references '${targetName}', which does not exist in the active schema definition.`,
              impact: `API query errors and unexpected null references during runtime execution.`,
              wuWasteRisk: 'LOW',
              recommendedRefactor: `Verify if '${targetName}' was deleted or renamed, and either re-create the type or remove the orphaned field.`
            });
          }
        }
      }
    }

    // =========================================================================
    // HEALTH SCORE CALCULATION
    // =========================================================================
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;

    for (const issue of issues) {
      if (issue.severity === 'CRITICAL') criticalCount++;
      else if (issue.severity === 'HIGH') highCount++;
      else if (issue.severity === 'MEDIUM') mediumCount++;
    }

    // 100 base score - (15 * CRITICAL) - (8 * HIGH) - (3 * MEDIUM)
    const rawScore = 100 - (criticalCount * 15) - (highCount * 8) - (mediumCount * 3);
    const dataHealthScore = Math.max(0, Math.min(100, rawScore));

    // Estimated WU savings: up to 60% savings if critical anti-patterns are resolved
    const estimatedWuSavingsPercent = Math.min(65, (criticalCount * 12) + (highCount * 6) + (mediumCount * 2));

    return {
      timestamp,
      dataHealthScore,
      totalTypesAudited: dataTypes.length,
      totalFieldsAudited,
      criticalIssuesCount: criticalCount,
      highIssuesCount: highCount,
      mediumIssuesCount: mediumCount,
      issues,
      estimatedWuSavingsPercent
    };
  }

  /**
   * Traverses blueprint pages, repeating groups, and workflows to find client-side filter abuse
   */
  private static detectClientSideFilterAbuse(blueprint: any): DataAntiPatternIssue[] {
    const findings: DataAntiPatternIssue[] = [];
    if (!blueprint) return findings;

    const inspectExpression = (expr: string, context: string, pageName: string) => {
      if (!expr || typeof expr !== 'string') return;
      const lower = expr.toLowerCase();

      // Check for patterns like "Search for X :filtered" or "do a search for:filter"
      if (
        (lower.includes('search for') || lower.includes('do a search')) &&
        (lower.includes(':filter') || lower.includes(':filtered') || lower.includes(':filter ('))
      ) {
        findings.push({
          id: `anti_client_filter_${pageName}_${Math.random().toString(36).substring(2, 7)}`,
          type: 'CLIENT_SIDE_FILTER_ABUSE',
          severity: 'CRITICAL',
          typeName: context,
          title: `Client-Side In-Memory Filter Abuse in '${pageName}' (${context})`,
          description: `Expression '${expr.length > 80 ? expr.substring(0, 80) + '...' : expr}' performs an unconstrained database search followed by client-side ':filter'. This downloads the entire dataset to the browser before filtering.`,
          impact: `Extreme Work Unit (WU) waste, high cellular data consumption for users, and potential browser crashes on large datasets.`,
          wuWasteRisk: 'CRITICAL',
          recommendedRefactor: `Move filter criteria directly into the 'Search for...' query constraints parameter so Bubble filters on the database server.`,
          diagramSnippet: `sequenceDiagram\n    Browser->>Database: Unconstrained Search (Pulls ALL records!)\n    Database-->>Browser: Full Payload (High WU Cost)\n    Note over Browser: In-Memory :filter (Slow)`
        });
      }
    };

    // 1. Inspect Pages
    if (blueprint.pages && typeof blueprint.pages === 'object') {
      for (const [pageName, page] of Object.entries<any>(blueprint.pages)) {
        if (page.elements && typeof page.elements === 'object') {
          for (const [elemName, elem] of Object.entries<any>(page.elements)) {
            if (elem.data_source) {
              inspectExpression(String(elem.data_source), `Element: ${elemName}`, pageName);
            }
            if (elem.properties) {
              for (const [propKey, propVal] of Object.entries<any>(elem.properties)) {
                if (typeof propVal === 'string') {
                  inspectExpression(propVal, `Element: ${elemName}.${propKey}`, pageName);
                }
              }
            }
          }
        }
      }
    }

    // 2. Inspect Workflows
    if (blueprint.workflows && typeof blueprint.workflows === 'object') {
      for (const [wfName, wf] of Object.entries<any>(blueprint.workflows)) {
        if (wf.actions && Array.isArray(wf.actions)) {
          for (const act of wf.actions) {
            if (act.expression) {
              inspectExpression(String(act.expression), `Action: ${act.name || 'unnamed'}`, wfName);
            }
            if (act.parameters) {
              for (const [pKey, pVal] of Object.entries<any>(act.parameters)) {
                if (typeof pVal === 'string') {
                  inspectExpression(pVal, `Workflow: ${wfName}.${pKey}`, 'Workflow');
                }
              }
            }
          }
        }
      }
    }

    return findings;
  }

  /**
   * Fallback extractor for data types from blueprint if schema is not provided
   */
  private static extractDataTypesFromBlueprint(blueprint: any): any[] {
    if (!blueprint) return [];
    const types: any[] = [];

    const rawTypes = blueprint.custom_types || blueprint.user_types || blueprint.types || blueprint.schema?.dataTypes || {};

    if (Array.isArray(rawTypes)) {
      return rawTypes;
    }

    if (typeof rawTypes === 'object') {
      for (const [typeName, def] of Object.entries<any>(rawTypes)) {
        const fields: any[] = [];
        const rawFields = def.fields || def.properties || {};

        if (Array.isArray(rawFields)) {
          for (const f of rawFields) {
            fields.push({
              name: f.name || f.key,
              type: f.type || 'text',
              isList: !!f.is_list || !!f.isList,
              isCustomType: !!f.is_custom_type || !!f.isCustomType
            });
          }
        } else if (typeof rawFields === 'object') {
          for (const [fName, fDef] of Object.entries<any>(rawFields)) {
            fields.push({
              name: fName,
              type: (typeof fDef === 'string' ? fDef : fDef?.type) || 'text',
              isList: !!fDef?.is_list || !!fDef?.isList,
              isCustomType: !!fDef?.is_custom_type || !!fDef?.isCustomType
            });
          }
        }

        types.push({
          name: typeName,
          fields
        });
      }
    }

    return types;
  }
}
