import { cacheSnapshot, readCachedSnapshot } from "./challenge-cache";
import {
  IMPORTED_CHALLENGE_VERSION,
  isRevision,
  sameRevision,
  type CatalogSource,
  type ChallengeCard,
  type ChallengeDetails,
  type ChallengeRevision,
  type WorkspaceChallenge,
} from "./challenge-model";
import {
  mergeFiles,
  validateFiles,
  type WorkspaceFiles,
} from "./sandbox-policy";

type CloudWorkspace = { files?: WorkspaceFiles; updatedAt?: string };
type Draft = {
  changed: WorkspaceFiles;
  deleted: string[];
  baseUpdatedAt: string | null;
  pending: boolean;
  savedAt: number;
};
export type OpenChallenge = {
  challenge: WorkspaceChallenge;
  draftRevision: ChallengeRevision;
  cloudFiles: WorkspaceFiles;
  updatedAt: string | null;
  initialFiles: WorkspaceFiles;
  conflicting: boolean;
};

class ChallengeRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function challengeJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new ChallengeRequestError(
      data?.error || "Could not load challenge data. Please retry.",
      response.status,
    );
  }
  return data as T;
}

export async function fetchChallengeCatalog(signal: AbortSignal) {
  return challengeJson<{ source: CatalogSource; challenges: ChallengeCard[] }>(
    await fetch("/api/challenges", { cache: "no-store", signal }),
  );
}

function draftPrefix(userId: string) {
  return `rr-challenge-draft:${encodeURIComponent(userId)}:`;
}

function draftKey(userId: string, id: string, revision: ChallengeRevision) {
  return (
    draftPrefix(userId) + `${id}:${revision.version}:${revision.snapshotHash}`
  );
}

export function sameFiles(a: WorkspaceFiles, b: WorkspaceFiles) {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(
      ([path, value]) => Object.hasOwn(b, path) && b[path] === value,
    )
  );
}

export function storeWorkspaceDraft(
  open: OpenChallenge,
  userId: string,
  files: WorkspaceFiles,
  updatedAt: string | null,
  pending: boolean,
) {
  const { challenge, draftRevision } = open;
  const changed = Object.fromEntries(
    Object.entries(files).filter(
      ([path, text]) =>
        !Object.hasOwn(challenge.files, path) || challenge.files[path] !== text,
    ),
  );
  const deleted = Object.keys(challenge.files).filter(
    (path) => !Object.hasOwn(files, path),
  );
  try {
    localStorage.setItem(
      draftKey(userId, challenge.id, draftRevision),
      JSON.stringify({
        changed,
        deleted,
        baseUpdatedAt: updatedAt,
        pending,
        savedAt: Date.now(),
      } satisfies Draft),
    );
    if (draftRevision.version === IMPORTED_CHALLENGE_VERSION) {
      localStorage.removeItem(`rr-files-${userId}-${challenge.id}`);
    }
  } catch {}
}

export function deleteWorkspaceDrafts(
  userId: string,
  catalog: ChallengeCard[],
) {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(draftPrefix(userId))) localStorage.removeItem(key);
  }
  for (const { id } of catalog) {
    localStorage.removeItem(`rr-files-${userId}-${id}`);
    localStorage.removeItem(`rr-files-${id}`);
  }
}

function readDraft(
  userId: string,
  challenge: WorkspaceChallenge,
  revision: ChallengeRevision,
) {
  try {
    const raw = localStorage.getItem(draftKey(userId, challenge.id, revision));
    if (raw !== null) {
      const value = JSON.parse(raw) as Draft;
      if (
        !Array.isArray(value.deleted) ||
        value.deleted.length > 100 ||
        !value.deleted.every(
          (path) =>
            typeof path === "string" && Object.hasOwn(challenge.files, path),
        ) ||
        (value.baseUpdatedAt !== null &&
          typeof value.baseUpdatedAt !== "string") ||
        typeof value.pending !== "boolean"
      )
        return null;
      const files = { ...challenge.files, ...validateFiles(value.changed) };
      for (const path of value.deleted) delete files[path];
      return {
        files: validateFiles(files),
        baseUpdatedAt: value.baseUpdatedAt,
        pending: value.pending,
      };
    }
    if (revision.version === IMPORTED_CHALLENGE_VERSION) {
      const previous = localStorage.getItem(
        `rr-files-${userId}-${challenge.id}`,
      );
      if (previous !== null) {
        return {
          files: withPublicTests(
            challenge,
            validateFiles(JSON.parse(previous)),
          ),
          baseUpdatedAt: undefined,
          pending: true,
        };
      }
    }
  } catch {}
  return null;
}

