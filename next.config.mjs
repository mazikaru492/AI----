/** @type {import('next').NextConfig} */
const nextConfig = {
  // Webpack設定: @react-pdf/renderer が依存するNodeモジュールをブラウザバンドルから除外する
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias.canvas = false;
      config.resolve.alias.encoding = false;
    }
    return config;
  },
  // App Routerでの利用を許可するための設定
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
