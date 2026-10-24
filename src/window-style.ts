import { LEGACY_TEXTURE_SUFFIX, LEGACY_WINDOW_BORDER_SIZE, WINDOW_BORDER_SIZE } from "./constants.ts";
import type { BattleSceneView } from "./game-types.ts";

/** The window textures the game currently draws, which reflect both the UI theme and the window type. */
export interface WindowStyle {
  textureKey: string;
  isLegacy: boolean;
  /** Data URL of the thin window, which the game's arena flyout uses for its body. */
  windowImageUrl: string;
  /** Data URL of the extra-thin window, which the arena flyout uses for its header tab. */
  tabImageUrl: string;
  /** Nine-slice border size in texture pixels, the same for every window variant. */
  borderSize: number;
}

/** Splits a window texture key such as `window_1_legacy` into its window type and theme suffix. */
const WINDOW_TEXTURE_KEY = new RegExp(`^(window_\\d+)(${LEGACY_TEXTURE_SUFFIX})?$`);

const imageUrlsByTextureKey = new Map<string, string>();

/** Reads the style from the game's own tooltip window, so it follows setting changes. */
export function readWindowStyle(battleScene: BattleSceneView): WindowStyle | null {
  const textureKey = battleScene.ui?.tooltipBg?.texture?.key;
  const keyParts = textureKey ? WINDOW_TEXTURE_KEY.exec(textureKey) : null;
  if (!textureKey || !keyParts) {
    return null;
  }
  const [, windowTypeKey, themeSuffix = ""] = keyParts;
  const windowImageUrl =
    readTextureImageUrl(battleScene, `${windowTypeKey}_thin${themeSuffix}`) ?? readTextureImageUrl(battleScene, textureKey);
  if (!windowImageUrl) {
    return null;
  }
  const isLegacy = themeSuffix === LEGACY_TEXTURE_SUFFIX;
  return {
    textureKey,
    isLegacy,
    windowImageUrl,
    tabImageUrl: readTextureImageUrl(battleScene, `${windowTypeKey}_xthin${themeSuffix}`) ?? windowImageUrl,
    borderSize: isLegacy ? LEGACY_WINDOW_BORDER_SIZE : WINDOW_BORDER_SIZE,
  };
}

function readTextureImageUrl(battleScene: BattleSceneView, textureKey: string): string | null {
  const cachedUrl = imageUrlsByTextureKey.get(textureKey);
  if (cachedUrl) {
    return cachedUrl;
  }
  if (!battleScene.textures.exists(textureKey)) {
    return null;
  }
  const imageUrl = toDataUrl(battleScene.textures.get(textureKey).getSourceImage());
  if (imageUrl) {
    imageUrlsByTextureKey.set(textureKey, imageUrl);
  }
  return imageUrl;
}

/** Phaser revokes the blob URLs it loads images from, so the image is copied into a data URL. */
function toDataUrl(source: unknown): string | null {
  if (source instanceof HTMLCanvasElement) {
    return source.toDataURL("image/png");
  }
  if (!(source instanceof HTMLImageElement) || source.naturalWidth === 0) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.drawImage(source, 0, 0);
  return canvas.toDataURL("image/png");
}
