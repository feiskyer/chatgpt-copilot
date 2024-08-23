module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^vscode$': '<rootDir>/test/mocks/vscodeMock.ts', // point to your mock file
    },
};
