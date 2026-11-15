const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}

function loadAuth() {
  const module = { exports: {} };
  const authService = {
    async findOne({ token }) {
      return token === "AbC123Token" ? { id: "auth-1", user: "user-1" } : null;
    },
  };
  const source = fs.readFileSync(
    path.join(__dirname, "../app/api/common/auth.js"),
    "utf8",
  );
  vm.runInNewContext(
    source,
    {
      module,
      require(name) {
        if (name === "app/modules/auth") return authService;
        if (name === "app/lib/errors")
          return { UnauthorizedError, ForbiddenError };
        throw new Error(`Unexpected dependency ${name}`);
      },
    },
    { timeout: 1000 },
  );
  return new module.exports();
}

test("preserves token case while accepting case-insensitive Bearer scheme", async () => {
  const auth = loadAuth();
  const req = {
    headers: { authorization: "bEaReR AbC123Token" },
    params: { id: "user-1" },
  };
  await auth.requiresCurrentUser(req);
  assert.equal(req.userId, "user-1");
});

test("rejects missing, invalid, and malformed credentials", async () => {
  for (const authorization of [
    "",
    "Basic AbC123Token",
    "Bearer wrong",
    "Bearer AbC123Token extra",
  ]) {
    await assert.rejects(
      loadAuth().requiresLogin({ headers: { authorization } }),
      UnauthorizedError,
    );
  }
});

test("forbids authenticated users from modifying another account", async () => {
  await assert.rejects(
    loadAuth().requiresCurrentUser({
      headers: { authorization: "Bearer AbC123Token" },
      params: { id: "someone-else" },
    }),
    ForbiddenError,
  );
});
