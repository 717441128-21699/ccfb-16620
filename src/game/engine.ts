import { HOPS, MALTS, YEASTS, styleById } from '../data/ingredients';
import {
  PINT_L,
  clamp,
  computeWort,
  ebcToCss,
  pseudoRandom,
  scorePackagedBeer,
  seasonForDay,
} from './formulas';
import type {
  BeerScores,
  FermentBatch,
  Fermenter,
  GameState,
  ID,
  PackagedBeer,
  QueuedWort,
  Recipe,
} from '../types';

let idCounter = 0;
export const uid = (prefix: string): ID =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

export function findRecipe(state: GameState, recipeId: string): Recipe {
  return state.recipes.find((r) => r.id === recipeId) ?? state.recipes[0];
}

export interface IngredientRequirement {
  ok: boolean;
  missing: string[];
}

export function checkIngredients(state: GameState, recipe: Recipe): IngredientRequirement {
  const missing: string[] = [];
  for (const item of recipe.bill) {
    const malt = MALTS.find((m) => m.id === item.maltId) ?? MALTS[0];
    if ((state.inventory.maltKg[item.maltId] ?? 0) + 1e-6 < item.kg) {
      missing.push(`${malt.name} 差 ${(item.kg - (state.inventory.maltKg[item.maltId] ?? 0)).toFixed(1)}kg`);
    }
  }
  for (const addition of recipe.hops) {
    const hop = HOPS.find((h) => h.id === addition.hopId) ?? HOPS[0];
    if ((state.inventory.hopG[addition.hopId] ?? 0) + 1e-6 < addition.grams) {
      missing.push(`${hop.name} 差 ${Math.ceil(addition.grams - (state.inventory.hopG[addition.hopId] ?? 0))}g`);
    }
  }
  if ((state.inventory.yeastPack[recipe.yeastId] ?? 0) < 1) {
    const yeast = YEASTS.find((y) => y.id === recipe.yeastId) ?? YEASTS[0];
    missing.push(`${yeast.name} 缺 1 包`);
  }
  return { ok: missing.length === 0, missing };
}

export function buyIngredient(
  state: GameState,
  category: 'malt' | 'hop' | 'yeast',
  id: string,
  quantity: number,
): string {
  let cost = 0;
  let name = '';
  if (category === 'malt') {
    const item = MALTS.find((m) => m.id === id);
    if (!item) return '未找到麦芽';
    cost = item.costPerKg * quantity;
    name = `${item.name} ×${quantity}kg`;
  } else if (category === 'hop') {
    const item = HOPS.find((h) => h.id === id);
    if (!item) return '未找到酒花';
    cost = (item.costPer100g / 100) * quantity;
    name = `${item.name} ×${quantity}g`;
  } else {
    const item = YEASTS.find((y) => y.id === id);
    if (!item) return '未找到酵母';
    cost = item.costPerPack * quantity;
    name = `${item.name} ×${quantity}包`;
  }
  cost = Math.round(cost * 10) / 10;
  if (state.cash < cost) return `现金不足，采购${name}需要 ¥${cost.toFixed(0)}`;
  state.cash -= cost;
  if (category === 'malt') state.inventory.maltKg[id] = (state.inventory.maltKg[id] ?? 0) + quantity;
  if (category === 'hop') state.inventory.hopG[id] = (state.inventory.hopG[id] ?? 0) + quantity;
  if (category === 'yeast') state.inventory.yeastPack[id] = (state.inventory.yeastPack[id] ?? 0) + quantity;
  return `已采购 ${name}，支出 ¥${cost.toFixed(0)}`;
}

export function brewRecipe(state: GameState, recipeId: string, override?: Partial<Recipe>): string {
  const recipe = structuredClone(findRecipe(state, recipeId));
  if (override) Object.assign(recipe, override);
  const requirement = checkIngredients(state, recipe);
  if (!requirement.ok) return `原料不足：${requirement.missing.slice(0, 2).join('；')}`;

  for (const item of recipe.bill) state.inventory.maltKg[item.maltId] -= item.kg;
  for (const addition of recipe.hops) state.inventory.hopG[addition.hopId] -= addition.grams;
  state.inventory.yeastPack[recipe.yeastId] -= 1;

  const wort = computeWort(recipe);
  const queued: QueuedWort = {
    id: uid('wort'),
    recipeId: recipe.id,
    name: recipe.name,
    styleId: recipe.styleId,
    yeastId: recipe.yeastId,
    brewedDay: state.day,
    volumeL: recipe.volumeL,
    wort,
    targetTempC: recipe.fermTempC,
    totalCost: wort.cost,
  };
  state.queuedWorts.unshift(queued);
  state.totalBrewedL += recipe.volumeL;
  return `酿造完成：${recipe.name}，麦汁 ${wort.plato.toFixed(1)}°P / ${wort.ibu.toFixed(0)} IBU，等待装罐`;
}

