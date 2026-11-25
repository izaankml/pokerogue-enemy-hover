import { Ability } from "#abilities/ability";
import type { BattleScene } from "#app/battle-scene";
import { Battle } from "#app/battle";
import { GameMode } from "#app/game-mode";
import { Phase } from "#app/phase";
import { PokemonSpeciesForm } from "#data/pokemon-species";
import { Arena } from "#field/arena";
import { Pokemon } from "#field/pokemon";
import { ModifierType } from "#modifiers/modifier-type";
import { Move } from "#moves/move";
import { MockContainer } from "#test/mocks/mocks-container/mock-container";
import { MockGraphics } from "#test/mocks/mocks-container/mock-graphics";
import { MockRectangle } from "#test/mocks/mocks-container/mock-rectangle";
import { MockSprite } from "#test/mocks/mocks-container/mock-sprite";
import { MockText } from "#test/mocks/mocks-container/mock-text";
import { MockTexture } from "#test/mocks/mocks-container/mock-texture";
import { createHash } from "node:crypto";
import Phaser from "phaser";

/**
 * The battle's state at a turn boundary, which can be put back any number of times.
 *
 * It records the own fields of every object reachable from the battle, the arena, both parties and the held items,
 * and restores them in place. Objects keep their identity, so references between them, `#private` fields and
 * bound methods stay valid. Registry objects such as species, moves and abilities, and Phaser display objects,
 * are kept by reference without being recorded.
 */
export interface BattleSnapshot {
  restore(): void;
  /** Equal for two snapshots when every recorded field is equal. */
  readonly fingerprint: string;
  /** The recorded fields as text, one per entry; kept only on request, to find where two states differ. */
  readonly fields: readonly string[] | undefined;
}

/** Classes whose instances are definitions or display objects, never battle state. */
// biome-ignore lint/complexity/noBannedTypes: any class, abstract ones included
const SHARED_CLASSES: readonly Function[] = [
  Phaser.GameObjects.GameObject,
  // The test harness's stand-ins for display objects
  MockContainer,
  MockGraphics,
  MockRectangle,
  MockSprite,
  MockText,
  MockTexture,
  Phaser.Scene,
  Phaser.Events.EventEmitter,
  EventTarget,
  PokemonSpeciesForm,
  Move,
  Ability,
  ModifierType,
  Phase,
  GameMode,
  Promise,
  WeakMap,
  WeakSet,
];

/** Fields that hold static data, left out to keep snapshots small. */
// biome-ignore lint/complexity/noBannedTypes: any class, abstract ones included
const SKIPPED_FIELDS = new Map<Function, ReadonlySet<string>>([
  [Arena, new Set(["pokemonPool", "trainerPool"])],
  [Battle, new Set(["gameMode"])],
]);

const NO_FIELDS: ReadonlySet<string> = new Set();

function isShared(value: object): boolean {
  return (
    typeof value === "function"
    || Object.isFrozen(value)
    || SHARED_CLASSES.some(sharedClass => value instanceof sharedClass)
  );
}

function describeShared(value: object): string {
  if (value instanceof Pokemon) {
    return `pokemon:${value.id}`;
  }
  if (value instanceof PokemonSpeciesForm) {
    return `species:${value.speciesId}:${value.formIndex}`;
  }
  if (value instanceof Move || value instanceof Ability || value instanceof ModifierType) {
    return `${value.constructor.name}:${value.id}`;
  }
  return typeof value === "function" ? `function:${value.name}` : (value.constructor?.name ?? "object");
}

function skippedFields(target: object): ReadonlySet<string> {
  for (const [ownerClass, fields] of SKIPPED_FIELDS) {
    if (target instanceof ownerClass) {
      return fields;
    }
  }
  return NO_FIELDS;
}

class StateRecorder {
  private readonly ids = new Map<object, number>();
  public readonly restorers: (() => void)[] = [];
  public readonly fields: string[] = [];

  /**
   * Record the given fields of a root object, or all its own fields except the skipped ones.
   * Unlike nested objects, a root keeps fields added after the snapshot, which may belong to Phaser.
   */
  public recordRoot(target: object, options: { only?: readonly string[]; skip?: ReadonlySet<string> }): void {
    const id = this.register(target);
    const record = target as Record<string, unknown>;
    const entries: [string, unknown][] = options.only
      ? options.only.map(key => [key, record[key]])
      : Object.entries(record).filter(([key]) => !options.skip?.has(key));
    this.restorers.push(() => {
      for (const [key, value] of entries) {
        record[key] = value;
      }
    });
    this.describeEntries(id, entries);
  }

  private register(target: object): number {
    const id = this.ids.size;
    this.ids.set(target, id);
    return id;
  }

  private describeEntries(id: number, entries: [string, unknown][]): void {
    for (const [key, value] of entries) {
      this.fields.push(`${id}.${key}=${this.encode(value)}`);
    }
  }

