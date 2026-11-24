import type { WorkerRequest, WorkerResponse } from './protocol';
import type { BenchmarkResponse, Fermenter } from '../types';

interface PendingCall {
  resolve: (value: WorkerResponse) => void;
  reject: (reason?: unknown) => void;
}

export class FermentWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();

  constructor() {
    try {
      this.worker = new Worker(new URL('../workers/ferment.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        const call = this.pending.get(response.requestId);
        if (!call) return;
        this.pending.delete(response.requestId);
        call.resolve(response);
      };
      this.worker.onerror = (event) => {
        for (const call of this.pending.values()) call.reject(event.error ?? new Error(event.message));
        this.pending.clear();
      };
    } catch (error) {
      console.warn('Web Worker 初始化失败，将使用主线程降级计算', error);
      this.worker = null;
    }
  }

  private call(request: Omit<WorkerRequest, 'requestId'>): Promise<WorkerResponse> {
    const requestId = this.nextId++;
    const fullRequest = { ...request, requestId } as WorkerRequest;
    if (!this.worker) return Promise.reject(new Error('worker-unavailable'));
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker?.postMessage(fullRequest);
    });
  }

  async advanceDay(fermenters: Fermenter[]): Promise<{ fermenters: Fermenter[]; computeMs: number }> {
    try {
      const response = await this.call({ kind: 'advance', fermenters } as Omit<
        Extract<WorkerRequest, { kind: 'advance' }>,
        'requestId'
      >);
      if (response.kind !== 'advanced') throw new Error('bad-response');
      return { fermenters: response.fermenters, computeMs: response.computeMs };
    } catch (error) {
      // Dynamic import keeps fallback out of the hot path unless Worker construction fails.
      const { stepFermentBatchDay } = await import('./formulas');
      const start = performance.now();
      const next = fermenters.map((tank) => {
        if (!tank.batch) return tank;
        const batch = stepFermentBatchDay(tank.batch, tank.setpointC);
        const status =
          batch.phase === 'terminal'
            ? ('ready' as const)
            : batch.phase === 'conditioning'
              ? ('conditioning' as const)
              : ('fermenting' as const);
        return {
          ...tank,
          batch,
          status,
        };
      });
      return { fermenters: next, computeMs: performance.now() - start };
    }
  }

  async benchmark(tankCount = 20, days = 60): Promise<BenchmarkResponse> {
    const response = await this.call({ kind: 'benchmark', tankCount, days } as Omit<
      Extract<WorkerRequest, { kind: 'benchmark' }>,
      'requestId'
    >);
    if (response.kind !== 'benchmark') throw new Error('bad-response');
    return response.benchmark;
  }

  dispose(): void {
    this.worker?.terminate();
    this.pending.clear();
  }
}
