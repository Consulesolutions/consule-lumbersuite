/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Estimate Client Script
 * Provides real-time BF calculations and UOM conversion on Estimates
 *
 * Key Functions:
 * - Real-time BF calculation as fields change
 * - Dynamic UOM selection with conversion preview
 * - Dimension override handling
 * - Price per BF calculation
 * - Margin preview
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
    Validation
) => {

    const LINE_FIELDS = Constants.LINE_FIELDS;
    const ITEM_FIELDS = Constants.ITEM_FIELDS;
    const BODY_FIELDS = Constants.BODY_FIELDS;
    const UOM_CODES = Constants.UOM_CODES;
    const PRECISION = Constants.PRECISION;

    // Cache for item data
    const itemCache = {};

    // Flag to prevent recursive field changes
    let isCalculating = false;

    /**
     * pageInit - Initialize the form
     *
     * @param {Object} context
     */
    const pageInit = (context) => {
        const rec = context.currentRecord;
        const mode = context.mode;

        console.log('CLS Estimate CS: pageInit', mode);

        try {
            // Check if LumberSuite is enabled
            if (!SettingsDAO.isDynamicUomEnabled()) {
                console.log('CLS Estimate CS: Dynamic UOM disabled');
                return;
            }

            // Show status message
            showModuleStatus();

            // Calculate totals on load for edit mode
            if (mode === 'edit') {
                calculateTotals(rec);
            }

        } catch (e) {
            console.error('CLS Estimate CS: pageInit error', e);
        }
    };

    /**
     * Show module status message
     */
    const showModuleStatus = () => {
        try {
            const msg = message.create({
                title: 'LumberSuite Active',
                message: 'BF conversion enabled. Select a Selling UOM and enter dimensions for lumber items.',
                type: message.Type.INFORMATION
            });
            msg.show({ duration: 5000 });
        } catch (e) {
            // Silent fail
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
            // Only process item sublist
            if (sublistId !== 'item') {
                return;
            }

            // List of fields that trigger recalculation
            const triggerFields = [
                'item',
                LINE_FIELDS.SELLING_UOM,
                LINE_FIELDS.DISPLAY_QTY,
                LINE_FIELDS.DIM_THICKNESS,
                LINE_FIELDS.DIM_WIDTH,
                LINE_FIELDS.DIM_LENGTH,
                'quantity',
                'rate',
                'amount'
            ];

            if (!triggerFields.includes(fieldId)) {
                return;
            }

            console.log('CLS Estimate CS: fieldChanged', { fieldId, line });

            isCalculating = true;

            switch (fieldId) {
                case 'item':
                    handleItemChange(rec, line);
                    break;

                case LINE_FIELDS.SELLING_UOM:
                    handleUOMChange(rec, line);
                    break;

                case LINE_FIELDS.DISPLAY_QTY:
                case LINE_FIELDS.DIM_THICKNESS:
                case LINE_FIELDS.DIM_WIDTH:
                case LINE_FIELDS.DIM_LENGTH:
                    calculateLineBF(rec, line);
                    break;

                case 'quantity':
                    syncQuantityToDisplayQty(rec, line);
                    break;

                case 'rate':
                case 'amount':
                    calculatePricePerBF(rec, line);
                    break;
            }

        } catch (e) {
            console.error('CLS Estimate CS: fieldChanged error', e);
        } finally {
            isCalculating = false;
        }
    };

    /**
     * Handle item field change
     *
     * @param {Record} rec
     * @param {number} line
     */
    const handleItemChange = (rec, line) => {
        const itemId = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item'
        });

        if (!itemId) return;

        const itemData = getItemData(itemId);

        if (!itemData.isLumber) {
            clearLumberFields(rec);
            return;
        }

        // Set default dimensions from item
        setDefaultDimensions(rec, itemData);

        // Set default selling UOM to BF
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.SELLING_UOM,
            value: UOM_CODES.BOARD_FEET,
            ignoreFieldChange: true
        });

        // Show lumber item info
        showItemInfo(itemData);

        // Calculate BF if quantity exists
        calculateLineBF(rec, line);
    };

    /**
     * Set default dimensions from item data
     */
    const setDefaultDimensions = (rec, itemData) => {
        if (itemData.thickness) {
            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.DIM_THICKNESS,
                value: itemData.thickness,
                ignoreFieldChange: true
            });
        }

        if (itemData.width) {
            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.DIM_WIDTH,
                value: itemData.width,
                ignoreFieldChange: true
            });
        }

        if (itemData.length) {
            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.DIM_LENGTH,
                value: itemData.length,
                ignoreFieldChange: true
            });
        }
    };

    /**
     * Show item information message
     */
    const showItemInfo = (itemData) => {
        try {
            const dims = `${itemData.thickness}" × ${itemData.width}" × ${itemData.length}'`;
            const bfPerPiece = BFCalculator.calculateBF({
                thickness: itemData.thickness,
                width: itemData.width,
                length: itemData.length
            });

            const msg = message.create({
                title: 'Lumber Item Selected',
                message: `Dimensions: ${dims} | BF/piece: ${BFCalculator.roundTo(bfPerPiece, 4)}`,
                type: message.Type.CONFIRMATION
            });
            msg.show({ duration: 3000 });
        } catch (e) {
            // Silent fail
        }
    };

    /**
     * Handle UOM field change
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

        // Get dimensions
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
            thickness, width, length
        });

        if (!dimValidation.isValid) {
            dialog.alert({
                title: 'Dimensions Required',
                message: dimValidation.errors.join('\n') +
                    '\n\nPlease enter the required dimensions for this UOM.'
            });
        }

        // Show conversion factor
        showConversionFactor(sellingUom, thickness, width, length);

        // Recalculate BF
        calculateLineBF(rec, line);
    };

    /**
     * Show conversion factor message
     */
    const showConversionFactor = (uomCode, thickness, width, length) => {
        try {
            const matrix = ConversionEngine.calculateConversionMatrix(thickness, width, length);
            const description = matrix.descriptions[uomCode];

            if (description) {
                const msg = message.create({
                    title: 'Conversion Factor',
                    message: description,
                    type: message.Type.INFORMATION
                });
                msg.show({ duration: 4000 });
            }
        } catch (e) {
            // Silent fail
        }
    };

    /**
     * Sync quantity field to display qty
     */
    const syncQuantityToDisplayQty = (rec, line) => {
        const sellingUom = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.SELLING_UOM
        });

        // Only sync if UOM is BF or not set
        if (!sellingUom || sellingUom === UOM_CODES.BOARD_FEET) {
            const qty = rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'quantity'
            });

            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.DISPLAY_QTY,
                value: qty,
                ignoreFieldChange: true
            });

            calculateLineBF(rec, line);
        }
    };

    /**
     * Calculate BF for current line
     */
    const calculateLineBF = (rec, line) => {
        const itemId = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item'
        });

        if (!itemId) return;

        const itemData = getItemData(itemId);
        if (!itemData.isLumber) return;

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

        if (displayQty <= 0) return;

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
            console.warn('CLS Estimate CS: Conversion failed', conversion.error);
            return;
        }

        const precision = SettingsDAO.getBFPrecision();

        // Set calculated BF
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.CALCULATED_BF,
            value: BFCalculator.roundTo(conversion.boardFeet, precision),
            ignoreFieldChange: true
        });

        // Set conversion factor
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.CONVERSION_FACTOR,
            value: BFCalculator.roundTo(conversion.conversionFactor, PRECISION.FACTOR),
            ignoreFieldChange: true
        });

        // Calculate BF cost
        calculateBFCost(rec, itemData, conversion.boardFeet);

        // Calculate price per BF
        calculatePricePerBF(rec, line);

        // Update totals
        calculateTotals(rec);

        console.log('CLS Estimate CS: BF calculated', {
            displayQty,
            sellingUom,
            boardFeet: conversion.boardFeet,
            conversionFactor: conversion.conversionFactor
        });
    };

    /**
     * Calculate BF cost
     */
    const calculateBFCost = (rec, itemData, boardFeet) => {
        const bfCost = itemData.baseBFCost || 0;

        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.BF_UNIT_COST,
            value: BFCalculator.roundTo(bfCost, PRECISION.CURRENCY),
            ignoreFieldChange: true
        });

        const extendedCost = boardFeet * bfCost;
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.EXTENDED_BF_COST,
            value: BFCalculator.roundTo(extendedCost, PRECISION.CURRENCY),
            ignoreFieldChange: true
        });
    };

    /**
     * Calculate price per BF
     */
    const calculatePricePerBF = (rec, line) => {
        const calculatedBF = parseFloat(rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.CALCULATED_BF
        })) || 0;

        const amount = parseFloat(rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'amount'
        })) || 0;

        if (calculatedBF > 0 && amount > 0) {
            const pricePerBF = amount / calculatedBF;
            console.log('CLS Estimate CS: Price per BF', BFCalculator.roundTo(pricePerBF, PRECISION.CURRENCY));
        }
    };

    /**
     * Calculate totals for the estimate
     */
    const calculateTotals = (rec) => {
        try {
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            let totalBF = 0;
            let totalBFCost = 0;

            for (let i = 0; i < lineCount; i++) {
                totalBF += parseFloat(rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.CALCULATED_BF,
                    line: i
                })) || 0;

                totalBFCost += parseFloat(rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.EXTENDED_BF_COST,
                    line: i
                })) || 0;
            }

            rec.setValue({
                fieldId: BODY_FIELDS.TOTAL_BF,
                value: BFCalculator.roundTo(totalBF, SettingsDAO.getBFPrecision()),
                ignoreFieldChange: true
            });

        } catch (e) {
            console.error('CLS Estimate CS: calculateTotals error', e);
        }
    };

    /**
     * Clear lumber fields for non-lumber items
     */
    const clearLumberFields = (rec) => {
        const fields = [
            LINE_FIELDS.SELLING_UOM,
            LINE_FIELDS.DISPLAY_QTY,
            LINE_FIELDS.DIM_THICKNESS,
            LINE_FIELDS.DIM_WIDTH,
            LINE_FIELDS.DIM_LENGTH,
            LINE_FIELDS.CALCULATED_BF,
            LINE_FIELDS.CONVERSION_FACTOR,
            LINE_FIELDS.BF_UNIT_COST,
            LINE_FIELDS.EXTENDED_BF_COST
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
                    ITEM_FIELDS.BASE_BF_COST,
                    ITEM_FIELDS.SPECIES,
                    ITEM_FIELDS.GRADE
                ]
            });

            const itemData = {
                isLumber: lookupResult[ITEM_FIELDS.IS_LUMBER] === true,
                thickness: parseFloat(lookupResult[ITEM_FIELDS.NOMINAL_THICKNESS]) || 0,
                width: parseFloat(lookupResult[ITEM_FIELDS.NOMINAL_WIDTH]) || 0,
                length: parseFloat(lookupResult[ITEM_FIELDS.NOMINAL_LENGTH]) || 0,
                piecesPerBundle: parseInt(lookupResult[ITEM_FIELDS.PIECES_PER_BUNDLE], 10) || 1,
                allowDynamicDims: lookupResult[ITEM_FIELDS.ALLOW_DYNAMIC_DIMS] === true,
                baseBFCost: parseFloat(lookupResult[ITEM_FIELDS.BASE_BF_COST]) || 0
            };

            itemCache[itemId] = itemData;
            return itemData;

        } catch (e) {
            console.error('CLS Estimate CS: getItemData error', e);
            return { isLumber: false };
        }
    };

    /**
     * validateLine - Validate line before commit
     */
    const validateLine = (context) => {
        const { currentRecord: rec, sublistId } = context;

        if (sublistId !== 'item') return true;

        try {
            const itemId = rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'item'
            });

            if (!itemId) return true;

            const itemData = getItemData(itemId);
            if (!itemData.isLumber) return true;

            // Validate UOM and dimensions
            const sellingUom = rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.SELLING_UOM
            }) || UOM_CODES.BOARD_FEET;

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

            const dimValidation = Validation.validateDimensionsForUOM(sellingUom, {
                thickness, width, length
            });

            if (!dimValidation.isValid) {
                dialog.alert({
                    title: 'Validation Error',
                    message: dimValidation.errors.join('\n')
                });
                return false;
            }

            return true;

        } catch (e) {
            console.error('CLS Estimate CS: validateLine error', e);
            return true;
        }
    };

    /**
     * sublistChanged - Handle sublist changes
     */
    const sublistChanged = (context) => {
        const { currentRecord: rec, sublistId } = context;

        if (sublistId !== 'item') return;

        calculateTotals(rec);
    };

    /**
     * saveRecord - Final validation
     */
    const saveRecord = (context) => {
        const rec = context.currentRecord;

        try {
            const totalBF = parseFloat(rec.getValue({ fieldId: BODY_FIELDS.TOTAL_BF })) || 0;
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
                    break;
                }
            }

            if (hasLumberItems && totalBF <= 0) {
                return confirm('Total BF is zero for lumber items. Continue anyway?');
            }

            return true;

        } catch (e) {
            console.error('CLS Estimate CS: saveRecord error', e);
            return true;
        }
    };

    /**
     * View conversion summary (button handler)
     */
    const viewConversionSummary = () => {
        try {
            const rec = currentRecord.get();
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            const lines = [];

            for (let i = 0; i < lineCount; i++) {
                const calculatedBF = rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.CALCULATED_BF,
                    line: i
                });

                if (calculatedBF) {
                    const itemText = rec.getSublistText({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: i
                    });
                    const displayQty = rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.DISPLAY_QTY,
                        line: i
                    });
                    const sellingUom = rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.SELLING_UOM,
                        line: i
                    });
                    const factor = rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.CONVERSION_FACTOR,
                        line: i
                    });

                    lines.push(
                        `Line ${i + 1}: ${itemText}\n` +
                        `  ${displayQty} ${sellingUom} × ${factor} = ${calculatedBF} BF`
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
            console.error('CLS Estimate CS: viewConversionSummary error', e);
        }
    };

    // Expose for button
    window.viewConversionSummary = viewConversionSummary;

    return {
        pageInit,
        fieldChanged,
        validateLine,
        sublistChanged,
        saveRecord
    };
});
