/**
 *
 * @license
 * Copyright (c) 2022 - 2023, Ali Gençay
 * Copyright (c) 2024 - Present, Pengfei Ni
 *
 * All rights reserved. Code licensed under the ISC license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */

// @ts-nocheck


(function () {
    const vscode = acquireVsCodeApi();

    // Create stylesheet for dynamic styles
    const styleSheet = document.createElement('style');
    document.head.appendChild(styleSheet);

    // Create a proper Renderer instance
    const renderer = new marked.Renderer();
    
    // Only override specific methods we need to customize
    // Custom list item renderer for task lists
    renderer.listitem = function(text, task, checked) {
        if (task) {
            return `<li class="task-list-item"><input type="checkbox" ${checked ? 'checked' : ''} disabled> ${text}</li>`;
        }
        // Use default behavior for non-task list items
        return `<li>${text}</li>`;
    };
    
    // Custom list renderer for styling classes
    renderer.list = function(body, ordered, start) {
        const type = ordered ? 'ol' : 'ul';
        const startAttr = (ordered && start !== 1) ? ` start="${start}"` : '';
        return `<${type}${startAttr} class="list-${ordered ? 'decimal' : 'disc'}">${body}</${type}>`;
    };

    // Configure marked with the renderer instance
    marked.setOptions({
        renderer: renderer,
        highlight: function (code, lang) {
            // Use highlight.js if language is specified, otherwise auto-detect
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (e) {
                    // Fall back to auto-detection if language highlighting fails
                    return hljs.highlightAuto(code).value;
                }
            }
            return hljs.highlightAuto(code).value;
        },
        langPrefix: 'hljs language-',
        pedantic: false,
        gfm: true,  // GitHub Flavored Markdown
        breaks: true,  // Convert \n to <br>
        sanitize: false,  // Don't sanitize HTML
        smartypants: false,  // Don't use smart quotes
        xhtml: false
    });

    const aiSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41" fill="none" stroke-width="1.5" class="w-5 mr-2"><path d="M37.5324 16.8707C37.9808 15.5241 38.1363 14.0974 37.9886 12.6859C37.8409 11.2744 37.3934 9.91076 36.676 8.68622C35.6126 6.83404 33.9882 5.3676 32.0373 4.4985C30.0864 3.62941 27.9098 3.40259 25.8215 3.85078C24.8796 2.7893 23.7219 1.94125 22.4257 1.36341C21.1295 0.785575 19.7249 0.491269 18.3058 0.500197C16.1708 0.495044 14.0893 1.16803 12.3614 2.42214C10.6335 3.67624 9.34853 5.44666 8.6917 7.47815C7.30085 7.76286 5.98686 8.3414 4.8377 9.17505C3.68854 10.0087 2.73073 11.0782 2.02839 12.312C0.956464 14.1591 0.498905 16.2988 0.721698 18.4228C0.944492 20.5467 1.83612 22.5449 3.268 24.1293C2.81966 25.4759 2.66413 26.9026 2.81182 28.3141C2.95951 29.7256 3.40701 31.0892 4.12437 32.3138C5.18791 34.1659 6.8123 35.6322 8.76321 36.5013C10.7141 37.3704 12.8907 37.5973 14.9789 37.1492C15.9208 38.2107 17.0786 39.0587 18.3747 39.6366C19.6709 40.2144 21.0755 40.5087 22.4946 40.4998C24.6307 40.5054 26.7133 39.8321 28.4418 38.5772C30.1704 37.3223 31.4556 35.5506 32.1119 33.5179C33.5027 33.2332 34.8167 32.6547 35.9659 31.821C37.115 30.9874 38.0728 29.9178 38.7752 28.684C39.8458 26.8371 40.3023 24.6979 40.0789 22.5748C39.8556 20.4517 38.9639 18.4544 37.5324 16.8707ZM22.4978 37.8849C20.7443 37.8874 19.0459 37.2733 17.6994 36.1501C17.7601 36.117 17.8666 36.0586 17.936 36.0161L25.9004 31.4156C26.1003 31.3019 26.2663 31.137 26.3813 30.9378C26.4964 30.7386 26.5563 30.5124 26.5549 30.2825V19.0542L29.9213 20.998C29.9389 21.0068 29.9541 21.0198 29.9656 21.0359C29.977 21.052 29.9842 21.0707 29.9867 21.0902V30.3889C29.9842 32.375 29.1946 34.2791 27.7909 35.6841C26.3872 37.0892 24.4838 37.8806 22.4978 37.8849ZM6.39227 31.0064C5.51397 29.4888 5.19742 27.7107 5.49804 25.9832C5.55718 26.0187 5.66048 26.0818 5.73461 26.1244L13.699 30.7248C13.8975 30.8408 14.1233 30.902 14.3532 30.902C14.583 30.902 14.8088 30.8408 15.0073 30.7248L24.731 25.1103V28.9979C24.7321 29.0177 24.7283 29.0376 24.7199 29.0556C24.7115 29.0736 24.6988 29.0893 24.6829 29.1012L16.6317 33.7497C14.9096 34.7416 12.8643 35.0097 10.9447 34.4954C9.02506 33.9811 7.38785 32.7263 6.39227 31.0064ZM4.29707 13.6194C5.17156 12.0998 6.55279 10.9364 8.19885 10.3327C8.19885 10.4013 8.19491 10.5228 8.19491 10.6071V19.808C8.19351 20.0378 8.25334 20.2638 8.36823 20.4629C8.48312 20.6619 8.64893 20.8267 8.84863 20.9404L18.5723 26.5542L15.206 28.4979C15.1894 28.5089 15.1703 28.5155 15.1505 28.5173C15.1307 28.5191 15.1107 28.516 15.0924 28.5082L7.04046 23.8557C5.32135 22.8601 4.06716 21.2235 3.55289 19.3046C3.03862 17.3858 3.30624 15.3413 4.29707 13.6194ZM31.955 20.0556L22.2312 14.4411L25.5976 12.4981C25.6142 12.4872 25.6333 12.4805 25.6531 12.4787C25.6729 12.4769 25.6928 12.4801 25.7111 12.4879L33.7631 17.1364C34.9967 17.849 36.0017 18.8982 36.6606 20.1613C37.3194 21.4244 37.6047 22.849 37.4832 24.2684C37.3617 25.6878 36.8382 27.0432 35.9743 28.1759C35.1103 29.3086 33.9415 30.1717 32.6047 30.6641C32.6047 30.5947 32.6047 30.4733 32.6047 30.3889V21.188C32.6066 20.9586 32.5474 20.7328 32.4332 20.5338C32.319 20.3348 32.154 20.1698 31.955 20.0556ZM35.3055 15.0128C35.2464 14.9765 35.1431 14.9142 35.069 14.8717L27.1045 10.2712C26.906 10.1554 26.6803 10.0943 26.4504 10.0943C26.2206 10.0943 25.9948 10.1554 25.7963 10.2712L16.0726 15.8858V11.9982C16.0715 11.9783 16.0753 11.9585 16.0837 11.9405C16.0921 11.9225 16.1048 11.9068 16.1207 11.8949L24.1719 7.25025C25.4053 6.53903 26.8158 6.19376 28.2383 6.25482C29.6608 6.31589 31.0364 6.78077 32.2044 7.59508C33.3723 8.40939 34.2842 9.53945 34.8334 10.8531C35.3826 12.1667 35.5464 13.6095 35.3055 15.0128ZM14.2424 21.9419L10.8752 19.9981C10.8576 19.9893 10.8423 19.9763 10.8309 19.9602C10.8195 19.9441 10.8122 19.9254 10.8098 19.9058V10.6071C10.8107 9.18295 11.2173 7.78848 11.9819 6.58696C12.7466 5.38544 13.8377 4.42659 15.1275 3.82264C16.4173 3.21869 17.8524 2.99464 19.2649 3.1767C20.6775 3.35876 22.0089 3.93941 23.1034 4.85067C23.0427 4.88379 22.937 4.94215 22.8668 4.98473L14.9024 9.58517C14.7025 9.69878 14.5366 9.86356 14.4215 10.0626C14.3065 10.2616 14.2466 10.4877 14.2479 10.7175L14.2424 21.9419ZM16.071 17.9991L20.4018 15.4978L24.7325 17.9975V22.9985L20.4018 25.4983L16.071 22.9985V17.9991Z" fill="currentColor"></path></svg>`;

    const userSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;

    const clipboardSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>`;

    const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`;

    const cancelSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`;

    const sendSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>`;

    const pencilSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>`;

    const plusSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>`;

    const insertSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" /></svg>`;

    const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em" ><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;

    const closeSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`;

    const refreshSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>`;

    const activePromptIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>`;



    // Enhanced file type detection with better icons and categorization
    function getFileTypeInfo(fileExt) {
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'];
        const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'html', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'sql', 'r', 'matlab', 'm', 'pl', 'lua', 'dart', 'elm', 'clj', 'cljs', 'hs', 'ml', 'fs', 'ex', 'exs', 'erl', 'hrl'];
        const documentExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages', 'md', 'markdown', 'tex', 'csv', 'xls', 'xlsx', 'ods', 'numbers', 'ppt', 'pptx', 'odp', 'keynote'];

        let fileType = 'default';
        let fileIcon = '';

        if (imageExts.includes(fileExt)) {
            fileType = 'image';
            fileIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                <circle cx="9" cy="9" r="2"/>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>`;
        } else if (codeExts.includes(fileExt)) {
            fileType = 'code';
            fileIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16,18 22,12 16,6"/>
                <polyline points="8,6 2,12 8,18"/>
            </svg>`;
        } else if (documentExts.includes(fileExt)) {
            fileType = 'document';
            fileIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10,9 9,9 8,9"/>
            </svg>`;
        } else {
            // Default file icon
            fileIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14,2 14,8 20,8"/>
            </svg>`;
        }

        return { fileIcon, fileType };
    }

    // File attachment feedback functions
    function showFileAttachmentSuccess() {
        const attachButton = document.getElementById('file-attachment-button');
        if (attachButton) {
            attachButton.classList.add('success');
            setTimeout(() => {
                attachButton.classList.remove('success');
            }, 1000);
        }
    }

    function showFileAttachmentError(error) {
        const attachButton = document.getElementById('file-attachment-button');
        if (attachButton) {
            attachButton.classList.add('error');
            setTimeout(() => {
                attachButton.classList.remove('error');
            }, 1000);
        }

        // Show error message to user
        console.error('File attachment error:', error);
    }

    function resetFileAttachmentState() {
        const attachButton = document.getElementById('file-attachment-button');
        if (attachButton) {
            attachButton.classList.remove('loading', 'success', 'error');
        }
    }

    // Message queue for ordered processing
    window.messageQueue = window.messageQueue || new Map(); // Map by messageId
    window.processedSequences = window.processedSequences || new Map(); // Track processed sequences per message

    // Process queued messages in sequence order
    function processMessageQueue(messageId) {
        const queue = window.messageQueue.get(messageId) || [];
        const processed = window.processedSequences.get(messageId) || 0;

        // Sort queue by sequence number
        queue.sort((a, b) => a.sequence - b.sequence);

        // Process messages in order
        let nextSequence = processed + 1;
        while (queue.length > 0 && queue[0].sequence === nextSequence) {
            const message = queue.shift();
            processMessageImmediate(message);
            nextSequence++;
        }

        // Update processed sequence counter
        window.processedSequences.set(messageId, nextSequence - 1);

        // Update the queue
        window.messageQueue.set(messageId, queue);
    }

    // Process a message immediately (original logic)
    function processMessageImmediate(message) {
        const list = document.getElementById("qa-list");

        // Original message processing logic will go here
        processMessageByType(message, list);
    }

    // Handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
        const message = event.data;

        // If message has sequence number, add to queue for ordered processing
        if (message.sequence !== undefined && message.messageId) {
            const queue = window.messageQueue.get(message.messageId) || [];
            queue.push(message);
            window.messageQueue.set(message.messageId, queue);

            // Try to process queued messages
            processMessageQueue(message.messageId);
        } else {
            // Process immediately for messages without sequence
            processMessageImmediate(message);
        }
    });

    // Process message by type (extracted from original logic)
    function processMessageByType(message, list) {

        switch (message.type) {
            case "showInProgress":
                if (message.showStopButton) {
                    document.getElementById("stop-button").classList.remove("hidden");
                } else {
                    document.getElementById("stop-button").classList.add("hidden");
                }

                if (message.inProgress) {
                    document.getElementById("in-progress").classList.remove("hidden");
                    document.getElementById("question-input").setAttribute("disabled", true);
                    // Hide the modern button area instead of the old button structure
                    document.querySelector(".modern-button-area")?.classList.add("hidden");

                    // Update button states via button state manager
                    if (window.buttonStateManager) {
                        window.buttonStateManager.updateAllButtonStates();
                    }
                } else {
                    document.getElementById("in-progress").classList.add("hidden");
                    document.getElementById("question-input").removeAttribute("disabled");
                    // Show the modern button area instead of the old button structure
                    document.querySelector(".modern-button-area")?.classList.remove("hidden");

                    // Update button states via button state manager
                    if (window.buttonStateManager) {
                        window.buttonStateManager.updateAllButtonStates();
                    }
                }
                break;
            case "addQuestion":
                list.classList.remove("hidden");
                document.getElementById("introduction")?.classList?.add("hidden");
                document.getElementById("conversation-list").classList.add("hidden");

                const escapeHtml = (unsafe) => {
                    return unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
                };

                list.innerHTML +=
                    `<div class="p-4 self-end mt-4 question-element-ext relative input-background">
                        <h2 class="mb-5 flex">${userSvg}You</h2>
                        <no-export class="mb-2 flex items-center">
                            <button title="Edit and resend this prompt" class="resend-element-ext p-1.5 flex items-center rounded-lg absolute right-6 top-6">${pencilSvg}</button>
                            <div class="hidden send-cancel-elements-ext flex gap-2">
                                <button title="Send this prompt" class="send-element-ext p-1 pr-2 flex items-center">${sendSvg}&nbsp;Send</button>
                                <button title="Cancel" class="cancel-element-ext p-1 pr-2 flex items-center">${cancelSvg}&nbsp;Cancel</button>
                            </div>
                        </no-export>
                        <div class="mt-2 overflow-y-auto">${escapeHtml(message.value)}</div>
                    </div>`;

                if (message.autoScroll) {
                    list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
                }
                break;

            case "startResponse":
                const startElement = document.getElementById(`${message.id}-start`);
                if (!startElement) {
                    list.innerHTML += `<div class="p-4 self-end mt-2 pb-4 answer-element-ext"><h2 class="mb-3 flex">${aiSvg}ChatGPT</h2></div>`;
                }
                break;

            case "addResponse":
                let existingMessage = message.id && document.getElementById(message.id);

                const unEscapeHtml = (unsafe) => {
                    return unsafe.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#039;', "'");
                };

                // Check if this update contains any tool-result tags
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = message.value;
                const hasToolResult = tempDiv.querySelector('tool-result');

                let updatedValue = message.value.split("```").length % 2 === 1 ? message.value : message.value + "\n\n```\n\n";
                let formattedResponse = marked.parse(updatedValue.trim().replace(/^\s+|\s+$/g, ''));

                if (existingMessage) {
                    existingMessage.innerHTML = formattedResponse;
                } else {
                    list.innerHTML +=
                        `<div class="p-4 self-end mt-2 pb-4 answer-element-ext">
                        <div class="result-streaming" id="${message.id}">${formattedResponse}</div>
                    </div>`;
                }

                // Initialize tool call blocks with collapsed state
                const toolCallBlocks = list.querySelectorAll('.tool-call-header:not(.initialized)');
                toolCallBlocks.forEach(header => {
                    header.classList.add('collapsed', 'initialized');
                });

                if (message.done) {
                    const preCodeList = list.lastChild.querySelectorAll("pre > code");

                    const responseElement = document.getElementById(message.id);
                    if (responseElement) {
                        responseElement.classList.remove("result-streaming");
                    }

                    preCodeList.forEach((preCode) => {
                        preCode.classList.add("input-background", "p-4", "pb-2", "block", "whitespace-pre", "overflow-x-scroll");
                        preCode.parentElement.classList.add("pre-code-element", "relative");

                        const buttonWrapper = document.createElement("no-export");
                        buttonWrapper.classList.add("code-actions-wrapper", "flex", "gap-3", "pr-2", "pt-1", "pb-1", "flex-wrap", "items-center", "justify-end", "rounded-t-lg", "input-background");

                        // Create copy to clipboard button
                        const copyButton = document.createElement("button");
                        copyButton.title = "Copy to clipboard";
                        copyButton.innerHTML = `${clipboardSvg} Copy`;

                        copyButton.classList.add("code-element-ext", "p-1", "pr-2", "flex", "items-center", "rounded-lg");

                        const insert = document.createElement("button");
                        insert.title = "Insert the below code to the current file";
                        insert.innerHTML = `${insertSvg} Insert`;

                        insert.classList.add("edit-element-ext", "p-1", "pr-2", "flex", "items-center", "rounded-lg");

                        const newTab = document.createElement("button");
                        newTab.title = "Create a new file with the below code";
                        newTab.innerHTML = `${plusSvg} New`;

                        newTab.classList.add("new-code-element-ext", "p-1", "pr-2", "flex", "items-center", "rounded-lg");

                        buttonWrapper.append(copyButton, insert, newTab);

                        // Insert the button wrapper right before the pre element
                        preCode.parentNode.parentNode.insertBefore(buttonWrapper, preCode.parentNode);
                    });
                }

                if (message.autoScroll) {
                    list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
                }

                break;
            case "addError":
                if (!list.innerHTML) {
                    return;
                }

                const messageValue = message.value ?
                    (typeof message.value === 'object' ?
                        JSON.stringify(message.value, null, 2) :
                        message.value) :
                    "An error occurred. If this issue persists please clear your session token with `ChatGPT: Reset session` command and/or restart your Visual Studio Code.";
                list.innerHTML +=
                    `<div class="p-4 self-end mt-4 pb-8 error-element-ext">
                        <h2 class="mb-5 flex">${aiSvg}ChatGPT</h2>
                        <div class="text-red-400">${marked.parse(messageValue)}</div>
                    </div>`;

                if (message.autoScroll) {
                    list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
                }
                break;
            case "mcpServerStatus":
                handleMcpServerStatus(message);
                break;
            case "clearConversation":
                clearConversation();
                break;
            case "exportConversation":
                exportConversation();
                break;
            case "loginSuccessful":
                document.getElementById("login-button")?.classList?.add("hidden");
                break;
            case "listConversations":
                list.classList.add("hidden");
                document.getElementById("introduction")?.classList?.add("hidden");
                const conversationList = document.getElementById("conversation-list");
                conversationList.classList.remove("hidden");
                const conversation_list = message.conversations.items.map(conversation => {
                    const chatDate = new Date(conversation.create_time).toLocaleString();
                    return `<button id="show-conversation-button" data-id="${conversation.id}" data-title="${conversation.title.replace(/"/g, '')}" data-time="${chatDate}" class="flex py-3 px-3 items-center gap-3 relative rounded-lg input-background cursor-pointer break-all group">${textSvg}<div class="flex flex-col items-start gap-2 truncate"><span class="text-left font-bold">${conversation.title}</span><div class="text-xs text-left">${chatDate}</div></div></button>`;
                });
                conversationList.innerHTML = `<div class="flex flex-col gap-4 text-sm relative overflow-y-auto p-8">
                    <div class="flex justify-center gap-4">
                        <button id="refresh-conversations-button" title="Reload conversations" class="p-1 pr-2 flex items-center rounded-lg">${refreshSvg}&nbsp;Reload</button>
                        <button id="close-conversations-button" title="Close conversations panel" class="p-1 pr-2 flex items-center rounded-lg">${closeSvg}&nbsp;Close</button>
                    </div>
                    <div class="flex flex-col gap-4">${conversation_list.join("")}</div>
                </div>`;
                break;
            case "setActivePrompt":
                showActivePrompt(message.name);
                break;
            case "insertFileReference":
                const input = document.getElementById("question-input");
                const fileRefsContainer = document.getElementById("file-references");

                if (message.isAuto) {
                    const autoTags = fileRefsContainer.querySelectorAll('.file-reference-modern[data-auto="true"]');
                    autoTags.forEach(tag => {
                        tag.classList.add('removing');
                        setTimeout(() => tag.remove(), 300);
                    });
                }

                // Enhanced file type detection and icons
                const fileExt = message.fileName.toLowerCase().split('.').pop();
                const { fileIcon, fileType } = getFileTypeInfo(fileExt);

                const fileTag = document.createElement('span');
                fileTag.className = `file-reference-modern file-type-${fileType}`;
                fileTag.setAttribute('title', message.fileName); // Full path for tooltip

                if (message.isAuto) {
                    fileTag.setAttribute('data-auto', 'true');
                }

                // Create file name element with truncation
                const fileName = document.createElement('span');
                fileName.className = 'file-reference-name';
                fileName.textContent = message.displayName;

                // Create remove button with enhanced styling
                const removeBtn = document.createElement('span');
                removeBtn.className = 'file-reference-remove';
                removeBtn.setAttribute('data-filepath', message.fileName);
                removeBtn.innerHTML = '×';
                removeBtn.setAttribute('title', 'Remove file');

                // Assemble the file tag
                fileTag.innerHTML = fileIcon;
                fileTag.appendChild(fileName);
                fileTag.appendChild(removeBtn);

                // Enhanced remove functionality with animation
                removeBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const filepath = this.getAttribute('data-filepath');
                    const parentTag = this.parentElement;

                    // Add removing animation
                    parentTag.classList.add('removing');

                    // Remove after animation completes
                    setTimeout(() => {
                        parentTag.remove();
                        vscode.postMessage({
                            type: "removeFileReference",
                            fileName: filepath
                        });
                    }, 300);
                });

                // Add to container with animation
                fileRefsContainer.appendChild(fileTag);

                // Add success class temporarily for visual feedback
                setTimeout(() => {
                    fileTag.classList.add('success');
                    setTimeout(() => fileTag.classList.remove('success'), 600);
                }, 100);

                // Reset file attachment button state on successful file addition
                showFileAttachmentSuccess();

                // Clear @ symbol from input if it was added via @ autocomplete
                if (input && input.value.startsWith('@')) {
                    input.value = input.value.substring(1).trim();
                }

                break;
            case "fileSelectionCancelled":
                // Reset file attachment button state when file selection is cancelled
                resetFileAttachmentState();
                break;
            case "clearFileReferences":
                const clearFileRefsContainer = document.getElementById("file-references");
                if (clearFileRefsContainer) {
                    const allFileRefs = clearFileRefsContainer.querySelectorAll('.file-reference-modern');

                    // Animate removal of all file references
                    allFileRefs.forEach((tag, index) => {
                        setTimeout(() => {
                            tag.classList.add('removing');
                            setTimeout(() => tag.remove(), 300);
                        }, index * 50); // Stagger the animations
                    });

                    // Clear container after all animations complete
                    setTimeout(() => {
                        clearFileRefsContainer.innerHTML = '';
                    }, allFileRefs.length * 50 + 300);
                }
                break;
            case "updateToolCallContent":
                const toolCallElement = document.getElementById(message.id);
                if (toolCallElement) {
                    const contentElement = toolCallElement.querySelector('.tool-call-content');
                    if (contentElement) {
                        contentElement.innerHTML = message.content;

                        // Auto-scroll to bottom if content is expanded and overflowing
                        if (!contentElement.classList.contains('collapsed')) {
                            // Use setTimeout to ensure DOM is updated before scrolling
                            setTimeout(() => {
                                contentElement.scrollTop = contentElement.scrollHeight;
                            }, 0);
                        }
                    }
                }
                break;
        }
    }

    const clearConversation = () => {
        document.getElementById("qa-list").innerHTML = "";
        document.getElementById("qa-list").classList.add("hidden");
        document.getElementById("introduction").classList.remove("hidden");
        document.getElementById("conversation-list").classList.add("hidden");

        // Reset the input
        const input = document.getElementById("question-input");
        if (input) {
            input.value = "";
            if (autoResizeTextarea) {
                autoResizeTextarea.reset();
            }
        }

        // Clear file references
        const fileRefsContainer = document.getElementById("file-references");
        if (fileRefsContainer) {
            fileRefsContainer.innerHTML = '';
        }

        vscode.postMessage({
            type: "clearConversation"
        });
    };

    const handleMcpServerStatus = (message) => {
        const { serverName, status, toolCount, error } = message;
        
        // Create or get existing status container
        let statusContainer = document.getElementById('mcp-status-container');
        if (!statusContainer) {
            statusContainer = document.createElement('div');
            statusContainer.id = 'mcp-status-container';
            statusContainer.className = 'fixed top-4 right-4 z-50 max-w-sm space-y-2';
            document.body.appendChild(statusContainer);
        }
        
        const statusId = `mcp-status-${serverName}`;
        let statusElement = document.getElementById(statusId);
        
        if (status === 'starting') {
            // Create new status element for starting server
            statusElement = document.createElement('div');
            statusElement.id = statusId;
            statusElement.className = 'bg-blue-100 border border-blue-400 text-blue-800 px-3 py-2 rounded-lg text-sm shadow-lg';
            statusElement.innerHTML = `
                <div class="flex items-center space-x-2">
                    <div class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
                    <span>Starting MCP server: <strong>${serverName}</strong></span>
                </div>
            `;
            statusContainer.appendChild(statusElement);
        } else if (status === 'connected') {
            // Update to success state
            if (statusElement) {
                statusElement.className = 'bg-green-100 border border-green-400 text-green-800 px-3 py-2 rounded-lg text-sm shadow-lg';
                statusElement.innerHTML = `
                    <div class="flex items-center space-x-2">
                        <div class="w-4 h-4">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        </div>
                        <span>Connected: <strong>${serverName}</strong> (${toolCount} tools)</span>
                    </div>
                `;
                
                // Auto-remove success message after 3 seconds
                setTimeout(() => {
                    if (statusElement && statusElement.parentNode) {
                        statusElement.parentNode.removeChild(statusElement);
                        // Remove container if empty
                        if (statusContainer.children.length === 0) {
                            statusContainer.parentNode.removeChild(statusContainer);
                        }
                    }
                }, 3000);
            }
        } else if (status === 'error') {
            // Update to error state
            if (statusElement) {
                statusElement.className = 'bg-red-100 border border-red-400 text-red-800 px-3 py-2 rounded-lg text-sm shadow-lg';
                statusElement.innerHTML = `
                    <div class="flex items-center justify-between space-x-2">
                        <div class="flex items-center space-x-2">
                            <div class="w-4 h-4">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                            <span>Failed: <strong>${serverName}</strong></span>
                        </div>
                        <button onclick="this.parentNode.parentNode.parentNode.remove(); if(document.getElementById('mcp-status-container').children.length === 0) document.getElementById('mcp-status-container').remove();" class="text-red-600 hover:text-red-800 font-bold text-lg">&times;</button>
                    </div>
                    ${error ? `<div class="text-xs mt-1 text-red-600">${error}</div>` : ''}
                `;
                
                // Auto-remove error message after 10 seconds
                setTimeout(() => {
                    if (statusElement && statusElement.parentNode) {
                        statusElement.parentNode.removeChild(statusElement);
                        // Remove container if empty
                        if (statusContainer.children.length === 0) {
                            statusContainer.parentNode.removeChild(statusContainer);
                        }
                    }
                }, 10000);
            }
        }
    };

    // Make functions globally accessible for jQuery autocomplete and other contexts
    window.clearConversation = clearConversation;

    const exportConversation = () => {
        const turndownService = new TurndownService({ codeBlockStyle: "fenced" });
        turndownService.remove('no-export');
        let markdown = turndownService.turndown(document.getElementById("qa-list"));

        vscode.postMessage({
            type: "exportConversation",
            value: markdown
        });
    };

    // Make exportConversation globally accessible
    window.exportConversation = exportConversation;

    document.getElementById('question-input').addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            // 如果是命令，不阻止默认行为
            if (this.value.startsWith('/') || this.value.startsWith('#') || this.value.startsWith('@')) {
                return;
            }
            addFreeTextQuestion();
        }
    });

    document.getElementById('question-input').addEventListener("keyup", function (event) {
        if (event.key === "@") {
            const cursorPos = this.selectionStart;
            const textBeforeCursor = this.value.substring(0, cursorPos);

            if (cursorPos === 1 || textBeforeCursor.charAt(cursorPos - 2) === ' ') {
                vscode.postMessage({
                    type: "searchFile"
                });
            }
        }
    });

    document.addEventListener("click", (e) => {
        const targetButton = e.target.closest('button');

        if (targetButton?.id === "more-button") {
            e.preventDefault();
            document.getElementById('chat-button-wrapper')?.classList.toggle("hidden");

            return;
        } else {
            document.getElementById('chat-button-wrapper')?.classList.add("hidden");
        }

        if (e.target?.id === "settings-button") {
            e.preventDefault();
            vscode.postMessage({
                type: "openSettings",
            });
            return;
        }

        if (e.target?.id === "settings-prompt-button") {
            e.preventDefault();
            vscode.postMessage({
                type: "openSettingsPrompt",
            });
            return;
        }

        if (targetButton?.id === "login-button") {
            e.preventDefault();
            vscode.postMessage({
                type: "login",
            });
            return;
        }

        if (targetButton?.id === "ask-button") {
            e.preventDefault();
            addFreeTextQuestion();
            return;
        }

        if (targetButton?.id === "file-attachment-button") {
            e.preventDefault();
            handleFileAttachment();
            return;
        }

        if (targetButton?.id === "clear-button") {
            e.preventDefault();
            clearConversation();
            return;
        }

        if (targetButton?.id === "export-button") {
            e.preventDefault();
            exportConversation();
            return;
        }

        if (targetButton?.id === "list-conversations-button" || targetButton?.id === "list-conversations-link") {
            e.preventDefault();

            vscode.postMessage({ type: "listConversations" });
            return;
        }

        if (targetButton?.id === "show-conversation-button") {
            e.preventDefault();

            vscode.postMessage({ type: "showConversation", value: targetButton.getAttribute("data-id") });

            document.getElementById("qa-list").innerHTML = `<div class="flex flex-col p-6 pt-2">
                <h2 class="text-lg">${targetButton.getAttribute("data-title")}</h2>
                <span class="text-xs">Started on: ${targetButton.getAttribute("data-time")}</span>
            </div>`;

            document.getElementById("qa-list").classList.remove("hidden");
            document.getElementById("introduction").classList.add("hidden");
            document.getElementById("conversation-list").classList.add("hidden");
            return;
        }

        if (targetButton?.id === "refresh-conversations-button") {
            e.preventDefault();

            vscode.postMessage({ type: "listConversations" });
            return;
        }

        if (targetButton?.id === "close-conversations-button") {
            e.preventDefault();
            const qaList = document.getElementById('qa-list');
            qaList.classList.add("hidden");
            document.getElementById('conversation-list').classList.add("hidden");
            document.getElementById('introduction').classList.add("hidden");
            if (qaList.innerHTML?.length > 0) {
                qaList.classList.remove("hidden");
            } else {
                document.getElementById('introduction').classList.remove("hidden");
            }
            return;
        }

        if (targetButton?.id === "stop-button") {
            e.preventDefault();
            vscode.postMessage({
                type: "stopGenerating",
            });

            return;
        }

        if (targetButton?.classList?.contains("resend-element-ext")) {
            e.preventDefault();
            const question = targetButton.closest(".question-element-ext");
            const elements = targetButton.nextElementSibling;
            elements.classList.remove("hidden");
            question.lastElementChild?.setAttribute("contenteditable", true);

            targetButton.classList.add("hidden");

            return;
        }

        if (targetButton?.classList?.contains("send-element-ext")) {
            e.preventDefault();

            const question = targetButton.closest(".question-element-ext");
            const elements = targetButton.closest(".send-cancel-elements-ext");
            const resendElement = targetButton.parentElement.parentElement.firstElementChild;
            elements.classList.add("hidden");
            resendElement.classList.remove("hidden");
            question.lastElementChild?.setAttribute("contenteditable", false);

            if (question.lastElementChild.textContent?.length > 0) {
                vscode.postMessage({
                    type: "editMessage",
                    value: question.lastElementChild.textContent
                });
            }

            return;
        }

        if (targetButton?.classList?.contains("cancel-element-ext")) {
            e.preventDefault();

            const question = targetButton.closest(".question-element-ext");
            const elements = targetButton.closest(".send-cancel-elements-ext");
            const resendElement = targetButton.parentElement.parentElement.firstElementChild;
            elements.classList.add("hidden");
            resendElement.classList.remove("hidden");
            question.lastElementChild?.setAttribute("contenteditable", false);

            return;
        }

        if (targetButton?.classList?.contains("code-element-ext")) {
            e.preventDefault();

            // Find the code element - the button wrapper is a sibling of the pre element
            const buttonWrapper = targetButton.closest(".code-actions-wrapper");
            const preElement = buttonWrapper?.nextElementSibling || buttonWrapper?.parentElement?.querySelector(".pre-code-element");
            const code = preElement?.querySelector("code")?.textContent;

            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    targetButton.innerHTML = `${checkSvg} Copied`;

                    setTimeout(() => {
                        targetButton.innerHTML = `${clipboardSvg} Copy`;
                    }, 1500);
                });
            }

            return;
        }

        if (targetButton?.classList?.contains("edit-element-ext")) {
            e.preventDefault();

            // Find the code element - the button wrapper is a sibling of the pre element
            const buttonWrapper = targetButton.closest(".code-actions-wrapper");
            const preElement = buttonWrapper?.nextElementSibling || buttonWrapper?.parentElement?.querySelector(".pre-code-element");
            const code = preElement?.querySelector("code")?.textContent;

            if (code) {
                vscode.postMessage({
                    type: "editCode",
                    value: code
                });
            }

            return;
        }

        if (targetButton?.classList?.contains("new-code-element-ext")) {
            e.preventDefault();

            // Find the code element - the button wrapper is a sibling of the pre element
            const buttonWrapper = targetButton.closest(".code-actions-wrapper");
            const preElement = buttonWrapper?.nextElementSibling || buttonWrapper?.parentElement?.querySelector(".pre-code-element");
            const code = preElement?.querySelector("code")?.textContent;

            if (code) {
                vscode.postMessage({
                    type: "newCode",
                    value: code
                });
            }

            return;
        }

        if (targetButton?.id === "toggle-prompt-manager") {
            e.preventDefault();
            vscode.postMessage({
                type: "togglePromptManager"
            });
            return;
        }

        if (targetButton?.id === "toggle-mcp-servers") {
            e.preventDefault();
            vscode.postMessage({
                type: "openMCPServers"
            });
            return;
        }

        // Tool call header click handler
        if (targetButton?.classList?.contains("tool-call-header")) {
            e.preventDefault();
            const content = targetButton.nextElementSibling;
            const caret = targetButton.querySelector('.tool-call-caret');

            if (content && content.classList.contains('tool-call-content')) {
                content.classList.toggle('tool-call-collapsed');
                targetButton.classList.toggle('collapsed');

                if (caret) {
                    caret.style.transform = targetButton.classList.contains('collapsed')
                        ? 'rotate(-90deg)'
                        : 'rotate(0deg)';
                }
            }
            return;
        }
    });

    $(function () {
        const availableCommands = ["/clear", "/settings", "/manage-prompt", "/reset-prompt"];

        $("#question-input").autocomplete({
            source: function (request, response) {
                if (request.term.startsWith('@')) {
                    response([]);
                    return;
                }

                if (request.term.startsWith('#')) {
                    vscode.postMessage({
                        type: "searchPrompts",
                        query: request.term.substring(1),
                        responseType: "titles"
                    });
                    window.addEventListener('message', function promptTitlesHandler(event) {
                        const message = event.data;
                        if (message.type === "promptTitles") {
                            window.removeEventListener('message', promptTitlesHandler);

                            if (message.isEmpty) {
                                response([{
                                    label: "No prompts found. Click to manage prompts...",
                                    value: "/manage-prompt",
                                    isManagePrompt: true
                                }]);
                                return;
                            }

                            response(message.titles.map(title => ({
                                label: title.name,
                                value: title.content,
                                promptId: title.id,
                                name: title.name
                            })));
                        }
                    });
                } else if (request.term.startsWith("/")) {
                    response(availableCommands.filter(command => command.startsWith(request.term)));
                } else {
                    response([]);
                }
            },
            position: { my: "left bottom", at: "left top" },
            delay: 10,
            minLength: 1,
            open: function () {
                $(this).data("ui-autocomplete").menu.focus(null, $(".ui-menu-item").first());
            },
            focus: function (event, ui) {
                event.preventDefault();
                return false;
            },
            select: function (event, ui) {
                event.preventDefault();

                if (ui.item.isManagePrompt) {
                    vscode.postMessage({ type: "togglePromptManager" });
                } else if (ui.item.promptId) {
                    vscode.postMessage({
                        type: "selectPrompt",
                        prompt: {
                            name: ui.item.name,
                            content: ui.item.value
                        }
                    });
                } else if (ui.item.value === "/clear") {
                    clearConversation();
                } else if (ui.item.value === "/settings") {
                    vscode.postMessage({ type: "openSettings" });
                } else if (ui.item.value === "/manage-prompt") {
                    vscode.postMessage({ type: "togglePromptManager" });
                } else if (ui.item.value === "/reset-prompt") {
                    vscode.postMessage({ type: "resetPrompt" });
                } else if (ui.item.filePath) {
                    // Handle file selection from @ autocomplete
                    vscode.postMessage({
                        type: "addFileReference",
                        fileName: ui.item.filePath,
                        displayName: ui.item.displayName || ui.item.label
                    });
                    // Don't clear input here - let insertFileReference handle it
                    return false;
                }

                // Clear the input after selection (for prompts and commands)
                $(this).val("");
                return false;
            },
        });

        // Add keydown handler to prevent sending when # or @ is typed
        $("#question-input").on("keydown", function (event) {
            if (event.key === "Enter" && (this.value.startsWith("#") || this.value.startsWith("@"))) {
                event.preventDefault();
                return false;
            }
        });
    });

    function showPromptPicker(prompts) {
        // Remove existing picker
        document.querySelector('.prompt-picker')?.remove();

        const list = document.getElementById("qa-list");
        if (prompts.length === 0) {
            const pickerHtml = `
                <div class="prompt-picker">
                    <div class="p-4 text-center">
                        <p class="text-gray-500 mb-4">No prompts found</p>
                        <button onclick="vscode.postMessage({type: 'togglePromptManager'})" class="px-4 py-2 bg-blue-500 text-white rounded">
                            Manage Prompts
                        </button>
                    </div>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', pickerHtml);
            return;
        }

        const promptItems = prompts.map(prompt => `
            <div class="prompt-item p-3 border-b cursor-pointer hover:bg-gray-100" 
                 onclick="selectPrompt('${prompt.id}', '${prompt.name.replace(/'/g, "\\'")}', '${prompt.content.replace(/'/g, "\\'")}')">
                <div class="font-medium">${prompt.name}</div>
                <div class="text-sm text-gray-600 truncate">${prompt.content}</div>
            </div>
        `).join('');

        const pickerHtml = `
            <div class="prompt-picker">
                <div class="bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    <div class="p-3 border-b bg-gray-50">
                        <h3 class="font-medium">Select a Prompt</h3>
                    </div>
                    ${promptItems}
                </div>
            </div>
        `;

        list.insertAdjacentHTML('beforeend', pickerHtml);
    }

    function selectPrompt(id, name, content) {
        document.querySelector('.prompt-picker')?.remove();

        vscode.postMessage({
            type: "selectPrompt",
            prompt: { id, name, content }
        });
    }

    function showActivePrompt(name) {
        // Remove existing indicator
        document.querySelector('.active-prompt-indicator')?.remove();

        if (!name) return;

        // Create new indicator
        const indicator = document.createElement('div');
        indicator.className = 'active-prompt-indicator';
        indicator.innerHTML = `
            <div class="flex items-center gap-2 px-3 py-1">
                ${activePromptIcon}
                <span class="prompt-name-text text-sm font-medium">${name}</span>
            </div>
        `;

        // Add to the top of the chat container
        const chatContainer = document.querySelector('.modern-input-container') || document.body;
        chatContainer.insertBefore(indicator, chatContainer.firstChild);

        // Auto-hide after 3 seconds
        setTimeout(() => {
            indicator?.remove();
        }, 3000);
    }

    // File attachment handling
    function handleFileAttachment() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '*/*';

        // Set up timeout for error handling
        const timeoutId = setTimeout(() => {
            resetFileAttachmentState();
            showFileAttachmentError('File selection timed out');
        }, 30000); // 30 second timeout

        input.onchange = function (event) {
            clearTimeout(timeoutId);
            const files = Array.from(event.target.files);

            if (files.length > 0) {
                showFileAttachmentSuccess();

                vscode.postMessage({
                    type: "attachFiles",
                    files: files.map(file => ({
                        name: file.name,
                        size: file.size,
                        type: file.type
                    }))
                });
            }
        };

        input.oncancel = function () {
            clearTimeout(timeoutId);
            resetFileAttachmentState();
        };

        // Show loading state
        const button = document.getElementById('file-attachment-button');
        if (button) {
            button.classList.add('loading');
        }

        // Remove success state after animation
        setTimeout(() => {
            if (button) {
                button.classList.remove('success');
            }
        }, 600);

        input.click();
    }

    // Enhanced file attachment error handling
    function handleFileAttachmentError(error) {
        console.error('File attachment error:', error);

        const button = document.getElementById('file-attachment-button');
        if (button) {
            button.classList.remove('loading', 'success');
            button.classList.add('error');
        }

        // Remove error state after animation
        setTimeout(() => {
            if (button) {
                button.classList.remove('error');
            }
        }, 500);

        // Show user-friendly error message
        showFileAttachmentError(error);
    }

    const addFreeTextQuestion = () => {
        const input = document.getElementById("question-input");
        const value = input.value;

        if (value.startsWith('/') || value.startsWith('#') || value.startsWith('@')) {
            return;
        }

        if (value?.length > 0) {
            vscode.postMessage({
                type: "addFreeTextQuestion",
                value
            });

            input.value = "";
            if (autoResizeTextarea) {
                autoResizeTextarea.reset();
            }
        }
    };



    // Update the styles
    styleSheet.textContent += `
        .active-prompt-indicator {
            position: absolute;
            top: 8px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 9999px;
            padding: 2px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
            display: flex;
            justify-content: center;
            align-items: center;
            width: auto;
            min-width: 100px;
        }

        .active-prompt-indicator:hover {
            transform: translateX(-50%) translateY(-1px);
            box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
        }

        .prompt-name-text {
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-align: center;
        }

        /* Ensure the prompt manager button doesn't interfere */
        #toggle-prompt-manager {
            z-index: 999;
        }

        /* Button animation styles */
        .button-activate-animation {
            transform: scale(1.05);
            transition: transform 0.2s ease;
        }

        .button-deactivate-animation {
            transform: scale(0.95);
            transition: transform 0.2s ease;
        }

        /* File attachment button states */
        .modern-button.loading {
            opacity: 0.7;
            pointer-events: none;
        }

        .modern-button.success {
            background: var(--modern-accent-success-alpha);
            color: var(--modern-accent-success);
            transform: scale(1.05);
            transition: all 0.3s ease;
        }

        .modern-button.error {
            background: var(--modern-accent-error-alpha);
            color: var(--modern-accent-error);
            animation: shake 0.5s ease-in-out;
        }

        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
        }

        /* Auto-resize textarea styling */
        .auto-resize {
            transition: height 0.2s ease;
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
            .auto-resize,
            .modern-button,
            .file-reference-modern,
            .active-prompt-indicator {
                transition: none !important;
                animation: none !important;
            }
        }
    `;









// Add tooltip styles to the styleSheet
styleSheet.textContent += `
            .tooltip {
        position: absolute;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-widget-border);
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 12px;
        z-index: 1000;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease, visibility 0.2s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        pointer-events: none;
        max-width: 300px;
        white-space: normal;
        line-height: 1.4;
    }

        .tooltip.show {
        opacity: 1;
        visibility: visible;
    }

        .tooltip.top {
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%) translateY(-8px);
    }

        .tooltip.right {
        left: 100%;
        top: 50%;
        transform: translateY(-50%) translateX(8px);
    }
    `;

// Enhanced file attachment handler with visual feedback and error handling
function handleFileAttachment() {
    const button = document.getElementById('file-attachment-button');
    if (!button) return;

    // Add loading state
    button.classList.add('loading');
    button.disabled = true;

    // Send message to extension
    vscode.postMessage({
        type: "searchFile"
    });

    // Set up timeout for error handling
    const timeoutId = setTimeout(() => {
        showFileAttachmentError('File selection timed out');
    }, 30000); // 30 second timeout

    // Store timeout ID for cleanup
    button.dataset.timeoutId = timeoutId;
}

// Show file attachment success feedback
function showFileAttachmentSuccess() {
    const button = document.getElementById('file-attachment-button');
    if (!button) return;

    // Clear loading state and timeout
    button.classList.remove('loading', 'error');
    button.disabled = false;
    clearTimeout(button.dataset.timeoutId);

    // Show success state
    button.classList.add('success');

    // Remove success state after animation
    setTimeout(() => {
        button.classList.remove('success');
    }, 600);
}

// Show file attachment error feedback
function showFileAttachmentError(errorMessage) {
    const button = document.getElementById('file-attachment-button');
    if (!button) return;

    // Clear loading state and timeout
    button.classList.remove('loading', 'success');
    button.disabled = false;
    clearTimeout(button.dataset.timeoutId);

    // Show error state
    button.classList.add('error');

    // Show error message if provided
    if (errorMessage) {
        console.warn('File attachment error:', errorMessage);
        // Could add a toast notification here in the future
    }

    // Remove error state after animation
    setTimeout(() => {
        button.classList.remove('error');
    }, 500);
}

// Reset file attachment button state
function resetFileAttachmentState() {
    const button = document.getElementById('file-attachment-button');
    if (!button) return;

    button.classList.remove('loading', 'success', 'error');
    button.disabled = false;
    clearTimeout(button.dataset.timeoutId);
}

// Update the prompt manager button in the HTML template
function setupPromptManagerButton() {
    const promptManager = document.getElementById('toggle-prompt-manager');
    const promptManagerIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>`;
    if (promptManager) {
        promptManager.innerHTML = `
                ${promptManagerIcon}
                <div class="tooltip right">Manage system prompts (use # to search prompts)</div>
        `;

        // Add hover handlers for tooltip
        promptManager.addEventListener('mouseenter', () => {
            promptManager.querySelector('.tooltip').classList.add('show');
        });
        promptManager.addEventListener('mouseleave', () => {
            promptManager.querySelector('.tooltip').classList.remove('show');
        });
    }
}

