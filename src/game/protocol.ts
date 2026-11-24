import type { BenchmarkResponse, Fermenter } from '../types';

export type WorkerRequest =
  | { kind: 'advance'; requestId: number; fermenters: Fermenter[] }
  | { kind: 'benchmark'; requestId: number; tankCount: number; days: number };

export type WorkerResponse =
  | { kind: 'advanced'; requestId: number; fermenters: Fermenter[]; computeMs: number }
  | { kind: 'benchmark'; requestId: number; benchmark: BenchmarkResponse };
