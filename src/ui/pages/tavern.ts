import { STYLES, styleById } from '../../data/ingredients';
import { PINT_L, SEASON_INFO, seasonForDay } from '../../game/formulas';
import type { PackagedBeer } from '../../types';
import { theme, withAlpha } from '../theme';
import type { GameApp } from '../app';

function drawTavernScene(app: GameApp, x: number, y: number, w: number, h: number): void {
  const ui = app.ui;
  const ctx = ui.ctx;
  const season = seasonForDay(app.state.day);
  const info = SEASON_INFO[season];

  ctx.save();
  ui.roundRect(x, y, w, h, 18);
  ctx.clip();
  const wall = ctx.createLinearGradient(0, y, 0, y + h);
  wall.addColorStop(0, withAlpha('#5b3a24', 0.55));
  wall.addColorStop(0.62, withAlpha('#2c1d14', 0.92));
  wall.addColorStop(1, '#1a110b');
  ctx.fillStyle = wall;
  ctx.fillRect(x, y, w, h);

  // Window / seasonal ambience.
  const wx = x + 28;
  const wy = y + 54;
  const ww = 178;
  const wh = 118;
  const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, withAlpha(info.accent, 0.5));
  sky.addColorStop(1, withAlpha('#1b2840', 0.9));
  ui.roundRect(wx, wy, ww, wh, 12);
  ctx.fillStyle = sky;
  ctx.fill();
  ctx.strokeStyle = withAlpha(theme.cream, 0.5);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy + 6);
  ctx.lineTo(wx + ww / 2, wy + wh - 6);
  ctx.moveTo(wx + 6, wy + wh / 2);
  ctx.lineTo(wx + ww - 6, wy + wh / 2);
  ctx.strokeStyle = withAlpha(theme.cream, 0.35);
  ctx.lineWidth = 3;
  ctx.stroke();
  ui.text(`${info.name}季`, wx + 18, wy + 34, { size: 24, weight: 950, color: theme.cream });
  ui.text(info.temp, wx + 18, wy + 62, { size: 12.5, color: theme.cream, font: 'num' });

  // Shelves and bottles.
  for (let shelf = 0; shelf < 2; shelf++) {
    const sy = y + 58 + shelf * 62;
    ctx.fillStyle = withAlpha('#8a5a34', 0.8);
    ctx.fillRect(x + 240, sy + 34, w - 280, 8);
    for (let i = 0; i < 12; i++) {
      const bx = x + 258 + i * 38;
      const bh = 28 + ((i * 13 + shelf * 7) % 18);
      ui.roundRect(bx, sy + 34 - bh, 13, bh, 4);
      ctx.fillStyle = i % 3 === 0 ? withAlpha(theme.gold, 0.55) : i % 3 === 1 ? withAlpha(theme.green, 0.45) : withAlpha(theme.copper, 0.55);
      ctx.fill();
      ctx.fillStyle = withAlpha(theme.cream, 0.35);
      ctx.fillRect(bx + 3, sy + 12 - bh, 7, 5);
    }
  }

  // Bar counter.
  const counterY = y + h - 82;
  const counter = ctx.createLinearGradient(0, counterY, 0, y + h);
  counter.addColorStop(0, '#8a542e');
  counter.addColorStop(1, '#4a2b18');
  ctx.fillStyle = counter;
  ctx.fillRect(x, counterY, w, 82);
  ctx.fillStyle = withAlpha('#f2b36b', 0.28);
  ctx.fillRect(x, counterY, w, 8);

  // Six physical tap handles.
  for (let i = 0; i < 6; i++) {
    const tx = x + 270 + i * 72;
    const tappedId = app.state.tapBeerIds[i];
    const beer = app.state.beerList.find((b) => b.id === tappedId);
    ctx.fillStyle = '#c9d1d9';
    ui.roundRect(tx + 8, counterY - 44, 10, 48, 4);
    ctx.fill();
    ctx.fillStyle = beer ? beer.color : '#6b7280';
    ui.roundRect(tx, counterY - 58, 26, 20, 8);
    ctx.fill();
    if (beer) {
      const pulse = 0.5 + 0.5 * Math.sin(app.time / 500 + i);
      ctx.fillStyle = withAlpha(theme.gold, 0.18 + pulse * 0.12);
      ctx.beginPath();
      ctx.arc(tx + 13, counterY + 18, 16 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = beer.color;
      ui.roundRect(tx + 2, counterY + 4, 22, 30, 5);
      ctx.fill();
      ctx.fillStyle = withAlpha('#fff8e8', 0.86);
      ui.roundRect(tx + 1, counterY + 1, 24, 8, 4);
      ctx.fill();
    }
  }

  // Customers.
  const customerCount = Math.min(9, Math.round(2 + app.state.reputation / 16));
  for (let i = 0; i < customerCount; i++) {
    const cx = x + 70 + i * 68 + ((i % 2) * 10);
    const cy = counterY - 18 - (i % 3) * 4;
    const bob = Math.sin(app.time / 700 + i * 1.7) * 2;
    ctx.fillStyle = ['#d9822b', '#75b7ff', '#7bc96f', '#c58af9'][i % 4];
    ctx.beginPath();
    ctx.arc(cx, cy - 24 + bob, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha('#f2c9a0', 0.92);
    ctx.beginPath();
    ctx.arc(cx, cy - 30 + bob, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b1b12';
    ui.roundRect(cx - 17, cy - 8 + bob, 34, 34, 12);
    ctx.fill();
  }

  ctx.restore();
  ui.text('今夜酒头', x + 226, y + 34, { size: 18, weight: 950, color: theme.cream });
  ui.paragraph(SEASON_INFO[season].preference, x + 226, y + 42, 260, { size: 12.5, lineHeight: 18, color: theme.cream, maxLines: 2 });
  const last = app.state.sales[0];
  ui.text(last ? `昨日 ${last.customers} 客 / ${last.pints} 杯 / ¥${last.revenue}` : '推进一天开始营业', x + 28, y + h - 18, {
    size: 13,
    weight: 850,
    color: theme.cream,
  });
}

function renderTapCard(app: GameApp, index: number, x: number, y: number, w: number, h: number): void {
  const ui = app.ui;
  const beerId = app.state.tapBeerIds[index];
  const beer = app.state.beerList.find((b) => b.id === beerId) ?? null;
  const selected = app.selectedTapIndex === index;
  const { hover } = ui.region(`tap-${index}`, { x, y, w, h }, { onActivate: () => (app.selectedTapIndex = index) });
  ui.roundRect(x, y, w, h, 14);
  ui.ctx.fillStyle = beer ? withAlpha(theme.panel3, 0.86) : withAlpha(theme.bg0, 0.34);
  ui.ctx.fill();
  ui.ctx.strokeStyle = selected ? theme.gold : hover ? theme.copperBright : withAlpha(theme.border, 0.7);
  ui.ctx.lineWidth = selected ? 2.2 : 1.2;
  ui.ctx.stroke();

  ui.text(`T${index + 1}`, x + 12, y + 22, { size: 12, weight: 950, color: selected ? theme.gold : theme.faint });
  if (!beer) {
    ui.text('空酒头', x + w / 2, y + 52, { size: 15, weight: 900, color: theme.muted, align: 'center' });
    ui.text('在下方库存点“上枪”', x + w / 2, y + 76, { size: 11, color: theme.faint, align: 'center' });
    return;
  }
  ui.ctx.save();
  ui.ctx.beginPath();
  ui.ctx.arc(x + 27, y + 52, 18, 0, Math.PI * 2);
  ui.ctx.fillStyle = beer.color;
  ui.ctx.fill();
  ui.ctx.strokeStyle = withAlpha(theme.cream, 0.65);
  ui.ctx.lineWidth = 3;
  ui.ctx.stroke();
  ui.ctx.restore();
  ui.text(ui.truncate(beer.name, w - 82, 13.5, 950), x + 54, y + 30, { size: 13.5, weight: 950 });
  ui.text(`${beer.scores.medals} ${beer.scores.total}分`, x + 54, y + 50, { size: 11.5, color: theme.gold, weight: 850 });
  ui.text(`${beer.remainingL.toFixed(0)}L ≈ ${Math.floor(beer.remainingL / PINT_L)}杯`, x + 12, y + h - 14, {
    size: 11.5,
    color: theme.muted,
    font: 'num',
  });
  ui.buttonAction(`tap-clear-${index}`, { x: x + w - 58, y: y + 10, w: 46, h: 22 }, '撤下', () => app.setTap(index, null), {
    variant: 'ghost',
    fontSize: 10.5,
  });
}

function renderBeerRow(app: GameApp, beer: PackagedBeer, y: number): number {
  const ui = app.ui;
  const x = 808;
  const w = 526;
  const h = 88;
  ui.roundRect(x, y, w, h, 13);
  ui.ctx.fillStyle = withAlpha(theme.bg0, 0.34);
  ui.ctx.fill();
  ui.ctx.fillStyle = beer.color;
  ui.roundRect(x, y, 8, h, 4);
  ui.ctx.fill();

  ui.text(ui.truncate(beer.name, 210, 14.5, 950), x + 20, y + 24, { size: 14.5, weight: 950 });
  ui.text(styleById(beer.styleId).name, x + 20, y + 45, { size: 11.5, color: theme.muted });
  ui.text(`${beer.abv}% · ${beer.ibu}IBU · EBC${beer.ebc}`, x + 20, y + 67, { size: 11, color: theme.faint, font: 'num' });
  ui.tag(x + 238, y + 14, `${beer.scores.total} ${beer.scores.medals}`, beer.scores.total >= 82 ? theme.gold : theme.copper, 86);
  ui.text(`库存 ${beer.remainingL.toFixed(1)}L`, x + 238, y + 55, { size: 11.5, color: theme.text, font: 'num' });
  ui.text(`已售 ${beer.totalPintsSold}杯 / ¥${beer.revenue.toFixed(0)}`, x + 238, y + 73, { size: 10.5, color: theme.green, font: 'num' });

  ui.buttonAction(`price-minus-${beer.id}`, { x: x + 350, y: y + 18, w: 28, h: 26 }, '−', () => app.changeBeerPrice(beer.id, -1));
  ui.text(`¥${beer.pricePerPint}`, x + 404, y + 36, { size: 17, weight: 950, color: theme.gold, align: 'center', font: 'num' });
  ui.buttonAction(`price-plus-${beer.id}`, { x: x + 430, y: y + 18, w: 28, h: 26 }, '＋', () => app.changeBeerPrice(beer.id, 1));
  ui.buttonAction(`tap-beer-${beer.id}`, { x: x + 350, y: y + 52, w: 108, h: 26 }, `上枪 T${app.selectedTapIndex + 1}`, () => {
    app.setTap(app.selectedTapIndex, beer.id);
  }, { variant: 'success', fontSize: 11.5 });
  ui.buttonAction(`price-five-${beer.id}`, { x: x + 466, y: y + 18, w: 44, h: 26 }, '±5', () => app.changeBeerPrice(beer.id, app.state.day % 2 ? 5 : -5), {
    fontSize: 10,
  });
  return h + 10;
}

function renderChart(app: GameApp): void {
  const ui = app.ui;
  const x = 16;
  const y = 418;
  const w = 760;
  const h = 378;
  ui.panel({ x, y, w, h }, '近14个营业日');
  const data = app.state.sales.slice(0, 14).reverse();
  const chartX = x + 54;
  const chartY = y + 58;
  const chartW = w - 92;
  const chartH = 210;
  const maxRevenue = Math.max(100, ...data.map((d) => d.revenue));
  const maxPints = Math.max(20, ...data.map((d) => d.pints));

  ui.ctx.save();
  ui.ctx.strokeStyle = withAlpha(theme.borderSoft, 0.8);
  ui.ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + (chartH * i) / 4;
    ui.ctx.beginPath();
    ui.ctx.moveTo(chartX, gy);
    ui.ctx.lineTo(chartX + chartW, gy);
    ui.ctx.stroke();
    ui.text(`¥${Math.round(maxRevenue * (1 - i / 4))}`, x + 12, gy + 4, { size: 10, color: theme.faint, font: 'num' });
  }

  const barW = data.length ? Math.min(34, (chartW / data.length) * 0.58) : 20;
  data.forEach((d, i) => {
    const bx = chartX + (i + 0.5) * (chartW / Math.max(1, data.length)) - barW / 2;
    const bh = (d.revenue / maxRevenue) * chartH;
    const grad = ui.ctx.createLinearGradient(0, chartY + chartH - bh, 0, chartY + chartH);
    grad.addColorStop(0, theme.copperBright);
    grad.addColorStop(1, withAlpha(theme.copper, 0.35));
    ui.ctx.fillStyle = grad;
    ui.roundRect(bx, chartY + chartH - bh, barW, bh, 6);
    ui.ctx.fill();
    if (i % 2 === 0 || data.length < 8) ui.text(`${d.day}`, bx + barW / 2, chartY + chartH + 18, { size: 10, color: theme.faint, align: 'center', font: 'num' });
  });

  if (data.length > 1) {
    ui.ctx.beginPath();
    data.forEach((d, i) => {
      const px = chartX + (i + 0.5) * (chartW / data.length);
      const py = chartY + chartH - (d.pints / maxPints) * chartH;
      if (i === 0) ui.ctx.moveTo(px, py);
      else ui.ctx.lineTo(px, py);
    });
    ui.ctx.strokeStyle = theme.green;
    ui.ctx.lineWidth = 3;
    ui.ctx.stroke();
  }
  ui.ctx.restore();

  const totalRevenue14 = data.reduce((s, d) => s + d.revenue, 0);
  const totalPints14 = data.reduce((s, d) => s + d.pints, 0);
  ui.text(`14日营收 ¥${totalRevenue14.toLocaleString()}`, x + 28, y + h - 76, { size: 16, weight: 950, color: theme.gold });
  ui.text(`售出 ${totalPints14} 杯（${(totalPints14 * PINT_L).toFixed(0)}L）`, x + 260, y + h - 76, { size: 14, weight: 850, color: theme.text });
  ui.text(`总营收 ¥${app.state.totalRevenue.toLocaleString()}`, x + 520, y + h - 76, { size: 14, weight: 850, color: theme.green });
  const best = app.state.sales[0]?.topBeer ?? '—';
  ui.paragraph(`最近爆款：${best}。评分、季节匹配、价格和声望共同决定点单率；断酒会降低声望。`, x + 28, y + h - 50, w - 56, {
    size: 12.5,
    lineHeight: 18,
    color: theme.muted,
    maxLines: 2,
  });
}

export function renderTavern(app: GameApp): void {
  const ui = app.ui;
  drawTavernScene(app, 16, 72, 760, 330);
  renderChart(app);

  ui.panel({ x: 792, y: 72, w: 558, h: 330 }, '六个酒头 / 排期');
  for (let i = 0; i < 6; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    renderTapCard(app, i, 808 + col * 176, 116 + row * 132, 166, 118);
  }

  ui.panel({ x: 792, y: 418, w: 558, h: 378 }, '酒款库存与定价');
  const viewport = { x: 800, y: 456, w: 542, h: 326 };
  const contentH = Math.max(viewport.h, app.state.beerList.length * 98 + 8);
  const offset = ui.beginScroll('beer-list', viewport, contentH);
  if (app.state.beerList.length === 0) {
    ui.paragraph('还没有装瓶酒。去发酵罐页将成熟酒液装瓶，酒会出现在这里。', 812, 486 - offset, 500, {
      size: 14,
      lineHeight: 21,
      color: theme.muted,
    });
  }
  app.state.beerList.forEach((beer, i) => {
    const y = 464 + i * 98 - offset;
    renderBeerRow(app, beer, y);
  });
  ui.endScroll('beer-list', viewport, contentH);

  // STYLES is used indirectly through styleById but keep import explicit for future legend.
  void STYLES.length;
}
