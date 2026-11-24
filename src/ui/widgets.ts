import { clamp } from '../game/formulas';
import { FONT, theme, withAlpha } from './theme';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionOptions {
  disabled?: boolean;
  onActivate?: () => void;
  onSlide?: (value: number) => void;
  slider?: { min: number; max: number; step: number };
  cursor?: string;
}

interface Region extends Rect, RegionOptions {
  id: string;
  clips: Rect[];
}

export interface ButtonOptions {
  variant?: 'primary' | 'ghost' | 'success' | 'danger' | 'gold' | 'tab' | 'dark';
  disabled?: boolean;
  selected?: boolean;
  fontSize?: number;
  align?: 'center' | 'left';
  icon?: string;
}

export class UI {
  readonly ctx: CanvasRenderingContext2D;
  regions: Region[] = [];
  clipStack: Rect[] = [];
  pointer = { x: -999, y: -999 };
  hoverId: string | null = null;
  hoverCursor = 'default';
  pressedId: string | null = null;
  dragId: string | null = null;
  scrollOffsets: Record<string, number> = {};
  scrollMax: Record<string, number> = {};
  scrollViewports: Array<Rect & { id: string }> = [];

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  beginFrame(): void {
    this.regions = [];
    this.clipStack = [];
    this.scrollViewports = [];
  }

  endFrame(): void {
    const hovered = this.pick(this.pointer.x, this.pointer.y);
    this.hoverId = hovered && !hovered.disabled ? hovered.id : null;
    this.hoverCursor = hovered && !hovered.disabled ? hovered.cursor ?? 'pointer' : 'default';
  }

