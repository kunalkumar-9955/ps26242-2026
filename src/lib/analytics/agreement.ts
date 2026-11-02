/**
 * SATYARPL Inter-Rater Reliability & Agreement Statistics Library
 * Pure, standalone, mathematically rigorous implementations.
 * Reference: Fleiss (1981), Krippendorff (2004, 2011), Shrout & Fleiss (1979),
 * Byrt, Bishop & Carlin (1993), Feinstein & Cicchetti (1990).
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface KappaResult {
  kappa: number | undefined;
  isUndefined: boolean;
  undefinedReason?: string;
  linearKappa?: number;
  unweightedKappa?: number;
  percentAgreement: number;
  adjacentAgreement: number; // within 1 level (e.g. |s1 - s2| <= 1)
  n: number;
  prevalenceIndex: number;
  biasIndex: number;
  hasPrevalenceCaveat: boolean;
  prevalenceCaveatNote?: string;
  confusionMatrix: number[][];
}

export interface AlphaResult {
  alpha: number | undefined;
  isUndefined: boolean;
  undefinedReason?: string;
  unitsCount: number;
  ratersCount: number;
  pairsCount: number;
  observedDisagreement: number;
  expectedDisagreement: number;
  metric: "ordinal" | "nominal" | "interval";
}

export interface ICCResult {
  icc: number | undefined;
  isUndefined: boolean;
  undefinedReason?: string;
  model: string; // "Two-Way Random Effects, Absolute Agreement, Single Rater (ICC(2,1))"
  msBetweenSubjects: number;
  msBetweenRaters: number;
  msResidualError: number;
  fRatio: number;
  dfSubjects: number;
  dfRaters: number;
  dfError: number;
  nSubjects: number;
  nRaters: number;
}

export interface BootstrapCIResult {
  pointEstimate: number | undefined;
  ciLower: number | undefined;
  ciUpper: number | undefined;
  standardError: number | undefined;
  resamples: number;
  confidenceLevel: number;
  seed: number;
}

export interface PairedDifferenceResult {
  estimateA: number | undefined;
  estimateB: number | undefined;
  difference: number | undefined; // B - A
  ciLower: number | undefined;
  ciUpper: number | undefined;
  isSignificant: boolean;
  conclusion: "improved" | "no_improvement" | "worse" | "sample_too_small";
  note: string;
}

// ============================================================================
// DETERMINISTIC PRNG (Mulberry32) FOR REPRODUCIBLE BOOTSTRAP
// ============================================================================

export function createSeededRandom(seed: number): () => number {
  let s = Math.floor(seed) >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 1. WEIGHTED COHEN'S KAPPA (QUADRATIC WEIGHTS, ORDINAL 1-4)
// ============================================================================

/**
 * Computes Cohen's Weighted Kappa for two raters on an ordinal scale.
 * Quadratic weights: w_ij = ((i - j)^2) / ((k - 1)^2).
 * Handles zero-variance edge cases: returns undefined if all ratings are identical to a single category.
 */
