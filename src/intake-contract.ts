import { z } from "zod";

const optionalText = (maximum: number) => z.string().max(maximum);
const relativeDirectory = z
  .string()
  .max(240)
  .refine(
    (value) =>
      !value ||
      (!value.startsWith("/") &&
        !value.split("/").includes("..") &&
        /^[A-Za-z0-9._/-]+$/.test(value)),
    "Documentation directory must be a safe repository-relative path",
  );

export const intakeDraftSchema = z
  .object({
    name: z.string().min(1, "Service name is required").max(63),
    title: optionalText(120),
    description: optionalText(2000),
    owner: optionalText(200),
    lifecycle: optionalText(64),
    tier: optionalText(64),
    type: optionalText(64),
    system: optionalText(120),
    language: optionalText(120),
    docsPath: relativeDirectory,
    dependsOn: optionalText(2000),
    exposure: z.enum(["", "internal", "public"]),
    dataSensitivity: z.enum(["", "none", "internal", "confidential", "restricted"]),
    authentication: z.enum(["", "none", "optional", "required"]),
    expiresAt: optionalText(10),
  })
  .strict();

export type IntakeDraft = z.infer<typeof intakeDraftSchema>;
