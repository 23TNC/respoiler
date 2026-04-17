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
        name: "work",
        colors: [0x4b6cb0, 0x2f4a85],
        progress: 0.25,
        progressDirection: "clockwise",
        progressFillColor: 0x78e08f,
        progressEmptyColor: 0x14213d,
      },
    ],
    facultiesPanel: [
      {
        id: "debug-health-1",
        name: "health",
        colors: [0xff8a65, 0xe65100],
        progress: 0.6,
        progressDirection: "counterclockwise",
        progressFillColor: 0x57cc99,
        progressEmptyColor: 0x3d0c02,
      },
      {
        id: "debug-health-2",
        name: "health",
        colors: [0xffb74d, 0xef6c00],
        progress: 0.85,
        progressDirection: "clockwise",
        progressFillColor: 0x00b4d8,
        progressEmptyColor: 0x4a2613,
      },
    ],
  };
}
