export interface AxialCoord {
  q: number;
  r: number;
}

export const HEX_DIRECTIONS: ReadonlyArray<AxialCoord> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialKey(coord: AxialCoord): string {
  return `${coord.q},${coord.r}`;
}

export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -(a.q + a.r) + (b.q + b.r);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

export function axialNeighbors(coord: AxialCoord): AxialCoord[] {
  return HEX_DIRECTIONS.map((dir) => ({ q: coord.q + dir.q, r: coord.r + dir.r }));
}

export function estimatePathCost(a: AxialCoord, b: AxialCoord, baseCost = 1): number {
  return axialDistance(a, b) * baseCost;
}

export function axialToPixel(coord: AxialCoord, size: number): { x: number; y: number } {
  const x = size * Math.sqrt(3) * (coord.q + coord.r / 2);
  const y = size * 1.5 * coord.r;
  return { x, y };
}

export function pixelToAxial(x: number, y: number, size: number): AxialCoord {
  const q = (Math.sqrt(3) / 3 * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return roundAxial({ q, r });
}

function roundAxial(frac: AxialCoord): AxialCoord {
  let x = frac.q;
  let z = frac.r;
  let y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}