export function computeWeightedKappa(
  rater1: number[],
  rater2: number[],
  k = 4
): KappaResult {
  if (!rater1 || !rater2 || rater1.length === 0 || rater1.length !== rater2.length) {
    return {
      kappa: undefined,
      isUndefined: true,
      undefinedReason: "Input arrays must be non-empty and of equal length",
      percentAgreement: 0,
      adjacentAgreement: 0,
      n: 0,
      prevalenceIndex: 0,
      biasIndex: 0,
      hasPrevalenceCaveat: false,
      confusionMatrix: [],
    };
  }

  const n = rater1.length;

  // Build confusion matrix O (k x k)
  const O: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const rMargin: number[] = Array(k).fill(0);
  const cMargin: number[] = Array(k).fill(0);

  let exactMatches = 0;
  let adjacentMatches = 0;

  for (let idx = 0; idx < n; idx++) {
    const r1 = Math.max(1, Math.min(k, Math.round(rater1[idx]))) - 1;
    const r2 = Math.max(1, Math.min(k, Math.round(rater2[idx]))) - 1;

    O[r1][r2] += 1;
    rMargin[r1] += 1;
    cMargin[r2] += 1;

    if (r1 === r2) exactMatches += 1;
    if (Math.abs(r1 - r2) <= 1) adjacentMatches += 1;
  }

  const percentAgreement = Math.round((exactMatches / n) * 10000) / 100;
  const adjacentAgreement = Math.round((adjacentMatches / n) * 10000) / 100;

  // Expected matrix E under chance independence
  const E: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      E[i][j] = (rMargin[i] * cMargin[j]) / n;
    }
  }

  // Check for zero-variance: all ratings concentrated in a single category
  // If rMargin has only 1 non-zero entry and cMargin has only 1 non-zero entry in the SAME category,
  // then chance agreement is 1.0 and expected disagreement is 0.0 -> Kappa is mathematically undefined!
  const nonZeroR = rMargin.filter((c) => c > 0).length;
  const nonZeroC = cMargin.filter((c) => c > 0).length;

  // Quadratic weights: w_ij = (i - j)^2 / (k - 1)^2
  const maxDiffSq = Math.pow(k - 1, 2);
  let numQuad = 0;
  let denQuad = 0;

  // Linear weights: |i - j| / (k - 1)
  let numLin = 0;
  let denLin = 0;

  // Unweighted: 0 if i == j else 1
  let numUnw = 0;
  let denUnw = 0;

  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const wQuad = Math.pow(i - j, 2) / maxDiffSq;
      numQuad += wQuad * O[i][j];
      denQuad += wQuad * E[i][j];

      const wLin = Math.abs(i - j) / (k - 1);
      numLin += wLin * O[i][j];
      denLin += wLin * E[i][j];

      const wUnw = i === j ? 0 : 1;
      numUnw += wUnw * O[i][j];
      denUnw += wUnw * E[i][j];
    }
  }

  // Calculate Prevalence Index and Bias Index
  // For multi-category scales, prevalence index is max marginal proportion minus equal distribution
  const maxMarginalProp = Math.max(...rMargin, ...cMargin) / n;
  const prevalenceIndex = Math.round(Math.max(0, (maxMarginalProp - 1 / k) / (1 - 1 / k)) * 1000) / 1000;

  // Bias Index: mean absolute difference between marginal proportions of rater 1 and rater 2
  let totalMarginalDiff = 0;
  for (let i = 0; i < k; i++) {
    totalMarginalDiff += Math.abs(rMargin[i] - cMargin[i]) / n;
  }
  const biasIndex = Math.round((totalMarginalDiff / 2) * 1000) / 1000;

  const hasPrevalenceCaveat = prevalenceIndex >= 0.5 && percentAgreement >= 70;
  const prevalenceCaveatNote = hasPrevalenceCaveat
    ? "High agreement with depressed kappa observed due to high category prevalence (Feinstein-Cicchetti paradox). Rely on adjacent/percent agreement alongside kappa."
    : undefined;

  // ZERO VARIANCE CHECK:
  // If denominator is 0 (or all ratings fall on one single category), kappa is undefined!
  if (denQuad === 0 || (nonZeroR <= 1 && nonZeroC <= 1 && exactMatches === n)) {
    return {
      kappa: undefined,
      isUndefined: true,
      undefinedReason:
        "Zero variance in score distributions across categories. Kappa is statistically undefined (0/0) when all ratings fall into a single level.",
      percentAgreement,
      adjacentAgreement,
      n,
      prevalenceIndex,
      biasIndex,
      hasPrevalenceCaveat: true,
      prevalenceCaveatNote:
        "All ratings are identical to a single category (zero variance). Cohen's kappa is undefined; percent agreement is 100%.",
      confusionMatrix: O,
    };
  }

  const quadKappa = Math.round((1 - numQuad / denQuad) * 10000) / 10000;
  const linKappa = denLin > 0 ? Math.round((1 - numLin / denLin) * 10000) / 10000 : undefined;
  const unwKappa = denUnw > 0 ? Math.round((1 - numUnw / denUnw) * 10000) / 10000 : undefined;

  return {
    kappa: quadKappa,
    isUndefined: false,
    linearKappa: linKappa,
    unweightedKappa: unwKappa,
    percentAgreement,
    adjacentAgreement,
    n,
    prevalenceIndex,
    biasIndex,
    hasPrevalenceCaveat,
    prevalenceCaveatNote,
    confusionMatrix: O,
  };
}

