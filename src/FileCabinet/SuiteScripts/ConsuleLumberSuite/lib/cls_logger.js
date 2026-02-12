/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module cls_logger
 *
 * Consule LumberSuite™ - Logging Module
 * Centralized logging utilities with structured formatting and log level control
 *
 * Features:
 * - Consistent log formatting across all modules
 * - Log level filtering
 * - Structured data logging
 * - Performance timing
 * - Error tracking with stack traces
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define(['N/log', 'N/runtime'], (log, runtime) => {

    /**
     * Log levels
     */
    const LOG_LEVEL = {
        DEBUG: 0,
        AUDIT: 1,
        ERROR: 2,
        EMERGENCY: 3
    };

    /**
     * Module prefix for all log entries
     */
    const MODULE_PREFIX = 'CLS';

    /**
     * Current log level (can be adjusted for debugging)
     * In production, set to AUDIT to reduce noise
     */
    let currentLogLevel = LOG_LEVEL.DEBUG;

    /**
     * Set the minimum log level
     * @param {number} level - Log level from LOG_LEVEL enum
     */
    const setLogLevel = (level) => {
        if (level >= LOG_LEVEL.DEBUG && level <= LOG_LEVEL.EMERGENCY) {
            currentLogLevel = level;
        }
    };

    /**
     * Get current log level
     * @returns {number}
     */
    const getLogLevel = () => {
        return currentLogLevel;
    };

    /**
     * Format a log title with module and component prefixes
     * @param {string} component - Component name (e.g., 'ConversionEngine')
     * @param {string} [operation] - Operation name (e.g., 'convertToBF')
     * @returns {string}
     */
    const formatTitle = (component, operation) => {
        if (operation) {
            return `${MODULE_PREFIX} ${component} - ${operation}`;
        }
        return `${MODULE_PREFIX} ${component}`;
    };

    /**
     * Format details object for logging
     * Handles objects, arrays, and primitives
     * @param {*} details - Details to format
     * @returns {string}
     */
    const formatDetails = (details) => {
        if (details === null || details === undefined) {
            return '';
        }

        if (typeof details === 'string') {
            return details;
        }

        if (typeof details === 'object') {
            try {
                return JSON.stringify(details, null, 2);
            } catch (e) {
                return String(details);
            }
        }

        return String(details);
    };

    /**
     * Create a logger instance for a specific component
     * @param {string} component - Component name
     * @returns {Object} Logger instance
     */
    const createLogger = (component) => {
        return {
            /**
             * Log debug message
             * @param {string} operation - Operation name
             * @param {*} details - Details
             */
            debug: (operation, details) => {
                if (currentLogLevel <= LOG_LEVEL.DEBUG) {
                    log.debug({
                        title: formatTitle(component, operation),
                        details: formatDetails(details)
                    });
                }
            },

            /**
             * Log audit message
             * @param {string} operation - Operation name
             * @param {*} details - Details
             */
            audit: (operation, details) => {
                if (currentLogLevel <= LOG_LEVEL.AUDIT) {
                    log.audit({
                        title: formatTitle(component, operation),
                        details: formatDetails(details)
                    });
                }
            },

            /**
             * Log error message
             * @param {string} operation - Operation name
             * @param {*} details - Details (can be Error object)
             */
            error: (operation, details) => {
                if (currentLogLevel <= LOG_LEVEL.ERROR) {
                    let formattedDetails = details;

                    // Handle Error objects
                    if (details instanceof Error) {
                        formattedDetails = {
                            message: details.message,
                            name: details.name,
                            stack: details.stack
                        };
                    }

                    log.error({
                        title: formatTitle(component, operation),
                        details: formatDetails(formattedDetails)
                    });
                }
            },

            /**
             * Log emergency message
             * @param {string} operation - Operation name
             * @param {*} details - Details
             */
            emergency: (operation, details) => {
                log.emergency({
                    title: formatTitle(component, operation),
                    details: formatDetails(details)
                });
            },

            /**
             * Log entry into a function (debug level)
             * @param {string} operation - Operation name
             * @param {Object} [params] - Input parameters
             */
            enter: (operation, params) => {
                if (currentLogLevel <= LOG_LEVEL.DEBUG) {
                    log.debug({
                        title: formatTitle(component, `${operation} [ENTER]`),
                        details: params ? formatDetails({ params }) : 'No parameters'
                    });
                }
            },

            /**
             * Log exit from a function (debug level)
             * @param {string} operation - Operation name
             * @param {*} [result] - Return value
             */
            exit: (operation, result) => {
                if (currentLogLevel <= LOG_LEVEL.DEBUG) {
                    log.debug({
                        title: formatTitle(component, `${operation} [EXIT]`),
                        details: result !== undefined ? formatDetails({ result }) : 'No return value'
                    });
                }
            }
        };
    };

    // ============================================
    // Performance Timing
    // ============================================

    /**
     * Performance timer storage
     */
    const timers = {};

    /**
     * Start a performance timer
     * @param {string} name - Timer name
     */
    const startTimer = (name) => {
        timers[name] = {
            start: Date.now(),
            checkpoints: []
        };
    };

    /**
     * Add a checkpoint to a timer
     * @param {string} name - Timer name
     * @param {string} label - Checkpoint label
     */
    const checkpoint = (name, label) => {
        if (timers[name]) {
            const elapsed = Date.now() - timers[name].start;
            timers[name].checkpoints.push({
                label,
                elapsed
            });
        }
    };

    /**
     * Stop a timer and log the results
     * @param {string} name - Timer name
     * @param {string} [component='Performance'] - Component name for logging
     * @returns {Object} Timing results
     */
    const stopTimer = (name, component = 'Performance') => {
        if (!timers[name]) {
            return null;
        }

        const timer = timers[name];
        const totalElapsed = Date.now() - timer.start;

        const result = {
            name,
            totalMs: totalElapsed,
            checkpoints: timer.checkpoints
        };

        if (currentLogLevel <= LOG_LEVEL.DEBUG) {
            log.debug({
                title: formatTitle(component, `Timer: ${name}`),
                details: formatDetails(result)
            });
        }

        delete timers[name];
        return result;
    };

    // ============================================
    // Structured Logging Helpers
    // ============================================

    /**
     * Log a conversion operation
     * @param {Object} params - Conversion parameters
     * @param {Object} result - Conversion result
     */
    const logConversion = (params, result) => {
        if (currentLogLevel <= LOG_LEVEL.DEBUG) {
            log.debug({
                title: formatTitle('Conversion', 'UOM Conversion'),
                details: formatDetails({
                    input: {
                        sourceUom: params.sourceUom,
                        sourceQty: params.sourceQty,
                        thickness: params.thickness,
                        width: params.width,
                        length: params.length
                    },
                    output: {
                        boardFeet: result.boardFeet,
                        conversionFactor: result.conversionFactor,
                        isValid: result.isValid
                    }
                })
            });
        }
    };

    /**
     * Log a tally operation
     * @param {string} operation - Operation type (create, allocate, consume)
     * @param {Object} details - Operation details
     */
    const logTallyOperation = (operation, details) => {
        log.audit({
            title: formatTitle('Tally', operation),
            details: formatDetails(details)
        });
    };

    /**
     * Log a yield calculation
     * @param {Object} yieldData - Yield data
     */
    const logYieldCalculation = (yieldData) => {
        log.audit({
            title: formatTitle('Yield', 'Calculation'),
            details: formatDetails({
                workOrderId: yieldData.workOrderId,
                theoreticalBF: yieldData.theoreticalBF,
                actualBF: yieldData.actualBF,
                wasteBF: yieldData.wasteBF,
                recoveryPct: yieldData.recoveryPct
            })
        });
    };

    /**
     * Log a validation failure
     * @param {string} context - Validation context
     * @param {Object} validationResult - Validation result
     */
    const logValidationFailure = (context, validationResult) => {
        if (validationResult && !validationResult.isValid) {
            log.error({
                title: formatTitle('Validation', context),
                details: formatDetails({
                    errors: validationResult.errors,
                    warnings: validationResult.warnings
                })
            });
        }
    };

    /**
     * Log a script execution summary
     * @param {string} scriptType - Script type (UE, CS, MR, etc.)
     * @param {string} scriptId - Script ID
     * @param {string} event - Event type
     * @param {Object} summary - Execution summary
     */
    const logScriptExecution = (scriptType, scriptId, event, summary) => {
        const remainingUsage = runtime.getCurrentScript().getRemainingUsage();

        log.audit({
            title: formatTitle(scriptType, `${scriptId} [${event}]`),
            details: formatDetails({
                ...summary,
                remainingUsage
            })
        });
    };

    // ============================================
    // Error Tracking
    // ============================================

    /**
     * Log an exception with full context
     * @param {string} component - Component name
     * @param {string} operation - Operation name
     * @param {Error} error - Error object
     * @param {Object} [context] - Additional context
     */
    const logException = (component, operation, error, context = {}) => {
        log.error({
            title: formatTitle(component, `${operation} [EXCEPTION]`),
            details: formatDetails({
                error: {
                    message: error.message,
                    name: error.name,
                    stack: error.stack
                },
                context,
                user: runtime.getCurrentUser().id,
                script: runtime.getCurrentScript().id,
                remainingUsage: runtime.getCurrentScript().getRemainingUsage()
            })
        });
    };

    /**
     * Create an error reporter for try-catch blocks
     * @param {string} component - Component name
     * @param {string} operation - Operation name
     * @returns {Function} Error handler function
     */
    const createErrorHandler = (component, operation) => {
        return (error, context = {}) => {
            logException(component, operation, error, context);
            return {
                success: false,
                error: error.message
            };
        };
    };

    // ============================================
    // Governance Monitoring
    // ============================================

    /**
     * Log governance usage
     * @param {string} component - Component name
     * @param {string} checkpoint - Checkpoint description
     */
    const logGovernance = (component, checkpoint) => {
        const remaining = runtime.getCurrentScript().getRemainingUsage();

        if (remaining < 100) {
            log.audit({
                title: formatTitle(component, 'Low Governance'),
                details: `Remaining usage at "${checkpoint}": ${remaining}`
            });
        } else if (currentLogLevel <= LOG_LEVEL.DEBUG) {
            log.debug({
                title: formatTitle(component, 'Governance'),
                details: `Remaining usage at "${checkpoint}": ${remaining}`
            });
        }
    };

    /**
     * Check if governance is low and log warning
     * @param {number} [threshold=100] - Warning threshold
     * @returns {boolean} True if governance is low
     */
    const isGovernanceLow = (threshold = 100) => {
        const remaining = runtime.getCurrentScript().getRemainingUsage();
        return remaining < threshold;
    };

    // ============================================
    // Pre-configured Loggers for Common Modules
    // ============================================

    const Loggers = {
        Conversion: createLogger('ConversionEngine'),
        BFCalculator: createLogger('BFCalculator'),
        Settings: createLogger('Settings'),
        Tally: createLogger('TallyService'),
        Yield: createLogger('YieldService'),
        Validation: createLogger('Validation'),
        WorkOrder: createLogger('WorkOrder'),
        Sales: createLogger('Sales'),
        Repack: createLogger('Repack')
    };

    return {
        // Log level control
        LOG_LEVEL,
        setLogLevel,
        getLogLevel,

        // Logger creation
        createLogger,

        // Formatting
        formatTitle,
        formatDetails,

        // Performance
        startTimer,
        checkpoint,
        stopTimer,

        // Structured logging
        logConversion,
        logTallyOperation,
        logYieldCalculation,
        logValidationFailure,
        logScriptExecution,

        // Error tracking
        logException,
        createErrorHandler,

        // Governance
        logGovernance,
        isGovernanceLow,

        // Pre-configured loggers
        Loggers
    };
});
