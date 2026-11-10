import { describe, expect, it } from 'vitest';
import {
  buildImpactEvidencePath,
  summarizeImpactEvidence,
  type ImpactEvidenceStep,
} from '../../src/mcp/impact-evidence.js';

describe('buildImpactEvidencePath', () => {
  it('reconstructs a path through a hidden owning-file seed', () => {
    const parents = new Map<string, ImpactEvidenceStep>([
      [
        'File:owner.ts',
        {
          fromId: 'Interface:owner.ts:Options',
          toId: 'File:owner.ts',
          relationType: 'DEFINES',
          implicitSeed: true,
        },
      ],
      [
        'File:route.ts',
        {
          fromId: 'File:owner.ts',
          toId: 'File:route.ts',
          relationType: 'IMPORTS',
        },
      ],
    ]);

    expect(buildImpactEvidencePath('Interface:owner.ts:Options', 'File:route.ts', parents)).toEqual([
      parents.get('File:owner.ts'),
      parents.get('File:route.ts'),
    ]);
  });

  it('does not present a broken or cyclic chain as a complete witness', () => {
    const parents = new Map<string, ImpactEvidenceStep>([
      ['B', { fromId: 'C', toId: 'B', relationType: 'CALLS' }],
      ['C', { fromId: 'B', toId: 'C', relationType: 'CALLS' }],
    ]);
    expect(buildImpactEvidencePath('A', 'B', parents)).toEqual([]);
    expect(buildImpactEvidencePath('A', 'D', parents)).toEqual([]);
  });

  it('separates direct import fanout from call evidence', () => {
    expect(
      summarizeImpactEvidence([
        { depth: 1, relationType: 'IMPORTS' },
        { depth: 1, relationType: 'IMPORTS' },
        { depth: 1, relationType: 'CALLS' },
        { depth: 2, relationType: 'CALLS' },
      ]),
    ).toEqual({
      directByRelation: { CALLS: 1, IMPORTS: 2 },
      allByRelation: { CALLS: 2, IMPORTS: 2 },
    });
  });
});
