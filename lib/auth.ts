import { MongoDBAdapter } from "@auth/mongodb-adapter";
import NextAuth from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { getMongoClient } from "@/lib/mongodb";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  adapter: MongoDBAdapter(() => getMongoClient()),
  session: { strategy: "jwt" },
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID || "github-client-id-not-configured",
      clientSecret:
        process.env.GITHUB_SECRET || "github-client-secret-not-configured",
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name || profile.login,
          email: profile.email,
          image: profile.avatar_url,
        };
      },
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user, profile }) {
      if (user) {
        if (user.id) token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }
      if (profile) {
        const githubName =
          typeof profile.name === "string" && profile.name
            ? profile.name
            : typeof profile.login === "string"
              ? profile.login
              : undefined;
        if (githubName) token.name = githubName;
        if (typeof profile.email === "string") token.email = profile.email;
        if (typeof profile.avatar_url === "string")
          token.picture = profile.avatar_url;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof token.email === "string") session.user.email = token.email;
        if (typeof token.picture === "string")
          session.user.image = token.picture;
      }
      return session;
    },
  },
});
