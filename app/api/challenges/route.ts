import { auth } from "@/lib/auth";
import {
  challengeCatalogSource,
  challengeError,
  listChallengeCards,
} from "@/lib/challenge-catalog";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({
      source: challengeCatalogSource(),
      challenges: await listChallengeCards(),
    });
  } catch (error) {
    return challengeError(error);
  }
}
