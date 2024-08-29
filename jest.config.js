module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jest-environment-jsdom',
    setupFiles: ['<rootDir>/jest.setup.js'],
    moduleNameMapper: {
        '^vscode$': '<rootDir>/test/mocks/vscodeMock.ts', // point to your mock file
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.json' }],
        '^.+\\.(js|jsx)$': ['babel-jest', { configFile: './.babelrc' }], // Explicitly specify Babel config
    },
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    transformIgnorePatterns: [
        '/node_modules/(?!(delay)/)', // Allow 'delay' to be transformed
    ],
};
