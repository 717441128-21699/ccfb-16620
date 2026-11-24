export type ID = string;
export type PageId = 'brewhouse' | 'fermenters' | 'lab' | 'tavern';
export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';
export type IngredientCategory = 'malt' | 'hop' | 'yeast';

export interface Malt {
  id: string;
  name: string;
  origin: string;
  colorEBC: number;
  /** kg soluble extract per kg malt */
  extract: number;
  /** relative beta-amylase power, 0 for specialty malts */
  betaPower: number;
  /** relative alpha-amylase / liquefaction power */
  alphaPower: number;
  /** fraction that tends to remain as non-fermentable dextrin/caramel */
  dextrinBase: number;
  costPerKg: number;
  blurb: string;
}

export interface Hop {
  id: string;
  name: string;
  origin: string;
  alphaAcid: number;
  betaAcid: number;
  aroma: number;
  costPer100g: number;
  blurb: string;
}

export interface Yeast {
  id: string;
  name: string;
  kind: 'ale' | 'lager' | 'wild';
  /** fraction of fermentable sugar the strain can attenuate */
  attenuation: number;
  optLowC: number;
  optHighC: number;
  growthRate: number;
  esterProfile: number;
  fuselProfile: number;
  phenolProfile: number;
  flocculation: number;
  alcoholTolerance: number;
  costPerPack: number;
  blurb: string;
}

export interface MaltBillItem {
  maltId: string;
  kg: number;
}

export interface HopAddition {
  hopId: string;
  grams: number;
  boilMin: number;
}

export interface StyleProfile {
  id: string;
  name: string;
  minAbv: number;
  maxAbv: number;
  minIbu: number;
  maxIbu: number;
  minEbc: number;
  maxEbc: number;
  body: number; // 0 crisp ... 1 chewy
  ester: number; // desired ester index
  seasonAffinity: Partial<Record<SeasonId, number>>;
  description: string;
}

export interface Recipe {
  id: string;
  name: string;
  styleId: string;
  volumeL: number;
  mashTempC: number;
  mashMin: number;
  fermTempC: number;
  bill: MaltBillItem[];
  hops: HopAddition[];
  yeastId: string;
  invented?: boolean;
}

export interface MashResult {
  totalMaltKg: number;
  extractKg: number;
  plato: number;
  og: number;
  fermentability: number;
  apparentAttenuation: number;
  fg: number;
  abv: number;
  ebc: number;
  srm: number;
  betaWork: number;
  alphaWork: number;
  conversion: number;
  bodyIndex: number;
  cost: number;
}

export interface HopBitterness {
  hopId: string;
  grams: number;
  boilMin: number;
  utilization: number;
  ibu: number;
  aromaContribution: number;
}

export interface WortResult extends MashResult {
  ibu: number;
  hopDetails: HopBitterness[];
  aromaIndex: number;
  flavorPreview: number;
}

export interface FermentSnapshot {
  day: number;
  gravity: number;
  abv: number;
  biomass: number;
  esters: number;
}

export interface FermentBatch {
  batchId: string;
  recipeId: string;
  name: string;
  styleId: string;
  yeastId: string;
  brewedDay: number;
  volumeL: number;
  og: number;
  fgTarget: number;
  plato: number;
  extractKg: number;
  fermentableKgInitial: number;
  sugarKg: number;
  dextrinIndex: number;
  bodyIndex: number;
  aromaIndex: number;
  ibu: number;
  ebc: number;
  mashTempC: number;
  targetTempC: number;
  actualTempC: number;
  dayOfFerment: number;
  conditionDays: number;
  biomass: number;
  abv: number;
  gravity: number;
  estersPpm: number;
  fuselPpm: number;
  phenolsPpm: number;
  diacetylPpm: number;
  health: number;
  phase: 'lag' | 'growth' | 'active' | 'conditioning' | 'terminal';
  history: FermentSnapshot[];
  totalCost: number;
}

export type TankStatus = 'empty' | 'fermenting' | 'conditioning' | 'ready' | 'dirty';

export interface Fermenter {
  id: string;
  name: string;
  capacityL: number;
  status: TankStatus;
  setpointC: number;
  batch: FermentBatch | null;
}

export interface QueuedWort {
  id: string;
  recipeId: string;
  name: string;
  styleId: string;
  yeastId: string;
  brewedDay: number;
  volumeL: number;
  wort: WortResult;
  targetTempC: number;
  totalCost: number;
}

export interface BeerScores {
  abv: number;
  ibu: number;
  color: number;
  flavor: number;
  total: number;
  medals: string;
  notes: string[];
}

export interface PackagedBeer {
  id: string;
  batchId: string;
  name: string;
  styleId: string;
  packagedDay: number;
  volumeL: number;
  remainingL: number;
  abv: number;
  ibu: number;
  ebc: number;
  color: string;
  estersPpm: number;
  fuselPpm: number;
  phenolsPpm: number;
  scores: BeerScores;
  costPerL: number;
  pricePerPint: number;
  totalPintsSold: number;
  revenue: number;
}

export interface DailySale {
  day: number;
  season: SeasonId;
  customers: number;
  pints: number;
  revenue: number;
  reputation: number;
  topBeer: string;
}

export interface Inventory {
  maltKg: Record<string, number>;
  hopG: Record<string, number>;
  yeastPack: Record<string, number>;
}

export interface GameState {
  version: number;
  day: number;
  cash: number;
  reputation: number;
  totalBrewedL: number;
  totalRevenue: number;
  inventory: Inventory;
  recipes: Recipe[];
  queuedWorts: QueuedWort[];
  fermenters: Fermenter[];
  beerList: PackagedBeer[];
  tapBeerIds: (ID | null)[];
  sales: DailySale[];
  lastWorkerMs: number | null;
  toast?: string;
}

export interface WorkerAdvanceResponse {
  tanks: Fermenter[];
  computeMs: number;
  hours: number;
}

export interface BenchmarkResponse {
  perDayMs: number;
  totalMs: number;
  days: number;
  tanks: number;
}
