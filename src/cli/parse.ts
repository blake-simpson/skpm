export type ParsedArgs = {
  command?: string;
  positionals: string[];
  flags: Record<string, string | boolean | string[]>;
};

const pushFlagValue = (
  flags: Record<string, string | boolean | string[]>,
  key: string,
  value: string | boolean
): void => {
  const existing = flags[key];
  if (existing === undefined) {
    flags[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(String(value));
    return;
  }
  flags[key] = [String(existing), String(value)];
};

export const parseArgs = (argv: string[]): ParsedArgs => {
  const flags: Record<string, string | boolean | string[]> = {};
  const positionals: string[] = [];

  let command: string | undefined;
  let index = 0;
  let sawTerminator = false;

  while (index < argv.length) {
    const arg = argv[index];
    index += 1;

    if (!sawTerminator && arg === "--") {
      sawTerminator = true;
      continue;
    }

    if (!sawTerminator && arg.startsWith("--")) {
      const [rawKey, inlineValue] = arg.slice(2).split("=");
      const key = rawKey.trim();
      if (!key) {
        continue;
      }

      if (inlineValue !== undefined) {
        pushFlagValue(flags, key, inlineValue);
        continue;
      }

      const next = argv[index];
      if (next && !next.startsWith("-")) {
        pushFlagValue(flags, key, next);
        index += 1;
        continue;
      }

      pushFlagValue(flags, key, true);
      continue;
    }

    if (!command) {
      command = arg;
    } else {
      positionals.push(arg);
    }
  }

  return { command, positionals, flags };
};
