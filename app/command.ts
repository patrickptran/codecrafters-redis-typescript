import { decode, encode } from "./parser";

export function handleCommand(buffer: Buffer) {
  const str = decode(buffer);
  if (!str) {
    return encode("UNKNOWN COMMAND");
  }

  if (!Array.isArray(str)) {
    return encode(str);
  }

  if (str[0] === "ECHO") {
    return encode(str[1]);
  }

  if (str[0] === "PING") {
    return encode("PONG", true);
  }

  if (str.length) {
    return encode(str[0], true);
  }

  return encode("UNKNOWN COMMAND");
}
