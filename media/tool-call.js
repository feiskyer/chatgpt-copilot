/**
 * Tool call handling functions for collapsible tool call blocks
 */

// Tool call state management
const toolCallStates = new Map();

// Function to toggle tool call blocks with smooth animation
window.toggleToolCall = function (id) {
    const toolCallBlock = document.getElementById(id);
    if (!toolCallBlock) {
        console.error('Tool call block not found:', id);
        return;
    }

    const content = toolCallBlock.querySelector('.tool-call-content');
    const header = toolCallBlock.querySelector('.tool-call-header');
    const chevron = header.querySelector('.tool-chevron');

    if (!content || !chevron) {
        console.error('Required elements not found', { content, chevron });
        return;
    }

    // 确保 toolCallStates 存在
    if (typeof toolCallStates === 'undefined') {
        window.toolCallStates = new Map();
    }

    if (content.classList.contains('collapsed')) {
        // Expand
        content.classList.remove('collapsed');
        chevron.style.transform = 'rotate(90deg)';
        toolCallStates.set(id, 'expanded');

        // Highlight code blocks
        const codeBlocks = content.querySelectorAll('pre code:not(.hljs)');
        codeBlocks.forEach(block => {
            if (typeof hljs !== 'undefined') {
                hljs.highlightBlock(block);
            }
        });
    } else {
        // Collapse
        content.classList.add('collapsed');
        chevron.style.transform = 'rotate(0deg)';
        toolCallStates.set(id, 'collapsed');
    }
};

// Enhanced tool result processing
function setupToolCallProcessing() {
    const processToolResults = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // Process new tool results
                const toolResults = document.querySelectorAll('tool-result:not(.processed)');

                toolResults.forEach(toolResult => {
                    toolResult.classList.add('processed');

                    const toolName = toolResult.getAttribute('data-tool-name');
                    const counter = toolResult.getAttribute('data-counter');

                    // Find matching tool call
                    const targetToolCall = document.querySelector(
                        `.tool-call-block[data-tool-name="${toolName}"][data-tool-counter="${counter}"]`
                    );

                    if (targetToolCall) {
                        processToolResult(targetToolCall, toolResult);
                    }

                    // Remove the tool-result element
                    toolResult.remove();
                });

                // Initialize new tool call blocks
                initializeNewToolCalls();
            }
        }
    });

    processToolResults.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function processToolResult(toolCallBlock, toolResult) {
    const resultContainer = toolCallBlock.querySelector('.tool-call-result');
    const statusBadge = toolCallBlock.querySelector('.tool-status');

    if (!resultContainer) return;

    // Extract and format result content
    let resultContent = toolResult.textContent.trim();
    let isError = false;

    try {
        const jsonContent = JSON.parse(resultContent);

        // Check if it's an error
        // Only consider .error and .isError keys as indicators of an error
        if (jsonContent.error || jsonContent.isError === true) {
            isError = true;
        }

        // Always format as JSON for consistency
        resultContent = '```json\n' + JSON.stringify(jsonContent, null, 2) + '\n```';
    } catch (e) {
        // Not JSON, check if it contains error keywords
        if (resultContent.toLowerCase().includes('error') ||
            resultContent.toLowerCase().includes('failed') ||
            resultContent.toLowerCase().includes('exception')) {
            isError = true;
        }
        // Keep as is if not JSON
    }

    // Update status badge
    if (statusBadge) {
        statusBadge.textContent = isError ? 'Failed' : 'Done';
        statusBadge.className = `tool-status ${isError ? 'status-error' : 'status-success'}`;
    }

    // Clear the placeholder content first
    resultContainer.innerHTML = '';

    // Create the result HTML directly, similar to the Arguments section
    if (resultContent.startsWith('```json') && resultContent.endsWith('```')) {
        // Extract the JSON content from the code block
        const jsonContent = resultContent.slice(7, -3).trim();
        resultContainer.innerHTML = `
            <div class="section-label">RESULT:</div>
            <pre><code class="language-json">${jsonContent}</code></pre>
        `;
    } else {
        // For non-JSON content, use marked.parse
        resultContainer.innerHTML = `
            <div class="section-label">RESULT:</div>
            ${marked.parse(resultContent)}
        `;
    }

    // Highlight code blocks
    const codeBlocks = resultContainer.querySelectorAll('pre code');
    codeBlocks.forEach(block => {
        if (typeof hljs !== 'undefined') {
            hljs.highlightBlock(block);
        }
    });

    // Auto-expand if error
    if (isError) {
        const content = toolCallBlock.querySelector('.tool-call-content');
        const chevron = toolCallBlock.querySelector('.tool-chevron');
        if (content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            chevron.style.transform = 'rotate(90deg)';
            toolCallStates.set(toolCallBlock.id, 'expanded');
        }
    }
}