function withPublicTests(challenge: WorkspaceChallenge, files: WorkspaceFiles) {
  const added = Object.fromEntries(
    Object.entries(challenge.files).filter(
      ([path]) => path.startsWith("reporush/") && !Object.hasOwn(files, path),
    ),
  );
  return { ...added, ...files };
}

export function recoverWorkspace(
  challenge: WorkspaceChallenge,
  revision: ChallengeRevision,
  remote: CloudWorkspace | null,
  userId: string,
): OpenChallenge {
  const cloudFiles = remote?.files
    ? withPublicTests(challenge, validateFiles(remote.files))
    : challenge.files;
  const updatedAt = remote?.updatedAt ?? null;
  const draft = readDraft(userId, challenge, revision);
  let initialFiles = cloudFiles;
  let conflicting = false;
  if (draft?.baseUpdatedAt === undefined && draft) {
    const merged = mergeFiles(draft.files, challenge.files, cloudFiles);
    initialFiles = validateFiles(merged.files);
    conflicting = merged.conflicts.length > 0;
  } else if (draft && (draft.pending || !remote)) {
    initialFiles = draft.files;
    conflicting = Boolean(
      remote &&
      draft.baseUpdatedAt !== updatedAt &&
      !sameFiles(initialFiles, cloudFiles),
    );
  }
  return {
    challenge,
    draftRevision: revision,
    cloudFiles,
    updatedAt,
    initialFiles,
    conflicting,
  };
}

function draftHint(userId: string, id: string) {
  const query = new URLSearchParams();
  const prefix = draftPrefix(userId) + id + ":";
  try {
    let latest: (ChallengeRevision & { savedAt: number }) | undefined;
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(prefix)) continue;
      const [version, snapshotHash] = key.slice(prefix.length).split(":");
      const revision = { version, snapshotHash };
      const draft = JSON.parse(
        localStorage.getItem(key) || "null",
      ) as Draft | null;
      if (
        draft?.pending &&
        isRevision(revision) &&
        (!latest || (draft.savedAt || 0) > latest.savedAt)
      ) {
        latest = { ...revision, savedAt: draft.savedAt || 0 };
      }
    }
    if (latest) {
      query.set("draftVersion", latest.version);
      query.set("draftHash", latest.snapshotHash);
    } else if (localStorage.getItem(`rr-files-${userId}-${id}`) !== null) {
      query.set("legacyDraft", "1");
    }
  } catch {}
  return query.size ? "?" + query : "";
}

export async function openPublishedChallenge(
  id: string,
  userId: string,
  signal: AbortSignal,
): Promise<OpenChallenge> {
  const url = `/api/challenges/${encodeURIComponent(id)}`;
  const loaded = await challengeJson<{
    source: CatalogSource;
    challenge: ChallengeDetails;
    files?: WorkspaceFiles;
    draftRevision?: ChallengeRevision;
    progress?: CloudWorkspace | null;
  }>(await fetch(url + draftHint(userId, id), { signal, cache: "no-store" }));
  let files: WorkspaceFiles;
  let revision: ChallengeRevision;
  let remote = loaded.progress ?? null;
  if (loaded.source === "legacy") {
    if (!isRevision(loaded.draftRevision))
      throw new Error("The legacy workspace identity is invalid.");
    revision = loaded.draftRevision;
    files = validateFiles(loaded.files);
    try {
      const response = await fetch(`/api/progress/${encodeURIComponent(id)}`, {
        signal,
        cache: "no-store",
      });
      remote = (
        await challengeJson<{ progress: CloudWorkspace | null }>(response)
      ).progress;
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof ChallengeRequestError && error.status < 500)
      )
        throw error;
    }
  } else {
    if (!isRevision(loaded.challenge.revision))
      throw new Error("The published workspace identity is invalid.");
    revision = loaded.challenge.revision;
    const cached = await readCachedSnapshot(id, revision);
    if (cached) {
      files = cached;
    } else {
      const query = new URLSearchParams({
        version: revision.version,
        snapshot: revision.snapshotHash,
      });
      const snapshot = await challengeJson<{
        revision: ChallengeRevision;
        files: WorkspaceFiles;
      }>(await fetch(`${url}?${query}`, { signal, cache: "no-store" }));
      if (
        !isRevision(snapshot.revision) ||
        !sameRevision(snapshot.revision, revision)
      ) {
        throw new Error(
          "The published workspace changed while loading. Please retry.",
        );
      }
      files = await cacheSnapshot(id, revision, snapshot.files);
    }
  }
  if (
    loaded.challenge.id !== id ||
    !Object.hasOwn(files, loaded.challenge.entryFile)
  ) {
    throw new Error("The challenge workspace is incomplete.");
  }
  return recoverWorkspace(
    { ...loaded.challenge, files },
    revision,
    remote,
    userId,
  );
}
