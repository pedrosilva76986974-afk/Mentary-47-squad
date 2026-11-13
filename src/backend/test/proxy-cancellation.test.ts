import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "../../frontend/node_modules/vite/dist/node/index.js";
import frontendConfig from "../../frontend/vite.config.js";

test("aborting an upload through Vite closes the upstream API response", { timeout: 15000 }, async () => {
  let entered!: () => void;
  let disconnected!: () => void;
  const received = new Promise<void>(resolve => { entered = resolve; });
  const closed = new Promise<void>(resolve => { disconnected = resolve; });
  const upstream = createHttpServer((request, response) => {
    request.resume();
    response.once("close", disconnected);
    entered();
    // Keep the API request pending until the browser aborts it.
  });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = (upstream.address() as AddressInfo).port;
  const proxy = await createViteServer({
    configFile: false,
    root: fileURLToPath(new URL("../../frontend/", import.meta.url)),
    logLevel: "silent",
    server: {
      host: "127.0.0.1", port: 0,
      proxy: { "/documents": { ...frontendConfig.server.proxy["/documents"], target: `http://127.0.0.1:${upstreamPort}` } },
    },
  });
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await proxy.listen();
    const port = (proxy.httpServer!.address() as AddressInfo).port;
    const upload = fetch(`http://127.0.0.1:${port}/documents`, { method: "POST", body: "synthetic upload", signal: controller.signal });
    await received;
    controller.abort();
    await assert.rejects(upload, { name: "AbortError" });
    await Promise.race([
      closed,
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("The proxy kept the API request alive after browser cancellation")), 2000);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
    controller.abort();
    await proxy.close();
    upstream.closeAllConnections();
    await new Promise<void>(resolve => upstream.close(() => resolve()));
  }
});
