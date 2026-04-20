export interface HexPoint {
  x: number;
  y: number;
}

const FLAT_TOP_HEX_CORNER_ANGLES_DEG = [0, 60, 120, 180, 240, 300];

export function computeInsetHexSize(size: number, strokeWidth: number): number {
  return Math.max(0, size - (strokeWidth / 2));
}

export function buildPointyTopHexVertices(
  centerX: number,
  centerY: number,
  size: number,
  inset = 0,
): HexPoint[] {
  const effectiveSize = Math.max(0, size - inset);

  // NOTE: Kept legacy function name for API compatibility; geometry is flat-top.
  return FLAT_TOP_HEX_CORNER_ANGLES_DEG.map((angleDeg) => {
    const angleRad = (Math.PI / 180) * angleDeg;

    return {
      x: centerX + (effectiveSize * Math.cos(angleRad)),
      y: centerY + (effectiveSize * Math.sin(angleRad)),
    };
  });
}

export function drawClosedPolygonPath(
  graphics: { moveTo: (x: number, y: number) => unknown; lineTo: (x: number, y: number) => unknown; closePath: () => unknown; },
  vertices: HexPoint[],
): void {
  if (vertices.length === 0) {
    return;
  }

  graphics.moveTo(vertices[0].x, vertices[0].y);

  for (let index = 1; index < vertices.length; index += 1) {
    graphics.lineTo(vertices[index].x, vertices[index].y);
  }

  graphics.closePath();
}

export type HexProgressDirection = "clockwise" | "counterclockwise";

interface HexPerimeterProgressConfig {
  centerX: number;
  centerY: number;
  size: number;
  inset?: number;
  value: number;
  direction: HexProgressDirection;
}

export function buildHexPerimeterProgressPath(config: HexPerimeterProgressConfig): HexPoint[] {
  const value = Math.max(0, Math.min(1, config.value));
  const vertices = buildPointyTopHexVertices(config.centerX, config.centerY, config.size, config.inset ?? 0);

  if (vertices.length !== 6 || value <= 0) {
    return [];
  }

  const clockwiseIndices = [0, 1, 2, 3, 4, 5, 0];
  const counterclockwiseIndices = [0, 5, 4, 3, 2, 1, 0];
  const route = config.direction === "clockwise" ? clockwiseIndices : counterclockwiseIndices;

  const edgeLength = Math.hypot(
    vertices[clockwiseIndices[1]].x - vertices[clockwiseIndices[0]].x,
    vertices[clockwiseIndices[1]].y - vertices[clockwiseIndices[0]].y,
  );

  if (edgeLength <= 0) {
    return [];
  }

  let remaining = value * edgeLength * 6;
  const progressPath: HexPoint[] = [vertices[route[0]]];

  for (let edgeIndex = 0; edgeIndex < 6 && remaining > 0; edgeIndex += 1) {
    const start = vertices[route[edgeIndex]];
    const end = vertices[route[edgeIndex + 1]];
    const drawLength = Math.min(edgeLength, remaining);
    const t = drawLength / edgeLength;

    progressPath.push({
      x: start.x + ((end.x - start.x) * t),
      y: start.y + ((end.y - start.y) * t),
    });

    remaining -= drawLength;

    if (drawLength < edgeLength) {
      break;
    }
  }

  return progressPath;
}
