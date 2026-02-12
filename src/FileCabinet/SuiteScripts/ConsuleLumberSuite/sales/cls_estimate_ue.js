/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Estimate User Event Script
 * Handles BF calculations and UOM conversions for lumber sales estimates
 *
 * Key Functions:
 * - Calculate BF from selling UOM (LF, SF, MBF, MSF, Bundle)
 * - Store conversion factors for pricing
 * - Calculate BF-based costs and margins
 * - Support dimension overrides per line
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
    Validation,
    Logger
) => {

    const LINE_FIELDS = Constants.LINE_FIELDS;
    const BODY_FIELDS = Constants.BODY_FIELDS;
    const ITEM_FIELDS = Constants.ITEM_FIELDS;
    const UOM_CODES = Constants.UOM_CODES;
    const PRECISION = Constants.PRECISION;

    const log = Logger.createLogger('Estimate.UE');

    /**
     * beforeLoad - Configure form based on enabled features
     *
     * @param {Object} context
     */
    const beforeLoad = (context) => {
        const { newRecord, type, form } = context;

        try {
            if (type !== context.UserEventType.VIEW &&
                type !== context.UserEventType.EDIT &&
                type !== context.UserEventType.CREATE) {
                return;
            }

            log.debug('beforeLoad', { type, recordId: newRecord.id });

            // Configure form fields based on settings
            configureFormFields(form);

            // Add client script for dynamic calculations
            if (type === context.UserEventType.CREATE || type === context.UserEventType.EDIT) {
                form.clientScriptModulePath = '../sales/cls_estimate_cs.js';
            }

            // Add conversion summary button for VIEW mode
            if (type === context.UserEventType.VIEW) {
                addConversionSummaryButton(form);
            }

            // Add margin analysis section if enabled
            if (SettingsDAO.isAdvReportingEnabled()) {
                addMarginAnalysisSection(form, newRecord);
            }

        } catch (e) {
            log.error('beforeLoad', e);
        }
    };

    /**
     * Configure form fields based on enabled modules
     *
     * @param {Form} form
     */
    const configureFormFields = (form) => {
        try {
            const itemSublist = form.getSublist({ id: 'item' });
            if (!itemSublist) return;

            // Configure UOM field
            const uomField = itemSublist.getField({ id: LINE_FIELDS.SELLING_UOM });
            if (uomField) {
                uomField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.NORMAL });
            }

            // Hide grade fields if module disabled
            if (!SettingsDAO.isGradeEnabled()) {
                hideSublistField(itemSublist, LINE_FIELDS.GRADE_OVERRIDE);
            }

            // Configure dimension fields based on settings
            if (!SettingsDAO.isDynamicUomEnabled()) {
                // Hide dimension override fields if dynamic UOM is disabled
                hideSublistField(itemSublist, LINE_FIELDS.DIM_THICKNESS);
                hideSublistField(itemSublist, LINE_FIELDS.DIM_WIDTH);
                hideSublistField(itemSublist, LINE_FIELDS.DIM_LENGTH);
            }

            // Add help text to conversion fields
            addFieldHelpText(itemSublist);

        } catch (e) {
            log.error('configureFormFields', e);
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
     * Add help text to fields
     */
    const addFieldHelpText = (sublist) => {
        try {
            const calcBFField = sublist.getField({ id: LINE_FIELDS.CALCULATED_BF });
            if (calcBFField) {
                calcBFField.setHelpText({
                    help: 'Board Feet calculated from selling UOM and dimensions. Formula: (Thickness × Width × Length) / 12'
                });
            }
        } catch (e) {
            // Field may not exist
        }
    };

    /**
     * Add conversion summary button
     */
    const addConversionSummaryButton = (form) => {
        try {
            form.addButton({
                id: 'custpage_cls_view_conversions',
                label: 'View BF Conversions',
                functionName: 'viewConversionSummary'
            });
        } catch (e) {
            // Button may already exist
        }
    };

    /**
     * Add margin analysis section
     */
    const addMarginAnalysisSection = (form, rec) => {
        try {
            const marginGroup = form.addFieldGroup({
                id: 'custpage_margin_analysis',
                label: 'BF Margin Analysis'
            });

            // Calculate margin metrics
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            let totalRevenue = 0;
            let totalBFCost = 0;
            let totalBF = 0;

            for (let i = 0; i < lineCount; i++) {
                const amount = parseFloat(rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'amount',
                    line: i
                })) || 0;

                const calculatedBF = parseFloat(rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.CALCULATED_BF,
                    line: i
                })) || 0;

                const bfCost = parseFloat(rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.EXTENDED_BF_COST,
                    line: i
                })) || 0;

                totalRevenue += amount;
                totalBFCost += bfCost;
                totalBF += calculatedBF;
            }

            const totalMargin = totalRevenue - totalBFCost;
            const marginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
            const pricePerBF = totalBF > 0 ? totalRevenue / totalBF : 0;

            // Add display fields
            form.addField({
                id: 'custpage_total_bf',
                type: serverWidget.FieldType.FLOAT,
                label: 'Total BF',
                container: 'custpage_margin_analysis'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE })
              .defaultValue = BFCalculator.roundTo(totalBF, PRECISION.BF);

            form.addField({
                id: 'custpage_price_per_bf',
                type: serverWidget.FieldType.CURRENCY,
                label: 'Avg Price/BF',
                container: 'custpage_margin_analysis'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE })
              .defaultValue = BFCalculator.roundTo(pricePerBF, PRECISION.CURRENCY);

            form.addField({
                id: 'custpage_bf_margin',
                type: serverWidget.FieldType.CURRENCY,
                label: 'BF Margin',
                container: 'custpage_margin_analysis'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE })
              .defaultValue = BFCalculator.roundTo(totalMargin, PRECISION.CURRENCY);

            form.addField({
                id: 'custpage_margin_pct',
                type: serverWidget.FieldType.PERCENT,
                label: 'Margin %',
                container: 'custpage_margin_analysis'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE })
              .defaultValue = BFCalculator.roundTo(marginPct, PRECISION.PERCENTAGE);

        } catch (e) {
            log.error('addMarginAnalysisSection', e);
        }
    };

    /**
     * beforeSubmit - Calculate BF and validate lines
     *
     * @param {Object} context
     */
    const beforeSubmit = (context) => {
        const { newRecord, oldRecord, type } = context;

        try {
            if (type !== context.UserEventType.CREATE &&
                type !== context.UserEventType.EDIT) {
                return;
            }

            log.debug('beforeSubmit', { type, recordId: newRecord.id });

            // Check if dynamic UOM is enabled
            if (!SettingsDAO.isDynamicUomEnabled()) {
                log.debug('beforeSubmit', 'Dynamic UOM disabled - skipping BF calculations');
                return;
            }

            // Check if conversion is locked
            const isLocked = newRecord.getValue({ fieldId: BODY_FIELDS.CONVERSION_LOCKED });
            if (isLocked) {
                log.debug('beforeSubmit', 'Conversions locked - skipping recalculation');
                return;
            }

            // Process all item lines
            const result = processEstimateLines(newRecord);

            if (!result.success) {
                log.error('beforeSubmit', result.errors);
            }

            log.audit('beforeSubmit', {
                recordId: newRecord.id,
                totalBF: result.totalBF,
                linesProcessed: result.linesProcessed
            });

        } catch (e) {
            log.error('beforeSubmit', e);
        }
    };

    /**
     * Process all estimate lines to calculate BF
     *
     * @param {Record} rec
     * @returns {Object} Processing result
     */
    const processEstimateLines = (rec) => {
        const result = {
            success: true,
            totalBF: 0,
            totalBFCost: 0,
            linesProcessed: 0,
            errors: []
        };

        const lineCount = rec.getLineCount({ sublistId: 'item' });

        for (let i = 0; i < lineCount; i++) {
            try {
                const lineResult = processEstimateLine(rec, i);

                if (lineResult.isLumber) {
                    result.totalBF += lineResult.calculatedBF || 0;
                    result.totalBFCost += lineResult.extendedBFCost || 0;
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

        result.success = result.errors.length === 0;
        return result;
    };

    /**
     * Process a single estimate line
     *
     * @param {Record} rec
     * @param {number} lineNum
     * @returns {Object} Line processing result
     */
    const processEstimateLine = (rec, lineNum) => {
        const result = {
            success: true,
            isLumber: false,
            calculatedBF: 0,
            conversionFactor: 0,
            bfUnitCost: 0,
            extendedBFCost: 0,
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

        // Resolve dimensions
        const dimensions = DimensionResolver.resolveFromTransactionLine({
            record: rec,
            lineNum: lineNum,
            sublistId: 'item',
            itemId: itemId
        });

        if (!dimensions.isComplete && sellingUom !== UOM_CODES.BOARD_FEET && sellingUom !== UOM_CODES.MBF) {
            result.success = false;
            result.error = dimensions.error || 'Incomplete dimensions for UOM conversion';
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

        const precision = SettingsDAO.getBFPrecision();

        // Set calculated BF
        rec.setSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.CALCULATED_BF,
            line: lineNum,
            value: BFCalculator.roundTo(conversion.boardFeet, precision)
        });

        // Set conversion factor (for reference)
        rec.setSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.CONVERSION_FACTOR,
            line: lineNum,
            value: BFCalculator.roundTo(conversion.conversionFactor, PRECISION.FACTOR)
        });

        // Calculate BF-based cost
        const itemCost = getItemBFCost(itemId);
        const extendedBFCost = conversion.boardFeet * itemCost;

        rec.setSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.BF_UNIT_COST,
            line: lineNum,
            value: BFCalculator.roundTo(itemCost, PRECISION.CURRENCY)
        });

        rec.setSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.EXTENDED_BF_COST,
            line: lineNum,
            value: BFCalculator.roundTo(extendedBFCost, PRECISION.CURRENCY)
        });

        result.calculatedBF = conversion.boardFeet;
        result.conversionFactor = conversion.conversionFactor;
        result.bfUnitCost = itemCost;
        result.extendedBFCost = extendedBFCost;

        return result;
    };

    /**
     * Get item's base BF cost
     *
     * @param {number} itemId
     * @returns {number} Cost per BF
     */
    const getItemBFCost = (itemId) => {
        try {
            const lookupResult = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: [ITEM_FIELDS.BASE_BF_COST, 'cost']
            });

            // Try custom BF cost first
            const bfCost = parseFloat(lookupResult[ITEM_FIELDS.BASE_BF_COST]);
            if (!isNaN(bfCost) && bfCost > 0) {
                return bfCost;
            }

            // Fall back to standard cost
            const stdCost = parseFloat(lookupResult.cost);
            if (!isNaN(stdCost)) {
                return stdCost;
            }

            return 0;

        } catch (e) {
            log.error('getItemBFCost', e);
            return 0;
        }
    };

    /**
     * afterSubmit - Log for analytics
     *
     * @param {Object} context
     */
    const afterSubmit = (context) => {
        const { newRecord, type } = context;

        try {
            if (type !== context.UserEventType.CREATE) {
                return;
            }

            log.debug('afterSubmit', { type, recordId: newRecord.id });

            // Log estimate creation for analytics
            logEstimateCreation(newRecord);

        } catch (e) {
            log.error('afterSubmit', e);
        }
    };

    /**
     * Log estimate creation for consumption tracking
     */
    const logEstimateCreation = (rec) => {
        try {
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            const transactionDate = rec.getValue({ fieldId: 'trandate' });
            const subsidiaryId = rec.getValue({ fieldId: 'subsidiary' });
            let hasLumberItems = false;

            for (let i = 0; i < lineCount; i++) {
                const itemId = rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });

                if (!DimensionResolver.isLumberItem(itemId)) {
                    continue;
                }

                hasLumberItems = true;

                // Create consumption log entry
                createConsumptionLogEntry({
                    sourceTransactionId: rec.id,
                    sourceType: Constants.SOURCE_TYPES.ESTIMATE,
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
                });
            }

            if (hasLumberItems) {
                log.audit('afterSubmit - Estimate Logged', {
                    estimateId: rec.id,
                    lineCount: lineCount
                });
            }

        } catch (e) {
            log.error('logEstimateCreation', e);
        }
    };

    /**
     * Create consumption log entry
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
            log.error('createConsumptionLogEntry', e);
        }
    };

    return {
        beforeLoad,
        beforeSubmit,
        afterSubmit
    };
});
