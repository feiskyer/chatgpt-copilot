import * as fs from 'fs';
import * as vscode from "vscode";
import { Logger, LogLevel } from "../src/logger";

jest.mock("fs", () => ({
    appendFileSync: jest.fn(),
}));

jest.mock("vscode", () => {
    const appendLineMock = jest.fn();
    const createOutputChannelMock = jest.fn(() => ({
        appendLine: appendLineMock,
    }));

    return {
        window: {
            createOutputChannel: createOutputChannelMock,
        },
    };
});

describe('Logger Tests', () => {
    let logger: Logger;
    let mockOutputChannel: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = vscode.window.createOutputChannel("TestLogger");
        logger = new Logger("TestLogger", "test.log");
    });

    it('should log info messages correctly to output channel', () => {
        logger.log(LogLevel.Info, "This is an info message");

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining("INFO This is an info message"));
    });

    it('should log debug messages correctly to output channel', () => {
        logger.log(LogLevel.Debug, "This is a debug message");
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining("DEBUG This is a debug message"));
    });

    it('should log error messages correctly to output channel', () => {
        logger.log(LogLevel.Error, "This is an error message");
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining("ERROR This is an error message"));
    });

    it('should attempt to log to file if log file path is defined', () => {
        logger.log(LogLevel.Info, "Logging to file");
        expect(fs.appendFileSync).toHaveBeenCalled();
    });

    it('should format messages with additional properties correctly', () => {
        logger.log(LogLevel.Info, "Test info message", { key: "value" });
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('{"key":"value"}'));
    });

    it('should log messages with timestamps', () => {
        const message = "This message should contain a timestamp";
        logger.log(LogLevel.Info, message);

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(message));
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(new Date().toISOString()));
    });

    it('should log without throwing error if log file path is undefined', () => {
        const mockLoggerWithoutPath = new Logger("MockLoggerWithoutPath");
        expect(() => mockLoggerWithoutPath.logToFile("Test message")).not.toThrow();
    });

    it('should log different log levels correctly when using the same logger instance', () => {
        logger.log(LogLevel.Info, "First info message");
        logger.log(LogLevel.Error, "First error message");
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining("INFO"));
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining("ERROR"));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });
});
