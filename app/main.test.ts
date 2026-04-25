import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as net from "net";
import { parsedCommand } from "./utils/parser";
import { server } from "./main";

const buildRESP = (payload: string) => Buffer.from(payload, "utf8");

const sendCommand = (payload: string): Promise<string> => {
  const socket = net.createConnection({ port: 6379, host: "127.0.0.1" });

  return new Promise<string>((resolve, reject) => {
    socket.on("error", reject);
    socket.on("data", (data) => {
      resolve(data.toString());
      socket.destroy();
    });
    socket.write(payload);
  });
};

describe("RESP parser", () => {
  it("parses a PING command array", () => {
    const command = parsedCommand(buildRESP("*1\r\n$4\r\nPING\r\n"));

    expect(command).toEqual({
      cmd: "PING",
      args: [],
    });
  });

  it("parses an ECHO command with a bulk string argument", () => {
    const command = parsedCommand(
      buildRESP("*2\r\n$4\r\nECHO\r\n$5\r\nhello\r\n"),
    );

    expect(command).toEqual({
      cmd: "ECHO",
      args: ["hello"],
    });
  });

  it("parses a multi-argument array command", () => {
    const command = parsedCommand(
      buildRESP("*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n"),
    );

    expect(command).toEqual({
      cmd: "SET",
      args: ["key", "value"],
    });
  });
});

describe("Redis Server", () => {
  beforeAll(() => {
    if (!server.listening) {
      server.listen(6379, "127.0.0.1");
    }
  });

  afterAll(() => {
    server.close();
  });

  it("responds to PING with PONG", async () => {
    const response = await sendCommand("*1\r\n$4\r\nPING\r\n");

    expect(response).toBe("+PONG\r\n");
  });

  it("responds to ECHO with bulk string payload", async () => {
    const response = await sendCommand("*2\r\n$4\r\nECHO\r\n$5\r\nhello\r\n");

    expect(response).toBe("$5\r\nhello\r\n");
  });

  it("responds with error for unknown command", async () => {
    const response = await sendCommand("*1\r\n$7\r\nUNKNOWN\r\n");

    expect(response).toContain("ERR Unknown command");
  });
});
