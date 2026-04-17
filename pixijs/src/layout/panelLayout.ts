export type PanelId =
  | 'titlePanel'
  | 'eventPanel'
  | 'slotPanel'
  | 'worldPanel'
  | 'detailsPanel'
  | 'disciplinesPanel'
  | 'facultiesPanel'
  | 'requisitesPanel'
  | 'reveriesPanel'
  | 'soulsPanel';

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PanelLayout = Record<PanelId, LayoutRect>;

export const createPanelLayout = (screenWidth: number, screenHeight: number): PanelLayout => {
  const row1Height = (6 / 120) * screenHeight;
  const row2Height = (75 / 120) * screenHeight;
  const row3Height = (39 / 120) * screenHeight;

  const row2Col1Width = (30 / 240) * screenWidth;
  const row2Col2Width = (155 / 240) * screenWidth;
  const row2Col3Width = (55 / 240) * screenWidth;

  const row2Col1TopHeight = (45 / 120) * screenHeight;
  const row2Col1BottomHeight = (30 / 120) * screenHeight;

  const row3ColWidth = (48 / 240) * screenWidth;

  const row1Y = 0;
  const row2Y = row1Y + row1Height;
  const row3Y = row2Y + row2Height;

  const row2Col1X = 0;
  const row2Col2X = row2Col1X + row2Col1Width;
  const row2Col3X = row2Col2X + row2Col2Width;

  const row2Col1TopY = row2Y;
  const row2Col1BottomY = row2Col1TopY + row2Col1TopHeight;

  return {
    titlePanel: {
      x: 0,
      y: row1Y,
      width: screenWidth,
      height: row1Height,
    },
    eventPanel: {
      x: row2Col1X,
      y: row2Col1TopY,
      width: row2Col1Width,
      height: row2Col1TopHeight,
    },
    slotPanel: {
      x: row2Col1X,
      y: row2Col1BottomY,
      width: row2Col1Width,
      height: row2Col1BottomHeight,
    },
    worldPanel: {
      x: row2Col2X,
      y: row2Y,
      width: row2Col2Width,
      height: row2Height,
    },
    detailsPanel: {
      x: row2Col3X,
      y: row2Y,
      width: row2Col3Width,
      height: row2Height,
    },
    disciplinesPanel: {
      x: 0 * row3ColWidth,
      y: row3Y,
      width: row3ColWidth,
      height: row3Height,
    },
    facultiesPanel: {
      x: 1 * row3ColWidth,
      y: row3Y,
      width: row3ColWidth,
      height: row3Height,
    },
    requisitesPanel: {
      x: 2 * row3ColWidth,
      y: row3Y,
      width: row3ColWidth,
      height: row3Height,
    },
    reveriesPanel: {
      x: 3 * row3ColWidth,
      y: row3Y,
      width: row3ColWidth,
      height: row3Height,
    },
    soulsPanel: {
      x: 4 * row3ColWidth,
      y: row3Y,
      width: row3ColWidth,
      height: row3Height,
    },
  };
};
