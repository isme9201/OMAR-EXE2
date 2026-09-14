/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  },
  trailingSlash: true,
  experimental: {
    prerenderEarlyExit: false,
    serverMinification: false
  }
};

module.exports = nextConfig;
