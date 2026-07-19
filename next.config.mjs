/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 為原生模組,需列為外部套件
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
};
export default nextConfig;
