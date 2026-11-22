// Draws the extension's icon, a gray Poké Ball with a pointer, as pixel art into static/icons.
// A 16 px grid without the pointer gives the 16 and 32 px icons; a 24 px grid gives the 48 px icon
// and, with 16 px of padding on each side, the 128 px one.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

type Rgba = readonly [number, number, number, number];
type Grid = string[][];

const projectPath = (relativePath: string): string => fileURLToPath(new URL(`../${relativePath}`, import.meta.url));

const hexColor = (hex: string): Rgba => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
  255,
];

// Each grid cell holds one of these keys, or "." for a transparent pixel.
const palette: Record<string, Rgba> = {
  ".": [0, 0, 0, 0],
  K: hexColor("#202028"), // outline, band and pointer edge
  W: hexColor("#f8f8f8"), // lower half, button and pointer
  w: hexColor("#c8c8d4"), // lower half shade
  G: hexColor("#8c8c98"), // upper half
  g: hexColor("#686874"), // upper half shade
  L: hexColor("#c8c8d0"), // upper half highlight
};

const pointerSprite = [
  "K.......",
  "KK......",
  "KWK.....",
  "KWWK....",
  "KWWWK...",
  "KWWWWK..",
  "KWWWWWK.",
  "KWWWWWWK",
  "KWWWKKKK",
  "KWKWWK..",
  "KK.KWWK.",
  "....KWWK",
  ".....KK.",
];

const emptyGrid = (size: number): Grid => Array.from({ length: size }, () => Array.from({ length: size }, () => "."));

const setCell = (grid: Grid, row: number, column: number, key: string): void => {
  const gridRow = grid[row];
  if (gridRow && column >= 0 && column < gridRow.length) {
    gridRow[column] = key;
  }
};

// Copies a sprite onto the grid; its "." cells leave the grid unchanged.
const stamp = (grid: Grid, sprite: readonly string[], top: number, left: number): void => {
  sprite.forEach((line, rowOffset) => {
    [...line].forEach((key, columnOffset) => {
      if (key !== ".") {
        setCell(grid, top + rowOffset, left + columnOffset, key);
      }
    });
  });
};

const insideDisk = (row: number, column: number, centerRow: number, centerColumn: number, radius: number): boolean =>
  (row + 0.5 - centerRow) ** 2 + (column + 0.5 - centerColumn) ** 2 <= radius ** 2;

// A cell of a shape is on its outline when one of its four neighbours lies outside the shape.
const isOutline = (inside: (row: number, column: number) => boolean, row: number, column: number): boolean =>
  !inside(row - 1, column) || !inside(row + 1, column) || !inside(row, column - 1) || !inside(row, column + 1);

// The gray ball the game shows beside an enemy's name when catching it would unlock something.
const drawBall = (grid: Grid, top: number, left: number, diameter: number): void => {
  const radius = diameter / 2;
  const centerRow = top + radius;
  const centerColumn = left + radius;
  const bandHalfHeight = 1;
  const buttonRadius = diameter >= 18 ? 3.5 : 3;
  const highlightRow = centerRow - radius * 0.5;
  const highlightColumn = centerColumn - radius * 0.45;
  const inBall = (row: number, column: number): boolean => insideDisk(row, column, centerRow, centerColumn, radius);
  const inButton = (row: number, column: number): boolean =>
    insideDisk(row, column, centerRow, centerColumn, buttonRadius);
  // Cells outside this smaller disk, shifted up and left, form the shaded lower-right rim.
  const inUnshaded = (row: number, column: number): boolean =>
    insideDisk(row, column, centerRow - 1, centerColumn - 1, radius - 1);
  for (let row = top; row < top + diameter; row++) {
    for (let column = left; column < left + diameter; column++) {
      if (!inBall(row, column)) {
        continue;
      }
      const rowFromCenter = row + 0.5 - centerRow;
      const columnFromCenter = column + 0.5 - centerColumn;
      let key: string;
      if (isOutline(inBall, row, column)) {
        key = "K";
      } else if (inButton(row, column)) {
        key = isOutline(inButton, row, column) ? "K" : "W";
      } else if (Math.abs(rowFromCenter) <= bandHalfHeight) {
        key = "K";
      } else if (rowFromCenter < 0) {
        // Light a spot at the upper left; shade the rim and the row just above the band.
        if (insideDisk(row, column, highlightRow, highlightColumn, 1.3)) {
          key = "L";
        } else if (!inUnshaded(row, column) || rowFromCenter > -bandHalfHeight - 1) {
          key = "g";
        } else {
          key = "G";
        }
      } else {
        key = !inUnshaded(row, column) && columnFromCenter > -radius / 2 ? "w" : "W";
      }
      setCell(grid, row, column, key);
    }
  }
};

const drawGrid = (size: number, draw: (grid: Grid) => void): Grid => {
  const grid = emptyGrid(size);
  draw(grid);
  return grid;
};

// The pointer is too small to read at 16 px, so the small grid leaves it out.
const smallGrid = drawGrid(16, (grid) => drawBall(grid, 0, 0, 16));
const largeGrid = drawGrid(24, (grid) => {
  drawBall(grid, 0, 1, 18);
  stamp(grid, pointerSprite, 11, 13);
});

const pngChunk = (type: string, data: Buffer): Buffer => {
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
};

// Encodes a square image as an 8-bit RGBA PNG.
const encodePng = (size: number, pixelAt: (x: number, y: number) => Rgba): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const rowLength = size * 4 + 1;
  const scanlines = Buffer.alloc(size * rowLength);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      scanlines.set(pixelAt(x, y), y * rowLength + 1 + x * 4);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

// Scales a grid by a whole number, leaving `padding` transparent pixels on each side.
const renderGrid = (grid: Grid, scale: number, padding = 0): Buffer =>
  encodePng(grid.length * scale + padding * 2, (x, y) => {
    const key = grid[Math.floor((y - padding) / scale)]?.[Math.floor((x - padding) / scale)] ?? ".";
    const color = palette[key];
    if (!color) {
      throw new Error(`No palette color for "${key}"`);
    }
    return color;
  });

const icons: [size: number, png: Buffer][] = [
  [16, renderGrid(smallGrid, 1)],
  [32, renderGrid(smallGrid, 2)],
  [48, renderGrid(largeGrid, 2)],
  // The Chrome Web Store layout: 96 px of art with 16 px of transparent padding on each side.
  [128, renderGrid(largeGrid, 4, 16)],
];

await mkdir(projectPath("static/icons"), { recursive: true });
for (const [size, png] of icons) {
  await writeFile(projectPath(`static/icons/icon-${size}.png`), png);
}
console.log(`Wrote ${icons.length} icons to static/icons`);
