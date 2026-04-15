import * as net from "net";
import {
  encodeSimpleString,
  encodeError,
  parsedCommand,
  encodeBulkString,
} from "./parser";

export const server = net.createServer((connection: net.Socket) => {
  // console.log("Client connected");
  const mapping = new Map<any, any>();

  connection.on("data", (buffer: Buffer) => {
    try {
      const command = parsedCommand(buffer);
      if (!command) {
        connection.write(encodeError("ERR Invalid command format"));
        return;
      }

      const { cmd, args } = command;

      switch (cmd) {
        case "PING":
          connection.write(encodeSimpleString("PONG"));
          return;
        case "ECHO":
          if (args.length !== 1) {
            connection.write(
              encodeError("ERR wrong number of arguments for ECHO command"),
            );
            return;
          }

          connection.write(encodeBulkString(args[0]));
          break;
        case "SET":
          if (args.length < 2) {
            connection.write(
              encodeError("ERR wrong number of arguments for SET command"),
            );
            return;
          }
          mapping.set(args[0], args[1]);
          connection.write(encodeSimpleString("OK"));
          break;

        case "GET":
          if (args.length !== 1) {
            connection.write(
              encodeError("ERR wrong number of arguments for GET command"),
            );
            return;
          }

          const value = mapping.get(args[0]);

          if (!value) {
            connection.write(encodeBulkString(null));
          } else {
            connection.write(encodeBulkString(value));
          }
          break;

        default:
          connection.write(encodeError(`ERR Unknown command: ${cmd}`));
          break;
      }
    } catch (e) {
      console.error("Error processing command:", e);
      connection.write(encodeError("ERR Internal server error"));
    }
  });
  connection.on("end", () => {
    // console.log("Client disconnected");
  });
  connection.on("error", (err) => {
    console.error("Connection error:", err);
  });
});
server.listen(6379, "127.0.0.1", () => {
  console.log("Redis server listening on 127.0.0.1:6379");
});
