import { MALTS, YEASTS, hopById, maltById, styleById, yeastById } from '../../data/ingredients';
import { checkIngredients } from '../../game/engine';
import { betaEnzymeWork, clamp, computeWort, alphaEnzymeWork } from '../../game/formulas';
import type { Recipe } from '../../types';
import { theme, withAlpha } from '../theme';
import type { GameApp } from '../app';

const PAGE_Y = 72;
const PAGE_H = 724;

function brewRecipeView(app: GameApp): Recipe {
  const base = app.state.recipes.find((r) => r.id === app.selectedRecipeId) ?? app.state.recipes[0];
  return {
    ...structuredClone(base),
    mashTempC: app.brewMashTemp,
    mashMin: app.brewMashMin,
    fermTempC: app.brewFermTemp,
  };
}

function drawEnzymeChart(app: GameApp, x: number, y: number, w: number, h: number): void {
  const ui = app.ui;
  const ctx = ui.ctx;
  ui.panel({ x, y, w, h }, undefined);
  const padL = 34;
  const padR = 12;
  const padT = 16;
  const padB = 24;
  const cx = x + padL;
  const cy = y + padT;
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  const tMin = 60;
  const tMax = 74;
  const xTemp = (t: number) => cx + ((t - tMin) / (tMax - tMin)) * cw;
  const yVal = (v: number) => cy + ch - clamp(v / 1.25, 0, 1) * ch;

  ctx.save();
  ctx.strokeStyle = withAlpha(theme.border, 0.55);
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = cy + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(cx, gy);
    ctx.lineTo(cx + cw, gy);
    ctx.stroke();
  }
  [60, 63, 66, 70, 74].forEach((t) => {
    ui.text(`${t}`, xTemp(t), y + h - 7, { size: 10.5, color: theme.faint, align: 'center', font: 'num' });
  });
  ui.text('酶活', x + 8, y + 14, { size: 10.5, color: theme.faint });

  const drawCurve = (fn: (t: number) => number, color: string) => {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = tMin + ((tMax - tMin) * i) / 120;
      const v = fn(t);
      const px = xTemp(t);
      const py = yVal(v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
  };
  drawCurve((t) => betaEnzymeWork(t, app.brewMashMin), theme.blue);
  drawCurve((t) => alphaEnzymeWork(t, app.brewMashMin), theme.gold);

  const currentX = xTemp(app.brewMashTemp);
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = theme.copperBright;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(currentX, cy);
  ctx.lineTo(currentX, cy + ch);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ui.text('β-淀粉酶', x + w - 150, y + 18, { size: 11.5, weight: 800, color: theme.blue });
  ui.text('切出可发酵糖', x + w - 150, y + 34, { size: 10.5, color: theme.faint });
  ui.text('α-淀粉酶', x + w - 78, y + 18, { size: 11.5, weight: 800, color: theme.gold });
  ui.text('留下糊精', x + w - 78, y + 34, { size: 10.5, color: theme.faint });
}

function recipeCard(app: GameApp, r: Recipe, x: number, y: number, w: number, h: number): void {
  const ui = app.ui;
  const selected = r.id === app.selectedRecipeId;
  const req = checkIngredients(app.state, r);
  const view = computeWort(r);
  const { hover } = ui.region(`bh-card-${r.id}`, { x, y, w, h }, { onActivate: () => app.selectBrewhouseRecipe(r.id) });
  ui.panel(
    {
      x,
      y,
      w,
      h,
    },
    undefined,
    { accent: selected ? theme.copper : undefined },
  );
  if (selected) {
    ui.ctx.save();
    ui.roundRect(x, y, 4, h, 2);
    ui.ctx.fillStyle = theme.copper;
    ui.ctx.fill();
    ui.ctx.restore();
  }
  ui.text(ui.truncate(r.name, w - 24, 14.5, 850), x + 14, y + 24, { size: 14.5, weight: 850 });
  ui.text(styleById(r.styleId).name, x + 14, y + 45, { size: 11.5, color: theme.muted });
  ui.text(`${view.abv.toFixed(1)}%`, x + w - 14, y + 24, { size: 15, weight: 900, color: theme.gold, align: 'right', font: 'num' });
  ui.text(`${view.ibu.toFixed(0)} IBU`, x + w - 14, y + 45, { size: 11.5, color: theme.copperBright, align: 'right', font: 'num' });
  ui.progress(x + 14, y + h - 22, w - 28, 16, 1, req.ok ? theme.green : theme.red, req.ok ? '原料充足' : '原料不足');
  if (hover) {
    ui.ctx.save();
    ui.roundRect(x + 1, y + 1, w - 2, h - 2, 15);
    ui.ctx.strokeStyle = withAlpha(theme.copperBright, 0.5);
    ui.ctx.lineWidth = 2;
    ui.ctx.stroke();
    ui.ctx.restore();
  }
}

