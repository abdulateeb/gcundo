const chokidar = require('chokidar');
const fs = require('fs-extra');
const path = require('path');
const NodeCache = require('node-cache');
const chalk = require('chalk');
const DiffEngine = require('./diff-engine');
const logger = require('./logger');

class FileSystemMonitor {
    constructor(options = {}) {
        this.watcher = null;
        this.isActive = false;
        this.fileCache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache
        this.diffEngine = new DiffEngine();
        
        // Configuration
        this.config = {
            watchPath: options.watchPath || process.cwd(),
            ignorePatterns: options.ignorePatterns || [
                '**/node_modules/**',
                '**/.git/**',
                '**/logs/**',
                '**/*.log',
                '**/.*',
                '**/.gcundo/**'
            ],
            debounceMs: options.debounceMs || 100,
            maxFileSize: options.maxFileSize || 1024 * 1024, // 1MB
            fileExtensions: options.fileExtensions || [
                '.js', '.ts', '.jsx', '.tsx', '.vue', '.py', '.rb', '.go',
                '.java', '.c', '.cpp', '.cs', '.php', '.swift', '.kt',
                '.rs', '.scala', '.clj', '.hs', '.ml', '.elm', '.dart',
                '.json', '.xml', '.yaml', '.yml', '.toml', '.ini',
                '.md', '.txt', '.csv', '.sql', '.html', '.css', '.scss',
                '.sass', '.less', '.styl'
            ]
        };
        
        this.stats = {
            filesWatched: 0,
            operationsLogged: 0,
            startTime: null,
            lastActivity: null
        };
    }

