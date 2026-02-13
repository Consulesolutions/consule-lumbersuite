/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module cls_process_service
 *
 * Consule LumberSuite - Process & By-product Service Module
 * Handles process type targets and by-product tracking for multi-output work orders
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
    './cls_bf_calculator',
    './cls_logger'
], (
    record,
    search,
    runtime,
    Constants,
    SettingsDAO,
    BFCalculator,
    Logger
) => {

    const log = Logger.createLogger('ProcessService');
    const RECORD_TYPES = Constants.RECORD_TYPES;
    const PROCESS_TARGET_FIELDS = Constants.PROCESS_TARGET_FIELDS;
    const BYPRODUCT_FIELDS = Constants.BYPRODUCT_FIELDS;
    const PRECISION = Constants.PRECISION;

    /**
     * Get process target yield for a given process type and optional species
     *
     * @param {Object} options
     * @param {string} options.processType - Process type list value
     * @param {number} [options.speciesId] - Optional species record ID
     * @returns {Object} Process target data
     */
    const getProcessTarget = (options) => {
        const { processType, speciesId } = options;

        if (!processType) {
            return {
                found: false,
                targetYield: SettingsDAO.getDefaultYield(),
                minYield: null,
                kerfLoss: 0,
                shrinkage: 0,
                defectRate: 0
            };
        }

        try {
            // Search for process target - prefer species-specific match
            const filters = [
                [PROCESS_TARGET_FIELDS.PROCESS_TYPE, 'anyof', processType]
            ];

            if (speciesId) {
                // First try species-specific target
                const speciesFilters = [
                    ...filters,
                    'AND',
                    [PROCESS_TARGET_FIELDS.SPECIES, 'anyof', speciesId]
                ];

                const speciesResult = searchProcessTarget(speciesFilters);
                if (speciesResult.found) {
                    return speciesResult;
                }
            }

            // Fall back to general process target (no species)
            const generalFilters = [
                ...filters,
                'AND',
                [PROCESS_TARGET_FIELDS.SPECIES, 'anyof', '@NONE@']
            ];

            const generalResult = searchProcessTarget(generalFilters);
            if (generalResult.found) {
                return generalResult;
            }

            // Return defaults
            return {
                found: false,
                targetYield: SettingsDAO.getDefaultYield(),
                minYield: null,
                kerfLoss: 0,
                shrinkage: 0,
                defectRate: 0
            };

        } catch (e) {
            log.error('getProcessTarget', e);
            return {
                found: false,
                targetYield: SettingsDAO.getDefaultYield(),
                minYield: null,
                kerfLoss: 0,
                shrinkage: 0,
                defectRate: 0,
                error: e.message
            };
        }
    };

    /**
     * Search for process target record
     *
     * @param {Array} filters - Search filters
     * @returns {Object} Process target data
     */
    const searchProcessTarget = (filters) => {
        const results = search.create({
            type: RECORD_TYPES.PROCESS_TARGET,
            filters: filters,
            columns: [
                PROCESS_TARGET_FIELDS.TARGET_YIELD,
                PROCESS_TARGET_FIELDS.MIN_YIELD,
                PROCESS_TARGET_FIELDS.KERF_LOSS,
                PROCESS_TARGET_FIELDS.SHRINKAGE,
                PROCESS_TARGET_FIELDS.DEFECT_RATE,
                PROCESS_TARGET_FIELDS.NOTES
            ]
        }).run().getRange({ start: 0, end: 1 });

        if (results && results.length > 0) {
            const result = results[0];
            return {
                found: true,
                targetId: result.id,
                targetYield: parseFloat(result.getValue(PROCESS_TARGET_FIELDS.TARGET_YIELD)) || SettingsDAO.getDefaultYield(),
                minYield: parseFloat(result.getValue(PROCESS_TARGET_FIELDS.MIN_YIELD)) || null,
                kerfLoss: parseFloat(result.getValue(PROCESS_TARGET_FIELDS.KERF_LOSS)) || 0,
                shrinkage: parseFloat(result.getValue(PROCESS_TARGET_FIELDS.SHRINKAGE)) || 0,
                defectRate: parseFloat(result.getValue(PROCESS_TARGET_FIELDS.DEFECT_RATE)) || 0,
                notes: result.getValue(PROCESS_TARGET_FIELDS.NOTES)
            };
        }

        return { found: false };
    };

    /**
     * Calculate expected waste breakdown for a process
     *
     * @param {Object} options
     * @param {number} options.inputBF - Input board feet
     * @param {number} options.kerfLoss - Kerf loss percentage
     * @param {number} options.shrinkage - Shrinkage percentage
     * @param {number} options.defectRate - Defect rate percentage
     * @returns {Object} Waste breakdown
     */
    const calculateWasteBreakdown = (options) => {
        const { inputBF, kerfLoss = 0, shrinkage = 0, defectRate = 0 } = options;

        const kerfBF = inputBF * (kerfLoss / 100);
        const shrinkageBF = inputBF * (shrinkage / 100);
        const defectBF = inputBF * (defectRate / 100);
        const totalWasteBF = kerfBF + shrinkageBF + defectBF;
        const outputBF = inputBF - totalWasteBF;

        return {
            inputBF: BFCalculator.roundTo(inputBF, PRECISION.BF),
            kerfBF: BFCalculator.roundTo(kerfBF, PRECISION.BF),
            shrinkageBF: BFCalculator.roundTo(shrinkageBF, PRECISION.BF),
            defectBF: BFCalculator.roundTo(defectBF, PRECISION.BF),
            totalWasteBF: BFCalculator.roundTo(totalWasteBF, PRECISION.BF),
            outputBF: BFCalculator.roundTo(outputBF, PRECISION.BF),
            actualYieldPct: BFCalculator.roundTo((outputBF / inputBF) * 100, PRECISION.PERCENTAGE)
        };
    };

    /**
     * Create a by-product record
     *
     * @param {Object} options
     * @param {number} options.workOrderId - Source work order ID
     * @param {number} [options.sourceItemId] - Source item ID
     * @param {number} options.outputItemId - By-product item ID
     * @param {number} options.quantity - Quantity
     * @param {number} [options.boardFeet] - Board feet
     * @param {string} [options.byproductType] - By-product type
     * @param {string} [options.disposition] - Disposition
     * @param {number} [options.locationId] - Location ID
     * @param {string} [options.notes] - Notes
     * @returns {Object} Result with by-product record ID
     */
    const createByproduct = (options) => {
        const {
            workOrderId,
            sourceItemId,
            outputItemId,
            quantity,
            boardFeet,
            byproductType,
            disposition,
            locationId,
            notes
        } = options;

        try {
            const byproductRec = record.create({
                type: RECORD_TYPES.BYPRODUCT,
                isDynamic: true
            });

            // Required fields
            byproductRec.setValue({ fieldId: BYPRODUCT_FIELDS.SOURCE_WO, value: workOrderId });
            byproductRec.setValue({ fieldId: BYPRODUCT_FIELDS.OUTPUT_ITEM, value: outputItemId });
            byproductRec.setValue({ fieldId: BYPRODUCT_FIELDS.QUANTITY, value: quantity });
            byproductRec.setValue({ fieldId: BYPRODUCT_FIELDS.DATE, value: new Date() });

            // Optional fields
            if (sourceItemId) {
                byproductRec.setValue({ fieldId: BYPRODUCT_FIELDS.SOURCE_ITEM, value: sourceItemId });
            }
            if (boardFeet) {
                byproductRec.setValue({ fieldId: BYPRODUCT_FIELDS.BOARD_FEET, value: boardFeet });
            }
            if (byproductType) {
                byproductRec.setValue({ fieldId: BYPRODUCT_FIELDS.TYPE, value: byproductType });
            }
            if (disposition) {
                byproductRec.setValue({ fieldId: BYPRODUCT_FIELDS.DISPOSITION, value: disposition });
            }
            if (locationId) {
                byproductRec.setValue({ fieldId: BYPRODUCT_FIELDS.LOCATION, value: locationId });
            }
            if (notes) {
                byproductRec.setValue({ fieldId: BYPRODUCT_FIELDS.NOTES, value: notes });
            }

            const byproductId = byproductRec.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });

            log.audit('createByproduct', {
                workOrderId,
                byproductId,
                outputItemId,
                quantity,
                boardFeet
            });

            return {
                success: true,
                byproductId: byproductId
            };

        } catch (e) {
            log.error('createByproduct', e);
            return {
                success: false,
                error: e.message
            };
        }
    };

    /**
     * Create multiple by-products from waste breakdown
     *
     * @param {Object} options
     * @param {number} options.workOrderId - Source work order ID
     * @param {number} options.sourceItemId - Source item ID
     * @param {Object} options.wasteBreakdown - Waste breakdown from calculateWasteBreakdown
     * @param {Object} options.byproductItems - Map of by-product type to item ID
     * @param {number} [options.locationId] - Location ID
     * @returns {Object} Results
     */
    const createByproductsFromWaste = (options) => {
        const { workOrderId, sourceItemId, wasteBreakdown, byproductItems, locationId } = options;

        const results = {
            success: true,
            created: [],
            errors: []
        };

        // Create sawdust from kerf loss
        if (wasteBreakdown.kerfBF > 0 && byproductItems.sawdust) {
            const sawdustResult = createByproduct({
                workOrderId,
                sourceItemId,
                outputItemId: byproductItems.sawdust,
                quantity: wasteBreakdown.kerfBF,
                boardFeet: wasteBreakdown.kerfBF,
                byproductType: Constants.BYPRODUCT_TYPES.SAWDUST,
                disposition: Constants.DISPOSITION_TYPES.FUEL,
                locationId,
                notes: 'Kerf loss from processing'
            });

            if (sawdustResult.success) {
                results.created.push(sawdustResult.byproductId);
            } else {
                results.errors.push(sawdustResult.error);
            }
        }

        // Create chips from defects
        if (wasteBreakdown.defectBF > 0 && byproductItems.chips) {
            const chipsResult = createByproduct({
                workOrderId,
                sourceItemId,
                outputItemId: byproductItems.chips,
                quantity: wasteBreakdown.defectBF,
                boardFeet: wasteBreakdown.defectBF,
                byproductType: Constants.BYPRODUCT_TYPES.CHIPS,
                disposition: Constants.DISPOSITION_TYPES.SELL,
                locationId,
                notes: 'Defect removal from processing'
            });

            if (chipsResult.success) {
                results.created.push(chipsResult.byproductId);
            } else {
                results.errors.push(chipsResult.error);
            }
        }

        results.success = results.errors.length === 0;
        return results;
    };

    /**
     * Get by-products for a work order
     *
     * @param {number} workOrderId - Work order ID
     * @returns {Array} Array of by-product records
     */
    const getByproductsForWorkOrder = (workOrderId) => {
        try {
            const byproducts = [];

            search.create({
                type: RECORD_TYPES.BYPRODUCT,
                filters: [
                    [BYPRODUCT_FIELDS.SOURCE_WO, 'anyof', workOrderId]
                ],
                columns: [
                    BYPRODUCT_FIELDS.OUTPUT_ITEM,
                    BYPRODUCT_FIELDS.QUANTITY,
                    BYPRODUCT_FIELDS.BOARD_FEET,
                    BYPRODUCT_FIELDS.TYPE,
                    BYPRODUCT_FIELDS.DISPOSITION,
                    BYPRODUCT_FIELDS.DATE
                ]
            }).run().each((result) => {
                byproducts.push({
                    id: result.id,
                    outputItemId: result.getValue(BYPRODUCT_FIELDS.OUTPUT_ITEM),
                    quantity: parseFloat(result.getValue(BYPRODUCT_FIELDS.QUANTITY)) || 0,
                    boardFeet: parseFloat(result.getValue(BYPRODUCT_FIELDS.BOARD_FEET)) || 0,
                    type: result.getValue(BYPRODUCT_FIELDS.TYPE),
                    disposition: result.getValue(BYPRODUCT_FIELDS.DISPOSITION),
                    date: result.getValue(BYPRODUCT_FIELDS.DATE)
                });
                return true;
            });

            return byproducts;

        } catch (e) {
            log.error('getByproductsForWorkOrder', e);
            return [];
        }
    };

    /**
     * Calculate total by-product value for a work order
     *
     * @param {number} workOrderId - Work order ID
     * @returns {Object} Totals
     */
    const getByproductTotals = (workOrderId) => {
        const byproducts = getByproductsForWorkOrder(workOrderId);

        let totalQuantity = 0;
        let totalBF = 0;

        byproducts.forEach(bp => {
            totalQuantity += bp.quantity;
            totalBF += bp.boardFeet;
        });

        return {
            count: byproducts.length,
            totalQuantity: BFCalculator.roundTo(totalQuantity, PRECISION.BF),
            totalBF: BFCalculator.roundTo(totalBF, PRECISION.BF)
        };
    };

    /**
     * Link by-product to tally sheet (for inventory by-products)
     *
     * @param {number} byproductId - By-product record ID
     * @param {number} tallyId - Tally sheet ID
     * @returns {Object} Result
     */
    const linkByproductToTally = (byproductId, tallyId) => {
        try {
            record.submitFields({
                type: RECORD_TYPES.BYPRODUCT,
                id: byproductId,
                values: {
                    [BYPRODUCT_FIELDS.CREATED_TALLY]: tallyId
                }
            });

            return { success: true };
        } catch (e) {
            log.error('linkByproductToTally', e);
            return { success: false, error: e.message };
        }
    };

    return {
        getProcessTarget,
        calculateWasteBreakdown,
        createByproduct,
        createByproductsFromWaste,
        getByproductsForWorkOrder,
        getByproductTotals,
        linkByproductToTally
    };
});
