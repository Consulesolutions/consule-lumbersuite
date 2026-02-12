/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Work Order Consumption Map/Reduce Script
 * Batch processing for work order consumption analytics and reconciliation
 *
 * Key Functions:
 * - Aggregate consumption data by item, location, period
 * - Reconcile tally sheet balances
 * - Generate yield analytics summaries
 * - Identify consumption anomalies
 * - Update consumption reports
 *
 * Scheduled to run nightly or on-demand for reporting
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    'N/search',
    'N/record',
    'N/runtime',
    'N/email',
    'N/format',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_bf_calculator',
    '../lib/cls_logger'
], (
    search,
    record,
    runtime,
    email,
    format,
    Constants,
    SettingsDAO,
    BFCalculator,
    Logger
) => {

    const RECORD_TYPES = Constants.RECORD_TYPES;
    const YIELD_FIELDS = Constants.YIELD_FIELDS;
    const TALLY_FIELDS = Constants.TALLY_FIELDS;
    const TALLY_STATUS = Constants.TALLY_STATUS;
    const PRECISION = Constants.PRECISION;

    const log = Logger.createLogger('WOConsumption.MR');

    /**
     * getInputData - Define the data to be processed
     *
     * @returns {Array|Object|search.Search}
     */
    const getInputData = () => {
        log.audit('getInputData', 'Starting consumption analysis');

        const script = runtime.getCurrentScript();
        const analysisType = script.getParameter({ name: 'custscript_cls_analysis_type' }) || 'DAILY';
        const daysBack = parseInt(script.getParameter({ name: 'custscript_cls_days_back' }), 10) || 1;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        log.debug('getInputData', {
            analysisType,
            startDate: format.format({ value: startDate, type: format.Type.DATE }),
            endDate: format.format({ value: endDate, type: format.Type.DATE })
        });

        // Return search based on analysis type
        switch (analysisType) {
            case 'YIELD':
                return getYieldAnalysisSearch(startDate, endDate);
            case 'TALLY_RECONCILE':
                return getTallyReconcileSearch();
            case 'ANOMALY':
                return getAnomalyDetectionSearch(startDate, endDate);
            case 'DAILY':
            default:
                return getDailyConsumptionSearch(startDate, endDate);
        }
    };

    /**
     * Get search for daily consumption analysis
     */
    const getDailyConsumptionSearch = (startDate, endDate) => {
        return search.create({
            type: RECORD_TYPES.CONSUMPTION_LOG,
            filters: [
                [Constants.CONSUMPTION_FIELDS.TRANSACTION_DATE, 'within', startDate, endDate]
            ],
            columns: [
                search.createColumn({ name: Constants.CONSUMPTION_FIELDS.ITEM, summary: search.Summary.GROUP }),
                search.createColumn({ name: Constants.CONSUMPTION_FIELDS.SUBSIDIARY, summary: search.Summary.GROUP }),
                search.createColumn({ name: Constants.CONSUMPTION_FIELDS.SOURCE_TYPE, summary: search.Summary.GROUP }),
                search.createColumn({ name: Constants.CONSUMPTION_FIELDS.SELLING_UOM, summary: search.Summary.GROUP }),
                search.createColumn({ name: Constants.CONSUMPTION_FIELDS.DISPLAY_QTY, summary: search.Summary.SUM }),
                search.createColumn({ name: Constants.CONSUMPTION_FIELDS.CALCULATED_BF, summary: search.Summary.SUM }),
                search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
            ]
        });
    };

    /**
     * Get search for yield analysis
     */
    const getYieldAnalysisSearch = (startDate, endDate) => {
        return search.create({
            type: RECORD_TYPES.YIELD_REGISTER,
            filters: [
                [YIELD_FIELDS.COMPLETION_DATE, 'within', startDate, endDate]
            ],
            columns: [
                search.createColumn({ name: YIELD_FIELDS.ITEM, summary: search.Summary.GROUP }),
                search.createColumn({ name: YIELD_FIELDS.LOCATION, summary: search.Summary.GROUP }),
                search.createColumn({ name: YIELD_FIELDS.THEORETICAL_BF, summary: search.Summary.SUM }),
                search.createColumn({ name: YIELD_FIELDS.ACTUAL_BF, summary: search.Summary.SUM }),
                search.createColumn({ name: YIELD_FIELDS.WASTE_BF, summary: search.Summary.SUM }),
                search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
            ]
        });
    };

    /**
     * Get search for tally reconciliation
     */
    const getTallyReconcileSearch = () => {
        return search.create({
            type: RECORD_TYPES.TALLY_SHEET,
            filters: [
                [TALLY_FIELDS.STATUS, 'anyof', [TALLY_STATUS.OPEN, TALLY_STATUS.ALLOCATED]]
            ],
            columns: [
                'internalid',
                TALLY_FIELDS.TALLY_NUMBER,
                TALLY_FIELDS.ITEM,
                TALLY_FIELDS.RECEIVED_BF,
                TALLY_FIELDS.REMAINING_BF,
                TALLY_FIELDS.LOCATION,
                TALLY_FIELDS.RECEIVED_DATE
            ]
        });
    };

    /**
     * Get search for anomaly detection
     */
    const getAnomalyDetectionSearch = (startDate, endDate) => {
        return search.create({
            type: RECORD_TYPES.YIELD_REGISTER,
            filters: [
                [YIELD_FIELDS.COMPLETION_DATE, 'within', startDate, endDate],
                'AND',
                // Look for yields outside normal range (below 70% or above 105%)
                ['formulanumeric: CASE WHEN {' + YIELD_FIELDS.THEORETICAL_BF + '} > 0 THEN ({' + YIELD_FIELDS.ACTUAL_BF + '} / {' + YIELD_FIELDS.THEORETICAL_BF + '}) * 100 ELSE 0 END', 'notequalto', 0]
            ],
            columns: [
                'internalid',
                YIELD_FIELDS.WORK_ORDER,
                YIELD_FIELDS.ITEM,
                YIELD_FIELDS.THEORETICAL_BF,
                YIELD_FIELDS.ACTUAL_BF,
                YIELD_FIELDS.WASTE_BF,
                YIELD_FIELDS.RECOVERY_PCT,
                YIELD_FIELDS.LOCATION,
                YIELD_FIELDS.COMPLETION_DATE
            ]
        });
    };

    /**
     * map - Process each search result
     *
     * @param {Object} context
     */
    const map = (context) => {
        const script = runtime.getCurrentScript();
        const analysisType = script.getParameter({ name: 'custscript_cls_analysis_type' }) || 'DAILY';

        try {
            const searchResult = JSON.parse(context.value);

            switch (analysisType) {
                case 'YIELD':
                    processYieldResult(context, searchResult);
                    break;
                case 'TALLY_RECONCILE':
                    processTallyReconcile(context, searchResult);
                    break;
                case 'ANOMALY':
                    processAnomalyResult(context, searchResult);
                    break;
                case 'DAILY':
                default:
                    processConsumptionResult(context, searchResult);
                    break;
            }

        } catch (e) {
            log.error('map', { key: context.key, error: e.message });
        }
    };

    /**
     * Process daily consumption result
     */
    const processConsumptionResult = (context, searchResult) => {
        const values = searchResult.values;

        const itemId = values[Constants.CONSUMPTION_FIELDS.ITEM]?.value ||
                       values['GROUP(' + Constants.CONSUMPTION_FIELDS.ITEM + ')']?.value;
        const subsidiaryId = values[Constants.CONSUMPTION_FIELDS.SUBSIDIARY]?.value ||
                            values['GROUP(' + Constants.CONSUMPTION_FIELDS.SUBSIDIARY + ')']?.value;
        const sourceType = values['GROUP(' + Constants.CONSUMPTION_FIELDS.SOURCE_TYPE + ')'] ||
                          values[Constants.CONSUMPTION_FIELDS.SOURCE_TYPE];
        const sellingUom = values['GROUP(' + Constants.CONSUMPTION_FIELDS.SELLING_UOM + ')'] ||
                          values[Constants.CONSUMPTION_FIELDS.SELLING_UOM];
        const totalDisplayQty = parseFloat(values['SUM(' + Constants.CONSUMPTION_FIELDS.DISPLAY_QTY + ')']) || 0;
        const totalBF = parseFloat(values['SUM(' + Constants.CONSUMPTION_FIELDS.CALCULATED_BF + ')']) || 0;
        const transactionCount = parseInt(values['COUNT(internalid)'], 10) || 0;

        // Group by item for reduction
        const key = `${itemId}|${subsidiaryId}`;

        context.write({
            key: key,
            value: {
                type: 'CONSUMPTION',
                itemId,
                subsidiaryId,
                sourceType,
                sellingUom,
                totalDisplayQty,
                totalBF,
                transactionCount
            }
        });
    };

    /**
     * Process yield analysis result
     */
    const processYieldResult = (context, searchResult) => {
        const values = searchResult.values;

        const itemId = values['GROUP(' + YIELD_FIELDS.ITEM + ')']?.value;
        const locationId = values['GROUP(' + YIELD_FIELDS.LOCATION + ')']?.value;
        const theoreticalBF = parseFloat(values['SUM(' + YIELD_FIELDS.THEORETICAL_BF + ')']) || 0;
        const actualBF = parseFloat(values['SUM(' + YIELD_FIELDS.ACTUAL_BF + ')']) || 0;
        const wasteBF = parseFloat(values['SUM(' + YIELD_FIELDS.WASTE_BF + ')']) || 0;
        const entryCount = parseInt(values['COUNT(internalid)'], 10) || 0;

        const recoveryPct = theoreticalBF > 0 ? (actualBF / theoreticalBF) * 100 : 0;

        const key = `${itemId}|${locationId}`;

        context.write({
            key: key,
            value: {
                type: 'YIELD',
                itemId,
                locationId,
                theoreticalBF,
                actualBF,
                wasteBF,
                recoveryPct,
                entryCount
            }
        });
    };

    /**
     * Process tally reconciliation
     */
    const processTallyReconcile = (context, searchResult) => {
        const tallyId = searchResult.id;
        const values = searchResult.values;

        const tallyNumber = values[TALLY_FIELDS.TALLY_NUMBER];
        const itemId = values[TALLY_FIELDS.ITEM]?.value;
        const receivedBF = parseFloat(values[TALLY_FIELDS.RECEIVED_BF]) || 0;
        const remainingBF = parseFloat(values[TALLY_FIELDS.REMAINING_BF]) || 0;
        const locationId = values[TALLY_FIELDS.LOCATION]?.value;
        const receivedDate = values[TALLY_FIELDS.RECEIVED_DATE];

        // Check for discrepancies - search for allocations
        const allocatedBF = getAllocatedBF(tallyId);
        const consumedBF = getConsumedBF(tallyId);

        const expectedRemaining = receivedBF - consumedBF;
        const discrepancy = remainingBF - expectedRemaining;

        if (Math.abs(discrepancy) > 0.01) {
            context.write({
                key: tallyId,
                value: {
                    type: 'TALLY_DISCREPANCY',
                    tallyId,
                    tallyNumber,
                    itemId,
                    locationId,
                    receivedBF,
                    remainingBF,
                    allocatedBF,
                    consumedBF,
                    expectedRemaining,
                    discrepancy,
                    receivedDate
                }
            });
        }
    };

    /**
     * Get total allocated BF for a tally
     */
    const getAllocatedBF = (tallyId) => {
        let total = 0;

        const allocSearch = search.create({
            type: RECORD_TYPES.TALLY_ALLOCATION,
            filters: [
                [Constants.TALLY_ALLOC_FIELDS.TALLY_SHEET, 'anyof', tallyId],
                'AND',
                [Constants.TALLY_ALLOC_FIELDS.STATUS, 'anyof', Constants.TALLY_ALLOC_STATUS.ALLOCATED]
            ],
            columns: [
                search.createColumn({ name: Constants.TALLY_ALLOC_FIELDS.ALLOCATED_BF, summary: search.Summary.SUM })
            ]
        });

        allocSearch.run().each((result) => {
            total = parseFloat(result.getValue({
                name: Constants.TALLY_ALLOC_FIELDS.ALLOCATED_BF,
                summary: search.Summary.SUM
            })) || 0;
            return false;
        });

        return total;
    };

    /**
     * Get total consumed BF for a tally
     */
    const getConsumedBF = (tallyId) => {
        let total = 0;

        const allocSearch = search.create({
            type: RECORD_TYPES.TALLY_ALLOCATION,
            filters: [
                [Constants.TALLY_ALLOC_FIELDS.TALLY_SHEET, 'anyof', tallyId],
                'AND',
                [Constants.TALLY_ALLOC_FIELDS.STATUS, 'anyof', Constants.TALLY_ALLOC_STATUS.CONSUMED]
            ],
            columns: [
                search.createColumn({ name: Constants.TALLY_ALLOC_FIELDS.CONSUMED_BF, summary: search.Summary.SUM })
            ]
        });

        allocSearch.run().each((result) => {
            total = parseFloat(result.getValue({
                name: Constants.TALLY_ALLOC_FIELDS.CONSUMED_BF,
                summary: search.Summary.SUM
            })) || 0;
            return false;
        });

        return total;
    };

    /**
     * Process anomaly detection result
     */
    const processAnomalyResult = (context, searchResult) => {
        const values = searchResult.values;
        const yieldEntryId = searchResult.id;

        const recoveryPct = parseFloat(values[YIELD_FIELDS.RECOVERY_PCT]) || 0;

        // Flag as anomaly if outside normal range (70% - 105%)
        if (recoveryPct < 70 || recoveryPct > 105) {
            context.write({
                key: yieldEntryId,
                value: {
                    type: 'ANOMALY',
                    yieldEntryId,
                    workOrderId: values[YIELD_FIELDS.WORK_ORDER]?.value,
                    itemId: values[YIELD_FIELDS.ITEM]?.value,
                    theoreticalBF: parseFloat(values[YIELD_FIELDS.THEORETICAL_BF]) || 0,
                    actualBF: parseFloat(values[YIELD_FIELDS.ACTUAL_BF]) || 0,
                    wasteBF: parseFloat(values[YIELD_FIELDS.WASTE_BF]) || 0,
                    recoveryPct,
                    locationId: values[YIELD_FIELDS.LOCATION]?.value,
                    completionDate: values[YIELD_FIELDS.COMPLETION_DATE],
                    severity: recoveryPct < 50 ? 'HIGH' : (recoveryPct < 70 ? 'MEDIUM' : 'LOW')
                }
            });
        }
    };

    /**
     * reduce - Aggregate and store results
     *
     * @param {Object} context
     */
    const reduce = (context) => {
        const key = context.key;
        const values = context.values.map(v => JSON.parse(v));

        try {
            if (values.length === 0) return;

            const firstValue = values[0];
            const type = firstValue.type;

            switch (type) {
                case 'CONSUMPTION':
                    reduceConsumption(key, values);
                    break;
                case 'YIELD':
                    reduceYield(key, values);
                    break;
                case 'TALLY_DISCREPANCY':
                    reduceTallyDiscrepancy(key, values);
                    break;
                case 'ANOMALY':
                    reduceAnomaly(key, values);
                    break;
            }

            context.write({
                key: type,
                value: {
                    processed: values.length,
                    key: key
                }
            });

        } catch (e) {
            log.error('reduce', { key, error: e.message });
        }
    };

    /**
     * Reduce consumption data
     */
    const reduceConsumption = (key, values) => {
        let totalBF = 0;
        let totalDisplayQty = 0;
        let transactionCount = 0;

        values.forEach((v) => {
            totalBF += v.totalBF || 0;
            totalDisplayQty += v.totalDisplayQty || 0;
            transactionCount += v.transactionCount || 0;
        });

        // Log aggregated consumption
        log.audit('reduceConsumption', {
            key,
            totalBF: BFCalculator.roundTo(totalBF, PRECISION.BF),
            totalDisplayQty,
            transactionCount
        });

        // Could create/update summary records here
    };

    /**
     * Reduce yield data
     */
    const reduceYield = (key, values) => {
        let totalTheoretical = 0;
        let totalActual = 0;
        let totalWaste = 0;
        let entryCount = 0;

        values.forEach((v) => {
            totalTheoretical += v.theoreticalBF || 0;
            totalActual += v.actualBF || 0;
            totalWaste += v.wasteBF || 0;
            entryCount += v.entryCount || 0;
        });

        const avgRecovery = totalTheoretical > 0
            ? (totalActual / totalTheoretical) * 100
            : 0;

        log.audit('reduceYield', {
            key,
            totalTheoreticalBF: BFCalculator.roundTo(totalTheoretical, PRECISION.BF),
            totalActualBF: BFCalculator.roundTo(totalActual, PRECISION.BF),
            totalWasteBF: BFCalculator.roundTo(totalWaste, PRECISION.BF),
            avgRecoveryPct: BFCalculator.roundTo(avgRecovery, PRECISION.PERCENTAGE),
            entryCount
        });
    };

    /**
     * Reduce tally discrepancy
     */
    const reduceTallyDiscrepancy = (key, values) => {
        // Report discrepancies
        values.forEach((v) => {
            log.audit('TALLY_DISCREPANCY', {
                tallyId: v.tallyId,
                tallyNumber: v.tallyNumber,
                discrepancy: BFCalculator.roundTo(v.discrepancy, PRECISION.BF),
                remainingBF: v.remainingBF,
                expectedRemaining: v.expectedRemaining
            });
        });
    };

    /**
     * Reduce anomaly data
     */
    const reduceAnomaly = (key, values) => {
        values.forEach((v) => {
            log.audit('YIELD_ANOMALY', {
                severity: v.severity,
                yieldEntryId: v.yieldEntryId,
                workOrderId: v.workOrderId,
                recoveryPct: BFCalculator.roundTo(v.recoveryPct, PRECISION.PERCENTAGE),
                wasteBF: v.wasteBF
            });
        });
    };

    /**
     * summarize - Final summary and notification
     *
     * @param {Object} summary
     */
    const summarize = (summary) => {
        const script = runtime.getCurrentScript();
        const analysisType = script.getParameter({ name: 'custscript_cls_analysis_type' }) || 'DAILY';

        log.audit('summarize', {
            analysisType,
            inputSummary: {
                dateCreated: summary.inputSummary.dateCreated,
                error: summary.inputSummary.error
            },
            usage: summary.usage,
            concurrency: summary.concurrency,
            yields: summary.yields
        });

        // Log any map errors
        let mapErrors = 0;
        summary.mapSummary.errors.iterator().each((key, error) => {
            log.error('Map Error', { key, error });
            mapErrors++;
            return true;
        });

        // Log any reduce errors
        let reduceErrors = 0;
        summary.reduceSummary.errors.iterator().each((key, error) => {
            log.error('Reduce Error', { key, error });
            reduceErrors++;
            return true;
        });

        // Count processed items by type
        const typeCounts = {};
        summary.output.iterator().each((key, value) => {
            const data = JSON.parse(value);
            typeCounts[key] = (typeCounts[key] || 0) + data.processed;
            return true;
        });

        // Final summary
        const summaryData = {
            analysisType,
            typeCounts,
            mapErrors,
            reduceErrors,
            totalUsage: summary.usage,
            completedAt: new Date().toISOString()
        };

        log.audit('ANALYSIS_COMPLETE', summaryData);

        // Send notification if configured and there were issues
        if ((mapErrors > 0 || reduceErrors > 0) && script.getParameter({ name: 'custscript_cls_notify_email' })) {
            sendNotification(summaryData);
        }
    };

    /**
     * Send notification email
     */
    const sendNotification = (summaryData) => {
        try {
            const script = runtime.getCurrentScript();
            const notifyEmail = script.getParameter({ name: 'custscript_cls_notify_email' });

            if (!notifyEmail) return;

            email.send({
                author: runtime.getCurrentUser().id,
                recipients: notifyEmail,
                subject: `LumberSuite ${summaryData.analysisType} Analysis - ${summaryData.mapErrors + summaryData.reduceErrors} Errors`,
                body: `
LumberSuite Consumption Analysis Complete

Analysis Type: ${summaryData.analysisType}
Completed At: ${summaryData.completedAt}

Results:
${JSON.stringify(summaryData.typeCounts, null, 2)}

Errors:
- Map Errors: ${summaryData.mapErrors}
- Reduce Errors: ${summaryData.reduceErrors}

Total Governance Usage: ${summaryData.totalUsage}
                `.trim()
            });

        } catch (e) {
            log.error('sendNotification', e);
        }
    };

    return {
        getInputData,
        map,
        reduce,
        summarize
    };
});
