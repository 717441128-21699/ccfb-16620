import { HOPS, MALTS, STYLES, YEASTS, hopById, maltById } from '../../data/ingredients';
import { computeWort, tinsethUtilization } from '../../game/formulas';
import type { HopAddition, MaltBillItem } from '../../types';
import { theme, withAlpha } from '../theme';
import type { GameApp } from '../app';

const BOIL_TIMES = [0, 5, 10, 20, 30, 45, 60, 75, 90];

function cycleId(current: string, ids: Array<{ id: string }>, dir: number): string {
  const i = ids.findIndex((x) => x.id === current);
  return ids[(i + dir + ids.length) % ids.length].id;
}

function sectionTitle(app: GameApp, text: string, x: number, y: number, action?: string): void {
  app.ui.text(text, x, y, { size: 14.5, weight: 950, color: theme.text });
  if (action) app.ui.text(action, x + 112, y, { size: 11, color: theme.faint });
}

function renderLeftList(app: GameApp): void {
  const ui = app.ui;
  ui.panel({ x: 16, y: 72, w: 252, h: 724 }, '实验配方');
  const viewport = { x: 24, y: 108, w: 236, h: 620 };
  const contentH = app.state.recipes.length * 68 + 8;
  const offset = ui.beginScroll('lab-list', viewport, contentH);
  app.state.recipes.forEach((r, i) => {
    const y = 116 + i * 68 - offset;
    const selected = app.labDraft.id === r.id;
    const { hover } = ui.region(`lab-select-${r.id}`, { x: 32, y, w: 220, h: 60 }, { onActivate: () => app.selectLabRecipe(r.id) });
    ui.roundRect(32, y, 220, 60, 12);
    ui.ctx.fillStyle = selected ? withAlpha(theme.copper, 0.22) : withAlpha(theme.bg0, 0.3);
    ui.ctx.fill();
    ui.ctx.strokeStyle = selected ? theme.copper : withAlpha(theme.borderSoft, 0.7);
    ui.ctx.lineWidth = 1.5;
    ui.ctx.stroke();
    const w = computeWort(r);
    ui.text(ui.truncate(r.name, 150, 13.5, 900), 44, y + 24, { size: 13.5, weight: 900 });
    ui.text(`${w.abv.toFixed(1)}% · ${w.ibu.toFixed(0)}IBU · ${STYLES.find((s) => s.id === r.styleId)?.name ?? ''}`, 44, y + 45, {
      size: 10.5,
      color: theme.muted,
      font: 'num',
    });
    if (hover && !selected) {
      ui.ctx.strokeStyle = withAlpha(theme.copperBright, 0.45);
      ui.ctx.stroke();
    }
  });
  ui.endScroll('lab-list', viewport, contentH);
  ui.buttonAction('lab-new', { x: 32, y: 742, w: 68, h: 38 }, '新建', () => app.newLabRecipe(), { variant: 'primary', fontSize: 12.5 });
  ui.buttonAction('lab-copy', { x: 108, y: 742, w: 68, h: 38 }, '复制', () => app.duplicateLabRecipe(), { fontSize: 12.5 });
  ui.buttonAction('lab-delete', { x: 184, y: 742, w: 68, h: 38 }, '删除', () => app.deleteLabRecipe(), { variant: 'danger', fontSize: 12.5 });
}

