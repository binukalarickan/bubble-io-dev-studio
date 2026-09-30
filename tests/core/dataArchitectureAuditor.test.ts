import { describe, it, expect } from 'vitest';
import { DataArchitectureAuditor } from '../../src/core/audit/dataArchitectureAuditor';
import { BubbleSchema } from '../../src/types';

describe('DataArchitectureAuditor - Relational Anti-Pattern Static Auditor', () => {
  const badSchema: BubbleSchema = {
    appName: 'Legacy App',
    version: '1.0.0',
    dataTypes: [
      {
        name: 'User',
        fields: [
          { name: 'email', type: 'text' },
          // UNBOUNDED LIST: User has list of orders directly
          { name: 'orders', type: 'custom.Order', isList: true },
          // Dangling Ghost Relation: points to deleted type
          { name: 'old_membership', type: 'custom.LegacyMembership' }
        ]
      },
      {
        name: 'Order',
        fields: [
          { name: 'amount', type: 'number' }
        ]
      },
      {
        name: 'WideCustomerProfile',
        fields: Array.from({ length: 28 }, (_, i) => ({
          name: `field_${i}`,
          type: 'text'
        }))
      }
    ],
    optionSets: []
  };

  const badBlueprint = {
    pages: {
      dashboard: {
        elements: {
          repeating_group_orders: {
            data_source: 'Search for Orders:filter(Status is active)'
          }
        }
      }
    }
  };

  it('should detect unbounded lists, wide tables, client filters, and dangling relations', () => {
    const report = DataArchitectureAuditor.auditDataArchitecture(badBlueprint, badSchema);

    expect(report.totalTypesAudited).toBe(3);
    expect(report.issues.length).toBeGreaterThanOrEqual(4);

    // Unbounded list check
    const unbounded = report.issues.find(i => i.type === 'UNBOUNDED_LIST');
    expect(unbounded).toBeDefined();
    expect(unbounded?.severity).toBe('CRITICAL');
    expect(unbounded?.typeName).toBe('User');
    expect(unbounded?.fieldName).toBe('orders');
    expect(unbounded?.recommendedRefactor).toContain('foreign-key');

    // Wide table check
    const wideTable = report.issues.find(i => i.type === 'WIDE_TABLE_BLOAT');
    expect(wideTable).toBeDefined();
    expect(wideTable?.severity).toBe('HIGH');
    expect(wideTable?.typeName).toBe('WideCustomerProfile');

    // Client-side filter abuse check
    const clientFilter = report.issues.find(i => i.type === 'CLIENT_SIDE_FILTER_ABUSE');
    expect(clientFilter).toBeDefined();
    expect(clientFilter?.severity).toBe('CRITICAL');
    expect(clientFilter?.wuWasteRisk).toBe('CRITICAL');

    // Dangling ghost relation check
    const dangling = report.issues.find(i => i.type === 'DANGLING_GHOST_RELATION');
    expect(dangling).toBeDefined();

    // Health Score calculation
    expect(report.dataHealthScore).toBeLessThan(70);
    expect(report.estimatedWuSavingsPercent).toBeGreaterThan(20);
  });

  it('should return a perfect health score (100) for clean relational architectures', () => {
    const cleanSchema: BubbleSchema = {
      appName: 'Clean Architecture SaaS',
      version: '2.0.0',
      dataTypes: [
        {
          name: 'Company',
          fields: [
            { name: 'name', type: 'text', required: true }
          ]
        },
        {
          name: 'Employee',
          fields: [
            { name: 'full_name', type: 'text' },
            { name: 'email', type: 'text' },
            // Clean 1:N reference: Child points to parent Company
            { name: 'company', type: 'custom.Company' }
          ]
        }
      ],
      optionSets: []
    };

    const cleanBlueprint = {
      pages: {
        index: {
          elements: {
            employees_list: {
              data_source: 'Search for Employees[company = Current Company]'
            }
          }
        }
      }
    };

    const report = DataArchitectureAuditor.auditDataArchitecture(cleanBlueprint, cleanSchema);
    expect(report.issues.length).toBe(0);
    expect(report.dataHealthScore).toBe(100);
    expect(report.criticalIssuesCount).toBe(0);
    expect(report.highIssuesCount).toBe(0);
  });
});
