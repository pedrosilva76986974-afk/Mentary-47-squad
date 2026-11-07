import assert from "node:assert/strict";
import { test } from "node:test";
import { editAlternative, removeAlternative, nextAlternativeLabel } from "../../frontend/src/utils/alternative-editing.js";
test("relabeling a selected alternative preserves the answer association without mutating saved values", () => {
  const original = [{ label: "1", text: "first\nline | kept" }, { label: "2", text: "second" }];
  const result = editAlternative(original, "2", 1, { label: "B" });
  assert.equal(result.answerKey, "B");
  assert.equal(original[1]!.label, "2");
  assert.equal(result.alternatives[0]!.text, "first\nline | kept");
  assert.equal(editAlternative([{ label: " b ", text: "answer" }], "B", 0, { label: "C" }).answerKey, "C");
});
test("removing an alternative clears only its own answer key and does not renumber remaining choices", () => {
  const original = [{ label: "A", text: "first" }, { label: "C", text: "third" }];
  assert.equal(removeAlternative(original, "A", 0).answerKey, null);
  assert.equal(removeAlternative(original, "C", 0).answerKey, "C");
  assert.equal(removeAlternative(original, "A", 0).alternatives[0]!.label, "C");
  assert.equal(nextAlternativeLabel(original), "B");
  assert.equal(nextAlternativeLabel([{ label: "1", text: "" }, { label: "3", text: "" }]), "2");
});
