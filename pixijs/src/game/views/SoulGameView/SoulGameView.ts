import { Container, Text, TextStyle } from 'pixi.js';
import { tables } from '../../../spacetime/bindings';
import { BottomInventoryBar } from '../../ui/inventories/BottomInventoryBar';
import type { SpacetimeClient } from '../../spacetime/types';
import type { Soul } from '../../../spacetime/bindings/types';

const LABEL_STYLE = new TextStyle({
  fill: 0xf4f6fb,
  fontSize: 24,
  fontFamily: 'Arial',
  fontWeight: '600',
});

export class SoulGameView {
  readonly container = new Container();

  private readonly title = new Text({ text: 'Soul View', style: LABEL_STYLE });
  private readonly inventoryBar = new BottomInventoryBar();

  private readonly soulScopedDisposers: Array<() => void> = [];
  private activeSoulId: number | null = null;
  private soulContextVersion = 0;

  constructor(private readonly spacetimeClient: SpacetimeClient) {
    this.container.addChild(this.title, this.inventoryBar.container);
  }

  setSoulId(soulId: number): void {
    if (this.activeSoulId === soulId) {
      return;
    }

    this.disposeSoulContext();
    this.bindSoulContext(soulId);
    this.render();
  }

  disposeSoulContext(): void {
    this.soulContextVersion += 1;

    while (this.soulScopedDisposers.length > 0) {
      const disposer = this.soulScopedDisposers.pop();
      disposer?.();
    }

    this.activeSoulId = null;
    this.title.text = 'Soul View';
    this.inventoryBar.clearSoulUiState();
  }

  bindSoulContext(soulId: number): void {
    this.activeSoulId = soulId;
    this.soulContextVersion += 1;
    const contextVersion = this.soulContextVersion;

    const soulTable = this.spacetimeClient.connection.db.soul;

    const subscription = this.spacetimeClient.connection
      .subscriptionBuilder()
      .onApplied(() => {
        if (!this.isActiveContext(contextVersion, soulId)) {
          return;
        }

        this.updateSoulTitle();
      })
      .subscribe(tables.soul.where((row) => row.soulId.eq(BigInt(soulId))));

    this.soulScopedDisposers.push(() => subscription.unsubscribe());

    const handleSoulInsert = (_ctx: unknown, row: Soul) => {
      if (!this.isActiveContext(contextVersion, soulId)) {
        return;
      }

      if (Number(row.soulId) === soulId) {
        this.updateSoulTitle(row.name);
      }
    };

    const handleSoulUpdate = (_ctx: unknown, _previous: Soul, next: Soul) => {
      if (!this.isActiveContext(contextVersion, soulId)) {
        return;
      }

      if (Number(next.soulId) === soulId) {
        this.updateSoulTitle(next.name);
      }
    };

    soulTable.onInsert(handleSoulInsert);
    soulTable.onUpdate(handleSoulUpdate);

    this.soulScopedDisposers.push(() => {
      soulTable.removeOnInsert(handleSoulInsert);
      soulTable.removeOnUpdate(handleSoulUpdate);
    });

    this.updateSoulTitle();
  }

  resize(width: number, height: number): void {
    this.title.position.set(20, 20);
    this.inventoryBar.layout(width, height);
  }

  destroy(): void {
    this.disposeSoulContext();
    this.container.destroy({ children: true });
  }

  private render(): void {
    // Placeholder for soul-scoped rerender hooks as this view grows.
  }

  private updateSoulTitle(soulName?: string): void {
    const suffix = soulName ? ` (${soulName})` : '';
    this.title.text = `Soul ${this.activeSoulId ?? '-'}${suffix}`;
  }

  private isActiveContext(contextVersion: number, soulId: number): boolean {
    return (
      this.soulContextVersion === contextVersion && this.activeSoulId === soulId
    );
  }
}
