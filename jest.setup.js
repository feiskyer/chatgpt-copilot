const { TransformStream } = require('web-streams-polyfill');
const { TextDecoder } = require('util');
const { Response } = require('node-fetch');

// Polyfill TransformStream globally
global.TransformStream = TransformStream;

// Polyfill TextDecoder globally
global.TextDecoder = TextDecoder;

// Polyfill Response globally
global.Response = Response;
