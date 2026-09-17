import { describe, it, expect, vi } from 'vitest';
import { LiveDataSeederEngine } from '../../src/core/devops/liveDataSeeder';
import { BubbleSchema, LiveSeederJob, SeederTypeConfig } from '../../src/types';

describe('LiveDataSeederEngine - Live Relational Synthetic Seeder', () => {
  const mockSchema: BubbleSchema = {
    appName: 'Test ERP',
    version: '1.0.0',
    dataTypes: [
      {
        name: 'Task',
        fields: [
          { name: 'title', type: 'text' },
          { name: 'project', type: 'custom.Project' }
        ]
      },
      {
        name: 'Company',
        fields: [
          { name: 'name', type: 'text' },
          { name: 'email', type: 'text' }
        ]
      },
      {
        name: 'Project',
        fields: [
          { name: 'title', type: 'text' },
          { name: 'company', type: 'custom.Company' }
        ]
      }
    ],
    optionSets: []
  };

  it('should sort types topologically so parent entities are created before children', () => {
    const rawConfigs: SeederTypeConfig[] = [
      {
        typeName: 'Task',
        rowCount: 2,
        enabled: true,
        fieldRules: LiveDataSeederEngine.generateDefaultFieldRules('Task', mockSchema)
      },
      {
        typeName: 'Company',
        rowCount: 2,
        enabled: true,
        fieldRules: LiveDataSeederEngine.generateDefaultFieldRules('Company', mockSchema)
      },
      {
        typeName: 'Project',
        rowCount: 2,
        enabled: true,
        fieldRules: LiveDataSeederEngine.generateDefaultFieldRules('Project', mockSchema)
      }
    ];

    const sorted = LiveDataSeederEngine.sortTypesTopologically(rawConfigs, mockSchema);
    const sortedNames = sorted.map(t => t.typeName);

    // Company must precede Project, and Project must precede Task
    expect(sortedNames.indexOf('Company')).toBeLessThan(sortedNames.indexOf('Project'));
    expect(sortedNames.indexOf('Project')).toBeLessThan(sortedNames.indexOf('Task'));
  });

  it('should generate context-aware realistic values based on field rules', () => {
    const emailRule = { fieldName: 'contact_email', fieldType: 'text', generatorType: 'faker_email' as const };
    const emailVal = LiveDataSeederEngine.generateFieldValue(emailRule, 1);
    expect(emailVal).toContain('@');
    expect(emailVal).toContain('user.');

    const phoneRule = { fieldName: 'phone_number', fieldType: 'text', generatorType: 'faker_phone' as const };
    const phoneVal = LiveDataSeederEngine.generateFieldValue(phoneRule, 2);
    expect(phoneVal).toMatch(/^\+1 \(\d{3}\) \d{3}-\d{4}$/);

    const numRule = { fieldName: 'price', fieldType: 'number', generatorType: 'faker_number' as const, minValue: 10, maxValue: 50 };
    const numVal = LiveDataSeederEngine.generateFieldValue(numRule, 3);
    expect(numVal).toBeGreaterThanOrEqual(10);
    expect(numVal).toBeLessThanOrEqual(50);
  });

  it('should resolve foreign-key references from previously created record IDs', () => {
    const relationRule = {
      fieldName: 'company',
      fieldType: 'custom.Company',
      generatorType: 'relation_lookup' as const,
      relationTargetType: 'Company'
    };

    const createdRecordIds = {
      Company: ['comp_id_001', 'comp_id_002']
    };

    const resolved = LiveDataSeederEngine.generateFieldValue(relationRule, 0, createdRecordIds);
    expect(resolved).toBe('comp_id_001');

    const resolvedSecond = LiveDataSeederEngine.generateFieldValue(relationRule, 1, createdRecordIds);
    expect(resolvedSecond).toBe('comp_id_002');
  });

  it('should execute seeder job and perform rollback cleanly via mock HTTP client', async () => {
    const mockHttp = vi.fn().mockImplementation(async (url: string, method: string, headers: any, body: any) => {
      if (method === 'POST') {
        const id = `rec_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        return { ok: true, status: 201, data: { status: 'success', id } };
      }
      return { ok: true, status: 200, data: { status: 'success' } };
    });

    const job: LiveSeederJob = {
      targetEnvironment: 'version-test',
      apiToken: 'test_token',
      types: [
        {
          typeName: 'Company',
          rowCount: 2,
          enabled: true,
          fieldRules: {
            name: { fieldName: 'name', fieldType: 'text', generatorType: 'faker_name' }
          }
        },
        {
          typeName: 'Project',
          rowCount: 2,
          enabled: true,
          fieldRules: {
            title: { fieldName: 'title', fieldType: 'text', generatorType: 'faker_name' },
            company: { fieldName: 'company', fieldType: 'custom.Company', generatorType: 'relation_lookup', relationTargetType: 'Company' }
          }
        }
      ],
      status: 'idle',
      progressCurrent: 0,
      progressTotal: 0,
      createdRecordIds: {},
      logs: []
    };

    const completedJob = await LiveDataSeederEngine.executeSeederJob(
      job,
      mockSchema,
      'https://app.bubbleapps.io/version-test',
      undefined,
      undefined,
      mockHttp
    );

    expect(completedJob.status).toBe('completed');
    expect(completedJob.progressCurrent).toBe(4);
    expect(completedJob.createdRecordIds['Company'].length).toBe(2);
    expect(completedJob.createdRecordIds['Project'].length).toBe(2);
    expect(mockHttp).toHaveBeenCalledTimes(4);

    // Rollback test
    const rollbackSuccess = await LiveDataSeederEngine.rollbackJob(
      completedJob,
      'https://app.bubbleapps.io/version-test',
      undefined,
      undefined,
      mockHttp
    );

    expect(rollbackSuccess).toBe(true);
    expect(Object.keys(completedJob.createdRecordIds).length).toBe(0);
    // 4 POSTs + 4 DELETEs = 8 calls
    expect(mockHttp).toHaveBeenCalledTimes(8);
  });
});
