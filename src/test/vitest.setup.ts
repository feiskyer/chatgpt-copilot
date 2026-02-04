import { vi } from "vitest";

vi.mock("vscode", () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    }),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));
