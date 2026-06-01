import assert from "node:assert/strict";
import test from "node:test";
import { extractResponseText } from "../aiClient";

test("extracts OpenAI Responses output_text", () => {
  const text = extractResponseText(JSON.stringify({ output_text: "{\"matching\":{}}" }), "output_text");

  assert.equal(text, "{\"matching\":{}}");
});

test("extracts chat completions content by configured path", () => {
  const text = extractResponseText(
    JSON.stringify({ choices: [{ message: { content: "hello" } }] }),
    "choices.0.message.content",
  );

  assert.equal(text, "hello");
});
