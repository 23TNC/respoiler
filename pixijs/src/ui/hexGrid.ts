export interface AxialHexCoord {
  q: number;
  r: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export function axialFlatTopToPixel(
  coord: AxialHexCoord,
  size: number,
): Point2D {
  return {
    // Flat-top axial layout keeps q/r storage, but changes the pixel projection.
    x: size * (3 / 2) * coord.q,
    y: size * Math.sqrt(3) * (coord.r + (coord.q / 2)),
  };
}

export function worldHexToPanelPixel(
  coord: AxialHexCoord,
  size: number,
  origin: Point2D,
): Point2D {
  const local = axialFlatTopToPixel(coord, size);

  return {
    x: origin.x + local.x,
    y: origin.y + local.y,
  };
}
