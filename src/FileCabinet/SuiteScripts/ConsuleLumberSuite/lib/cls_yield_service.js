/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module cls_yield_service
 *
 * Consule LumberSuite™ - Yield and Waste Tracking Service
 * Manages yield register entries and waste analysis
 *
 * Yield tracking calculates:
 * - Theoretical BF (required finished material)
 * - Actual BF consumed
 * - Waste BF
 * - Recovery/Yield percentage
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    'N/record',
    'N/search',
    'N/runtime',
    './cls_constants',
    './cls_settings_dao',
    './cls_bf_calculator'
], (record, search, runtime, Constants, SettingsDAO, BFCalculator) => {

    const RECORD_TYPES = Constants.RECORD_TYPES;
    const YIELD_FIELDS = Constants.YIELD_FIELDS;
    const PRECISION = Constants.PRECISION;

    /**
     * Check if yield tracking is enabled
     * @returns {boolean}
     */
    const isYieldEnabled = () => {
        return SettingsDAO.isYieldEnabled();
    };

    /**
     * Check if waste tracking is enabled
     * @returns {boolean}
     */
    const isWasteEnabled = () => {
        return SettingsDAO.isWasteEnabled();
    };

    /**
     * Create a yield register entry
     *
     * @param {Object} params - Yield entry parameters
     * @param {number} params.workOrderId - Work Order internal ID
     * @param {number} [params.workOrderCompletionId] - WO Completion internal ID
     * @param {number} params.itemId - Item internal ID
     * @param {number} params.theoreticalBF - Expected/theoretical BF
     * @param {number} params.actualBF - Actual BF consumed
     * @param {number} [params.wasteBF] - Waste BF (calculated if not provided)
     * @param {number} [params.recoveryPct] - Recovery percentage (calculated if not provided)
     * @param {number} [params.yieldPct] - Yield percentage used
     * @param {number} [params.wasteReasonId] - Waste reason internal ID
     * @param {string} [params.notes] - Notes
     * @param {number} params.subsidiaryId - Subsidiary internal ID
     * @param {number} params.locationId - Location internal ID
     * @returns {Object} Result with yieldEntryId
     */
    const createYieldEntry = (params) => {
        if (!isYieldEnabled()) {
            return {
                success: false,
                error: 'Yield tracking is not enabled'
            };
        }

        try {
            const {
                workOrderId,
                workOrderCompletionId,
                itemId,
                theoreticalBF,
                actualBF,
                subsidiaryId,
                locationId
            } = params;

            // Calculate derived values if not provided
            const wasteBF = params.wasteBF !== undefined
                ? params.wasteBF
                : Math.max(0, actualBF - theoreticalBF);

            const recoveryPct = params.recoveryPct !== undefined
                ? params.recoveryPct
                : (theoreticalBF > 0 ? (actualBF / theoreticalBF) * 100 : 0);

            const yieldEntry = record.create({
                type: RECORD_TYPES.YIELD_REGISTER,
                isDynamic: true
            });

            // Required fields
            yieldEntry.setValue({ fieldId: YIELD_FIELDS.WORK_ORDER, value: workOrderId });
            yieldEntry.setValue({ fieldId: YIELD_FIELDS.ITEM, value: itemId });
            yieldEntry.setValue({ fieldId: YIELD_FIELDS.THEORETICAL_BF, value: BFCalculator.roundTo(theoreticalBF, PRECISION.BF) });
            yieldEntry.setValue({ fieldId: YIELD_FIELDS.ACTUAL_BF, value: BFCalculator.roundTo(actualBF, PRECISION.BF) });
            yieldEntry.setValue({ fieldId: YIELD_FIELDS.WASTE_BF, value: BFCalculator.roundTo(wasteBF, PRECISION.BF) });
            yieldEntry.setValue({ fieldId: YIELD_FIELDS.RECOVERY_PCT, value: BFCalculator.roundTo(recoveryPct, PRECISION.PERCENTAGE) });
            yieldEntry.setValue({ fieldId: YIELD_FIELDS.COMPLETION_DATE, value: new Date() });
            yieldEntry.setValue({ fieldId: YIELD_FIELDS.SUBSIDIARY, value: subsidiaryId });
            yieldEntry.setValue({ fieldId: YIELD_FIELDS.LOCATION, value: locationId });

            // Optional fields
            if (workOrderCompletionId) {
                yieldEntry.setValue({ fieldId: YIELD_FIELDS.WO_COMPLETION, value: workOrderCompletionId });
            }
            if (params.yieldPct !== undefined) {
                yieldEntry.setValue({ fieldId: YIELD_FIELDS.YIELD_PCT, value: params.yieldPct });
            }
            if (params.wasteReasonId) {
                yieldEntry.setValue({ fieldId: YIELD_FIELDS.WASTE_REASON, value: params.wasteReasonId });
            }
            if (params.notes) {
                yieldEntry.setValue({ fieldId: YIELD_FIELDS.NOTES, value: params.notes });
            }

            // Set operator
            const currentUser = runtime.getCurrentUser();
            yieldEntry.setValue({ fieldId: YIELD_FIELDS.OPERATOR, value: currentUser.id });

            const yieldEntryId = yieldEntry.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });

            log.audit({
                title: 'CLS Yield Service',
                details: `Created yield entry ${yieldEntryId} for WO ${workOrderId}`
            });

            return {
                success: true,
                yieldEntryId,
                theoreticalBF,
                actualBF,
                wasteBF,
                recoveryPct
            };

        } catch (e) {
            log.error({
                title: 'CLS Yield Service - createYieldEntry',
                details: e.message
            });
            return {
                success: false,
                error: e.message
            };
        }
    };

    /**
     * Calculate theoretical BF needed based on finished requirement and yield %
     *
     * Formula: Theoretical = Finished BF / (Yield % / 100)
     * Example: Need 100 BF finished, 95% yield = 100 / 0.95 = 105.26 BF raw
     *
     * @param {number} finishedBF - Required finished board feet
     * @param {number} yieldPct - Expected yield percentage (0-100)
     * @returns {number} Theoretical/required raw BF
     */
    const calculateTheoreticalBF = (finishedBF, yieldPct) => {
        if (!finishedBF || !yieldPct || yieldPct <= 0 || yieldPct > 100) {
            return finishedBF || 0;
        }

        const theoretical = finishedBF / (yieldPct / 100);
        return BFCalculator.roundTo(theoretical, PRECISION.BF);
    };

    /**
     * Calculate expected waste based on theoretical BF and yield %
     *
     * @param {number} theoreticalBF - Theoretical raw BF
     * @param {number} yieldPct - Expected yield percentage
     * @returns {number} Expected waste BF
     */
    const calculateExpectedWaste = (theoreticalBF, yieldPct) => {
        if (!theoreticalBF || !yieldPct || yieldPct <= 0 || yieldPct > 100) {
            return 0;
        }

        const finishedBF = theoreticalBF * (yieldPct / 100);
        const wasteBF = theoreticalBF - finishedBF;
        return BFCalculator.roundTo(wasteBF, PRECISION.BF);
    };

    /**
     * Calculate actual recovery percentage
     *
     * @param {number} outputBF - Actual output BF
     * @param {number} inputBF - Actual input/consumed BF
     * @returns {number} Recovery percentage
     */
    const calculateRecoveryPct = (outputBF, inputBF) => {
        if (!inputBF || inputBF <= 0) {
            return 0;
        }

        const recoveryPct = (outputBF / inputBF) * 100;
        return BFCalculator.roundTo(recoveryPct, PRECISION.PERCENTAGE);
    };

    /**
     * Get yield analysis for a work order
     *
     * @param {number} workOrderId - Work Order internal ID
     * @returns {Object} Yield analysis
     */
    const getWorkOrderYieldAnalysis = (workOrderId) => {
        if (!isYieldEnabled()) {
            return null;
        }

        try {
            const yieldSearch = search.create({
                type: RECORD_TYPES.YIELD_REGISTER,
                filters: [
                    [YIELD_FIELDS.WORK_ORDER, 'anyof', workOrderId]
                ],
                columns: [
                    search.createColumn({ name: YIELD_FIELDS.THEORETICAL_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: YIELD_FIELDS.ACTUAL_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: YIELD_FIELDS.WASTE_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            let analysis = null;

            yieldSearch.run().each((result) => {
                const theoreticalBF = parseFloat(result.getValue({
                    name: YIELD_FIELDS.THEORETICAL_BF,
                    summary: search.Summary.SUM
                })) || 0;

                const actualBF = parseFloat(result.getValue({
                    name: YIELD_FIELDS.ACTUAL_BF,
                    summary: search.Summary.SUM
                })) || 0;

                const wasteBF = parseFloat(result.getValue({
                    name: YIELD_FIELDS.WASTE_BF,
                    summary: search.Summary.SUM
                })) || 0;

                const entryCount = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;

                analysis = {
                    workOrderId,
                    theoreticalBF: BFCalculator.roundTo(theoreticalBF, PRECISION.BF),
                    actualBF: BFCalculator.roundTo(actualBF, PRECISION.BF),
                    wasteBF: BFCalculator.roundTo(wasteBF, PRECISION.BF),
                    recoveryPct: theoreticalBF > 0
                        ? BFCalculator.roundTo((actualBF / theoreticalBF) * 100, PRECISION.PERCENTAGE)
                        : 0,
                    wastePct: actualBF > 0
                        ? BFCalculator.roundTo((wasteBF / actualBF) * 100, PRECISION.PERCENTAGE)
                        : 0,
                    entryCount
                };

                return false;
            });

            return analysis;

        } catch (e) {
            log.error({
                title: 'CLS Yield Service - getWorkOrderYieldAnalysis',
                details: e.message
            });
            return null;
        }
    };

    /**
     * Get yield summary by item
     *
     * @param {Object} params - Filter parameters
     * @param {number} [params.itemId] - Item internal ID
     * @param {Date} [params.fromDate] - Start date
     * @param {Date} [params.toDate] - End date
     * @param {number} [params.locationId] - Location internal ID
     * @param {number} [params.subsidiaryId] - Subsidiary internal ID
     * @returns {Array} Yield summary by item
     */
    const getYieldSummaryByItem = (params = {}) => {
        if (!isYieldEnabled()) {
            return [];
        }

        const filters = [];

        if (params.itemId) {
            filters.push([YIELD_FIELDS.ITEM, 'anyof', params.itemId]);
        }
        if (params.fromDate) {
            if (filters.length > 0) filters.push('AND');
            filters.push([YIELD_FIELDS.COMPLETION_DATE, 'onorafter', params.fromDate]);
        }
        if (params.toDate) {
            if (filters.length > 0) filters.push('AND');
            filters.push([YIELD_FIELDS.COMPLETION_DATE, 'onorbefore', params.toDate]);
        }
        if (params.locationId) {
            if (filters.length > 0) filters.push('AND');
            filters.push([YIELD_FIELDS.LOCATION, 'anyof', params.locationId]);
        }
        if (params.subsidiaryId) {
            if (filters.length > 0) filters.push('AND');
            filters.push([YIELD_FIELDS.SUBSIDIARY, 'anyof', params.subsidiaryId]);
        }

        try {
            const yieldSearch = search.create({
                type: RECORD_TYPES.YIELD_REGISTER,
                filters: filters.length > 0 ? filters : [],
                columns: [
                    search.createColumn({ name: YIELD_FIELDS.ITEM, summary: search.Summary.GROUP }),
                    search.createColumn({ name: YIELD_FIELDS.THEORETICAL_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: YIELD_FIELDS.ACTUAL_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: YIELD_FIELDS.WASTE_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            const results = [];

            yieldSearch.run().each((result) => {
                const itemId = result.getValue({
                    name: YIELD_FIELDS.ITEM,
                    summary: search.Summary.GROUP
                });

                const theoreticalBF = parseFloat(result.getValue({
                    name: YIELD_FIELDS.THEORETICAL_BF,
                    summary: search.Summary.SUM
                })) || 0;

                const actualBF = parseFloat(result.getValue({
                    name: YIELD_FIELDS.ACTUAL_BF,
                    summary: search.Summary.SUM
                })) || 0;

                const wasteBF = parseFloat(result.getValue({
                    name: YIELD_FIELDS.WASTE_BF,
                    summary: search.Summary.SUM
                })) || 0;

                results.push({
                    itemId,
                    itemText: result.getText({
                        name: YIELD_FIELDS.ITEM,
                        summary: search.Summary.GROUP
                    }),
                    theoreticalBF: BFCalculator.roundTo(theoreticalBF, PRECISION.BF),
                    actualBF: BFCalculator.roundTo(actualBF, PRECISION.BF),
                    wasteBF: BFCalculator.roundTo(wasteBF, PRECISION.BF),
                    avgRecoveryPct: theoreticalBF > 0
                        ? BFCalculator.roundTo((actualBF / theoreticalBF) * 100, PRECISION.PERCENTAGE)
                        : 0,
                    entryCount: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }), 10) || 0
                });

                return true;
            });

            return results;

        } catch (e) {
            log.error({
                title: 'CLS Yield Service - getYieldSummaryByItem',
                details: e.message
            });
            return [];
        }
    };

    /**
     * Get waste analysis by reason
     *
     * @param {Object} params - Filter parameters
     * @param {Date} [params.fromDate] - Start date
     * @param {Date} [params.toDate] - End date
     * @param {number} [params.locationId] - Location internal ID
     * @returns {Array} Waste summary by reason
     */
    const getWasteByReason = (params = {}) => {
        if (!isWasteEnabled()) {
            return [];
        }

        const filters = [[YIELD_FIELDS.WASTE_BF, 'greaterthan', 0]];

        if (params.fromDate) {
            filters.push('AND');
            filters.push([YIELD_FIELDS.COMPLETION_DATE, 'onorafter', params.fromDate]);
        }
        if (params.toDate) {
            filters.push('AND');
            filters.push([YIELD_FIELDS.COMPLETION_DATE, 'onorbefore', params.toDate]);
        }
        if (params.locationId) {
            filters.push('AND');
            filters.push([YIELD_FIELDS.LOCATION, 'anyof', params.locationId]);
        }

        try {
            const wasteSearch = search.create({
                type: RECORD_TYPES.YIELD_REGISTER,
                filters: filters,
                columns: [
                    search.createColumn({ name: YIELD_FIELDS.WASTE_REASON, summary: search.Summary.GROUP }),
                    search.createColumn({ name: YIELD_FIELDS.WASTE_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            const results = [];

            wasteSearch.run().each((result) => {
                results.push({
                    wasteReasonId: result.getValue({
                        name: YIELD_FIELDS.WASTE_REASON,
                        summary: search.Summary.GROUP
                    }),
                    wasteReasonText: result.getText({
                        name: YIELD_FIELDS.WASTE_REASON,
                        summary: search.Summary.GROUP
                    }) || 'Unspecified',
                    totalWasteBF: BFCalculator.roundTo(parseFloat(result.getValue({
                        name: YIELD_FIELDS.WASTE_BF,
                        summary: search.Summary.SUM
                    })) || 0, PRECISION.BF),
                    instanceCount: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }), 10) || 0
                });

                return true;
            });

            return results;

        } catch (e) {
            log.error({
                title: 'CLS Yield Service - getWasteByReason',
                details: e.message
            });
            return [];
        }
    };

    /**
     * Get default yield percentage for an item
     *
     * @param {number} itemId - Item internal ID
     * @returns {number} Yield percentage
     */
    const getItemDefaultYield = (itemId) => {
        if (!itemId) {
            return SettingsDAO.getDefaultYield();
        }

        try {
            const lookupResult = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: [Constants.ITEM_FIELDS.DEFAULT_YIELD_PCT]
            });

            const itemYield = parseFloat(lookupResult[Constants.ITEM_FIELDS.DEFAULT_YIELD_PCT]);

            if (!isNaN(itemYield) && itemYield > 0 && itemYield <= 100) {
                return itemYield;
            }

            return SettingsDAO.getDefaultYield();

        } catch (e) {
            return SettingsDAO.getDefaultYield();
        }
    };

    /**
     * Get default waste percentage for an item
     *
     * @param {number} itemId - Item internal ID
     * @returns {number} Waste percentage
     */
    const getItemDefaultWaste = (itemId) => {
        if (!itemId) {
            return SettingsDAO.getDefaultWaste();
        }

        try {
            const lookupResult = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: [Constants.ITEM_FIELDS.DEFAULT_WASTE_PCT]
            });

            const itemWaste = parseFloat(lookupResult[Constants.ITEM_FIELDS.DEFAULT_WASTE_PCT]);

            if (!isNaN(itemWaste) && itemWaste >= 0 && itemWaste <= 100) {
                return itemWaste;
            }

            return SettingsDAO.getDefaultWaste();

        } catch (e) {
            return SettingsDAO.getDefaultWaste();
        }
    };

    /**
     * Get waste reason list for selection
     *
     * @returns {Array} Waste reasons
     */
    const getWasteReasons = () => {
        try {
            const reasonSearch = search.create({
                type: RECORD_TYPES.WASTE_REASON,
                filters: [['isinactive', 'is', 'F']],
                columns: [
                    'internalid',
                    Constants.WASTE_REASON_FIELDS.NAME,
                    Constants.WASTE_REASON_FIELDS.CODE,
                    Constants.WASTE_REASON_FIELDS.IS_RECOVERABLE,
                    Constants.WASTE_REASON_FIELDS.DEFAULT_RECOVERY_PCT
                ]
            });

            const reasons = [];

            reasonSearch.run().each((result) => {
                reasons.push({
                    id: result.id,
                    name: result.getValue(Constants.WASTE_REASON_FIELDS.NAME),
                    code: result.getValue(Constants.WASTE_REASON_FIELDS.CODE),
                    isRecoverable: result.getValue(Constants.WASTE_REASON_FIELDS.IS_RECOVERABLE) === true,
                    defaultRecoveryPct: parseFloat(result.getValue(Constants.WASTE_REASON_FIELDS.DEFAULT_RECOVERY_PCT)) || 0
                });
                return true;
            });

            return reasons;

        } catch (e) {
            return [];
        }
    };

    /**
     * Compare actual yield to expected
     *
     * @param {number} expectedYieldPct - Expected yield percentage
     * @param {number} actualRecoveryPct - Actual recovery percentage
     * @returns {Object} Comparison result
     */
    const compareYield = (expectedYieldPct, actualRecoveryPct) => {
        const variance = actualRecoveryPct - expectedYieldPct;
        const variancePct = expectedYieldPct > 0
            ? (variance / expectedYieldPct) * 100
            : 0;

        return {
            expectedYieldPct: BFCalculator.roundTo(expectedYieldPct, PRECISION.PERCENTAGE),
            actualRecoveryPct: BFCalculator.roundTo(actualRecoveryPct, PRECISION.PERCENTAGE),
            variance: BFCalculator.roundTo(variance, PRECISION.PERCENTAGE),
            variancePct: BFCalculator.roundTo(variancePct, PRECISION.PERCENTAGE),
            status: variance >= 0 ? 'ABOVE_EXPECTED' : (variance >= -5 ? 'WITHIN_TOLERANCE' : 'BELOW_EXPECTED')
        };
    };

    /**
     * Create a yield alert for significant variances
     *
     * @param {Object} params - Alert parameters
     * @param {number} params.yieldRegisterId - Yield register ID
     * @param {string} params.alertType - Type of alert (WARNING, CRITICAL)
     * @param {string} params.message - Alert message
     * @param {number} [params.variancePct] - Variance percentage
     * @returns {Object} Result with success status
     */
    const createAlert = (params) => {
        try {
            const { yieldRegisterId, alertType, message, variancePct } = params;

            // Log the alert
            log.audit({
                title: `CLS Yield Alert - ${alertType}`,
                details: JSON.stringify({
                    yieldRegisterId,
                    alertType,
                    message,
                    variancePct,
                    timestamp: new Date().toISOString()
                })
            });

            // Could be extended to send emails or create task records
            return {
                success: true,
                alertType,
                message
            };

        } catch (e) {
            log.error({
                title: 'CLS Yield Service - createAlert',
                details: e.message
            });
            return {
                success: false,
                error: e.message
            };
        }
    };

    /**
     * Log a yield adjustment
     *
     * @param {Object} params - Adjustment parameters
     * @param {number} params.yieldRegisterId - Yield register ID
     * @param {number} params.previousValue - Previous yield value
     * @param {number} params.newValue - New yield value
     * @param {string} params.reason - Reason for adjustment
     * @param {number} [params.adjustedBy] - User who made adjustment
     * @returns {Object} Result with success status
     */
    const logAdjustment = (params) => {
        try {
            const { yieldRegisterId, previousValue, newValue, reason, adjustedBy } = params;

            // Log the adjustment
            log.audit({
                title: 'CLS Yield Adjustment',
                details: JSON.stringify({
                    yieldRegisterId,
                    previousValue,
                    newValue,
                    change: newValue - previousValue,
                    reason,
                    adjustedBy,
                    timestamp: new Date().toISOString()
                })
            });

            return {
                success: true,
                yieldRegisterId,
                previousValue,
                newValue
            };

        } catch (e) {
            log.error({
                title: 'CLS Yield Service - logAdjustment',
                details: e.message
            });
            return {
                success: false,
                error: e.message
            };
        }
    };

    return {
        // Module checks
        isYieldEnabled,
        isWasteEnabled,

        // Core operations
        createYieldEntry,

        // Calculations
        calculateTheoreticalBF,
        calculateExpectedWaste,
        calculateRecoveryPct,
        compareYield,

        // Queries
        getWorkOrderYieldAnalysis,
        getYieldSummaryByItem,
        getWasteByReason,
        getWasteReasons,

        // Defaults
        getItemDefaultYield,
        getItemDefaultWaste,

        // Alerts and logging
        createAlert,
        logAdjustment
    };
});
