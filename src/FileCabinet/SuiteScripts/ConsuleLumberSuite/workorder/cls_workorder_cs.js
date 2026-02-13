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
    '../lib/cls_bf_calculator'
], (
    currentRecord,
    search,
    dialog,
    message,
    Constants,
    BFCalculator
) => {

    const LINE_FIELDS = Constants.LINE_FIELDS;
    const ITEM_FIELDS = Constants.ITEM_FIELDS;
    const BODY_FIELDS = Constants.BODY_FIELDS;
    const UOM_CODES = Constants.UOM_CODES;
    const PRECISION = Constants.PRECISION;
    const DEFAULTS = Constants.DEFAULTS;

    // Cache for item data to reduce lookups
    const itemCache = {};

    // Settings cache
    let settingsCache = null;

    // Flag to prevent recursive field changes
    let isCalculating = false;

    /**
     * Get settings from cache or load via search (client-safe)
     */
    const getSettings = () => {
        if (settingsCache) {
            return settingsCache;
        }

        try {
            const settingsSearch = search.create({
                type: 'customrecord_cls_settings',
                filters: [],
                columns: [
                    'custrecord_cls_enable_dynamic_uom',
                    'custrecord_cls_enable_yield',
                    'custrecord_cls_default_yield',
                    'custrecord_cls_bf_precision'
                ]
            });

            settingsCache = {
                isDynamicUomEnabled: true,
                isYieldEnabled: false,
                defaultYield: DEFAULTS.YIELD_PCT,
                bfPrecision: DEFAULTS.BF_PRECISION
            };

            settingsSearch.run().each((result) => {
                settingsCache.isDynamicUomEnabled = result.getValue('custrecord_cls_enable_dynamic_uom') === true;
                settingsCache.isYieldEnabled = result.getValue('custrecord_cls_enable_yield') === true;
                settingsCache.defaultYield = parseFloat(result.getValue('custrecord_cls_default_yield')) || DEFAULTS.YIELD_PCT;
                settingsCache.bfPrecision = parseInt(result.getValue('custrecord_cls_bf_precision'), 10) || DEFAULTS.BF_PRECISION;
                return false;
            });

            return settingsCache;
        } catch (e) {
            console.error('Error loading settings:', e.message);
            return {
                isDynamicUomEnabled: true,
                isYieldEnabled: false,
                defaultYield: DEFAULTS.YIELD_PCT,
                bfPrecision: DEFAULTS.BF_PRECISION
            };
        }
    };

    /**
     * Convert source UOM to Board Feet (client-safe version)
     */
    const convertToBoardFeet = (params) => {
        const { sourceUom, sourceQty, thickness, width, length, piecesPerBundle = 1 } = params;
        const settings = getSettings();

        const qty = parseFloat(sourceQty) || 0;
        const t = parseFloat(thickness) || 0;
        const w = parseFloat(width) || 0;
        const l = parseFloat(length) || 0;
        const ppb = parseInt(piecesPerBundle, 10) || 1;

        if (qty <= 0) {
            return { boardFeet: 0, conversionFactor: 0, isValid: true, error: null };
        }

        let boardFeet = 0;
        let conversionFactor = 1;

        switch (sourceUom) {
            case UOM_CODES.BOARD_FEET:
                boardFeet = qty;
                conversionFactor = 1;
                break;

            case UOM_CODES.LINEAR_FEET:
                if (t <= 0 || w <= 0) {
                    return { boardFeet: 0, conversionFactor: 0, isValid: false, error: 'Thickness and width required for LF' };
                }
                conversionFactor = (t * w) / 12;
                boardFeet = qty * conversionFactor;
                break;

            case UOM_CODES.SQUARE_FEET:
                if (t <= 0) {
                    return { boardFeet: 0, conversionFactor: 0, isValid: false, error: 'Thickness required for SF' };
                }
                conversionFactor = t / 12;
                boardFeet = qty * conversionFactor;
                break;

            case UOM_CODES.MBF:
                conversionFactor = 1000;
                boardFeet = qty * conversionFactor;
                break;

            case UOM_CODES.MSF:
                if (t <= 0) {
                    return { boardFeet: 0, conversionFactor: 0, isValid: false, error: 'Thickness required for MSF' };
                }
                conversionFactor = (t / 12) * 1000;
                boardFeet = qty * conversionFactor;
                break;

            case UOM_CODES.EACH:
                if (t <= 0 || w <= 0 || l <= 0) {
                    return { boardFeet: 0, conversionFactor: 0, isValid: false, error: 'All dimensions required' };
                }
                conversionFactor = BFCalculator.calculateBF({ thickness: t, width: w, length: l });
                boardFeet = qty * conversionFactor;
                break;

            case UOM_CODES.BUNDLE:
                if (t <= 0 || w <= 0 || l <= 0) {
                    return { boardFeet: 0, conversionFactor: 0, isValid: false, error: 'All dimensions required' };
                }
                const bfPerPiece = BFCalculator.calculateBF({ thickness: t, width: w, length: l });
                conversionFactor = bfPerPiece * ppb;
                boardFeet = qty * conversionFactor;
                break;

            default:
                return { boardFeet: 0, conversionFactor: 0, isValid: false, error: `Unknown UOM: ${sourceUom}` };
        }

        return {
            boardFeet: BFCalculator.roundTo(boardFeet, settings.bfPrecision),
            conversionFactor: BFCalculator.roundTo(conversionFactor, PRECISION.FACTOR),
            isValid: true,
            error: null
        };
    };

    /**
     * pageInit - Initialize the form
     */
    const pageInit = (context) => {
        const rec = context.currentRecord;
        const mode = context.mode;

        console.log('CLS Work Order CS: pageInit', mode);

        try {
            const settings = getSettings();
            if (!settings.isDynamicUomEnabled) {
                console.log('CLS Work Order CS: Dynamic UOM disabled');
                return;
            }

            showModuleStatus();

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
            const settings = getSettings();
            const enabledModules = ['UOM Conversion'];
            if (settings.isYieldEnabled) enabledModules.push('Yield Tracking');

            const msg = message.create({
                title: 'LumberSuite Active',
                message: `Enabled: ${enabledModules.join(', ')}`,
                type: message.Type.INFORMATION
            });
            msg.show({ duration: 5000 });
        } catch (e) {
            // Silent fail
        }
    };

    /**
     * fieldChanged - Handle field changes
     */
    const fieldChanged = (context) => {
        const { currentRecord: rec, sublistId, fieldId, line } = context;

        if (isCalculating) return;

        try {
            if (sublistId !== 'item') return;

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

            if (!lumberFields.includes(fieldId)) return;

            console.log('CLS Work Order CS: fieldChanged', { fieldId, line });

            isCalculating = true;

            if (fieldId === 'item') {
                handleItemChange(rec, line);
            }

            if (fieldId === LINE_FIELDS.SELLING_UOM) {
                handleUOMChange(rec, line);
            }

            if (fieldId === LINE_FIELDS.DISPLAY_QTY ||
                fieldId === LINE_FIELDS.DIM_THICKNESS ||
                fieldId === LINE_FIELDS.DIM_WIDTH ||
                fieldId === LINE_FIELDS.DIM_LENGTH ||
                fieldId === LINE_FIELDS.YIELD_PCT) {
                calculateLineBF(rec, line);
            }

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

        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.SELLING_UOM,
            value: UOM_CODES.BOARD_FEET,
            ignoreFieldChange: true
        });

        // Set default yield if enabled
        const settings = getSettings();
        if (settings.isYieldEnabled) {
            const defaultYield = itemData.defaultYieldPct || settings.defaultYield;
            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.YIELD_PCT,
                value: defaultYield,
                ignoreFieldChange: true
            });
        }

        calculateLineBF(rec, line);
    };

    /**
     * Handle UOM field change
     */
    const handleUOMChange = (rec, line) => {
        const sellingUom = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.SELLING_UOM
        });

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
        const errors = validateDimensionsForUOM(sellingUom, { thickness, width, length });
        if (errors.length > 0) {
            dialog.alert({
                title: 'Dimension Required',
                message: errors.join('\n')
            });
        }

        showConversionPreview(sellingUom, thickness, width, length);
        calculateLineBF(rec, line);
    };

    /**
     * Validate dimensions for UOM (client-safe version)
     */
    const validateDimensionsForUOM = (uomCode, dimensions) => {
        const errors = [];
        const { thickness, width, length } = dimensions;

        const hasT = thickness > 0;
        const hasW = width > 0;
        const hasL = length > 0;

        switch (uomCode) {
            case UOM_CODES.LINEAR_FEET:
                if (!hasT) errors.push('Thickness required for Linear Feet');
                if (!hasW) errors.push('Width required for Linear Feet');
                break;
            case UOM_CODES.SQUARE_FEET:
            case UOM_CODES.MSF:
                if (!hasT) errors.push('Thickness required for Square Feet');
                break;
            case UOM_CODES.EACH:
            case UOM_CODES.BUNDLE:
                if (!hasT) errors.push('Thickness required');
                if (!hasW) errors.push('Width required');
                if (!hasL) errors.push('Length required');
                break;
        }

        return errors;
    };

    /**
     * Show conversion preview message
     */
    const showConversionPreview = (uomCode, thickness, width, length) => {
        try {
            const t = parseFloat(thickness) || 0;
            const w = parseFloat(width) || 0;
            const l = parseFloat(length) || 0;

            let description = '';
            if (uomCode === UOM_CODES.LINEAR_FEET && t > 0 && w > 0) {
                description = `1 LF = ${BFCalculator.roundTo((t * w) / 12, 4)} BF`;
            } else if (uomCode === UOM_CODES.SQUARE_FEET && t > 0) {
                description = `1 SF = ${BFCalculator.roundTo(t / 12, 4)} BF`;
            } else if (uomCode === UOM_CODES.EACH && t > 0 && w > 0 && l > 0) {
                const bf = BFCalculator.calculateBF({ thickness: t, width: w, length: l });
                description = `1 PC = ${bf} BF`;
            }

            if (description) {
                const msg = message.create({
                    title: 'Conversion Factor',
                    message: description,
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
     */
    const calculateLineBF = (rec, line) => {
        const itemId = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item'
        });

        if (!itemId) return;

        const itemData = getItemData(itemId);
        if (!itemData.isLumber) return;

        const settings = getSettings();

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

        const conversion = convertToBoardFeet({
            sourceUom: sellingUom,
            sourceQty: displayQty,
            thickness,
            width,
            length,
            piecesPerBundle: itemData.piecesPerBundle || 1
        });

        if (!conversion.isValid) {
            console.warn('CLS Work Order CS: Conversion failed', conversion.error);
            return;
        }

        let theoreticalBF = conversion.boardFeet;
        let calculatedBF = theoreticalBF;

        // Apply yield if enabled
        if (settings.isYieldEnabled) {
            const yieldPct = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.YIELD_PCT
            })) || settings.defaultYield;

            // Calculate raw material needed based on yield
            if (yieldPct > 0 && yieldPct < 100) {
                calculatedBF = BFCalculator.roundTo(theoreticalBF / (yieldPct / 100), settings.bfPrecision);
            }

            // Set theoretical BF
            try {
                rec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.THEORETICAL_BF,
                    value: BFCalculator.roundTo(theoreticalBF, settings.bfPrecision),
                    ignoreFieldChange: true
                });
            } catch (e) { /* Field may not exist */ }
        }

        // Set calculated BF
        try {
            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.CALCULATED_BF,
                value: BFCalculator.roundTo(calculatedBF, settings.bfPrecision),
                ignoreFieldChange: true
            });
        } catch (e) { /* Field may not exist */ }

        // Set conversion factor
        try {
            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.CONVERSION_FACTOR,
                value: conversion.conversionFactor,
                ignoreFieldChange: true
            });
        } catch (e) { /* Field may not exist */ }

        // Update quantity field with BF value
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            value: BFCalculator.roundTo(calculatedBF, settings.bfPrecision),
            ignoreFieldChange: true
        });

        console.log('CLS Work Order CS: Line BF calculated', {
            displayQty,
            sellingUom,
            theoreticalBF,
            calculatedBF,
            conversionFactor: conversion.conversionFactor
        });

        calculateTotalBF(rec);
    };

    /**
     * Calculate total BF for the work order
     */
    const calculateTotalBF = (rec) => {
        try {
            const settings = getSettings();
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

            try {
                rec.setValue({
                    fieldId: BODY_FIELDS.TOTAL_BF,
                    value: BFCalculator.roundTo(totalBF, settings.bfPrecision),
                    ignoreFieldChange: true
                });
            } catch (e) { /* Field may not exist */ }

            if (settings.isYieldEnabled) {
                try {
                    rec.setValue({
                        fieldId: BODY_FIELDS.TOTAL_THEORETICAL_BF,
                        value: BFCalculator.roundTo(totalTheoreticalBF, settings.bfPrecision),
                        ignoreFieldChange: true
                    });
                } catch (e) { /* Field may not exist */ }
            }

        } catch (e) {
            console.error('CLS Work Order CS: calculateTotalBF error', e);
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

            const errors = validateDimensionsForUOM(sellingUom, { thickness, width, length });
            if (errors.length > 0) {
                dialog.alert({
                    title: 'Validation Error',
                    message: errors.join('\n')
                });
                return false;
            }

            // Validate yield if enabled
            const settings = getSettings();
            if (settings.isYieldEnabled) {
                const yieldPct = parseFloat(rec.getCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.YIELD_PCT
                })) || 0;

                if (yieldPct <= 0 || yieldPct > 100) {
                    dialog.alert({
                        title: 'Validation Error',
                        message: 'Yield percentage must be between 1 and 100'
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
     */
    const sublistChanged = (context) => {
        const { currentRecord: rec, sublistId } = context;

        if (sublistId !== 'item') return;

        calculateTotalBF(rec);
    };

    /**
     * saveRecord - Final validation before save
     */
    const saveRecord = (context) => {
        const rec = context.currentRecord;

        try {
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
