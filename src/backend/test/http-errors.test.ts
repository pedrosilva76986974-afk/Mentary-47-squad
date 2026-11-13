import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { app } from "../src/app.js";

test("invalid JSON is a client error and never leaks parser details", async () => {
  const response = await request(app)
    .post("/questions/selection")
    .set("Content-Type", "application/json")
    .send('{"ids":');
  assert.equal(response.status, 400);
  assert.match(response.body.error, /JSON válido/);
  assert.doesNotMatch(response.body.error, /SyntaxError|Unexpected|stack/);
});

test("oversized JSON receives 413 before reaching the database", async () => {
  const response = await request(app)
    .post("/questions/selection")
    .send({ ids: ["x".repeat(110 * 1024)] });
  assert.equal(response.status, 413);
  assert.match(response.body.error, /100 KB/);
});