    /**
     * Start filesystem monitoring
     * @param {Object} options - Optional configuration overrides
     * @returns {Promise<boolean>} Success status
     */
    async start(options = {}) {
        if (this.isActive) {
            console.log(chalk.yellow('Monitor is already running'));
            return false;
        }

        try {
            // Merge any provided options
            Object.assign(this.config, options);
            
            console.log(chalk.blue('🔍 Starting filesystem monitor...'));
            console.log(chalk.gray(`   Watching: ${this.config.watchPath}`));
            
            // Initialize file cache with current state
            await this.initializeFileCache();
            
            // Start watching
            this.watcher = chokidar.watch(this.config.watchPath, {
                ignored: this.config.ignorePatterns,
                persistent: true,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: this.config.debounceMs,
                    pollInterval: 50
                }
            });

            // Set up event handlers
            this.setupEventHandlers();
            
            this.isActive = true;
            this.stats.startTime = new Date().toISOString();
            this.stats.filesWatched = this.fileCache.keys().length;
            
            console.log(chalk.green('✅ Filesystem monitor started successfully'));
            console.log(chalk.gray(`   Monitoring ${this.stats.filesWatched} files`));
            
            return true;
        } catch (error) {
            console.error(chalk.red('Error starting monitor:'), error.message);
            return false;
        }
    }

    /**
     * Stop filesystem monitoring
     * @returns {Promise<boolean>} Success status
     */
    async stop() {
        if (!this.isActive) {
            console.log(chalk.yellow('Monitor is not running'));
            return false;
        }

        try {
            console.log(chalk.blue('🛑 Stopping filesystem monitor...'));
            
            if (this.watcher) {
                await this.watcher.close();
                this.watcher = null;
            }
            
            this.isActive = false;
            
            console.log(chalk.green('✅ Filesystem monitor stopped'));
            this.printSessionStats();
            
            return true;
        } catch (error) {
            console.error(chalk.red('Error stopping monitor:'), error.message);
            return false;
        }
    }

    /**
     * Get current monitoring status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isActive: this.isActive,
            config: this.config,
            stats: {
                ...this.stats,
                uptime: this.stats.startTime ? 
                    Date.now() - new Date(this.stats.startTime).getTime() : 0
            }
        };
    }

    /**
     * Initialize file cache with current filesystem state
     */
    async initializeFileCache() {
        try {
            const files = await this.getWatchableFiles(this.config.watchPath);
            
            for (const filePath of files) {
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    this.fileCache.set(filePath, {
                        content,
                        lastModified: Date.now(),
                        size: content.length
                    });
                } catch (error) {
                    // Skip files that can't be read
                    continue;
                }
            }
        } catch (error) {
            console.error('Error initializing file cache:', error.message);
        }
    }

    /**
     * Get list of files to watch based on configuration
     */
    async getWatchableFiles(dir) {
        const files = [];
        
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                // Skip ignored patterns
                if (this.shouldIgnore(fullPath)) continue;
                
                if (item.isDirectory()) {
                    const subFiles = await this.getWatchableFiles(fullPath);
                    files.push(...subFiles);
                } else if (this.isWatchableFile(fullPath)) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Skip directories that can't be read
        }
        
        return files;
    }

    /**
     * Check if file should be ignored
     */
    shouldIgnore(filePath) {
        const relativePath = path.relative(this.config.watchPath, filePath);
        
        for (const pattern of this.config.ignorePatterns) {
            if (this.matchesPattern(relativePath, pattern)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Simple pattern matching for ignore patterns
     */
    matchesPattern(filePath, pattern) {
        // Convert glob-like pattern to regex
        const regexPattern = pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filePath);
    }

    /**
     * Check if file should be watched based on extension
     */
    isWatchableFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return this.config.fileExtensions.includes(ext);
    }

    /**
     * Set up chokidar event handlers
     */
    setupEventHandlers() {
        this.watcher.on('add', (filePath) => {
            this.handleFileAdd(filePath);
        });

        this.watcher.on('change', (filePath) => {
            this.handleFileChange(filePath);
        });

        this.watcher.on('unlink', (filePath) => {
            this.handleFileDelete(filePath);
        });

        this.watcher.on('error', (error) => {
            console.error(chalk.red('Watcher error:'), error.message);
        });

        this.watcher.on('ready', () => {
            console.log(chalk.green('Monitor ready and watching for changes'));
        });
    }

    /**
     * Handle file addition
     */
    async handleFileAdd(filePath) {
        try {
            if (!this.isWatchableFile(filePath)) return;
            
            const content = await fs.readFile(filePath, 'utf8');
            
            // Skip large files
            if (content.length > this.config.maxFileSize) {
                console.log(chalk.yellow(`Skipping large file: ${filePath}`));
                return;
            }
            
            // Analyze as new file
            const operations = this.diffEngine.analyzeChanges(filePath, null, content);
            
            // Log operations
            for (const operation of operations) {
                await logger.logOperation(operation);
                this.stats.operationsLogged++;
            }
            
            // Cache the new file
            this.fileCache.set(filePath, {
                content,
                lastModified: Date.now(),
                size: content.length
            });
            
            this.stats.lastActivity = new Date().toISOString();
            console.log(chalk.green(`📄 Created: ${path.relative(this.config.watchPath, filePath)}`));
            
        } catch (error) {
            console.error(`Error handling file add ${filePath}:`, error.message);
        }
    }

    /**
     * Handle file modification
     */
    async handleFileChange(filePath) {
        try {
            if (!this.isWatchableFile(filePath)) return;
            
            const newContent = await fs.readFile(filePath, 'utf8');
            
            // Skip large files
            if (newContent.length > this.config.maxFileSize) {
                console.log(chalk.yellow(`Skipping large file: ${filePath}`));
                return;
            }
            
            // Get previous content from cache
            const cached = this.fileCache.get(filePath);
            const oldContent = cached ? cached.content : '';
            
            // Analyze changes
            const operations = this.diffEngine.analyzeChanges(filePath, oldContent, newContent);
            
            if (operations.length > 0) {
                // Log operations
                for (const operation of operations) {
                    await logger.logOperation(operation);
                    this.stats.operationsLogged++;
                }
                
                // Update cache
                this.fileCache.set(filePath, {
                    content: newContent,
                    lastModified: Date.now(),
                    size: newContent.length
                });
                
                this.stats.lastActivity = new Date().toISOString();
                console.log(chalk.blue(`✏️  Modified: ${path.relative(this.config.watchPath, filePath)} (${operations.length} operations)`));
            }
            
        } catch (error) {
            console.error(`Error handling file change ${filePath}:`, error.message);
        }
    }

    /**
     * Handle file deletion
     */
    async handleFileDelete(filePath) {
        try {
            if (!this.isWatchableFile(filePath)) return;
            
            // Get content from cache
            const cached = this.fileCache.get(filePath);
            const oldContent = cached ? cached.content : '';
            
            if (oldContent) {
                // Analyze as deletion
                const operations = this.diffEngine.analyzeChanges(filePath, oldContent, null);
                
                // Log operations
                for (const operation of operations) {
                    await logger.logOperation(operation);
                    this.stats.operationsLogged++;
                }
            }
            
            // Remove from cache
            this.fileCache.del(filePath);
            
            this.stats.lastActivity = new Date().toISOString();
            console.log(chalk.red(`🗑️  Deleted: ${path.relative(this.config.watchPath, filePath)}`));
            
        } catch (error) {
            console.error(`Error handling file delete ${filePath}:`, error.message);
        }
    }

    /**
     * Print session statistics
     */
    printSessionStats() {
        if (!this.stats.startTime) return;
        
        const uptime = Date.now() - new Date(this.stats.startTime).getTime();
        const uptimeStr = this.formatUptime(uptime);
        
        console.log(chalk.gray('\n📊 Session Statistics:'));
        console.log(chalk.gray(`   Uptime: ${uptimeStr}`));
        console.log(chalk.gray(`   Files watched: ${this.stats.filesWatched}`));
        console.log(chalk.gray(`   Operations logged: ${this.stats.operationsLogged}`));
        if (this.stats.lastActivity) {
            console.log(chalk.gray(`   Last activity: ${new Date(this.stats.lastActivity).toLocaleTimeString()}`));
        }
    }

    /**
     * Format uptime in human readable format
     */
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
}

module.exports = FileSystemMonitor; 