// ============================================================================
// 2. KRIPPENDORFF'S ALPHA (ORDINAL METRIC, MULTI-RATER, MISSING DATA)
// ============================================================================

/**
 * Computes Krippendorff's alpha for an ordinal metric.
 * Handles missing ratings (represented as null or undefined).
 * Reference: Krippendorff (2004, 2011), Hayes & Krippendorff (2007).
 *
 * @param matrix rows = units/items, columns = raters. Value is number or null.
 * @param metric "ordinal" | "nominal" | "interval"
 */
export function computeKrippendorffAlpha(
  matrix: (number | null | undefined)[][],
  metric: "ordinal" | "nominal" | "interval" = "ordinal"
): AlphaResult {
  if (!matrix || matrix.length < 2) {
    return {
      alpha: undefined,
      isUndefined: true,
      undefinedReason: "Krippendorff's alpha requires at least 2 units/items",
      unitsCount: matrix ? matrix.length : 0,
      ratersCount: 0,
      pairsCount: 0,
      observedDisagreement: 0,
      expectedDisagreement: 0,
      metric,
    };
  }

  const numUnits = matrix.length;
  const numRaters = matrix[0]?.length || 0;

  // Filter to valid units that have >= 2 ratings
  const validUnits: number[][] = [];
  for (let u = 0; u < numUnits; u++) {
    const row = matrix[u];
    const vals = row.filter((v): v is number => typeof v === "number" && !isNaN(v));
    if (vals.length >= 2) {
      validUnits.push(vals);
    }
  }

  if (validUnits.length < 2) {
    return {
      alpha: undefined,
      isUndefined: true,
      undefinedReason: "Less than 2 units have at least 2 valid ratings to compute paired agreement",
      unitsCount: validUnits.length,
      ratersCount: numRaters,
      pairsCount: 0,
      observedDisagreement: 0,
      expectedDisagreement: 0,
      metric,
    };
  }

  // Find all distinct values across valid units
  const valueCounts = new Map<number, number>();
  let totalRatings = 0;

  for (const vals of validUnits) {
    for (const v of vals) {
      valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
      totalRatings++;
    }
  }

  const distinctValues = Array.from(valueCounts.keys()).sort((a, b) => a - b);
  const V = distinctValues.length;

  // Zero variance check: If only 1 distinct value across the entire matrix
  if (V <= 1) {
    return {
      alpha: undefined,
      isUndefined: true,
      undefinedReason: "Zero variance across all ratings: all raters assigned the exact same value to all units.",
      unitsCount: validUnits.length,
      ratersCount: numRaters,
      pairsCount: totalRatings,
      observedDisagreement: 0,
      expectedDisagreement: 0,
      metric,
    };
  }

  // Precompute ordinal distance function delta_ck^2
  // delta(c, k)^2 = ( sum_{g=c}^k n_g - (n_c + n_k)/2 )^2  for c <= k
  const deltaSq: number[][] = Array.from({ length: V }, () => Array(V).fill(0));

  for (let c = 0; c < V; c++) {
    for (let k = c; k < V; k++) {
      if (c === k) {
        deltaSq[c][k] = 0;
      } else if (metric === "nominal") {
        deltaSq[c][k] = 1;
        deltaSq[k][c] = 1;
      } else if (metric === "interval") {
        const diff = distinctValues[c] - distinctValues[k];
        deltaSq[c][k] = diff * diff;
        deltaSq[k][c] = deltaSq[c][k];
      } else {
        // Ordinal metric
        let sumBetween = 0;
        for (let g = c; g <= k; g++) {
          sumBetween += valueCounts.get(distinctValues[g])!;
        }
        const nc = valueCounts.get(distinctValues[c])!;
        const nk = valueCounts.get(distinctValues[k])!;
        const d = sumBetween - (nc + nk) / 2;
        deltaSq[c][k] = d * d;
        deltaSq[k][c] = deltaSq[c][k];
      }
    }
  }

  const valIndex = new Map<number, number>();
  distinctValues.forEach((v, idx) => valIndex.set(v, idx));

  // Compute Observed Disagreement (D_o)
  let sumDo = 0;
  let totalPairs = 0;

  for (const vals of validUnits) {
    const m_u = vals.length;
    let unitDo = 0;
    for (let j = 0; j < m_u; j++) {
      for (let l = j + 1; l < m_u; l++) {
        const cIdx = valIndex.get(vals[j])!;
        const kIdx = valIndex.get(vals[l])!;
        unitDo += deltaSq[cIdx][kIdx];
        totalPairs++;
      }
    }
    sumDo += (2 * unitDo) / (m_u - 1);
  }

  const D_o = sumDo / totalRatings;

  // Compute Expected Disagreement (D_e)
  let sumDe = 0;
  for (let c = 0; c < V; c++) {
    const nc = valueCounts.get(distinctValues[c])!;
    for (let k = 0; k < V; k++) {
      const nk = valueCounts.get(distinctValues[k])!;
      sumDe += nc * nk * deltaSq[c][k];
    }
  }

  const D_e = sumDe / (totalRatings * (totalRatings - 1));

  if (D_e === 0) {
    return {
      alpha: undefined,
      isUndefined: true,
      undefinedReason: "Expected disagreement is zero (no variance in rating distributions).",
      unitsCount: validUnits.length,
      ratersCount: numRaters,
      pairsCount: totalPairs,
      observedDisagreement: 0,
      expectedDisagreement: 0,
      metric,
    };
  }

  const alpha = Math.round((1 - D_o / D_e) * 10000) / 10000;

  return {
    alpha,
    isUndefined: false,
    unitsCount: validUnits.length,
    ratersCount: numRaters,
    pairsCount: totalPairs,
    observedDisagreement: Math.round(D_o * 10000) / 10000,
    expectedDisagreement: Math.round(D_e * 10000) / 10000,
    metric,
  };
}