export function createBatchFromWort(wort: QueuedWort): FermentBatch {
  const w = wort.wort;
  const initialSugar = w.extractKg * w.fermentability;
  return {
    batchId: uid('batch'),
    recipeId: wort.recipeId,
    name: wort.name,
    styleId: wort.styleId,
    yeastId: wort.yeastId,
    brewedDay: wort.brewedDay,
    volumeL: wort.volumeL,
    og: w.og,
    fgTarget: w.fg,
    plato: w.plato,
    extractKg: w.extractKg,
    fermentableKgInitial: initialSugar,
    sugarKg: initialSugar,
    dextrinIndex: 1 - w.fermentability,
    bodyIndex: w.bodyIndex,
    aromaIndex: w.aromaIndex,
    ibu: w.ibu,
    ebc: w.ebc,
    mashTempC: 0,
    targetTempC: wort.targetTempC,
    actualTempC: wort.targetTempC - 1.2,
    dayOfFerment: 0,
    conditionDays: 0,
    biomass: 0.22,
    abv: 0,
    gravity: w.og,
    estersPpm: 0,
    fuselPpm: 0,
    phenolsPpm: 0,
    diacetylPpm: 0.04,
    health: 100,
    phase: 'lag',
    history: [{ day: 0, gravity: w.og, abv: 0, biomass: 0.22, esters: 0 }],
    totalCost: wort.totalCost,
  };
}

export function assignWortToTank(state: GameState, tankId: string, wortId: string): string {
  const tank = state.fermenters.find((t) => t.id === tankId);
  const index = state.queuedWorts.findIndex((w) => w.id === wortId);
  if (!tank || index < 0) return '找不到发酵罐或麦汁';
  if (tank.status === 'dirty') return '该罐需要先清洗';
  if (tank.batch) return '该罐正在使用';
  const [wort] = state.queuedWorts.splice(index, 1);
  if (wort.volumeL > tank.capacityL) return '麦汁体积超过发酵罐容量';
  tank.batch = createBatchFromWort(wort);
  tank.status = 'fermenting';
  tank.setpointC = wort.targetTempC;
  return `${tank.name} 已装入 ${wort.name} 并投入酵母`;
}

export function cleanTank(state: GameState, tankId: string): string {
  const tank = state.fermenters.find((t) => t.id === tankId);
  if (!tank) return '找不到发酵罐';
  if (tank.batch) return '罐内还有酒液';
  tank.status = 'empty';
  return `${tank.name} 已清洗备用`;
}

export function buyFermenter(state: GameState): string {
  if (state.fermenters.length >= 20) return '已达到20个发酵罐的厂区上限';
  const cost = 2600 + state.fermenters.length * 180;
  if (state.cash < cost) return `现金不足，新增发酵罐需要 ¥${cost}`;
  state.cash -= cost;
  const n = state.fermenters.length + 1;
  const tank: Fermenter = {
    id: uid('tank'),
    name: `FV-${String(n).padStart(2, '0')}`,
    capacityL: 240,
    status: 'empty',
    setpointC: 20,
    batch: null,
  };
  state.fermenters.push(tank);
  return `已安装 ${tank.name} 240L 发酵罐`;
}

export function packageTank(state: GameState, tankId: string): PackagedBeer | string {
  const tank = state.fermenters.find((t) => t.id === tankId);
  if (!tank?.batch) return '罐内没有可装瓶的酒';
  const batch = tank.batch;
  const packagedL = Math.round(batch.volumeL * 0.96 * 10) / 10;
  const scores: BeerScores = scorePackagedBeer({
    abv: batch.abv,
    ibu: batch.ibu,
    ebc: batch.ebc,
    flavorInput: {
      styleId: batch.styleId,
      bodyIndex: batch.bodyIndex,
      aromaIndex: batch.aromaIndex,
      estersPpm: batch.estersPpm,
      fuselPpm: batch.fuselPpm,
      phenolsPpm: batch.phenolsPpm,
      diacetylPpm: batch.diacetylPpm,
      health: batch.health,
      actualTempC: batch.actualTempC,
    },
  });
  const costPerL = Math.round((batch.totalCost / packagedL + 1.35) * 10) / 10;
  const pricePerPint = Math.round(clamp(9 + scores.total * 0.22 + costPerL * 1.1, 16, 46));
  const beer: PackagedBeer = {
    id: uid('beer'),
    batchId: batch.batchId,
    name: batch.name,
    styleId: batch.styleId,
    packagedDay: state.day,
    volumeL: packagedL,
    remainingL: packagedL,
    abv: Math.round(batch.abv * 10) / 10,
    ibu: Math.round(batch.ibu),
    ebc: Math.round(batch.ebc),
    color: ebcToCss(batch.ebc),
    estersPpm: batch.estersPpm,
    fuselPpm: batch.fuselPpm,
    phenolsPpm: batch.phenolsPpm,
    scores,
    costPerL,
    pricePerPint,
    totalPintsSold: 0,
    revenue: 0,
  };
  state.beerList.unshift(beer);
  const emptyTap = state.tapBeerIds.findIndex((id) => id === null);
  if (emptyTap >= 0) state.tapBeerIds[emptyTap] = beer.id;
  tank.batch = null;
  tank.status = 'dirty';
  return beer;
}

