/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss)$': '<rootDir>/src/tests/styleMock.ts',
  },
  globals: { 'ts-jest': { tsconfig: { jsx: 'react-jsx' } } },
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
};