// Call setupPromptManagerButton after DOM is loaded
document.addEventListener('DOMContentLoaded', setupPromptManagerButton);

// Enhanced Button State Management System
class ButtonStateManager {
    constructor() {
        this.buttons = new Map();
        this.init();
    }

    init() {
        // Initialize all modern buttons
        const modernButtons = document.querySelectorAll('.modern-button');
        modernButtons.forEach(button => {
            this.registerButton(button);
        });
    }

    registerButton(button) {
        if (!button || this.buttons.has(button.id)) return;

        const buttonState = {
            element: button,
            isActive: button.classList.contains('modern-button-active'),
            isDisabled: button.disabled,
            originalTitle: button.getAttribute('title') || ''
        };

        this.buttons.set(button.id, buttonState);
        this.attachEventListeners(button);
    }

    attachEventListeners(button) {
        // Enhanced hover effects
        button.addEventListener('mouseenter', (e) => {
            if (!button.disabled) {
                this.handleButtonHover(button, true);
            }
        });

        button.addEventListener('mouseleave', (e) => {
            if (!button.disabled) {
                this.handleButtonHover(button, false);
            }
        });

        // Enhanced focus effects
        button.addEventListener('focus', (e) => {
            if (!button.disabled) {
                this.handleButtonFocus(button, true);
            }
        });

        button.addEventListener('blur', (e) => {
            if (!button.disabled) {
                this.handleButtonFocus(button, false);
            }
        });

        // Click feedback
        button.addEventListener('mousedown', (e) => {
            if (!button.disabled) {
                this.handleButtonPress(button, true);
            }
        });

        button.addEventListener('mouseup', (e) => {
            if (!button.disabled) {
                this.handleButtonPress(button, false);
            }
        });
    }

