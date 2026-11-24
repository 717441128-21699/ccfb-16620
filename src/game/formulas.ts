import {
  hopById,
  maltById,
  styleById,
  yeastById,
} from '../data/ingredients';
import type {
  BeerScores,
  FermentBatch,
  HopAddition,
  HopBitterness,
  MashResult,
  Recipe,
  SeasonId,
  WortResult,
} from '../types';

export const PINT_L = 0.5;

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const gauss = (x: number, center: number, width: number): number =>
  Math.exp(-((x - center) ** 2) / (2 * width * width));

/** Temperature/half-life integrated beta-amylase work, normalized to roughly 0..1.4 per kg power. */
export function betaEnzymeWork(tempC: number, minutes: number): number {
  const tempFactor = gauss(tempC, 63.8, 2.65);
  // Beta amylase is rapidly denatured above roughly 67 C.
  const halfLifeMin = 95 * Math.exp(-0.58 * Math.max(0, tempC - 65));
  const integrated = halfLifeMin * (1 - Math.exp(-minutes / halfLifeMin));
  return tempFactor * clamp(integrated / 58, 0, 1.25);
}

/** Alpha amylase survives hotter rests and produces dextrins/body. */
export function alphaEnzymeWork(tempC: number, minutes: number): number {
  const tempFactor = gauss(tempC, 69.6, 3.35);
  const timeFactor = 1 - Math.exp(-minutes / 19);
  return tempFactor * timeFactor;
}

export function platoFromExtract(extractKg: number, volumeL: number): number {
  if (volumeL <= 0) return 0;
  return (25900 * extractKg) / (259 * volumeL + 100 * extractKg);
}

export function sgFromPlato(plato: number): number {
  return 259 / (259 - clamp(plato, 0, 100));
}

export function ebcToSrm(ebc: number): number {
  return ebc / 1.97;
}

export function colorEBCForRecipe(recipe: Recipe): number {
  // Morey equation via metric -> Lovibond -> MCU -> SRM -> EBC.
  let mcu = 0;
  const gallons = recipe.volumeL / 3.785411784;
  for (const item of recipe.bill) {
    const malt = maltById(item.maltId);
    const srmMalt = ebcToSrm(malt.colorEBC);
    const degreesLovibond = (srmMalt + 0.76) / 1.3546;
    const pounds = item.kg * 2.20462262;
    mcu += (degreesLovibond * pounds) / gallons;
  }
  const srm = 1.4922 * Math.pow(Math.max(0.01, mcu), 0.6859);
  return srm * 1.97;
}

