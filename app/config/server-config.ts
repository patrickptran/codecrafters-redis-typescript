import { type ServerConfig } from "../types";

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  role: "master",
  replicationOffset: 0,
  minReplica: 0,
  replicaTimeout: 1000, // minimum 1 minute
};

export function createServerConfig(
  overrides: Partial<ServerConfig> = {},
): ServerConfig {
  return {
    ...DEFAULT_SERVER_CONFIG,
    ...overrides,
  };
}