    handleButtonHover(button, isHovering) {
        const buttonState = this.buttons.get(button.id);
        if (!buttonState) return;

        if (isHovering) {
            button.style.transform = 'translateY(-1px)';
            button.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';

            // Update tooltip for send button based on state
            if (button.id === 'ask-button') {
                const hasContent = document.getElementById('question-input')?.value.trim().length > 0;
                if (!hasContent) {
                    button.setAttribute('title', 'Enter a message to send');
                }
            }
        } else {
            button.style.transform = '';
            button.style.boxShadow = '';

            // Restore original tooltip
            if (button.id === 'ask-button') {
                const hasContent = document.getElementById('question-input')?.value.trim().length > 0;
                button.setAttribute('title', hasContent ? 'Send message' : 'Enter a message to send');
            }
        }
    }

    handleButtonFocus(button, isFocused) {
        if (isFocused) {
            button.style.transform = 'translateY(-1px)';
        } else {
            button.style.transform = '';
        }
    }

    handleButtonPress(button, isPressed) {
        if (isPressed) {
            button.style.transform = 'translateY(0)';
            button.style.transition = 'transform 0.1s ease';
        } else {
            button.style.transform = 'translateY(-1px)';
            button.style.transition = 'transform 0.2s ease';
        }
    }

    updateButtonState(buttonId, isActive, customTitle = null) {
        const buttonState = this.buttons.get(buttonId);
        if (!buttonState) return;

        const button = buttonState.element;

        if (isActive !== buttonState.isActive) {
            if (isActive) {
                button.classList.remove('modern-button-inactive');
                button.classList.add('modern-button-active');
            } else {
                button.classList.remove('modern-button-active');
                button.classList.add('modern-button-inactive');
            }
            buttonState.isActive = isActive;
        }

        // Update title if provided
        if (customTitle) {
            button.setAttribute('title', customTitle);
            buttonState.originalTitle = customTitle;
        }
    }

