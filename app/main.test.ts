import { describe, it, expect } from "bun:test";
import * as net from "net";

describe("Redis Server", () => {
  it("should respond to PING", async () => {
    const socket = net.createConnection({ port: 6379 });

    socket.write("PING\r\n");

    const response = await new Promise<string>((resolve) => {
      socket.on("data", (data) => resolve(data.toString()));
    });

    expect(response).toContain("PONG");
    socket.destroy();
  });
});
