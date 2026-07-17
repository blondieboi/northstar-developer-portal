import type { FastifyInstance } from "fastify";
import type { ZodType } from "zod";

export type PluginSurface = "service" | "overview" | "scorecards" | "health";
export type PluginConfig = {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
};
export type PluginHealth = {
  id: string;
  status: "disabled" | "ready" | "stale" | "degraded";
  message: string;
  surfaces: PluginSurface[];
};
export type ServiceRecord = Record<string, any>;

export type PortalPlugin = {
  id: string;
  title: string;
  description: string;
  version: string;
  surfaces: PluginSurface[];
  configSchema: ZodType;
  defaults: Record<string, unknown>;
  requiredEnvironment: string[];
  collectService?: (
    service: ServiceRecord,
    config: Record<string, unknown>,
  ) => Promise<unknown>;
  registerRoutes?: (server: FastifyInstance) => void;
};
