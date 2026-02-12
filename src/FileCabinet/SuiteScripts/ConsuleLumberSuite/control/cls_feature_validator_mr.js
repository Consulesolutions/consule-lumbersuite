/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @file cls_feature_validator_mr.js
 * @description Feature Validator Map/Reduce Script for Consule LumberSuite™
 *              Validates system integrity, data consistency, and module health
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module control/cls_feature_validator_mr
 */

define([
    'N/search',
    'N/record',
    'N/runtime',
    'N/email',
    'N/log',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_logger'
], function(
    search,
    record,
    runtime,
    email,
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
    const logger = Logger.createLogger('CLS_FeatureValidator_MR');

    /**
     * Validation check types
     * @type {Object}
     */
    const CHECK_TYPES = {
        SETTINGS: 'settings',
        CUSTOM_RECORDS: 'custom_records',
        TRANSACTIONS: 'transactions',
        DATA_INTEGRITY: 'data_integrity',
        TALLY_CONSISTENCY: 'tally_consistency',
        YIELD_DATA: 'yield_data',
        CONSUMPTION_LOGS: 'consumption_logs'
    };

    /**
     * getInputData Entry Point
     * Defines the validation checks to perform
     *
     * @returns {Array} Array of validation check objects
     */
    function getInputData() {
        logger.audit('getInputData', 'Starting LumberSuite™ Feature Validation');

        const checks = [];

        checks.push({
            type: CHECK_TYPES.SETTINGS,
            id: 'settings_validation',
            name: 'Settings Record Validation'
        });

        checks.push({
            type: CHECK_TYPES.CUSTOM_RECORDS,
            id: 'custom_records_validation',
            name: 'Custom Records Validation'
        });

        if (SettingsDAO.isDynamicUomEnabled()) {
            checks.push({
                type: CHECK_TYPES.TRANSACTIONS,
                id: 'transaction_bf_validation',
                name: 'Transaction BF Data Validation'
            });
        }

        if (SettingsDAO.isTallyEnabled()) {
            checks.push({
                type: CHECK_TYPES.TALLY_CONSISTENCY,
                id: 'tally_consistency_check',
                name: 'Tally Sheet Consistency Check'
            });
        }

        if (SettingsDAO.isYieldEnabled()) {
            checks.push({
                type: CHECK_TYPES.YIELD_DATA,
                id: 'yield_data_validation',
                name: 'Yield Data Validation'
            });
        }

        if (SettingsDAO.isConsumptionLogEnabled()) {
            checks.push({
                type: CHECK_TYPES.CONSUMPTION_LOGS,
                id: 'consumption_log_validation',
                name: 'Consumption Log Validation'
            });
        }

        checks.push({
            type: CHECK_TYPES.DATA_INTEGRITY,
            id: 'data_integrity_check',
            name: 'Data Integrity Check'
        });

        logger.debug('getInputData', `Prepared ${checks.length} validation checks`);

        return checks;
    }

    /**
     * map Entry Point
     * Performs individual validation checks
     *
     * @param {Object} context - Map/Reduce context
     * @param {string} context.key - Key from getInputData
     * @param {string} context.value - Value from getInputData (JSON)
     */
    function map(context) {
        const check = JSON.parse(context.value);

        logger.debug('map', `Running check: ${check.name}`);

        let result = {
            checkId: check.id,
            checkName: check.name,
            checkType: check.type,
            status: 'pass',
            issues: [],
            warnings: [],
            details: {}
        };

        try {
            switch (check.type) {
                case CHECK_TYPES.SETTINGS:
                    result = validateSettings(result);
                    break;

                case CHECK_TYPES.CUSTOM_RECORDS:
                    result = validateCustomRecords(result);
                    break;

                case CHECK_TYPES.TRANSACTIONS:
                    result = validateTransactionBF(result);
                    break;

                case CHECK_TYPES.TALLY_CONSISTENCY:
                    result = validateTallyConsistency(result);
                    break;

                case CHECK_TYPES.YIELD_DATA:
                    result = validateYieldData(result);
                    break;

                case CHECK_TYPES.CONSUMPTION_LOGS:
                    result = validateConsumptionLogs(result);
                    break;

                case CHECK_TYPES.DATA_INTEGRITY:
                    result = validateDataIntegrity(result);
                    break;

                default:
                    result.status = 'skip';
                    result.warnings.push(`Unknown check type: ${check.type}`);
            }
        } catch (e) {
            result.status = 'error';
            result.issues.push(`Check failed: ${e.message}`);
            logger.error('map', `Check ${check.id} failed: ${e.message}`);
        }

        context.write({
            key: check.type,
            value: JSON.stringify(result)
        });
    }

    /**
     * reduce Entry Point
     * Aggregates validation results by type
     *
     * @param {Object} context - Map/Reduce context
     * @param {string} context.key - Check type
     * @param {Array} context.values - Array of result values
     */
    function reduce(context) {
        const checkType = context.key;
        const results = context.values.map(v => JSON.parse(v));

        const aggregated = {
            checkType: checkType,
            totalChecks: results.length,
            passed: 0,
            failed: 0,
            warnings: 0,
            allIssues: [],
            allWarnings: []
        };

        for (const result of results) {
            if (result.status === 'pass') {
                aggregated.passed++;
            } else if (result.status === 'fail' || result.status === 'error') {
                aggregated.failed++;
            }

            if (result.warnings.length > 0) {
                aggregated.warnings++;
            }

            aggregated.allIssues = aggregated.allIssues.concat(result.issues);
            aggregated.allWarnings = aggregated.allWarnings.concat(result.warnings);
        }

        context.write({
            key: 'summary',
            value: JSON.stringify(aggregated)
        });
    }

    /**
     * summarize Entry Point
     * Creates final validation report
     *
     * @param {Object} context - Summarize context
     */
    function summarize(context) {
        const startTime = Date.now();

        logger.audit('summarize', 'Generating validation report');

        const summary = {
            executionTime: 0,
            totalChecks: 0,
            passedChecks: 0,
            failedChecks: 0,
            warningChecks: 0,
            overallStatus: 'pass',
            issues: [],
            warnings: [],
            byType: {}
        };

        context.output.iterator().each(function(key, value) {
            const aggregated = JSON.parse(value);

            summary.totalChecks += aggregated.totalChecks;
            summary.passedChecks += aggregated.passed;
            summary.failedChecks += aggregated.failed;
            summary.warningChecks += aggregated.warnings;
            summary.issues = summary.issues.concat(aggregated.allIssues);
            summary.warnings = summary.warnings.concat(aggregated.allWarnings);
            summary.byType[aggregated.checkType] = aggregated;

            return true;
        });

        if (summary.failedChecks > 0) {
            summary.overallStatus = 'fail';
        } else if (summary.warningChecks > 0) {
            summary.overallStatus = 'warn';
        }

        logMapReduceErrors(context);

        summary.executionTime = Date.now() - startTime;

        createValidationReport(summary);

        if (summary.overallStatus === 'fail') {
            sendAlertEmail(summary);
        }

        logger.audit('summarize', `Validation complete - Status: ${summary.overallStatus}, ` +
            `Passed: ${summary.passedChecks}, Failed: ${summary.failedChecks}, Warnings: ${summary.warningChecks}`);
    }

    // ============ Validation Functions ============

    /**
     * Validates the settings record
     *
     * @param {Object} result - Result object
     * @returns {Object} Updated result
     */
    function validateSettings(result) {
        result.details.settingsRecordExists = false;
        result.details.moduleConfiguration = {};

        try {
            const settingsSearch = search.create({
                type: Constants.RECORD_TYPES.SETTINGS,
                filters: [],
                columns: [
                    'internalid',
                    Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM,
                    Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING,
                    Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING,
                    Constants.SETTINGS_FIELDS.ENABLE_REPACK,
                    Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE,
                    Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION
                ]
            });

            let recordCount = 0;
            settingsSearch.run().each(function(res) {
                recordCount++;
                result.details.settingsRecordExists = true;
                result.details.settingsId = res.id;

                result.details.moduleConfiguration = {
                    dynamicUom: res.getValue({ name: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM }),
                    yieldTracking: res.getValue({ name: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING }),
                    tallyTracking: res.getValue({ name: Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING }),
                    repack: res.getValue({ name: Constants.SETTINGS_FIELDS.ENABLE_REPACK }),
                    defaultYield: res.getValue({ name: Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE }),
                    bfPrecision: res.getValue({ name: Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION })
                };

                return true;
            });

            if (recordCount === 0) {
                result.status = 'fail';
                result.issues.push('No LumberSuite™ Settings record found');
            } else if (recordCount > 1) {
                result.status = 'fail';
                result.issues.push(`Multiple settings records found (${recordCount}). Only 1 is allowed.`);
            }

            const config = result.details.moduleConfiguration;
            if (config.repack && !config.yieldTracking) {
                result.status = 'fail';
                result.issues.push('Repack module enabled without Yield Tracking - invalid configuration');
            }

            const defaultYield = parseFloat(config.defaultYield) || 0;
            if (defaultYield < 0 || defaultYield > 100) {
                result.warnings.push(`Invalid default yield percentage: ${defaultYield}`);
            }

        } catch (e) {
            result.status = 'error';
            result.issues.push(`Settings validation error: ${e.message}`);
        }

        return result;
    }

    /**
     * Validates custom records exist and are accessible
     *
     * @param {Object} result - Result object
     * @returns {Object} Updated result
     */
    function validateCustomRecords(result) {
        result.details.customRecords = {};

        const requiredRecords = [
            { type: Constants.RECORD_TYPES.SETTINGS, name: 'Settings' },
            { type: Constants.RECORD_TYPES.CONSUMPTION_LOG, name: 'Consumption Log' }
        ];

        if (SettingsDAO.isTallyEnabled()) {
            requiredRecords.push({ type: Constants.RECORD_TYPES.TALLY_SHEET, name: 'Tally Sheet' });
            requiredRecords.push({ type: Constants.RECORD_TYPES.TALLY_ALLOCATION, name: 'Tally Allocation' });
        }

        if (SettingsDAO.isYieldEnabled()) {
            requiredRecords.push({ type: Constants.RECORD_TYPES.YIELD_REGISTER, name: 'Yield Register' });
        }

        for (const rec of requiredRecords) {
            try {
                const testSearch = search.create({
                    type: rec.type,
                    filters: [],
                    columns: ['internalid']
                });

                testSearch.run().getRange({ start: 0, end: 1 });

                result.details.customRecords[rec.name] = {
                    exists: true,
                    accessible: true
                };
            } catch (e) {
                result.details.customRecords[rec.name] = {
                    exists: false,
                    accessible: false,
                    error: e.message
                };

                if (e.message.includes('SSS_INVALID_SRCH_RECTYPE')) {
                    result.status = 'fail';
                    result.issues.push(`Custom record type not found: ${rec.name} (${rec.type})`);
                } else {
                    result.warnings.push(`Cannot access ${rec.name}: ${e.message}`);
                }
            }
        }

        return result;
    }

    /**
     * Validates transaction BF data
     *
     * @param {Object} result - Result object
     * @returns {Object} Updated result
     */
    function validateTransactionBF(result) {
        result.details.transactionStats = {
            salesOrders: { total: 0, withBF: 0, missingBF: 0 },
            workOrders: { total: 0, withBF: 0, missingBF: 0 }
        };

        try {
            const soSearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: [
                    ['mainline', 'is', 'F'],
                    'AND',
                    ['item.type', 'anyof', 'InvtPart', 'Assembly'],
                    'AND',
                    ['trandate', 'within', 'lastmonth']
                ],
                columns: [
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: Constants.LINE_FIELDS.LINE_BF, summary: search.Summary.COUNT })
                ]
            });

            soSearch.run().each(function(res) {
                result.details.transactionStats.salesOrders.total = parseInt(res.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;

                result.details.transactionStats.salesOrders.withBF = parseInt(res.getValue({
                    name: Constants.LINE_FIELDS.LINE_BF,
                    summary: search.Summary.COUNT
                })) || 0;

                return false;
            });

            const missingBF = result.details.transactionStats.salesOrders.total -
                              result.details.transactionStats.salesOrders.withBF;

            result.details.transactionStats.salesOrders.missingBF = missingBF;

            if (missingBF > 0) {
                const pctMissing = (missingBF / result.details.transactionStats.salesOrders.total * 100).toFixed(1);
                result.warnings.push(`${missingBF} sales order lines (${pctMissing}%) missing BF data`);
            }

        } catch (e) {
            result.warnings.push(`Transaction BF validation error: ${e.message}`);
        }

        return result;
    }

    /**
     * Validates tally sheet consistency
     *
     * @param {Object} result - Result object
     * @returns {Object} Updated result
     */
    function validateTallyConsistency(result) {
        result.details.tallyStats = {
            total: 0,
            active: 0,
            consumed: 0,
            orphaned: 0
        };

        try {
            const tallySearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_SHEET,
                filters: [],
                columns: [
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.STATUS, summary: search.Summary.GROUP }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.REMAINING_BF, summary: search.Summary.SUM })
                ]
            });

            tallySearch.run().each(function(res) {
                const status = res.getValue({
                    name: Constants.TALLY_FIELDS.STATUS,
                    summary: search.Summary.GROUP
                });

                const count = parseInt(res.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;

                result.details.tallyStats.total += count;

                if (status === Constants.TALLY_STATUS.ACTIVE) {
                    result.details.tallyStats.active = count;
                } else if (status === Constants.TALLY_STATUS.CONSUMED) {
                    result.details.tallyStats.consumed = count;
                }

                return true;
            });

            const negativeSearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_SHEET,
                filters: [
                    [Constants.TALLY_FIELDS.REMAINING_BF, 'lessthan', 0]
                ],
                columns: ['internalid']
            });

            let negativeCount = 0;
            negativeSearch.run().each(function() {
                negativeCount++;
                return true;
            });

            if (negativeCount > 0) {
                result.status = 'fail';
                result.issues.push(`${negativeCount} tally sheets have negative remaining BF`);
            }

        } catch (e) {
            result.warnings.push(`Tally consistency check error: ${e.message}`);
        }

        return result;
    }

    /**
     * Validates yield data
     *
     * @param {Object} result - Result object
     * @returns {Object} Updated result
     */
    function validateYieldData(result) {
        result.details.yieldStats = {
            totalEntries: 0,
            averageYield: 0,
            outliers: 0
        };

        try {
            const yieldSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [],
                columns: [
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.AVG })
                ]
            });

            yieldSearch.run().each(function(res) {
                result.details.yieldStats.totalEntries = parseInt(res.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;

                result.details.yieldStats.averageYield = parseFloat(res.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.AVG
                })) || 0;

                return false;
            });

            const outlierSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [
                    [Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'greaterthan', 100],
                    'OR',
                    [Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'lessthan', 0]
                ],
                columns: ['internalid']
            });

            let outlierCount = 0;
            outlierSearch.run().each(function() {
                outlierCount++;
                return true;
            });

            result.details.yieldStats.outliers = outlierCount;

            if (outlierCount > 0) {
                result.issues.push(`${outlierCount} yield entries have invalid percentages (< 0% or > 100%)`);
                result.status = 'fail';
            }

        } catch (e) {
            result.warnings.push(`Yield data validation error: ${e.message}`);
        }

        return result;
    }

    /**
     * Validates consumption logs
     *
     * @param {Object} result - Result object
     * @returns {Object} Updated result
     */
    function validateConsumptionLogs(result) {
        result.details.consumptionStats = {
            totalLogs: 0,
            totalBF: 0,
            orphanedLogs: 0
        };

        try {
            const logSearch = search.create({
                type: Constants.RECORD_TYPES.CONSUMPTION_LOG,
                filters: [],
                columns: [
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: Constants.CONSUMPTION_FIELDS.TOTAL_BF, summary: search.Summary.SUM })
                ]
            });

            logSearch.run().each(function(res) {
                result.details.consumptionStats.totalLogs = parseInt(res.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;

                result.details.consumptionStats.totalBF = parseFloat(res.getValue({
                    name: Constants.CONSUMPTION_FIELDS.TOTAL_BF,
                    summary: search.Summary.SUM
                })) || 0;

                return false;
            });

        } catch (e) {
            result.warnings.push(`Consumption log validation error: ${e.message}`);
        }

        return result;
    }

    /**
     * Validates overall data integrity
     *
     * @param {Object} result - Result object
     * @returns {Object} Updated result
     */
    function validateDataIntegrity(result) {
        result.details.integrityChecks = {
            orphanedRecords: 0,
            missingReferences: 0,
            dataAnomalies: 0
        };

        try {
            if (SettingsDAO.isTallyEnabled()) {
                const orphanSearch = search.create({
                    type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                    filters: [
                        [Constants.TALLY_FIELDS.TALLY_SHEET, 'isempty', '']
                    ],
                    columns: ['internalid']
                });

                let orphanCount = 0;
                orphanSearch.run().each(function() {
                    orphanCount++;
                    return true;
                });

                result.details.integrityChecks.orphanedRecords = orphanCount;

                if (orphanCount > 0) {
                    result.warnings.push(`${orphanCount} tally allocations have no parent tally sheet`);
                }
            }

        } catch (e) {
            result.warnings.push(`Data integrity check error: ${e.message}`);
        }

        return result;
    }

    // ============ Helper Functions ============

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
            logger.error('summarize', `Map error for key ${key}: ${error}`);
            return true;
        });

        context.reduceSummary.errors.iterator().each(function(key, error) {
            logger.error('summarize', `Reduce error for key ${key}: ${error}`);
            return true;
        });
    }

    /**
     * Creates the validation report record
     *
     * @param {Object} summary - Validation summary
     */
    function createValidationReport(summary) {
        try {
            const reportRec = record.create({
                type: Constants.RECORD_TYPES.VALIDATION_REPORT,
                isDynamic: false
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_validation_date',
                value: new Date()
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_validation_status',
                value: summary.overallStatus
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_validation_summary',
                value: JSON.stringify(summary)
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_total_checks',
                value: summary.totalChecks
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_passed_checks',
                value: summary.passedChecks
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_failed_checks',
                value: summary.failedChecks
            });

            const reportId = reportRec.save();
            logger.audit('createValidationReport', `Created validation report: ${reportId}`);
        } catch (e) {
            logger.error('createValidationReport', `Failed to create report: ${e.message}`);
            logger.audit('createValidationReport', `Summary: ${JSON.stringify(summary)}`);
        }
    }

    /**
     * Sends alert email for failed validations
     *
     * @param {Object} summary - Validation summary
     */
    function sendAlertEmail(summary) {
        try {
            const adminEmail = SettingsDAO.getAdminEmail();
            if (!adminEmail) {
                logger.debug('sendAlertEmail', 'No admin email configured');
                return;
            }

            let issuesList = summary.issues.map(i => `• ${i}`).join('\n');

            const body = `
LumberSuite™ Validation Alert

Status: ${summary.overallStatus.toUpperCase()}
Total Checks: ${summary.totalChecks}
Passed: ${summary.passedChecks}
Failed: ${summary.failedChecks}
Warnings: ${summary.warningChecks}

Issues Found:
${issuesList || 'None'}

Please review the validation report in NetSuite for full details.

--
LumberSuite™ Automated Validation
            `;

            email.send({
                author: runtime.getCurrentUser().id,
                recipients: adminEmail,
                subject: `[LumberSuite™] Validation Alert - ${summary.failedChecks} Issues Found`,
                body: body
            });

            logger.audit('sendAlertEmail', 'Alert email sent');
        } catch (e) {
            logger.error('sendAlertEmail', `Failed to send alert: ${e.message}`);
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});