export function ebcToCss(ebc: number): string {
  const stops: Array<[number, [number, number, number]]> = [
    [2, [248, 226, 126]],
    [6, [244, 199, 67]],
    [12, [224, 151, 35]],
    [25, [184, 91, 20]],
    [50, [116, 49, 14]],
    [90, [61, 25, 9]],
    [160, [29, 12, 6]],
    [260, [12, 6, 4]],
  ];
  if (ebc <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 0; i < stops.length - 1; i++) {
    const [aE, aC] = stops[i];
    const [bE, bC] = stops[i + 1];
    if (ebc <= bE) {
      const t = (ebc - aE) / (bE - aE);
      const c = aC.map((v, idx) => Math.round(lerp(v, bC[idx], t)));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(8,4,3)';
}

export function recipeCost(recipe: Recipe): number {
  let cost = 0;
  for (const item of recipe.bill) {
    cost += item.kg * maltById(item.maltId).costPerKg;
  }
  for (const hop of recipe.hops) {
    cost += (hop.grams / 100) * hopById(hop.hopId).costPer100g;
  }
  cost += yeastById(recipe.yeastId).costPerPack;
  return Math.round(cost * 10) / 10;
}

export function computeMash(recipe: Recipe): MashResult {
  let totalMaltKg = 0;
  let rawExtractKg = 0;
  let weightedDextrin = 0;
  let betaWork = 0;
  let alphaWork = 0;

  for (const item of recipe.bill) {
    const malt = maltById(item.maltId);
    totalMaltKg += item.kg;
    rawExtractKg += item.kg * malt.extract;
    weightedDextrin += item.kg * malt.dextrinBase;
    betaWork += item.kg * malt.betaPower * betaEnzymeWork(recipe.mashTempC, recipe.mashMin);
    alphaWork += item.kg * malt.alphaPower * alphaEnzymeWork(recipe.mashTempC, recipe.mashMin);
  }

  const dextrinWeighted = totalMaltKg > 0 ? weightedDextrin / totalMaltKg : 0.2;
  const enzymeAdequacy = clamp((alphaWork + betaWork * 0.45) / Math.max(1, totalMaltKg * 1.05), 0, 1);
  const conversion = clamp(0.84 + 0.09 * enzymeAdequacy + 0.025 * (1 - Math.exp(-recipe.mashMin / 45)), 0.72, 0.965);
  const extractKg = rawExtractKg * conversion;

  // Beta work makes fermentable maltose; alpha-dominated high rest leaves dextrins.
  const betaRatio = betaWork / (betaWork + 0.58 * alphaWork + 0.18);
  const fermentability = clamp(
    0.598 + 0.214 * betaRatio - 0.52 * (dextrinWeighted - 0.18),
    0.30,
    0.87,
  );

  const plato = platoFromExtract(extractKg, recipe.volumeL);
  const og = sgFromPlato(plato);
  const yeast = yeastById(recipe.yeastId);
  const apparentAttenuation = clamp(fermentability * yeast.attenuation, 0.25, 0.86);
  const fg = 1 + (og - 1) * (1 - apparentAttenuation);
  const abv = clamp((og - fg) * 131.25, 0, 18);
  const ebc = colorEBCForRecipe(recipe);

  let oatFraction = 0;
  for (const item of recipe.bill) {
    if (item.maltId === 'oat') oatFraction += item.kg;
  }
  oatFraction = totalMaltKg > 0 ? oatFraction / totalMaltKg : 0;
  const bodyIndex = clamp(
    0.12 + dextrinWeighted * 1.22 + (1 - fermentability) * 0.55 + oatFraction * 0.24,
    0.05,
    1,
  );

  return {
    totalMaltKg,
    extractKg,
    plato,
    og,
    fermentability,
    apparentAttenuation,
    fg,
    abv,
    ebc,
    srm: ebcToSrm(ebc),
    betaWork,
    alphaWork,
    conversion,
    bodyIndex,
    cost: recipeCost(recipe),
  };
}

/** Exact Tinseth utilization. OG is specific gravity, boilMin in minutes. */
export function tinsethUtilization(og: number, boilMin: number): number {
  const bigness = 1.65 * Math.pow(0.000125, clamp(og - 1, 0.001, 0.2));
  const boil = (1 - Math.exp(-0.04 * boilMin)) / 4.15;
  return clamp(bigness * boil, 0, 0.45);
}

/**
 * Tinseth IBU in imperial units:
 * IBU = alphaDecimal * oz * 7490 * utilization / gallons.
 */
export function tinsethIBU(alphaPercent: number, grams: number, boilMin: number, volumeL: number, og: number): number {
  const utilization = tinsethUtilization(og, boilMin);
  const ounces = grams / 28.349523125;
  const gallons = volumeL / 3.785411784;
  return ((alphaPercent / 100) * ounces * 7490 * utilization) / gallons;
}

export function computeHopBitterness(recipe: Recipe, og: number): HopBitterness[] {
  return recipe.hops.map((addition: HopAddition) => {
    const hop = hopById(addition.hopId);
    const utilization = tinsethUtilization(og, addition.boilMin);
    const ibu = tinsethIBU(hop.alphaAcid, addition.grams, addition.boilMin, recipe.volumeL, og);
    const aromaContribution =
      hop.aroma * (addition.grams / 100) * Math.exp(-addition.boilMin / 16) * (addition.boilMin <= 5 ? 1.35 : 1);
    return {
      hopId: addition.hopId,
      grams: addition.grams,
      boilMin: addition.boilMin,
      utilization,
      ibu,
      aromaContribution,
    };
  });
}

export function computeWort(recipe: Recipe): WortResult {
  const mash = computeMash(recipe);
  const hopDetails = computeHopBitterness(recipe, mash.og);
  const ibu = hopDetails.reduce((sum, h) => sum + h.ibu, 0);
  const aromaIndex = clamp(hopDetails.reduce((sum, h) => sum + h.aromaContribution, 0), 0, 5);
  const style = styleById(recipe.styleId);
  const flavorPreview = clamp(
    58 +
      (1 - Math.abs(mash.bodyIndex - style.body)) * 22 +
      aromaIndex * 5 +
      (recipe.hops.length > 0 ? 5 : 0) +
      mash.fermentability * 8,
    0,
    100,
  );
  return {
    ...mash,
    ibu,
    hopDetails,
    aromaIndex,
    flavorPreview,
  };
}

export function rangeScore(value: number, low: number, high: number): number {
  if (value >= low && value <= high) return 100;
  const width = Math.max(0.001, high - low);
  const distance = value < low ? low - value : value - high;
  return clamp(100 - (distance / (width * 0.75 + (high || 1) * 0.08)) * 18, 18, 100);
}

export interface FlavorScoreInput {
  styleId: string;
  bodyIndex: number;
  aromaIndex: number;
  estersPpm: number;
  fuselPpm: number;
  phenolsPpm: number;
  diacetylPpm: number;
  health: number;
  actualTempC: number;
}

export function scoreFlavor(input: FlavorScoreInput): { score: number; notes: string[] } {
  const style = styleById(input.styleId);
  const notes: string[] = [];
  const esterIndex = input.estersPpm / 28;
  const phenolIndex = input.phenolsPpm / 16;

  const bodyScore = clamp(100 - Math.abs(input.bodyIndex - style.body) * 118, 35, 100);
  const esterScore = clamp(100 - Math.abs(esterIndex - style.ester) * 48, 25, 100);
  const phenolTarget = style.id === 'wheat' ? 1.15 : style.id === 'stout' ? 0.25 : 0.12;
  const phenolScore = clamp(100 - Math.abs(phenolIndex - phenolTarget) * 55, 20, 100);
  const fuselScore = clamp(100 - Math.max(0, input.fuselPpm - 27) * 0.9 - Math.max(0, input.fuselPpm - 65) * 1.4, 12, 100);
  const diacetylScore = clamp(100 - input.diacetylPpm * 22, 20, 100);
  const healthScore = clamp(input.health, 0, 100);
  const aromaScore = clamp(66 + input.aromaIndex * 10, 25, 100);

  const score =
    bodyScore * 0.2 +
    esterScore * 0.18 +
    phenolScore * 0.1 +
    fuselScore * 0.18 +
    diacetylScore * 0.08 +
    healthScore * 0.14 +
    aromaScore * 0.12;

  if (input.fuselPpm > 58) notes.push('发酵温度偏高，杂醇带来刺鼻/溶剂感');
  if (input.estersPpm > 72 && style.ester < 1.2) notes.push('酯类过载，像糖果香水而不是该风格');
  if (input.diacetylPpm > 0.55) notes.push('双乙酰明显，有黄油/奶油味');
  if (input.health < 72) notes.push('酵母受热或酒精抑制，发酵风味不够干净');
  if (Math.abs(input.bodyIndex - style.body) > 0.24) {
    notes.push(input.bodyIndex > style.body ? '酒体比风格预期更厚、残糊精偏多' : '酒体偏薄，糊精支撑不足');
  }
  if (input.aromaIndex > 1.1) notes.push('晚投酒花香气明亮');
  if (notes.length === 0) notes.push('发酵干净，风味与风格平衡');
  return { score: Math.round(clamp(score, 0, 100) * 10) / 10, notes };
}

export function scorePackagedBeer(args: {
  abv: number;
  ibu: number;
  ebc: number;
  flavorInput: FlavorScoreInput;
}): BeerScores {
  const style = styleById(args.flavorInput.styleId);
  const abvScore = Math.round(rangeScore(args.abv, style.minAbv, style.maxAbv) * 10) / 10;
  const ibuScore = Math.round(rangeScore(args.ibu, style.minIbu, style.maxIbu) * 10) / 10;
  const colorScore = Math.round(rangeScore(args.ebc, style.minEbc, style.maxEbc) * 10) / 10;
  const flavor = scoreFlavor(args.flavorInput);
  const total = Math.round((abvScore * 0.2 + ibuScore * 0.2 + colorScore * 0.15 + flavor.score * 0.45) * 10) / 10;
  const medals = total >= 90 ? '金杯' : total >= 82 ? '银奖' : total >= 72 ? '铜奖' : total >= 58 ? '合格' : '待改进';
  return {
    abv: abvScore,
    ibu: ibuScore,
    color: colorScore,
    flavor: flavor.score,
    total,
    medals,
    notes: flavor.notes,
  };
}

export const SEASON_INFO: Record<SeasonId, { name: string; temp: string; preference: string; accent: string }> = {
  spring: { name: '春', temp: '12–22°C', preference: '花香、清爽苦度、淡色艾尔', accent: '#8bd17c' },
  summer: { name: '夏', temp: '24–35°C', preference: '清脆拉格、小麦、低苦高气泡', accent: '#f2c94c' },
  autumn: { name: '秋', temp: '10–22°C', preference: '麦芽甜香、琥珀色、IPA', accent: '#d9822b' },
  winter: { name: '冬', temp: '-5–10°C', preference: '高酒精度、深色、烘焙香浓', accent: '#8ab4f8' },
};

export function seasonForDay(day: number): SeasonId {
  const seasons: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];
  return seasons[Math.floor((Math.max(1, day) - 1) / 9) % 4];
}

export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** One deterministic worker-side day for one batch; exported for tests/fallback. */
export function stepFermentBatchDay(batch: FermentBatch, setpointC?: number): FermentBatch {
  const next: FermentBatch = {
    ...batch,
    history: batch.history.slice(-29),
  };
  if (typeof setpointC === 'number') next.targetTempC = setpointC;
  const yeast = yeastById(next.yeastId);
  const hours = 24;
  const dt = 1;

  for (let h = 0; h < hours; h++) {
    // Thermal lag toward tank setpoint.
    next.actualTempC += (next.targetTempC - next.actualTempC) * (1 - Math.exp(-dt / 4.2));
    const t = next.actualTempC;
    const optimum = (yeast.optLowC + yeast.optHighC) / 2;
    const q10 = Math.pow(2.05, (t - optimum) / 10);
    const coldPenalty = t < yeast.optLowC ? Math.exp(-(yeast.optLowC - t) * 0.18) : 1;
    const heatExcess = Math.max(0, t - yeast.optHighC);
    const heatMetabolism = 1 + Math.min(0.85, heatExcess * 0.16);
    const metabolism = clamp(q10 * coldPenalty * heatMetabolism, 0.08, 2.35);
    const alcoholInhibition = clamp(1 - Math.max(0, next.abv - yeast.alcoholTolerance * 0.72) / 5.5, 0.18, 1);
    const sugarAvailability = next.sugarKg / (next.sugarKg + 0.8);
    const capacity = 1.55;
    const growth =
      yeast.growthRate *
      0.052 *
      metabolism *
      sugarAvailability *
      alcoholInhibition *
      next.biomass *
      (1 - next.biomass / capacity);
    next.biomass = clamp(next.biomass + growth, 0.025, capacity);

    const uptake =
      Math.max(0, next.sugarKg) *
      0.014 *
      metabolism *
      (0.35 + next.biomass) *
      sugarAvailability *
      alcoholInhibition;
    const consumed = Math.min(next.sugarKg, uptake);
    next.sugarKg = Math.max(0, next.sugarKg - consumed);

    // Gravity follows the recipe's empirical attenuation trajectory. The
    // stoichiometric estimate is retained in sugar consumption/byproducts.
    const consumedFraction = clamp(1 - next.sugarKg / Math.max(0.001, next.fermentableKgInitial), 0, 1.08);
    next.gravity = next.og - (next.og - next.fgTarget) * consumedFraction;
    next.abv = clamp((next.og - next.gravity) * 131.25, 0, 18);

    const esterHeat = Math.exp(0.155 * (t - optimum));
    const fuselHeat = Math.exp(0.125 * (t - (yeast.optHighC - 1)));
    next.estersPpm += consumed * yeast.esterProfile * 1.05 * esterHeat * (0.75 + growth * 7);
    next.fuselPpm += consumed * yeast.fuselProfile * 0.82 * fuselHeat * (1 + heatExcess * 0.22);
    next.phenolsPpm += consumed * yeast.phenolProfile * 0.42 * Math.exp(0.1 * (t - optimum));

    if (next.biomass < 0.75 && next.sugarKg > next.fermentableKgInitial * 0.35) {
      next.diacetylPpm += growth * 2.4 + consumed * 0.012;
    } else {
      next.diacetylPpm = Math.max(0, next.diacetylPpm - (0.018 + metabolism * 0.012) * yeast.flocculation);
    }

    if (heatExcess > 0) {
      next.health = clamp(next.health - heatExcess * heatExcess * 0.055 * dt, 25, 100);
    }
    if (next.abv > yeast.alcoholTolerance) {
      next.health = clamp(next.health - (next.abv - yeast.alcoholTolerance) * 0.08, 20, 100);
    }
  }

  next.dayOfFerment += 1;
  const fermentedFraction = 1 - next.sugarKg / Math.max(0.001, next.fermentableKgInitial);
  if (fermentedFraction < 0.22 && next.dayOfFerment <= 1) {
    next.phase = 'lag';
  } else if (next.biomass < 0.72 && fermentedFraction < 0.55) {
    next.phase = 'growth';
  } else if (next.sugarKg > 0.18 && fermentedFraction < 0.94) {
    next.phase = 'active';
  } else {
    next.phase = next.conditionDays >= 2 ? 'terminal' : 'conditioning';
    next.conditionDays += 1;
  }

  next.history.push({
    day: next.dayOfFerment,
    gravity: next.gravity,
    abv: next.abv,
    biomass: next.biomass,
    esters: next.estersPpm,
  });
  if (next.history.length > 30) next.history.splice(0, next.history.length - 30);
  return next;
}
