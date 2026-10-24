import type { BaseStat, EnemySummary, ProgressItem } from "./enemy-summary.ts";
import type { StarterSummary } from "./starter-select.ts";
import type { WindowStyle } from "./window-style.ts";

/** What the overlay describes: an enemy in battle, or a starter on the starter select screen. */
export type OverlaySummary = EnemySummary | StarterSummary;

const CLASS_PREFIX = "peh";
/** The game draws its 320-pixel-wide UI layout onto a canvas six times as wide. */
const CANVAS_PIXELS_PER_UI_PIXEL = 6;
/** Gap between the pointer and the window in UI pixels, as the game leaves beside its own tooltips. */
const POINTER_GAP = 2;
const VIEWPORT_MARGIN = 8;
/** Base stat value that fills a stat bar completely. */
const STAT_BAR_MAX = 200;

/**
 * Text sizes and shadow offsets in game canvas pixels, as the game's arena flyout draws its
 * header (`BATTLE_INFO` at 54), column headings (the `SUMMARY_*` styles at 54) and effect lines
 * (`BATTLE_INFO` at 48). Shadow offsets come from `getTextStyleOptions` in `src/ui/text.ts`.
 */
const TEXT_KINDS = {
  title: { fontSize: 54, shadowOffset: 3.5 },
  heading: { fontSize: 54, shadowOffset: 3 },
  body: { fontSize: 48, shadowOffset: 3.5 },
} as const;
type TextKind = keyof typeof TEXT_KINDS;

type Theme = "modern" | "legacy" | "fallback";
type TextTone = "text" | "heading" | "good" | "missing";
type GameTextFactory = (content: string, tone: TextTone, kind: TextKind) => HTMLCanvasElement;

interface TextColors {
  fill: string;
  shadow: string;
}

/**
 * The modern colors and the legacy body text are the game's battle text styles from
 * `src/ui/text.ts`. The other legacy tones are darker than the game's, dark with a light shadow
 * like its body text, so they stay readable on the light window.
 */
const MODERN_PALETTE: Record<TextTone, TextColors> = {
  text: { fill: "#f8f8f8", shadow: "#6b5a73" },
  heading: { fill: "#f8b050", shadow: "#c07800" },
  good: { fill: "#78c850", shadow: "#306850" },
  missing: { fill: "#f89890", shadow: "#984038" },
};
const PALETTES: Record<Theme, Record<TextTone, TextColors>> = {
  modern: MODERN_PALETTE,
  fallback: MODERN_PALETTE,
  legacy: {
    text: { fill: "#404040", shadow: "#ded6b5" },
    heading: { fill: "#a86000", shadow: "#f0d8a8" },
    good: { fill: "#2f8030", shadow: "#c0e0b8" },
    missing: { fill: "#c04010", shadow: "#f8c8b0" },
  },
};

