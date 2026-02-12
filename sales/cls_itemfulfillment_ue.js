/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * @file cls_itemfulfillment_ue.js
 * @description Item Fulfillment User Event Script for Consule LumberSuite™
 *              Handles BF calculations, tally consumption, and fulfillment tracking
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module sales/cls_itemfulfillment_ue
 */

define([
    'N/record',
    'N/search',
    'N/runtime',
    'N/log',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_conversion_engine',
    '../lib/cls_dimension_resolver',
    '../lib/cls_tally_service',
    '../lib/cls_bf_calculator',
    '../lib/cls_validation',
    '../lib/cls_logger'
], function(
    record,
    search,
    runtime,
    log,
    Constants,
    SettingsDAO,
    ConversionEngine,
    DimensionResolver,
    TallyService,
    BFCalculator,
    Validation,
    Logger
) {
    'use strict';

    /**
     * Module-level logger instance
     * @type {Object}
     */
    const logger = Logger.createLogger('CLS_ItemFulfillment_UE');

    /**
     * Cache for item data to reduce lookups during processing
     * @type {Map}
     */
    const itemCache = new Map();

    /**
     * Cache for sales order line data
     * @type {Map}
     */
    const soLineCache = new Map();

    /**
     * beforeLoad Entry Point
     * Adds BF fulfillment summary section in view mode
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {string} context.type - Trigger type
     * @param {Form} context.form - Current form
     */
    function beforeLoad(context) {
        const startTime = Date.now();

        try {
            if (!SettingsDAO.isDynamicUomEnabled()) {
                return;
            }

            if (context.type !== context.UserEventType.VIEW) {
                return;
            }

            const fulfillmentRec = context.newRecord;
            const form = context.form;

            addFulfillmentSummarySection(fulfillmentRec, form);

            logger.debug('beforeLoad', `Completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('beforeLoad', `Error: ${e.message}`, { stack: e.stack });
        }
    }

    /**
     * beforeSubmit Entry Point
     * Calculates BF values, validates against source SO, prepares tally consumption
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record (edit only)
     * @param {string} context.type - Trigger type
     */
    function beforeSubmit(context) {
        const startTime = Date.now();

        try {
            if (!SettingsDAO.isDynamicUomEnabled()) {
                return;
            }

            if (context.type === context.UserEventType.DELETE) {
                return;
            }

            const fulfillmentRec = context.newRecord;

            clearCaches();
            loadSourceSalesOrderData(fulfillmentRec);
            calculateAllLineBFValues(fulfillmentRec);
            validateFulfillmentQuantities(fulfillmentRec, context.type);
            calculateBodyTotals(fulfillmentRec);

            if (SettingsDAO.isTallyEnabled()) {
                prepareTallyConsumption(fulfillmentRec);
            }

            logger.audit('beforeSubmit', `Item Fulfillment processing completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('beforeSubmit', `Error: ${e.message}`, { stack: e.stack });
            throw e;
        }
    }

    /**
     * afterSubmit Entry Point
     * Logs consumption analytics, processes tally updates, updates SO tracking
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record (edit only)
     * @param {string} context.type - Trigger type
     */
    function afterSubmit(context) {
        const startTime = Date.now();

        try {
            if (!SettingsDAO.isDynamicUomEnabled()) {
                return;
            }

            const fulfillmentRec = record.load({
                type: record.Type.ITEM_FULFILLMENT,
                id: context.newRecord.id,
                isDynamic: false
            });

            if (context.type === context.UserEventType.CREATE) {
                logFulfillmentConsumption(fulfillmentRec);

                if (SettingsDAO.isTallyEnabled()) {
                    processTallyConsumption(fulfillmentRec);
                }
            } else if (context.type === context.UserEventType.EDIT) {
                logFulfillmentAdjustment(fulfillmentRec, context.oldRecord);

                if (SettingsDAO.isTallyEnabled()) {
                    adjustTallyConsumption(fulfillmentRec, context.oldRecord);
                }
            } else if (context.type === context.UserEventType.DELETE) {
                reverseFulfillmentConsumption(context.oldRecord);

                if (SettingsDAO.isTallyEnabled()) {
                    reverseTallyConsumption(context.oldRecord);
                }
            }

            logger.audit('afterSubmit', `Item Fulfillment post-processing completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('afterSubmit', `Error: ${e.message}`, { stack: e.stack });
        }
    }

    /**
     * Adds BF Fulfillment Summary section to the form
     *
     * @param {Record} fulfillmentRec - Item Fulfillment record
     * @param {Form} form - Current form
     */
    function addFulfillmentSummarySection(fulfillmentRec, form) {
        try {
            const summaryGroup = form.addFieldGroup({
                id: 'custpage_cls_fulfillment_summary',
                label: 'LumberSuite™ Fulfillment Summary'
            });

            const totalBFField = form.addField({
                id: 'custpage_cls_total_bf_fulfilled',
                type: 'currency',
                label: 'Total BF Fulfilled',
                container: 'custpage_cls_fulfillment_summary'
            });
            totalBFField.updateDisplayType({ displayType: 'INLINE' });

            const totalMBFField = form.addField({
                id: 'custpage_cls_total_mbf_fulfilled',
                type: 'currency',
                label: 'Total MBF Fulfilled',
                container: 'custpage_cls_fulfillment_summary'
            });
            totalMBFField.updateDisplayType({ displayType: 'INLINE' });

            const lineCountField = form.addField({
                id: 'custpage_cls_lumber_lines',
                type: 'integer',
                label: 'Lumber Lines',
                container: 'custpage_cls_fulfillment_summary'
            });
            lineCountField.updateDisplayType({ displayType: 'INLINE' });

            const summary = calculateFulfillmentSummary(fulfillmentRec);

            totalBFField.defaultValue = summary.totalBF.toFixed(4);
            totalMBFField.defaultValue = summary.totalMBF.toFixed(6);
            lineCountField.defaultValue = summary.lumberLineCount;

            if (SettingsDAO.isTallyEnabled()) {
                const tallyField = form.addField({
                    id: 'custpage_cls_tallies_consumed',
                    type: 'integer',
                    label: 'Tallies Consumed',
                    container: 'custpage_cls_fulfillment_summary'
                });
                tallyField.updateDisplayType({ displayType: 'INLINE' });
                tallyField.defaultValue = summary.talliesConsumed;
            }
        } catch (e) {
            logger.error('addFulfillmentSummarySection', `Error adding summary: ${e.message}`);
        }
    }

    /**
     * Calculates fulfillment summary for display
     *
     * @param {Record} fulfillmentRec - Item Fulfillment record
     * @returns {Object} Summary totals
     */
    function calculateFulfillmentSummary(fulfillmentRec) {
        const summary = {
            totalBF: 0,
            totalMBF: 0,
            lumberLineCount: 0,
            talliesConsumed: 0
        };

        const lineCount = fulfillmentRec.getLineCount({ sublistId: 'item' });

        for (let i = 0; i < lineCount; i++) {
            const itemId = fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                line: i
            });

            const itemData = getItemData(itemId);
            if (!itemData || !itemData.isLumberItem) {
                continue;
            }

            summary.lumberLineCount++;

            const lineBF = parseFloat(fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: Constants.LINE_FIELDS.LINE_BF,
                line: i
            })) || 0;

            summary.totalBF += lineBF;

            const tallyId = fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: Constants.LINE_FIELDS.TALLY_SHEET,
                line: i
            });

            if (tallyId) {
                summary.talliesConsumed++;
            }
        }

        summary.totalMBF = summary.totalBF / 1000;

        return summary;
    }

    /**
     * Clears module-level caches
     */
    function clearCaches() {
        itemCache.clear();
        soLineCache.clear();
    }

    /**
     * Loads source sales order data for validation and BF copying
     *
     * @param {Record} fulfillmentRec - Item Fulfillment record
     */
    function loadSourceSalesOrderData(fulfillmentRec) {
        const createdFromId = fulfillmentRec.getValue({ fieldId: 'createdfrom' });

        if (!createdFromId) {
            logger.debug('loadSourceSalesOrderData', 'No source transaction found');
            return;
        }

        try {
            const soLookup = search.lookupFields({
                type: search.Type.SALES_ORDER,
                id: createdFromId,
                columns: ['tranid', 'entity', 'subsidiary']
            });

            logger.debug('loadSourceSalesOrderData', `Loading SO: ${soLookup.tranid}`);

            const soSearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: [
                    ['internalid', 'is', createdFromId],
                    'AND',
                    ['mainline', 'is', 'F'],
                    'AND',
                    ['taxline', 'is', 'F'],
                    'AND',
                    ['shipping', 'is', 'F']
                ],
                columns: [
                    search.createColumn({ name: 'line' }),
                    search.createColumn({ name: 'item' }),
                    search.createColumn({ name: 'quantity' }),
                    search.createColumn({ name: 'quantityshiprecv' }),
                    search.createColumn({ name: 'quantityremaining' }),
                    search.createColumn({ name: Constants.LINE_FIELDS.LINE_BF }),
                    search.createColumn({ name: Constants.LINE_FIELDS.BF_PER_UNIT }),
                    search.createColumn({ name: Constants.LINE_FIELDS.SALES_UOM }),
                    search.createColumn({ name: Constants.LINE_FIELDS.THICKNESS }),
                    search.createColumn({ name: Constants.LINE_FIELDS.WIDTH }),
                    search.createColumn({ name: Constants.LINE_FIELDS.LENGTH }),
                    search.createColumn({ name: Constants.LINE_FIELDS.TALLY_SHEET })
                ]
            });

            soSearch.run().each(function(result) {
                const lineKey = result.getValue({ name: 'line' });
                const itemId = result.getValue({ name: 'item' });

                soLineCache.set(`${itemId}_${lineKey}`, {
                    line: lineKey,
                    itemId: itemId,
                    quantity: parseFloat(result.getValue({ name: 'quantity' })) || 0,
                    quantityShipped: parseFloat(result.getValue({ name: 'quantityshiprecv' })) || 0,
                    quantityRemaining: parseFloat(result.getValue({ name: 'quantityremaining' })) || 0,
                    lineBF: parseFloat(result.getValue({ name: Constants.LINE_FIELDS.LINE_BF })) || 0,
                    bfPerUnit: parseFloat(result.getValue({ name: Constants.LINE_FIELDS.BF_PER_UNIT })) || 0,
                    salesUom: result.getValue({ name: Constants.LINE_FIELDS.SALES_UOM }),
                    thickness: parseFloat(result.getValue({ name: Constants.LINE_FIELDS.THICKNESS })) || 0,
                    width: parseFloat(result.getValue({ name: Constants.LINE_FIELDS.WIDTH })) || 0,
                    length: parseFloat(result.getValue({ name: Constants.LINE_FIELDS.LENGTH })) || 0,
                    tallySheet: result.getValue({ name: Constants.LINE_FIELDS.TALLY_SHEET })
                });

                return true;
            });

            logger.debug('loadSourceSalesOrderData', `Loaded ${soLineCache.size} SO lines`);
        } catch (e) {
            logger.error('loadSourceSalesOrderData', `Error loading SO data: ${e.message}`);
        }
    }

    /**
     * Calculates BF values for all item lines
     *
     * @param {Record} fulfillmentRec - Item Fulfillment record
     */
    function calculateAllLineBFValues(fulfillmentRec) {
        const lineCount = fulfillmentRec.getLineCount({ sublistId: 'item' });

        for (let i = 0; i < lineCount; i++) {
            const itemId = fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                line: i
            });

            const itemData = getItemData(itemId);
            if (!itemData || !itemData.isLumberItem) {
                continue;
            }

            calculateLineBF(fulfillmentRec, i, itemData);
        }
    }

    /**
     * Calculates BF for a single line, copying from SO when available
     *
     * @param {Record} fulfillmentRec - Item Fulfillment record
     * @param {number} lineIndex - Line index
     * @param {Object} itemData - Item data object
     */
    function calculateLineBF(fulfillmentRec, lineIndex, itemData) {
        const itemId = fulfillmentRec.getSublistValue({
            sublistId: 'item',
            fieldId: 'item',
            line: lineIndex
        });

        const orderLine = fulfillmentRec.getSublistValue({
            sublistId: 'item',
            fieldId: 'orderline',
            line: lineIndex
        });

        const quantity = parseFloat(fulfillmentRec.getSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            line: lineIndex
        })) || 0;

        const soLineData = soLineCache.get(`${itemId}_${orderLine}`);

        let bfPerUnit = 0;
        let dimensions = {};

        if (soLineData && soLineData.bfPerUnit) {
            bfPerUnit = soLineData.bfPerUnit;
            dimensions = {
                thickness: soLineData.thickness,
                width: soLineData.width,
                length: soLineData.length
            };

            fulfillmentRec.setSublistValue({
                sublistId: 'item',
                fieldId: Constants.LINE_FIELDS.SALES_UOM,
                line: lineIndex,
                value: soLineData.salesUom
            });

            if (soLineData.tallySheet) {
                fulfillmentRec.setSublistValue({
                    sublistId: 'item',
                    fieldId: Constants.LINE_FIELDS.TALLY_SHEET,
                    line: lineIndex,
                    value: soLineData.tallySheet
                });
            }
        } else {
            dimensions = DimensionResolver.resolveFromTransactionLine(
                fulfillmentRec,
                lineIndex,
                itemData
            );

            const uomCode = fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: Constants.LINE_FIELDS.SALES_UOM,
                line: lineIndex
            }) || itemData.stockUnit || Constants.UOM_CODES.BF;

            const conversionResult = ConversionEngine.convertToBoardFeet(
                1,
                uomCode,
                dimensions
            );

            bfPerUnit = conversionResult.boardFeet || 0;
        }

        fulfillmentRec.setSublistValue({
            sublistId: 'item',
            fieldId: Constants.LINE_FIELDS.THICKNESS,
            line: lineIndex,
            value: dimensions.thickness || 0
        });

        fulfillmentRec.setSublistValue({
            sublistId: 'item',
            fieldId: Constants.LINE_FIELDS.WIDTH,
            line: lineIndex,
            value: dimensions.width || 0
        });

        fulfillmentRec.setSublistValue({
            sublistId: 'item',
            fieldId: Constants.LINE_FIELDS.LENGTH,
            line: lineIndex,
            value: dimensions.length || 0
        });

        fulfillmentRec.setSublistValue({
            sublistId: 'item',
            fieldId: Constants.LINE_FIELDS.BF_PER_UNIT,
            line: lineIndex,
            value: bfPerUnit
        });

        const totalLineBF = quantity * bfPerUnit;

        fulfillmentRec.setSublistValue({
            sublistId: 'item',
            fieldId: Constants.LINE_FIELDS.LINE_BF,
            line: lineIndex,
            value: totalLineBF
        });

        logger.debug('calculateLineBF', `Line ${lineIndex}: ${quantity} units × ${bfPerUnit} BF/unit = ${totalLineBF} BF`);
    }

    /**
     * Validates fulfillment quantities against source SO
     *
     * @param {Record} fulfillmentRec - Item Fulfillment record
     * @param {string} eventType - User event type
     */
    function validateFulfillmentQuantities(fulfillmentRec, eventType) {
        const lineCount = fulfillmentRec.getLineCount({ sublistId: 'item' });
        const warnings = [];

        for (let i = 0; i < lineCount; i++) {
            const itemId = fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                line: i
            });

            const itemData = getItemData(itemId);
            if (!itemData || !itemData.isLumberItem) {
                continue;
            }

            const orderLine = fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'orderline',
                line: i
            });

            const fulfillQty = parseFloat(fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'quantity',
                line: i
            })) || 0;

            const soLineData = soLineCache.get(`${itemId}_${orderLine}`);

            if (soLineData) {
                const remainingQty = soLineData.quantityRemaining || soLineData.quantity;

                if (fulfillQty > remainingQty * 1.01) {
                    warnings.push(`Line ${i + 1}: Fulfilling ${fulfillQty} exceeds remaining ${remainingQty.toFixed(2)}`);
                }
            }
        }

        if (warnings.length > 0) {
            logger.warn('validateFulfillmentQuantities', `Validation warnings: ${warnings.join('; ')}`);
        }
    }

    /**
     * Calculates and sets body-level BF totals
     *
     * @param {Record} fulfillmentRec - Item Fulfillment record
     */
    function calculateBodyTotals(fulfillmentRec) {
        const lineCount = fulfillmentRec.getLineCount({ sublistId: 'item' });
        let totalBF = 0;

        for (let i = 0; i < lineCount; i++) {
            const lineBF = parseFloat(fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: Constants.LINE_FIELDS.LINE_BF,
                line: i
            })) || 0;

            totalBF += lineBF;
        }

        fulfillmentRec.setValue({
            fieldId: Constants.BODY_FIELDS.TOTAL_BF,
            value: totalBF
        });

        fulfillmentRec.setValue({
            fieldId: Constants.BODY_FIELDS.TOTAL_MBF,
            value: totalBF / 1000
        });

        logger.debug('calculateBodyTotals', `Total BF: ${totalBF.toFixed(4)}, Total MBF: ${(totalBF / 1000).toFixed(6)}`);
    }

    /**
     * Prepares tally consumption data for processing in afterSubmit
     *
     * @param {Record} fulfillmentRec - Item Fulfillment record
     */
    function prepareTallyConsumption(fulfillmentRec) {
        const lineCount = fulfillmentRec.getLineCount({ sublistId: 'item' });
        const tallyConsumptions = [];

        for (let i = 0; i < lineCount; i++) {
            const tallyId = fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: Constants.LINE_FIELDS.TALLY_SHEET,
                line: i
            });

            if (!tallyId) {
                continue;
            }

            const lineBF = parseFloat(fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: Constants.LINE_FIELDS.LINE_BF,
                line: i
            })) || 0;

            const quantity = parseFloat(fulfillmentRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'quantity',
                line: i
            })) || 0;

            tallyConsumptions.push({
                line: i,
                tallyId: tallyId,
                quantity: quantity,
                boardFeet: lineBF
            });
        }

        if (tallyConsumptions.length > 0) {
            fulfillmentRec.setValue({
                fieldId: Constants.BODY_FIELDS.TALLY_CONSUMPTION_DATA,
                value: JSON.stringify(tallyConsumptions)
            });
        }
    }

    /**
     * Logs fulfillment consumption for analytics
     *
     * @param {Record} fulfillmentRec - Item Fulfillment record
     */
    function logFulfillmentConsumption(fulfillmentRec) {
        try {
            const lineCount = fulfillmentRec.getLineCount({ sublistId: 'item' });
            const consumptionEntries = [];

            for (let i = 0; i < lineCount; i++) {
                const itemId = fulfillmentRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });

                const itemData = getItemData(itemId);
                if (!itemData || !itemData.isLumberItem) {
                    continue;
                }

                const lineBF = parseFloat(fulfillmentRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: Constants.LINE_FIELDS.LINE_BF,
                    line: i
                })) || 0;

                const quantity = parseFloat(fulfillmentRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    line: i
                })) || 0;

                consumptionEntries.push({
                    item: itemId,
                    quantity: quantity,
                    boardFeet: lineBF,
                    uom: fulfillmentRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: Constants.LINE_FIELDS.SALES_UOM,
                        line: i
                    }),
                    location: fulfillmentRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'location',
                        line: i
                    })
                });
            }

            if (consumptionEntries.length === 0) {
                return;
            }

            const consumptionLog = record.create({
                type: Constants.RECORD_TYPES.CONSUMPTION_LOG,
                isDynamic: false
            });

            consumptionLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.SOURCE_TRANSACTION,
                value: fulfillmentRec.id
            });

            consumptionLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.TRANSACTION_TYPE,
                value: 'itemfulfillment'
            });

            consumptionLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.CONSUMPTION_DATE,
                value: new Date()
            });

            const totalBF = consumptionEntries.reduce((sum, entry) => sum + entry.boardFeet, 0);

            consumptionLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.TOTAL_BF,
                value: totalBF
            });

            consumptionLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.LINE_DATA,
                value: JSON.stringify(consumptionEntries)
            });

            const logId = consumptionLog.save();
            logger.audit('logFulfillmentConsumption', `Created consumption log ${logId} with ${totalBF.toFixed(4)} total BF`);
        } catch (e) {
            logger.error('logFulfillmentConsumption', `Error logging consumption: ${e.message}`);
        }
    }

    /**
     * Logs fulfillment adjustments for edited fulfillments
     *
     * @param {Record} fulfillmentRec - Current record
     * @param {Record} oldRecord - Previous record
     */
    function logFulfillmentAdjustment(fulfillmentRec, oldRecord) {
        try {
            const currentTotalBF = parseFloat(fulfillmentRec.getValue({
                fieldId: Constants.BODY_FIELDS.TOTAL_BF
            })) || 0;

            const previousTotalBF = parseFloat(oldRecord.getValue({
                fieldId: Constants.BODY_FIELDS.TOTAL_BF
            })) || 0;

            const adjustment = currentTotalBF - previousTotalBF;

            if (Math.abs(adjustment) < 0.0001) {
                return;
            }

            const adjustmentLog = record.create({
                type: Constants.RECORD_TYPES.CONSUMPTION_LOG,
                isDynamic: false
            });

            adjustmentLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.SOURCE_TRANSACTION,
                value: fulfillmentRec.id
            });

            adjustmentLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.TRANSACTION_TYPE,
                value: 'itemfulfillment_adjustment'
            });

            adjustmentLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.CONSUMPTION_DATE,
                value: new Date()
            });

            adjustmentLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.TOTAL_BF,
                value: adjustment
            });

            adjustmentLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.NOTES,
                value: `Adjustment: Previous ${previousTotalBF.toFixed(4)} BF, New ${currentTotalBF.toFixed(4)} BF`
            });

            const logId = adjustmentLog.save();
            logger.audit('logFulfillmentAdjustment', `Created adjustment log ${logId}: ${adjustment.toFixed(4)} BF`);
        } catch (e) {
            logger.error('logFulfillmentAdjustment', `Error logging adjustment: ${e.message}`);
        }
    }

    /**
     * Reverses consumption for deleted fulfillments
     *
     * @param {Record} oldRecord - Deleted record
     */
    function reverseFulfillmentConsumption(oldRecord) {
        try {
            const totalBF = parseFloat(oldRecord.getValue({
                fieldId: Constants.BODY_FIELDS.TOTAL_BF
            })) || 0;

            if (totalBF === 0) {
                return;
            }

            const reversalLog = record.create({
                type: Constants.RECORD_TYPES.CONSUMPTION_LOG,
                isDynamic: false
            });

            reversalLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.SOURCE_TRANSACTION,
                value: oldRecord.id
            });

            reversalLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.TRANSACTION_TYPE,
                value: 'itemfulfillment_reversal'
            });

            reversalLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.CONSUMPTION_DATE,
                value: new Date()
            });

            reversalLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.TOTAL_BF,
                value: -totalBF
            });

            reversalLog.setValue({
                fieldId: Constants.CONSUMPTION_FIELDS.NOTES,
                value: `Reversal of deleted fulfillment: ${totalBF.toFixed(4)} BF`
            });

            const logId = reversalLog.save();
            logger.audit('reverseFulfillmentConsumption', `Created reversal log ${logId}: -${totalBF.toFixed(4)} BF`);
        } catch (e) {
            logger.error('reverseFulfillmentConsumption', `Error logging reversal: ${e.message}`);
        }
    }

    /**
     * Processes tally consumption updates
     *
     * @param {Record} fulfillmentRec - Item Fulfillment record
     */
    function processTallyConsumption(fulfillmentRec) {
        try {
            const consumptionDataStr = fulfillmentRec.getValue({
                fieldId: Constants.BODY_FIELDS.TALLY_CONSUMPTION_DATA
            });

            if (!consumptionDataStr) {
                return;
            }

            const consumptionData = JSON.parse(consumptionDataStr);

            for (const consumption of consumptionData) {
                TallyService.recordConsumption({
                    tallyId: consumption.tallyId,
                    quantity: consumption.quantity,
                    boardFeet: consumption.boardFeet,
                    sourceTransaction: fulfillmentRec.id,
                    transactionType: 'itemfulfillment',
                    consumptionDate: new Date()
                });
            }

            logger.audit('processTallyConsumption', `Processed ${consumptionData.length} tally consumptions`);
        } catch (e) {
            logger.error('processTallyConsumption', `Error processing tally consumption: ${e.message}`);
        }
    }

    /**
     * Adjusts tally consumption for edited fulfillments
     *
     * @param {Record} fulfillmentRec - Current record
     * @param {Record} oldRecord - Previous record
     */
    function adjustTallyConsumption(fulfillmentRec, oldRecord) {
        try {
            reverseTallyConsumption(oldRecord);
            processTallyConsumption(fulfillmentRec);

            logger.audit('adjustTallyConsumption', 'Tally consumption adjusted for edit');
        } catch (e) {
            logger.error('adjustTallyConsumption', `Error adjusting tally consumption: ${e.message}`);
        }
    }

    /**
     * Reverses tally consumption for deleted fulfillments
     *
     * @param {Record} oldRecord - Deleted record
     */
    function reverseTallyConsumption(oldRecord) {
        try {
            const consumptionDataStr = oldRecord.getValue({
                fieldId: Constants.BODY_FIELDS.TALLY_CONSUMPTION_DATA
            });

            if (!consumptionDataStr) {
                return;
            }

            const consumptionData = JSON.parse(consumptionDataStr);

            for (const consumption of consumptionData) {
                TallyService.reverseConsumption({
                    tallyId: consumption.tallyId,
                    quantity: consumption.quantity,
                    boardFeet: consumption.boardFeet,
                    sourceTransaction: oldRecord.id,
                    transactionType: 'itemfulfillment_reversal',
                    reversalDate: new Date()
                });
            }

            logger.audit('reverseTallyConsumption', `Reversed ${consumptionData.length} tally consumptions`);
        } catch (e) {
            logger.error('reverseTallyConsumption', `Error reversing tally consumption: ${e.message}`);
        }
    }

    /**
     * Gets item data with caching
     *
     * @param {string|number} itemId - Item internal ID
     * @returns {Object|null} Item data or null
     */
    function getItemData(itemId) {
        if (!itemId) {
            return null;
        }

        if (itemCache.has(itemId)) {
            return itemCache.get(itemId);
        }

        try {
            const itemLookup = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: [
                    Constants.ITEM_FIELDS.IS_LUMBER_ITEM,
                    Constants.ITEM_FIELDS.NOMINAL_THICKNESS,
                    Constants.ITEM_FIELDS.NOMINAL_WIDTH,
                    Constants.ITEM_FIELDS.NOMINAL_LENGTH,
                    Constants.ITEM_FIELDS.ACTUAL_THICKNESS,
                    Constants.ITEM_FIELDS.ACTUAL_WIDTH,
                    Constants.ITEM_FIELDS.ACTUAL_LENGTH,
                    Constants.ITEM_FIELDS.PIECES_PER_BUNDLE,
                    Constants.ITEM_FIELDS.DEFAULT_YIELD,
                    Constants.ITEM_FIELDS.SPECIES,
                    Constants.ITEM_FIELDS.GRADE,
                    'stockunit',
                    'unitstype',
                    'itemid'
                ]
            });

            const itemData = {
                id: itemId,
                itemId: itemLookup.itemid,
                isLumberItem: itemLookup[Constants.ITEM_FIELDS.IS_LUMBER_ITEM] || false,
                nominalThickness: parseFloat(itemLookup[Constants.ITEM_FIELDS.NOMINAL_THICKNESS]) || 0,
                nominalWidth: parseFloat(itemLookup[Constants.ITEM_FIELDS.NOMINAL_WIDTH]) || 0,
                nominalLength: parseFloat(itemLookup[Constants.ITEM_FIELDS.NOMINAL_LENGTH]) || 0,
                actualThickness: parseFloat(itemLookup[Constants.ITEM_FIELDS.ACTUAL_THICKNESS]) || 0,
                actualWidth: parseFloat(itemLookup[Constants.ITEM_FIELDS.ACTUAL_WIDTH]) || 0,
                actualLength: parseFloat(itemLookup[Constants.ITEM_FIELDS.ACTUAL_LENGTH]) || 0,
                piecesPerBundle: parseFloat(itemLookup[Constants.ITEM_FIELDS.PIECES_PER_BUNDLE]) || 1,
                defaultYield: parseFloat(itemLookup[Constants.ITEM_FIELDS.DEFAULT_YIELD]) || 100,
                species: itemLookup[Constants.ITEM_FIELDS.SPECIES],
                grade: itemLookup[Constants.ITEM_FIELDS.GRADE],
                stockUnit: itemLookup.stockunit?.[0]?.value || null,
                unitsType: itemLookup.unitstype?.[0]?.value || null
            };

            itemCache.set(itemId, itemData);
            return itemData;
        } catch (e) {
            logger.error('getItemData', `Error loading item ${itemId}: ${e.message}`);
            return null;
        }
    }

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
