import * as fs from "fs";
import * as vscode from "vscode";

// Ensure configuration methods are imported if refactored

export enum LogLevel {
    Info = "INFO",
    Debug = "DEBUG",
    Error = "ERROR",
}

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private logFilePath?: string;

    constructor(channelName: string, logFilePath?: string) {
        this.outputChannel = vscode.window.createOutputChannel(channelName);
        this.logFilePath = logFilePath;
    }

    public logToFile(message: string) {
        if (!this.logFilePath) {
            throw new Error("logFilePath must be defined to log to file");
        }
        const timestamp = new Date().toISOString();
        fs.appendFileSync(this.logFilePath, `${timestamp} - ${message}\n`);
    }

    public logToOutputChannel(message: string) {
        this.outputChannel.appendLine(`${new Date().toISOString()} - ${message}`);
    }

    public log(level: LogLevel, message: string, properties?: any) {
        const formattedMessage = `${level} ${message} ${properties ? JSON.stringify(properties) : ''}`;
        this.logToOutputChannel(formattedMessage);
        if (this.logFilePath) {
            this.logToFile(formattedMessage);
        }
    }
}