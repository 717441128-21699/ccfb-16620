import { YEASTS, styleById, yeastById } from '../../data/ingredients';
import { clamp } from '../../game/formulas';
import type { Fermenter } from '../../types';
import { theme, withAlpha } from '../theme';
import type { GameApp } from '../app';

const STATUS_META: Record<Fermenter['status'], { label: string; color: string }> = {
  empty: { label: '空罐', color: theme.faint },
  fermenting: { label: '发酵中', color: theme.green },
  conditioning: { label: '熟成中', color: theme.purple },
  ready: { label: '可出罐', color: theme.gold },
  dirty: { label: '待清洗', color: theme.red },
};

function sparkline(app: GameApp, tank: Fermenter, x: number, y: number, w: number, h: number): void {
  const batch = tank.batch;
  if (!batch || batch.history.length < 2) return;
  const ctx = app.ui.ctx;
  const values = batch.history.map((p) => p.abv);
  const max = Math.max(1, ...values);
  ctx.save();
  ctx.beginPath();
  values.forEach((v, i) => {
    const px = x + (i / Math.max(1, values.length - 1)) * w;
    const py = y + h - (v / max) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = withAlpha(theme.gold, 0.9);
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fillStyle = withAlpha(theme.gold, 0.12);
  ctx.fill();
  ctx.restore();
}

function tankCard(app: GameApp, tank: Fermenter, x: number, y: number, w: number, h: number): void {
  const ui = app.ui;
  const selected = app.selectedTankId === tank.id;
  const meta = STATUS_META[tank.status];
  const { hover } = ui.region(`tank-${tank.id}`, { x, y, w, h }, { onActivate: () => app.selectTank(tank.id) });
  ui.panel({ x, y, w, h }, undefined, { accent: selected ? theme.copper : undefined });
  ui.text(tank.name, x + 14, y + 24, { size: 15, weight: 950 });
  ui.tag(x + w - 76, y + 10, meta.label, meta.color, 62);

  if (!tank.batch) {
    ui.text(tank.status === 'dirty' ? '清洗后可排期' : '可装入麦汁', x + 14, y + 58, { size: 13, color: theme.muted });
    ui.text(`容量 ${tank.capacityL}L`, x + 14, y + 82, { size: 11.5, color: theme.faint, font: 'num' });
    if (app.state.queuedWorts.length > 0 && tank.status === 'empty') {
      ui.tag(x + 14, y + 92, `${app.state.queuedWorts.length} 锅等待`, theme.copper);
    }
  } else {
    const b = tank.batch;
    const progress = clamp((b.og - b.gravity) / Math.max(0.001, b.og - b.fgTarget), 0, 1);
    ui.text(ui.truncate(b.name, 132, 12.5, 850), x + 14, y + 47, { size: 12.5, weight: 850, color: theme.text });
    ui.text(`${b.actualTempC.toFixed(1)}°C`, x + 14, y + 72, {
      size: 18,
      weight: 950,
      color: b.actualTempC > yeastById(b.yeastId).optHighC ? theme.red : theme.blue,
      font: 'num',
    });
    ui.text(`第${b.dayOfFerment}天`, x + 92, y + 70, { size: 12, color: theme.muted, font: 'num' });
    ui.text(`${b.abv.toFixed(1)}%`, x + w - 14, y + 70, { size: 17, weight: 950, color: theme.gold, align: 'right', font: 'num' });
    ui.progress(x + 14, y + 88, w - 28, 8, progress, progress > 0.92 ? theme.purple : theme.green);
    ui.text(`OG ${b.og.toFixed(3)} → ${b.gravity.toFixed(3)}`, x + 14, y + 112, { size: 10.5, color: theme.faint, font: 'num' });
    sparkline(app, tank, x + w - 82, y + 94, 68, 20);
  }

  if (hover) {
    ui.ctx.save();
    ui.roundRect(x + 1, y + 1, w - 2, h - 2, 15);
    ui.ctx.strokeStyle = withAlpha(theme.copperBright, 0.55);
    ui.ctx.lineWidth = 2;
    ui.ctx.stroke();
    ui.ctx.restore();
  }
}

function metricBox(app: GameApp, x: number, y: number, w: number, h: number, label: string, value: string, color = theme.text): void {
  const ui = app.ui;
  ui.roundRect(x, y, w, h, 10);
  ui.ctx.fillStyle = withAlpha(theme.bg0, 0.36);
  ui.ctx.fill();
  ui.text(label, x + 10, y + 17, { size: 10.5, color: theme.faint, weight: 700 });
  ui.text(value, x + 10, y + 39, { size: 16, weight: 950, color, font: 'num' });
}

function byproductBar(app: GameApp, x: number, y: number, w: number, label: string, value: number, max: number, unit: string, dangerAt: number): void {
  const ui = app.ui;
  const color = value > dangerAt ? theme.red : value > dangerAt * 0.72 ? theme.gold : theme.green;
  ui.text(label, x, y, { size: 11.5, weight: 750, color: theme.muted });
  ui.text(`${value.toFixed(1)}${unit}`, x + w, y, { size: 11.5, weight: 900, color, align: 'right', font: 'num' });
  ui.progress(x, y + 8, w, 7, clamp(value / max, 0, 1), color);
}

function renderInspector(app: GameApp): void {
  const ui = app.ui;
  const tank = app.state.fermenters.find((t) => t.id === app.selectedTankId) ?? app.state.fermenters[0];
  ui.panel({ x: 940, y: 72, w: 410, h: 724 }, '发酵罐检查器');
  if (!tank) {
    ui.text('请先新增发酵罐', 960, 130, { color: theme.muted });
    return;
  }

  const viewport = { x: 952, y: 112, w: 386, h: 666 };
  const contentH = tank.batch ? 760 : 430 + app.state.queuedWorts.length * 82;
  const offset = ui.beginScroll('tank-inspector', viewport, contentH);
  let y = 126 - offset;
  ui.text(tank.name, 964, y, { size: 22, weight: 950 });
  ui.tag(1058, y - 18, STATUS_META[tank.status].label, STATUS_META[tank.status].color);
  ui.text(`${tank.capacityL}L 锥形发酵罐 · 编号 ${tank.id.slice(-5)}`, 964, y + 24, { size: 11.5, color: theme.faint });
  y += 48;

  if (tank.status === 'dirty') {
    ui.paragraph('上一批酒已经放出，罐底有酵母泥和残液。装下一批前需要执行 CIP 清洗。', 964, y, 354, {
      size: 13,
      lineHeight: 19,
      color: theme.muted,
    });
    ui.buttonAction('clean-tank', { x: 964, y: y + 70, w: 354, h: 48 }, '🧽 清洗并转为空罐', () => app.cleanTank(tank.id), {
      variant: 'primary',
    });
  } else if (!tank.batch) {
    ui.text('等待装罐的麦汁', 964, y, { size: 15, weight: 900 });
    y += 16;
    if (app.state.queuedWorts.length === 0) {
      ui.paragraph('麦汁队列是空的。先到酿造台完成糖化、洗槽和煮沸。', 964, y + 14, 354, { size: 13, lineHeight: 19, color: theme.muted });
      ui.buttonAction('insp-brew', { x: 964, y: y + 82, w: 354, h: 46 }, '去酿造台', () => app.setPage('brewhouse'), { variant: 'gold' });
    }
    app.state.queuedWorts.forEach((q) => {
      const rect = { x: 964, y: y + 14, w: 354, h: 72 };
      ui.roundRect(rect.x, rect.y, rect.w, rect.h, 12);
      ui.ctx.fillStyle = withAlpha(theme.panel3, 0.72);
      ui.ctx.fill();
      ui.text(ui.truncate(q.name, 210, 14, 900), rect.x + 14, rect.y + 24, { size: 14, weight: 900 });
      ui.text(`${q.volumeL}L · ${q.wort.plato.toFixed(1)}°P · ${q.wort.ibu.toFixed(0)}IBU · ${q.targetTempC}°C`, rect.x + 14, rect.y + 47, {
        size: 11.5,
        color: theme.muted,
        font: 'num',
      });
      ui.buttonAction(`assign-${q.id}`, { x: rect.x + 250, y: rect.y + 18, w: 90, h: 36 }, '装入', () => app.assignWort(tank.id, q.id), {
        variant: 'success',
      });
      y += 82;
    });
  } else {
    const b = tank.batch;
    const yeast = yeastById(b.yeastId);
    ui.text(ui.truncate(b.name, 300, 17, 950), 964, y, { size: 17, weight: 950, color: theme.copperBright });
    ui.text(`${styleById(b.styleId).name} · ${yeast.name}`, 964, y + 24, { size: 12, color: theme.muted });
    y += 44;

    ui.slider(
      `setpoint-${tank.id}`,
      964,
      y,
      354,
      '罐温设定 / 发酵温度',
      tank.setpointC,
      yeast.kind === 'lager' ? 6 : 12,
      yeast.kind === 'lager' ? 22 : 36,
      0.5,
      (v) => app.setTankSetpoint(tank.id, v),
      (v) => `${v.toFixed(1)}°C`,
      tank.setpointC > yeast.optHighC ? theme.red : theme.green,
    );
    y += 58;
    const tempWarning = tank.setpointC > yeast.optHighC;
    ui.paragraph(
      tempWarning
        ? `高于酵母适温上限 ${yeast.optHighC}°C：繁殖加快，但酯类/杂醇会快速积累。`
        : `适温区间 ${yeast.optLowC}–${yeast.optHighC}°C；实际罐温有热惯性，当前 ${b.actualTempC.toFixed(1)}°C。`,
      964,
      y,
      354,
      { size: 11.5, lineHeight: 16, color: tempWarning ? theme.red : theme.muted, maxLines: 2 },
    );
    y += 42;

    const boxW = 112;
    metricBox(app, 964, y, boxW, 56, '酒精度', `${b.abv.toFixed(2)}%`, theme.gold);
    metricBox(app, 1085, y, boxW, 56, '比重', b.gravity.toFixed(4), theme.text);
    metricBox(app, 1206, y, boxW, 56, '健康度', `${b.health.toFixed(0)}`, b.health < 75 ? theme.red : theme.green);
    y += 66;
    metricBox(app, 964, y, boxW, 56, '剩余糖', `${b.sugarKg.toFixed(1)}kg`, theme.blue);
    metricBox(app, 1085, y, boxW, 56, '酵母量', b.biomass.toFixed(2), theme.purple);
    metricBox(app, 1206, y, boxW, 56, '双乙酰', b.diacetylPpm.toFixed(2), b.diacetylPpm > 0.5 ? theme.red : theme.green);
    y += 76;

    ui.text('发酵曲线（酒精度 / 天）', 964, y, { size: 13, weight: 900 });
    y += 10;
    const chartRect = { x: 964, y, w: 354, h: 128 };
    ui.panel(chartRect);
    const ctx = ui.ctx;
    ctx.save();
    ctx.strokeStyle = withAlpha(theme.borderSoft, 0.8);
    for (let i = 1; i < 4; i++) {
      const gy = chartRect.y + 12 + (i / 4) * (chartRect.h - 24);
      ctx.beginPath();
      ctx.moveTo(chartRect.x + 30, gy);
      ctx.lineTo(chartRect.x + chartRect.w - 12, gy);
      ctx.stroke();
    }
    if (b.history.length > 1) {
      const maxAbv = Math.max(1, b.abv, ...b.history.map((h) => h.abv));
      ctx.beginPath();
      b.history.forEach((p, i) => {
        const px = chartRect.x + 34 + (i / 29) * (chartRect.w - 48);
        const py = chartRect.y + chartRect.h - 18 - (p.abv / maxAbv) * (chartRect.h - 34);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = theme.gold;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
    ui.text('0', chartRect.x + 16, chartRect.y + chartRect.h - 16, { size: 10, color: theme.faint });
    ui.text(`${b.abv.toFixed(1)}%`, chartRect.x + chartRect.w - 16, chartRect.y + 18, { size: 11, color: theme.gold, align: 'right' });
    y += 146;

    ui.text('副产物与风味风险', 964, y, { size: 14, weight: 900 });
    y += 18;
    byproductBar(app, 964, y, 354, '酯类', b.estersPpm, 90, 'ppm', 62);
    y += 34;
    byproductBar(app, 964, y, 354, '杂醇', b.fuselPpm, 110, 'ppm', 58);
    y += 34;
    byproductBar(app, 964, y, 354, '酚类', b.phenolsPpm, 45, 'ppm', 24);
    y += 42;

    ui.buttonAction(
      `package-${tank.id}`,
      { x: 964, y, w: 354, h: 50 },
      b.dayOfFerment < 3 ? '提前放出（可能青嫩）' : '🍺 结束发酵并装瓶/上枪',
      () => app.packageTank(tank.id),
      { variant: b.dayOfFerment < 3 ? 'gold' : 'success', fontSize: 14.5 },
    );
    y += 62;
    ui.paragraph('装瓶时会按实际 ABV、IBU、EBC、酯类/杂醇/双乙酰和酒体匹配风格评分。', 964, y, 354, {
      size: 11.5,
      lineHeight: 17,
      color: theme.faint,
    });
  }
  ui.endScroll('tank-inspector', viewport, contentH);
}

export function renderFermenters(app: GameApp): void {
  const ui = app.ui;
  const active = app.state.fermenters.filter((t) => t.batch).length;
  const conditioning = app.state.fermenters.filter((t) => t.status === 'conditioning').length;
  const dirty = app.state.fermenters.filter((t) => t.status === 'dirty').length;

  ui.panel({ x: 16, y: 72, w: 908, h: 52 });
  ui.text(`罐数 ${app.state.fermenters.length}/20`, 34, 104, { size: 14, weight: 900 });
  ui.text(`在酵 ${active}`, 132, 104, { size: 14, weight: 850, color: theme.green });
  ui.text(`熟成 ${conditioning}`, 220, 104, { size: 14, weight: 850, color: theme.purple });
  ui.text(`待洗 ${dirty}`, 318, 104, { size: 14, weight: 850, color: dirty ? theme.red : theme.faint });
  const workerMs = app.state.lastWorkerMs;
  ui.text(
    workerMs === null ? 'Worker 尚未推进' : `上次20罐/全部日计算 ${workerMs.toFixed(2)}ms`,
    402,
    104,
    { size: 12.5, color: workerMs !== null && workerMs <= 30 ? theme.green : theme.red, font: 'num' },
  );
  ui.buttonAction(
    'benchmark-20',
    { x: 748, y: 82, w: 160, h: 32 },
    app.benchmarking ? '压测中…' : '⚡ 20罐性能压测',
    () => app.runBenchmark(),
    { variant: 'primary', disabled: app.benchmarking, fontSize: 12.5 },
  );

  app.state.fermenters.forEach((tank, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    tankCard(app, tank, 16 + col * 229, 136 + row * 130, 221, 122);
  });

  if (app.state.fermenters.length < 20) {
    const i = app.state.fermenters.length;
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 16 + col * 229;
    const y = 136 + row * 130;
    const { hover } = ui.region('buy-tank-card', { x, y, w: 221, h: 122 }, { onActivate: () => app.buyTank() });
    ui.panel({ x, y, w: 221, h: 122 }, undefined, { accent: theme.green });
    ui.text('＋', x + 110, y + 48, { size: 34, weight: 400, color: theme.green, align: 'center' });
    ui.text('新增 240L 发酵罐', x + 110, y + 82, { size: 13.5, weight: 900, align: 'center' });
    ui.text(`¥${(2600 + app.state.fermenters.length * 180).toFixed(0)}`, x + 110, y + 104, {
      size: 13,
      weight: 900,
      color: theme.gold,
      align: 'center',
    });
    if (hover) ui.ctx.canvas.style.cursor = 'pointer';
  }

  if (app.benchmark) {
    const b = app.benchmark;
    const ok = b.perDayMs <= 30;
    ui.text(
      `压测：${b.tanks}罐 × ${b.days}日，总 ${b.totalMs.toFixed(1)}ms，每个游戏日 ${b.perDayMs.toFixed(2)}ms — ${ok ? '达标 ≤30ms' : '未达标'}`,
      18,
      790,
      { size: 12.5, weight: 850, color: ok ? theme.green : theme.red, font: 'num' },
    );
  } else {
    ui.text('多罐发酵在 Web Worker 中按24个小时子步计算；推进一天会同时结算所有罐。', 18, 790, {
      size: 12,
      color: theme.faint,
    });
  }

  renderInspector(app);
  void YEASTS.length;
}
