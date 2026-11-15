const assert = require("node:assert/strict");
const test = require("node:test");
const { formPrevalence } = require("../scripts/form-prevalence.js");

test("counts references and sorts by prevalence, with stable EID ties", () => {
  const people = [
    { formsToFill: ["z", "a", "z"] },
    { formsToFill: ["a", "b", "z"] },
    { formsToFill: ["b"] },
  ];
  const before = JSON.stringify(people);
  const result = formPrevalence(people);
  assert.deepEqual(result, { z: 3, a: 2, b: 2 });
  assert.deepEqual(Object.keys(result), ["z", "a", "b"]);
  assert.equal(JSON.stringify(people), before);
});

test("handles empty input and treats special property names as data", () => {
  assert.deepEqual(formPrevalence([]), {});
  const result = formPrevalence([{ formsToFill: ["__proto__", "__proto__"] }]);
  assert.equal(Object.hasOwn(result, "__proto__"), true);
  assert.equal(result.__proto__, 2);
});
