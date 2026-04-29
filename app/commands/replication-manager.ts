import * as net from "net";
import { type ServerConfig } from "../types";
import { encodeRESPCommand } from "../utils/parser";

export class ReplicationManager {
  private config: ServerConfig;
  private masterConnection: net.Socket | null;

  constructor(config: ServerConfig) {
    this.config = config;
    this.masterConnection = null;
  }

  public async initiateHandShake(): Promise<void> {
    if (
      this.config.role !== "slave" ||
      !this.config.masterHost ||
      !this.config.masterPort
    ) {
      return;
    }

    try {
      console.log(
        `Starting replication handshake with master ${this.config.masterHost}:${this.config.masterPort}`,
      );

      this.masterConnection = await this.connectToMaster(
        this.config.masterHost,
        this.config.masterPort,
      );

      await this.sendPingToMaster();

      await this.sendReplConfCommands();

      await this.sendPsyncCommand();

      console.log("Replication handshake completed successfully");
    } catch (e) {
      console.error("Replication handshake failed: ", e);
      this.cleanup();
    }
  }

  public isReplica(): boolean {
    return this.config.role === "slave";
  }

  public getMasterConnection(): net.Socket | null {
    return this.masterConnection;
  }

  public getReplicaionInfo(): Record<string, any> {
    const fields: Record<string, any> = {
      role: this.config.role,
    };

    if (this.config.role === "slave") {
      if (this.config.masterHost) fields.master_host = this.config.masterHost;
      if (this.config.masterPort) fields.master_port = this.config.masterPort;
    }

    if (this.config.role === "master") {
      fields.connected_slaves = this.getConnectedSlaves().length;
      fields.master_replid = this.generateReplicationId();
      fields.master_repli_offset = 0;
    }

    if (this.config.replicationOffset !== undefined) {
      fields.master_repl_offset = this.config.replicationOffset;
    }

    return fields;
  }

  private generateReplicationId(): string {
    return "8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb";
  }

  private getConnectedSlaves(): any[] {
    return [];
  }

  private async connectToMaster(
    host: string,
    port: number,
  ): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();

      socket.connect(port, host, () => {
        console.log(`Connected to master at ${host}:${port}`);
        resolve(socket);
      });

      socket.on("error", (error) => {
        console.error(`Failed to connect to master: ${error.message}`);
        reject(error);
      });

      socket.on("close", () => {
        console.log("Closed connection to master");
        this.masterConnection = null;
      });

      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error("Time out connection to master"));
      });
    });
  }

  private async sendCommandToMaster(
    command: string,
    args: string[],
  ): Promise<string> {
    if (!this.masterConnection) {
      throw new Error("No connection to master");
    }

    return new Promise((resolve, reject) => {
      const respCommand = encodeRESPCommand(command, args);

      const onData = (data: Buffer) => {
        const res = data.toString();

        this.masterConnection?.off("data", onData);

        resolve(res);
      };

      this.masterConnection?.on("data", onData);
      this.masterConnection?.write(respCommand);

      setTimeout(() => {
        if (this.masterConnection) {
          this.masterConnection.off("data", onData);
        }

        reject(new Error(`${command} to master timed out`));
      }, 3000);
    });
  }

  private async sendPingToMaster(): Promise<void> {
    console.log("Send PING to Master");
    const res = await this.sendCommandToMaster("PING", []);

    if (res !== "+PONG\r\n") {
      throw new Error(`Unexpected PING response: ${res}`);
    }

    console.log("PING handshake successfully");
  }

  private async sendReplConfCommands(): Promise<void> {
    if (!this.masterConnection) {
      throw new Error("No connection to master");
    }

    console.log("Sending REPLCONF command to master");

    const currentPort = this.config.port || 6379;

    console.log(`Sending REPLCONF listening-port ${currentPort}`);

    const portRes = await this.sendCommandToMaster("REPLCONF", [
      "listening-port",
      currentPort.toString(),
    ]);

    if (portRes !== "+OK\r\n") {
      throw new Error(
        `Unexpected REPLCONF listening-port response: ${portRes}`,
      );
    }

    // send capabilities
    console.log("Sending REPLCONF capa psync2");
    const capaRes = await this.sendCommandToMaster("REPLCONF", [
      "capa",
      "psync2",
    ]);

    if (capaRes !== "+OK\r\n") {
      throw new Error(
        `Unexpected REPLCONF listening-port response: ${portRes}`,
      );
    }

    console.log("REPLCONF commands sent successfully");
  }

  private async sendPsyncCommand(): Promise<void> {
    if (!this.masterConnection) {
      throw new Error("No connection to master");
    }

    console.log("Sending PSYNC command to master");

    const res = await this.sendCommandToMaster("PSYNC", ["?", "-1"]);

    console.log("PSYNC command sent successfully");
  }

  private cleanup(): void {
    if (this.masterConnection) {
      this.masterConnection.destroy();
      this.masterConnection = null;
    }
  }

  public setListeningPort(port: number): void {
    this.config.port = port;
  }

  public setIpAddress(ip: string): void {
    this.config.ipAddress = ip;
  }
  public addCapabilities(capability: string[]): void {
    if (!this.config.capabilities) {
      this.config.capabilities = [];
    }

    this.config.capabilities.push(...capability);
  }
}
