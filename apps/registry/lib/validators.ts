import { z } from "zod";

const manifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  dependencies: z.record(z.string()),
  files: z.array(z.string()).min(1),
  license: z.string().min(1),
  author: z.string().min(1)
});

export const publishMetadataSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  manifest: manifestSchema,
  integrity: z.string().min(1),
  tarball: z.string().min(1)
});

export type PublishMetadata = z.infer<typeof publishMetadataSchema>;

export const validatePublishMetadata = (payload: unknown): PublishMetadata =>
  publishMetadataSchema.parse(payload);
