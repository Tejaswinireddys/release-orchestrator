import { createServer } from "node:http";

const PORT = process.env.PORT ?? 8081;
const SERVICE = "auth-service";

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ service: SERVICE, status: "ok", version: process.env.APP_VERSION ?? "1.0.0" }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ service: SERVICE, message: "hello from auth-service" }));
});

server.listen(PORT, () => console.log(`auth-service listening on ${PORT}`));

export { server };