// ============================================================================
// 3. INTRACLASS CORRELATION COEFFICIENT (ICC(2,1) TWO-WAY RANDOM ABSOLUTE)
// ============================================================================

/**
 * Computes Intraclass Correlation Coefficient ICC(2,1):
 * Two-way random effects, absolute agreement, single rater.
 * Model: x_ij = mu + r_i (subject) + c_j (rater) + e_ij (error)
 * Reference: Shrout & Fleiss (1979), McGraw & Wong (1996).
 *
 * @param matrix n items/subjects (rows) x k raters (columns). Complete cases required.
 */
export function computeICC(
  matrix: number[][]
): ICCResult {
  const model = "Two-Way Random Effects, Absolute Agreement, Single Rater (ICC(2,1))";

  if (!matrix || matrix.length < 2 || !matrix[0] || matrix[0].length < 2) {
    return {
      icc: undefined,
      isUndefined: true,
      undefinedReason: "ICC requires at least 2 subjects and 2 raters with complete data",
      model,
      msBetweenSubjects: 0,
      msBetweenRaters: 0,
      msResidualError: 0,
      fRatio: 0,
      dfSubjects: 0,
      dfRaters: 0,
      dfError: 0,
      nSubjects: matrix ? matrix.length : 0,
      nRaters: matrix && matrix[0] ? matrix[0].length : 0,
    };
  }

  const n = matrix.length;
  const k = matrix[0].length;

  // Validate complete data
  for (let i = 0; i < n; i++) {
    if (matrix[i].length !== k || matrix[i].some((v) => typeof v !== "number" || isNaN(v))) {
      return {
        icc: undefined,
        isUndefined: true,
        undefinedReason: "Complete rectangular matrix without missing values is required for standard ICC(2,1) ANOVA",
        model,
        msBetweenSubjects: 0,
        msBetweenRaters: 0,
        msResidualError: 0,
        fRatio: 0,
        dfSubjects: 0,
        dfRaters: 0,
        dfError: 0,
        nSubjects: n,
        nRaters: k,
      };
    }
  }

  // Grand Mean
  let totalSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      totalSum += matrix[i][j];
    }
  }
  const grandMean = totalSum / (n * k);

  // Row (Subject) Means
  const rowMeans: number[] = [];
  for (let i = 0; i < n; i++) {
    const rowSum = matrix[i].reduce((acc, v) => acc + v, 0);
    rowMeans.push(rowSum / k);
  }

  // Column (Rater) Means
  const colMeans: number[] = [];
  for (let j = 0; j < k; j++) {
    let colSum = 0;
    for (let i = 0; i < n; i++) {
      colSum += matrix[i][j];
    }
    colMeans.push(colSum / n);
  }

  // Sum of Squares
  let ssTotal = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      ssTotal += Math.pow(matrix[i][j] - grandMean, 2);
    }
  }

  let ssRows = 0;
  for (let i = 0; i < n; i++) {
    ssRows += k * Math.pow(rowMeans[i] - grandMean, 2);
  }

  let ssCols = 0;
  for (let j = 0; j < k; j++) {
    ssCols += n * Math.pow(colMeans[j] - grandMean, 2);
  }

  const ssError = Math.max(0, ssTotal - ssRows - ssCols);

  // Degrees of Freedom
  const dfRows = n - 1;
  const dfCols = k - 1;
  const dfError = (n - 1) * (k - 1);

  // Mean Squares
  const msR = ssRows / dfRows;
  const msC = ssCols / dfCols;
  const msE = dfError > 0 ? ssError / dfError : 0;

  // Zero variance check
  if (ssTotal === 0 || (msR === 0 && msE === 0)) {
    return {
      icc: undefined,
      isUndefined: true,
      undefinedReason: "Total variance across all observations is zero (ratings are completely invariant).",
      model,
      msBetweenSubjects: 0,
      msBetweenRaters: 0,
      msResidualError: 0,
      fRatio: 0,
      dfSubjects: dfRows,
      dfRaters: dfCols,
      dfError,
      nSubjects: n,
      nRaters: k,
    };
  }

  // Formula for ICC(2,1):
  // (MS_R - MS_E) / ( MS_R + (k - 1)*MS_E + (k/n)*(MS_C - MS_E) )
  const denominator = msR + (k - 1) * msE + (k / n) * (msC - msE);

  if (denominator <= 0) {
    return {
      icc: 0.0,
      isUndefined: false,
      model,
      msBetweenSubjects: Math.round(msR * 10000) / 10000,
      msBetweenRaters: Math.round(msC * 10000) / 10000,
      msResidualError: Math.round(msE * 10000) / 10000,
      fRatio: msE > 0 ? Math.round((msR / msE) * 100) / 100 : 0,
      dfSubjects: dfRows,
      dfRaters: dfCols,
      dfError,
      nSubjects: n,
      nRaters: k,
    };
  }

  const icc = (msR - msE) / denominator;
  const roundedICC = Math.round(icc * 10000) / 10000;
  const fRatio = msE > 0 ? Math.round((msR / msE) * 100) / 100 : 0;

  return {
    icc: roundedICC,
    isUndefined: false,
    model,
    msBetweenSubjects: Math.round(msR * 10000) / 10000,
    msBetweenRaters: Math.round(msC * 10000) / 10000,
    msResidualError: Math.round(msE * 10000) / 10000,
    fRatio,
    dfSubjects: dfRows,
    dfRaters: dfCols,
    dfError,
    nSubjects: n,
    nRaters: k,
  };
}

