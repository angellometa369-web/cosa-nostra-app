import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La PWA vive en /public; las APIs en /api/*
  // No forzar trailing slash para no romper fetch relativos
  poweredByHeader: false,
};

export default nextConfig;
