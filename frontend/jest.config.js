// jest.config.js
// next/jest provides SWC compilation (TypeScript + path aliases) automatically.
// The genlayer-js package ships only an ESM dist/index.js; we remap all three
// entry-points to their .cjs equivalents so Jest (CommonJS runtime) can load them.

const nextJest = require("next/jest");
const createJestConfig = nextJest({ dir: "./" });

module.exports = createJestConfig({
  testEnvironment: "node",
  moduleNameMapper: {
    "^genlayer-js$":        "<rootDir>/node_modules/genlayer-js/dist/index.cjs",
    "^genlayer-js/types$":  "<rootDir>/node_modules/genlayer-js/dist/types/index.cjs",
    "^genlayer-js/chains$": "<rootDir>/node_modules/genlayer-js/dist/chains/index.cjs",
  },
  testMatch: [
    "<rootDir>/tests/unit/**/*.test.ts",
    "<rootDir>/tests/integration/**/*.test.ts",
  ],
  testTimeout: 30000,
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/tests/e2e/"],
  verbose: true,
});
