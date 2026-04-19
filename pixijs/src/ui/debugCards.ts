import type { DebugCard } from "./cardRenderer";

export interface DebugCardsByPanel {
  disciplinesPanel: DebugCard[];
  facultiesPanel: DebugCard[];
}

export function getDebugInventoryCards(): DebugCardsByPanel {
  return {
    disciplinesPanel: [
      {
        id: "debug-work-1",
        name: "Work",
        colors: [0x4b6cb0, 0xead7a1, 0x2f2416],
        progress: 0.25,
        progressDirection: "clockwise",
        progressFillColor: 0x78e08f,
        progressEmptyColor: 0x14213d,
      },
    ],
    facultiesPanel: [
      {
        id: "debug-health-1",
        name: "Might",
        colors: [0xff8a65, 0xead7a1, 0x2f2416],
        progress: 0.6,
        progressDirection: "counterclockwise",
        progressFillColor: 0x57cc99,
        progressEmptyColor: 0x3d0c02,
      },
      {
        id: "debug-health-2",
        name: "Despair",
        colors: [0xffb74d, 0xdcc48e, 0x241c12],
        progress: 0.85,
        progressDirection: "clockwise",
        progressFillColor: 0x00b4d8,
        progressEmptyColor: 0x4a2613,
      },
    ],
  };
}
