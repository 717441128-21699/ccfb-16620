import { INITIAL_RECIPES } from '../src/data/recipes';
import { brewRecipe, createBatchFromWort } from '../src/game/engine';
import { computeWort, stepFermentBatchDay } from '../src/game/formulas';
import { createInitialState } from '../src/game/state';
import { runSimulationSelfTest } from '../src/game/validation';

const selfTest = runSimulationSelfTest();
console.log(selfTest.lines.join('\n'));
if (!selfTest.ok) process.exit(1);

console.log('\nMash trend by recipe:');
for (const recipe of INITIAL_RECIPES) {
  const r63 = structuredClone(recipe);
  r63.mashTempC = 63;
  const r70 = structuredClone(recipe);
  r70.mashTempC = 70;
  const a = computeWort(r63);
  const b = computeWort(r70);
  console.log(
    `${recipe.name}: F ${(a.fermentability * 100).toFixed(1)}%→${(b.fermentability * 100).toFixed(1)}%, ABV ${a.abv.toFixed(2)}→${b.abv.toFixed(2)}, IBU@base ${computeWort(recipe).ibu.toFixed(1)}`,
  );
  if (!(a.fermentability > b.fermentability)) throw new Error(`Fermentability trend failed: ${recipe.name}`);
}

const state = createInitialState();
brewRecipe(state, 'recipe-pale');
const wort = state.queuedWorts[0];
const batch = createBatchFromWort(wort);
console.log('\nFresh fermentation trajectory:');
for (let d = 1; d <= 12; d++) {
  const next = stepFermentBatchDay(batch, 19.5);
  Object.assign(batch, next);
  if ([1, 3, 5, 7, 9, 12].includes(d)) {
    console.log(
      `D${d}: phase=${batch.phase} sugar=${batch.sugarKg.toFixed(2)} grav=${batch.gravity.toFixed(4)} abv=${batch.abv.toFixed(2)} est=${batch.estersPpm.toFixed(1)} fus=${batch.fuselPpm.toFixed(1)}`,
    );
  }
}

const activeBatch = state.fermenters.find((t) => t.batch)?.batch ?? batch;
const batches = Array.from({ length: 20 }, (_, i) => {
  const b = structuredClone(activeBatch);
  b.batchId = `perf-${i}`;
  b.sugarKg = b.fermentableKgInitial * (0.25 + (i % 5) * 0.12);
  b.dayOfFerment = 2 + (i % 4);
  return b;
});

let total = 0;
let max = 0;
for (let day = 0; day < 120; day++) {
  const start = performance.now();
  for (let i = 0; i < batches.length; i++) {
    batches[i] = stepFermentBatchDay(batches[i], 19 + (i % 4));
  }
  const ms = performance.now() - start;
  total += ms;
  max = Math.max(max, ms);
}
console.log(`\n20 tanks/day over 120 days: avg=${(total / 120).toFixed(3)}ms max=${max.toFixed(3)}ms`);
if (total / 120 > 30) process.exit(1);
console.log('VERIFY_OK');
