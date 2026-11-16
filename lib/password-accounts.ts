import { createHmac } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase, getMongoClient } from "./mongodb";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  normalizeUsername,
  validNewPassword,
  verifyPassword,
} from "./passwords";

export class AccountError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
type PublicUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};
type PasswordAccount = {
  _id: string;
  userId: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
};
type RateCounter = { _id: string; count: number; expiresAt: Date };
let indexes: Promise<unknown> | undefined;
async function collections() {
  const db = await getDatabase();
  const accounts = db.collection<PasswordAccount>("passwordAccounts");
  const rates = db.collection<RateCounter>("authRateLimits");
  indexes ||= Promise.all([
    accounts.createIndex(
      { userId: 1 },
      { unique: true, name: "one_password_per_user" },
    ),
    rates.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "auth_rate_expiry" },
    ),
  ]).catch((error) => {
    indexes = undefined;
    throw error;
  });
  await indexes;
  return { accounts, rates };
}
export async function accountPermit(
  request: Request,
  action: "signup" | "login",
  username: string,
) {
  const { rates } = await collections();
  // Vercel overwrites X-Forwarded-For. Self-hosted deployments must use a trusted proxy.
  const ip =
    request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      .trim()
      .slice(0, 100) || "unknown";
  const period = action === "signup" ? 3600000 : 900000;
  const bucket = Math.floor(Date.now() / period);
  const limits: [string, number][] =
    action === "signup"
      ? [
          [`ip:${ip}`, 5],
          ["global", 250],
        ]
      : [
          [`ip:${ip}`, 60],
          [`pair:${ip}:${username}`, 10],
          [`username:${username}`, 20],
          ["global", 3000],
        ];
  for (const [identity, maximum] of limits) {
    const fingerprint = createHmac(
      "sha256",
      process.env.AUTH_SECRET ||
        process.env.NEXTAUTH_SECRET ||
        "local-development",
    )
      .update(`${action}:${identity}`)
      .digest("hex");
    const _id = `${fingerprint}:${bucket}`;
    await rates.updateOne(
      { _id },
      {
        $setOnInsert: { count: 0, expiresAt: new Date((bucket + 2) * period) },
      },
      { upsert: true },
    );
    const accepted = await rates.findOneAndUpdate(
      { _id, count: { $lt: maximum } },
      { $inc: { count: 1 } },
    );
    if (!accepted)
      throw new AccountError("Too many attempts. Please try again later.", 429);
  }
}
export async function passwordUsername(userId: string): Promise<string | null> {
  const { accounts } = await collections();
  return (
    (await accounts.findOne({ userId }, { projection: { username: 1 } }))
      ?.username || null
  );
}
export async function registerPasswordAccount(
  input: { username?: unknown; password?: unknown; confirmPassword?: unknown },
  existingUser: PublicUser | null,
  request: Request,
) {
  const usernameKey = normalizeUsername(input.username);
  if (!usernameKey)
    throw new AccountError(
      "Use 3–30 letters, numbers, underscores or hyphens. Start with a letter or number.",
      400,
    );
  if (!validNewPassword(input.password))
    throw new AccountError("Use a password with 15 to 128 characters.", 400);
  if (input.password !== input.confirmPassword)
    throw new AccountError("The passwords do not match.", 400);
  await accountPermit(request, "signup", usernameKey);
  const { accounts } = await collections();
  if (await accounts.findOne({ _id: usernameKey }))
    throw new AccountError("That username is unavailable. Try another.", 409);
  if (existingUser && (await accounts.findOne({ userId: existingUser.id })))
    throw new AccountError(
      "Password sign-in is already set up for this account.",
      409,
    );
  const passwordHash = await hashPassword(input.password);
  const client = await getMongoClient();
  // Match the existing MongoDBAdapter database. Do not relocate GitHub user records.
  const users = client.db().collection<{
    _id: ObjectId;
    name: string | null;
    email: string | null;
    emailVerified: null;
    image: string | null;
  }>("users");
  const userId = existingUser?.id || new ObjectId().toHexString();
  if (existingUser && !ObjectId.isValid(userId))
    throw new AccountError(
      "Sign out and sign in again before adding a password.",
      409,
    );
  const username = (input.username as string).trim();
  const transaction = client.startSession();
  try {
    await transaction.withTransaction(async () => {
      if (existingUser) {
        if (
          !(await users.findOne(
            { _id: new ObjectId(userId) },
            { session: transaction },
          ))
        )
          throw new AccountError(
            "Sign out and sign in again before adding a password.",
            409,
          );
      } else
        await users.insertOne(
          {
            _id: new ObjectId(userId),
            name: username,
            email: null,
            emailVerified: null,
            image: null,
          },
          { session: transaction },
        );
      await accounts.insertOne(
        {
          _id: usernameKey,
          userId,
          username,
          passwordHash,
          createdAt: new Date(),
        },
        { session: transaction },
      );
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new AccountError(
        "That username or account already has password sign-in. Try signing in.",
        409,
      );
    throw error;
  } finally {
    await transaction.endSession();
  }
  return { created: true, linked: Boolean(existingUser), username };
}
export async function authenticatePassword(
  username: unknown,
  password: unknown,
  request: Request,
) {
  const usernameKey = normalizeUsername(username);
  await accountPermit(request, "login", usernameKey || "invalid");
  if (
    !usernameKey ||
    typeof password !== "string" ||
    password.length > 256 ||
    !password ||
    Array.from(password).length > 128
  )
    return null;
  const { accounts } = await collections();
  const account = await accounts.findOne({ _id: usernameKey });
  const valid = await verifyPassword(
    password,
    account?.passwordHash || DUMMY_PASSWORD_HASH,
  );
  if (!account || !valid) return null;
  const user = await (
    await getMongoClient()
  )
    .db()
    .collection<{
      _id: ObjectId;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    }>("users")
    .findOne(
      { _id: new ObjectId(account.userId) },
      { projection: { name: 1, email: 1, image: 1 } },
    );
  if (!user) return null;
  return {
    id: account.userId,
    name: user.name || account.username,
    email: user.email || null,
    image: user.image || null,
    username: account.username,
  };
}
