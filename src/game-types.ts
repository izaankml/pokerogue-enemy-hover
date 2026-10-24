// Structural views of the PokeRogue and Phaser objects this extension reads.
// Only the members the extension uses are declared, so a change to any of them
// in the game shows up here as the single place to update.

export interface PhaserGameView {
  canvas: HTMLCanvasElement | null;
  scene: {
    getScene(key: string): unknown;
  };
}

export interface BattleSceneView {
  gameData?: GameDataView;
  currentBattle?: { waveIndex: number } | null;
  gameMode?: { isClassic: boolean };
  phaseManager?: { getCurrentPhase(): { phaseName: string } | null };
  /** The player's held and persistent items. */
  modifiers?: readonly object[];
  ui?: UiView;
  textures: TextureManagerView;
  getEnemyField(active?: boolean): EnemyPokemonView[];
}

export interface UiView {
  getHandler(): object | undefined;
  /** Every UI handler, indexed by `UiMode`. */
  handlers?: readonly (UiHandlerView | undefined)[];
  /** Window behind the game's own tooltips, textured with the current window style and theme. */
  tooltipBg?: { texture?: { key: string } };
}

export interface UiHandlerView {
  /**
   * Set while the handler's screen is shown, and cleared when it closes. The evolution scene
   * never clears it, so its `messageContainer` shows whether it is open.
   */
  active?: boolean;
  /** The evolution scene's message window, shown only while the scene is open. */
  messageContainer?: { visible: boolean };
  /** Every starter species, on the Pokédex page handler. */
  allSpecies?: readonly SpeciesView[];
}

/** The starter select screen's handler. These members are private in the game's types. */
export interface StarterSelectUiHandlerView {
  /** The grid's cells. Those past the end of the filtered starter list are hidden. */
  starterContainers?: readonly StarterContainerView[];
  filterBar?: { openDropDown: boolean };
  starterSelectMessageBoxContainer?: { visible: boolean };
}

/** The party screen's handler. These members are private in the game's types. */
export interface PartyUiHandlerView {
  /** Why the screen is open, as a `PartyUiMode` value. */
  partyUiMode?: number;
  /** One slot per party member, built anew each time the screen opens. */
  partySlots?: readonly PartySlotView[];
}

/** One party member's slot on the party screen. */
export interface PartySlotView {
  /** Shown in place of the HP bar, as when choosing a TM's target. */
  slotDescriptionLabel: TextView;
  slotHpLabel: GameObjectView;
  slotHpBar: GameObjectView;
  slotHpOverlay: GameObjectView;
  slotHpText: GameObjectView;
  getPokemon(): PlayerPokemonView;
}

/**
 * The reward screen's handler. It stays open beneath the party screen while a reward's target is
 * chosen, with its cursor on that reward.
 */
export interface ModifierSelectUiHandlerView extends UiHandlerView {
  /** Private in the game's types. */
  rowCursor?: number;
  /** Position within the row. Protected in the game's types. */
  cursor?: number;
  /** The rewards on offer. */
  options?: readonly { modifierTypeOption: { type?: ModifierTypeView } }[];
}

export interface ModifierTypeView {
  /** The nature a mint sets. Protected in the game's types. */
  nature?: number;
}

export interface GameObjectView {
  setVisible(visible: boolean): unknown;
}

export interface TextView extends GameObjectView {
  setText(text: string): unknown;
  setColor(color: string): unknown;
  setShadowColor(color: string): unknown;
}

/** The option menu's handler, which reads each option's color when the menu opens. */
export interface OptionSelectUiHandlerView {
  /** Opens the menu. The first argument is its configuration. */
  show(args: unknown[]): boolean;
}

export interface OptionSelectConfigView {
  options?: OptionSelectItemView[];
}

/** One menu option. */
export interface OptionSelectItemView {
  /** Localized text, which for a biome is the biome's name. */
  label: string;
  /** A `TextStyle` value for the option's text. */
  color?: number;
}

/** One cell of the starter select grid. */
export interface StarterContainerView {
  visible: boolean;
  species: SpeciesView;
  getWorldTransformMatrix(): TransformMatrixView;
}

export interface TextureManagerView {
  exists(key: string): boolean;
  get(key: string): { getSourceImage(): unknown };
  getPixelAlpha(x: number, y: number, key: string, frame: string | number): number | null;
}

export interface GameDataView {
  dexData: Record<number, DexEntryView | undefined>;
  starterData: Record<number, StarterDataEntryView | undefined>;
  getSpeciesStarterValue(speciesId: number, valueReduction?: number): number;
}

export interface DexEntryView {
  /** Battles the species has appeared in, which the Pokédex shows as "Fought" once it is above zero. */
  seenCount: number;
  caughtAttr: bigint;
  natureAttr: number;
  ivs: number[];
}

export interface StarterDataEntryView {
  abilityAttr: number;
  passiveAttr: number;
  eggMoves: number;
  valueReduction: number;
  candyCount: number;
}

export interface SpeciesView {
  speciesId: number;
  /** Localized species name. */
  name: string;
  ability2: number;
  getRootSpeciesId(forStarter?: boolean): number;
  /** Every earlier stage of the species' line, each with the level it evolves at. */
  getPrevolutionLevels(): readonly (readonly [speciesId: number, level: number])[];
  getFullUnlocksData(): bigint;
}

export interface SpeciesFormView {
  baseStats: readonly number[];
}

export interface EnemyPokemonView {
  id: number;
  name: string;
  level: number;
  visible: boolean;
  species: SpeciesView;
  abilityIndex: number;
  nature: number;
  ivs: readonly number[];
  /** The enemy's name panel, which carries the owned icon. */
  battleInfo?: { ownedIcon?: OwnedIconView };
  getDexAttr(): bigint;
  getSpeciesForm(ignoreOverride?: boolean): SpeciesFormView;
  getFusionSpeciesForm(ignoreOverride?: boolean): SpeciesFormView;
  getSprite(): SpriteView | undefined;
  isFusion(): boolean;
  hasTrainer(): boolean;
  isOnField(): boolean;
}

export interface PlayerPokemonView {
  species: SpeciesView;
  /** The current nature, including one a mint has set. */
  getNature(): number;
}

/** The Poké Ball next to an enemy's name, shown once its species has been caught. */
export interface OwnedIconView {
  visible: boolean;
  tintTopLeft: number;
  setTint(color: number): unknown;
}

export interface SpriteView {
  visible: boolean;
  width: number;
  height: number;
  displayOriginX: number;
  displayOriginY: number;
  texture: { key: string };
  frame: { name: string | number };
  getBounds(): { x: number; y: number; width: number; height: number; contains(x: number, y: number): boolean };
  getWorldTransformMatrix(): TransformMatrixView;
}

export interface TransformMatrixView {
  applyInverse(x: number, y: number): { x: number; y: number };
}
