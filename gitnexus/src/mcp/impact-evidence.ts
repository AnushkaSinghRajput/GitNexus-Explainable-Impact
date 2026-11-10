/** A step in one representative impact traversal path. */
export interface ImpactEvidenceStep {
  fromId: string;
  toId: string;
  relationType: string;
  /** The graph edge points from toId to fromId; upstream walks reverse it. */
  reversed?: true;
  /** Internal expansion, such as entering the target type's owning file. */
  implicitSeed?: true;
}

/** Return a complete target-to-symbol witness, or [] if provenance is broken. */
export function buildImpactEvidencePath(
  targetId: string,
  reachedId: string,
  parents: ReadonlyMap<string, ImpactEvidenceStep>,
): ImpactEvidenceStep[] {
  const path: ImpactEvidenceStep[] = [];
  const seen = new Set<string>();
  let current = reachedId;
  while (current !== targetId) {
    if (seen.has(current)) return [];
    seen.add(current);
    const step = parents.get(current);
    if (!step || step.toId !== current) return [];
    path.push(step);
    current = step.fromId;
  }
  return path.reverse();
}

/** Counts each reached symbol by its selected incoming traversal relation. */
export function summarizeImpactEvidence(
  items: readonly { depth: number; relationType: string }[],
): { directByRelation: Record<string, number>; allByRelation: Record<string, number> } {
  const directByRelation: Record<string, number> = {};
  const allByRelation: Record<string, number> = {};
  for (const { depth, relationType } of items) {
    allByRelation[relationType] = (allByRelation[relationType] ?? 0) + 1;
    if (depth === 1) {
      directByRelation[relationType] = (directByRelation[relationType] ?? 0) + 1;
    }
  }
  const sorted = (counts: Record<string, number>) =>
    Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { directByRelation: sorted(directByRelation), allByRelation: sorted(allByRelation) };
}
