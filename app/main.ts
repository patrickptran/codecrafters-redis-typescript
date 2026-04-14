import * as net from "net";
import { handleCommand } from "./command";

const server = net.createServer((connection: net.Socket) => {
  // console.log("Client connected");
  connection.on("data", (buffer: Buffer) => {
    const request = buffer.toString();
    // console.log("📥 Received raw:", JSON.stringify(request));
    if (request.includes("PING")) {
      connection.write("+PONG\r\n");
    } else if (request.includes("ECHO")) {
      const message = request.split("\r\n")[4];
      connection.write(`$${message.length}\r\n${message}\r\n`);
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
