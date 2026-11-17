import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { MAX_ARTIFACT_BYTES } from "./challenge-model";
import { SandboxProblem } from "./sandbox-policy";

export type ChallengeStorage = {
  read(key: string): Promise<Buffer>;
  create(key: string, body: Buffer): Promise<boolean>;
};

export function artifactHash(body: string | Buffer) {
  return createHash("sha256").update(body).digest("hex");
}

export function artifactKey(
  category: "official" | "community",
  id: string,
  hash: string,
  artifact: "workspace" | "grading",
) {
  const key = `challenges/${category}/${id}/${hash}/${artifact}.json`;
  checkKey(key);
  return key;
}

function checkKey(key: string) {
  if (
    !/^challenges\/(?:official|community)\/[A-Z0-9][A-Z0-9-]{0,79}\/[a-f0-9]{64}\/(?:workspace|grading)\.json$/.test(
      key,
    )
  ) {
    throw new Error("Invalid challenge storage key.");
  }
}

function assertSize(size: number) {
  if (size > MAX_ARTIFACT_BYTES)
    throw new Error("Challenge artifact exceeds the size limit.");
}

export function localChallengeStorage(root: string): ChallengeStorage {
  const pathFor = (key: string) => {
    checkKey(key);
    return resolve(root, key);
  };
  return {
    async read(key) {
      const file = await open(pathFor(key), "r");
      try {
        const stat = await file.stat();
        assertSize(stat.size);
        const bytes = Buffer.alloc(stat.size);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead !== bytes.length)
          throw new Error("Incomplete challenge artifact.");
        return bytes;
      } finally {
        await file.close();
      }
    },
    async create(key, body) {
      assertSize(body.length);
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, body, { flag: "wx" });
        await link(temporary, path);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw error;
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    },
  };
}

let r2: ChallengeStorage | undefined;
function r2ChallengeStorage(): ChallengeStorage {
  if (r2) return r2;
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
  } = process.env;
  if (
    !R2_ACCOUNT_ID ||
    !/^[a-f0-9]{32}$/i.test(R2_ACCOUNT_ID) ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME
  ) {
    throw new Error(
      "Cloudflare R2 challenge storage is missing configuration.",
    );
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  r2 = {
    async read(key) {
      checkKey(key);
      const signal = AbortSignal.timeout(10000);
      const { Body, ContentLength } = await client.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
        }),
        { abortSignal: signal },
      );
      if (!Body) throw new Error("Empty R2 object.");
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of Body as AsyncIterable<Uint8Array>) {
        signal.throwIfAborted();
        size += chunk.length;
        assertSize(size);
        chunks.push(Buffer.from(chunk));
      }
      if (ContentLength !== undefined && size !== ContentLength) {
        throw new Error("Incomplete R2 challenge object.");
      }
      return Buffer.concat(chunks, size);
    },
    async create(key, body) {
      checkKey(key);
      assertSize(body.length);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: body,
            ContentType: "application/json",
            StorageClass: "STANDARD",
            IfNoneMatch: "*",
          }),
          { abortSignal: AbortSignal.timeout(15000) },
        );
        return true;
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 412
        )
          return false;
        throw error;
      }
    },
  };
  return r2;
}

export function challengeStorage(): ChallengeStorage {
  const provider = process.env.CHALLENGE_STORAGE_PROVIDER ?? "local";
  if (provider === "local") {
    return localChallengeStorage(
      process.env.CHALLENGE_STORAGE_DIR || ".challenge-storage",
    );
  }
  if (provider === "r2") return r2ChallengeStorage();
  throw new Error("CHALLENGE_STORAGE_PROVIDER must be local or r2.");
}

export async function readArtifact(
  key: string,
  hash: string,
  storage?: ChallengeStorage,
) {
  try {
    const bytes = await (storage ?? challengeStorage()).read(key);
    if (artifactHash(bytes) !== hash) throw new Error("SHA-256 mismatch.");
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    const detail = error as {
      code?: string;
      name?: string;
      $metadata?: { httpStatusCode?: number };
    } | undefined;
    console.error(
      "[challenge-storage]",
      key,
      detail?.code ??
        detail?.$metadata?.httpStatusCode ??
        detail?.name ??
        "ReadError",
    );
    throw new SandboxProblem(
      `Published challenge artifact could not be loaded from ${process.env.CHALLENGE_STORAGE_PROVIDER ?? "local"} storage. Retry or contact the administrator.`,
      503,
    );
  }
}
