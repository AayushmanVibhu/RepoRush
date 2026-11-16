// Creates one synthetic username account. Never uses another user's credentials.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const origin = "https://repo-rush.vercel.app";
const fixturePath = join(tmpdir(), "reporush-auth-smoke.json");
let fixture;
try {
  fixture = JSON.parse(await readFile(fixturePath, "utf8"));
} catch {}
fixture ||= {
  username: `rr_test_${randomBytes(5).toString("hex")}`,
  password: randomBytes(30).toString("base64url"),
};
function client() {
  const cookies = new Map();
  let sessionHeaders = [];
  return {
    get sessionHeaders() {
      return sessionHeaders;
    },
    async request(path, { method = "GET", body, headers = {} } = {}) {
      const response = await fetch(origin + path, {
        method,
        headers: {
          ...(method === "GET" ? {} : { Origin: origin }),
          ...(cookies.size
            ? {
                Cookie: [...cookies]
                  .map(([key, value]) => `${key}=${value}`)
                  .join("; "),
              }
            : {}),
          ...headers,
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(45000),
      });
      for (const header of response.headers.getSetCookie()) {
        const [pair] = header.split(";");
        const at = pair.indexOf("=");
        const name = pair.slice(0, at),
          value = pair.slice(at + 1);
        if (value && !/max-age=0\b/i.test(header)) cookies.set(name, value);
        else cookies.delete(name);
        if (/session-token/.test(name) && value) sessionHeaders.push(header);
      }
      return response;
    },
  };
}
async function json(response) {
  return response.json();
}
async function login(actor, username, password) {
  const csrf = await json(await actor.request("/api/auth/csrf"));
  const response = await actor.request("/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({
      username,
      password,
      csrfToken: csrf.csrfToken,
      callbackUrl: `${origin}/`,
    }).toString(),
  });
  return json(response);
}
try {
  const anonymous = client();
  const providers = await json(await anonymous.request("/api/auth/providers"));
  assert.ok(
    providers.github && providers.credentials,
    "Both GitHub and credentials providers must be available",
  );
  assert.equal((await anonymous.request("/api/progress")).status, 401);
  assert.equal(
    (
      await anonymous.request("/api/register", {
        method: "POST",
        headers: {
          Origin: "https://invalid.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await anonymous.request("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "invalid user",
          password: "short",
          confirmPassword: "short",
        }),
      })
    ).status,
    400,
  );
  if (!fixture.created) {
    const response = await anonymous.request("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fixture, confirmPassword: fixture.password }),
    });
    const data = await json(response);
    assert.equal(
      response.status,
      201,
      `Synthetic signup failed (${response.status}): ${data.error || ""}`,
    );
    assert.equal(data.created, true);
    assert.ok(!JSON.stringify(data).includes(fixture.password));
    fixture.created = true;
    await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  }
  const wrong = await login(
    anonymous,
    fixture.username,
    "fixture-incorrect-password",
  );
  assert.equal(
    new URL(wrong.url).searchParams.get("error"),
    "CredentialsSignin",
  );
  assert.ok(
    !(await json(await anonymous.request("/api/auth/session"))).user,
    "Wrong password must not create a session",
  );
  const signed = await login(
    anonymous,
    fixture.username.toUpperCase(),
    fixture.password,
  );
  assert.ok(
    !new URL(signed.url).searchParams.get("error"),
    "Credentials login must succeed",
  );
  const session = await json(await anonymous.request("/api/auth/session"));
  assert.equal(session.user.username, fixture.username);
  assert.ok(session.user.id);
  assert.ok(!JSON.stringify(session).includes(fixture.password));
  assert.ok(!("passwordHash" in session.user));
  fixture.userId = session.user.id;
  await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  assert.ok(anonymous.sessionHeaders.length > 0);
  assert.ok(
    anonymous.sessionHeaders.every(
      (value) =>
        /httponly/i.test(value) &&
        /secure/i.test(value) &&
        /samesite=lax/i.test(value),
    ),
    "Session cookies must be HttpOnly, Secure and SameSite=Lax",
  );
  const progress = await json(await anonymous.request("/api/progress"));
  assert.equal(
    progress.progress.length,
    0,
    "A new account must not inherit another account’s progress",
  );
  const chat = await json(
    await anonymous.request("/api/coach?challengeId=RR-104"),
  );
  assert.equal(
    chat.messages.length,
    0,
    "A new account must not inherit another account’s chats",
  );
  const duplicate = client();
  assert.equal(
    (
      await duplicate.request("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: fixture.username.toUpperCase(),
          password: fixture.password,
          confirmPassword: fixture.password,
        }),
      })
    ).status,
    409,
  );
  const csrf = await json(await anonymous.request("/api/auth/csrf"));
  await anonymous.request("/api/auth/signout", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      callbackUrl: `${origin}/login`,
    }).toString(),
  });
  assert.ok(
    !(await json(await anonymous.request("/api/auth/session"))).user,
    "Sign-out must clear the session",
  );
  const again = await login(anonymous, fixture.username, fixture.password);
  assert.ok(!new URL(again.url).searchParams.get("error"));
  assert.equal(
    (await json(await anonymous.request("/api/auth/session"))).user.id,
    fixture.userId,
    "Login must retain the same profile",
  );
  console.log(
    "PASS: live signup, case-insensitive login, wrong-password rejection, duplicate prevention, secure cookies, profile isolation, sign-out and repeat login. Synthetic credentials were saved only to a temporary local fixture.",
  );
} catch (error) {
  console.error(`Auth smoke test failed: ${error.message}`);
  process.exitCode = 1;
}