// Laid out like the game's arena flyout, in game UI pixels (`--peh-px`): a thin window with the
// title on an extra-thin tab across its top edge, and text rows 8 UI pixels apart. The tab is
// at least two borders tall so its frame draws at full scale.
const STYLES = `
.${CLASS_PREFIX}-root {
  --peh-px: 4px;
  --peh-border: 8;
  --peh-tab-height: max(14, calc(var(--peh-border) * 2));
  --peh-bar-track: rgba(255, 255, 255, 0.16);
  position: fixed;
  z-index: 2147483647;
  display: none;
  box-sizing: content-box;
  margin-top: calc(var(--peh-px) * var(--peh-tab-height) / 2);
  padding: calc(var(--peh-px) * 4) calc(var(--peh-px) * 2) var(--peh-px);
  border-style: solid;
  border-color: transparent;
  border-width: calc(var(--peh-px) * 4);
  border-image-source: var(--peh-window);
  border-image-slice: var(--peh-border) fill;
  border-image-width: calc(var(--peh-px) * var(--peh-border));
  image-rendering: pixelated;
  pointer-events: none;
}
.${CLASS_PREFIX}-root[data-kind="enemy"] { min-width: calc(var(--peh-px) * 120); }
.${CLASS_PREFIX}-root[data-theme="legacy"] { --peh-bar-track: rgba(0, 0, 0, 0.12); }
.${CLASS_PREFIX}-root[data-theme="fallback"] {
  border: 2px solid #5b6478;
  border-image: none;
  border-radius: 6px;
  background: rgba(22, 24, 33, 0.94);
}
.${CLASS_PREFIX}-root canvas { display: block; image-rendering: pixelated; }
/*
 * The tab stays in flow, so the window is always wider than the title. Its margins lift it past
 * the window's 4-pixel top border and padding to straddle the top edge, and its minimum width is
 * half the window's padding box.
 */
.${CLASS_PREFIX}-tab {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: max-content;
  min-width: calc(50% + var(--peh-px) * 2);
  height: calc(var(--peh-px) * var(--peh-tab-height));
  margin: calc(var(--peh-px) * (-8 - var(--peh-tab-height) / 2)) auto
    calc(var(--peh-px) * (8 - var(--peh-tab-height) / 2));
  padding: 0 calc(var(--peh-px) * 6);
  border-style: solid;
  border-color: transparent;
  border-width: var(--peh-px);
  border-image-source: var(--peh-tab-window);
  border-image-slice: var(--peh-border) fill;
  border-image-width: calc(var(--peh-px) * var(--peh-border));
  white-space: nowrap;
}
.${CLASS_PREFIX}-root[data-theme="fallback"] .${CLASS_PREFIX}-tab {
  border: 2px solid #5b6478;
  border-image: none;
  border-radius: 6px;
  background: rgb(22, 24, 33);
}
/* Headings sit in the centre column, with any side note right-aligned in the last one. */
.${CLASS_PREFIX}-heading-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; }
.${CLASS_PREFIX}-heading-title { grid-column: 2; }
.${CLASS_PREFIX}-heading-note { grid-column: 3; justify-self: end; }
.${CLASS_PREFIX}-heading-row + .${CLASS_PREFIX}-heading-row,
.${CLASS_PREFIX}-stats + .${CLASS_PREFIX}-heading-row { margin-top: calc(var(--peh-px) * 2); }
.${CLASS_PREFIX}-stats {
  display: grid;
  grid-template-rows: repeat(3, auto);
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  column-gap: calc(var(--peh-px) * 8);
}
.${CLASS_PREFIX}-stat {
  display: grid;
  grid-template-columns: calc(var(--peh-px) * 12) 1fr calc(var(--peh-px) * 11);
  align-items: center;
  column-gap: calc(var(--peh-px) * 2);
}
.${CLASS_PREFIX}-stat-value { justify-self: end; }
.${CLASS_PREFIX}-bar { height: calc(var(--peh-px) * 2); background: var(--peh-bar-track); }
.${CLASS_PREFIX}-bar-fill { height: 100%; }
/*
 * Three columns spread to both edges. The last column's items align to the right edge, so each
 * row reaches both edges, and the other columns' items align left so their lines start together.
 */
.${CLASS_PREFIX}-progress {
  display: grid;
  grid-template-columns: repeat(3, auto);
  justify-content: space-between;
  column-gap: calc(var(--peh-px) * 4);
}
.${CLASS_PREFIX}-progress > :nth-child(3n) { justify-self: end; }
.${CLASS_PREFIX}-centered { margin-inline: auto; }
`;

export interface OverlayAppearance {
  /** CSS pixels per game UI pixel. */
  uiPixelSize: number;
  /** The game's current windows, or `null` to fall back to a plain dark panel. */
  windowStyle: WindowStyle | null;
}

/** Tooltip drawn over the game canvas next to the pointer. */
export class HoverOverlay {
  private element: HTMLDivElement | null = null;
  private renderedKey: string | null = null;
  private appearanceKey = "";

