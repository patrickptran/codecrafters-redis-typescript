import * as net from "net";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment the code below to pass the first stage
const server: net.Server = net.createServer((connection: net.Socket) => {
  // Handle connection
  connection.on("data", (data: Buffer) => {
    // connection.write("+PONG\r\n");
    const command = data.toString().trim();
    if (command === "PING") {
      connection.write("+PONG\r\n", () => {
        connection.end();
      });
    }
  });
});
//
server.listen(6379, "127.0.0.1");
