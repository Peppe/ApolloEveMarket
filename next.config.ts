import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` otherwise rewrites AGENTS.md on every start, appending a block
  // that contains non-ASCII characters. AGENTS.md is this project's own rules
  // file and the repo is ASCII-only, so the generator stays off.
  agentRules: false,
};

export default nextConfig;
