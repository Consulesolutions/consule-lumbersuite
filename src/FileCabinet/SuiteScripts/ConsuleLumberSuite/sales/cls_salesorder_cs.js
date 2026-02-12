/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Sales Order Client Script
 * Real-time BF calculations and UOM conversion on Sales Orders
 *
 * Key Functions:
 * - Real-time BF calculation as fields change
 * - Dynamic UOM selection with conversion preview
 * - Dimension override handling
 * - Price per BF calculation
 * - Margin preview and alerts
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    'N/currentRecord',
    'N/search',
    'N/url',
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
    url,
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

    // Item data cache
    const itemCache = {};

    // Prevent recursive field changes
    let isCalculating = false;

    /**
     * pageInit - Initialize the form
     *
     * @param {Object} context
     */
    const pageInit = (context) => {
        const rec = context.currentRecord;
        const mode = context.mode;

        console.log('CLS SalesOrder CS: pageInit', mode);

        try {
            if (!SettingsDAO.isDynamicUomEnabled()) {
                console.log('CLS SalesOrder CS: Dynamic UOM disabled');
                return;
            }

            // Show status
            showModuleStatus();

            // Calculate totals on edit
            if (mode === 'edit') {
                calculateTotals(rec);
            }

        } catch (e) {
            console.error('CLS SalesOrder CS: pageInit error', e);
        }
    };

    /**
     * Show module status
     */
    const showModuleStatus = () => {
        try {
            const msg = message.create({
                title: 'LumberSuite Active',
                message: 'BF conversion enabled for lumber items.',
                type: message.Type.INFORMATION
            });
            msg.show({ duration: 4000 });
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
            if (sublistId !== 'item') return;

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

            if (!triggerFields.includes(fieldId)) return;

            console.log('CLS SalesOrder CS: fieldChanged', { fieldId, line });

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
                    updateMarginPreview(rec, line);
                    break;
            }

        } catch (e) {
            console.error('CLS SalesOrder CS: fieldChanged error', e);
        } finally {
            isCalculating = false;
        }
    };

    /**
     * Handle item change
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

        // Set defaults
        setDefaultDimensions(rec, itemData);

        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.SELLING_UOM,
            value: UOM_CODES.BOARD_FEET,
            ignoreFieldChange: true
        });

        // Show item info
        showItemInfo(itemData);

        // Calculate BF
        calculateLineBF(rec, line);
    };

    /**
     * Set default dimensions
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
     * Show item info
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
                title: 'Lumber Item',
                message: `${dims} | ${BFCalculator.roundTo(bfPerPiece, 4)} BF/pc`,
                type: message.Type.CONFIRMATION
            });
            msg.show({ duration: 3000 });
        } catch (e) {
            // Silent
        }
    };

    /**
     * Handle UOM change
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

        // Validate
        const validation = Validation.validateDimensionsForUOM(sellingUom, {
            thickness, width, length
        });

        if (!validation.isValid) {
            dialog.alert({
                title: 'Dimensions Required',
                message: validation.errors.join('\n')
            });
        }

        // Show conversion
        showConversionFactor(sellingUom, thickness, width, length);

        calculateLineBF(rec, line);
    };

    /**
     * Show conversion factor
     */
    const showConversionFactor = (uomCode, thickness, width, length) => {
        try {
            const matrix = ConversionEngine.calculateConversionMatrix(thickness, width, length);

            if (matrix.descriptions[uomCode]) {
                const msg = message.create({
                    title: 'Conversion',
                    message: matrix.descriptions[uomCode],
                    type: message.Type.INFORMATION
                });
                msg.show({ duration: 3000 });
            }
        } catch (e) {
            // Silent
        }
    };

    /**
     * Sync quantity to display qty
     */
    const syncQuantityToDisplayQty = (rec, line) => {
        const sellingUom = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.SELLING_UOM
        });

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
     * Calculate line BF
     */
    const calculateLineBF = (rec, line) => {
        const itemId = rec.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item'
        });

        if (!itemId) return;

        const itemData = getItemData(itemId);
        if (!itemData.isLumber) return;

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

        const conversion = ConversionEngine.convertToBoardFeet({
            sourceUom: sellingUom,
            sourceQty: displayQty,
            thickness,
            width,
            length,
            piecesPerBundle: itemData.piecesPerBundle || 1
        });

        if (!conversion.isValid) {
            console.warn('CLS SalesOrder CS: Conversion failed', conversion.error);
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
        const bfCost = itemData.baseBFCost || 0;
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.BF_UNIT_COST,
            value: BFCalculator.roundTo(bfCost, PRECISION.CURRENCY),
            ignoreFieldChange: true
        });

        const extendedCost = conversion.boardFeet * bfCost;
        rec.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: LINE_FIELDS.EXTENDED_BF_COST,
            value: BFCalculator.roundTo(extendedCost, PRECISION.CURRENCY),
            ignoreFieldChange: true
        });

        // Update totals
        calculateTotals(rec);

        // Update margin
        updateMarginPreview(rec, line);
    };

    /**
     * Update margin preview
     */
    const updateMarginPreview = (rec, line) => {
        try {
            const amount = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'amount'
            })) || 0;

            const bfCost = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.EXTENDED_BF_COST
            })) || 0;

            const calculatedBF = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.CALCULATED_BF
            })) || 0;

            if (amount > 0 && bfCost > 0) {
                const margin = amount - bfCost;
                const marginPct = (margin / amount) * 100;

                // Warn on low margin
                if (marginPct < 10 && marginPct >= 0) {
                    const msg = message.create({
                        title: 'Low Margin Warning',
                        message: `Line margin is ${BFCalculator.roundTo(marginPct, 1)}%`,
                        type: message.Type.WARNING
                    });
                    msg.show({ duration: 3000 });
                } else if (marginPct < 0) {
                    const msg = message.create({
                        title: 'Negative Margin',
                        message: `Line is selling below cost! Margin: ${BFCalculator.roundTo(marginPct, 1)}%`,
                        type: message.Type.ERROR
                    });
                    msg.show({ duration: 5000 });
                }
            }

            // Log price per BF
            if (calculatedBF > 0 && amount > 0) {
                const pricePerBF = amount / calculatedBF;
                console.log('CLS SalesOrder CS: $/BF', BFCalculator.roundTo(pricePerBF, PRECISION.CURRENCY));
            }

        } catch (e) {
            // Silent
        }
    };

    /**
     * Calculate totals
     */
    const calculateTotals = (rec) => {
        try {
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            let totalBF = 0;

            for (let i = 0; i < lineCount; i++) {
                totalBF += parseFloat(rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.CALCULATED_BF,
                    line: i
                })) || 0;
            }

            rec.setValue({
                fieldId: BODY_FIELDS.TOTAL_BF,
                value: BFCalculator.roundTo(totalBF, SettingsDAO.getBFPrecision()),
                ignoreFieldChange: true
            });

        } catch (e) {
            console.error('CLS SalesOrder CS: calculateTotals error', e);
        }
    };

    /**
     * Clear lumber fields
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
     * Get item data
     */
    const getItemData = (itemId) => {
        if (itemCache[itemId]) return itemCache[itemId];

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
                    ITEM_FIELDS.BASE_BF_COST
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
            console.error('CLS SalesOrder CS: getItemData error', e);
            return { isLumber: false };
        }
    };

    /**
     * validateLine
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
            })) || itemData.thickness;

            const width = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.DIM_WIDTH
            })) || itemData.width;

            const length = parseFloat(rec.getCurrentSublistValue({
                sublistId: 'item',
                fieldId: LINE_FIELDS.DIM_LENGTH
            })) || itemData.length;

            const validation = Validation.validateDimensionsForUOM(sellingUom, {
                thickness, width, length
            });

            if (!validation.isValid) {
                dialog.alert({
                    title: 'Validation Error',
                    message: validation.errors.join('\n')
                });
                return false;
            }

            return true;

        } catch (e) {
            console.error('CLS SalesOrder CS: validateLine error', e);
            return true;
        }
    };

    /**
     * sublistChanged
     */
    const sublistChanged = (context) => {
        const { currentRecord: rec, sublistId } = context;

        if (sublistId !== 'item') return;

        calculateTotals(rec);
    };

    /**
     * saveRecord
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
                return confirm('Total BF is zero. Continue?');
            }

            return true;

        } catch (e) {
            console.error('CLS SalesOrder CS: saveRecord error', e);
            return true;
        }
    };

    /**
     * Show BF Summary (button handler)
     */
    const showBFSummary = () => {
        try {
            const rec = currentRecord.get();
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            const lines = [];
            let totalBF = 0;
            let totalRevenue = 0;
            let totalCost = 0;

            for (let i = 0; i < lineCount; i++) {
                const bf = parseFloat(rec.getSublistValue({
                    sublistId: 'item',
                    fieldId: LINE_FIELDS.CALCULATED_BF,
                    line: i
                })) || 0;

                if (bf > 0) {
                    const itemText = rec.getSublistText({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: i
                    });
                    const amount = parseFloat(rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'amount',
                        line: i
                    })) || 0;
                    const cost = parseFloat(rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: LINE_FIELDS.EXTENDED_BF_COST,
                        line: i
                    })) || 0;

                    const pricePerBF = bf > 0 ? amount / bf : 0;

                    lines.push(`${itemText}: ${BFCalculator.roundTo(bf, 2)} BF @ $${BFCalculator.roundTo(pricePerBF, 2)}/BF`);

                    totalBF += bf;
                    totalRevenue += amount;
                    totalCost += cost;
                }
            }

            const margin = totalRevenue - totalCost;
            const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

            const summary = [
                ...lines,
                '',
                `Total BF: ${BFCalculator.roundTo(totalBF, 2)}`,
                `Total Revenue: $${BFCalculator.roundTo(totalRevenue, 2)}`,
                `BF Cost: $${BFCalculator.roundTo(totalCost, 2)}`,
                `Margin: $${BFCalculator.roundTo(margin, 2)} (${BFCalculator.roundTo(marginPct, 1)}%)`,
                `Avg $/BF: $${BFCalculator.roundTo(totalRevenue / totalBF, 2)}`
            ];

            dialog.alert({
                title: 'BF Summary',
                message: summary.join('\n')
            });

        } catch (e) {
            console.error('CLS SalesOrder CS: showBFSummary error', e);
        }
    };

    /**
     * Create Lumber Work Order (button handler)
     */
    const createLumberWorkOrder = () => {
        try {
            const rec = currentRecord.get();
            const soId = rec.id;

            // Redirect to WO creation with SO reference
            const woUrl = url.resolveRecord({
                recordType: 'workorder',
                params: {
                    salesorder: soId
                }
            });

            window.open(woUrl, '_blank');

        } catch (e) {
            console.error('CLS SalesOrder CS: createLumberWorkOrder error', e);
            dialog.alert({
                title: 'Error',
                message: 'Unable to create Work Order: ' + e.message
            });
        }
    };

    // Expose button handlers
    window.showBFSummary = showBFSummary;
    window.createLumberWorkOrder = createLumberWorkOrder;

    return {
        pageInit,
        fieldChanged,
        validateLine,
        sublistChanged,
        saveRecord
    };
});
