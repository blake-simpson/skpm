#!/usr/bin/env node
import { parseArgs } from "./parse";
import { runAdd } from "./commands/add";
import { runInit } from "./commands/init";
import { runInfo } from "./commands/info";
import { runInstall, formatResolutionError } from "./commands/install";
import { runList } from "./commands/list";
import { runPublish } from "./commands/publish";
import { runRemove } from "./commands/remove";
import { runSearch } from "./commands/search";
import { runUpdate } from "./commands/update";
import { CommandContext, parseToolTargets } from "./commands/shared";
import { ResolutionError } from "../resolver/resolve";

const USAGE = `skpm <command> [options]

Commands:
  init [name]                 Initialize a project skpm.json
  search [query]              Search registry skills
  add <name[@range]>          Add a skill then install
  install                     Install skills from skpm.json
  update                      Update lockfile + reinstall
  list                        List installed skills
  remove <name>               Remove a skill and reinstall
  info <name> [--version v]   Show skill info
  publish                     Publish a skill package

Global Options:
  --registry <url>            Override registry URL
  --tool <name[,name]>        Override agent targets for install
  --token <token>             Publish token (or set SKPM_PUBLISH_TOKEN)
  --json                      JSON output
  --verbose                   Verbose logging
  --help                      Show help
`;

const enforceNodeVersion = (): void => {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isFinite(major) || major < 21) {
    throw new Error(
      `skpm requires Node.js 21+. Detected ${process.versions.node}.`
    );
  }
};

const toContext = (flags: Record<string, string | boolean | string[]>): CommandContext => {
  const toolValue =
    typeof flags.tool === "string" || Array.isArray(flags.tool) ? flags.tool : undefined;
  return {
  projectRoot: process.cwd(),
  registryOverride: typeof flags.registry === "string" ? flags.registry : undefined,
  agentTargetsOverride: parseToolTargets(toolValue),
  json: Boolean(flags.json),
  verbose: Boolean(flags.verbose)
  };
};

const renderJson = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const run = async (): Promise<void> => {
  enforceNodeVersion();
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.command || parsed.flags.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const context = toContext(parsed.flags);
  const command = parsed.command;

  const runCommand = async (): Promise<unknown | void> => {
    switch (command) {
      case "init": {
        return runInit(context, {
          name: parsed.positionals[0] ?? (parsed.flags.name as string | undefined),
          registry: parsed.flags.registry as string | undefined,
          tool: parsed.flags.tool as string | string[] | undefined
        });
      }
      case "search": {
        return runSearch(context, parsed.positionals[0]);
      }
      case "add": {
        if (!parsed.positionals[0]) {
          throw new Error("Usage: skpm add <name[@range]>");
        }
        return runAdd(context, {
          spec: parsed.positionals[0],
          range: parsed.flags.range as string | undefined
        });
      }
      case "install": {
        return runInstall(context);
      }
      case "update": {
        return runUpdate(context);
      }
      case "list": {
        return runList(context);
      }
      case "remove": {
        if (!parsed.positionals[0]) {
          throw new Error("Usage: skpm remove <name>");
        }
        return runRemove(context, { name: parsed.positionals[0] });
      }
      case "info": {
        if (!parsed.positionals[0]) {
          throw new Error("Usage: skpm info <name> [--version <version>]");
        }
        return runInfo(context, {
          name: parsed.positionals[0],
          version: parsed.flags.version as string | undefined
        });
      }
      case "publish": {
        return runPublish(context, {
          token: parsed.flags.token as string | undefined
        });
      }
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  };

  try {
    const result = await runCommand();
    if (context.json) {
      renderJson({ ok: true, data: result ?? null });
    }
  } catch (error: unknown) {
    if (context.json) {
      const payload = {
        ok: false,
        error: {
          message:
            error instanceof ResolutionError
              ? formatResolutionError(error)
              : error instanceof Error
                ? error.message
                : String(error)
        }
      };
      process.exitCode = 1;
      renderJson(payload);
      return;
    }

    if (error instanceof ResolutionError) {
      process.stderr.write(`${formatResolutionError(error)}\n`);
    } else if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write(`${String(error)}\n`);
    }
    process.exitCode = 1;
  }
};

if (require.main === module) {
  run().catch(() => {
    process.exitCode = process.exitCode || 1;
  });
}

export { run };