  /** Shows the summary next to the pointer, rebuilding it only when the target, theme or scale changes. */
  show(
    targetKey: string,
    buildSummary: () => OverlaySummary,
    clientX: number,
    clientY: number,
    appearance: OverlayAppearance,
  ): void {
    const element = this.getElement();
    const theme = this.applyAppearance(element, appearance);
    const renderKey = `${targetKey}|${theme}|${appearance.uiPixelSize}`;
    if (renderKey !== this.renderedKey) {
      const summary = buildSummary();
      const canvasPixelSize = appearance.uiPixelSize / CANVAS_PIXELS_PER_UI_PIXEL;
      element.dataset.kind = summary.kind;
      element.replaceChildren(...renderSummary(summary, PALETTES[theme], canvasPixelSize));
      this.renderedKey = renderKey;
    }
    element.style.display = "block";
    positionNearPointer(element, clientX, clientY, appearance.uiPixelSize);
  }

  hide(): void {
    if (this.element) {
      this.element.style.display = "none";
    }
    this.renderedKey = null;
  }

  private applyAppearance(element: HTMLDivElement, { uiPixelSize, windowStyle }: OverlayAppearance): Theme {
    const theme: Theme = windowStyle ? (windowStyle.isLegacy ? "legacy" : "modern") : "fallback";
    const devicePixelRatio = window.devicePixelRatio || 1;
    const appearanceKey = `${windowStyle?.textureKey ?? "fallback"}|${uiPixelSize}|${devicePixelRatio}`;
    if (appearanceKey === this.appearanceKey) {
      return theme;
    }
    this.appearanceKey = appearanceKey;
    element.dataset.theme = theme;
    // Whole device pixels per game pixel keep the window frame's pixels even.
    const snappedUiPixelSize = Math.max(1, Math.round(uiPixelSize * devicePixelRatio)) / devicePixelRatio;
    element.style.setProperty("--peh-px", `${snappedUiPixelSize}px`);
    if (windowStyle) {
      element.style.setProperty("--peh-window", `url("${windowStyle.windowImageUrl}")`);
      element.style.setProperty("--peh-tab-window", `url("${windowStyle.tabImageUrl}")`);
      element.style.setProperty("--peh-border", String(windowStyle.borderSize));
    }
    return theme;
  }

  private getElement(): HTMLDivElement {
    if (!this.element) {
      const style = document.createElement("style");
      style.textContent = STYLES;
      document.head.append(style);
      this.element = createElement("div", "root");
      document.body.append(this.element);
    }
    return this.element;
  }
}

function renderSummary(
  summary: OverlaySummary,
  palette: Record<TextTone, TextColors>,
  canvasPixelSize: number,
): HTMLElement[] {
  const text: GameTextFactory = (content, tone, kind) => createGameText(content, palette[tone], kind, canvasPixelSize);

  const tab = createElement("div", "tab");
  tab.append(text(summary.title, "text", "title"));
  return [tab, ...(summary.kind === "enemy" ? renderEnemyBody(summary, text) : renderStarterBody(summary, text))];
}

function renderStarterBody(summary: StarterSummary, text: GameTextFactory): HTMLElement[] {
  return [withClass(text(summary.natures.text, getProgressTone(summary.natures), "body"), "centered")];
}

function renderEnemyBody(summary: EnemySummary, text: GameTextFactory): HTMLElement[] {
  const statsHeading = createElement("div", "heading-row");
  statsHeading.append(
    withClass(text("Base Stats", "heading", "heading"), "heading-title"),
    withClass(text(`BST ${summary.baseStatTotal}`, "heading", "heading"), "heading-note"),
  );
  const stats = createElement("div", "stats");
  stats.append(...summary.baseStats.map(stat => renderStat(stat, text)));
  const nodes: HTMLElement[] = [statsHeading, stats];

  if (summary.starterProgress.length > 0) {
    const progressHeading = createElement("div", "heading-row");
    progressHeading.append(withClass(text("Starter Progress", "heading", "heading"), "heading-title"));
    const progress = createElement("div", "progress");
    progress.append(...summary.starterProgress.map(item => text(item.text, getProgressTone(item), "body")));
    nodes.push(progressHeading, progress);
  }
  return nodes;
}

