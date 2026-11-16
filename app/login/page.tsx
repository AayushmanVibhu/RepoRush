import { LoginPanel } from "./login-panel";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
export default async function LoginPage() {
  if ((await auth())?.user) redirect("/");
  return <LoginPanel />;
}