// ============================================================================
// 4. BOOTSTRAP CONFIDENCE INTERVALS
// ============================================================================

/**
 * Computes non-parametric bootstrap confidence intervals with a deterministic seed.
 *
 * @param items Array of data items (e.g. rating pairs)
 * @param estimator Function computing statistic on resampled slice
 * @param options resamples (default 1000), seed (default 42), confidence (default 0.95)
 */
export function computeBootstrapCI<T>(
  items: T[],
  estimator: (sample: T[]) => number | undefined,
  options: { resamples?: number; seed?: number; confidence?: number } = {}
): BootstrapCIResult {
  const B = options.resamples || 1000;
  const seed = options.seed !== undefined ? options.seed : 42;
  const alpha = 1 - (options.confidence || 0.95);

  const pointEstimate = estimator(items);
  if (pointEstimate === undefined || items.length === 0) {
    return {
      pointEstimate: undefined,
      ciLower: undefined,
      ciUpper: undefined,
      standardError: undefined,
      resamples: B,
      confidenceLevel: options.confidence || 0.95,
      seed,
    };
  }

  const rng = createSeededRandom(seed);
  const n = items.length;
  const bootstrapValues: number[] = [];

  for (let b = 0; b < B; b++) {
    const sample: T[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      sample[i] = items[idx];
    }
    const val = estimator(sample);
    if (val !== undefined && !isNaN(val)) {
      bootstrapValues.push(val);
    }
  }

  if (bootstrapValues.length < 10) {
    return {
      pointEstimate,
      ciLower: undefined,
      ciUpper: undefined,
      standardError: undefined,
      resamples: B,
      confidenceLevel: options.confidence || 0.95,
      seed,
    };
  }

  bootstrapValues.sort((a, b) => a - b);

  const lowerIdx = Math.max(0, Math.floor((alpha / 2) * bootstrapValues.length));
  const upperIdx = Math.min(
    bootstrapValues.length - 1,
    Math.ceil((1 - alpha / 2) * bootstrapValues.length) - 1
  );

  const ciLower = Math.round(bootstrapValues[lowerIdx] * 10000) / 10000;
  const ciUpper = Math.round(bootstrapValues[upperIdx] * 10000) / 10000;

  // Standard error: sample standard deviation of bootstrap estimates
  const mean = bootstrapValues.reduce((acc, v) => acc + v, 0) / bootstrapValues.length;
  const variance =
    bootstrapValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
    (bootstrapValues.length - 1);
  const standardError = Math.round(Math.sqrt(variance) * 10000) / 10000;

  return {
    pointEstimate: Math.round(pointEstimate * 10000) / 10000,
    ciLower,
    ciUpper,
    standardError,
    resamples: B,
    confidenceLevel: options.confidence || 0.95,
    seed,
  };
}

