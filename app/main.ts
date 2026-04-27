import * as net from "net";
import { parsedCommand, encodeError } from "./utils/parser";
import { RedisCommand } from "./command";

const redisCmd = new RedisCommand();
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
server.listen(6379, "127.0.0.1", () => {
  console.log("Redis server listening on 127.0.0.1:6379");
});
