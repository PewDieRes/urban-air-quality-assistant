const isDevelopment = process.env.NODE_ENV === "development";

const scriptSrcDirectives = [
  "'self'",
  "'unsafe-inline'",
  "'wasm-unsafe-eval'",
  ...(isDevelopment ? ["'unsafe-eval'"] : []),
].join(" ");

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src ${scriptSrcDirectives}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org https://*.openfreemap.org https://tile.googleapis.com https://assets.ion.cesium.com https://*.cesium.com",
  "font-src 'self' data: https://tiles.openfreemap.org https://*.openfreemap.org",
  "worker-src 'self' blob:",
  "connect-src 'self' data: blob: https://tiles.openfreemap.org https://*.openfreemap.org https://tile.googleapis.com https://assets.ion.cesium.com https://api.cesium.com https://*.cesium.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
