import { createServer } from "node:http";

const PORT = process.env.PORT ?? 8082;
const SERVICE = "payment-service";

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ service: SERVICE, status: "ok", version: process.env.APP_VERSION ?? "1.0.0" }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ service: SERVICE, message: "hello from payment-service" }));
});

server.listen(PORT, () => console.log(`payment-service listening on ${PORT}`));

export { server };
