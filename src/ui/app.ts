import {
  assignWortToTank,
  brewRecipe,
  buyFermenter,
  buyIngredient,
  cleanTank,
  packageTank as packageTankState,
  runTavernDay,
  setBeerPrice,
  setTapBeer,
} from '../game/engine';
import { runSimulationSelfTest, type SelfTestReport } from '../game/validation';
import { loadState, newRecipeId, resetStorage, saveState } from '../game/state';
import { FermentWorkerClient } from '../game/workerClient';
import type { BenchmarkResponse, GameState, IngredientCategory, PageId, Recipe } from '../types';
import { UI } from './widgets';
import { DESIGN_H, DESIGN_W, FONT, theme, withAlpha } from './theme';
import { renderBrewhouse } from './pages/brewhouse';
import { renderFermenters } from './pages/fermenters';
import { renderLab } from './pages/lab';
import { renderTavern } from './pages/tavern';
import { renderShop } from './pages/shop';

interface Toast {
  message: string;
  kind: 'info' | 'error' | 'success';
  at: number;
}

interface TextEdit {
  id: string;
  value: string;
  commit: (value: string) => void;
}

export class GameApp {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly ui: UI;
  readonly worker = new FermentWorkerClient();

  state: GameState = loadState();
  page: PageId = 'brewhouse';
  selectedRecipeId: string;
  labDraft: Recipe;
  brewMashTemp = 66;
  brewMashMin = 60;
  brewFermTemp = 20;
  selectedTankId: string | null;
  selectedTapIndex = 0;

  shopOpen = false;
  shopCategory: IngredientCategory = 'malt';
  benchmark: BenchmarkResponse | null = null;
  benchmarking = false;
  busy = false;
  toast: Toast | null = null;
  textEditing: TextEdit | null = null;
  selfTest: SelfTestReport | null = null;
  resetArmed = false;

