const CopyPlugin = require("copy-webpack-plugin");

/** @type {import('next').NextConfig} */
module.exports = {
  output: "standalone",
  serverExternalPackages: ["node-pty", "@kubernetes/client-node"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.plugins.push(
        new CopyPlugin({
          patterns: [
            {
              from: "node_modules/ghostty-web/ghostty-vt.wasm",
              to: "../public/",
            },
          ],
        })
      );
    }
    return config;
  },
};
