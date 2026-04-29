import * as net from "net";
import { parsedCommand, encodeError } from "./utils/parser";
import { RedisCommand } from "./command";
import type { ServerConfig } from "./types";
import { createServerConfig } from "./config/server-config";

const parseServerArgs = (): { port: number; config: ServerConfig } => {
  let port = 6379;
  let configOverride: Partial<ServerConfig> = {};

  const portIndex = process.argv.indexOf("--port");
  if (portIndex !== -1 && process.argv.length > portIndex + 1) {
    port = parseInt(process.argv[portIndex + 1]);
  }

  const replicaIndex = process.argv.indexOf("--replicaof");
  if (replicaIndex !== -1 && process.argv.length > replicaIndex + 1) {
    const replicaofValue = process.argv[replicaIndex + 1];

    const [masterHost, masterPortStr] = replicaofValue
      .split(/(\s+)/)
      .filter(function (e) {
        return e.trim().length > 0;
      });

    if (masterHost && masterPortStr) {
      const masterPort = parseInt(masterPortStr);
      if (!isNaN(masterPort)) {
        configOverride = {
          role: "slave",
          masterHost: masterHost,
          masterPort: masterPort,
        };
      }
    }
  }

  return {
    port,
    config: createServerConfig(configOverride),
  };
};

const { port, config } = parseServerArgs();
const redisCmd = new RedisCommand(config);
export const server = net.createServer((connection: net.Socket) => {
  // console.log("Client connected");

  connection.on("data", async (buffer: Buffer) => {
    try {
      const command = parsedCommand(buffer);
      if (!command) {
        connection.write(encodeError("ERR Invalid command format"));
        return;
      }

      const { cmd, args } = command;
      await redisCmd.executedCommand(cmd, args, connection);
    } catch (e) {
      console.error("Error processing command:", e);
      connection.write(encodeError("ERR Internal server error"));
    }
  });
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Redis server listening on 127.0.0.1: ${port}`);
});
