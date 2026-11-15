import { Template } from "e2b";

if (!process.env.E2B_API_KEY)
  throw new Error("Set E2B_API_KEY in your local environment first.");
const template = Template()
  .fromImage("node:22-bookworm")
  .runCmd(
    "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 python3-venv python3-pip openjdk-17-jdk-headless git curl less nano vim-tiny && rm -rf /var/lib/apt/lists/*",
    { user: "root" },
  )
  .runCmd(
    "id user >/dev/null 2>&1 || useradd --create-home --shell /bin/bash user",
    { user: "root" },
  )
  .runCmd("mkdir -p /home/user/repo && chown -R user:user /home/user/repo", {
    user: "root",
  })
  .setUser("user")
  .setWorkdir("/home/user/repo");
await Template.build(template, "reporush-linux");
console.log(
  "Template built. Set E2B_TEMPLATE=reporush-linux in Vercel and redeploy.",
);
