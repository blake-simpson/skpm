import { describe, expect, it } from "vitest";
import { parseArgs } from "./parse";

describe("parseArgs", () => {
  it("parses command, flags, and positionals", () => {
    const parsed = parseArgs([
      "install",
      "--registry",
      "https://example.com",
      "--tool",
      "codex,claude",
      "--json",
      "--verbose"
    ]);

    expect(parsed.command).toBe("install");
    expect(parsed.positionals).toEqual([]);
    expect(parsed.flags.registry).toBe("https://example.com");
    expect(parsed.flags.tool).toBe("codex,claude");
    expect(parsed.flags.json).toBe(true);
    expect(parsed.flags.verbose).toBe(true);
  });

  it("supports inline flag values", () => {
    const parsed = parseArgs(["info", "--version=1.2.3", "frontend"]);
    expect(parsed.command).toBe("info");
    expect(parsed.positionals).toEqual(["frontend"]);
    expect(parsed.flags.version).toBe("1.2.3");
  });
});