  /** Text for a value in the fingerprint, recording any nested object it reaches. */
  private encode(value: unknown): string {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) {
      return typeof value === "string" ? JSON.stringify(value) : String(value);
    }
    if (isShared(value)) {
      return describeShared(value);
    }
    return `#${this.visit(value)}`;
  }

  private visit(value: object): number {
    const knownId = this.ids.get(value);
    if (knownId !== undefined) {
      return knownId;
    }
    const id = this.register(value);
    if (Array.isArray(value)) {
      const items = [...value];
      this.restorers.push(() => {
        value.splice(0, value.length, ...items);
      });
      this.fields.push(`${id}=[${items.map(item => this.encode(item)).join(",")}]`);
    } else if (value instanceof Set) {
      const items = [...value];
      this.restorers.push(() => {
        value.clear();
        for (const item of items) {
          value.add(item);
        }
      });
      this.fields.push(`${id}=Set{${items.map(item => this.encode(item)).join(",")}}`);
    } else if (value instanceof Map) {
      const entries = [...value];
      this.restorers.push(() => {
        value.clear();
        for (const [key, item] of entries) {
          value.set(key, item);
        }
      });
      this.fields.push(
        `${id}=Map{${entries.map(([key, item]) => `${this.encode(key)}:${this.encode(item)}`).join(",")}}`,
      );
    } else {
      const record = value as Record<string, unknown>;
      const skipped = skippedFields(value);
      const entries = Object.entries(record).filter(([key]) => !skipped.has(key));
      const recordedKeys = new Set(entries.map(([key]) => key));
      this.restorers.push(() => {
        for (const key of Object.keys(record)) {
          if (!skipped.has(key) && !recordedKeys.has(key)) {
            delete record[key];
          }
        }
        for (const [key, item] of entries) {
          record[key] = item;
        }
      });
      this.fields.push(`${id}:${value.constructor?.name ?? "object"}`);
      this.describeEntries(id, entries);
    }
    return id;
  }
}

let phaserContainerFields: ReadonlySet<string> | undefined;

/**
 * The display fields a Pokemon has as a Phaser container: those of a bare container, and the underscored ones
 * Phaser adds when a setter such as `setAlpha` first runs.
 */
function getDisplayFields(scene: BattleScene, pokemon: Pokemon): ReadonlySet<string> {
  if (!phaserContainerFields) {
    const probe = new Phaser.GameObjects.Container(scene);
    phaserContainerFields = new Set(Object.keys(probe));
    probe.destroy();
  }
  const containerFields = phaserContainerFields;
  return new Set(Object.keys(pokemon).filter(key => containerFields.has(key) || key.startsWith("_")));
}

/** Record the battle at a turn boundary, when no phase is queued. */
export function captureBattle(scene: BattleScene, keepFields = false): BattleSnapshot {
  const recorder = new StateRecorder();
  recorder.recordRoot(scene, {
    only: ["party", "modifiers", "enemyModifiers", "currentBattle", "arena", "money"],
  });
  // Sorted by id, so the same state gives the same fingerprint whatever the party order.
  const allPokemon = [...scene.getPlayerParty(), ...scene.getEnemyParty()].sort((left, right) => left.id - right.id);
  for (const pokemon of allPokemon) {
    recorder.recordRoot(pokemon, { skip: getDisplayFields(scene, pokemon) });
  }

  const fieldChildren = [...scene.field.list];
  const visibility = allPokemon.map(pokemon => pokemon.visible);
  const randomState = Phaser.Math.RND.state();
  const fieldMembership = allPokemon.map(pokemon => (fieldChildren.includes(pokemon) ? "in" : "out")).join(",");
  recorder.fields.push(`field=${fieldMembership}`, `visible=${visibility.join(",")}`, `rnd=${randomState}`);

  const fingerprint = createHash("sha1").update(recorder.fields.join("\n")).digest("hex");
  const restorers = recorder.restorers;
  return {
    fingerprint,
    fields: keepFields ? recorder.fields : undefined,
    restore() {
      for (const restoreRecord of restorers) {
        restoreRecord();
      }
      // The harness's field container is a plain list, so setting its children is all that adding or removing does.
      scene.field.list.splice(0, scene.field.list.length, ...fieldChildren);
      allPokemon.forEach((pokemon, index) => pokemon.setVisible(visibility[index]));
      Phaser.Math.RND.state(randomState);
    },
  };
}

/** The first recorded field that differs between two snapshots kept with their fields. */
export function firstDifference(expected: BattleSnapshot, actual: BattleSnapshot): string | undefined {
  const expectedFields = expected.fields ?? [];
  const actualFields = actual.fields ?? [];
  const length = Math.max(expectedFields.length, actualFields.length);
  for (let index = 0; index < length; index++) {
    if (expectedFields[index] !== actualFields[index]) {
      return `expected ${expectedFields[index]} but found ${actualFields[index]}`;
    }
  }
  return undefined;
}
