/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Work Order Completion User Event Script
 * Records actual yield and waste when work orders are completed
 *
 * Key Functions:
 * - Record actual BF consumed vs theoretical
 * - Calculate and store yield/waste metrics
 * - Create yield register entries
 * - Update tally sheet consumption
 * - Post waste to custom analytics
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    'N/record',
    'N/search',
    'N/runtime',
    'N/ui/serverWidget',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_bf_calculator',
    '../lib/cls_dimension_resolver',
    '../lib/cls_tally_service',
    '../lib/cls_yield_service',
    '../lib/cls_logger'
], (
    record,
    search,
    runtime,
    serverWidget,
    Constants,
    SettingsDAO,
    BFCalculator,
    DimensionResolver,
    TallyService,
    YieldService,
    Logger
) => {

    const LINE_FIELDS = Constants.LINE_FIELDS;
    const YIELD_FIELDS = Constants.YIELD_FIELDS;
    const PRECISION = Constants.PRECISION;

    const log = Logger.createLogger('WOCompletion.UE');

    /**
     * beforeLoad - Configure form fields
     *
     * @param {Object} context
     */
    const beforeLoad = (context) => {
        const { newRecord, type, form } = context;

        try {
            if (type !== context.UserEventType.CREATE &&
                type !== context.UserEventType.EDIT) {
                return;
            }

            log.debug('beforeLoad', { type, recordId: newRecord.id });

            // Configure form based on modules
            configureForm(form);

            // Add client script
            if (type === context.UserEventType.CREATE || type === context.UserEventType.EDIT) {
                form.clientScriptModulePath = '../workorder/cls_wocompletion_cs.js';
            }

            // Pre-populate fields from Work Order if creating
            if (type === context.UserEventType.CREATE) {
                populateFromWorkOrder(newRecord, form);
            }

        } catch (e) {
            log.error('beforeLoad', e);
        }
    };

    /**
     * Configure form based on enabled modules
     *
     * @param {Form} form
     */
    const configureForm = (form) => {
        try {
            const componentSublist = form.getSublist({ id: 'component' });
            if (!componentSublist) return;

            // Hide waste fields if not enabled
            if (!SettingsDAO.isWasteEnabled()) {
                hideSublistField(componentSublist, LINE_FIELDS.WASTE_BF);
                hideSublistField(componentSublist, LINE_FIELDS.WASTE_REASON);
            }

            // Hide yield fields if not enabled
            if (!SettingsDAO.isYieldEnabled()) {
                hideSublistField(componentSublist, LINE_FIELDS.THEORETICAL_BF);
                hideSublistField(componentSublist, LINE_FIELDS.ACTUAL_BF);
                hideSublistField(componentSublist, LINE_FIELDS.YIELD_PCT);
            }

            // Add custom fields for yield tracking if enabled
            if (SettingsDAO.isYieldEnabled()) {
                addYieldSummaryFields(form);
            }

        } catch (e) {
            log.error('configureForm', e);
        }
    };

    /**
     * Hide a sublist field
     */
    const hideSublistField = (sublist, fieldId) => {
        try {
            const field = sublist.getField({ id: fieldId });
            if (field) {
                field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            }
        } catch (e) {
            // Field may not exist
        }
    };

    /**
     * Add yield summary fields to the form
     */
    const addYieldSummaryFields = (form) => {
        try {
            // Add summary field group
            const yieldGroup = form.addFieldGroup({
                id: 'custpage_yield_summary',
                label: 'Yield Summary'
            });

            form.addField({
                id: 'custpage_total_theoretical_bf',
                type: serverWidget.FieldType.FLOAT,
                label: 'Total Theoretical BF',
                container: 'custpage_yield_summary'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

            form.addField({
                id: 'custpage_total_actual_bf',
                type: serverWidget.FieldType.FLOAT,
                label: 'Total Actual BF',
                container: 'custpage_yield_summary'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

            form.addField({
                id: 'custpage_total_waste_bf',
                type: serverWidget.FieldType.FLOAT,
                label: 'Total Waste BF',
                container: 'custpage_yield_summary'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

            form.addField({
                id: 'custpage_overall_yield_pct',
                type: serverWidget.FieldType.PERCENT,
                label: 'Overall Yield %',
                container: 'custpage_yield_summary'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        } catch (e) {
            log.error('addYieldSummaryFields', e);
        }
    };

    /**
     * Populate fields from the parent Work Order
     */
    const populateFromWorkOrder = (completionRec, form) => {
        try {
            const workOrderId = completionRec.getValue({ fieldId: 'createdfrom' });
            if (!workOrderId) return;

            // Load work order to get yield data
            const woRec = record.load({
                type: record.Type.WORK_ORDER,
                id: workOrderId
            });

            // Calculate totals from WO for summary display
            let totalTheoreticalBF = 0;
            const lineCount = woRec.getLineCount({ sublistId: 'item' });

            for (let i = 0; i < lineCount; i++) {
                const theoreticalBF = parseFloat(woRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.THEORETICAL_BF,
                    line: i
                })) || 0;

                totalTheoreticalBF += theoreticalBF;
            }

            // Set summary field default values
            try {
                completionRec.setValue({
                    fieldId: 'custpage_total_theoretical_bf',
                    value: totalTheoreticalBF
                });
            } catch (e) {
                // Custom page field may not be available
            }

        } catch (e) {
            log.error('populateFromWorkOrder', e);
        }
    };

    /**
     * beforeSubmit - Validate and prepare yield data
     *
     * @param {Object} context
     */
    const beforeSubmit = (context) => {
        const { newRecord, type } = context;

        try {
            if (type !== context.UserEventType.CREATE) {
                return;
            }

            log.debug('beforeSubmit', { type });

            // Process yield calculations if enabled
            if (SettingsDAO.isYieldEnabled() || SettingsDAO.isWasteEnabled()) {
                processYieldCalculations(newRecord);
            }

        } catch (e) {
            log.error('beforeSubmit', e);
        }
    };

    /**
     * Process yield calculations for all component lines
     *
     * @param {Record} completionRec
     */
    const processYieldCalculations = (completionRec) => {
        const workOrderId = completionRec.getValue({ fieldId: 'createdfrom' });
        if (!workOrderId) return;

        try {
            // Load work order to get theoretical values
            const woRec = record.load({
                type: record.Type.WORK_ORDER,
                id: workOrderId
            });

            const componentCount = completionRec.getLineCount({ sublistId: 'component' });

            for (let i = 0; i < componentCount; i++) {
                const itemId = completionRec.getSublistValue({
                    sublistId: 'component',
                    fieldId: 'item',
                    line: i
                });

                if (!itemId) continue;

                // Check if lumber item
                if (!DimensionResolver.isLumberItem(itemId)) continue;

                // Find matching WO line
                const woLineIndex = findWOLineByItem(woRec, itemId);
                if (woLineIndex === -1) continue;

                // Get theoretical BF from work order
                const theoreticalBF = parseFloat(woRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.THEORETICAL_BF,
                    line: woLineIndex
                })) || 0;

                const calculatedBF = parseFloat(woRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.CALCULATED_BF,
                    line: woLineIndex
                })) || 0;

                // Get actual quantity from completion
                const actualQty = parseFloat(completionRec.getSublistValue({
                    sublistId: 'component',
                    fieldId: 'quantity',
                    line: i
                })) || 0;

                // Calculate waste
                const wasteBF = Math.max(0, calculatedBF - actualQty);

                // Set waste field if enabled
                if (SettingsDAO.isWasteEnabled()) {
                    completionRec.setSublistValue({
                        sublistId: 'component',
                        fieldId: LINE_FIELDS.WASTE_BF,
                        line: i,
                        value: BFCalculator.roundTo(wasteBF, PRECISION.BF)
                    });
                }

                // Set actual BF
                completionRec.setSublistValue({
                    sublistId: 'component',
                    fieldId: LINE_FIELDS.ACTUAL_BF,
                    line: i,
                    value: BFCalculator.roundTo(actualQty, PRECISION.BF)
                });

                // Set theoretical BF (copied from WO)
                completionRec.setSublistValue({
                    sublistId: 'component',
                    fieldId: LINE_FIELDS.THEORETICAL_BF,
                    line: i,
                    value: BFCalculator.roundTo(theoreticalBF, PRECISION.BF)
                });
            }

        } catch (e) {
            log.error('processYieldCalculations', e);
        }
    };

    /**
     * Find WO line by item ID
     *
     * @param {Record} woRec
     * @param {number} itemId
     * @returns {number} Line index or -1
     */
    const findWOLineByItem = (woRec, itemId) => {
        const lineCount = woRec.getLineCount({ sublistId: 'item' });

        for (let i = 0; i < lineCount; i++) {
            const lineItemId = woRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                line: i
            });

            if (lineItemId == itemId) {
                return i;
            }
        }

        return -1;
    };

    /**
     * afterSubmit - Create yield register entries and update tallies
     *
     * @param {Object} context
     */
    const afterSubmit = (context) => {
        const { newRecord, type } = context;

        try {
            if (type !== context.UserEventType.CREATE) {
                return;
            }

            const completionId = newRecord.id;
            const workOrderId = newRecord.getValue({ fieldId: 'createdfrom' });

            log.debug('afterSubmit', { completionId, workOrderId });

            // Reload to get calculated values
            const completionRec = record.load({
                type: record.Type.WORK_ORDER_COMPLETION,
                id: completionId
            });

            // Create yield register entries if enabled
            if (SettingsDAO.isYieldEnabled() || SettingsDAO.isWasteEnabled()) {
                processYieldTracking(completionRec, workOrderId);
            }

            // Update tally sheet consumption if enabled
            if (SettingsDAO.isTallyEnabled()) {
                const result = TallyService.markAllocationsConsumed(workOrderId);

                if (result.success) {
                    log.audit('afterSubmit - Tally Consumption', {
                        workOrderId,
                        updatesCount: result.updates?.length || 0,
                        totalConsumed: result.totalConsumed
                    });
                } else {
                    log.error('afterSubmit - Tally Consumption', result.error);
                }
            }

        } catch (e) {
            log.error('afterSubmit', e);
        }
    };

    /**
     * Process yield tracking - create yield register entries
     *
     * @param {Record} completionRec
     * @param {number} workOrderId
     */
    const processYieldTracking = (completionRec, workOrderId) => {
        try {
            // Load work order for reference data
            const woRec = record.load({
                type: record.Type.WORK_ORDER,
                id: workOrderId
            });

            const subsidiaryId = woRec.getValue({ fieldId: 'subsidiary' });
            const locationId = woRec.getValue({ fieldId: 'location' });
            const componentCount = completionRec.getLineCount({ sublistId: 'component' });

            let totalTheoreticalBF = 0;
            let totalActualBF = 0;
            let totalWasteBF = 0;
            let entriesCreated = 0;

            for (let i = 0; i < componentCount; i++) {
                const itemId = completionRec.getSublistValue({
                    sublistId: 'component',
                    fieldId: 'item',
                    line: i
                });

                if (!itemId) continue;

                // Check if lumber item
                if (!DimensionResolver.isLumberItem(itemId)) continue;

                const theoreticalBF = parseFloat(completionRec.getSublistValue({
                    sublistId: 'component',
                    fieldId: LINE_FIELDS.THEORETICAL_BF,
                    line: i
                })) || 0;

                const actualBF = parseFloat(completionRec.getSublistValue({
                    sublistId: 'component',
                    fieldId: LINE_FIELDS.ACTUAL_BF,
                    line: i
                })) || parseFloat(completionRec.getSublistValue({
                    sublistId: 'component',
                    fieldId: 'quantity',
                    line: i
                })) || 0;

                const wasteBF = parseFloat(completionRec.getSublistValue({
                    sublistId: 'component',
                    fieldId: LINE_FIELDS.WASTE_BF,
                    line: i
                })) || 0;

                const wasteReasonId = completionRec.getSublistValue({
                    sublistId: 'component',
                    fieldId: LINE_FIELDS.WASTE_REASON,
                    line: i
                });

                // Get yield percentage used
                const woLineIndex = findWOLineByItem(woRec, itemId);
                const yieldPct = woLineIndex >= 0 ? parseFloat(woRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.YIELD_PCT,
                    line: woLineIndex
                })) || SettingsDAO.getDefaultYield() : SettingsDAO.getDefaultYield();

                // Calculate recovery percentage
                const recoveryPct = theoreticalBF > 0
                    ? (actualBF / theoreticalBF) * 100
                    : 0;

                // Create yield register entry
                const result = YieldService.createYieldEntry({
                    workOrderId: workOrderId,
                    workOrderCompletionId: completionRec.id,
                    itemId: itemId,
                    theoreticalBF: theoreticalBF,
                    actualBF: actualBF,
                    wasteBF: wasteBF,
                    recoveryPct: recoveryPct,
                    yieldPct: yieldPct,
                    wasteReasonId: wasteReasonId,
                    subsidiaryId: subsidiaryId,
                    locationId: locationId
                });

                if (result.success) {
                    entriesCreated++;
                    totalTheoreticalBF += theoreticalBF;
                    totalActualBF += actualBF;
                    totalWasteBF += wasteBF;
                } else {
                    log.error('processYieldTracking - Entry Creation', {
                        line: i,
                        itemId,
                        error: result.error
                    });
                }
            }

            // Log summary
            if (entriesCreated > 0) {
                const overallRecoveryPct = totalTheoreticalBF > 0
                    ? (totalActualBF / totalTheoreticalBF) * 100
                    : 0;

                Logger.logYieldCalculation({
                    workOrderId,
                    completionId: completionRec.id,
                    theoreticalBF: BFCalculator.roundTo(totalTheoreticalBF, PRECISION.BF),
                    actualBF: BFCalculator.roundTo(totalActualBF, PRECISION.BF),
                    wasteBF: BFCalculator.roundTo(totalWasteBF, PRECISION.BF),
                    recoveryPct: BFCalculator.roundTo(overallRecoveryPct, PRECISION.PERCENTAGE),
                    entriesCreated
                });
            }

        } catch (e) {
            log.error('processYieldTracking', e);
        }
    };

    return {
        beforeLoad,
        beforeSubmit,
        afterSubmit
    };
});
