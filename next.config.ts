import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images:{
    remotePatterns:[
      {hostname: "lh3.googleusercontent.com"},
      {hostname: "ui-avatars.com"},
    ]
  }
};

export default nextConfig;
