import * as net from "net";
import {
  encodeSimpleString,
  encodeError,
  parsedCommand,
  encodeBulkString,
} from "./parser";

interface MapType {
  value: string;
  timeExpired?: number;
}

const mapping = new Map<string, MapType>();
export const server = net.createServer((connection: net.Socket) => {
  // console.log("Client connected");

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
          if (args.length === 2) {
            mapping.set(args[0], { value: args[1] });
          } else if (args.length === 4 && args[2].toUpperCase() === "PX") {
            const date = Date.now() + parseInt(args[3]);
            mapping.set(args[0], { value: args[1], timeExpired: date });
          } else {
            connection.write(
              encodeError("ERR wrong number of arguments for SET command"),
            );
            break;
          }
          connection.write(encodeSimpleString("OK"));
          break;
        case "GET":
          if (args.length !== 1) {
            connection.write(
              encodeError("ERR wrong number of arguments for GET command"),
            );
            return;
          }

          const entry = mapping.get(args[0]);

          if (!entry) {
            connection.write(encodeBulkString(null));
            break;
          }

          if (entry.timeExpired && Date.now() > entry.timeExpired) {
            mapping.delete(args[0]);
            connection.write(encodeBulkString(null));
            break;
          }

          connection.write(encodeBulkString(entry.value));
          return;

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