function renderStat(stat: BaseStat, text: GameTextFactory): HTMLElement {
  const cell = createElement("div", "stat");
  const bar = createElement("div", "bar");
  const fill = createElement("div", "bar-fill");
  fill.style.width = `${Math.min(stat.value / STAT_BAR_MAX, 1) * 100}%`;
  // Hue runs from red for low stats to cyan for high ones.
  fill.style.background = `hsl(${Math.min(Math.floor((stat.value * 180) / 255), 180)}, 85%, 50%)`;
  bar.append(fill);
  cell.append(text(stat.label, "text", "body"), bar, withClass(text(String(stat.value), "text", "body"), "stat-value"));
  return cell;
}

function getProgressTone(item: ProgressItem): TextTone {
  return item.state === "done" ? "good" : item.state === "missing" ? "missing" : "text";
}

/**
 * Draws one line of text as Phaser's text objects do: on a canvas at the game's own resolution,
 * with the game's drop shadow. The canvas is then scaled by the same factor as the game's canvas,
 * so the browser renders it the same way as the game's text.
 */
function createGameText(text: string, colors: TextColors, kind: TextKind, canvasPixelSize: number): HTMLCanvasElement {
  const { fontSize, shadowOffset } = TEXT_KINDS[kind];
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", text);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }
  const font = `${fontSize}px emerald`;
  context.font = font;
  canvas.width = Math.ceil(context.measureText(text).width + shadowOffset);
  canvas.height = Math.ceil(fontSize + shadowOffset);
  // Resizing the canvas resets its drawing state.
  context.font = font;
  context.fillStyle = colors.fill;
  context.shadowColor = colors.shadow;
  context.shadowOffsetX = shadowOffset;
  context.shadowOffsetY = shadowOffset;
  // A line one em tall centres the font's 0.75 em ascent and 0.125 em descent, as CSS does.
  context.fillText(text, 0, fontSize * 0.8125);
  canvas.style.width = `${canvas.width * canvasPixelSize}px`;
  canvas.style.height = `${canvas.height * canvasPixelSize}px`;
  // Rows are spaced by the font size alone; the shadow below the last line overhangs it.
  canvas.style.marginBottom = `${(fontSize - canvas.height) * canvasPixelSize}px`;
  return canvas;
}

/**
 * Places the window just below and left of the pointer. Enemies stand on the right of the battle
 * field, so that side has room for every enemy, and the overlay stays put when moving between the
 * two enemies of a double battle. The starter grid also sits right of centre on its screen. Like
 * the game's tooltips, the window moves right of the pointer or above it where it would not fit.
 */
function positionNearPointer(element: HTMLElement, clientX: number, clientY: number, uiPixelSize: number): void {
  const gap = POINTER_GAP * uiPixelSize;
  // The element's box starts at the window's frame; the tab rises above it by the top margin.
  const { width, height } = element.getBoundingClientRect();
  const tabRise = Number.parseFloat(getComputedStyle(element).marginTop) || 0;
  let left = clientX - gap - width;
  if (left < VIEWPORT_MARGIN) {
    left = clientX + gap;
  }
  let windowTop = clientY + gap;
  if (windowTop + height > window.innerHeight - VIEWPORT_MARGIN) {
    windowTop = clientY - gap - height;
  }
  element.style.left = `${Math.max(left, VIEWPORT_MARGIN)}px`;
  element.style.top = `${Math.max(windowTop - tabRise, VIEWPORT_MARGIN)}px`;
}

function withClass<T extends HTMLElement>(element: T, classSuffix: string): T {
  element.classList.add(`${CLASS_PREFIX}-${classSuffix}`);
  return element;
}

function createElement<TagName extends keyof HTMLElementTagNameMap>(
  tagName: TagName,
  classSuffix: string,
): HTMLElementTagNameMap[TagName] {
  const element = document.createElement(tagName);
  element.className = `${CLASS_PREFIX}-${classSuffix}`;
  return element;
}
