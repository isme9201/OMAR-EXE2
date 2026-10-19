/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true
  },
  trailingSlash: true,
  // TypeScript is checked explicitly in CI and must not be bypassed in releases.
};

module.exports = nextConfig;
