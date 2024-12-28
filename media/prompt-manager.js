/**
 *
 * @license
 * Copyright (c) 2023 - Present, Pengfei Ni
 *
 * All rights reserved. Code licensed under the ISC license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
(function () {
    const vscode = acquireVsCodeApi();
    let prompts = [];

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'updatePrompts':
                prompts = message.prompts;
                renderPrompts();
                break;
        }
    });

    function showPromptDialog(existingPrompt) {
        const dialog = document.createElement('div');
        dialog.className = 'prompt-dialog';
        dialog.innerHTML = `
            <div class="prompt-dialog-content">
                <h3>${existingPrompt ? 'Edit Prompt' : 'Add New Prompt'}</h3>
                <div class="form-group">
                    <label>Name:</label>
                    <input type="text" id="promptName" value="${existingPrompt ? existingPrompt.name : ''}" />
                </div>
                <div class="form-group">
                    <label>Content:</label>
                    <textarea id="promptContent" rows="6">${existingPrompt ? existingPrompt.content : ''}</textarea>
                </div>
                <div class="dialog-buttons">
                    <button id="savePrompt">${existingPrompt ? 'Update' : 'Add'}</button>
                    <button id="cancelPrompt">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        const saveButton = dialog.querySelector('#savePrompt');
        const cancelButton = dialog.querySelector('#cancelPrompt');
        const nameInput = /** @type {HTMLInputElement} */ (dialog.querySelector('#promptName'));
        const contentInput = /** @type {HTMLTextAreaElement} */ (dialog.querySelector('#promptContent'));

        if (saveButton && nameInput && contentInput) {
            saveButton.addEventListener('click', () => {
                const name = nameInput.value;
                const content = contentInput.value;

                if (!name || !content) {
                    vscode.postMessage({ type: 'showError', message: 'Name and content are required' });
                    return;
                }

                if (existingPrompt) {
                    vscode.postMessage({
                        type: 'updatePrompt',
                        prompt: {
                            id: existingPrompt.id,
                            name,
                            content,
                            createdAt: existingPrompt.createdAt,
                            updatedAt: Date.now()
                        }
                    });
                } else {
                    vscode.postMessage({
                        type: 'addPrompt',
                        prompt: { name, content }
                    });
                }
                dialog.remove();
            });
        }

        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                dialog.remove();
            });
        }
    }

    function renderPrompts() {
        const list = document.getElementById('promptList');
        if (!list) return;

        list.innerHTML = prompts.map(prompt => `
            <div class="prompt-item" data-id="${prompt.id}">
                <div class="prompt-header">
                    <div class="flex items-center justify-between w-full">
                        <h3 class="prompt-title flex items-center gap-2 font-bold">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                            </svg>
                            ${prompt.name}
                        </h3>
                        <div class="prompt-actions">
                            <button class="edit-prompt" data-id="${prompt.id}" title="Edit prompt">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                            </button>
                            <button class="delete-prompt" data-id="${prompt.id}" title="Delete prompt">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="prompt-content line-clamp-2">${prompt.content}</div>
                <div class="prompt-meta">
                    Created: ${new Date(prompt.createdAt).toLocaleString()}
                </div>
            </div>
        `).join('');

        list.addEventListener('click', (e) => {
            if (!e.target) return;

            const element = e.target instanceof Element ? e.target : null;
            if (!element) return;

            const button = element.closest('button');
            if (!button) return;

            const promptId = button.getAttribute('data-id');
            if (!promptId) return;

            if (button.classList.contains('edit-prompt')) {
                const prompt = prompts.find(p => p.id === promptId);
                if (prompt) {
                    showPromptDialog(prompt);
                }
            }

            if (button.classList.contains('delete-prompt')) {
                console.log('Sending delete message for prompt:', promptId);
                vscode.postMessage({
                    type: 'deletePrompt',
                    id: promptId
                });
            }
        });
    }

    function initialize() {
        const addButton = document.getElementById('addPrompt');
        if (addButton) {
            addButton.addEventListener('click', () => {
                showPromptDialog();
            });
        }

        vscode.postMessage({ type: 'getPrompts' });
    }

    initialize();
})();