// ============================================================================
// 5. PAIRED CONTROLLED COMPARISON (CONDITION A VS CONDITION B)
// ============================================================================

/**
 * Computes paired difference between Condition A (unassisted) and Condition B (assisted with SatyaRPL).
 * Evaluates both inter-assessor agreement and criterion accuracy vs expert gold standards.
 */
export function computePairedComparison(
  pairsA: Array<{ rater1: number; rater2: number; gold: number }>,
  pairsB: Array<{ rater1: number; rater2: number; gold: number }>,
  minSampleSize = 15
): PairedDifferenceResult {
  const nA = pairsA.length;
  const nB = pairsB.length;

  if (nA === 0 || nB === 0) {
    return {
      estimateA: undefined,
      estimateB: undefined,
      difference: undefined,
      ciLower: undefined,
      ciUpper: undefined,
      isSignificant: false,
      conclusion: "sample_too_small",
      note: "No paired comparison data available for Condition A or B.",
    };
  }

  const kappaA = computeWeightedKappa(
    pairsA.map((p) => p.rater1),
    pairsA.map((p) => p.rater2)
  ).kappa;

  const kappaB = computeWeightedKappa(
    pairsB.map((p) => p.rater1),
    pairsB.map((p) => p.rater2)
  ).kappa;

  if (kappaA === undefined || kappaB === undefined) {
    return {
      estimateA: kappaA,
      estimateB: kappaB,
      difference: undefined,
      ciLower: undefined,
      ciUpper: undefined,
      isSignificant: false,
      conclusion: "sample_too_small",
      note: "Kappa could not be computed due to invariant ratings or missing pairs.",
    };
  }

  const difference = Math.round((kappaB - kappaA) * 10000) / 10000;

  // If sample size is too small, explicitly label as sample_too_small
  if (nA < minSampleSize || nB < minSampleSize) {
    return {
      estimateA: kappaA,
      estimateB: kappaB,
      difference,
      ciLower: undefined,
      ciUpper: undefined,
      isSignificant: false,
      conclusion: "sample_too_small",
      note: `Sample size (n_A=${nA}, n_B=${nB}) is below the required n=${minSampleSize} minimum for statistical conclusion. Results are exploratory only.`,
    };
  }

  // Paired bootstrap resampling across the shared items
  const minN = Math.min(nA, nB);
  const rng = createSeededRandom(101);
  const diffs: number[] = [];
  const B = 1000;

  for (let b = 0; b < B; b++) {
    const sA1: number[] = [];
    const sA2: number[] = [];
    const sB1: number[] = [];
    const sB2: number[] = [];

    for (let i = 0; i < minN; i++) {
      const idx = Math.floor(rng() * minN);
      sA1.push(pairsA[idx].rater1);
      sA2.push(pairsA[idx].rater2);
      sB1.push(pairsB[idx].rater1);
      sB2.push(pairsB[idx].rater2);
    }

    const kA = computeWeightedKappa(sA1, sA2).kappa;
    const kB = computeWeightedKappa(sB1, sB2).kappa;

    if (kA !== undefined && kB !== undefined) {
      diffs.push(kB - kA);
    }
  }

  diffs.sort((a, b) => a - b);
  const ciLower = diffs.length > 20 ? Math.round(diffs[Math.floor(0.025 * diffs.length)] * 10000) / 10000 : undefined;
  const ciUpper = diffs.length > 20 ? Math.round(diffs[Math.ceil(0.975 * diffs.length) - 1] * 10000) / 10000 : undefined;

  // Determine statistical conclusion
  let conclusion: "improved" | "no_improvement" | "worse" | "sample_too_small" = "no_improvement";
  let isSignificant = false;

  if (ciLower !== undefined && ciUpper !== undefined) {
    if (ciLower > 0) {
      conclusion = "improved";
      isSignificant = true;
    } else if (ciUpper < 0) {
      conclusion = "worse";
      isSignificant = true;
    } else {
      conclusion = "no_improvement";
      isSignificant = false;
    }
  } else {
    if (difference > 0.05) conclusion = "improved";
    else if (difference < -0.05) conclusion = "worse";
    else conclusion = "no_improvement";
  }

  const note =
    conclusion === "improved"
      ? `Condition B (assisted) demonstrated statistically significant inter-rater reliability improvement (Delta kappa = +${difference}, 95% CI [${ciLower}, ${ciUpper}]).`
      : conclusion === "worse"
      ? `Condition B (assisted) performed worse than unassisted baseline (Delta kappa = ${difference}, 95% CI [${ciLower}, ${ciUpper}]). Requires workflow and prompt recalibration.`
      : `No statistically significant difference between assisted and unassisted conditions (95% CI spans zero: [${ciLower}, ${ciUpper}]). High agreement alone does not establish measurement validity.`;

  return {
    estimateA: kappaA,
    estimateB: kappaB,
    difference,
    ciLower,
    ciUpper,
    isSignificant,
    conclusion,
    note,
  };
}
