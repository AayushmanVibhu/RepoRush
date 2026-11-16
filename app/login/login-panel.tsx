"use client";
import { ArrowRight, Check, Eye, EyeOff, Github, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "../brand-logo";
import { signIn } from "next-auth/react";
import { challenges } from "../challenges";

export function LoginPanel({
  mode = "login",
  existingAccountName,
}: {
  mode?: "login" | "signup";
  existingAccountName?: string;
}) {
  const signingUp = mode === "signup";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"password" | "github" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code)
      setError(
        code === "OAuthAccountNotLinked"
          ? "Use your original sign-in method, then add another method from your account menu."
          : "Sign-in could not be completed. Please try again.",
      );
    if (new URLSearchParams(window.location.search).get("registered") === "1")
      setNotice(
        "Your account was created. Sign in with your new username and password.",
      );
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,29}$/.test(username.trim())) {
      setError(
        signingUp
          ? "Use 3–30 letters, numbers, underscores or hyphens. Start with a letter or number."
          : "Incorrect username or password.",
      );
      return;
    }
    if (signingUp && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy("password");
    let created = false;
    try {
      if (signingUp) {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            password,
            confirmPassword: confirmation,
            intent: existingAccountName ? 'link' : 'create',
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw Error(
            data.error || "Could not create your account. Please retry.",
          );
        created = true;
      }
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
        redirectTo: "/",
      });
      if (result?.error) {
        if (created) {
          setPassword("");
          setConfirmation("");
          window.location.assign("/login?registered=1");
          return;
        }
        throw Error(
          result.code === "rate_limited"
            ? "Too many attempts. Please try again later."
            : result.code === "temporarily_unavailable"
              ? "Sign-in is temporarily unavailable. Please try again."
              : "Incorrect username or password.",
        );
      }
      if (!result?.ok)
        throw Error("Sign-in could not be completed. Please try again.");
      window.location.assign("/");
    } catch (failure) {
      if (created) {
        window.location.assign("/login?registered=1");
        return;
      }
      setError((failure as Error).message);
      setBusy(null);
    }
  }
  async function github() {
    if (busy) return;
    setBusy("github");
    setError("");
    try {
      await signIn("github", { callbackUrl: "/" });
    } catch {
      setError("GitHub sign-in could not start. Please try again.");
      setBusy(null);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <span className="mark">
            <BrandLogo />
          </span>
        </div>
        <div className="login-copy">
          <p className="eyebrow">Practice inside real code</p>
          <h1>Build confidence in unfamiliar repositories.</h1>
          <p>
            Debug realistic JavaScript, Python, and Java projects in a focused
            workspace that remembers your progress.
          </p>
          <ul>
            <li>
              <Check />
              {challenges.length} curated repository challenges
            </li>
            <li>
              <Check />
              Durable workspaces across sessions
            </li>
            <li>
              <Sparkles />
              Personalized coaching that learns with you
            </li>
          </ul>
        </div>
        <small>RepoRush · A developer practice environment</small>
      </section>
      <section className="login-action">
        <div className="login-card">
          <span className="login-icon">
            <BrandLogo />
          </span>
          <p className="eyebrow">
            {signingUp
              ? existingAccountName
                ? "Your account"
                : "Get started"
              : "Welcome back"}
          </p>
          <h2>
            {signingUp
              ? existingAccountName
                ? "Add password sign-in"
                : "Create your account"
              : "Sign in to RepoRush"}
          </h2>
          <p>
            {existingAccountName
              ? `Add a username and password to ${existingAccountName}'s existing profile. Your progress and learning memory stay together.`
              : signingUp
                ? "Choose a username to save your work and build your interview skills."
                : "Pick up where you left off. Your code, progress and coach are waiting."}
          </p>
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={3}
              maxLength={30}
              aria-describedby={signingUp ? "username-help" : undefined}
              disabled={Boolean(busy)}
            />
            {signingUp && (
              <small id="username-help">
                3–30 letters, numbers, underscores or hyphens.
              </small>
            )}
            <label htmlFor="auth-password">Password</label>
            <div className="auth-password-field">
              <input
                id="auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={signingUp ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={signingUp ? 15 : undefined}
                maxLength={128}
                aria-describedby={signingUp ? "password-help" : undefined}
                disabled={Boolean(busy)}
              />
              <button
                type="button"
                className="password-visibility"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
                disabled={Boolean(busy)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {signingUp && (
              <small id="password-help">
                Use at least 15 characters. A memorable passphrase works well.
              </small>
            )}
            {signingUp && (
              <>
                <label htmlFor="auth-confirmation">Confirm password</label>
                <input
                  id="auth-confirmation"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  minLength={15}
                  maxLength={128}
                  disabled={Boolean(busy)}
                />
              </>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="auth-notice" role="status">
                {notice}
              </p>
            )}
            <button
              className="auth-submit"
              type="submit"
              disabled={Boolean(busy)}
            >
              {busy === "password"
                ? signingUp
                  ? "Creating your sign-in…"
                  : "Signing in…"
                : signingUp
                  ? existingAccountName
                    ? "Add password sign-in"
                    : "Create account"
                  : "Sign in"}
              <ArrowRight />
            </button>
          </form>
          {!existingAccountName && (
            <>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <button onClick={github} disabled={Boolean(busy)}>
                <Github />
                {busy === "github" ? "Opening GitHub…" : "Continue with GitHub"}
                <ArrowRight />
              </button>
            </>
          )}
          <p className="auth-switch">
            {existingAccountName ? (
              <Link href="/">Back to your workspace</Link>
            ) : signingUp ? (
              <>
                Already have an account? <Link href="/login">Sign in</Link>
              </>
            ) : (
              <>
                New to RepoRush? <Link href="/signup">Create an account</Link>
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
