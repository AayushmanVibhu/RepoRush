import { auth } from "@/lib/auth";
import { passwordUsername } from "@/lib/password-accounts";
import { redirect } from "next/navigation";
import { LoginPanel } from "../login/login-panel";

export default async function SignupPage() {
  const session = await auth();
  if (session?.user?.id && (await passwordUsername(session.user.id)))
    redirect("/");
  return (
    <LoginPanel
      mode="signup"
      existingAccountName={
        session?.user?.name || (session?.user ? "your account" : undefined)
      }
    />
  );
}
