export type ImpactRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type ImpactRiskAxis = 'processes' | 'modules';

export type UnusedImpactRiskReason =
  | 'file-nodes-have-no-process-or-community-membership'
  | 'enrichment-skipped'
  | 'enrichment-budget-exhausted'
  | 'enrichment-truncated'
  | 'enrichment-query-failed';

export interface UnusedImpactRiskAxis {
  axis: ImpactRiskAxis;
  reason: UnusedImpactRiskReason;
}

export interface ImpactRiskInput {
  direction: 'upstream' | 'downstream';
  directCount: number;
  processCount: number;
  moduleCount: number;
  impactedCount: number;
  unusedAxes?: readonly UnusedImpactRiskAxis[];
}

export interface ImpactRiskResult {
  risk: ImpactRisk;
  riskSharedAxes: ImpactRisk;
  /** Thresholds that produced the primary risk label. Empty for LOW/UNKNOWN. */
  riskDrivers: readonly ImpactRiskDriver[];
  riskScale: {
    comparableAcrossKinds: boolean;
    unusedAxes: readonly UnusedImpactRiskAxis[];
  };
}

export interface ImpactRiskDriver {
  axis: 'direct' | 'processes' | 'modules' | 'impacted';
  observed: number;
  threshold: number;
}

const RISK_THRESHOLDS = {
  CRITICAL: { direct: 30, processes: 5, modules: 5, impacted: 200 },
  HIGH: { direct: 15, processes: 3, modules: 3, impacted: 100 },
  MEDIUM: { direct: 5, impacted: 30 },
} as const;

function driversAtLevel(
  input: Pick<ImpactRiskInput, 'directCount' | 'processCount' | 'moduleCount' | 'impactedCount'>,
  level: 'CRITICAL' | 'HIGH' | 'MEDIUM',
): ImpactRiskDriver[] {
  const observed = {
    direct: input.directCount,
    processes: input.processCount,
    modules: input.moduleCount,
    impacted: input.impactedCount,
  };
  return Object.entries(RISK_THRESHOLDS[level])
    .filter(([axis, threshold]) => observed[axis as keyof typeof observed] >= threshold)
    .map(([axis, threshold]) => ({
      axis: axis as ImpactRiskDriver['axis'],
      observed: observed[axis as keyof typeof observed],
      threshold,
    }));
}

function score(
  input: Pick<
    ImpactRiskInput,
    'direction' | 'directCount' | 'processCount' | 'moduleCount' | 'impactedCount'
  >,
): ImpactRisk {
  const { direction, impactedCount } = input;

  if (direction === 'upstream' && impactedCount === 0) return 'UNKNOWN';
  if (driversAtLevel(input, 'CRITICAL').length > 0) {
    return 'CRITICAL';
  }
  if (driversAtLevel(input, 'HIGH').length > 0) {
    return 'HIGH';
  }
  if (driversAtLevel(input, 'MEDIUM').length > 0) return 'MEDIUM';
  return 'LOW';
}

const UNMEASURED_REASONS: ReadonlySet<UnusedImpactRiskReason> = new Set([
  'file-nodes-have-no-process-or-community-membership',
  'enrichment-skipped',
  'enrichment-budget-exhausted',
]);

function unusedPair(reason: UnusedImpactRiskReason): UnusedImpactRiskAxis[] {
  return [
    { axis: 'processes', reason },
    { axis: 'modules', reason },
  ];
}

function countsWithUnmeasuredAxesZeroed(
  input: ImpactRiskInput,
): Pick<
  ImpactRiskInput,
  'direction' | 'directCount' | 'processCount' | 'moduleCount' | 'impactedCount'
> {
  let processCount = input.processCount;
  let moduleCount = input.moduleCount;
  for (const unused of input.unusedAxes ?? []) {
    if (!UNMEASURED_REASONS.has(unused.reason)) continue;
    if (unused.axis === 'processes') processCount = 0;
    if (unused.axis === 'modules') moduleCount = 0;
  }
  return {
    direction: input.direction,
    directCount: input.directCount,
    processCount,
    moduleCount,
    impactedCount: input.impactedCount,
  };
}

/** Map walk outcomes to unused process/module axes so comparability matches what was sampled. */
export function unusedAxesForImpactWalk(input: {
  isFileTarget: boolean;
  skipEnrichment: boolean;
  maxChunks: number;
  processQueryFailed: boolean;
  moduleQueryFailed: boolean;
  /** When 0, a zero chunk budget is not an unused-axis event — there was nothing to enrich. */
  impactedCount: number;
  /** True when process/module queries ran on a strict subset of impacted symbols. */
  enrichmentTruncated?: boolean;
}): UnusedImpactRiskAxis[] {
  if (input.isFileTarget) {
    return unusedPair('file-nodes-have-no-process-or-community-membership');
  }
  if (input.skipEnrichment) {
    return unusedPair('enrichment-skipped');
  }
  if (input.maxChunks === 0 && input.impactedCount > 0) {
    return unusedPair('enrichment-budget-exhausted');
  }
  const unused: UnusedImpactRiskAxis[] = [];
  if (input.enrichmentTruncated) {
    unused.push(...unusedPair('enrichment-truncated'));
  }
  if (input.processQueryFailed) {
    unused.push({ axis: 'processes', reason: 'enrichment-query-failed' });
  }
  if (input.moduleQueryFailed) {
    unused.push({ axis: 'modules', reason: 'enrichment-query-failed' });
  }
  return unused;
}

const INCOMPLETE_SAMPLE_REASONS: ReadonlySet<UnusedImpactRiskReason> = new Set([
  'enrichment-query-failed',
  'enrichment-truncated',
]);

export function scoreImpactRisk(input: ImpactRiskInput): ImpactRiskResult {
  const unusedAxes = input.unusedAxes ?? [];
  const measuredCounts = countsWithUnmeasuredAxesZeroed(input);
  const observedRisk = score(measuredCounts);
  const incompleteSample = unusedAxes.some((unused) =>
    INCOMPLETE_SAMPLE_REASONS.has(unused.reason),
  );
  // Failed queries and truncated samples make observed process/module counts
  // lower bounds. Preserve any HIGH/CRITICAL warning already proved by those
  // counts, but never emit a confident LOW/MEDIUM edit gate from an incomplete
  // enrichment pass.
  const risk =
    incompleteSample && (observedRisk === 'LOW' || observedRisk === 'MEDIUM')
      ? 'UNKNOWN'
      : observedRisk;

  return {
    risk,
    riskSharedAxes: score({ ...input, processCount: 0, moduleCount: 0 }),
    riskDrivers:
      risk === 'CRITICAL' || risk === 'HIGH' || risk === 'MEDIUM'
        ? driversAtLevel(measuredCounts, risk)
        : [],
    riskScale: {
      comparableAcrossKinds: unusedAxes.length === 0,
      unusedAxes,
    },
  };
}
