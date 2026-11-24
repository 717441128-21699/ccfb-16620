import { INITIAL_RECIPES } from '../data/recipes';
import {
  assignWortToTank,
  brewRecipe,
  cleanTank,
  packageTank,
  runTavernDay,
  uid,
} from './engine';
import { stepFermentBatchDay } from './formulas';
import type { Fermenter, GameState } from '../types';

const SAVE_KEY = 'copper-and-mash-v1';
export const SAVE_VERSION = 1;

function initialInventory(): GameState['inventory'] {
  return {
    maltKg: {
      pilsner: 160,
      pale: 180,
      munich: 100,
      wheat: 120,
      crystal60: 55,
      chocolate: 28,
      oat: 48,
      black: 24,
    },
    hopG: {
      cascade: 1800,
      citrus: 900,
      saaz: 1600,
      hallertau: 1200,
      fuggle: 1000,
      nugget: 1600,
      mosaic: 700,
    },
    yeastPack: {
      us05: 24,
      s04: 18,
      wb06: 16,
      w3470: 14,
      belgian: 10,
      kveik: 8,
    },
  };
}

function initialFermenters(count: number): Fermenter[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `tank-init-${i + 1}`,
    name: `FV-${String(i + 1).padStart(2, '0')}`,
    capacityL: 240,
    status: 'empty',
    setpointC: 20,
    batch: null,
  }));
}

function seedTank(state: GameState, tankIndex: number, recipeId: string, days: number, tempC: number): void {
  const before = state.queuedWorts.length;
  const message = brewRecipe(state, recipeId);
  if (state.queuedWorts.length === before) {
    console.warn(message);
    return;
  }
  const wort = state.queuedWorts[0];
  wort.targetTempC = tempC;
  const tank = state.fermenters[tankIndex];
  assignWortToTank(state, tank.id, wort.id);
  tank.setpointC = tempC;
  if (tank.batch) tank.batch.targetTempC = tempC;
  for (let d = 0; d < days; d++) {
    if (!tank.batch) break;
    tank.batch = stepFermentBatchDay(tank.batch, tempC);
  }
  if (tank.batch) {
    tank.status =
      tank.batch.phase === 'terminal' ? 'ready' : tank.batch.phase === 'conditioning' ? 'conditioning' : 'fermenting';
  }
}

function seedPackaged(state: GameState, tankIndex: number, recipeId: string, tempC: number): void {
  seedTank(state, tankIndex, recipeId, 8, tempC);
  const result = packageTank(state, state.fermenters[tankIndex].id);
  if (typeof result !== 'string') {
    result.packagedDay = Math.max(1, state.day - 3);
  }
  cleanTank(state, state.fermenters[tankIndex].id);
}

export function createInitialState(): GameState {
  const state: GameState = {
    version: SAVE_VERSION,
    day: 1,
    cash: 18800,
    reputation: 58,
    totalBrewedL: 0,
    totalRevenue: 0,
    inventory: initialInventory(),
    recipes: structuredClone(INITIAL_RECIPES),
    queuedWorts: [],
    fermenters: initialFermenters(8),
    beerList: [],
    tapBeerIds: [null, null, null, null, null, null],
    sales: [],
    lastWorkerMs: null,
    toast: '欢迎来到铜釜与麦芽精酿厂：先在酿造台投料，再到发酵罐页装罐。',
  };

  seedPackaged(state, 0, 'recipe-pale', 19.2);
  seedPackaged(state, 1, 'recipe-wheat', 21.4);
  seedPackaged(state, 2, 'recipe-amber', 19.0);
  seedTank(state, 3, 'recipe-ipa', 3, 20.2);
  seedTank(state, 4, 'recipe-wheat', 2, 24.6);
  seedTank(state, 5, 'recipe-stout', 5, 20.4);

  // A few prior trading days make the tavern chart readable immediately.
  state.day = 6;
  for (let day = 1; day <= 6; day++) {
    state.day = day;
    runTavernDay(state);
  }
  state.day = 7;
  state.toast = '周末客流更高；夏季适合清爽拉格和小麦，冬季重烈酒更受欢迎。';
  return state;
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('保存游戏失败', error);
  }
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || parsed.version !== SAVE_VERSION || !Array.isArray(parsed.fermenters) || !Array.isArray(parsed.recipes)) {
      return createInitialState();
    }
    // Defensive defaults for saves created during development.
    parsed.tapBeerIds ??= [null, null, null, null, null, null];
    parsed.queuedWorts ??= [];
    parsed.beerList ??= [];
    parsed.sales ??= [];
    parsed.lastWorkerMs ??= null;
    parsed.toast = undefined;
    return parsed;
  } catch {
    return createInitialState();
  }
}

export function resetStorage(): GameState {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore storage failures.
  }
  return createInitialState();
}

export function newRecipeId(): string {
  return uid('recipe');
}
