const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'node_modules', 'buffer-equal-constant-time', 'index.js');

if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const search = 'var origSlowBufEqual = SlowBuffer.prototype.equal;';
    const replace = 'var origSlowBufEqual = Buffer.prototype.equal;';

    if (content.includes(search)) {
        content = content.replace(search, replace);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Successfully patched buffer-equal-constant-time');
    } else if (content.includes(replace)) {
        console.log('buffer-equal-constant-time already patched');
    } else {
        console.warn('Could not find string to patch in buffer-equal-constant-time');
    }
} else {
    console.warn('buffer-equal-constant-time not found at ' + filePath);
}
