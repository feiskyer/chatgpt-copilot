/**
 * Enhanced Reasoning Block Functionality
 * Similar to tool-call.js but for reasoning blocks
 */

// Global state for reasoning blocks
window.reasoningStates = window.reasoningStates || new Map();
window.reasoningCounter = window.reasoningCounter || 0;

/**
 * Toggle reasoning block visibility with smooth animation
 */
window.toggleReasoning = function (id) {
    const reasoningBlock = document.getElementById(id);
    if (!reasoningBlock) {
        console.error('Reasoning block not found:', id);
        return;
    }

    const content = reasoningBlock.querySelector('.reasoning-content');
    const header = reasoningBlock.querySelector('.reasoning-header');
    const chevron = header.querySelector('.reasoning-chevron');

    if (!content || !chevron) {
        console.error('Required reasoning elements not found', { content, chevron });
        return;
    }

    // Ensure reasoningStates exists
    if (typeof reasoningStates === 'undefined') {
        window.reasoningStates = new Map();
    }

    const isCollapsed = content.classList.contains('collapsed');

    if (isCollapsed) {
        // Expand
        content.classList.remove('collapsed');
        chevron.style.transform = 'rotate(90deg)';
        reasoningStates.set(id, 'expanded');

        // Auto-scroll to bottom when expanding
        setTimeout(() => {
            content.scrollTop = content.scrollHeight;
        }, 300); // Wait for expand animation to complete
    } else {
        // Collapse
        content.classList.add('collapsed');
        chevron.style.transform = 'rotate(0deg)';
        reasoningStates.set(id, 'collapsed');
    }
};

/**
 * Create HTML for reasoning block
 */
window.createReasoningHtml = function (reasoningText, messageId) {
    const reasoningId = `${messageId}-reasoning`;

    return `
        <div class="reasoning-block" id="${reasoningId}">
            <div class="reasoning-header" onclick="toggleReasoning('${reasoningId}')">
                <svg class="reasoning-chevron" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M7 10l5 5 5-5z"/>
                </svg>
                <div class="reasoning-info">
                    <svg class="reasoning-icon" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <span class="reasoning-title">Reasoning</span>
                </div>
            </div>
            <div class="reasoning-content collapsed" id="${reasoningId}-content">
                ${reasoningText}
            </div>
        </div>
    `;
};

/**
 * Update existing reasoning content and auto-scroll to bottom
 */
window.updateReasoningContent = function (reasoningId, content) {
    const contentElement = document.getElementById(`${reasoningId}-content`);
    if (contentElement) {
        contentElement.innerHTML = content;

        // Auto-scroll to bottom if content is expanded and overflowing
        if (!contentElement.classList.contains('collapsed')) {
            // Use setTimeout to ensure DOM is updated before scrolling
            setTimeout(() => {
                contentElement.scrollTop = contentElement.scrollHeight;
            }, 0);
        }
    }
};

/**
 * Toggle all reasoning blocks (expand/collapse all)
 */
window.toggleAllReasoning = function (expand = null) {
    const reasoningBlocks = document.querySelectorAll('.reasoning-block');

    reasoningBlocks.forEach(block => {
        const content = block.querySelector('.reasoning-content');
        const chevron = block.querySelector('.reasoning-chevron');

        if (expand === null) {
            // Auto-detect: if any are expanded, collapse all; otherwise expand all
            const hasExpanded = Array.from(reasoningBlocks).some(b =>
                !b.querySelector('.reasoning-content').classList.contains('collapsed')
            );
            expand = !hasExpanded;
        }

        if (expand && content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            chevron.style.transform = 'rotate(90deg)';
            reasoningStates.set(block.id, 'expanded');
        } else if (!expand && !content.classList.contains('collapsed')) {
            content.classList.add('collapsed');
            chevron.style.transform = 'rotate(0deg)';
            reasoningStates.set(block.id, 'collapsed');
        }
    });
};

/**
 * Initialize reasoning blocks when DOM is ready
 */
function setupReasoningProcessing() {
    // Set initial state for existing reasoning blocks
    const reasoningBlocks = document.querySelectorAll('.reasoning-block');
    reasoningBlocks.forEach(block => {
        const content = block.querySelector('.reasoning-content');
        const chevron = block.querySelector('.reasoning-chevron');

        if (content && chevron) {
            // Default to collapsed state
            content.classList.add('collapsed');
            chevron.style.transform = 'rotate(0deg)';
            reasoningStates.set(block.id, 'collapsed');
        }
    });
}

/**
 * Set up event delegation for reasoning clicks
 */
function setupReasoningEventDelegation() {
    // Handle clicks on reasoning headers
    document.body.addEventListener('click', (event) => {
        const header = event.target.closest('.reasoning-header');
        if (header) {
            // Check if it has inline onclick
            if (header.hasAttribute('onclick')) {
                // Let inline onclick handle it
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const reasoningBlock = header.closest('.reasoning-block');
            if (reasoningBlock && reasoningBlock.id) {
                window.toggleReasoning(reasoningBlock.id);
            }
        }
    });
}

/**
 * Handle streaming updates for reasoning
 */
function handleStreamingReasoning(reasoningId) {
    const reasoningBlock = document.getElementById(reasoningId);
    if (!reasoningBlock) return;

    // Add any streaming-specific styling or animations here
    const content = reasoningBlock.querySelector('.reasoning-content');
    if (content) {
        content.classList.add('reasoning-streaming');
    }
}

/**
 * Finalize reasoning block (remove streaming state)
 */
function finalizeReasoning(reasoningId) {
    const reasoningBlock = document.getElementById(reasoningId);
    if (!reasoningBlock) return;

    const content = reasoningBlock.querySelector('.reasoning-content');
    if (content) {
        content.classList.remove('reasoning-streaming');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupReasoningProcessing();
    setupReasoningEventDelegation();
});

// Export for use in other scripts
window.reasoningEnhanced = {
    toggleReasoning,
    createReasoningHtml,
    updateReasoningContent,
    toggleAllReasoning,
    handleStreamingReasoning,
    finalizeReasoning
};
