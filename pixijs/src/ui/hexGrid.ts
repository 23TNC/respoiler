export interface AxialHexCoord {
  q: number;
  r: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export function axialPointyTopToPixel(
  coord: AxialHexCoord,
  size: number,
): Point2D {
  return {
    x: size * Math.sqrt(3) * (coord.q + (coord.r / 2)),
    y: size * (3 / 2) * coord.r,
  };
}

export function worldHexToPanelPixel(
  coord: AxialHexCoord,
  size: number,
  origin: Point2D,
): Point2D {
  const local = axialPointyTopToPixel(coord, size);

  return {
    x: origin.x + local.x,
    y: origin.y + local.y,
  };
}
