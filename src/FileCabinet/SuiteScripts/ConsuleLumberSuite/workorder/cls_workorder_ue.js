/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Work Order User Event Script
 * Handles BF consumption calculations for lumber manufacturing work orders
 *
 * Key Functions:
 * - Calculate BF consumption from selling UOM
 * - Apply yield percentage to determine raw material requirements
 * - Create tally allocations
 * - Log consumption for analytics
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
    '../lib/cls_conversion_engine',
    '../lib/cls_dimension_resolver',
    '../lib/cls_bf_calculator',
    '../lib/cls_tally_service',
    '../lib/cls_yield_service',
    '../lib/cls_process_service',
    '../lib/cls_validation',
    '../lib/cls_logger'
], (
    record,
    search,
    runtime,
    serverWidget,
    Constants,
    SettingsDAO,
    ConversionEngine,
    DimensionResolver,
    BFCalculator,
    TallyService,
    YieldService,
    ProcessService,
    Validation,
    Logger
) => {

    // Note: Cannot access record.Type during define() - use string literal
    const RECORD_TYPE = 'workorder';
    const ITEM_FIELDS = Constants.ITEM_FIELDS;
    const LINE_FIELDS = Constants.LINE_FIELDS;
    const BODY_FIELDS = Constants.BODY_FIELDS;
    const UOM_CODES = Constants.UOM_CODES;
    const PROCESS_TYPES = Constants.PROCESS_TYPES;
    const ASSEMBLY_TYPES = Constants.ASSEMBLY_TYPES;

    let log = null;
    const getLogger = () => {
        if (!log) log = Logger.createLogger('WorkOrder.UE');
        return log;
    };

    /**
     * beforeLoad - Configure form based on enabled features
     *
     * @param {Object} context
     * @param {Record} context.newRecord
     * @param {string} context.type
     * @param {Form} context.form
     */
    const beforeLoad = (context) => {
        const { newRecord, type, form } = context;

        try {
            // Only process for VIEW and EDIT modes
            if (type !== context.UserEventType.VIEW &&
                type !== context.UserEventType.EDIT &&
                type !== context.UserEventType.CREATE) {
                return;
            }

            getLogger().debug('beforeLoad', { type, recordId: newRecord.id });

            // Configure form fields based on enabled modules
            configureFormFields(form);

            // Add process type group for assembly work orders
            addProcessTypeFields(form, newRecord, type);

            // Add client script for dynamic calculations
            if (type === context.UserEventType.CREATE || type === context.UserEventType.EDIT) {
                addClientScript(form);
            }

            // Add conversion reference button for VIEW mode
            if (type === context.UserEventType.VIEW) {
                addConversionInfoButton(form, newRecord);
                addByproductSummary(form, newRecord);
            }

        } catch (e) {
            getLogger().error('beforeLoad', e);
        }
    };

    /**
     * Add process type fields group to the form
     *
     * @param {Form} form
     * @param {Record} rec
     * @param {string} type - User event type
     */
    const addProcessTypeFields = (form, rec, type) => {
        try {
            // Check if this is an assembly item work order
            const assemblyItemId = rec.getValue({ fieldId: 'assemblyitem' });
            if (!assemblyItemId) return;

            // Add field group for process settings
            const processGroup = form.addFieldGroup({
                id: 'custpage_process_group',
                label: 'Process Settings'
            });

            // Add yield target display field (read-only, calculated from process type)
            if (type === context.UserEventType.VIEW || type === context.UserEventType.EDIT) {
                const processType = rec.getValue({ fieldId: BODY_FIELDS.PROCESS_TYPE });
                if (processType) {
                    const processTarget = ProcessService.getProcessTarget({ processType });

                    if (processTarget.found) {
                        const targetField = form.addField({
                            id: 'custpage_process_target_yield',
                            type: serverWidget.FieldType.PERCENT,
                            label: 'Process Target Yield',
                            container: 'custpage_process_group'
                        });
                        targetField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
                        targetField.defaultValue = processTarget.targetYield;

                        // Show expected losses
                        if (processTarget.kerfLoss > 0 || processTarget.shrinkage > 0 || processTarget.defectRate > 0) {
                            const lossesField = form.addField({
                                id: 'custpage_expected_losses',
                                type: serverWidget.FieldType.TEXT,
                                label: 'Expected Losses',
                                container: 'custpage_process_group'
                            });
                            lossesField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
                            lossesField.defaultValue = `Kerf: ${processTarget.kerfLoss}%, Shrinkage: ${processTarget.shrinkage}%, Defects: ${processTarget.defectRate}%`;
                        }
                    }
                }
            }

        } catch (e) {
            getLogger().error('addProcessTypeFields', e);
        }
    };

    /**
     * Add by-product summary for VIEW mode
     *
     * @param {Form} form
     * @param {Record} rec
     */
    const addByproductSummary = (form, rec) => {
        try {
            const workOrderId = rec.id;
            if (!workOrderId) return;

            const byproductTotals = ProcessService.getByproductTotals(workOrderId);
            if (byproductTotals.count === 0) return;

            const byproductGroup = form.addFieldGroup({
                id: 'custpage_byproduct_group',
                label: 'By-products Summary'
            });

            const countField = form.addField({
                id: 'custpage_byproduct_count',
                type: serverWidget.FieldType.INTEGER,
                label: 'By-product Records',
                container: 'custpage_byproduct_group'
            });
            countField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
            countField.defaultValue = byproductTotals.count;

            const bfField = form.addField({
                id: 'custpage_byproduct_bf',
                type: serverWidget.FieldType.FLOAT,
                label: 'Total By-product BF',
                container: 'custpage_byproduct_group'
            });
            bfField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
            bfField.defaultValue = byproductTotals.totalBF;

        } catch (e) {
            getLogger().error('addByproductSummary', e);
        }
    };

    /**
     * Configure form fields based on enabled features
     *
     * @param {Form} form
     */
    const configureFormFields = (form) => {
        try {
            const sublist = form.getSublist({ id: 'item' });
            if (!sublist) return;

            // Hide tally fields if module disabled
            if (!SettingsDAO.isTallyEnabled()) {
                hideField(form, BODY_FIELDS.LINKED_TALLY);
                hideSublistField(sublist, LINE_FIELDS.TALLY_ALLOCATION);
            }

            // Hide yield fields if module disabled
            if (!SettingsDAO.isYieldEnabled()) {
                hideSublistField(sublist, LINE_FIELDS.THEORETICAL_BF);
                hideSublistField(sublist, LINE_FIELDS.YIELD_PCT);
            }

            // Hide waste fields if module disabled
            if (!SettingsDAO.isWasteEnabled()) {
                hideSublistField(sublist, LINE_FIELDS.WASTE_BF);
                hideSublistField(sublist, LINE_FIELDS.WASTE_REASON);
            }

            // Disable BF override fields unless feature enabled
            if (!SettingsDAO.isWoOverrideAllowed()) {
                disableSublistField(sublist, LINE_FIELDS.CALCULATED_BF);
            }

            // Hide moisture fields if module disabled
            if (!SettingsDAO.isMoistureEnabled()) {
                hideSublistField(sublist, LINE_FIELDS.MOISTURE_PCT);
            }

            // Hide grade fields if module disabled
            if (!SettingsDAO.isGradeEnabled()) {
                hideSublistField(sublist, LINE_FIELDS.GRADE_OVERRIDE);
            }

        } catch (e) {
            getLogger().error('configureFormFields', e);
        }
    };

    /**
     * Hide a body field
     */
    const hideField = (form, fieldId) => {
        try {
            const field = form.getField({ id: fieldId });
            if (field) {
                field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            }
        } catch (e) {
            // Field may not exist
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
     * Disable a sublist field
     */
    const disableSublistField = (sublist, fieldId) => {
        try {
            const field = sublist.getField({ id: fieldId });
            if (field) {
                field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            }
        } catch (e) {
            // Field may not exist
        }
    };

    /**
     * Add client script reference
     */
    const addClientScript = (form) => {
        try {
            form.clientScriptModulePath = '../workorder/cls_workorder_cs.js';
        } catch (e) {
            getLogger().error('addClientScript', e);
        }
    };

    /**
     * Add conversion info button for VIEW mode
     */
    const addConversionInfoButton = (form, rec) => {
        try {
            form.addButton({
                id: 'custpage_cls_conversion_info',
                label: 'View BF Conversions',
                functionName: 'showConversionInfo'
            });
        } catch (e) {
            // Button may already exist
        }
    };

    /**
     * beforeSubmit - Calculate and validate BF consumption
     *
     * @param {Object} context
     * @param {Record} context.newRecord
     * @param {Record} context.oldRecord
     * @param {string} context.type
     */
    const beforeSubmit = (context) => {
        const { newRecord, oldRecord, type } = context;

        try {
            // Only process for CREATE and EDIT
            if (type !== context.UserEventType.CREATE &&
                type !== context.UserEventType.EDIT) {
                return;
            }

            getLogger().debug('beforeSubmit', { type, recordId: newRecord.id });

            // Check if dynamic UOM is enabled
            if (!SettingsDAO.isDynamicUomEnabled()) {
                getLogger().debug('beforeSubmit', 'Dynamic UOM disabled - skipping BF calculations');
                return;
            }

            // Apply process-specific yield target if process type is set
            applyProcessTargetYield(newRecord);

            // Process all item lines
            const result = processWorkOrderLines(newRecord);

            if (!result.success) {
                getLogger().error('beforeSubmit', result.errors);
                // Don't throw error - allow standard NetSuite behavior
            }

            getLogger().audit('beforeSubmit', {
                recordId: newRecord.id,
                totalBF: result.totalBF,
                linesProcessed: result.linesProcessed,
                processType: newRecord.getValue({ fieldId: BODY_FIELDS.PROCESS_TYPE }),
                assemblyType: newRecord.getValue({ fieldId: BODY_FIELDS.ASSEMBLY_TYPE })
            });

        } catch (e) {
            getLogger().error('beforeSubmit', e);
        }
    };

    /**
     * Apply process-specific yield target to the work order
     *
     * @param {Record} rec - Work Order record
     */
    const applyProcessTargetYield = (rec) => {
        try {
            const processType = rec.getValue({ fieldId: BODY_FIELDS.PROCESS_TYPE });
            if (!processType) return;

            // Get species from assembly item if available
            const assemblyItemId = rec.getValue({ fieldId: 'assemblyitem' });
            let speciesId = null;

            if (assemblyItemId) {
                try {
                    const itemLookup = search.lookupFields({
                        type: search.Type.ASSEMBLY_ITEM,
                        id: assemblyItemId,
                        columns: [ITEM_FIELDS.SPECIES]
                    });
                    speciesId = itemLookup[ITEM_FIELDS.SPECIES] ? itemLookup[ITEM_FIELDS.SPECIES][0]?.value : null;
                } catch (e) {
                    // Species field may not exist on item
                }
            }

            // Get process target
            const processTarget = ProcessService.getProcessTarget({
                processType: processType,
                speciesId: speciesId
            });

            if (processTarget.found) {
                // Set target yield on work order
                rec.setValue({
                    fieldId: BODY_FIELDS.TARGET_YIELD,
                    value: processTarget.targetYield
                });

                getLogger().debug('applyProcessTargetYield', {
                    processType,
                    speciesId,
                    targetYield: processTarget.targetYield,
                    kerfLoss: processTarget.kerfLoss,
                    shrinkage: processTarget.shrinkage,
                    defectRate: processTarget.defectRate
                });
            }

        } catch (e) {
            getLogger().error('applyProcessTargetYield', e);
        }
    };

    /**
     * Process all work order lines to calculate BF consumption
     *
     * @param {Record} rec - Work Order record
     * @returns {Object} Processing result
     */
    const processWorkOrderLines = (rec) => {
        const result = {
            success: true,
            totalBF: 0,
            totalTheoreticalBF: 0,
            linesProcessed: 0,
            errors: []
        };

        const lineCount = rec.getLineCount({ sublistId: 'item' });

        for (let i = 0; i < lineCount; i++) {
            try {
                const lineResult = processWorkOrderLine(rec, i);

                if (lineResult.isLumber) {
                    result.totalBF += lineResult.calculatedBF || 0;
                    result.totalTheoreticalBF += lineResult.theoreticalBF || 0;
                    result.linesProcessed++;
                }

                if (!lineResult.success) {
                    result.errors.push(`Line ${i + 1}: ${lineResult.error}`);
                }

            } catch (e) {
                result.errors.push(`Line ${i + 1}: ${e.message}`);
                result.success = false;
            }
        }

        // Set total BF on transaction body
        rec.setValue({
            fieldId: BODY_FIELDS.TOTAL_BF,
            value: BFCalculator.roundTo(result.totalBF, SettingsDAO.getBFPrecision())
        });

        if (SettingsDAO.isYieldEnabled()) {
            rec.setValue({
                fieldId: BODY_FIELDS.TOTAL_THEORETICAL_BF,
                value: BFCalculator.roundTo(result.totalTheoreticalBF, SettingsDAO.getBFPrecision())
            });
        }

        result.success = result.errors.length === 0;
        return result;
    };

    /**
     * Process a single work order line
     *
     * @param {Record} rec - Work Order record
     * @param {number} lineNum - Line number
     * @returns {Object} Line processing result
     */
    const processWorkOrderLine = (rec, lineNum) => {
        const result = {
            success: true,
            isLumber: false,
            calculatedBF: 0,
            theoreticalBF: 0,
            conversionFactor: 0,
            error: null
        };

        // Get item ID
        const itemId = rec.getSublistValue({
            sublistId: 'item',
            fieldId: 'item',
            line: lineNum
        });

        if (!itemId) {
            return result;
        }

        // Check if lumber item
        if (!DimensionResolver.isLumberItem(itemId)) {
            return result;
        }

        result.isLumber = true;

        // Get selling UOM and display quantity
        const sellingUom = rec.getSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.SELLING_UOM,
            line: lineNum
        }) || UOM_CODES.BOARD_FEET;

        const displayQty = parseFloat(rec.getSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DISPLAY_QTY,
            line: lineNum
        })) || parseFloat(rec.getSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            line: lineNum
        })) || 0;

        if (displayQty <= 0) {
            return result;
        }

        // Resolve dimensions (line override → tally → item default)
        const dimensions = DimensionResolver.resolveFromTransactionLine({
            record: rec,
            lineNum: lineNum,
            sublistId: 'item',
            itemId: itemId
        });

        if (!dimensions.isComplete) {
            result.success = false;
            result.error = dimensions.error || 'Incomplete dimensions';
            return result;
        }

        // Convert to board feet
        const conversion = ConversionEngine.convertToBoardFeet({
            sourceUom: sellingUom,
            sourceQty: displayQty,
            thickness: dimensions.thickness,
            width: dimensions.width,
            length: dimensions.length,
            piecesPerBundle: dimensions.piecesPerBundle
        });

        if (!conversion.isValid) {
            result.success = false;
            result.error = conversion.error;
            return result;
        }

        let theoreticalBF = conversion.boardFeet;
        let calculatedBF = theoreticalBF;

        // Apply yield percentage if enabled
        if (SettingsDAO.isYieldEnabled()) {
            const yieldPct = getYieldPercentage(rec, lineNum, itemId);

            // Theoretical = finished goods requirement
            // Calculated = raw material needed (theoretical / yield%)
            theoreticalBF = conversion.boardFeet;
            calculatedBF = YieldService.calculateTheoreticalBF(theoreticalBF, yieldPct);

            // Set yield fields
            rec.setSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.THEORETICAL_BF,
                line: lineNum,
                value: BFCalculator.roundTo(theoreticalBF, SettingsDAO.getBFPrecision())
            });

            rec.setSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.YIELD_PCT,
                line: lineNum,
                value: yieldPct
            });
        }

        // Set calculated BF
        const precision = SettingsDAO.getBFPrecision();
        rec.setSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.CALCULATED_BF,
            line: lineNum,
            value: BFCalculator.roundTo(calculatedBF, precision)
        });

        // Set conversion factor
        rec.setSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.CONVERSION_FACTOR,
            line: lineNum,
            value: BFCalculator.roundTo(conversion.conversionFactor, Constants.PRECISION.FACTOR)
        });

        // Set the actual quantity field to BF for inventory consumption
        // This ensures NetSuite consumes the correct amount of raw material
        rec.setSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            line: lineNum,
            value: BFCalculator.roundTo(calculatedBF, precision)
        });

        result.calculatedBF = calculatedBF;
        result.theoreticalBF = theoreticalBF;
        result.conversionFactor = conversion.conversionFactor;

        return result;
    };

    /**
     * Get yield percentage for a line
     * Priority: Line Override → Process Target → Item Default → System Default
     *
     * @param {Record} rec - Work Order record
     * @param {number} lineNum - Line number
     * @param {number} itemId - Item ID
     * @returns {number} Yield percentage
     */
    const getYieldPercentage = (rec, lineNum, itemId) => {
        // First check for line-level override
        const lineYield = parseFloat(rec.getSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.YIELD_PCT,
            line: lineNum
        }));

        if (!isNaN(lineYield) && lineYield > 0 && lineYield <= 100) {
            return lineYield;
        }

        // Check for work order target yield (from process type)
        const woTargetYield = parseFloat(rec.getValue({ fieldId: BODY_FIELDS.TARGET_YIELD }));
        if (!isNaN(woTargetYield) && woTargetYield > 0 && woTargetYield <= 100) {
            return woTargetYield;
        }

        // Fall back to item default or system default
        return YieldService.getItemDefaultYield(itemId);
    };

    /**
     * afterSubmit - Create tally allocations and consumption log
     *
     * @param {Object} context
     * @param {Record} context.newRecord
     * @param {Record} context.oldRecord
     * @param {string} context.type
     */
    const afterSubmit = (context) => {
        const { newRecord, oldRecord, type } = context;

        try {
            // Only process for CREATE
            if (type !== context.UserEventType.CREATE) {
                return;
            }

            const woId = newRecord.id;
            getLogger().debug('afterSubmit', { type, recordId: woId });

            // Create tally allocations if enabled
            if (SettingsDAO.isTallyEnabled()) {
                const allocationResult = TallyService.createAllocationsForWorkOrder(woId);

                if (!allocationResult.success) {
                    getLogger().error('afterSubmit - Tally Allocation', allocationResult.errors);
                } else {
                    getLogger().audit('afterSubmit - Tally Allocation', {
                        workOrderId: woId,
                        allocationsCreated: allocationResult.allocations.length,
                        totalAllocated: allocationResult.totalAllocated
                    });
                }
            }

            // Log consumption for analytics
            logConsumption(newRecord);

        } catch (e) {
            getLogger().error('afterSubmit', e);
        }
    };

    /**
     * Log consumption to consumption log record
     *
     * @param {Record} rec - Work Order record
     */
    const logConsumption = (rec) => {
        try {
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            const transactionDate = rec.getValue({ fieldId: 'trandate' });
            const subsidiaryId = rec.getValue({ fieldId: 'subsidiary' });

            for (let i = 0; i < lineCount; i++) {
                const itemId = rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });

                if (!DimensionResolver.isLumberItem(itemId)) {
                    continue;
                }

                const consumptionData = {
                    sourceTransactionId: rec.id,
                    sourceType: Constants.SOURCE_TYPES.WORK_ORDER,
                    sourceLine: i,
                    itemId: itemId,
                    sellingUom: rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.SELLING_UOM,
                        line: i
                    }) || UOM_CODES.BOARD_FEET,
                    displayQty: parseFloat(rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.DISPLAY_QTY,
                        line: i
                    })) || 0,
                    calculatedBF: parseFloat(rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.CALCULATED_BF,
                        line: i
                    })) || 0,
                    conversionFactor: parseFloat(rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.CONVERSION_FACTOR,
                        line: i
                    })) || 0,
                    thickness: parseFloat(rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.DIM_THICKNESS,
                        line: i
                    })) || 0,
                    width: parseFloat(rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.DIM_WIDTH,
                        line: i
                    })) || 0,
                    length: parseFloat(rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.DIM_LENGTH,
                        line: i
                    })) || 0,
                    transactionDate: transactionDate,
                    subsidiaryId: subsidiaryId
                };

                createConsumptionLogEntry(consumptionData);
            }

        } catch (e) {
            getLogger().error('logConsumption', e);
        }
    };

    /**
     * Create a consumption log entry
     *
     * @param {Object} data - Consumption data
     */
    const createConsumptionLogEntry = (data) => {
        try {
            const consumptionRec = record.create({
                type: Constants.RECORD_TYPES.CONSUMPTION_LOG,
                isDynamic: true
            });

            const CONS_FIELDS = Constants.CONSUMPTION_FIELDS;

            consumptionRec.setValue({ fieldId: CONS_FIELDS.SOURCE_TRANSACTION, value: data.sourceTransactionId });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.SOURCE_TYPE, value: data.sourceType });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.SOURCE_LINE, value: data.sourceLine });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.ITEM, value: data.itemId });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.SELLING_UOM, value: data.sellingUom });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.DISPLAY_QTY, value: data.displayQty });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.CALCULATED_BF, value: data.calculatedBF });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.CONVERSION_FACTOR, value: data.conversionFactor });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.DIM_THICKNESS, value: data.thickness });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.DIM_WIDTH, value: data.width });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.DIM_LENGTH, value: data.length });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.TRANSACTION_DATE, value: data.transactionDate });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.SUBSIDIARY, value: data.subsidiaryId });
            consumptionRec.setValue({ fieldId: CONS_FIELDS.CREATED_BY, value: runtime.getCurrentUser().id });

            consumptionRec.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });

        } catch (e) {
            getLogger().error('createConsumptionLogEntry', e);
        }
    };

    return {
        beforeLoad,
        beforeSubmit,
        afterSubmit
    };
});
