// test/global.d.ts
export { };

declare global {
    var vscode: {
        window: {
            createOutputChannel: jest.Mock;
        };
    };
}