  time = 0;
  private raf = 0;
  private view = { cssW: 1, cssH: 1, dpr: 1, scale: 1, ox: 0, oy: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D');
    this.ctx = ctx;
    this.ui = new UI(ctx);

    const firstRecipe = this.state.recipes[0];
    this.selectedRecipeId = firstRecipe?.id ?? '';
    this.labDraft = structuredClone(firstRecipe);
    if (firstRecipe) {
      this.brewMashTemp = firstRecipe.mashTempC;
      this.brewMashMin = firstRecipe.mashMin;
      this.brewFermTemp = firstRecipe.fermTempC;
    }
    this.selectedTankId = this.state.fermenters.find((t) => t.batch)?.id ?? this.state.fermenters[0]?.id ?? null;
    if (this.state.toast) this.notify(this.state.toast);

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerCancel);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('beforeunload', this.persist);

    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('beforeunload', this.persist);
    this.worker.dispose();
  }

  persist = (): void => saveState(this.state);

  notify(message: string, kind: Toast['kind'] = 'info'): void {
    const inferredKind = kind === 'info' && (message.includes('不足') || message.includes('失败') || message.includes('错误')) ? 'error' : kind;
    this.toast = { message, kind: inferredKind, at: performance.now() };
    saveState(this.state);
  }

  setPage(page: PageId): void {
    this.page = page;
    this.textEditing = null;
  }

  selectBrewhouseRecipe(id: string): void {
    const recipe = this.state.recipes.find((r) => r.id === id);
    if (!recipe) return;
    this.selectedRecipeId = id;
    this.brewMashTemp = recipe.mashTempC;
    this.brewMashMin = recipe.mashMin;
    this.brewFermTemp = recipe.fermTempC;
  }

  selectLabRecipe(id: string): void {
    const recipe = this.state.recipes.find((r) => r.id === id);
    if (!recipe) return;
    this.selectedRecipeId = id;
    this.labDraft = structuredClone(recipe);
  }

  newLabRecipe(): void {
    this.labDraft = {
      id: newRecipeId(),
      name: '新实验配方',
      styleId: 'pale-ale',
      volumeL: 200,
      mashTempC: 66,
      mashMin: 60,
      fermTempC: 20,
      yeastId: 'us05',
      bill: [{ maltId: 'pale', kg: 24 }],
      hops: [{ hopId: 'cascade', grams: 80, boilMin: 30 }],
      invented: true,
    };
    this.textEditing = null;
  }

  duplicateLabRecipe(): void {
    this.labDraft = { ...structuredClone(this.labDraft), id: newRecipeId(), name: `${this.labDraft.name} 副本`, invented: true };
  }

  saveLabDraft(andBrew: boolean): void {
    if (this.labDraft.bill.length === 0 || this.labDraft.bill.every((b) => b.kg <= 0)) {
      this.notify('保存失败：至少需要一种麦芽且用量大于0', 'error');
      return;
    }
    const clone = structuredClone(this.labDraft);
    const index = this.state.recipes.findIndex((r) => r.id === clone.id);
    if (index >= 0) this.state.recipes[index] = clone;
    else this.state.recipes.unshift(clone);
    this.selectedRecipeId = clone.id;
    this.brewMashTemp = clone.mashTempC;
    this.brewMashMin = clone.mashMin;
    this.brewFermTemp = clone.fermTempC;
    this.persist();
    this.notify(`配方「${clone.name}」已保存`);
    if (andBrew) this.setPage('brewhouse');
  }

  deleteLabRecipe(): void {
    if (this.state.recipes.length <= 1) {
      this.notify('至少保留一个基础配方', 'error');
      return;
    }
    const id = this.labDraft.id;
    this.state.recipes = this.state.recipes.filter((r) => r.id !== id);
    const next = this.state.recipes[0];
    this.selectLabRecipe(next.id);
    if (this.selectedRecipeId === id) this.selectBrewhouseRecipe(next.id);
    this.persist();
    this.notify('配方已删除');
  }

  startTextEdit(id: string, initial: string, commit: (value: string) => void): void {
    this.textEditing = { id, value: initial, commit };
  }

  private commitTextEdit(): void {
    if (!this.textEditing) return;
    this.textEditing.commit(this.textEditing.value);
    this.textEditing = null;
  }

  selectTank(id: string): void {
    this.selectedTankId = id;
  }

  openShop(category: IngredientCategory = this.shopCategory): void {
    this.shopCategory = category;
    this.shopOpen = true;
  }

  closeShop(): void {
    this.shopOpen = false;
    this.persist();
  }

  buyShop(category: IngredientCategory, id: string, quantity: number): void {
    const message = buyIngredient(this.state, category, id, quantity);
    this.notify(message);
  }

  brewCurrent(): void {
    const message = brewRecipe(this.state, this.selectedRecipeId, {
      mashTempC: this.brewMashTemp,
      mashMin: this.brewMashMin,
      fermTempC: this.brewFermTemp,
    });
    this.notify(message, message.includes('完成') ? 'success' : 'error');
  }

  setTankSetpoint(id: string, value: number): void {
    const tank = this.state.fermenters.find((t) => t.id === id);
    if (!tank) return;
    tank.setpointC = value;
    if (tank.batch) tank.batch.targetTempC = value;
  }

  assignWort(tankId: string, wortId: string): void {
    const message = assignWortToTank(this.state, tankId, wortId);
    this.notify(message, message.includes('已装入') ? 'success' : 'error');
  }

  cleanTank(tankId: string): void {
    this.notify(cleanTank(this.state, tankId), 'success');
  }

  buyTank(): void {
    const message = buyFermenter(this.state);
    this.notify(message, message.includes('已安装') ? 'success' : 'error');
  }

  packageTank(tankId: string) {
    const result = packageTankState(this.state, tankId);
    if (typeof result === 'string') {
      this.notify(result, 'error');
      return result;
    }
    const tapped = this.state.tapBeerIds.includes(result.id);
    this.notify(`${result.name} 已装瓶：${result.scores.total}分 · ${result.scores.medals}，${tapped ? '已自动接上空酒头' : '已入酒款库存'}`, 'success');
    return result;
  }

  setTap(index: number, beerId: string | null): void {
    setTapBeer(this.state, index, beerId);
    this.persist();
  }

  changeBeerPrice(beerId: string, delta: number): void {
    const beer = this.state.beerList.find((b) => b.id === beerId);
    if (!beer) return;
    setBeerPrice(this.state, beerId, beer.pricePerPint + delta);
    this.persist();
  }

  async advanceDay(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await this.worker.advanceDay(this.state.fermenters);
      this.state.fermenters = result.fermenters;
      this.state.lastWorkerMs = Math.round(result.computeMs * 100) / 100;
      this.state.day += 1;
      runTavernDay(this.state);
      const sale = this.state.sales[0];
      this.notify(
        `第${this.state.day}天：发酵Worker用时${result.computeMs.toFixed(2)}ms；酒馆${sale?.pints ?? 0}杯/¥${sale?.revenue ?? 0}`,
        'success',
      );
    } catch (error) {
      console.error(error);
      this.notify('推进一天失败，请查看控制台', 'error');
    } finally {
      this.busy = false;
      this.persist();
    }
  }

  async runBenchmark(): Promise<void> {
    if (this.benchmarking) return;
    this.benchmarking = true;
    try {
      this.benchmark = await this.worker.benchmark(20, 60);
      this.notify(`20罐压测：每个游戏日平均 ${this.benchmark.perDayMs.toFixed(2)}ms（限制30ms）`, this.benchmark.perDayMs <= 30 ? 'success' : 'error');
    } catch (error) {
      console.error(error);
      this.notify('Web Worker 压测不可用', 'error');
    } finally {
      this.benchmarking = false;
    }
  }

  runSelfTest(): void {
    this.selfTest = runSimulationSelfTest();
    console.group('酿酒公式自检');
    this.selfTest.lines.forEach((line) => console.info(line));
    console.groupEnd();
    this.notify(this.selfTest.summary, this.selfTest.ok ? 'success' : 'error');
  }

  resetGame(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.notify('再次点击“确认重置”将清除本地存档');
      window.setTimeout(() => {
        this.resetArmed = false;
      }, 3200);
      return;
    }
    this.state = resetStorage();
    this.selectedRecipeId = this.state.recipes[0]?.id ?? '';
    this.labDraft = structuredClone(this.state.recipes[0]);
    this.selectBrewhouseRecipe(this.selectedRecipeId);
    this.selectedTankId = this.state.fermenters.find((t) => t.batch)?.id ?? this.state.fermenters[0]?.id ?? null;
    this.shopOpen = false;
    this.resetArmed = false;
    this.notify('存档已重置，欢迎重新开业', 'success');
  }

  private toDesignPoint(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - this.view.ox) / this.view.scale,
      y: (event.clientY - rect.top - this.view.oy) / this.view.scale,
    };
  }

  private handlePointerDown = (event: PointerEvent): void => {
    const p = this.toDesignPoint(event);
    if (this.textEditing) this.commitTextEdit();
    this.ui.pointerDown(p.x, p.y);
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers reject capture for synthetic pointers.
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const p = this.toDesignPoint(event);
    this.ui.pointerMove(p.x, p.y);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const p = this.toDesignPoint(event);
    this.ui.pointerUp(p.x, p.y);
    this.persist();
  };

  private handlePointerCancel = (): void => {
    this.ui.cancelPointer();
  };

  private handleWheel = (event: WheelEvent): void => {
    const p = this.toDesignPoint(event);
    if (this.ui.wheel(p.x, p.y, event.deltaY, event.deltaMode)) event.preventDefault();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const edit = this.textEditing;
    if (!edit) return;
    if (event.key === 'Enter') {
      edit.commit(edit.value);
      this.textEditing = null;
      event.preventDefault();
    } else if (event.key === 'Escape') {
      this.textEditing = null;
      event.preventDefault();
    } else if (event.key === 'Backspace') {
      edit.value = edit.value.slice(0, -1);
      event.preventDefault();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      edit.value = `${edit.value}${event.key}`.slice(0, 28);
      event.preventDefault();
    }
  };

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelW = Math.round(cssW * dpr);
    const pixelH = Math.round(cssH * dpr);
    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
    }
    const scale = Math.min(cssW / DESIGN_W, cssH / DESIGN_H);
    this.view = {
      cssW,
      cssH,
      dpr,
      scale,
      ox: (cssW - DESIGN_W * scale) / 2,
      oy: (cssH - DESIGN_H * scale) / 2,
    };
  }

  private frame = (now: number): void => {
    this.time = now;
    this.resize();
    const { ctx, view } = this;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = theme.bg0;
    ctx.fillRect(0, 0, view.cssW, view.cssH);

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    this.drawDesktopBackground();
    this.ui.beginFrame();
    this.renderTopBar();
    if (this.page === 'brewhouse') renderBrewhouse(this);
    if (this.page === 'fermenters') renderFermenters(this);
    if (this.page === 'lab') renderLab(this);
    if (this.page === 'tavern') renderTavern(this);
    if (this.shopOpen) renderShop(this);
    this.renderToast();
    this.ui.endFrame();
    ctx.restore();

    this.canvas.style.cursor = this.ui.hoverCursor;
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawDesktopBackground(): void {
    const ctx = this.ctx;
    const gradient = ctx.createRadialGradient(680, 260, 80, 680, 430, 900);
    gradient.addColorStop(0, '#2a1d13');
    gradient.addColorStop(0.55, theme.bg1);
    gradient.addColorStop(1, theme.bg0);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = theme.copperBright;
    ctx.lineWidth = 1;
    for (let x = 0; x < DESIGN_W; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, DESIGN_H);
      ctx.stroke();
    }
    for (let y = 0; y < DESIGN_H; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(DESIGN_W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private topStat(x: number, w: number, label: string, value: string, color = theme.text): void {
    const ui = this.ui;
    ui.roundRect(x, 12, w, 40, 11);
    ui.ctx.fillStyle = withAlpha(theme.bg0, 0.42);
    ui.ctx.fill();
    ui.text(label, x + 10, 27, { size: 10, color: theme.faint, weight: 800 });
    ui.text(value, x + 10, 44, { size: 14, weight: 950, color, font: 'num' });
  }

  private renderTopBar(): void {
    const ui = this.ui;
    const ctx = ui.ctx;
    ctx.save();
    const bar = ctx.createLinearGradient(0, 0, 0, 64);
    bar.addColorStop(0, '#2c2017');
    bar.addColorStop(1, '#1a130e');
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, DESIGN_W, 64);
    ctx.strokeStyle = withAlpha(theme.border, 0.8);
    ctx.beginPath();
    ctx.moveTo(0, 63.5);
    ctx.lineTo(DESIGN_W, 63.5);
    ctx.stroke();
    ctx.restore();

    ui.roundRect(24, 14, 36, 36, 11);
    ui.ctx.fillStyle = theme.copper;
    ui.ctx.fill();
    ui.text('釜', 42, 33, { size: 21, weight: 950, color: '#211407', align: 'center', baseline: 'middle' });
    ui.text('铜釜与麦芽', 72, 29, { size: 21, weight: 950 });
    ui.text('COPPER & MASH BREWERY', 73, 47, { size: 9.5, weight: 800, color: theme.faint, font: 'num' });

    const tabs: Array<{ id: PageId; label: string; icon: string }> = [
      { id: 'brewhouse', label: '酿造台', icon: '🔥' },
      { id: 'fermenters', label: '发酵罐', icon: '🫧' },
      { id: 'lab', label: '配方实验', icon: '🧪' },
      { id: 'tavern', label: '酒馆经营', icon: '🍺' },
    ];
    tabs.forEach((tab, i) => {
      ui.buttonAction(
        `nav-${tab.id}`,
        { x: 286 + i * 140, y: 12, w: 132, h: 40 },
        `${tab.icon} ${tab.label}`,
        () => this.setPage(tab.id),
        { variant: 'tab', selected: this.page === tab.id, fontSize: 14 },
      );
    });

    const seasonNames = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' } as const;
    const season = (['spring', 'summer', 'autumn', 'winter'] as const)[Math.floor((Math.max(1, this.state.day) - 1) / 9) % 4];
    this.topStat(846, 78, '日期', `D${this.state.day} ${seasonNames[season]}`);
    this.topStat(930, 126, '现金', `¥${Math.round(this.state.cash).toLocaleString()}`, theme.gold);
    this.topStat(1062, 86, '声望', `${this.state.reputation.toFixed(0)}/100`, theme.green);
    ui.buttonAction('advance-day', { x: 1156, y: 12, w: 96, h: 40 }, this.busy ? '计算中…' : '推进一天 ▶', () => void this.advanceDay(), {
      variant: 'primary',
      disabled: this.busy,
      fontSize: 13.5,
    });
    ui.buttonAction('open-shop', { x: 1260, y: 12, w: 90, h: 40 }, '📦 采购', () => this.openShop(), { variant: 'gold', fontSize: 13.5 });
  }

  private renderToast(): void {
    if (!this.toast || this.time - this.toast.at > 4300) return;
    const age = this.time - this.toast.at;
    const alpha = age < 220 ? age / 220 : age > 3700 ? Math.max(0, (4300 - age) / 600) : 1;
    const ui = this.ui;
    const w = 1040;
    const x = (DESIGN_W - w) / 2;
    const y = 810;
    const color = this.toast.kind === 'error' ? theme.red : this.toast.kind === 'success' ? theme.green : theme.copper;
    ui.ctx.save();
    ui.ctx.globalAlpha = alpha * 0.96;
    ui.roundRect(x, y, w, 40, 13);
    ui.ctx.fillStyle = withAlpha('#21170f', 0.96);
    ui.ctx.fill();
    ui.ctx.strokeStyle = withAlpha(color, 0.75);
    ui.ctx.lineWidth = 1.5;
    ui.ctx.stroke();
    ui.ctx.restore();
    ui.text(this.toast.message, x + 20, y + 21, { size: 13.5, weight: 750, color: theme.text, baseline: 'middle' });
  }
}

export function mountGame(canvas: HTMLCanvasElement): GameApp {
  return new GameApp(canvas);
}

void FONT;
