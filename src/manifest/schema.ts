import { z } from "zod";
import semver from "semver";
import type { Lockfile, PackageManifest, ProjectManifest, ResolvedPackage } from "../types";

const semverRange = z
  .string()
  .min(1)
  .refine((value) => semver.validRange(value) !== null, {
    message: "Invalid semver range"
  });

const semverVersion = z
  .string()
  .min(1)
  .refine((value) => semver.valid(value) !== null, {
    message: "Invalid semver version"
  });

const skillFileMappingSchema = z
  .object({
    source: z.string().min(1)
  })
  .strict();

export const projectManifestSchema = z
  .object({
    name: z.string().min(1),
    skills: z.record(z.string().min(1), semverRange),
    registry: z.string().min(1).optional(),
    agentTargets: z.array(z.string().min(1)).optional()
  })
  .strict();

export const packageManifestSchema = z
  .object({
    name: z.string().min(1),
    version: semverVersion,
    description: z.string().min(1),
    dependencies: z.record(z.string().min(1), semverRange).optional(),
    files: z.array(z.string().min(1)),
    license: z.string().min(1),
    author: z.string().min(1),
    skills: z.array(skillFileMappingSchema).optional(),
    agents: z.array(skillFileMappingSchema).optional()
  })
  .strict();

export const resolvedPackageSchema: z.ZodType<ResolvedPackage> = z
  .object({
    name: z.string().min(1),
    version: semverVersion,
    dependencies: z.record(z.string().min(1), semverRange),
    resolved: z.record(z.string().min(1), semverVersion),
    integrity: z.string().min(1)
  })
  .strict();

export const lockfileSchema: z.ZodType<Lockfile> = z
  .object({
    lockfileVersion: z.number().int().nonnegative(),
    registry: z.string().min(1),
    root: z
      .object({
        name: z.string().min(1),
        skills: z.record(z.string().min(1), semverRange)
      })
      .strict(),
    packages: z.record(z.string().min(1), resolvedPackageSchema)
  })
  .strict();

export const validateProjectManifest = (input: unknown): ProjectManifest =>
  projectManifestSchema.parse(input);

export const validatePackageManifest = (input: unknown): PackageManifest =>
  packageManifestSchema.parse(input);

export const validateLockfile = (input: unknown): Lockfile => lockfileSchema.parse(input);
