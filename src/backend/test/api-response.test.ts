import assert from "node:assert/strict";
import { test } from "node:test";
import { readApiResponse } from "../../frontend/src/utils/api-response.js";

test("empty and non-JSON responses produce actionable errors instead of JSON syntax exceptions", async () => {
  for (const response of [
    new Response("", { status: 500 }), new Response("", { status: 200 }),
    new Response("<html>Proxy error</html>", { status: 502 }),
    new Response('{"status":', { status: 200 }),
  ]) {
    await assert.rejects(readApiResponse(response), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /backend.*3000/);
      assert.doesNotMatch(error.message, /Unexpected end|<html>/);
      return true;
    });
  }
});
test("API response reader preserves validation errors and successful data", async () => {
  await assert.rejects(readApiResponse(new Response(JSON.stringify({ error: "Configure OLLAMA_MODEL" }), { status: 400 })), /Configure OLLAMA_MODEL/);
  assert.deepEqual(await readApiResponse(new Response('{"status":"queued"}', { status: 202 })), { status: "queued" });
  await assert.rejects(readApiResponse(new Response("null")), /formato inválido/);
});
