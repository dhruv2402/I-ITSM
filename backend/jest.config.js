/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] },
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/seed/runSeed.ts'],
  testTimeout: 120000,
};