  setPointer(x: number, y: number): void {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  inside(r: Rect, x = this.pointer.x, y = this.pointer.y): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private insideClips(region: Region, x: number, y: number): boolean {
    return region.clips.every((clip) => this.inside(clip, x, y));
  }

  region(id: string, rect: Rect, options: RegionOptions = {}): { hover: boolean; pressed: boolean } {
    const region: Region = { id, ...rect, ...options, clips: [...this.clipStack] };
    this.regions.push(region);
    const hover = this.hoverId === id && !options.disabled;
    const pressed = this.pressedId === id && !options.disabled;
    return { hover, pressed };
  }

  pick(x: number, y: number): Region | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const region = this.regions[i];
      if (region.disabled) continue;
      if (this.inside(region, x, y) && this.insideClips(region, x, y)) return region;
    }
    return null;
  }

  pointerDown(x: number, y: number): void {
    this.setPointer(x, y);
    const region = this.pick(x, y);
    if (!region || region.disabled) {
      this.pressedId = null;
      this.dragId = null;
      return;
    }
    this.pressedId = region.id;
    if (region.slider && region.onSlide) {
      this.dragId = region.id;
      this.updateSlider(region, x);
    }
  }

  pointerMove(x: number, y: number): void {
    this.setPointer(x, y);
    if (!this.dragId) return;
    const region = this.regions.find((r) => r.id === this.dragId && r.slider);
    if (region) this.updateSlider(region, x);
  }

  pointerUp(x: number, y: number): void {
    this.setPointer(x, y);
    const pressed = this.pressedId ? this.regions.find((r) => r.id === this.pressedId) : null;
    const picked = this.pick(x, y);
    if (pressed && picked && pressed.id === picked.id && !pressed.disabled) {
      pressed.onActivate?.();
    }
    this.pressedId = null;
    this.dragId = null;
  }

  cancelPointer(): void {
    this.pressedId = null;
    this.dragId = null;
  }

  private updateSlider(region: Region, x: number): void {
    if (!region.slider || !region.onSlide) return;
    const { min, max, step } = region.slider;
    const ratio = clamp((x - region.x) / region.w, 0, 1);
    let value = min + ratio * (max - min);
    if (step > 0) value = Math.round(value / step) * step;
    value = clamp(Number(value.toFixed(4)), min, max);
    region.onSlide(value);
  }

  wheel(x: number, y: number, deltaY: number, deltaMode: number): boolean {
    const view = [...this.scrollViewports].reverse().find((r) => this.inside(r, x, y));
    if (!view) return false;
    const step = deltaMode === 1 ? 18 : 1;
    const max = this.scrollMax[view.id] ?? 0;
    const current = this.scrollOffsets[view.id] ?? 0;
    this.scrollOffsets[view.id] = clamp(current + deltaY * step, 0, max);
    return true;
  }

  pushClip(rect: Rect): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    this.clipStack.push(rect);
  }

  popClip(): void {
    this.clipStack.pop();
    this.ctx.restore();
  }

  beginScroll(id: string, viewport: Rect, contentHeight: number): number {
    const max = Math.max(0, contentHeight - viewport.h);
    this.scrollMax[id] = max;
    const offset = clamp(this.scrollOffsets[id] ?? 0, 0, max);
    this.scrollOffsets[id] = offset;
    this.scrollViewports.push({ id, ...viewport });
    this.pushClip(viewport);
    return offset;
  }

  endScroll(id: string, viewport: Rect, contentHeight: number): void {
    this.popClip();
    const max = Math.max(0, contentHeight - viewport.h);
    if (max <= 4) return;
    const offset = this.scrollOffsets[id] ?? 0;
    const track: Rect = { x: viewport.x + viewport.w - 7, y: viewport.y + 6, w: 4, h: viewport.h - 12 };
    this.roundRect(track.x, track.y, track.w, track.h, 2);
    this.ctx.fillStyle = withAlpha(theme.text, 0.12);
    this.ctx.fill();
    const thumbH = Math.max(34, (viewport.h / contentHeight) * track.h);
    const thumbY = track.y + (offset / max) * (track.h - thumbH);
    this.roundRect(track.x, thumbY, track.w, thumbH, 2);
    this.ctx.fillStyle = withAlpha(theme.copperBright, 0.72);
    this.ctx.fill();
  }

  roundRect(x: number, y: number, w: number, h: number, radius = 10): void {
    const r = Math.min(radius, w / 2, h / 2);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  text(
    value: unknown,
    x: number,
    y: number,
    options: {
      size?: number;
      color?: string;
      weight?: number | string;
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
      font?: 'sans' | 'num';
      alpha?: number;
    } = {},
  ): void {
    const ctx = this.ctx;
    const size = options.size ?? 14;
    const weight = options.weight ?? 500;
    const family = options.font === 'num' ? FONT.num : FONT.sans;
    ctx.save();
    if (typeof options.alpha === 'number') ctx.globalAlpha = options.alpha;
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = options.color ?? theme.text;
    ctx.textAlign = options.align ?? 'left';
    ctx.textBaseline = options.baseline ?? 'alphabetic';
    ctx.fillText(String(value), x, y);
    ctx.restore();
  }

  paragraph(
    value: string,
    x: number,
    y: number,
    maxWidth: number,
    options: { size?: number; color?: string; lineHeight?: number; weight?: number | string; maxLines?: number } = {},
  ): number {
    const ctx = this.ctx;
    const size = options.size ?? 12.5;
    const lineHeight = options.lineHeight ?? size * 1.45;
    ctx.save();
    ctx.font = `${options.weight ?? 400} ${size}px ${FONT.sans}`;
    ctx.fillStyle = options.color ?? theme.muted;
    ctx.textBaseline = 'top';
    const chars = Array.from(value);
    let line = '';
    let lines = 0;
    let cy = y;
    for (let i = 0; i < chars.length; i++) {
      const test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        if (options.maxLines && lines === options.maxLines - 1) {
          let clipped = line;
          while (ctx.measureText(`${clipped}…`).width > maxWidth && clipped.length > 0) clipped = clipped.slice(0, -1);
          ctx.fillText(`${clipped}…`, x, cy);
          ctx.restore();
          return cy + lineHeight;
        }
        ctx.fillText(line, x, cy);
        cy += lineHeight;
        lines++;
        line = chars[i];
      } else {
        line = test;
      }
    }
    if (line && (!options.maxLines || lines < options.maxLines)) ctx.fillText(line, x, cy);
    ctx.restore();
    return cy + lineHeight;
  }

  truncate(value: string, maxWidth: number, size = 13, weight: number | string = 500): string {
    this.ctx.save();
    this.ctx.font = `${weight} ${size}px ${FONT.sans}`;
    if (this.ctx.measureText(value).width <= maxWidth) {
      this.ctx.restore();
      return value;
    }
    let out = value;
    while (out.length > 1 && this.ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    this.ctx.restore();
    return `${out}…`;
  }

  panel(rect: Rect, title?: string, options: { accent?: string; padding?: boolean } = {}): void {
    const ctx = this.ctx;
    ctx.save();
    this.roundRect(rect.x, rect.y, rect.w, rect.h, 16);
    const gradient = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    gradient.addColorStop(0, withAlpha(theme.panel2, 0.96));
    gradient.addColorStop(1, withAlpha(theme.panel, 0.96));
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(options.accent ?? theme.border, 0.72);
    ctx.stroke();
    ctx.restore();
    if (title) {
      this.text(title, rect.x + 16, rect.y + 27, { size: 16, weight: 800, color: theme.text });
    }
  }

  button(id: string, rect: Rect, label: string, options: ButtonOptions = {}): boolean {
    const { hover, pressed } = this.region(id, rect, {
      disabled: options.disabled,
      onActivate: undefined,
      cursor: options.disabled ? 'not-allowed' : 'pointer',
    });
    // The region's activation is attached through a second registration pattern:
    // callers needing an action should use buttonAction. This method remains visual-only
    // unless buttonAction() is used by pages.
    const ctx = this.ctx;
    const variant = options.variant ?? 'ghost';
    let bg = theme.panel3;
    let fg = theme.text;
    let border = theme.border;
    if (variant === 'primary') {
      bg = options.disabled ? withAlpha(theme.copper, 0.35) : theme.copper;
      fg = '#1c1208';
      border = withAlpha(theme.copperBright, 0.8);
    } else if (variant === 'success') {
      bg = options.disabled ? withAlpha(theme.green, 0.25) : withAlpha(theme.green, 0.88);
      fg = '#0c1a0a';
      border = theme.green;
    } else if (variant === 'danger') {
      bg = withAlpha(theme.red, options.disabled ? 0.18 : hover ? 0.9 : 0.72);
      fg = options.disabled ? withAlpha(theme.text, 0.45) : '#210b08';
      border = theme.red;
    } else if (variant === 'gold') {
      bg = options.disabled ? withAlpha(theme.gold, 0.25) : theme.gold;
      fg = '#211704';
      border = theme.gold;
    } else if (variant === 'tab') {
      bg = options.selected ? withAlpha(theme.copper, 0.22) : 'transparent';
      fg = options.selected ? theme.copperBright : theme.muted;
      border = options.selected ? withAlpha(theme.copper, 0.65) : 'transparent';
    } else {
      bg = options.selected ? withAlpha(theme.copper, 0.2) : hover ? theme.panel3 : theme.panel2;
      border = options.selected ? theme.copper : theme.border;
    }
    if (hover && !options.disabled && variant !== 'tab') bg = this.lighten(bg, 0.08);
    if (pressed && !options.disabled) bg = this.darken(bg, 0.12);

    ctx.save();
    this.roundRect(rect.x, rect.y, rect.w, rect.h, Math.min(11, rect.h / 3));
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = options.disabled ? withAlpha(theme.border, 0.45) : border;
    ctx.stroke();
    if (options.selected && variant !== 'tab') {
      ctx.fillStyle = theme.copper;
      this.roundRect(rect.x + 8, rect.y + rect.h - 3, rect.w - 16, 2, 1);
      ctx.fill();
    }
    ctx.restore();

    const fontSize = options.fontSize ?? 13.5;
    this.text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5, {
      size: fontSize,
      weight: 800,
      color: options.disabled ? withAlpha(theme.text, 0.38) : fg,
      align: 'center',
      baseline: 'middle',
    });
    return false;
  }

  /** Draws a button and invokes onActivate on a valid click. */
  buttonAction(
    id: string,
    rect: Rect,
    label: string,
    onActivate: () => void,
    options: ButtonOptions = {},
  ): void {
    // Replace the visual-only region handler by registering an actionable region first,
    // then draw the button visuals using the same id state.
    this.region(id, rect, { disabled: options.disabled, onActivate });
    this.buttonVisual(rect, label, options, id);
  }

  private buttonVisual(rect: Rect, label: string, options: ButtonOptions, id: string): void {
    const hover = this.hoverId === id && !options.disabled;
    const pressed = this.pressedId === id && !options.disabled;
    const ctx = this.ctx;
    const variant = options.variant ?? 'ghost';
    let bg = theme.panel3;
    let fg = theme.text;
    let border = theme.border;
    if (variant === 'primary') {
      bg = options.disabled ? withAlpha(theme.copper, 0.35) : theme.copper;
      fg = '#1c1208';
      border = withAlpha(theme.copperBright, 0.8);
    } else if (variant === 'success') {
      bg = options.disabled ? withAlpha(theme.green, 0.25) : withAlpha(theme.green, 0.9);
      fg = '#0c1a0a';
      border = theme.green;
    } else if (variant === 'danger') {
      bg = withAlpha(theme.red, options.disabled ? 0.18 : 0.82);
      fg = options.disabled ? withAlpha(theme.text, 0.45) : '#210b08';
      border = theme.red;
    } else if (variant === 'gold') {
      bg = options.disabled ? withAlpha(theme.gold, 0.25) : theme.gold;
      fg = '#211704';
      border = theme.gold;
    } else if (variant === 'tab') {
      bg = options.selected ? withAlpha(theme.copper, 0.24) : hover ? withAlpha(theme.panel3, 0.7) : 'transparent';
      fg = options.selected ? theme.copperBright : hover ? theme.text : theme.muted;
      border = options.selected ? withAlpha(theme.copper, 0.7) : withAlpha(theme.borderSoft, 0.2);
    } else {
      bg = options.selected ? withAlpha(theme.copper, 0.2) : hover ? theme.panel3 : theme.panel2;
      border = options.selected ? theme.copper : theme.border;
    }
    if (hover && !options.disabled && variant !== 'tab') bg = this.lighten(bg, 0.07);
    if (pressed && !options.disabled) bg = this.darken(bg, 0.12);

    ctx.save();
    if (options.disabled) ctx.globalAlpha = 0.72;
    this.roundRect(rect.x, rect.y, rect.w, rect.h, Math.min(11, rect.h / 3));
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = options.disabled ? withAlpha(theme.border, 0.45) : border;
    ctx.stroke();
    ctx.restore();

    if (options.icon) {
      this.text(options.icon, rect.x + 14, rect.y + rect.h / 2 + 1, {
        size: (options.fontSize ?? 14) + 2,
        baseline: 'middle',
        color: options.disabled ? withAlpha(theme.text, 0.35) : fg,
      });
    }
    const lines = label.split('\n');
    const align = options.align ?? 'center';
    if (lines.length === 1) {
      const x = align === 'left' ? rect.x + 14 + (options.icon ? 20 : 0) : rect.x + rect.w / 2 + (options.icon ? 8 : 0);
      this.text(label, x, rect.y + rect.h / 2 + 0.5, {
        size: options.fontSize ?? 13.5,
        weight: 800,
        color: options.disabled ? withAlpha(theme.text, 0.38) : fg,
        align,
        baseline: 'middle',
      });
    } else {
      lines.forEach((line, i) => {
        const y = rect.y + rect.h / 2 - ((lines.length - 1) * 8) + i * 17;
        const x = align === 'left' ? rect.x + 12 : rect.x + rect.w / 2;
        this.text(line, x, y, {
          size: i === 0 ? options.fontSize ?? 12.5 : (options.fontSize ?? 12.5) - 1.5,
          weight: i === 0 ? 900 : 700,
          color: i === 0 ? (options.disabled ? withAlpha(theme.text, 0.38) : fg) : withAlpha(fg, 0.78),
          align,
          baseline: 'middle',
        });
      });
    }
  }

  slider(
    id: string,
    x: number,
    y: number,
    w: number,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    format?: (v: number) => string,
    accent = theme.copper,
  ): void {
    const valueText = format ? format(value) : value.toFixed(step < 1 ? 1 : 0);
    this.text(label, x, y + 12, { size: 12.5, weight: 700, color: theme.muted });
    this.text(valueText, x + w, y + 12, { size: 13, weight: 900, color: theme.text, align: 'right', font: 'num' });
    const track: Rect = { x, y: y + 24, w, h: 7 };
    const hit: Rect = { x, y: y + 16, w, h: 22 };
    this.region(id, hit, { onSlide: onChange, slider: { min, max, step }, cursor: 'ew-resize' });
    const ratio = clamp((value - min) / (max - min), 0, 1);
    const ctx = this.ctx;
    ctx.save();
    this.roundRect(track.x, track.y, track.w, track.h, 4);
    ctx.fillStyle = withAlpha(theme.bg0, 0.65);
    ctx.fill();
    this.roundRect(track.x, track.y, Math.max(track.h, track.w * ratio), track.h, 4);
    ctx.fillStyle = accent;
    ctx.fill();
    const knobX = track.x + track.w * ratio;
    ctx.beginPath();
    ctx.arc(knobX, track.y + track.h / 2, 9.5, 0, Math.PI * 2);
    ctx.fillStyle = theme.cream;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.restore();
  }

  progress(
    x: number,
    y: number,
    w: number,
    h: number,
    value: number,
    color = theme.copper,
    label?: string,
  ): void {
    const ctx = this.ctx;
    const v = clamp(value, 0, 1);
    ctx.save();
    this.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = withAlpha(theme.bg0, 0.72);
    ctx.fill();
    if (v > 0.01) {
      this.roundRect(x, y, Math.max(h, w * v), h, h / 2);
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, withAlpha(color, 0.72));
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
    if (label) {
      this.text(label, x + w / 2, y + h / 2 + 0.5, {
        size: Math.max(10, h - 5),
        weight: 900,
        color: theme.text,
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  tag(x: number, y: number, text: string, color = theme.copper, width?: number): number {
    const padX = 9;
    this.ctx.save();
    this.ctx.font = `800 11.5px ${FONT.sans}`;
    const w = width ?? this.ctx.measureText(text).width + padX * 2;
    this.roundRect(x, y, w, 22, 11);
    this.ctx.fillStyle = withAlpha(color, 0.16);
    this.ctx.fill();
    this.ctx.strokeStyle = withAlpha(color, 0.55);
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    this.ctx.restore();
    this.text(text, x + w / 2, y + 11.5, { size: 11.5, weight: 900, color, align: 'center', baseline: 'middle' });
    return w;
  }

  private lighten(color: string, amount: number): string {
    return this.mix(color, '#ffffff', amount);
  }

  private darken(color: string, amount: number): string {
    return this.mix(color, '#000000', amount);
  }

  private mix(color: string, target: string, amount: number): string {
    // rgba() colors are returned untouched; widget callers mostly pass hex.
    if (color.startsWith('rgb')) return color;
    const a = parseInt(color.replace('#', ''), 16);
    const b = parseInt(target.replace('#', ''), 16);
    const r = Math.round(((a >> 16) & 255) * (1 - amount) + ((b >> 16) & 255) * amount);
    const g = Math.round(((a >> 8) & 255) * (1 - amount) + ((b >> 8) & 255) * amount);
    const bl = Math.round((a & 255) * (1 - amount) + (b & 255) * amount);
    return `rgb(${r},${g},${bl})`;
  }
}