function renderMaltRow(app: GameApp, item: MaltBillItem, index: number, y: number): number {
  const ui = app.ui;
  const x = 306;
  const w = 446;
  ui.roundRect(x, y, w, 54, 11);
  ui.ctx.fillStyle = withAlpha(theme.bg0, 0.34);
  ui.ctx.fill();
  ui.buttonAction(`malt-prev-${index}`, { x: x + 8, y: y + 14, w: 26, h: 26 }, '‹', () => {
    item.maltId = cycleId(item.maltId, MALTS, -1);
  }, { fontSize: 18 });
  ui.text(ui.truncate(maltById(item.maltId).name, 112, 12.5, 850), x + 40, y + 24, { size: 12.5, weight: 850 });
  ui.text(`EBC ${maltById(item.maltId).colorEBC}`, x + 40, y + 42, { size: 10, color: theme.faint, font: 'num' });
  ui.buttonAction(`malt-next-${index}`, { x: x + 158, y: y + 14, w: 26, h: 26 }, '›', () => {
    item.maltId = cycleId(item.maltId, MALTS, 1);
  }, { fontSize: 18 });
  ui.buttonAction(`malt-minus-${index}`, { x: x + 205, y: y + 14, w: 28, h: 26 }, '−', () => {
    item.kg = Math.max(0.5, Math.round((item.kg - 1) * 10) / 10);
  });
  ui.text(`${item.kg.toFixed(1)}kg`, x + 267, y + 32, { size: 12.5, weight: 950, align: 'center', font: 'num' });
  ui.buttonAction(`malt-plus-${index}`, { x: x + 300, y: y + 14, w: 28, h: 26 }, '＋', () => {
    item.kg = Math.min(90, Math.round((item.kg + 1) * 10) / 10);
  });
  ui.buttonAction(`malt-del-${index}`, { x: x + 400, y: y + 14, w: 36, h: 26 }, '✕', () => {
    app.labDraft.bill.splice(index, 1);
  }, { variant: 'danger', fontSize: 11 });
  return 60;
}

function renderHopRow(app: GameApp, item: HopAddition, index: number, y: number): number {
  const ui = app.ui;
  const x = 306;
  const w = 446;
  ui.roundRect(x, y, w, 62, 11);
  ui.ctx.fillStyle = withAlpha(theme.bg0, 0.34);
  ui.ctx.fill();
  ui.buttonAction(`hop-prev-${index}`, { x: x + 8, y: y + 18, w: 26, h: 26 }, '‹', () => {
    item.hopId = cycleId(item.hopId, HOPS, -1);
  }, { fontSize: 18 });
  ui.text(ui.truncate(hopById(item.hopId).name, 104, 12.5, 850), x + 40, y + 25, { size: 12.5, weight: 850 });
  ui.text(`α ${hopById(item.hopId).alphaAcid}%`, x + 40, y + 44, { size: 10, color: theme.faint, font: 'num' });
  ui.buttonAction(`hop-next-${index}`, { x: x + 150, y: y + 18, w: 26, h: 26 }, '›', () => {
    item.hopId = cycleId(item.hopId, HOPS, 1);
  }, { fontSize: 18 });
  ui.buttonAction(`hop-minus-${index}`, { x: x + 190, y: y + 8, w: 26, h: 22 }, '−', () => {
    item.grams = Math.max(0, item.grams - 10);
  }, { fontSize: 11 });
  ui.text(`${item.grams}g`, x + 244, y + 24, { size: 12, weight: 950, align: 'center', font: 'num' });
  ui.buttonAction(`hop-plus-${index}`, { x: x + 272, y: y + 8, w: 26, h: 22 }, '＋', () => {
    item.grams = Math.min(1200, item.grams + 10);
  }, { fontSize: 11 });
  ui.buttonAction(`hop-time-${index}`, { x: x + 190, y: y + 34, w: 108, h: 22 }, `${item.boilMin} 分钟`, () => {
    const i = BOIL_TIMES.indexOf(item.boilMin);
    item.boilMin = BOIL_TIMES[(i + 1) % BOIL_TIMES.length];
  }, { fontSize: 11.5 });
  ui.buttonAction(`hop-del-${index}`, { x: x + 400, y: y + 18, w: 36, h: 26 }, '✕', () => {
    app.labDraft.hops.splice(index, 1);
  }, { variant: 'danger', fontSize: 11 });
  return 68;
}

