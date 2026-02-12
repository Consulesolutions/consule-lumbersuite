/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Sales Order User Event Script
 * Handles BF calculations and UOM conversions for lumber sales orders
 *
 * Key Functions:
 * - Calculate BF from selling UOM
 * - Store conversion snapshots for fulfillment
 * - Calculate BF-based pricing and margins
 * - Prepare data for Work Order creation
 * - Track consumption for demand planning
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

    const log = Logger.createLogger('SalesOrder.UE');

    /**
     * beforeLoad - Configure form and add functionality
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

            // Configure form fields
            configureFormFields(form);

            // Add client script
            if (type === context.UserEventType.CREATE || type === context.UserEventType.EDIT) {
                form.clientScriptModulePath = '../sales/cls_salesorder_cs.js';
            }

            // Add summary and action buttons for VIEW mode
            if (type === context.UserEventType.VIEW) {
                addViewModeButtons(form, newRecord);
                addBFSummarySection(form, newRecord);
            }

            // Copy data from source estimate if creating from estimate
            if (type === context.UserEventType.CREATE) {
                copySourceData(newRecord);
            }

        } catch (e) {
            log.error('beforeLoad', e);
        }
    };

    /**
     * Configure form fields based on enabled modules
     */
    const configureFormFields = (form) => {
        try {
            const itemSublist = form.getSublist({ id: 'item' });
            if (!itemSublist) return;

            // Hide grade fields if not enabled
            if (!SettingsDAO.isGradeEnabled()) {
                hideSublistField(itemSublist, LINE_FIELDS.GRADE_OVERRIDE);
            }

            // Hide dimension fields if dynamic UOM disabled
            if (!SettingsDAO.isDynamicUomEnabled()) {
                hideSublistField(itemSublist, LINE_FIELDS.DIM_THICKNESS);
                hideSublistField(itemSublist, LINE_FIELDS.DIM_WIDTH);
                hideSublistField(itemSublist, LINE_FIELDS.DIM_LENGTH);
                hideSublistField(itemSublist, LINE_FIELDS.SELLING_UOM);
            }

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
     * Add buttons for VIEW mode
     */
    const addViewModeButtons = (form, rec) => {
        try {
            form.addButton({
                id: 'custpage_cls_bf_summary',
                label: 'BF Summary',
                functionName: 'showBFSummary'
            });

            // Add Work Order button if there are lumber items
            if (hasLumberItems(rec)) {
                form.addButton({
                    id: 'custpage_cls_create_wo',
                    label: 'Create Lumber WO',
                    functionName: 'createLumberWorkOrder'
                });
            }
        } catch (e) {
            log.error('addViewModeButtons', e);
        }
    };

    /**
     * Check if SO has lumber items
     */
    const hasLumberItems = (rec) => {
        const lineCount = rec.getLineCount({ sublistId: 'item' });

        for (let i = 0; i < lineCount; i++) {
            const itemId = rec.getSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                line: i
            });

            if (itemId && DimensionResolver.isLumberItem(itemId)) {
                return true;
            }
        }

        return false;
    };

    /**
     * Add BF summary section
     */
    const addBFSummarySection = (form, rec) => {
        try {
            if (!hasLumberItems(rec)) return;

            const summaryGroup = form.addFieldGroup({
                id: 'custpage_bf_summary',
                label: 'Board Feet Summary'
            });

            // Calculate summary
            const summary = calculateBFSummary(rec);

            form.addField({
                id: 'custpage_sum_total_bf',
                type: serverWidget.FieldType.FLOAT,
                label: 'Total BF',
                container: 'custpage_bf_summary'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE })
              .defaultValue = summary.totalBF;

            form.addField({
                id: 'custpage_sum_lumber_lines',
                type: serverWidget.FieldType.INTEGER,
                label: 'Lumber Lines',
                container: 'custpage_bf_summary'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE })
              .defaultValue = summary.lumberLineCount;

            form.addField({
                id: 'custpage_sum_avg_price_bf',
                type: serverWidget.FieldType.CURRENCY,
                label: 'Avg $/BF',
                container: 'custpage_bf_summary'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE })
              .defaultValue = summary.avgPricePerBF;

            if (SettingsDAO.isAdvReportingEnabled()) {
                form.addField({
                    id: 'custpage_sum_bf_margin',
                    type: serverWidget.FieldType.CURRENCY,
                    label: 'BF Margin',
                    container: 'custpage_bf_summary'
                }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE })
                  .defaultValue = summary.margin;

                form.addField({
                    id: 'custpage_sum_margin_pct',
                    type: serverWidget.FieldType.PERCENT,
                    label: 'Margin %',
                    container: 'custpage_bf_summary'
                }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE })
                  .defaultValue = summary.marginPct;
            }

        } catch (e) {
            log.error('addBFSummarySection', e);
        }
    };

    /**
     * Calculate BF summary
     */
    const calculateBFSummary = (rec) => {
        const lineCount = rec.getLineCount({ sublistId: 'item' });
        let totalBF = 0;
        let totalRevenue = 0;
        let totalCost = 0;
        let lumberLineCount = 0;

        for (let i = 0; i < lineCount; i++) {
            const itemId = rec.getSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                line: i
            });

            if (!itemId || !DimensionResolver.isLumberItem(itemId)) {
                continue;
            }

            lumberLineCount++;

            const bf = parseFloat(rec.getSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.CALCULATED_BF,
                line: i
            })) || 0;

            const amount = parseFloat(rec.getSublistValue({
                sublistId: 'item',
                fieldId: 'amount',
                line: i
            })) || 0;

            const bfCost = parseFloat(rec.getSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.EXTENDED_BF_COST,
                line: i
            })) || 0;

            totalBF += bf;
            totalRevenue += amount;
            totalCost += bfCost;
        }

        const margin = totalRevenue - totalCost;
        const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;
        const avgPricePerBF = totalBF > 0 ? totalRevenue / totalBF : 0;

        return {
            totalBF: BFCalculator.roundTo(totalBF, PRECISION.BF),
            lumberLineCount,
            totalRevenue: BFCalculator.roundTo(totalRevenue, PRECISION.CURRENCY),
            totalCost: BFCalculator.roundTo(totalCost, PRECISION.CURRENCY),
            margin: BFCalculator.roundTo(margin, PRECISION.CURRENCY),
            marginPct: BFCalculator.roundTo(marginPct, PRECISION.PERCENTAGE),
            avgPricePerBF: BFCalculator.roundTo(avgPricePerBF, PRECISION.CURRENCY)
        };
    };

    /**
     * Copy data from source transaction (estimate)
     */
    const copySourceData = (rec) => {
        // NetSuite handles most field copying automatically
        // This function handles any LumberSuite-specific logic
        log.debug('copySourceData', 'Checking for source data');
    };

    /**
     * beforeSubmit - Calculate BF and validate
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
                return;
            }

            // Check if locked
            const isLocked = newRecord.getValue({ fieldId: BODY_FIELDS.CONVERSION_LOCKED });
            if (isLocked && type === context.UserEventType.EDIT) {
                log.debug('beforeSubmit', 'Conversions locked');
                return;
            }

            // Process all lines
            const result = processSalesOrderLines(newRecord);

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
     * Process all sales order lines
     */
    const processSalesOrderLines = (rec) => {
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
                const lineResult = processSalesOrderLine(rec, i);

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

        // Set body total
        rec.setValue({
            fieldId: BODY_FIELDS.TOTAL_BF,
            value: BFCalculator.roundTo(result.totalBF, SettingsDAO.getBFPrecision())
        });

        result.success = result.errors.length === 0;
        return result;
    };

    /**
     * Process a single sales order line
     */
    const processSalesOrderLine = (rec, lineNum) => {
        const result = {
            success: true,
            isLumber: false,
            calculatedBF: 0,
            conversionFactor: 0,
            extendedBFCost: 0,
            error: null
        };

        const itemId = rec.getSublistValue({
            sublistId: 'item',
            fieldId: 'item',
            line: lineNum
        });

        if (!itemId) return result;

        if (!DimensionResolver.isLumberItem(itemId)) {
            return result;
        }

        result.isLumber = true;

        // Get UOM and quantity
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

        if (displayQty <= 0) return result;

        // Resolve dimensions
        const dimensions = DimensionResolver.resolveFromTransactionLine({
            record: rec,
            lineNum: lineNum,
            sublistId: 'item',
            itemId: itemId
        });

        // Convert to BF
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

        // Set conversion factor
        rec.setSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.CONVERSION_FACTOR,
            line: lineNum,
            value: BFCalculator.roundTo(conversion.conversionFactor, PRECISION.FACTOR)
        });

        // Calculate BF cost
        const bfCost = getItemBFCost(itemId);
        const extendedBFCost = conversion.boardFeet * bfCost;

        rec.setSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.BF_UNIT_COST,
            line: lineNum,
            value: BFCalculator.roundTo(bfCost, PRECISION.CURRENCY)
        });

        rec.setSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.EXTENDED_BF_COST,
            line: lineNum,
            value: BFCalculator.roundTo(extendedBFCost, PRECISION.CURRENCY)
        });

        result.calculatedBF = conversion.boardFeet;
        result.conversionFactor = conversion.conversionFactor;
        result.extendedBFCost = extendedBFCost;

        return result;
    };

    /**
     * Get item BF cost
     */
    const getItemBFCost = (itemId) => {
        try {
            const lookupResult = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: [ITEM_FIELDS.BASE_BF_COST, 'cost']
            });

            const bfCost = parseFloat(lookupResult[ITEM_FIELDS.BASE_BF_COST]);
            if (!isNaN(bfCost) && bfCost > 0) return bfCost;

            const stdCost = parseFloat(lookupResult.cost);
            if (!isNaN(stdCost)) return stdCost;

            return 0;

        } catch (e) {
            return 0;
        }
    };

    /**
     * afterSubmit - Log consumption
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

            // Log consumption for analytics
            logSalesOrderConsumption(newRecord);

        } catch (e) {
            log.error('afterSubmit', e);
        }
    };

    /**
     * Log sales order consumption
     */
    const logSalesOrderConsumption = (rec) => {
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

                createConsumptionLogEntry({
                    sourceTransactionId: rec.id,
                    sourceType: Constants.SOURCE_TYPES.SALES_ORDER,
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

        } catch (e) {
            log.error('logSalesOrderConsumption', e);
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