function initializeNewToolCalls() {
    const uninitializedBlocks = document.querySelectorAll('.tool-call-block:not(.initialized)');

    uninitializedBlocks.forEach(block => {
        block.classList.add('initialized');

        // Set initial state
        const content = block.querySelector('.tool-call-content');
        const chevron = block.querySelector('.tool-chevron');

        // Start collapsed
        content.classList.add('collapsed');
        chevron.style.transform = 'rotate(0deg)';

        // Store state
        toolCallStates.set(block.id, 'collapsed');
    });
}

// Enhanced copy functionality for tool arguments
window.copyToolArgs = function (button, toolId) {
    const toolBlock = document.getElementById(toolId);
    if (!toolBlock) return;

    const argsCode = toolBlock.querySelector('.tool-call-args pre code');
    if (!argsCode) return;

    const text = argsCode.textContent;

    navigator.clipboard.writeText(text).then(() => {
        // Visual feedback
        const originalText = button.textContent;
        button.textContent = '✓ Copied';
        button.classList.add('copy-success');

        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copy-success');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
};

// Batch expand/collapse functionality
window.toggleAllToolCalls = function (expand) {
    const toolCallBlocks = document.querySelectorAll('.tool-call-block');

    toolCallBlocks.forEach(block => {
        const content = block.querySelector('.tool-call-content');
        const chevron = block.querySelector('.tool-chevron');

        if (expand && content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            chevron.style.transform = 'rotate(90deg)';
            toolCallStates.set(block.id, 'expanded');

            // Highlight code blocks
            const codeBlocks = content.querySelectorAll('pre code:not(.hljs)');
            codeBlocks.forEach(codeBlock => {
                hljs.highlightBlock(codeBlock);
            });
        } else if (!expand && !content.classList.contains('collapsed')) {
            content.classList.add('collapsed');
            chevron.style.transform = 'rotate(0deg)';
            toolCallStates.set(block.id, 'collapsed');
        }
    });
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupToolCallProcessing();
    setupEventDelegation();
});

// Set up event delegation for tool call clicks
function setupEventDelegation() {
    // Handle clicks on tool call headers
    document.body.addEventListener('click', (event) => {
        const header = event.target.closest('.tool-call-header');
        if (header) {
            // 检查是否有内联 onclick
            if (header.hasAttribute('onclick')) {
                // 让内联 onclick 处理，不做任何事
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const toolCallBlock = header.closest('.tool-call-block');
            if (toolCallBlock && toolCallBlock.id) {
                window.toggleToolCall(toolCallBlock.id);
            }
        }
    });
}

// Handle streaming updates
function handleStreamingToolCall(toolCallId) {
    const toolBlock = document.getElementById(toolCallId);
    if (!toolBlock) return;

    const statusBadge = toolBlock.querySelector('.tool-status');
    if (statusBadge && statusBadge.textContent === 'Running') {
        // Add pulsing animation for running state
        statusBadge.classList.add('status-running');
    }
}

// Export for use in other scripts
window.toolCallEnhanced = {
    toggleToolCall,
    copyToolArgs,
    toggleAllToolCalls,
    handleStreamingToolCall
};
