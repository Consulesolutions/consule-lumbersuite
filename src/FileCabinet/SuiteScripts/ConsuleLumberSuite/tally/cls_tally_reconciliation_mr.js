/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @file cls_tally_reconciliation_mr.js
 * @description Tally Reconciliation Map/Reduce Script for Consule LumberSuite™
 *              Reconciles tally balances, detects discrepancies, and generates reports
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module tally/cls_tally_reconciliation_mr
 */

define([
    'N/search',
    'N/record',
    'N/runtime',
    'N/email',
    'N/format',
    'N/log',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_logger'
], function(
    search,
    record,
    runtime,
    email,
    format,
    log,
    Constants,
    SettingsDAO,
    Logger
) {
    'use strict';

    /**
     * Module-level logger instance
     * @type {Object}
     */
    const logger = Logger.createLogger('CLS_TallyReconciliation_MR');

    /**
     * Reconciliation check types
     * @type {Object}
     */
    const CHECK_TYPES = {
        BALANCE_VERIFICATION: 'balance_verification',
        ALLOCATION_INTEGRITY: 'allocation_integrity',
        STATUS_VALIDATION: 'status_validation',
        ORPHAN_DETECTION: 'orphan_detection',
        EXPIRY_CHECK: 'expiry_check'
    };

    /**
     * Discrepancy severity levels
     * @type {Object}
     */
    const SEVERITY = {
        INFO: 'info',
        WARNING: 'warning',
        ERROR: 'error',
        CRITICAL: 'critical'
    };

    /**
     * getInputData Entry Point
     * Retrieves all active tally sheets for reconciliation
     *
     * @returns {Object} Search object or array
     */
    function getInputData() {
        logger.audit('getInputData', 'Starting tally reconciliation');

        const scriptParams = runtime.getCurrentScript();
        const checkType = scriptParams.getParameter({ name: 'custscript_cls_check_type' }) || 'all';

        // Get all tallies that need reconciliation
        return search.create({
            type: Constants.RECORD_TYPES.TALLY_SHEET,
            filters: [
                [Constants.TALLY_FIELDS.STATUS, 'noneof', ['void', 'closed']]
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: Constants.TALLY_FIELDS.TALLY_NUMBER }),
                search.createColumn({ name: Constants.TALLY_FIELDS.ITEM }),
                search.createColumn({ name: Constants.TALLY_FIELDS.LOCATION }),
                search.createColumn({ name: Constants.TALLY_FIELDS.ORIGINAL_BF }),
                search.createColumn({ name: Constants.TALLY_FIELDS.REMAINING_BF }),
                search.createColumn({ name: Constants.TALLY_FIELDS.ORIGINAL_PIECES }),
                search.createColumn({ name: Constants.TALLY_FIELDS.REMAINING_PIECES }),
                search.createColumn({ name: Constants.TALLY_FIELDS.STATUS }),
                search.createColumn({ name: Constants.TALLY_FIELDS.TALLY_DATE }),
                search.createColumn({ name: Constants.TALLY_FIELDS.BF_PER_PIECE })
            ]
        });
    }

    /**
     * map Entry Point
     * Performs reconciliation checks on each tally
     *
     * @param {Object} context - Map/Reduce context
     */
    function map(context) {
        const searchResult = JSON.parse(context.value);
        const tallyId = searchResult.id;

        logger.debug('map', `Processing tally: ${tallyId}`);

        const reconciliation = {
            tallyId: tallyId,
            tallyNumber: searchResult.values[Constants.TALLY_FIELDS.TALLY_NUMBER],
            checks: [],
            discrepancies: [],
            corrections: []
        };

        try {
            // Balance verification
            const balanceCheck = verifyBalance(tallyId, searchResult);
            reconciliation.checks.push(balanceCheck);
            if (balanceCheck.discrepancy) {
                reconciliation.discrepancies.push(balanceCheck.discrepancy);
            }

            // Allocation integrity
            const allocationCheck = verifyAllocations(tallyId, searchResult);
            reconciliation.checks.push(allocationCheck);
            if (allocationCheck.discrepancy) {
                reconciliation.discrepancies.push(allocationCheck.discrepancy);
            }

            // Status validation
            const statusCheck = validateStatus(tallyId, searchResult);
            reconciliation.checks.push(statusCheck);
            if (statusCheck.discrepancy) {
                reconciliation.discrepancies.push(statusCheck.discrepancy);
            }

            // Orphan detection
            const orphanCheck = detectOrphans(tallyId);
            reconciliation.checks.push(orphanCheck);
            if (orphanCheck.discrepancy) {
                reconciliation.discrepancies.push(orphanCheck.discrepancy);
            }

            // Apply automatic corrections if enabled
            if (SettingsDAO.isAutoCorrectEnabled() && reconciliation.discrepancies.length > 0) {
                reconciliation.corrections = applyCorrections(tallyId, reconciliation.discrepancies);
            }

        } catch (e) {
            reconciliation.error = e.message;
            logger.error('map', `Error processing tally ${tallyId}: ${e.message}`);
        }

        context.write({
            key: reconciliation.discrepancies.length > 0 ? 'discrepancies' : 'clean',
            value: JSON.stringify(reconciliation)
        });
    }

    /**
     * Verifies tally balance matches allocation records
     *
     * @param {string} tallyId - Tally sheet ID
     * @param {Object} tallyData - Tally search result data
     * @returns {Object} Check result
     */
    function verifyBalance(tallyId, tallyData) {
        const check = {
            type: CHECK_TYPES.BALANCE_VERIFICATION,
            passed: true,
            details: {}
        };

        try {
            const originalBF = parseFloat(tallyData.values[Constants.TALLY_FIELDS.ORIGINAL_BF]) || 0;
            const recordedRemaining = parseFloat(tallyData.values[Constants.TALLY_FIELDS.REMAINING_BF]) || 0;

            // Calculate consumed BF from allocations
            const allocSearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                filters: [
                    [Constants.TALLY_FIELDS.TALLY_SHEET, 'is', tallyId],
                    'AND',
                    [Constants.ALLOCATION_FIELDS.STATUS, 'is', 'consumed']
                ],
                columns: [
                    search.createColumn({
                        name: Constants.ALLOCATION_FIELDS.BOARD_FEET,
                        summary: search.Summary.SUM
                    })
                ]
            });

            let consumedBF = 0;
            allocSearch.run().each(function(result) {
                consumedBF = parseFloat(result.getValue({
                    name: Constants.ALLOCATION_FIELDS.BOARD_FEET,
                    summary: search.Summary.SUM
                })) || 0;
                return false;
            });

            const calculatedRemaining = originalBF - consumedBF;
            const variance = Math.abs(recordedRemaining - calculatedRemaining);

            check.details = {
                originalBF: originalBF,
                recordedRemaining: recordedRemaining,
                consumedBF: consumedBF,
                calculatedRemaining: calculatedRemaining,
                variance: variance
            };

            // Allow small variance for floating point
            if (variance > 0.01) {
                check.passed = false;
                check.discrepancy = {
                    type: 'balance_mismatch',
                    severity: variance > originalBF * 0.05 ? SEVERITY.ERROR : SEVERITY.WARNING,
                    message: `Balance mismatch: Recorded ${recordedRemaining.toFixed(2)} BF, Calculated ${calculatedRemaining.toFixed(2)} BF`,
                    tallyId: tallyId,
                    variance: variance,
                    correction: {
                        field: Constants.TALLY_FIELDS.REMAINING_BF,
                        currentValue: recordedRemaining,
                        correctValue: calculatedRemaining
                    }
                };
            }

        } catch (e) {
            check.passed = false;
            check.error = e.message;
        }

        return check;
    }

    /**
     * Verifies allocation records integrity
     *
     * @param {string} tallyId - Tally sheet ID
     * @param {Object} tallyData - Tally search result data
     * @returns {Object} Check result
     */
    function verifyAllocations(tallyId, tallyData) {
        const check = {
            type: CHECK_TYPES.ALLOCATION_INTEGRITY,
            passed: true,
            details: {}
        };

        try {
            // Check for negative allocations
            const negativeSearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                filters: [
                    [Constants.TALLY_FIELDS.TALLY_SHEET, 'is', tallyId],
                    'AND',
                    [Constants.ALLOCATION_FIELDS.BOARD_FEET, 'lessthan', 0]
                ],
                columns: ['internalid']
            });

            let negativeCount = 0;
            negativeSearch.run().each(function() {
                negativeCount++;
                return true;
            });

            check.details.negativeAllocations = negativeCount;

            if (negativeCount > 0) {
                check.passed = false;
                check.discrepancy = {
                    type: 'negative_allocations',
                    severity: SEVERITY.ERROR,
                    message: `${negativeCount} allocation(s) with negative BF found`,
                    tallyId: tallyId
                };
            }

            // Check for allocations exceeding original
            const bfPerPiece = parseFloat(tallyData.values[Constants.TALLY_FIELDS.BF_PER_PIECE]) || 0;
            const originalPieces = parseFloat(tallyData.values[Constants.TALLY_FIELDS.ORIGINAL_PIECES]) ||
                                   parseFloat(tallyData.values[Constants.TALLY_FIELDS.PIECE_COUNT]) || 0;

            // Get total allocated pieces
            const piecesSearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                filters: [
                    [Constants.TALLY_FIELDS.TALLY_SHEET, 'is', tallyId],
                    'AND',
                    [Constants.ALLOCATION_FIELDS.STATUS, 'anyof', ['allocated', 'consumed']]
                ],
                columns: [
                    search.createColumn({
                        name: Constants.ALLOCATION_FIELDS.QUANTITY,
                        summary: search.Summary.SUM
                    })
                ]
            });

            let allocatedPieces = 0;
            piecesSearch.run().each(function(result) {
                allocatedPieces = parseFloat(result.getValue({
                    name: Constants.ALLOCATION_FIELDS.QUANTITY,
                    summary: search.Summary.SUM
                })) || 0;
                return false;
            });

            check.details.allocatedPieces = allocatedPieces;
            check.details.originalPieces = originalPieces;

            if (allocatedPieces > originalPieces && originalPieces > 0) {
                check.passed = false;
                check.discrepancy = {
                    type: 'over_allocation',
                    severity: SEVERITY.CRITICAL,
                    message: `Over-allocation: ${allocatedPieces} pieces allocated vs ${originalPieces} original`,
                    tallyId: tallyId,
                    overAllocated: allocatedPieces - originalPieces
                };
            }

        } catch (e) {
            check.passed = false;
            check.error = e.message;
        }

        return check;
    }

    /**
     * Validates tally status is correct
     *
     * @param {string} tallyId - Tally sheet ID
     * @param {Object} tallyData - Tally search result data
     * @returns {Object} Check result
     */
    function validateStatus(tallyId, tallyData) {
        const check = {
            type: CHECK_TYPES.STATUS_VALIDATION,
            passed: true,
            details: {}
        };

        try {
            const currentStatus = tallyData.values[Constants.TALLY_FIELDS.STATUS];
            const remainingBF = parseFloat(tallyData.values[Constants.TALLY_FIELDS.REMAINING_BF]) || 0;
            const originalBF = parseFloat(tallyData.values[Constants.TALLY_FIELDS.ORIGINAL_BF]) || 0;

            check.details.currentStatus = currentStatus;
            check.details.remainingBF = remainingBF;
            check.details.originalBF = originalBF;

            let expectedStatus = currentStatus;

            if (remainingBF <= 0 && currentStatus !== 'consumed') {
                expectedStatus = 'consumed';
            } else if (remainingBF > 0 && remainingBF < originalBF && currentStatus === 'active') {
                expectedStatus = 'partial';
            } else if (remainingBF === originalBF && currentStatus === 'partial') {
                expectedStatus = 'active';
            }

            check.details.expectedStatus = expectedStatus;

            if (currentStatus !== expectedStatus) {
                check.passed = false;
                check.discrepancy = {
                    type: 'status_mismatch',
                    severity: SEVERITY.WARNING,
                    message: `Status should be '${expectedStatus}' but is '${currentStatus}'`,
                    tallyId: tallyId,
                    correction: {
                        field: Constants.TALLY_FIELDS.STATUS,
                        currentValue: currentStatus,
                        correctValue: expectedStatus
                    }
                };
            }

        } catch (e) {
            check.passed = false;
            check.error = e.message;
        }

        return check;
    }

    /**
     * Detects orphaned allocation records
     *
     * @param {string} tallyId - Tally sheet ID
     * @returns {Object} Check result
     */
    function detectOrphans(tallyId) {
        const check = {
            type: CHECK_TYPES.ORPHAN_DETECTION,
            passed: true,
            details: {}
        };

        try {
            // Check for allocations with missing transactions
            const orphanSearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                filters: [
                    [Constants.TALLY_FIELDS.TALLY_SHEET, 'is', tallyId],
                    'AND',
                    [Constants.ALLOCATION_FIELDS.SOURCE_TRANSACTION, 'isempty', ''],
                    'AND',
                    [Constants.ALLOCATION_FIELDS.TRANSACTION_TYPE, 'isnot', 'initial']
                ],
                columns: ['internalid']
            });

            let orphanCount = 0;
            orphanSearch.run().each(function() {
                orphanCount++;
                return true;
            });

            check.details.orphanedAllocations = orphanCount;

            if (orphanCount > 0) {
                check.passed = false;
                check.discrepancy = {
                    type: 'orphaned_allocations',
                    severity: SEVERITY.WARNING,
                    message: `${orphanCount} allocation(s) with missing source transactions`,
                    tallyId: tallyId
                };
            }

        } catch (e) {
            check.passed = false;
            check.error = e.message;
        }

        return check;
    }

    /**
     * Applies automatic corrections
     *
     * @param {string} tallyId - Tally sheet ID
     * @param {Array} discrepancies - Discrepancies to correct
     * @returns {Array} Applied corrections
     */
    function applyCorrections(tallyId, discrepancies) {
        const corrections = [];

        for (const discrepancy of discrepancies) {
            if (!discrepancy.correction) {
                continue;
            }

            // Only auto-correct low-severity issues
            if (discrepancy.severity === SEVERITY.CRITICAL || discrepancy.severity === SEVERITY.ERROR) {
                continue;
            }

            try {
                record.submitFields({
                    type: Constants.RECORD_TYPES.TALLY_SHEET,
                    id: tallyId,
                    values: {
                        [discrepancy.correction.field]: discrepancy.correction.correctValue
                    }
                });

                corrections.push({
                    type: discrepancy.type,
                    field: discrepancy.correction.field,
                    oldValue: discrepancy.correction.currentValue,
                    newValue: discrepancy.correction.correctValue,
                    success: true
                });

                logger.audit('applyCorrections',
                    `Corrected tally ${tallyId}: ${discrepancy.correction.field} = ${discrepancy.correction.correctValue}`);

            } catch (e) {
                corrections.push({
                    type: discrepancy.type,
                    field: discrepancy.correction.field,
                    success: false,
                    error: e.message
                });
            }
        }

        return corrections;
    }

    /**
     * reduce Entry Point
     * Aggregates reconciliation results
     *
     * @param {Object} context - Map/Reduce context
     */
    function reduce(context) {
        const category = context.key;
        const results = context.values.map(v => JSON.parse(v));

        const aggregated = {
            category: category,
            count: results.length,
            discrepancies: [],
            corrections: []
        };

        for (const result of results) {
            if (result.discrepancies) {
                aggregated.discrepancies = aggregated.discrepancies.concat(result.discrepancies);
            }
            if (result.corrections) {
                aggregated.corrections = aggregated.corrections.concat(result.corrections);
            }
        }

        context.write({
            key: 'summary',
            value: JSON.stringify(aggregated)
        });
    }

    /**
     * summarize Entry Point
     * Creates reconciliation report
     *
     * @param {Object} context - Summarize context
     */
    function summarize(context) {
        logger.audit('summarize', 'Generating reconciliation report');

        const report = {
            executionDate: new Date().toISOString(),
            totalTallies: 0,
            cleanTallies: 0,
            talliesWithDiscrepancies: 0,
            discrepanciesBySeverity: {
                [SEVERITY.INFO]: 0,
                [SEVERITY.WARNING]: 0,
                [SEVERITY.ERROR]: 0,
                [SEVERITY.CRITICAL]: 0
            },
            discrepanciesByType: {},
            correctionsApplied: 0,
            correctionsFailed: 0,
            details: []
        };

        context.output.iterator().each(function(key, value) {
            const aggregated = JSON.parse(value);

            if (aggregated.category === 'clean') {
                report.cleanTallies += aggregated.count;
            } else if (aggregated.category === 'discrepancies') {
                report.talliesWithDiscrepancies += aggregated.count;

                for (const discrepancy of aggregated.discrepancies) {
                    report.discrepanciesBySeverity[discrepancy.severity]++;

                    if (!report.discrepanciesByType[discrepancy.type]) {
                        report.discrepanciesByType[discrepancy.type] = 0;
                    }
                    report.discrepanciesByType[discrepancy.type]++;

                    report.details.push(discrepancy);
                }

                for (const correction of aggregated.corrections) {
                    if (correction.success) {
                        report.correctionsApplied++;
                    } else {
                        report.correctionsFailed++;
                    }
                }
            }

            return true;
        });

        report.totalTallies = report.cleanTallies + report.talliesWithDiscrepancies;

        // Log errors
        logMapReduceErrors(context);

        // Create report record
        createReconciliationReport(report);

        // Send alert if critical issues found
        if (report.discrepanciesBySeverity[SEVERITY.CRITICAL] > 0 ||
            report.discrepanciesBySeverity[SEVERITY.ERROR] > 0) {
            sendAlertEmail(report);
        }

        logger.audit('summarize',
            `Reconciliation complete - Total: ${report.totalTallies}, Clean: ${report.cleanTallies}, Issues: ${report.talliesWithDiscrepancies}`);
    }

    /**
     * Logs Map/Reduce errors
     *
     * @param {Object} context - Summarize context
     */
    function logMapReduceErrors(context) {
        if (context.inputSummary.error) {
            logger.error('summarize', `Input error: ${context.inputSummary.error}`);
        }

        context.mapSummary.errors.iterator().each(function(key, error) {
            logger.error('summarize', `Map error for ${key}: ${error}`);
            return true;
        });

        context.reduceSummary.errors.iterator().each(function(key, error) {
            logger.error('summarize', `Reduce error for ${key}: ${error}`);
            return true;
        });
    }

    /**
     * Creates reconciliation report record
     *
     * @param {Object} report - Report data
     */
    function createReconciliationReport(report) {
        try {
            const reportRec = record.create({
                type: Constants.RECORD_TYPES.RECONCILIATION_REPORT,
                isDynamic: false
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_recon_date',
                value: new Date()
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_recon_type',
                value: 'tally_reconciliation'
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_recon_total',
                value: report.totalTallies
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_recon_clean',
                value: report.cleanTallies
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_recon_issues',
                value: report.talliesWithDiscrepancies
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_recon_corrections',
                value: report.correctionsApplied
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_recon_data',
                value: JSON.stringify(report)
            });

            const reportId = reportRec.save();
            logger.audit('createReconciliationReport', `Created report: ${reportId}`);

        } catch (e) {
            logger.error('createReconciliationReport', `Error: ${e.message}`);
            logger.audit('createReconciliationReport', `Report data: ${JSON.stringify(report)}`);
        }
    }

    /**
     * Sends alert email for critical issues
     *
     * @param {Object} report - Report data
     */
    function sendAlertEmail(report) {
        try {
            const adminEmail = SettingsDAO.getAdminEmail();
            if (!adminEmail) {
                return;
            }

            let issuesSummary = '';
            for (const [type, count] of Object.entries(report.discrepanciesByType)) {
                issuesSummary += `• ${type}: ${count}\n`;
            }

            const body = `
LumberSuite™ Tally Reconciliation Alert

Reconciliation completed with issues requiring attention.

Summary:
- Total Tallies Checked: ${report.totalTallies}
- Clean Tallies: ${report.cleanTallies}
- Tallies with Issues: ${report.talliesWithDiscrepancies}
- Critical Issues: ${report.discrepanciesBySeverity[SEVERITY.CRITICAL]}
- Errors: ${report.discrepanciesBySeverity[SEVERITY.ERROR]}
- Warnings: ${report.discrepanciesBySeverity[SEVERITY.WARNING]}
- Auto-Corrections Applied: ${report.correctionsApplied}

Issues by Type:
${issuesSummary || 'None'}

Please review the reconciliation report in NetSuite for details.

--
LumberSuite™ Automated Reconciliation
            `;

            email.send({
                author: runtime.getCurrentUser().id,
                recipients: adminEmail,
                subject: `[LumberSuite™] Tally Reconciliation Alert - ${report.talliesWithDiscrepancies} Issues Found`,
                body: body
            });

            logger.audit('sendAlertEmail', 'Reconciliation alert sent');

        } catch (e) {
            logger.error('sendAlertEmail', `Error: ${e.message}`);
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});
