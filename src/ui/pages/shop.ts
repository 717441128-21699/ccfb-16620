import { HOPS, MALTS, YEASTS } from '../../data/ingredients';
import type { IngredientCategory } from '../../types';
import { theme, withAlpha } from '../theme';
import type { GameApp } from '../app';

const CATEGORIES: Array<{ id: IngredientCategory; label: string }> = [
  { id: 'malt', label: '麦芽' },
  { id: 'hop', label: '酒花' },
  { id: 'yeast', label: '酵母' },
];

export function renderShop(app: GameApp): void {
  const ui = app.ui;
  ui.region('shop-backdrop', { x: 0, y: 0, w: 1366, h: 860 }, { onActivate: () => app.closeShop() });
  ui.ctx.save();
  ui.ctx.fillStyle = 'rgba(0,0,0,0.58)';
  ui.ctx.fillRect(0, 0, 1366, 860);
  ui.ctx.restore();

  const modal = { x: 173, y: 54, w: 1020, h: 752 };
  ui.region('shop-modal-block', modal, {});
  ui.panel(modal, '');
  ui.text('原料采购与库存', modal.x + 24, modal.y + 38, { size: 24, weight: 950 });
  ui.text(`现金 ¥${app.state.cash.toLocaleString()}`, modal.x + modal.w - 170, modal.y + 38, {
    size: 18,
    weight: 950,
    color: theme.gold,
    align: 'right',
    font: 'num',
  });
  ui.buttonAction('shop-close', { x: modal.x + modal.w - 48, y: modal.y + 18, w: 32, h: 32 }, '✕', () => app.closeShop(), {
    variant: 'danger',
    fontSize: 14,
  });

  CATEGORIES.forEach((cat, i) => {
    ui.buttonAction(
      `shop-cat-${cat.id}`,
      { x: modal.x + 24 + i * 132, y: modal.y + 58, w: 120, h: 36 },
      cat.label,
      () => (app.shopCategory = cat.id),
      { selected: app.shopCategory === cat.id, variant: app.shopCategory === cat.id ? 'primary' : 'ghost' },
    );
  });
  ui.buttonAction('shop-reset', { x: modal.x + modal.w - 190, y: modal.y + 60, w: 160, h: 32 }, app.resetArmed ? '再次点击确认重置' : '重置整个存档', () => app.resetGame(), {
    variant: 'danger',
    fontSize: 12,
  });

  const viewport = { x: modal.x + 24, y: modal.y + 112, w: modal.w - 48, h: modal.h - 136 };
  const items = app.shopCategory === 'malt' ? MALTS : app.shopCategory === 'hop' ? HOPS : YEASTS;
  const rowH = 92;
  const contentH = items.length * (rowH + 10) + 10;
  const offset = ui.beginScroll('shop-list', viewport, contentH);

  items.forEach((item, i) => {
    const y = viewport.y + 8 + i * (rowH + 10) - offset;
    const x = viewport.x;
    const w = viewport.w - 14;
    ui.roundRect(x, y, w, rowH, 14);
    ui.ctx.fillStyle = withAlpha(theme.panel3, 0.72);
    ui.ctx.fill();
    ui.ctx.strokeStyle = withAlpha(theme.border, 0.65);
    ui.ctx.stroke();

    const isMalt = app.shopCategory === 'malt';
    const isHop = app.shopCategory === 'hop';
    const stock = isMalt
      ? app.state.inventory.maltKg[item.id] ?? 0
      : isHop
        ? app.state.inventory.hopG[item.id] ?? 0
        : app.state.inventory.yeastPack[item.id] ?? 0;
    const unit = isMalt ? 'kg' : isHop ? 'g' : '包';
    const cost = isMalt
      ? (item as (typeof MALTS)[number]).costPerKg
      : isHop
        ? ((item as (typeof HOPS)[number]).costPer100g / 100).toFixed(2)
        : (item as (typeof YEASTS)[number]).costPerPack;
    const costUnit = isHop ? '¥/g' : isMalt ? '¥/kg' : '¥/包';

    ui.text(item.name, x + 18, y + 27, { size: 17, weight: 950 });
    ui.text((item as { origin?: string }).origin ?? (item as { kind?: string }).kind ?? '', x + 18, y + 48, {
      size: 11.5,
      color: theme.copperBright,
    });
    ui.paragraph((item as { blurb: string }).blurb, x + 18, y + 58, 520, { size: 11.5, lineHeight: 16, color: theme.muted, maxLines: 2 });
    ui.text(`库存 ${stock.toFixed(isMalt ? 1 : 0)}${unit}`, x + 560, y + 28, { size: 14, weight: 900, color: theme.green, font: 'num' });
    ui.text(`${cost} ${costUnit}`, x + 560, y + 52, { size: 12.5, color: theme.gold, font: 'num' });

    if (isMalt) {
      ui.buttonAction(`buy-${item.id}-1`, { x: x + w - 250, y: y + 20, w: 70, h: 28 }, '+1kg', () => app.buyShop('malt', item.id, 1), { fontSize: 12 });
      ui.buttonAction(`buy-${item.id}-10`, { x: x + w - 172, y: y + 20, w: 76, h: 28 }, '+10kg', () => app.buyShop('malt', item.id, 10), { variant: 'primary', fontSize: 12 });
      ui.buttonAction(`buy-${item.id}-bag`, { x: x + w - 88, y: y + 20, w: 70, h: 28 }, '+25kg', () => app.buyShop('malt', item.id, 25), { variant: 'gold', fontSize: 12 });
    } else if (isHop) {
      ui.buttonAction(`buy-${item.id}-25`, { x: x + w - 250, y: y + 20, w: 70, h: 28 }, '+25g', () => app.buyShop('hop', item.id, 25), { fontSize: 12 });
      ui.buttonAction(`buy-${item.id}-100`, { x: x + w - 172, y: y + 20, w: 76, h: 28 }, '+100g', () => app.buyShop('hop', item.id, 100), { variant: 'primary', fontSize: 12 });
      ui.buttonAction(`buy-${item.id}-500`, { x: x + w - 88, y: y + 20, w: 70, h: 28 }, '+500g', () => app.buyShop('hop', item.id, 500), { variant: 'gold', fontSize: 12 });
    } else {
      ui.buttonAction(`buy-${item.id}-1`, { x: x + w - 172, y: y + 20, w: 76, h: 28 }, '+1包', () => app.buyShop('yeast', item.id, 1), { fontSize: 12 });
      ui.buttonAction(`buy-${item.id}-5`, { x: x + w - 88, y: y + 20, w: 70, h: 28 }, '+5包', () => app.buyShop('yeast', item.id, 5), { variant: 'primary', fontSize: 12 });
    }
    ui.text('采购后立即入库存，酿造时自动扣料', x + w - 250, y + 68, { size: 10.5, color: theme.faint });
  });
  ui.endScroll('shop-list', viewport, contentH);
}