function renderEditor(app: GameApp): void {
  const ui = app.ui;
  const draft = app.labDraft;
  ui.panel({ x: 284, y: 72, w: 486, h: 724 }, '');
  ui.text('配方实验台', 304, 101, { size: 18, weight: 950 });
  ui.text('所有参数立即重算', 746, 101, { size: 11.5, color: theme.green, align: 'right' });

  const viewport = { x: 292, y: 112, w: 470, h: 620 };
  const editorContentH = 940 + draft.bill.length * 82 + draft.hops.length * 88;
  const offset = ui.beginScroll('lab-editor', viewport, editorContentH);
  let y = 126 - offset;
  const x = 306;
  const w = 446;

  ui.text('配方名称（点击编辑）', x, y, { size: 11.5, color: theme.faint, weight: 700 });
  ui.buttonAction('lab-name-edit', { x, y: y + 8, w: 446, h: 34 }, app.textEditing?.id === 'recipe-name' ? `${draft.name}_` : draft.name, () => {
    app.startTextEdit('recipe-name', draft.name, (value) => {
      draft.name = value.trim() || draft.name;
    });
  }, { align: 'left', variant: 'dark', fontSize: 14 });
  y += 56;

  sectionTitle(app, '啤酒风格', x, y);
  y += 12;
  STYLES.forEach((style, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const bx = x + col * 152;
    const by = y + row * 36;
    ui.buttonAction(`style-${style.id}`, { x: bx, y: by, w: 144, h: 28 }, style.name, () => {
      draft.styleId = style.id;
    }, { selected: draft.styleId === style.id, fontSize: 11.5 });
  });
  y += 82;

  ui.slider('lab-volume', x, y, w, '批次体积', draft.volumeL, 50, 400, 10, (v) => (draft.volumeL = v), (v) => `${v}L`);
  y += 54;
  ui.slider('lab-temp', x, y, w, '糖化温度（63→70应明显降低发酵度）', draft.mashTempC, 62, 72, 0.5, (v) => (draft.mashTempC = v), (v) => `${v.toFixed(1)}°C`, theme.red);
  y += 54;
  ui.slider('lab-mash-time', x, y, w, '糖化时间', draft.mashMin, 30, 120, 5, (v) => (draft.mashMin = v), (v) => `${v}分钟`, theme.gold);
  y += 54;
  ui.slider('lab-ferm-temp', x, y, w, '发酵温度', draft.fermTempC, 6, 36, 0.5, (v) => (draft.fermTempC = v), (v) => `${v.toFixed(1)}°C`, theme.green);
  y += 58;

  sectionTitle(app, '麦芽配比', x, y, `${draft.bill.reduce((s, i) => s + i.kg, 0).toFixed(1)}kg`);
  y += 12;
  draft.bill.forEach((item, i) => {
    y += 22;
    y += renderMaltRow(app, item, i, y);
  });
  y += 8;
  MALTS.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    ui.buttonAction(`add-malt-${m.id}`, { x: x + col * 228, y: y + row * 32, w: 218, h: 26 }, `＋ ${m.name}`, () => {
      const existing = draft.bill.find((b) => b.maltId === m.id);
      if (existing) existing.kg += 2;
      else draft.bill.push({ maltId: m.id, kg: 2 });
    }, { fontSize: 10.8 });
  });
  y += Math.ceil(MALTS.length / 2) * 32 + 14;

  sectionTitle(app, '酒花与煮沸时间', x, y, '时间越长苦度越高');
  y += 12;
  draft.hops.forEach((item, i) => {
    y += 20;
    y += renderHopRow(app, item, i, y);
  });
  y += 8;
  HOPS.forEach((h, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    ui.buttonAction(`add-hop-${h.id}`, { x: x + col * 228, y: y + row * 32, w: 218, h: 26 }, `＋ ${h.name}`, () => {
      draft.hops.push({ hopId: h.id, grams: 30, boilMin: 30 });
    }, { fontSize: 10.8 });
  });
  y += Math.ceil(HOPS.length / 2) * 32 + 14;

  sectionTitle(app, '酵母', x, y);
  y += 14;
  YEASTS.forEach((yeast, i) => {
    const col = i % 2;
    const bx = x + col * 228;
    const by = y + Math.floor(i / 2) * 58;
    const selected = draft.yeastId === yeast.id;
    ui.buttonAction(`yeast-${yeast.id}`, { x: bx, y: by, w: 218, h: 50 }, `${yeast.name}\n${yeast.optLowC}-${yeast.optHighC}°C / 衰减${(yeast.attenuation * 100).toFixed(0)}%`, () => {
      draft.yeastId = yeast.id;
    }, { selected, fontSize: 11.2, align: 'left' });
  });
  y += Math.ceil(YEASTS.length / 2) * 58 + 20;
  ui.endScroll('lab-editor', viewport, editorContentH);

  ui.buttonAction('lab-save', { x: 304, y: 742, w: 210, h: 38 }, '💾 保存配方', () => app.saveLabDraft(false), { variant: 'primary' });
  ui.buttonAction('lab-save-brew', { x: 526, y: 742, w: 218, h: 38 }, '保存并去酿造', () => app.saveLabDraft(true), { variant: 'success' });
}

