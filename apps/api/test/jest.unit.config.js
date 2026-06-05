/** @type {import('ts-jest').JestConfigWithTsJest} */
// Unit suite: pure domain calculations, isolated, no I/O (constitution Principle II).
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
};