    setButtonDisabled(buttonId, disabled) {
        const buttonState = this.buttons.get(buttonId);
        if (!buttonState) return;

        const button = buttonState.element;
        button.disabled = disabled;
        buttonState.isDisabled = disabled;

        if (disabled) {
            button.style.transform = '';
            button.style.boxShadow = '';
        }
    }

    // Method to update all button states based on current context
    updateAllButtonStates() {
        try {
            const input = document.getElementById('question-input');
            const hasContent = input?.value.trim().length > 0;
            const isDisabled = input?.disabled;

            // Update send button
            this.updateButtonState('ask-button', hasContent && !isDisabled,
                hasContent ? 'Send message' : 'Enter a message to send');
            this.setButtonDisabled('ask-button', isDisabled);

            // Update other buttons based on disabled state
            this.setButtonDisabled('file-attachment-button', isDisabled);
            this.setButtonDisabled('more-button', isDisabled);
        } catch (error) {
            console.warn('Error updating button states:', error);
        }
    }

    // Method to handle animation preferences
    respectAnimationPreferences() {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.buttons.forEach((buttonState, buttonId) => {
            const button = buttonState.element;
            if (prefersReducedMotion) {
                button.style.transition = 'none';
            } else {
                button.style.transition = '';
            }
        });
    }

