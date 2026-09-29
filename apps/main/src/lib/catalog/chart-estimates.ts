type ChartEstimates = {
  levelPreciseEstimated?: true;
  addedVersionEstimated?: true;
};

/** The catalog fields a source only estimated for a chart, as recorded in its metadata. Confirmed fields are left out. */
export function chartEstimates(metadata: Record<string, unknown> | null | undefined): ChartEstimates {
  return {
    ...(metadata?.levelPreciseEstimated === true && { levelPreciseEstimated: true }),
    ...(metadata?.addedVersionEstimated === true && { addedVersionEstimated: true }),
  };
}
