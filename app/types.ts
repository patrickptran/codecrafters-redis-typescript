export interface MapEntry {
  value: any;
  timeExpired?: number;
  type?: "string" | "list" | "stream";
}

export interface StreamEntry {
  id: string;
  fields: Map<string, string>;
}

export interface ParsedCommand {
  cmd: string;
  args: string[];
}

export interface QueuedCommand {
  command: string;
  args: string[];
}
