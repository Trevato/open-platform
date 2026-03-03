/** @type {import('next').NextConfig} */
module.exports = {
  output: "standalone",
  serverExternalPackages: ["@kubernetes/client-node"],
};
