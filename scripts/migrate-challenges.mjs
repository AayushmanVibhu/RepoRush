import { loadTypeScript } from "./test-catalog-loader.mjs";

const args = process.argv.slice(2);
if (
  args.length > 1 ||
  (args.length && !["--dry-run", "--publish"].includes(args[0]))
) {
  throw new Error("Usage: npm run migrate:challenges -- [--dry-run|--publish]");
}
const { prepareLegacyPublications, createChallengeIndexes, publishChallenge } =
  loadTypeScript("lib/challenge-publishing.ts");
const prepared = prepareLegacyPublications(new Date());
const bytes = prepared.reduce(
  (total, row) =>
    total +
    row.artifacts.reduce((size, artifact) => size + artifact.bytes.length, 0),
  0,
);
for (const { publication } of prepared) {
  console.log(
    `${publication.challengeId} ${publication.version} ${publication.snapshotHash}`,
  );
}
console.log(
  `Validated ${prepared.length} challenges, ${prepared.length * 2} artifacts, ${bytes} bytes.`,
);
if (args[0] !== "--publish") {
  console.log("Dry run complete. No external writes.");
} else {
  if (!process.env.CHALLENGE_STORAGE_PROVIDER) {
    throw new Error(
      "Set CHALLENGE_STORAGE_PROVIDER explicitly to local or r2 before publishing.",
    );
  }
  const { challengeStorage } = loadTypeScript("lib/challenge-storage.ts");
  const { getMongoClient } = loadTypeScript("lib/mongodb.ts");
  const storage = challengeStorage();
  let inserted = 0;
  let uploaded = 0;
  const client = await getMongoClient();
  try {
    await createChallengeIndexes();
    for (const row of prepared) {
      try {
        const result = await publishChallenge(row, storage);
        inserted += Number(result.inserted);
        uploaded += result.uploaded;
      } catch (error) {
        throw new Error(
          `Publishing stopped at ${row.publication._id}. Earlier versions can be safely reused on retry.`,
          { cause: error },
        );
      }
    }
    console.log(
      `Published ${inserted} new versions, reused ${prepared.length - inserted}, wrote ${uploaded} artifact bytes.`,
    );
  } finally {
    await client.close().catch(() => {});
  }
}
