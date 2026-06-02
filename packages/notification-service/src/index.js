import { createServer } from "node:http";

const PORT = process.env.PORT ?? 8083;
const SERVICE = "notification-service";

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ service: SERVICE, status: "ok", version: process.env.APP_VERSION ?? "1.0.0" }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ service: SERVICE, message: "hello from notification-service" }));
});

server.listen(PORT, () => console.log(`notification-service listening on ${PORT}`));

export { server };
