/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Avatar uploads allow 2 MB files; multipart Server Action bodies need headroom.
      bodySizeLimit: "4mb"
    }
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com"
      }
    ]
  }
};

export default nextConfig;