function rightStat(app: GameApp, x: number, y: number, label: string, value: string, color = theme.text): void {
  const ui = app.ui;
  ui.roundRect(x, y, 122, 54, 10);
  ui.ctx.fillStyle = withAlpha(theme.bg0, 0.34);
  ui.ctx.fill();
  ui.text(label, x + 10, y + 17, { size: 10.5, color: theme.faint, weight: 700 });
  ui.text(value, x + 10, y + 40, { size: 16, weight: 950, color, font: 'num' });
}

function renderPrediction(app: GameApp): void {
  const ui = app.ui;
  const draft = app.labDraft;
  const w = computeWort(draft);
  ui.panel({ x: 786, y: 72, w: 564, h: 724 }, '实时计算与教材校验');
  const viewport = { x: 794, y: 110, w: 548, h: 670 };
  const predictionContentH = 720 + w.hopDetails.length * 54;
  const offset = ui.beginScroll('lab-prediction', viewport, predictionContentH);
  let y = 126 - offset;
  const x = 810;

  const stats: Array<[string, string, string?]> = [
    ['OG', w.og.toFixed(4), theme.gold],
    ['FG', w.fg.toFixed(4)],
    ['ABV', `${w.abv.toFixed(2)}%`, theme.copperBright],
    ['发酵度', `${(w.fermentability * 100).toFixed(1)}%`, theme.green],
    ['IBU', w.ibu.toFixed(1), theme.gold],
    ['EBC', w.ebc.toFixed(0), theme.copperBright],
    ['酒体', w.bodyIndex.toFixed(2), theme.purple],
    ['成本', `¥${w.cost.toFixed(0)}`, theme.green],
  ];
  stats.forEach(([label, value, color], i) => {
    rightStat(app, x + (i % 4) * 130, y + Math.floor(i / 4) * 62, label, value, color);
  });
  y += 136;

  // 63 vs 70 textbook trend card.
  const cold = computeWort({ ...structuredClone(draft), mashTempC: 63 });
  const hot = computeWort({ ...structuredClone(draft), mashTempC: 70 });
  ui.roundRect(x, y, 516, 118, 14);
  ui.ctx.fillStyle = withAlpha(theme.blue, 0.08);
  ui.ctx.fill();
  ui.ctx.strokeStyle = withAlpha(theme.blue, 0.35);
  ui.ctx.stroke();
  ui.text('糖化温度经验走势校验', x + 16, y + 24, { size: 14, weight: 950 });
  ui.text('63°C', x + 18, y + 54, { size: 13, weight: 900, color: theme.blue });
  ui.text(`发酵度 ${(cold.fermentability * 100).toFixed(1)}%`, x + 70, y + 54, { size: 12 });
  ui.text(`ABV ${cold.abv.toFixed(2)}%`, x + 220, y + 54, { size: 12, color: theme.gold, font: 'num' });
  ui.text('70°C', x + 18, y + 82, { size: 13, weight: 900, color: theme.gold });
  ui.text(`发酵度 ${(hot.fermentability * 100).toFixed(1)}%`, x + 70, y + 82, { size: 12 });
  ui.text(`ABV ${hot.abv.toFixed(2)}%`, x + 220, y + 82, { size: 12, color: theme.gold, font: 'num' });
  const trendOk = hot.fermentability < cold.fermentability - 0.08 && hot.abv < cold.abv;
  ui.tag(x + 370, y + 38, trendOk ? '走势正确 ✓' : '酶量不足/异常', trendOk ? theme.green : theme.red, 126);
  ui.text(`变化：发酵度 −${((cold.fermentability - hot.fermentability) * 100).toFixed(1)}pp，ABV −${(cold.abv - hot.abv).toFixed(2)}pp`, x + 16, y + 106, {
    size: 11,
    color: theme.muted,
    font: 'num',
  });
  y += 132;

  ui.text('Tinseth 苦度明细', x, y, { size: 15, weight: 950 });
  y += 12;
  ui.text(`标准 U(OG=1.050,60min)=${(tinsethUtilization(1.05, 60) * 100).toFixed(2)}%；本配方 OG=${w.og.toFixed(3)}`, x, y + 14, {
    size: 11.5,
    color: theme.faint,
    font: 'num',
  });
  y += 30;
  w.hopDetails.forEach((d) => {
    ui.roundRect(x, y, 516, 46, 10);
    ui.ctx.fillStyle = withAlpha(theme.bg0, 0.3);
    ui.ctx.fill();
    ui.text(hopById(d.hopId).name, x + 12, y + 19, { size: 12.5, weight: 850 });
    ui.text(`${d.grams}g @ ${d.boilMin}′`, x + 12, y + 36, { size: 10.5, color: theme.faint, font: 'num' });
    ui.text(`U ${(d.utilization * 100).toFixed(1)}%`, x + 300, y + 28, { size: 11.5, color: theme.muted, font: 'num' });
    ui.text(`${d.ibu.toFixed(2)} IBU`, x + 500, y + 28, { size: 14, weight: 950, color: theme.gold, align: 'right', font: 'num' });
    y += 54;
  });
  y += 8;

  ui.text('预测感官平衡', x, y, { size: 15, weight: 950 });
  y += 18;
  const bars: Array<[string, number, string]> = [
    ['麦芽/酒体', w.bodyIndex, theme.copper],
    ['酒花香气', Math.min(1, w.aromaIndex / 2.2), theme.green],
    ['预期风味', w.flavorPreview / 100, theme.purple],
    ['糖化转化', w.conversion, theme.blue],
  ];
  bars.forEach(([label, value, color]) => {
    ui.text(label, x, y, { size: 12, color: theme.muted, weight: 750 });
    ui.progress(x + 110, y - 10, 300, 12, value, color);
    ui.text(`${Math.round(value * 100)}`, x + 430, y, { size: 12, weight: 900, font: 'num' });
    y += 30;
  });

  y += 8;
  ui.paragraph(
    '说明：配方实验页的分数是麦汁与配方平衡预测；装瓶总分还会计入发酵温度造成的酯类、杂醇、双乙酰和酵母健康度。',
    x,
    y,
    516,
    { size: 12, lineHeight: 18, color: theme.muted },
  );
  y += 70;
  ui.buttonAction('lab-selftest', { x, y, w: 248, h: 44 }, '🧪 运行公式自检', () => app.runSelfTest(), { variant: 'gold' });
  ui.buttonAction('lab-save-right', { x: x + 268, y, w: 248, h: 44 }, '保存并酿造', () => app.saveLabDraft(true), { variant: 'success' });
  y += 64;
  ui.endScroll('lab-prediction', viewport, predictionContentH);
}

export function renderLab(app: GameApp): void {
  renderLeftList(app);
  renderEditor(app);
  renderPrediction(app);
}