    // Initialize animation preference handling
    initAnimationPreferences() {
        this.respectAnimationPreferences();

        // Listen for changes in animation preferences
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        mediaQuery.addEventListener('change', () => {
            this.respectAnimationPreferences();
        });
    }
}

// Initialize button state manager
let buttonStateManager;
document.addEventListener('DOMContentLoaded', () => {
    buttonStateManager = new ButtonStateManager();
    // Make it globally accessible
    window.buttonStateManager = buttonStateManager;
    // Initialize animation preferences
    buttonStateManager.initAnimationPreferences();
});

// AutoResizeTextarea class for dynamic height adjustment
class AutoResizeTextarea {
    constructor(textarea, options = {}) {
        this.textarea = textarea;
        this.minHeight = options.minHeight || 48;
        this.maxHeight = options.maxHeight || 164;
        this.transitionDuration = options.transitionDuration || 200;
        this.debounceTimeout = null;

        this.init();
    }

    init() {
        // Set initial height and styles
        this.textarea.style.height = `${this.minHeight}px`;
        this.textarea.style.transition = `height ${this.transitionDuration}ms ease`;
        this.textarea.style.overflow = 'hidden';

        // Bind event handlers
        this.textarea.addEventListener('input', this.handleInput.bind(this));
        this.textarea.addEventListener('keydown', this.handleKeydown.bind(this));
        this.textarea.addEventListener('paste', this.handlePaste.bind(this));

        // Initial adjustment
        this.adjustHeight();
    }

