/** @type {import('ts-jest').JestConfigWithTsJest} */
// Integration suite: resolvers + Prisma + RLS + outbox. Requires a running PostgreSQL/Redis
// (see docker-compose.yml) and DATABASE_URL/REDIS_URL in the environment.
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  testTimeout: 30000,
};
