const { defineConfig } = require("vitest/config");

/**
 * @param {import('vitest/config').UserConfig} [overrides]
 */
function defineBaseVitestConfig(overrides = {}) {
  const test = overrides.test || {};
  const resolve = overrides.resolve || {};
  const rest = { ...overrides, test: undefined, resolve: undefined };

  return defineConfig({
    test: {
      globals: true,
      environment: "node",
      include: ["**/*.test.ts"],
      ...test,
    },
    resolve: {
      alias: {
        ...(resolve.alias || {}),
      },
      ...resolve,
    },
    ...rest,
  });
}

module.exports = { defineBaseVitestConfig };
