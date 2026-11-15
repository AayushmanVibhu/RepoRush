const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const repositoryName = "RepoRush";

const nextConfig = {
  output: "export" as const,
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: isGitHubPages ? `/${repositoryName}` : "",
  assetPrefix: isGitHubPages ? `/${repositoryName}/` : "",
};
export default nextConfig;
