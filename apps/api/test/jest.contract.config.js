/** @type {import('ts-jest').JestConfigWithTsJest} */
// Contract suite: asserts the emitted GraphQL SDL matches packages/contracts/schema.graphql.
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/test/contract/**/*.spec.ts'],
};
