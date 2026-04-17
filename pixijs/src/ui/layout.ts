export type PanelId =
  | "titlePanel"
  | "eventPanel"
  | "slotPanel"
  | "worldPanel"
  | "detailsPanel"
  | "disciplinesPanel"
  | "facultiesPanel"
  | "requisitesPanel"
  | "reveriesPanel"
  | "soulsPanel";

export interface LayoutRect {
  id: PanelId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computePanelLayout(
  screenWidth: number,
  screenHeight: number,
): LayoutRect[] {
  const row1Height = (6 / 120) * screenHeight;
  const row2Height = (75 / 120) * screenHeight;
  const row3Height = (39 / 120) * screenHeight;

  const row1Y = 0;
  const row2Y = row1Y + row1Height;
  const row3Y = row2Y + row2Height;

  const row2Col1Width = (30 / 240) * screenWidth;
  const row2Col2Width = (155 / 240) * screenWidth;
  const row2Col3Width = (55 / 240) * screenWidth;

  const row2Col1TopHeight = (45 / 120) * screenHeight;
  const row2Col1BottomHeight = (30 / 120) * screenHeight;

  const row3ColumnWidth = (48 / 240) * screenWidth;

  const row2Col1X = 0;
  const row2Col2X = row2Col1X + row2Col1Width;
  const row2Col3X = row2Col2X + row2Col2Width;

  const row2Col1TopY = row2Y;
  const row2Col1BottomY = row2Col1TopY + row2Col1TopHeight;

  return [
    {
      id: "titlePanel",
      x: 0,
      y: row1Y,
      width: screenWidth,
      height: row1Height,
    },
    {
      id: "eventPanel",
      x: row2Col1X,
      y: row2Col1TopY,
      width: row2Col1Width,
      height: row2Col1TopHeight,
    },
    {
      id: "slotPanel",
      x: row2Col1X,
      y: row2Col1BottomY,
      width: row2Col1Width,
      height: row2Col1BottomHeight,
    },
    {
      id: "worldPanel",
      x: row2Col2X,
      y: row2Y,
      width: row2Col2Width,
      height: row2Height,
    },
    {
      id: "detailsPanel",
      x: row2Col3X,
      y: row2Y,
      width: row2Col3Width,
      height: row2Height,
    },
    {
      id: "disciplinesPanel",
      x: row3ColumnWidth * 0,
      y: row3Y,
      width: row3ColumnWidth,
      height: row3Height,
    },
    {
      id: "facultiesPanel",
      x: row3ColumnWidth * 1,
      y: row3Y,
      width: row3ColumnWidth,
      height: row3Height,
    },
    {
      id: "requisitesPanel",
      x: row3ColumnWidth * 2,
      y: row3Y,
      width: row3ColumnWidth,
      height: row3Height,
    },
    {
      id: "reveriesPanel",
      x: row3ColumnWidth * 3,
      y: row3Y,
      width: row3ColumnWidth,
      height: row3Height,
    },
    {
      id: "soulsPanel",
      x: row3ColumnWidth * 4,
      y: row3Y,
      width: row3ColumnWidth,
      height: row3Height,
    },
  ];
}
