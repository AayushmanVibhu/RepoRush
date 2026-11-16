import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AccountError, registerPasswordAccount } from "@/lib/password-accounts";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  try {
    const raw = await request.text();
    if (raw.length > 4096)
      return NextResponse.json(
        { error: "Registration request is too large." },
        { status: 413 },
      );
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid registration request." },
        { status: 400 },
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json(
        { error: "Invalid registration request." },
        { status: 400 },
      );
    const session = await auth();
    const intent = body.intent || "create";
    if (!["create", "link"].includes(intent))
      return NextResponse.json(
        { error: "Invalid registration request." },
        { status: 400 },
      );
    if (session?.user && intent !== "link")
      return NextResponse.json(
        {
          error:
            "You are already signed in. Add password sign-in from your account menu.",
        },
        { status: 409 },
      );
    if (!session?.user && intent === "link")
      return NextResponse.json(
        { error: "Sign in again before adding password access." },
        { status: 401 },
      );
    const result = await registerPasswordAccount(
      body,
      session?.user || null,
      request,
    );
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AccountError
            ? error.message
            : "Account creation is temporarily unavailable. Please try again.",
      },
      { status: error instanceof AccountError ? error.status : 503 },
    );
  }
}