export function setTapBeer(state: GameState, tapIndex: number, beerId: ID | null): void {
  while (state.tapBeerIds.length <= tapIndex) state.tapBeerIds.push(null);
  state.tapBeerIds[tapIndex] = beerId;
}

export function setBeerPrice(state: GameState, beerId: string, price: number): void {
  const beer = state.beerList.find((b) => b.id === beerId);
  if (beer) beer.pricePerPint = Math.round(clamp(price, 8, 88));
}

export function runTavernDay(state: GameState): void {
  const season = seasonForDay(state.day);
  const weekend = state.day % 7 === 0 || state.day % 7 === 6;
  const noise = 0.86 + pseudoRandom(state.day * 97 + 13) * 0.28;
  const customers = Math.round((24 + state.reputation * 1.35) * (weekend ? 1.38 : 1) * noise);

  const taps = state.tapBeerIds
    .map((id, index) => ({ id, index, beer: state.beerList.find((b) => b.id === id) ?? null }))
    .filter((tap): tap is { id: string; index: number; beer: PackagedBeer } => Boolean(tap.beer && tap.beer.remainingL > PINT_L));

  if (taps.length === 0) {
    state.reputation = clamp(state.reputation - 0.9, 0, 100);
    state.sales.unshift({
      day: state.day,
      season,
      customers,
      pints: 0,
      revenue: 0,
      reputation: state.reputation,
      topBeer: '无酒可售',
    });
    state.sales = state.sales.slice(0, 48);
    return;
  }

  const potentialPints = customers * (1.05 + state.reputation / 520) * (0.9 + pseudoRandom(state.day + 4) * 0.25);
  const appeals = taps.map((tap) => {
    const style = styleById(tap.beer.styleId);
    const seasonFit = style.seasonAffinity[season] ?? 1;
    const quality = tap.beer.scores.total / 100;
    const priceFactor = clamp(1.42 - tap.beer.pricePerPint / 43, 0.38, 1.12);
    const reputationFactor = 0.55 + state.reputation / 130;
    return Math.max(0.04, (0.18 + quality * 0.92) * seasonFit * priceFactor * reputationFactor);
  });
  const appealTotal = appeals.reduce((a, b) => a + b, 0);

  let totalPints = 0;
  let revenue = 0;
  let qualityWeighted = 0;
  let topBeer = taps[0].beer.name;
  let topPints = -1;

  taps.forEach((tap, i) => {
    const share = appeals[i] / appealTotal;
    const demandPints = Math.round(potentialPints * share * (0.88 + pseudoRandom(state.day * 31 + i * 17) * 0.24));
    const availablePints = Math.floor(tap.beer.remainingL / PINT_L);
    const pints = Math.max(0, Math.min(demandPints, availablePints));
    tap.beer.remainingL = Math.round((tap.beer.remainingL - pints * PINT_L) * 100) / 100;
    tap.beer.totalPintsSold += pints;
    const dayRevenue = pints * tap.beer.pricePerPint;
    tap.beer.revenue += dayRevenue;
    totalPints += pints;
    revenue += dayRevenue;
    qualityWeighted += pints * tap.beer.scores.total;
    if (pints > topPints) {
      topPints = pints;
      topBeer = tap.beer.name;
    }
    if (tap.beer.remainingL <= PINT_L) {
      state.tapBeerIds[tap.index] = null;
    }
  });

  state.cash += Math.round(revenue * 10) / 10;
  state.totalRevenue += Math.round(revenue * 10) / 10;
  if (totalPints > 0) {
    const avgQuality = qualityWeighted / totalPints;
    const serviceRatio = clamp(totalPints / Math.max(1, customers), 0, 1.4);
    state.reputation = clamp(state.reputation + (avgQuality - 71) * 0.075 + (serviceRatio > 0.72 ? 0.35 : -0.25), 0, 100);
  } else {
    state.reputation = clamp(state.reputation - 0.5, 0, 100);
  }

  state.sales.unshift({
    day: state.day,
    season,
    customers,
    pints: totalPints,
    revenue: Math.round(revenue),
    reputation: Math.round(state.reputation * 10) / 10,
    topBeer,
  });
  state.sales = state.sales.slice(0, 48);
}
