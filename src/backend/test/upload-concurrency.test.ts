import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { createUploadConcurrencyLimiter } from "../src/middlewares/upload-concurrency.middleware.js";

function createResponse(): { response: Response; listeners: Map<string, () => void>; statusCode?: number; body?: unknown } {
  const listeners = new Map<string, () => void>();
  const state: { statusCode?: number; body?: unknown } = {};
  const response = {
    once(event: string, listener: () => void) {
      listeners.set(event, listener);
      return this;
    },
    status(statusCode: number) {
      state.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as Response;
  return {
    response,
    listeners,
    get statusCode() { return state.statusCode; },
    get body() { return state.body; },
  };
}

test("limits concurrent document uploads and releases the slot when the response closes", () => {
  const limitUploads = createUploadConcurrencyLimiter(1);
  let nextCalls = 0;
  const next = (): void => { nextCalls += 1; };
  const first = createResponse();
  limitUploads({} as Request, first.response, next);
  assert.equal(nextCalls, 1);

  const rejected = createResponse();
  limitUploads({} as Request, rejected.response, next);
  assert.equal(nextCalls, 1);
  assert.equal(rejected.statusCode, 429);
  assert.match(String((rejected.body as { error?: string }).error), /Outro documento/);

  first.listeners.get("finish")?.();
  first.listeners.get("close")?.();
  const nextUpload = createResponse();
  limitUploads({} as Request, nextUpload.response, next);
  assert.equal(nextCalls, 2);
  nextUpload.listeners.get("close")?.();
});