    handleInput() {
        this.debouncedAdjustHeight();
    }

    handleKeydown(event) {
        // Handle Enter key for immediate adjustment
        if (event.key === 'Enter') {
            // Small delay to allow the newline to be added
            setTimeout(() => this.adjustHeight(), 0);
        }
    }

    handlePaste() {
        // Handle paste events with a small delay
        setTimeout(() => this.adjustHeight(), 0);
    }

    debouncedAdjustHeight() {
        // Debounce resize operations to prevent excessive calculations
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }

        this.debounceTimeout = setTimeout(() => {
            this.adjustHeight();
        }, 10);
    }

    adjustHeight(reset = false) {
        try {
            if (reset) {
                this.textarea.style.height = `${this.minHeight}px`;
                return;
            }

            // Store current scroll position
            const scrollTop = this.textarea.scrollTop;

            // Temporarily set height to auto to get the natural height
            this.textarea.style.height = 'auto';

            // Calculate the new height based on scroll height
            const newHeight = Math.max(
                this.minHeight,
                Math.min(this.textarea.scrollHeight, this.maxHeight)
            );

            // Apply the new height
            this.textarea.style.height = `${newHeight}px`;

            // Handle overflow when content exceeds max height
            if (this.textarea.scrollHeight > this.maxHeight) {
                this.textarea.style.overflow = 'auto';
                // Restore scroll position for long content
                this.textarea.scrollTop = scrollTop;
            } else {
                this.textarea.style.overflow = 'hidden';
            }

            // Update button states based on content
            this.updateButtonStates();

        } catch (error) {
            console.warn('Error in adjustHeight:', error);
            // Fallback to minimum height on error
            this.textarea.style.height = `${this.minHeight}px`;
            this.textarea.style.overflow = 'hidden';
        }
    }

    updateButtonStates() {
        // Use the global button state manager if available
        if (window.buttonStateManager) {
            window.buttonStateManager.updateAllButtonStates();
        } else {
            // Fallback to direct button state management
            const hasContent = this.textarea.value.trim().length > 0;
            const sendButton = document.getElementById('ask-button');

            if (sendButton) {
                if (hasContent) {
                    sendButton.classList.remove('modern-button-inactive');
                    sendButton.classList.add('modern-button-active');
                    sendButton.setAttribute('title', 'Send message');
                } else {
                    sendButton.classList.remove('modern-button-active');
                    sendButton.classList.add('modern-button-inactive');
                    sendButton.setAttribute('title', 'Enter a message to send');
                }
            }
        }
    }

    reset() {
        this.adjustHeight(true);
        this.updateButtonStates();
    }

    destroy() {
        // Clean up event listeners
        this.textarea.removeEventListener('input', this.handleInput.bind(this));
        this.textarea.removeEventListener('keydown', this.handleKeydown.bind(this));
        this.textarea.removeEventListener('paste', this.handlePaste.bind(this));

        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
    }
}

