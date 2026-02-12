/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Work Order Completion Client Script
 * Handles real-time yield and waste calculations during WO completion
 *
 * Key Functions:
 * - Real-time waste calculation as quantities are entered
 * - Yield percentage display and warnings
 * - Waste reason selection assistance
 * - Validation of completion quantities
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    'N/currentRecord',
    'N/search',
    'N/record',
    'N/ui/dialog',
    'N/ui/message',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_bf_calculator',
    '../lib/cls_dimension_resolver',
    '../lib/cls_yield_service',
    '../lib/cls_validation'
], (
    currentRecord,
    search,
    record,
    dialog,
    message,
    Constants,
    SettingsDAO,
    BFCalculator,
    DimensionResolver,
    YieldService,
    Validation
) => {

    const LINE_FIELDS = Constants.LINE_FIELDS;
    const PRECISION = Constants.PRECISION;

    // Work order data cache
    let workOrderData = null;
    let isCalculating = false;

    /**
     * pageInit - Initialize the form
     *
     * @param {Object} context
     */
    const pageInit = (context) => {
        const rec = context.currentRecord;
        const mode = context.mode;

        console.log('CLS WO Completion CS: pageInit', mode);

        try {
            // Load work order data for reference
            const workOrderId = rec.getValue({ fieldId: 'createdfrom' });
            if (workOrderId) {
                loadWorkOrderData(workOrderId);
            }

            // Show yield tracking status
            if (SettingsDAO.isYieldEnabled()) {
                showYieldStatus();
            }

            // Initialize yield summary if creating
            if (mode === 'create') {
                initializeYieldSummary(rec);
            }

        } catch (e) {
            console.error('CLS WO Completion CS: pageInit error', e);
        }
    };

    /**
     * Load work order data for reference during completion
     *
     * @param {number} workOrderId
     */
    const loadWorkOrderData = (workOrderId) => {
        try {
            const woRec = record.load({
                type: record.Type.WORK_ORDER,
                id: workOrderId
            });

            workOrderData = {
                id: workOrderId,
                lines: []
            };

            const lineCount = woRec.getLineCount({ sublistId: 'item' });

            for (let i = 0; i < lineCount; i++) {
                const itemId = woRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });

                workOrderData.lines.push({
                    itemId: itemId,
                    theoreticalBF: parseFloat(woRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.THEORETICAL_BF,
                        line: i
                    })) || 0,
                    calculatedBF: parseFloat(woRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.CALCULATED_BF,
                        line: i
                    })) || 0,
                    yieldPct: parseFloat(woRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.YIELD_PCT,
                        line: i
                    })) || SettingsDAO.getDefaultYield(),
                    isLumber: DimensionResolver.isLumberItem(itemId)
                });
            }

            console.log('CLS WO Completion CS: Work order data loaded', workOrderData);

        } catch (e) {
            console.error('CLS WO Completion CS: loadWorkOrderData error', e);
            workOrderData = null;
        }
    };

    /**
     * Show yield tracking status message
     */
    const showYieldStatus = () => {
        try {
            const msg = message.create({
                title: 'Yield Tracking Active',
                message: 'Waste will be calculated automatically based on actual quantities entered.',
                type: message.Type.INFORMATION
            });
            msg.show({ duration: 5000 });
        } catch (e) {
            // Silent fail
        }
    };

    /**
     * Initialize yield summary display
     *
     * @param {Record} rec
     */
    const initializeYieldSummary = (rec) => {
        if (!workOrderData) return;

        try {
            let totalTheoreticalBF = 0;

            workOrderData.lines.forEach((line) => {
                if (line.isLumber) {
                    totalTheoreticalBF += line.theoreticalBF;
                }
            });

            // Set summary field if available
            try {
                rec.setValue({
                    fieldId: 'custpage_total_theoretical_bf',
                    value: BFCalculator.roundTo(totalTheoreticalBF, PRECISION.BF),
                    ignoreFieldChange: true
                });
            } catch (e) {
                // Custom page field may not exist
            }

        } catch (e) {
            console.error('CLS WO Completion CS: initializeYieldSummary error', e);
        }
    };

    /**
     * fieldChanged - Handle field changes
     *
     * @param {Object} context
     */
    const fieldChanged = (context) => {
        const { currentRecord: rec, sublistId, fieldId, line } = context;

        if (isCalculating) return;

        try {
            // Only process component sublist
            if (sublistId !== 'component') {
                return;
            }

            // Handle quantity change - recalculate waste
            if (fieldId === 'quantity') {
                isCalculating = true;
                handleQuantityChange(rec, line);
                isCalculating = false;
            }

            // Handle waste reason change
            if (fieldId === LINE_FIELDS.WASTE_REASON) {
                handleWasteReasonChange(rec, line);
            }

        } catch (e) {
            console.error('CLS WO Completion CS: fieldChanged error', e);
            isCalculating = false;
        }
    };

    /**
     * Handle quantity field change
     *
     * @param {Record} rec
     * @param {number} line
     */
    const handleQuantityChange = (rec, line) => {
        if (!SettingsDAO.isYieldEnabled() && !SettingsDAO.isWasteEnabled()) {
            return;
        }

        const itemId = rec.getCurrentSublistValue({
            sublistId: 'component',
            fieldId: 'item'
        });

        if (!itemId) return;

        // Check if lumber item
        if (!DimensionResolver.isLumberItem(itemId)) return;

        // Get WO line data for this item
        const woLine = getWOLineForItem(itemId);
        if (!woLine) return;

        const actualQty = parseFloat(rec.getCurrentSublistValue({
            sublistId: 'component',
            fieldId: 'quantity'
        })) || 0;

        // Calculate waste
        const wasteBF = Math.max(0, woLine.calculatedBF - actualQty);

        // Calculate recovery percentage
        const recoveryPct = woLine.theoreticalBF > 0
            ? (actualQty / woLine.theoreticalBF) * 100
            : 0;

        // Set waste field
        if (SettingsDAO.isWasteEnabled()) {
            rec.setCurrentSublistValue({
                sublistId: 'component',
                fieldId: LINE_FIELDS.WASTE_BF,
                value: BFCalculator.roundTo(wasteBF, PRECISION.BF),
                ignoreFieldChange: true
            });
        }

        // Set actual BF
        rec.setCurrentSublistValue({
            sublistId: 'component',
            fieldId: LINE_FIELDS.ACTUAL_BF,
            value: BFCalculator.roundTo(actualQty, PRECISION.BF),
            ignoreFieldChange: true
        });

        // Set theoretical BF (from WO)
        rec.setCurrentSublistValue({
            sublistId: 'component',
            fieldId: LINE_FIELDS.THEORETICAL_BF,
            value: BFCalculator.roundTo(woLine.theoreticalBF, PRECISION.BF),
            ignoreFieldChange: true
        });

        // Show yield warning if below expected
        if (recoveryPct < woLine.yieldPct - 5) {
            showYieldWarning(recoveryPct, woLine.yieldPct);
        }

        // Update summary
        updateYieldSummary(rec);

        console.log('CLS WO Completion CS: Waste calculated', {
            actualQty,
            calculatedBF: woLine.calculatedBF,
            wasteBF,
            recoveryPct
        });
    };

    /**
     * Handle waste reason change
     *
     * @param {Record} rec
     * @param {number} line
     */
    const handleWasteReasonChange = (rec, line) => {
        const wasteReasonId = rec.getCurrentSublistValue({
            sublistId: 'component',
            fieldId: LINE_FIELDS.WASTE_REASON
        });

        if (!wasteReasonId) return;

        // Could show additional info about the waste reason
        // For now, just log
        console.log('CLS WO Completion CS: Waste reason selected', wasteReasonId);
    };

    /**
     * Get WO line data for an item
     *
     * @param {number} itemId
     * @returns {Object|null}
     */
    const getWOLineForItem = (itemId) => {
        if (!workOrderData || !workOrderData.lines) {
            return null;
        }

        return workOrderData.lines.find((line) => line.itemId == itemId) || null;
    };

    /**
     * Show yield warning message
     *
     * @param {number} actualPct
     * @param {number} expectedPct
     */
    const showYieldWarning = (actualPct, expectedPct) => {
        try {
            const msg = message.create({
                title: 'Yield Warning',
                message: `Recovery rate (${BFCalculator.roundTo(actualPct, 1)}%) is below expected yield (${expectedPct}%). Please verify quantities or select a waste reason.`,
                type: message.Type.WARNING
            });
            msg.show({ duration: 5000 });
        } catch (e) {
            // Silent fail
        }
    };

    /**
     * Update yield summary fields
     *
     * @param {Record} rec
     */
    const updateYieldSummary = (rec) => {
        try {
            const lineCount = rec.getLineCount({ sublistId: 'component' });
            let totalTheoreticalBF = 0;
            let totalActualBF = 0;
            let totalWasteBF = 0;

            for (let i = 0; i < lineCount; i++) {
                totalTheoreticalBF += parseFloat(rec.getSublistValue({
                    sublistId: 'component',
                    fieldId: LINE_FIELDS.THEORETICAL_BF,
                    line: i
                })) || 0;

                totalActualBF += parseFloat(rec.getSublistValue({
                    sublistId: 'component',
                    fieldId: LINE_FIELDS.ACTUAL_BF,
                    line: i
                })) || parseFloat(rec.getSublistValue({
                    sublistId: 'component',
                    fieldId: 'quantity',
                    line: i
                })) || 0;

                totalWasteBF += parseFloat(rec.getSublistValue({
                    sublistId: 'component',
                    fieldId: LINE_FIELDS.WASTE_BF,
                    line: i
                })) || 0;
            }

            const overallYieldPct = totalTheoreticalBF > 0
                ? (totalActualBF / totalTheoreticalBF) * 100
                : 0;

            // Update summary fields
            try {
                rec.setValue({
                    fieldId: 'custpage_total_theoretical_bf',
                    value: BFCalculator.roundTo(totalTheoreticalBF, PRECISION.BF),
                    ignoreFieldChange: true
                });

                rec.setValue({
                    fieldId: 'custpage_total_actual_bf',
                    value: BFCalculator.roundTo(totalActualBF, PRECISION.BF),
                    ignoreFieldChange: true
                });

                rec.setValue({
                    fieldId: 'custpage_total_waste_bf',
                    value: BFCalculator.roundTo(totalWasteBF, PRECISION.BF),
                    ignoreFieldChange: true
                });

                rec.setValue({
                    fieldId: 'custpage_overall_yield_pct',
                    value: BFCalculator.roundTo(overallYieldPct, PRECISION.PERCENTAGE),
                    ignoreFieldChange: true
                });
            } catch (e) {
                // Custom page fields may not exist
            }

        } catch (e) {
            console.error('CLS WO Completion CS: updateYieldSummary error', e);
        }
    };

    /**
     * validateLine - Validate line before commit
     *
     * @param {Object} context
     * @returns {boolean}
     */
    const validateLine = (context) => {
        const { currentRecord: rec, sublistId } = context;

        if (sublistId !== 'component') {
            return true;
        }

        try {
            const itemId = rec.getCurrentSublistValue({
                sublistId: 'component',
                fieldId: 'item'
            });

            if (!itemId) return true;

            // Check if lumber item
            if (!DimensionResolver.isLumberItem(itemId)) {
                return true;
            }

            const quantity = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'component',
                fieldId: 'quantity'
            })) || 0;

            // Validate quantity
            const qtyValidation = Validation.validateQuantity(quantity, 'Quantity');
            if (!qtyValidation.isValid) {
                dialog.alert({
                    title: 'Validation Error',
                    message: qtyValidation.errors.join('\n')
                });
                return false;
            }

            // Check for excessive waste
            const woLine = getWOLineForItem(itemId);
            if (woLine && SettingsDAO.isWasteEnabled()) {
                const wasteBF = parseFloat(rec.getCurrentSublistValue({
                    sublistId: 'component',
                    fieldId: LINE_FIELDS.WASTE_BF
                })) || 0;

                // Warn if waste exceeds 50% of calculated
                if (wasteBF > woLine.calculatedBF * 0.5) {
                    const proceed = confirm(
                        `Waste (${BFCalculator.roundTo(wasteBF, 2)} BF) exceeds 50% of planned consumption. ` +
                        `Please verify quantities.\n\nDo you want to continue?`
                    );
                    if (!proceed) {
                        return false;
                    }
                }

                // Require waste reason if significant waste
                if (wasteBF > 0) {
                    const wasteReason = rec.getCurrentSublistValue({
                        sublistId: 'component',
                        fieldId: LINE_FIELDS.WASTE_REASON
                    });

                    if (!wasteReason && wasteBF > woLine.calculatedBF * 0.1) {
                        const proceed = confirm(
                            'Significant waste detected without a waste reason. ' +
                            'It is recommended to select a waste reason for tracking.\n\n' +
                            'Do you want to continue without selecting a reason?'
                        );
                        if (!proceed) {
                            return false;
                        }
                    }
                }
            }

            return true;

        } catch (e) {
            console.error('CLS WO Completion CS: validateLine error', e);
            return true;
        }
    };

    /**
     * saveRecord - Final validation before save
     *
     * @param {Object} context
     * @returns {boolean}
     */
    const saveRecord = (context) => {
        const rec = context.currentRecord;

        try {
            if (!SettingsDAO.isYieldEnabled()) {
                return true;
            }

            // Final yield summary
            const lineCount = rec.getLineCount({ sublistId: 'component' });
            let totalTheoreticalBF = 0;
            let totalActualBF = 0;
            let hasLumberItems = false;

            for (let i = 0; i < lineCount; i++) {
                const itemId = rec.getSublistValue({
                    sublistId: 'component',
                    fieldId: 'item',
                    line: i
                });

                if (itemId && DimensionResolver.isLumberItem(itemId)) {
                    hasLumberItems = true;

                    totalTheoreticalBF += parseFloat(rec.getSublistValue({
                        sublistId: 'component',
                        fieldId: LINE_FIELDS.THEORETICAL_BF,
                        line: i
                    })) || 0;

                    totalActualBF += parseFloat(rec.getSublistValue({
                        sublistId: 'component',
                        fieldId: 'quantity',
                        line: i
                    })) || 0;
                }
            }

            if (hasLumberItems && totalTheoreticalBF > 0) {
                const overallYield = (totalActualBF / totalTheoreticalBF) * 100;

                if (overallYield < 50) {
                    const proceed = confirm(
                        `Overall yield is very low (${BFCalculator.roundTo(overallYield, 1)}%). ` +
                        `Please verify all quantities before saving.\n\n` +
                        `Do you want to save anyway?`
                    );
                    if (!proceed) {
                        return false;
                    }
                }
            }

            return true;

        } catch (e) {
            console.error('CLS WO Completion CS: saveRecord error', e);
            return true;
        }
    };

    /**
     * sublistChanged - Handle sublist changes
     *
     * @param {Object} context
     */
    const sublistChanged = (context) => {
        const { currentRecord: rec, sublistId } = context;

        if (sublistId !== 'component') {
            return;
        }

        // Update yield summary when lines change
        updateYieldSummary(rec);
    };

    return {
        pageInit,
        fieldChanged,
        validateLine,
        sublistChanged,
        saveRecord
    };
});
