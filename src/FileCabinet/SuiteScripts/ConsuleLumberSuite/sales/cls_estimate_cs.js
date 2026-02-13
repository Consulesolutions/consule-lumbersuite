/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Estimate Client Script
 * Real-time BF conversion and pricing for lumber estimates
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

    const itemCache = {};
    let settingsCache = null;
    let isCalculating = false;

    const getSettings = () => {
        if (settingsCache) return settingsCache;
        try {
            const settingsSearch = search.create({
                type: 'customrecord_cls_settings',
                filters: [],
                columns: ['custrecord_cls_enable_dynamic_uom', 'custrecord_cls_bf_precision']
            });
            settingsCache = { isDynamicUomEnabled: true, bfPrecision: DEFAULTS.BF_PRECISION };
            settingsSearch.run().each((result) => {
                settingsCache.isDynamicUomEnabled = result.getValue('custrecord_cls_enable_dynamic_uom') === true;
                settingsCache.bfPrecision = parseInt(result.getValue('custrecord_cls_bf_precision'), 10) || DEFAULTS.BF_PRECISION;
                return false;
            });
            return settingsCache;
        } catch (e) {
            return { isDynamicUomEnabled: true, bfPrecision: DEFAULTS.BF_PRECISION };
        }
    };

    const convertToBoardFeet = (params) => {
        const { sourceUom, sourceQty, thickness, width, length, piecesPerBundle = 1 } = params;
        const settings = getSettings();
        const qty = parseFloat(sourceQty) || 0;
        const t = parseFloat(thickness) || 0;
        const w = parseFloat(width) || 0;
        const l = parseFloat(length) || 0;
        const ppb = parseInt(piecesPerBundle, 10) || 1;

        if (qty <= 0) return { boardFeet: 0, conversionFactor: 0, isValid: true };

        let boardFeet = 0, conversionFactor = 1;
        switch (sourceUom) {
            case UOM_CODES.BOARD_FEET: boardFeet = qty; break;
            case UOM_CODES.LINEAR_FEET:
                if (t <= 0 || w <= 0) return { boardFeet: 0, conversionFactor: 0, isValid: false };
                conversionFactor = (t * w) / 12; boardFeet = qty * conversionFactor; break;
            case UOM_CODES.SQUARE_FEET:
                if (t <= 0) return { boardFeet: 0, conversionFactor: 0, isValid: false };
                conversionFactor = t / 12; boardFeet = qty * conversionFactor; break;
            case UOM_CODES.MBF: conversionFactor = 1000; boardFeet = qty * conversionFactor; break;
            case UOM_CODES.MSF:
                if (t <= 0) return { boardFeet: 0, conversionFactor: 0, isValid: false };
                conversionFactor = (t / 12) * 1000; boardFeet = qty * conversionFactor; break;
            case UOM_CODES.EACH:
                if (t <= 0 || w <= 0 || l <= 0) return { boardFeet: 0, conversionFactor: 0, isValid: false };
                conversionFactor = BFCalculator.calculateBF({ thickness: t, width: w, length: l });
                boardFeet = qty * conversionFactor; break;
            case UOM_CODES.BUNDLE:
                if (t <= 0 || w <= 0 || l <= 0) return { boardFeet: 0, conversionFactor: 0, isValid: false };
                conversionFactor = BFCalculator.calculateBF({ thickness: t, width: w, length: l }) * ppb;
                boardFeet = qty * conversionFactor; break;
            default: return { boardFeet: 0, conversionFactor: 0, isValid: false };
        }
        return { boardFeet: BFCalculator.roundTo(boardFeet, settings.bfPrecision), conversionFactor: BFCalculator.roundTo(conversionFactor, PRECISION.FACTOR), isValid: true };
    };

    const pageInit = (context) => {
        const rec = context.currentRecord;
        try {
            if (!getSettings().isDynamicUomEnabled) return;
            message.create({ title: 'LumberSuite Active', message: 'Dynamic UOM conversion enabled', type: message.Type.INFORMATION }).show({ duration: 5000 });
            if (context.mode === 'edit') calculateTotalBF(rec);
        } catch (e) { console.error('pageInit error', e); }
    };

    const fieldChanged = (context) => {
        const { currentRecord: rec, sublistId, fieldId, line } = context;
        if (isCalculating || sublistId !== 'item') return;
        const fields = ['item', LINE_FIELDS.SELLING_UOM, LINE_FIELDS.DISPLAY_QTY, LINE_FIELDS.DIM_THICKNESS, LINE_FIELDS.DIM_WIDTH, LINE_FIELDS.DIM_LENGTH, 'quantity', 'rate'];
        if (!fields.includes(fieldId)) return;
        isCalculating = true;
        try {
            if (fieldId === 'item') handleItemChange(rec, line);
            else if (fieldId === LINE_FIELDS.SELLING_UOM) handleUOMChange(rec, line);
            else if ([LINE_FIELDS.DISPLAY_QTY, LINE_FIELDS.DIM_THICKNESS, LINE_FIELDS.DIM_WIDTH, LINE_FIELDS.DIM_LENGTH].includes(fieldId)) calculateLineBF(rec, line);
            else if (fieldId === 'quantity') syncQuantity(rec);
        } catch (e) { console.error('fieldChanged error', e); }
        finally { isCalculating = false; }
    };

    const handleItemChange = (rec, line) => {
        const itemId = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
        if (!itemId) return;
        const itemData = getItemData(itemId);
        if (!itemData.isLumber) { clearLumberFields(rec); return; }
        rec.setCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_THICKNESS, value: itemData.thickness || '', ignoreFieldChange: true });
        rec.setCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_WIDTH, value: itemData.width || '', ignoreFieldChange: true });
        rec.setCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_LENGTH, value: itemData.length || '', ignoreFieldChange: true });
        rec.setCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.SELLING_UOM, value: UOM_CODES.BOARD_FEET, ignoreFieldChange: true });
        if (itemData.baseBFCost > 0) try { rec.setCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.BF_UNIT_COST, value: itemData.baseBFCost, ignoreFieldChange: true }); } catch (e) {}
        calculateLineBF(rec, line);
    };

    const handleUOMChange = (rec, line) => {
        const uom = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.SELLING_UOM });
        const t = parseFloat(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_THICKNESS })) || 0;
        const w = parseFloat(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_WIDTH })) || 0;
        const l = parseFloat(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_LENGTH })) || 0;
        const errors = validateDimsForUOM(uom, t, w, l);
        if (errors.length > 0) dialog.alert({ title: 'Dimension Required', message: errors.join('\n') });
        calculateLineBF(rec, line);
    };

    const validateDimsForUOM = (uom, t, w, l) => {
        const errors = [];
        if (uom === UOM_CODES.LINEAR_FEET && (t <= 0 || w <= 0)) { if (t <= 0) errors.push('Thickness required'); if (w <= 0) errors.push('Width required'); }
        if ((uom === UOM_CODES.SQUARE_FEET || uom === UOM_CODES.MSF) && t <= 0) errors.push('Thickness required');
        if ((uom === UOM_CODES.EACH || uom === UOM_CODES.BUNDLE) && (t <= 0 || w <= 0 || l <= 0)) { if (t <= 0) errors.push('Thickness required'); if (w <= 0) errors.push('Width required'); if (l <= 0) errors.push('Length required'); }
        return errors;
    };

    const syncQuantity = (rec) => {
        const uom = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.SELLING_UOM });
        if (!uom || uom === UOM_CODES.BOARD_FEET) {
            rec.setCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DISPLAY_QTY, value: rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' }), ignoreFieldChange: true });
        }
    };

    const calculateLineBF = (rec, line) => {
        const itemId = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
        if (!itemId) return;
        const itemData = getItemData(itemId);
        if (!itemData.isLumber) return;
        const uom = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.SELLING_UOM }) || UOM_CODES.BOARD_FEET;
        const qty = parseFloat(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DISPLAY_QTY })) || parseFloat(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' })) || 0;
        const t = parseFloat(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_THICKNESS })) || itemData.thickness || 0;
        const w = parseFloat(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_WIDTH })) || itemData.width || 0;
        const l = parseFloat(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_LENGTH })) || itemData.length || 0;
        if (qty <= 0) return;
        const conv = convertToBoardFeet({ sourceUom: uom, sourceQty: qty, thickness: t, width: w, length: l, piecesPerBundle: itemData.piecesPerBundle || 1 });
        if (!conv.isValid) return;
        try { rec.setCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.CALCULATED_BF, value: conv.boardFeet, ignoreFieldChange: true }); } catch (e) {}
        try { rec.setCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.CONVERSION_FACTOR, value: conv.conversionFactor, ignoreFieldChange: true }); } catch (e) {}
        rec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: conv.boardFeet, ignoreFieldChange: true });
        calculateTotalBF(rec);
    };

    const calculateTotalBF = (rec) => {
        try {
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            let totalBF = 0;
            for (let i = 0; i < lineCount; i++) totalBF += parseFloat(rec.getSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.CALCULATED_BF, line: i })) || 0;
            try { rec.setValue({ fieldId: BODY_FIELDS.TOTAL_BF, value: BFCalculator.roundTo(totalBF, getSettings().bfPrecision), ignoreFieldChange: true }); } catch (e) {}
        } catch (e) {}
    };

    const clearLumberFields = (rec) => {
        [LINE_FIELDS.SELLING_UOM, LINE_FIELDS.DISPLAY_QTY, LINE_FIELDS.DIM_THICKNESS, LINE_FIELDS.DIM_WIDTH, LINE_FIELDS.DIM_LENGTH, LINE_FIELDS.CALCULATED_BF, LINE_FIELDS.CONVERSION_FACTOR].forEach((f) => {
            try { rec.setCurrentSublistValue({ sublistId: 'item', fieldId: f, value: '', ignoreFieldChange: true }); } catch (e) {}
        });
    };

    const getItemData = (itemId) => {
        if (itemCache[itemId]) return itemCache[itemId];
        try {
            const r = search.lookupFields({ type: search.Type.ITEM, id: itemId, columns: [ITEM_FIELDS.IS_LUMBER, ITEM_FIELDS.NOMINAL_THICKNESS, ITEM_FIELDS.NOMINAL_WIDTH, ITEM_FIELDS.NOMINAL_LENGTH, ITEM_FIELDS.PIECES_PER_BUNDLE, ITEM_FIELDS.BASE_BF_COST] });
            itemCache[itemId] = { isLumber: r[ITEM_FIELDS.IS_LUMBER] === true, thickness: parseFloat(r[ITEM_FIELDS.NOMINAL_THICKNESS]) || 0, width: parseFloat(r[ITEM_FIELDS.NOMINAL_WIDTH]) || 0, length: parseFloat(r[ITEM_FIELDS.NOMINAL_LENGTH]) || 0, piecesPerBundle: parseInt(r[ITEM_FIELDS.PIECES_PER_BUNDLE], 10) || 1, baseBFCost: parseFloat(r[ITEM_FIELDS.BASE_BF_COST]) || 0 };
            return itemCache[itemId];
        } catch (e) { return { isLumber: false, thickness: 0, width: 0, length: 0, piecesPerBundle: 1, baseBFCost: 0 }; }
    };

    const validateLine = (context) => {
        if (context.sublistId !== 'item') return true;
        const itemId = context.currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
        if (!itemId) return true;
        const itemData = getItemData(itemId);
        if (!itemData.isLumber) return true;
        const uom = context.currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.SELLING_UOM }) || UOM_CODES.BOARD_FEET;
        const t = parseFloat(context.currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_THICKNESS })) || itemData.thickness || 0;
        const w = parseFloat(context.currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_WIDTH })) || itemData.width || 0;
        const l = parseFloat(context.currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: LINE_FIELDS.DIM_LENGTH })) || itemData.length || 0;
        const errors = validateDimsForUOM(uom, t, w, l);
        if (errors.length > 0) { dialog.alert({ title: 'Validation Error', message: errors.join('\n') }); return false; }
        return true;
    };

    const sublistChanged = (context) => { if (context.sublistId === 'item') calculateTotalBF(context.currentRecord); };

    const saveRecord = (context) => {
        const rec = context.currentRecord;
        const lineCount = rec.getLineCount({ sublistId: 'item' });
        let hasLumber = false;
        for (let i = 0; i < lineCount; i++) { const itemId = rec.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }); if (itemId && getItemData(itemId).isLumber) hasLumber = true; }
        if (hasLumber && (parseFloat(rec.getValue({ fieldId: BODY_FIELDS.TOTAL_BF })) || 0) <= 0) return confirm('Total BF is zero. Save anyway?');
        return true;
    };

    return { pageInit, fieldChanged, validateLine, sublistChanged, saveRecord };
});
