export type RESPvalue = string | number | RESPvalue[] | null;

export interface ParsedCommand {
  cmd: string;
  args: string[];
}

const asciiCodes = {
  $: 0x24,
  "*": 0x2a,
  ":": 0x3a,
  "+": 0x2b,
  "-": 0x2d,
  "0": 0x30,
  "9": 0x39,
  A: 0x41,
  Z: 0x5a,
  "\r": 0x0d,
  "\n": 0x0a,
};
// ["*1","$4","INFO","*1","$4","PING",""]
// *3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n

class RESPParser {
  private buffer: Buffer;
  private offset: number;

  constructor(data: Buffer) {
    this.buffer = data;
    this.offset = 0;
  }

  private findCRLF(): number {
    for (let i = this.offset; i + 1 < this.buffer.length; i++) {
      if (
        this.buffer[i] === asciiCodes["\r"] &&
        this.buffer[i + 1] === asciiCodes["\n"]
      ) {
        return i;
      }
    }

    throw new Error("CRLF not found");
  }
  private parseSimpleString(): string {
    const endIndex = this.findCRLF();
    const value = this.buffer.subarray(this.offset, endIndex).toString();

    this.offset = endIndex + 2;
    return value;
  }

  private parseError(): string {
    const endIndex = this.findCRLF();
    const value = this.buffer.subarray(this.offset, endIndex).toString();
    this.offset = endIndex + 2;
    return value;
  }

  private parseInteger(): number {
    const endIndex = this.findCRLF();
    const value = parseInt(
      this.buffer.subarray(this.offset, endIndex).toString(),
    );
    this.offset += 2;
    return value;
  }

  private parseBulkString(): string | null {
    const endIndex = this.findCRLF();
    const len = parseInt(
      this.buffer.subarray(this.offset, endIndex).toString(),
    );

    this.offset = endIndex + 2;
    if (len === -1) return null;

    const value = this.buffer
      .subarray(this.offset, this.offset + len)
      .toString();

    this.offset += len + 2;
    return value;
  }

  private parseArray(): RESPvalue[] | null {
    const endIndex = this.findCRLF();
    const len = parseInt(
      this.buffer.subarray(this.offset, endIndex).toString(),
    );

    this.offset = endIndex + 2;
    if (len === -1) return null;

    const arr: RESPvalue[] = [];
    for (let i = 0; i < len; i++) {
      const element = this.parse();
      if (element === null) {
        throw new Error("unexpected null element in array");
      }
      arr.push(element);
    }
    return arr;
  }

  parse(): RESPvalue | null {
    if (this.offset >= this.buffer.length) return null;

    const type = String.fromCharCode(this.buffer[this.offset]);

    this.offset++;
    switch (type) {
      case "+":
        return this.parseSimpleString();
      case "-":
        return this.parseError();
      case ":":
        return this.parseInteger();
      case "$":
        return this.parseBulkString();
      case "*":
        return this.parseArray();
      default:
        throw new Error(`Unknown RESP type: ${type} `);
    }
  }
}

export const parsedCommand = (data: Buffer): ParsedCommand | null => {
  try {
    const parser = new RESPParser(data);
    const parsed = parser.parse();

    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    const cmd = String(parsed[0]).toUpperCase();
    const args = parsed.slice(1).map((arg: any) => String(arg));

    return { cmd, args };
  } catch (err) {
    console.error("Error parsing RESP command:", err);
    return null;
  }
};

export const encodeBulkString = (value: string | null): string => {
  if (value === null) return "$-1\r\n";

  return `$${value.length}\r\n${value}\r\n`;
};

export const encodeSimpleString = (value: string): string => {
  return `+${value}\r\n`;
};

export const encodeError = (message: string): string => {
  return `-${message}\r\n`;
};

export const encodeInteger = (value: number): string => {
  return `:${value}\r\n`;
};

export const encodeArray = (elements: (string | null)[] | null): string => {
  if (!elements || elements === null) return "*-1\r\n";

  let res = `*${elements.length}\r\n`;

  for (let e of elements) {
    res += encodeBulkString(e);
  }
  return res;
};

export const encodeRawArray = (elements: (string | null)[] | null): string => {
  if (!elements || elements === null) return "*-1\r\n";

  let res = `*${elements.length}\r\n`;

  for (let e of elements) {
    res += e;
  }
  return res;
};

export const encodeNestedArray = (items: (string | string[])[][]): string => {
  let res = `*${items.length}\r\n`;
  for (const item of items) {
    res += `*${item.length}\r\n`;

    for (const element of item) {
      if (Array.isArray(element)) {
        res += `*${element.length}\r\n`;

        for (let subElement of element) {
          res += encodeBulkString(subElement);
        }
      } else {
        res += encodeBulkString(element);
      }
    }
  }
  return res;
};
