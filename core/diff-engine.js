const fs = require('fs-extra');
const path = require('path');
const diff = require('fast-diff');

class DiffEngine {
    constructor() {
        this.EDIT_THRESHOLD = 3; // Minimum chars for a meaningful edit
        this.MAX_CONTEXT_LINES = 5; // Lines of context around changes
    }

    /**
     * Analyze changes between old and new content and extract meaningful edits
     * @param {string} filePath - Path to the file that changed
     * @param {string} oldContent - Previous file content
     * @param {string} newContent - New file content
     * @returns {Array} Array of operation objects
     */
    analyzeChanges(filePath, oldContent, newContent) {
        try {
            // Handle file creation
            if (!oldContent && newContent) {
                return [{
                    type: 'FILE_CREATE',
                    filePath,
                    content: newContent,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        lines: newContent.split('\n').length,
                        chars: newContent.length
                    }
                }];
            }

            // Handle file deletion
            if (oldContent && !newContent) {
                return [{
                    type: 'FILE_DELETE',
                    filePath,
                    content: oldContent,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        lines: oldContent.split('\n').length,
                        chars: oldContent.length
                    }
                }];
            }

            // Handle file modifications
            if (oldContent === newContent) {
                return []; // No changes
            }

            return this.extractStringBasedEdits(filePath, oldContent, newContent);
        } catch (error) {
            console.error(`Error analyzing changes for ${filePath}:`, error.message);
            return [];
        }
    }

    /**
     * Extract string-based edits from content differences
     * @param {string} filePath - Path to the file
     * @param {string} oldContent - Original content
     * @param {string} newContent - Modified content
     * @returns {Array} Array of FILE_EDIT operations
     */
    extractStringBasedEdits(filePath, oldContent, newContent) {
        const operations = [];
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');

        // Use fast-diff to get character-level differences
        const diffs = diff(oldContent, newContent);
        
        if (diffs.length === 0) return operations;

        // Group consecutive changes into meaningful edits
        const edits = this.groupDiffsIntoEdits(diffs, oldContent);
        
        for (const edit of edits) {
            if (this.isSignificantEdit(edit)) {
                const lineNumber = this.findLineNumber(oldContent, edit.position);
                
                operations.push({
                    type: 'FILE_EDIT',
                    filePath,
                    oldString: edit.oldText,
                    newString: edit.newText,
                    lineNumber,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        context: this.getContextLines(oldLines, lineNumber),
                        changeType: this.categorizeChange(edit.oldText, edit.newText),
                        confidence: this.calculateConfidence(edit)
                    }
                });
            }
        }

        // If no significant string edits found, create a full file edit
        if (operations.length === 0) {
            operations.push({
                type: 'FILE_EDIT',
                filePath,
                oldString: oldContent,
                newString: newContent,
                lineNumber: 1,
                timestamp: new Date().toISOString(),
                metadata: {
                    changeType: 'FULL_FILE_REPLACE',
                    confidence: 0.7
                }
            });
        }

        return operations;
    }

    /**
     * Group fast-diff results into meaningful edits
     * @param {Array} diffs - Fast-diff results
     * @param {string} originalContent - Original file content
     * @returns {Array} Grouped edits
     */
    groupDiffsIntoEdits(diffs, originalContent) {
        const edits = [];
        let position = 0;
        let currentEdit = null;

        for (const [operation, text] of diffs) {
            if (operation === diff.EQUAL) {
                if (currentEdit) {
                    edits.push(currentEdit);
                    currentEdit = null;
                }
                position += text.length;
            } else {
                if (!currentEdit) {
                    currentEdit = {
                        position,
                        oldText: '',
                        newText: ''
                    };
                }

                if (operation === diff.DELETE) {
                    currentEdit.oldText += text;
                    position += text.length;
                } else if (operation === diff.INSERT) {
                    currentEdit.newText += text;
                }
            }
        }

        if (currentEdit) {
            edits.push(currentEdit);
        }

        return edits;
    }

    /**
     * Check if an edit is significant enough to track
     * @param {Object} edit - Edit object
     * @returns {boolean} True if significant
     */
    isSignificantEdit(edit) {
        // Skip tiny changes (typos, single chars)
        if (edit.oldText.length < this.EDIT_THRESHOLD && edit.newText.length < this.EDIT_THRESHOLD) {
            return false;
        }

        // Skip pure whitespace changes
        if (edit.oldText.trim() === edit.newText.trim()) {
            return false;
        }

        return true;
    }

    /**
     * Find line number for a character position
     * @param {string} content - File content
     * @param {number} position - Character position
     * @returns {number} Line number (1-indexed)
     */
    findLineNumber(content, position) {
        const beforePosition = content.substring(0, position);
        return beforePosition.split('\n').length;
    }

    /**
     * Get context lines around a change
     * @param {Array} lines - File lines
     * @param {number} lineNumber - Target line (1-indexed)
     * @returns {Object} Context information
     */
    getContextLines(lines, lineNumber) {
        const start = Math.max(0, lineNumber - 1 - this.MAX_CONTEXT_LINES);
        const end = Math.min(lines.length, lineNumber + this.MAX_CONTEXT_LINES);
        
        return {
            before: lines.slice(start, lineNumber - 1),
            after: lines.slice(lineNumber, end),
            lineNumber: lineNumber
        };
    }

    /**
     * Categorize the type of change
     * @param {string} oldText - Original text
     * @param {string} newText - New text
     * @returns {string} Change category
     */
    categorizeChange(oldText, newText) {
        if (!oldText) return 'ADDITION';
        if (!newText) return 'DELETION';
        
        // Check for common patterns
        if (oldText.includes('function') || newText.includes('function')) {
            return 'FUNCTION_CHANGE';
        }
        if (oldText.includes('import') || newText.includes('import')) {
            return 'IMPORT_CHANGE';
        }
        if (oldText.includes('=') || newText.includes('=')) {
            return 'ASSIGNMENT_CHANGE';
        }
        
        return 'TEXT_CHANGE';
    }

    /**
     * Calculate confidence level for the edit detection
     * @param {Object} edit - Edit object
     * @returns {number} Confidence between 0 and 1
     */
    calculateConfidence(edit) {
        let confidence = 0.8;
        
        // Higher confidence for larger changes
        const changeSize = Math.max(edit.oldText.length, edit.newText.length);
        if (changeSize > 50) confidence += 0.1;
        
        // Lower confidence for very complex changes
        const complexity = Math.abs(edit.oldText.length - edit.newText.length);
        if (complexity > changeSize * 0.5) confidence -= 0.2;
        
        return Math.max(0.1, Math.min(1.0, confidence));
    }
}

module.exports = DiffEngine; 