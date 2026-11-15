"use client";
import { ArrowRight, Check, GitBranch, Github, Sparkles } from "lucide-react";
import { signIn } from "next-auth/react";
import { challenges } from "../challenges";

export function LoginPanel() {
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <span className="mark">
            <GitBranch size={14} />
          </span>
          <strong>RepoRush</strong>
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
            <GitBranch />
          </span>
          <p className="eyebrow">Welcome</p>
          <h2>Continue to RepoRush</h2>
          <p>
            Sign in to save code, submit fixes, and track your progress across
            every challenge.
          </p>
          <button onClick={() => signIn("github", { callbackUrl: "/" })}>
            <Github />
            Continue with GitHub
            <ArrowRight />
          </button>
          <small>
            We store your public GitHub profile, progress, workspaces, and
            submission history. We never receive your GitHub password.
          </small>
        </div>
      </section>
    </main>
  );
}
