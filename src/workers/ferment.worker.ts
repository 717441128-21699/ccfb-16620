/// <reference lib="webworker" />
import { stepFermentBatchDay } from '../game/formulas';
import type { WorkerRequest, WorkerResponse } from '../game/protocol';
import type { FermentBatch, Fermenter } from '../types';

function syncTank(tank: Fermenter): Fermenter {
  if (!tank.batch) return { ...tank, status: 'empty' };
  const phase = tank.batch.phase;
  const status = phase === 'terminal' ? 'ready' : phase === 'conditioning' ? 'conditioning' : 'fermenting';
  return { ...tank, status };
}

function fakeBatch(index: number): FermentBatch {
  const og = 1.052 + (index % 7) * 0.006;
  const fermentable = 17 + (index % 5) * 1.7;
  return {
    batchId: `bench-batch-${index}`,
    recipeId: 'benchmark',
    name: `压力测试 ${index + 1}`,
    styleId: index % 2 ? 'ipa' : 'pale-ale',
    yeastId: index % 3 ? 'us05' : 'wb06',
    brewedDay: 1,
    volumeL: 200,
    og,
    fgTarget: og - 0.038,
    plato: 12 + (index % 4),
    extractKg: 24 + (index % 5),
    fermentableKgInitial: fermentable,
    sugarKg: fermentable * (0.35 + (index % 4) * 0.12),
    dextrinIndex: 0.24,
    bodyIndex: 0.48,
    aromaIndex: 0.8,
    ibu: 35 + (index % 5) * 8,
    ebc: 12 + (index % 6) * 9,
    mashTempC: 66,
    targetTempC: 19 + (index % 5),
    actualTempC: 19.5 + (index % 5) * 0.7,
    dayOfFerment: 2 + (index % 4),
    conditionDays: 0,
    biomass: 0.55 + (index % 5) * 0.12,
    abv: 2.2 + (index % 4) * 0.7,
    gravity: og - 0.02,
    estersPpm: 12 + index,
    fuselPpm: 18 + (index % 7) * 4,
    phenolsPpm: 2,
    diacetylPpm: 0.18,
    health: 96,
    phase: 'active',
    history: [],
    totalCost: 520,
  };
}

function fakeTank(index: number): Fermenter {
  return {
    id: `bench-tank-${index}`,
    name: `B${index + 1}`,
    capacityL: 240,
    status: 'fermenting',
    setpointC: 19 + (index % 5),
    batch: fakeBatch(index),
  };
}

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.kind === 'advance') {
    const start = performance.now();
    const fermenters = req.fermenters.map((tank) => {
      if (!tank.batch) return tank;
      const batch = stepFermentBatchDay(tank.batch, tank.setpointC);
      return syncTank({ ...tank, batch });
    });
    const computeMs = performance.now() - start;
    const response: WorkerResponse = {
      kind: 'advanced',
      requestId: req.requestId,
      fermenters,
      computeMs,
    };
    worker.postMessage(response);
    return;
  }

  const tankCount = Math.max(1, req.tankCount);
  const days = Math.max(1, req.days);
  const tanks = Array.from({ length: tankCount }, (_, i) => fakeTank(i));
  const start = performance.now();
  for (let d = 0; d < days; d++) {
    for (const tank of tanks) {
      if (tank.batch) tank.batch = stepFermentBatchDay(tank.batch, tank.setpointC);
    }
  }
  const totalMs = performance.now() - start;
  const response: WorkerResponse = {
    kind: 'benchmark',
    requestId: req.requestId,
    benchmark: {
      tanks: tankCount,
      days,
      totalMs: Math.round(totalMs * 1000) / 1000,
      perDayMs: Math.round((totalMs / days) * 1000) / 1000,
    },
  };
  worker.postMessage(response);
};
