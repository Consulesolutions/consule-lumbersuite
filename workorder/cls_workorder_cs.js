/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Work Order Client Script
 * Provides real-time BF calculations and UOM conversion on Work Orders
 *
 * Key Functions:
 * - Real-time BF calculation on field changes
 * - Dynamic UOM selection with conversion preview
 * - Dimension override handling
 * - Yield percentage management
 * - Tally sheet selection assistance
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    'N/currentRecord',
    'N/search',
    'N/ui/dialog',
    'N/ui/message',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_conversion_engine',
    '../lib/cls_dimension_resolver',
    '../lib/cls_bf_calculator',
    '../lib/cls_yield_service',
    '../lib/cls_validation'
], (
    currentRecord,
    search,
    dialog,
    message,
    Constants,
    SettingsDAO,
    ConversionEngine,
    DimensionResolver,
    BFCalculator,
    YieldService,
    Validation
) => {

    const LINE_FIELDS = Constants.LINE_FIELDS;
    const ITEM_FIELDS = Constants.ITEM_FIELDS;
    const BODY_FIELDS = Constants.BODY_FIELDS;
    const UOM_CODES = Constants.UOM_CODES;

    // Cache for item data to reduce lookups
    const itemCache = {};

    // Flag to prevent recursive field changes
    let isCalculating = false;

    /**
     * pageInit - Initialize the form
     *
     * @param {Object} context
     * @param {Record} context.currentRecord
     * @param {string} context.mode
     */
    const pageInit = (context) => {
        const rec = context.currentRecord;
        const mode = context.mode;

        console.log('CLS Work Order CS: pageInit', mode);

        try {
            // Check if LumberSuite is enabled
            if (!SettingsDAO.isDynamicUomEnabled()) {
                console.log('CLS Work Order CS: Dynamic UOM disabled');
                return;
            }

            // Display module status message
            showModuleStatus();

            // Calculate totals on load
            if (mode === 'edit') {
                calculateTotalBF(rec);
            }

        } catch (e) {
            console.error('CLS Work Order CS: pageInit error', e);
        }
    };

    /**
     * Show module status message
     */
    const showModuleStatus = () => {
        try {
            const status = SettingsDAO.getModuleStatus();
            const enabledModules = [];

            if (status.dynamicUom) enabledModules.push('UOM Conversion');
            if (status.yieldTracking) enabledModules.push('Yield Tracking');
            if (status.wasteTracking) enabledModules.push('Waste Tracking');
            if (status.tallySheets) enabledModules.push('Tally Sheets');

            if (enabledModules.length > 0) {
                const msg = message.create({
                    title: 'LumberSuite Active',
                    message: `Enabled: ${enabledModules.join(', ')}`,
                    type: message.Type.INFORMATION
                });
                msg.show({ duration: 5000 });
            }
        } catch (e) {
            // Silent fail - status message is not critical
        }
    };

    /**
     * fieldChanged - Handle field changes
     *
     * @param {Object} context
     * @param {Record} context.currentRecord
     * @param {string} context.sublistId
     * @param {string} context.fieldId
     * @param {number} context.line
     */
    const fieldChanged = (context) => {
        const { currentRecord: rec, sublistId, fieldId, line } = context;

        // Prevent recursive calls
        if (isCalculating) {
            return;
        }

        try {
            // Only process item sublist
            if (sublistId !== 'item') {
                return;
            }

            // Check if this is a lumber-related field change
            const lumberFields = [
                'item',
                LINE_FIELDS.SELLING_UOM,
                LINE_FIELDS.DISPLAY_QTY,
                LINE_FIELDS.DIM_THICKNESS,
                LINE_FIELDS.DIM_WIDTH,
                LINE_FIELDS.DIM_LENGTH,
                LINE_FIELDS.YIELD_PCT,
                'quantity'
            ];

            if (!lumberFields.includes(fieldId)) {
                return;
            }

            console.log('CLS Work Order CS: fieldChanged', { fieldId, line });

            isCalculating = true;

            // Handle item change - load defaults
            if (fieldId === 'item') {
                handleItemChange(rec, line);
            }

            // Handle UOM change
            if (fieldId === LINE_FIELDS.SELLING_UOM) {
                handleUOMChange(rec, line);
            }

            // Handle quantity or dimension changes - recalculate BF
            if (fieldId === LINE_FIELDS.DISPLAY_QTY ||
                fieldId === LINE_FIELDS.DIM_THICKNESS ||
                fieldId === LINE_FIELDS.DIM_WIDTH ||
                fieldId === LINE_FIELDS.DIM_LENGTH ||
                fieldId === LINE_FIELDS.YIELD_PCT) {
                calculateLineBF(rec, line);
            }

            // Handle standard quantity field - sync with display qty if BF
            if (fieldId === 'quantity') {
                const sellingUom = rec.getCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.SELLING_UOM
                });

                if (!sellingUom || sellingUom === UOM_CODES.BOARD_FEET) {
                    rec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.DISPLAY_QTY,
                        value: rec.getCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'quantity'
                        }),
                        ignoreFieldChange: true
                    });
                }
            }

        } catch (e) {
            console.error('CLS Work Order CS: fieldChanged error', e);
        } finally {
            isCalculating = false;
        }
    };

    /**
     * Handle item field change - load item defaults
     *
     * @param {Record} rec
     * @param {number} line
     */
    const handleItemChange = (rec, line) => {
        const itemId = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item'
        });

        if (!itemId) {
            return;
        }

        // Check if lumber item
        const itemData = getItemData(itemId);

        if (!itemData.isLumber) {
            // Clear lumber fields for non-lumber items
            clearLumberFields(rec);
            return;
        }

        // Set default dimensions from item
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DIM_THICKNESS,
            value: itemData.thickness || '',
            ignoreFieldChange: true
        });

        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DIM_WIDTH,
            value: itemData.width || '',
            ignoreFieldChange: true
        });

        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DIM_LENGTH,
            value: itemData.length || '',
            ignoreFieldChange: true
        });

        // Set default selling UOM to BF
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.SELLING_UOM,
            value: UOM_CODES.BOARD_FEET,
            ignoreFieldChange: true
        });

        // Set default yield if enabled
        if (SettingsDAO.isYieldEnabled()) {
            const defaultYield = YieldService.getItemDefaultYield(itemId);
            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.YIELD_PCT,
                value: defaultYield,
                ignoreFieldChange: true
            });
        }

        // Calculate BF for any existing quantity
        calculateLineBF(rec, line);
    };

    /**
     * Handle UOM field change
     *
     * @param {Record} rec
     * @param {number} line
     */
    const handleUOMChange = (rec, line) => {
        const sellingUom = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.SELLING_UOM
        });

        const itemId = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item'
        });

        if (!itemId) return;

        // Get current dimensions
        const thickness = parseFloat(rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DIM_THICKNESS
        })) || 0;

        const width = parseFloat(rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DIM_WIDTH
        })) || 0;

        const length = parseFloat(rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DIM_LENGTH
        })) || 0;

        // Validate dimensions for selected UOM
        const dimValidation = Validation.validateDimensionsForUOM(sellingUom, {
            thickness,
            width,
            length
        });

        if (!dimValidation.isValid) {
            dialog.alert({
                title: 'Dimension Required',
                message: dimValidation.errors.join('\n')
            });
        }

        // Show conversion info
        showConversionPreview(sellingUom, thickness, width, length);

        // Recalculate BF
        calculateLineBF(rec, line);
    };

    /**
     * Show conversion preview message
     */
    const showConversionPreview = (uomCode, thickness, width, length) => {
        try {
            const matrix = ConversionEngine.calculateConversionMatrix(thickness, width, length);

            if (matrix.descriptions[uomCode]) {
                const msg = message.create({
                    title: 'Conversion Factor',
                    message: matrix.descriptions[uomCode],
                    type: message.Type.INFORMATION
                });
                msg.show({ duration: 3000 });
            }
        } catch (e) {
            // Silent fail
        }
    };

    /**
     * Calculate BF for current line
     *
     * @param {Record} rec
     * @param {number} line
     */
    const calculateLineBF = (rec, line) => {
        const itemId = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item'
        });

        if (!itemId) return;

        // Check if lumber item
        const itemData = getItemData(itemId);
        if (!itemData.isLumber) {
            return;
        }

        // Get values
        const sellingUom = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.SELLING_UOM
        }) || UOM_CODES.BOARD_FEET;

        const displayQty = parseFloat(rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DISPLAY_QTY
        })) || parseFloat(rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'quantity'
        })) || 0;

        const thickness = parseFloat(rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DIM_THICKNESS
        })) || itemData.thickness || 0;

        const width = parseFloat(rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DIM_WIDTH
        })) || itemData.width || 0;

        const length = parseFloat(rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.DIM_LENGTH
        })) || itemData.length || 0;

        if (displayQty <= 0) {
            return;
        }

        // Convert to BF
        const conversion = ConversionEngine.convertToBoardFeet({
            sourceUom: sellingUom,
            sourceQty: displayQty,
            thickness: thickness,
            width: width,
            length: length,
            piecesPerBundle: itemData.piecesPerBundle || 1
        });

        if (!conversion.isValid) {
            console.warn('CLS Work Order CS: Conversion failed', conversion.error);
            return;
        }

        let theoreticalBF = conversion.boardFeet;
        let calculatedBF = theoreticalBF;

        // Apply yield if enabled
        if (SettingsDAO.isYieldEnabled()) {
            const yieldPct = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.YIELD_PCT
            })) || SettingsDAO.getDefaultYield();

            // Calculate raw material needed based on yield
            calculatedBF = YieldService.calculateTheoreticalBF(theoreticalBF, yieldPct);

            // Set theoretical BF (finished goods requirement)
            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.THEORETICAL_BF,
                value: BFCalculator.roundTo(theoreticalBF, SettingsDAO.getBFPrecision()),
                ignoreFieldChange: true
            });
        }

        // Set calculated BF (raw material to consume)
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.CALCULATED_BF,
            value: BFCalculator.roundTo(calculatedBF, SettingsDAO.getBFPrecision()),
            ignoreFieldChange: true
        });

        // Set conversion factor
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.CONVERSION_FACTOR,
            value: BFCalculator.roundTo(conversion.conversionFactor, Constants.PRECISION.FACTOR),
            ignoreFieldChange: true
        });

        // Update quantity field with BF value
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            value: BFCalculator.roundTo(calculatedBF, SettingsDAO.getBFPrecision()),
            ignoreFieldChange: true
        });

        console.log('CLS Work Order CS: Line BF calculated', {
            displayQty,
            sellingUom,
            theoreticalBF,
            calculatedBF,
            conversionFactor: conversion.conversionFactor
        });

        // Update total
        calculateTotalBF(rec);
    };

    /**
     * Calculate total BF for the work order
     *
     * @param {Record} rec
     */
    const calculateTotalBF = (rec) => {
        try {
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            let totalBF = 0;
            let totalTheoreticalBF = 0;

            for (let i = 0; i < lineCount; i++) {
                const calculatedBF = parseFloat(rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.CALCULATED_BF,
                    line: i
                })) || 0;

                const theoreticalBF = parseFloat(rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.THEORETICAL_BF,
                    line: i
                })) || 0;

                totalBF += calculatedBF;
                totalTheoreticalBF += theoreticalBF;
            }

            rec.setValue({
                fieldId: BODY_FIELDS.TOTAL_BF,
                value: BFCalculator.roundTo(totalBF, SettingsDAO.getBFPrecision()),
                ignoreFieldChange: true
            });

            if (SettingsDAO.isYieldEnabled()) {
                rec.setValue({
                    fieldId: BODY_FIELDS.TOTAL_THEORETICAL_BF,
                    value: BFCalculator.roundTo(totalTheoreticalBF, SettingsDAO.getBFPrecision()),
                    ignoreFieldChange: true
                });
            }

        } catch (e) {
            console.error('CLS Work Order CS: calculateTotalBF error', e);
        }
    };

    /**
     * Clear lumber fields for non-lumber items
     *
     * @param {Record} rec
     */
    const clearLumberFields = (rec) => {
        const fields = [
            LINE_FIELDS.SELLING_UOM,
            LINE_FIELDS.DISPLAY_QTY,
            LINE_FIELDS.DIM_THICKNESS,
            LINE_FIELDS.DIM_WIDTH,
            LINE_FIELDS.DIM_LENGTH,
            LINE_FIELDS.CALCULATED_BF,
            LINE_FIELDS.THEORETICAL_BF,
            LINE_FIELDS.YIELD_PCT,
            LINE_FIELDS.CONVERSION_FACTOR
        ];

        fields.forEach((fieldId) => {
            try {
                rec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: fieldId,
                    value: '',
                    ignoreFieldChange: true
                });
            } catch (e) {
                // Field may not exist
            }
        });
    };

    /**
     * Get item data with caching
     *
     * @param {number} itemId
     * @returns {Object} Item data
     */
    const getItemData = (itemId) => {
        if (itemCache[itemId]) {
            return itemCache[itemId];
        }

        try {
            const lookupResult = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: [
                    ITEM_FIELDS.IS_LUMBER,
                    ITEM_FIELDS.NOMINAL_THICKNESS,
                    ITEM_FIELDS.NOMINAL_WIDTH,
                    ITEM_FIELDS.NOMINAL_LENGTH,
                    ITEM_FIELDS.PIECES_PER_BUNDLE,
                    ITEM_FIELDS.ALLOW_DYNAMIC_DIMS,
                    ITEM_FIELDS.DEFAULT_YIELD_PCT
                ]
            });

            const itemData = {
                isLumber: lookupResult[ITEM_FIELDS.IS_LUMBER] === true,
                thickness: parseFloat(lookupResult[ITEM_FIELDS.NOMINAL_THICKNESS]) || 0,
                width: parseFloat(lookupResult[ITEM_FIELDS.NOMINAL_WIDTH]) || 0,
                length: parseFloat(lookupResult[ITEM_FIELDS.NOMINAL_LENGTH]) || 0,
                piecesPerBundle: parseInt(lookupResult[ITEM_FIELDS.PIECES_PER_BUNDLE], 10) || 1,
                allowDynamicDims: lookupResult[ITEM_FIELDS.ALLOW_DYNAMIC_DIMS] === true,
                defaultYieldPct: parseFloat(lookupResult[ITEM_FIELDS.DEFAULT_YIELD_PCT]) || 0
            };

            itemCache[itemId] = itemData;
            return itemData;

        } catch (e) {
            console.error('CLS Work Order CS: getItemData error', e);
            return {
                isLumber: false,
                thickness: 0,
                width: 0,
                length: 0,
                piecesPerBundle: 1,
                allowDynamicDims: false,
                defaultYieldPct: 0
            };
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

        if (sublistId !== 'item') {
            return true;
        }

        try {
            const itemId = rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'item'
            });

            if (!itemId) {
                return true;
            }

            // Check if lumber item
            const itemData = getItemData(itemId);
            if (!itemData.isLumber) {
                return true;
            }

            // Get selling UOM
            const sellingUom = rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.SELLING_UOM
            }) || UOM_CODES.BOARD_FEET;

            // Get dimensions
            const thickness = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.DIM_THICKNESS
            })) || itemData.thickness || 0;

            const width = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.DIM_WIDTH
            })) || itemData.width || 0;

            const length = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.DIM_LENGTH
            })) || itemData.length || 0;

            // Validate dimensions for UOM
            const dimValidation = Validation.validateDimensionsForUOM(sellingUom, {
                thickness,
                width,
                length
            });

            if (!dimValidation.isValid) {
                dialog.alert({
                    title: 'Validation Error',
                    message: dimValidation.errors.join('\n')
                });
                return false;
            }

            // Validate yield if enabled
            if (SettingsDAO.isYieldEnabled()) {
                const yieldPct = parseFloat(rec.getCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.YIELD_PCT
                })) || 0;

                const yieldValidation = Validation.validateYieldPercentage(yieldPct);
                if (!yieldValidation.isValid) {
                    dialog.alert({
                        title: 'Validation Error',
                        message: yieldValidation.errors.join('\n')
                    });
                    return false;
                }
            }

            return true;

        } catch (e) {
            console.error('CLS Work Order CS: validateLine error', e);
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

        if (sublistId !== 'item') {
            return;
        }

        // Recalculate total when lines change
        calculateTotalBF(rec);
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
            // Recalculate all lines before save
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            let hasLumberItems = false;

            for (let i = 0; i < lineCount; i++) {
                const itemId = rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });

                if (itemId && getItemData(itemId).isLumber) {
                    hasLumberItems = true;
                }
            }

            if (hasLumberItems) {
                const totalBF = parseFloat(rec.getValue({ fieldId: BODY_FIELDS.TOTAL_BF })) || 0;

                if (totalBF <= 0) {
                    const proceed = confirm('Total BF is zero. Are you sure you want to save?');
                    if (!proceed) {
                        return false;
                    }
                }
            }

            return true;

        } catch (e) {
            console.error('CLS Work Order CS: saveRecord error', e);
            return true;
        }
    };

    /**
     * Show conversion info popup (called from button)
     */
    const showConversionInfo = () => {
        try {
            const rec = currentRecord.get();
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            const lines = [];

            for (let i = 0; i < lineCount; i++) {
                const itemId = rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });

                const itemText = rec.getSublistText({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });

                const calculatedBF = rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.CALCULATED_BF,
                    line: i
                });

                const sellingUom = rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.SELLING_UOM,
                    line: i
                });

                const displayQty = rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.DISPLAY_QTY,
                    line: i
                });

                const conversionFactor = rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.CONVERSION_FACTOR,
                    line: i
                });

                if (calculatedBF) {
                    lines.push(
                        `Line ${i + 1}: ${itemText}\n` +
                        `  ${displayQty} ${sellingUom} × ${conversionFactor} = ${calculatedBF} BF`
                    );
                }
            }

            const totalBF = rec.getValue({ fieldId: BODY_FIELDS.TOTAL_BF });

            dialog.alert({
                title: 'BF Conversion Summary',
                message: lines.length > 0
                    ? lines.join('\n\n') + `\n\nTotal BF: ${totalBF}`
                    : 'No lumber items found.'
            });

        } catch (e) {
            console.error('CLS Work Order CS: showConversionInfo error', e);
        }
    };

    // Expose function for button
    window.showConversionInfo = showConversionInfo;

    return {
        pageInit,
        fieldChanged,
        validateLine,
        sublistChanged,
        saveRecord
    };
});
