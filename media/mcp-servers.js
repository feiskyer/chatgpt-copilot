const vscode = acquireVsCodeApi();

function logDebug(message, data) {
    console.log(`DEBUG: ${message}`, data);
    // Uncomment to help with troubleshooting
    // vscode.postMessage({ type: 'debug', message, data });
}

// Server state
let servers = [];

// DOM elements
document.addEventListener('DOMContentLoaded', () => {
    const serverList = document.getElementById('serverList');
    const addServerButton = document.getElementById('addServer');
    const addFirstServerButton = document.getElementById('addFirstServer');

    // Request initial data
    vscode.postMessage({ type: 'getServers' });

    // Add server button
    addServerButton.addEventListener('click', () => {
        showServerModal();
    });

    // Add first server button (in empty state)
    addFirstServerButton?.addEventListener('click', () => {
        showServerModal();
    });

    // Message handler
    window.addEventListener('message', (event) => {
        const message = event.data;
        console.log('Received message:', message);

        switch (message.type) {
            case 'updateServers':
                servers = message.servers;
                renderServerList();
                break;
        }
    });

    // Attach click handler to the entire document
    document.addEventListener('click', function (event) {
        console.log('Click event detected', event.target);

        // Use event delegation to handle button clicks
        if (event.target.classList.contains('delete-server') ||
            event.target.closest('.delete-server')) {
            const button = event.target.classList.contains('delete-server') ?
                event.target : event.target.closest('.delete-server');
            const serverId = button.getAttribute('data-id');
            console.log('Delete server clicked with ID:', serverId);

            if (serverId) {
                vscode.postMessage({
                    type: 'deleteServer',
                    id: serverId
                });
            }
        }

        if (event.target.classList.contains('edit-server') ||
            event.target.closest('.edit-server')) {
            const button = event.target.classList.contains('edit-server') ?
                event.target : event.target.closest('.edit-server');
            const serverId = button.getAttribute('data-id');
            console.log('Edit server clicked with ID:', serverId);

            const server = servers.find(s => s.id === serverId);
            if (server) {
                showServerModal(server);
            }
        }

        // Close modal button
        if (event.target.closest('.modal-close') ||
            (event.target.classList.contains('modal') && !event.target.closest('.modal-content'))) {
            closeModal();
        }
    });

    // Handle form submissions
    document.addEventListener('submit', function (event) {
        if (event.target.closest('#server-form')) {
            event.preventDefault();
            handleServerFormSubmit(event.target);
        }
    });

    // Render server list
    function renderServerList() {
        serverList.innerHTML = '';
        const emptyStateElem = document.getElementById('empty-state');

        if (servers.length === 0) {
            serverList.classList.add('hidden');
            emptyStateElem?.classList.remove('hidden');
            return;
        }

        serverList.classList.remove('hidden');
        emptyStateElem?.classList.add('hidden');

        servers.forEach(server => {
            const serverEl = document.createElement('div');
            serverEl.className = `server-item ${server.isEnabled ? '' : 'disabled'}`;

            // Create server content
            serverEl.innerHTML = `
                <div class="server-header">
                    <div class="server-title">
                        ${server.name}
                        <span class="server-type-badge">${server.type}</span>
                    </div>
                    <div class="server-actions">
                        <label class="toggle-switch" title="${server.isEnabled ? 'Disable' : 'Enable'} server">
                            <input type="checkbox" class="server-toggle" data-id="${server.id}" ${server.isEnabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <button class="icon-button edit-server" data-id="${server.id}" title="Edit server">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path fill="currentColor" d="M13.23 1a1 1 0 0 1 1.41.12l.12.13a1 1 0 0 1-.12 1.41L4.3 13H2v-2.3L12.36 1.35a1 1 0 0 1 .87-.35z"/>
                            </svg>
                        </button>
                        <button class="icon-button delete-server" data-id="${server.id}" title="Delete server">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path fill="currentColor" d="M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="server-details">
                    <div>${server.type}</div>
                    <div>${server.isEnabled ? 'Enabled' : 'Disabled'}</div>
                    ${server.type === 'sse'
                    ? `<div>URL: ${server.url || ''}</div>`
                    : `${server.command ? `<div>Command: ${server.command}</div>` : ''}
                           ${server.arguments && server.arguments.length > 0
                        ? `<div>Arguments: ${server.arguments.join(' ')}</div>`
                        : ''}`
                }
                </div>
            `;

            serverList.appendChild(serverEl);
        });

        // Attach all event listeners outside the loop to avoid duplicates
        // Toggle server enabled/disabled
        document.querySelectorAll('.server-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const serverId = e.currentTarget.getAttribute('data-id');
                vscode.postMessage({
                    type: 'toggleServerEnabled',
                    id: serverId
                });
            });
        });

        // Edit server buttons
        document.querySelectorAll('.edit-server').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.currentTarget.getAttribute('data-id');
                const server = servers.find(s => s.id === serverId);
                if (server) {
                    showServerModal(server);
                }
            });
        });

        // Delete server buttons
        document.querySelectorAll('.delete-server').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.currentTarget.getAttribute('data-id');
                console.log('Delete server clicked with ID:', serverId);

                vscode.postMessage({
                    type: 'deleteServer',
                    id: serverId
                });
            });
        });
    }

    // Show server modal
    function showServerModal(server = null) {
        // Remove any existing modal
        closeModal();

        // Create modal
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay';

        const isEdit = server !== null;
        const modalTitle = isEdit ? 'Edit MCP Server' : 'Add MCP Server';

        // Create a function to properly format arguments for display
        const formatArgumentsForDisplay = (args) => {
            if (!args || !Array.isArray(args) || args.length === 0) return '';

            return args.map(arg => {
                // If argument contains spaces or special chars, add appropriate quoting
                if (arg.includes(' ') || arg.includes('"') || arg.includes("'") ||
                    arg.includes('{') || arg.includes('}') || arg.includes('[') || arg.includes(']')) {

                    // Check if the arg already starts and ends with quotes
                    if ((arg.startsWith('"') && arg.endsWith('"')) ||
                        (arg.startsWith("'") && arg.endsWith("'"))) {
                        return arg; // Already quoted
                    }

                    // If it contains double quotes, wrap in single quotes
                    if (arg.includes('"')) {
                        return `'${arg.replace(/'/g, "\\'")}'`;
                    }

                    // Otherwise wrap in double quotes
                    return `"${arg.replace(/"/g, '\\"')}"`;
                }
                return arg;
            }).join(' ');
        };

        // Use HTML escaping for attributes to prevent XSS and rendering issues
        const escapeHtml = (str) => {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        dialogOverlay.innerHTML = `
            <div class="dialog">
            <div class="dialog-header">
                <h3 class="dialog-title">${modalTitle}</h3>
                <button class="icon-button close-dialog">
                <svg width="16" height="16" viewBox="0 0 16 16">
                    <path fill="currentColor" d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
                </svg>
                </button>
            </div>
            <div class="dialog-content">
                <form id="server-form">
                ${isEdit ? `<input type="hidden" name="id" value="${escapeHtml(server.id)}">` : ''}
                <div class="form-group">
                    <label for="server-name" class="form-label">Server Name</label>
                    <input type="text" id="server-name" name="name" class="form-input" value="${isEdit ? escapeHtml(server.name) : ''}" required>
                </div>
                <div class="form-group">
                    <label for="server-type" class="form-label">Server Type</label>
                    <select id="server-type" name="type" class="form-input" required>
                    <option value="local" ${isEdit && server.type === 'local' ? 'selected' : ''}>Local</option>
                    <option value="sse" ${isEdit && server.type === 'sse' ? 'selected' : ''}>SSE</option>
                    </select>
                </div>
                <div class="form-group command-group" ${isEdit && server.type === 'sse' ? 'style="display:none"' : ''}>
                    <label for="command" class="form-label">Command</label>
                    <input type="text" id="command" name="command" class="form-input" value="${isEdit && server.command ? server.command : ''}">
                </div>
                <div class="form-group command-group" ${isEdit && server.type === 'sse' ? 'style="display:none"' : ''}>
                    <label for="arguments" class="form-label">Arguments (space-separated)</label>
                    <input type="text" id="arguments" name="arguments" class="form-input"
                       value="${isEdit && server.arguments ? escapeHtml(formatArgumentsForDisplay(server.arguments)) : ''}">
                </div>
                <div class="form-group url-group" ${isEdit && server.type === 'sse' ? '' : 'style="display:none"'}>
                    <label for="url" class="form-label">URL</label>
                    <input type="url" id="url" name="url" class="form-input" value="${isEdit && server.url ? escapeHtml(server.url) : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label" style="display: inline-flex; align-items: center; gap: 8px;">
                    <input type="checkbox" name="isEnabled" ${isEdit ? (server.isEnabled ? 'checked' : '') : 'checked'}>
                    <span>Enabled</span>
                    </label>
                </div>
                </form>
            </div>
            <div class="dialog-footer">
                <button type="button" class="dialog-btn dialog-btn-secondary close-dialog">Cancel</button>
                <button type="button" class="dialog-btn dialog-btn-primary" id="save-server">${isEdit ? 'Update' : 'Add'} Server</button>
            </div>
            </div>
        `;

        // Add change handler for server type
        const serverTypeSelect = dialogOverlay.querySelector('#server-type');
        const commandGroups = dialogOverlay.querySelectorAll('.command-group');
        const urlGroup = dialogOverlay.querySelector('.url-group');

        serverTypeSelect.addEventListener('change', (e) => {
            const isSSE = e.target.value === 'sse';
            commandGroups.forEach(group => group.style.display = isSSE ? 'none' : '');
            urlGroup.style.display = isSSE ? '' : 'none';
        });

        document.body.appendChild(dialogOverlay);

        // Attach event listeners
        dialogOverlay.querySelector('.close-dialog').addEventListener('click', closeModal);
        dialogOverlay.querySelectorAll('.close-dialog').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });

        dialogOverlay.querySelector('#save-server').addEventListener('click', () => {
            const form = document.getElementById('server-form');
            handleServerFormSubmit(form);
        });

        // Focus on name input
        setTimeout(() => {
            document.getElementById('server-name')?.focus();
        }, 100);
    }

    function closeModal() {
        const modal = document.querySelector('.dialog-overlay');
        if (modal) {
            modal.remove();
        }
    }

    function handleServerFormSubmit(form) {
        const formData = new FormData(form);
        const id = formData.get('id');

        // Process arguments as array with respect for quotes and JSON
        let argumentsString = formData.get('arguments') || '';

        // Remove 'Arguments:' prefix if present
        argumentsString = argumentsString.replace(/^Arguments:\s*/, '');

        let argumentsArray = [];

        if (argumentsString.trim()) {
            // This is a more robust parsing approach
            try {
                // Helper function to tokenize a command string
                const tokenizeArgs = (input) => {
                    const tokens = [];
                    let current = '';
                    let inSingleQuote = false;
                    let inDoubleQuote = false;
                    let inJsonBrace = 0; // Counter for JSON object depth
                    let inJsonBracket = 0; // Add tracking for JSON arrays
                    let escaped = false;

                    for (let i = 0; i < input.length; i++) {
                        const char = input[i];

                        // Handle escape sequence
                        if (char === '\\' && !escaped) {
                            escaped = true;
                            continue;
                        }

                        // Handle quotes and braces
                        if (char === "'" && !inDoubleQuote && !escaped) {
                            inSingleQuote = !inSingleQuote;
                            current += char;
                        } else if (char === '"' && !inSingleQuote && !escaped) {
                            inDoubleQuote = !inDoubleQuote;
                            current += char;
                        } else if (char === '{' && !inSingleQuote && !inDoubleQuote) {
                            inJsonBrace++;
                            current += char;
                        } else if (char === '}' && !inSingleQuote && !inDoubleQuote) {
                            inJsonBrace = Math.max(0, inJsonBrace - 1); // Prevent negative counts
                            current += char;
                        } else if (char === '[' && !inSingleQuote && !inDoubleQuote) {
                            inJsonBracket++;
                            current += char;
                        } else if (char === ']' && !inSingleQuote && !inDoubleQuote) {
                            inJsonBracket = Math.max(0, inJsonBracket - 1);
                            current += char;
                        } else if (char === ' ' && !inSingleQuote && !inDoubleQuote &&
                            inJsonBrace === 0 && inJsonBracket === 0 && !escaped) {
                            // Space outside quotes and not in JSON - token boundary
                            if (current) {
                                tokens.push(current);
                                current = '';
                            }
                        } else {
                            current += escaped && char === 'n' ? '\n' :
                                escaped && char === 't' ? '\t' : char;
                        }

                        escaped = false;
                    }

                    // Add the last token if any
                    if (current) {
                        tokens.push(current);
                    }

                    // Check for unbalanced quotes or braces
                    if (inSingleQuote || inDoubleQuote || inJsonBrace > 0 || inJsonBracket > 0) {
                        console.warn("Warning: Possible unbalanced quotes or braces in arguments");
                    }

                    return tokens;
                };

                argumentsArray = tokenizeArgs(argumentsString);
            } catch (e) {
                console.error("Error parsing arguments:", e);
                // Better fallback that preserves quoted segments
                const simpleTokenize = str => {
                    const matches = str.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) || [];
                    return matches;
                };
                argumentsArray = simpleTokenize(argumentsString);
            }
        }

        const serverData = {
            name: formData.get('name'),
            type: formData.get('type'),
            isEnabled: formData.has('isEnabled'),
            command: formData.get('command') || undefined,
            url: formData.get('url') || undefined,
            arguments: argumentsArray.length > 0 ? argumentsArray : undefined
        };

        if (id) {
            // Update existing server
            serverData.id = id;
            console.log('Updating server:', serverData);

            vscode.postMessage({
                type: 'updateServer',
                server: serverData
            });
        } else {
            // Add new server
            console.log('Adding server:', serverData);

            vscode.postMessage({
                type: 'addServer',
                server: serverData
            });
        }

        closeModal();
    }
});