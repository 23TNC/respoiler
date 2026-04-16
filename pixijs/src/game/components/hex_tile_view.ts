import { Container, Graphics, Point, Polygon, Text } from "pixi.js";
import type { EntityId } from "../model";

export type HexTileViewConfig = {
  id: EntityId;
  label: string;
  color: number;
  radius: number;
  selected?: boolean;
  onSelect?: (tileId: EntityId) => void;
};

export class HexTileView extends Container {
  private readonly background: Graphics;
  private readonly border: Graphics;
  private readonly labelText: Text;
  private readonly tileId: EntityId;
  private readonly radius: number;
  private readonly polygon: Polygon;

  constructor(config: HexTileViewConfig) {
    super();

    this.tileId = config.id;
    this.radius = config.radius;
    this.background = new Graphics();
    this.border = new Graphics();
    this.polygon = new Polygon(this.computeFlatHexPoints(this.radius));
    this.labelText = new Text({
      text: config.label,
      style: {
        fill: 0xf6f4ea,
        fontSize: 12,
      },
    });
    this.labelText.anchor.set(0.5);

    this.addChild(this.background, this.border, this.labelText);

    this.draw(config.color, Boolean(config.selected));

    this.eventMode = "static";
    this.cursor = "pointer";
    this.hitArea = this.polygon;
    this.on("pointertap", () => config.onSelect?.(this.tileId));
  }

  setSelected(selected: boolean, color: number): void {
    this.draw(color, selected);
  }

  private draw(fillColor: number, selected: boolean): void {
    const points = this.polygon.points;

    this.background.clear();
    this.background.poly(points, true).fill(fillColor);

    this.border.clear();
    this.border.poly(points, true).stroke({
      color: selected ? 0xffe58f : 0x2d2d2d,
      width: selected ? 4 : 2,
    });

    this.labelText.position.set(0, 0);
  }

  getTileId(): EntityId {
    return this.tileId;
  }

  hitTestGlobal(globalX: number, globalY: number): boolean {
    if (!this.visible || !this.worldVisible) {
      return false;
    }
    const localPoint = this.toLocal(new Point(globalX, globalY));
    return this.polygon.contains(localPoint.x, localPoint.y);
  }

  private computeFlatHexPoints(radius: number): number[] {
    const points: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = Math.PI / 3 * i;
      points.push(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    return points;
  }
}