function statBox(app: GameApp, x: number, y: number, w: number, h: number, label: string, value: string, color = theme.text): void {
  const ui = app.ui;
  ui.roundRect(x, y, w, h, 12);
  ui.ctx.fillStyle = withAlpha(theme.bg0, 0.34);
  ui.ctx.fill();
  ui.text(label, x + 12, y + 20, { size: 11.5, color: theme.faint, weight: 700 });
  ui.text(value, x + 12, y + 45, { size: 19, weight: 950, color, font: 'num' });
}

export function renderBrewhouse(app: GameApp): void {
  const ui = app.ui;
  const state = app.state;
  const recipe = brewRecipeView(app);
  const wort = computeWort(recipe);
  const req = checkIngredients(state, recipe);
  const yeast = yeastById(recipe.yeastId);

  // Left: recipe list.
  ui.panel({ x: 16, y: PAGE_Y, w: 286, h: PAGE_H }, '配方 / 出酒计划');
  state.recipes.forEach((r, i) => recipeCard(app, r, 32, 116 + i * 76, 254, 68));
  ui.buttonAction('bh-goto-lab', { x: 32, y: 748, w: 254, h: 38 }, '＋ 新建 / 实验配方', () => app.setPage('lab'), {
    variant: 'primary',
  });

  // Middle: mash and kettle.
  ui.panel({ x: 318, y: PAGE_Y, w: 424, h: 356 }, '糖化锅 · 双淀粉酶');
  ui.slider('bh-temp', 338, 104, 384, '糖化温度', app.brewMashTemp, 62, 72, 0.5, (v) => {
    app.brewMashTemp = v;
  }, (v) => `${v.toFixed(1)}°C`, theme.red);
  ui.slider('bh-mash-time', 338, 154, 384, '糖化停留', app.brewMashMin, 30, 90, 5, (v) => {
    app.brewMashMin = v;
  }, (v) => `${v.toFixed(0)} 分钟`, theme.gold);
  drawEnzymeChart(app, 338, 202, 384, 126);
  const betaMax = Math.max(0.001, wort.betaWork + wort.alphaWork * 0.2);
  ui.text(`β 工作值 ${wort.betaWork.toFixed(1)}`, 340, 350, { size: 11.5, weight: 800, color: theme.blue, font: 'num' });
  ui.progress(438, 340, 126, 9, clamp(wort.betaWork / betaMax, 0, 1), theme.blue);
  ui.text(`α 工作值 ${wort.alphaWork.toFixed(1)}`, 340, 376, { size: 11.5, weight: 800, color: theme.gold, font: 'num' });
  ui.progress(438, 366, 126, 9, clamp(wort.alphaWork / Math.max(0.001, wort.betaWork + wort.alphaWork), 0, 1), theme.gold);
  ui.paragraph(
    app.brewMashTemp <= 65
      ? '低温休息：β淀粉酶切出大量麦芽糖，发酵度高、酒体爽干。'
      : app.brewMashTemp >= 68.5
        ? '高温休息：β酶快速失活，α酶留下更多糊精，酒体厚但酒精度略低。'
        : '中间温度：可发酵糖与糊精较平衡。',
    578,
    342,
    145,
    { size: 11.5, lineHeight: 16, color: theme.muted, maxLines: 4 },
  );

  ui.panel({ x: 318, y: 444, w: 424, h: 352 }, '煮沸锅 · Tinseth 苦度');
  ui.text(`${wort.ibu.toFixed(1)} IBU`, 722, 471, { size: 20, weight: 950, color: theme.gold, align: 'right', font: 'num' });
  const hopViewport = { x: 334, y: 494, w: 392, h: 246 };
  const hopContentH = Math.max(hopViewport.h, wort.hopDetails.length * 62 + 8);
  const hopOffset = ui.beginScroll('bh-hops', hopViewport, hopContentH);
  wort.hopDetails.forEach((detail, i) => {
    const y = hopViewport.y + 6 + i * 60 - hopOffset;
    const hop = hopById(detail.hopId);
    ui.roundRect(342, y, 366, 52, 11);
    ui.ctx.fillStyle = withAlpha(theme.bg0, 0.32);
    ui.ctx.fill();
    ui.text(ui.truncate(hop.name, 150, 13, 850), 354, y + 20, { size: 13, weight: 850 });
    ui.text(`${detail.grams}g · ${detail.boilMin}min · α ${hop.alphaAcid}%`, 354, y + 39, { size: 11, color: theme.faint, font: 'num' });
    ui.text(`+${detail.ibu.toFixed(1)}`, 696, y + 20, { size: 15, weight: 950, color: theme.gold, align: 'right', font: 'num' });
    ui.progress(566, y + 32, 92, 7, clamp(detail.utilization / 0.26, 0, 1), theme.copper);
    ui.text(`U ${(detail.utilization * 100).toFixed(1)}%`, 654, y + 48, { size: 9.5, color: theme.faint, align: 'right', font: 'num' });
  });
  ui.endScroll('bh-hops', hopViewport, hopContentH);
  ui.text('IBU = α小数 × oz × 7490 × U / gal；U含OG与煮沸时间因子', 338, 766, { size: 10.5, color: theme.faint });

  // Right: recipe stats and brewing action.
  ui.panel({ x: 758, y: PAGE_Y, w: 592, h: 382 });
  ui.text(recipe.name, 778, 103, { size: 22, weight: 950 });
  ui.tag(778, 116, styleById(recipe.styleId).name, theme.copper);
  ui.paragraph(styleById(recipe.styleId).description, 890, 116, 438, { size: 12.5, color: theme.muted, maxLines: 2 });

  const stats: Array<[string, string, string?]> = [
    ['原始比重 OG', wort.og.toFixed(4), theme.gold],
    ['终点比重 FG', wort.fg.toFixed(4)],
    ['预测酒精度', `${wort.abv.toFixed(2)}%`, theme.copperBright],
    ['可发酵度', `${(wort.fermentability * 100).toFixed(1)}%`, theme.green],
    ['苦度 IBU', wort.ibu.toFixed(1), theme.gold],
    ['色度 EBC', wort.ebc.toFixed(0), wort.ebc > 70 ? theme.text : theme.copperBright],
    ['酒体指数', wort.bodyIndex.toFixed(2), theme.purple],
    ['原料成本', `¥${wort.cost.toFixed(0)}`, theme.green],
  ];
  stats.forEach(([label, value, color], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    statBox(app, 778 + col * 140, 154 + row * 68, 130, 58, label, value, color);
  });

  ui.text('麦芽配比', 778, 306, { size: 13.5, weight: 850, color: theme.text });
  const maltText = recipe.bill
    .map((item) => {
      const m = maltById(item.maltId);
      return `${m.name} ${item.kg}kg`;
    })
    .join('、');
  ui.paragraph(maltText, 778, 318, 276, { size: 11.5, lineHeight: 16, color: theme.muted, maxLines: 4 });

  ui.text('酒花/酵母', 1074, 306, { size: 13.5, weight: 850, color: theme.text });
  const hopText = recipe.hops.map((h) => `${hopById(h.hopId).name} ${h.grams}g@${h.boilMin}′`).join('、');
  ui.paragraph(`${hopText}。酵母：${yeast.name}（表观衰减 ${(yeast.attenuation * 100).toFixed(0)}%）`, 1074, 318, 256, {
    size: 11.5,
    lineHeight: 16,
    color: theme.muted,
    maxLines: 5,
  });

  ui.panel({ x: 758, y: 470, w: 592, h: 326 }, '本班投料与装罐');
  ui.slider('bh-ferm-temp', 778, 516, 280, '发酵预设温度', app.brewFermTemp, 6, 36, 0.5, (v) => {
    app.brewFermTemp = v;
  }, (v) => `${v.toFixed(1)}°C`, app.brewFermTemp > yeast.optHighC ? theme.red : app.brewFermTemp < yeast.optLowC ? theme.blue : theme.green);
  ui.roundRect(1080, 510, 250, 62, 12);
  ui.ctx.fillStyle = withAlpha(theme.bg0, 0.34);
  ui.ctx.fill();
  ui.text(yeast.name, 1094, 532, { size: 12.5, weight: 850 });
  ui.text(`适温 ${yeast.optLowC}–${yeast.optHighC}°C`, 1094, 553, {
    size: 11.5,
    color: app.brewFermTemp > yeast.optHighC ? theme.red : theme.green,
    font: 'num',
  });

  if (req.ok) {
    ui.text('库存校验通过：麦芽、酒花与酵母均可投料。', 778, 594, { size: 12.5, weight: 700, color: theme.green });
  } else {
    ui.paragraph(`缺料：${req.missing.join('；')}`, 778, 586, 540, { size: 12, lineHeight: 16, color: theme.red, maxLines: 2 });
  }
  ui.text(`麦汁队列 ${state.queuedWorts.length} 锅 · 空罐 ${state.fermenters.filter((f) => !f.batch && f.status === 'empty').length} 个 · 总罐 ${state.fermenters.length}/20`, 778, 632, {
    size: 12.5,
    color: theme.muted,
  });
  const queueText = state.queuedWorts.slice(0, 2).map((q) => `${q.name}（${q.volumeL}L）`).join('；');
  if (queueText) ui.text(`待装罐：${queueText}`, 778, 654, { size: 11.5, color: theme.copperBright });

  ui.buttonAction(
    'bh-brew',
    { x: 778, y: 724, w: 250, h: 52 },
    app.busy ? 'Worker计算中…' : '🔥 投料酿造',
    () => app.brewCurrent(),
    { variant: 'primary', disabled: !req.ok || app.busy, fontSize: 16 },
  );
  ui.buttonAction('bh-shop', { x: 1044, y: 724, w: 132, h: 52 }, '原料采购', () => app.openShop(), { variant: 'gold' });
  ui.buttonAction('bh-tanks', { x: 1190, y: 724, w: 140, h: 52 }, '发酵罐排期', () => app.setPage('fermenters'), { variant: 'success' });

  // Tiny inventory reminder at lower left middle? Ensure MALTS/YEASTS imports used for type guards/data exploration.
  void MALTS.length;
  void YEASTS.length;
}