// Initialize auto-resize functionality
let autoResizeTextarea = null;

function initializeAutoResize() {
    const textarea = document.getElementById('question-input');
    if (textarea && !autoResizeTextarea) {
        // Add auto-resize class for styling
        textarea.classList.add('auto-resize');

        autoResizeTextarea = new AutoResizeTextarea(textarea, {
            minHeight: 48,
            maxHeight: 164,
            transitionDuration: 200
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAutoResize);
} else {
    initializeAutoResize();
}

// Update the styles
styleSheet.textContent += `
            .active-prompt-indicator {
                position: absolute;
                top: 8px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 1000;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-widget-border);
        border-radius: 9999px;
        padding: 2px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: all 0.2s ease;
        display: flex;
        justify-content: center;
        align-items: center;
        width: auto;
        min-width: 100px;
    }

        .active-prompt-indicator:hover {
    transform: translateX(-50%) translateY(-1px);
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
}

        .prompt-name-text {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
}

/* Ensure the prompt manager button doesn't interfere */
#toggle-prompt-manager {
    z-index: 999;
}

/* Add margin to the top of the content to make room for the indicator */
#qa-list, #introduction, #conversation-list {
    margin-top: 20px;
}

        .file-reference-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

        .file-icon {
    display: inline-block;
    vertical-align: middle;
}
`;

// Theme detection and management for modern input styling
function detectAndApplyTheme() {
    const body = document.body;
    const documentElement = document.documentElement;

    // Get VS Code theme information from CSS variables or body classes
    const computedStyle = getComputedStyle(documentElement);
    
    // Try multiple ways to get theme information for better accuracy
    let backgroundColor = computedStyle.getPropertyValue('--vscode-editor-background').trim();
    if (!backgroundColor) {
        backgroundColor = computedStyle.getPropertyValue('--vscode-sideBar-background').trim();
    }
    if (!backgroundColor) {
        backgroundColor = getComputedStyle(body).backgroundColor;
    }

    // Remove existing theme attributes
    body.removeAttribute('data-vscode-theme-kind');
    body.removeAttribute('data-vscode-theme-name');

    // Quick check for existing VS Code theme classes first (fastest method)
    const bodyClasses = body.className;
    if (bodyClasses.includes('vscode-dark')) {
        body.setAttribute('data-vscode-theme-kind', 'vscode-dark');
        body.setAttribute('data-vscode-theme-name', 'dark');
        return;
    } else if (bodyClasses.includes('vscode-light')) {
        body.setAttribute('data-vscode-theme-kind', 'vscode-light');
        body.setAttribute('data-vscode-theme-name', 'light');
        return;
    } else if (bodyClasses.includes('vscode-high-contrast')) {
        body.setAttribute('data-vscode-theme-kind', 'vscode-high-contrast');
        body.setAttribute('data-vscode-theme-name', 'high-contrast');
        return;
    }

    // Check for high contrast themes via CSS variables
    const contrastBorder = computedStyle.getPropertyValue('--vscode-contrastBorder').trim();
    if (contrastBorder && contrastBorder !== 'transparent' && contrastBorder !== '' && contrastBorder !== 'none') {
        body.setAttribute('data-vscode-theme-kind', 'vscode-high-contrast');
        body.setAttribute('data-vscode-theme-name', 'high-contrast');
        return;
    }

    // Fallback: Detect theme based on background color brightness
    if (backgroundColor) {
        const rgb = backgroundColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
            const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;

            if (brightness < 128) {
                body.setAttribute('data-vscode-theme-kind', 'vscode-dark');
                body.setAttribute('data-vscode-theme-name', 'dark');
            } else {
                body.setAttribute('data-vscode-theme-kind', 'vscode-light');
                body.setAttribute('data-vscode-theme-name', 'light');
            }
        }
    }
}

// Apply theme detection on load
detectAndApplyTheme();

// Re-apply theme detection when CSS variables change (theme switch)
const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' &&
            (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
            shouldUpdate = true;
        }
    });
    
    if (shouldUpdate) {
        // Use the responsive scheduling function
        scheduleThemeCheck();
    }
});

observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style']
});

// Also listen for VS Code theme change events if available
window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'themeChanged' || message.command === 'themeChanged') {
        // Apply theme immediately, then again after a small delay for any late-loading CSS
        detectAndApplyTheme();
        setTimeout(detectAndApplyTheme, 10);
    }
});

// More responsive theme change detection using requestAnimationFrame
let themeCheckScheduled = false;
function scheduleThemeCheck() {
    if (!themeCheckScheduled) {
        themeCheckScheduled = true;
        requestAnimationFrame(() => {
            detectAndApplyTheme();
            themeCheckScheduled = false;
        });
    }
}

})();
