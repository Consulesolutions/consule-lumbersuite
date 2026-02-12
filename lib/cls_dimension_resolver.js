/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module cls_dimension_resolver
 *
 * Consule LumberSuite™ - Dimension Resolver
 * Resolves lumber dimensions from various sources (item defaults, line overrides, tally)
 *
 * Dimension Priority:
 * 1. Line-level overrides (custcol_cls_dim_*)
 * 2. Tally sheet dimensions (if linked)
 * 3. Item master defaults (custitem_cls_nominal_*)
 * 4. System defaults
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    'N/search',
    'N/record',
    './cls_constants',
    './cls_settings_dao'
], (search, record, Constants, SettingsDAO) => {

    const ITEM_FIELDS = Constants.ITEM_FIELDS;
    const LINE_FIELDS = Constants.LINE_FIELDS;
    const TALLY_FIELDS = Constants.TALLY_FIELDS;
    const DEFAULTS = Constants.DEFAULTS;

    /**
     * Dimension result object
     * @typedef {Object} DimensionResult
     * @property {number} thickness - Thickness in inches
     * @property {number} width - Width in inches
     * @property {number} length - Length in feet
     * @property {number} piecesPerBundle - Pieces per bundle
     * @property {string} source - Source of dimensions (line|tally|item|default)
     * @property {boolean} isComplete - Whether all dimensions are present
     * @property {boolean} isValid - Whether dimensions are valid
     * @property {string} error - Error message if invalid
     */

    /**
     * Parse a numeric value safely
     * @param {*} value - Value to parse
     * @param {number} defaultValue - Default if parsing fails
     * @returns {number}
     */
    const parseNumeric = (value, defaultValue = 0) => {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    };

    /**
     * Check if a dimension value is valid (positive number)
     * @param {number} value - Value to check
     * @returns {boolean}
     */
    const isValidDimension = (value) => {
        return typeof value === 'number' && !isNaN(value) && value > 0;
    };

    /**
     * Resolve dimensions from a transaction line
     * Checks line overrides first, then falls back to item defaults
     *
     * @param {Object} params - Parameters
     * @param {Record} params.record - NetSuite record object
     * @param {number} params.lineNum - Line number
     * @param {string} [params.sublistId='item'] - Sublist ID
     * @param {number} [params.itemId] - Item internal ID (if known)
     * @returns {DimensionResult}
     */
    const resolveFromTransactionLine = (params) => {
        const {
            record: rec,
            lineNum,
            sublistId = 'item',
            itemId
        } = params;

        const result = {
            thickness: 0,
            width: 0,
            length: 0,
            piecesPerBundle: 1,
            source: 'default',
            isComplete: false,
            isValid: false,
            error: null
        };

        try {
            // Try line-level overrides first
            let thickness = parseNumeric(rec.getSublistValue({
                sublistId: sublistId,
                fieldId: LINE_FIELDS.DIM_THICKNESS,
                line: lineNum
            }));

            let width = parseNumeric(rec.getSublistValue({
                sublistId: sublistId,
                fieldId: LINE_FIELDS.DIM_WIDTH,
                line: lineNum
            }));

            let length = parseNumeric(rec.getSublistValue({
                sublistId: sublistId,
                fieldId: LINE_FIELDS.DIM_LENGTH,
                line: lineNum
            }));

            // Check if we have complete line overrides
            if (isValidDimension(thickness) && isValidDimension(width) && isValidDimension(length)) {
                result.thickness = thickness;
                result.width = width;
                result.length = length;
                result.source = 'line';
                result.isComplete = true;
                result.isValid = true;

                // Try to get pieces per bundle from line
                const piecesPerBundle = parseNumeric(rec.getSublistValue({
                    sublistId: sublistId,
                    fieldId: LINE_FIELDS.PIECES_COUNT,
                    line: lineNum
                }), 1);
                result.piecesPerBundle = piecesPerBundle > 0 ? piecesPerBundle : 1;

                return result;
            }

            // Need to fall back to item - get item ID if not provided
            let resolvedItemId = itemId;
            if (!resolvedItemId) {
                resolvedItemId = rec.getSublistValue({
                    sublistId: sublistId,
                    fieldId: 'item',
                    line: lineNum
                });
            }

            if (!resolvedItemId) {
                result.error = 'No item specified on line';
                return result;
            }

            // Get item dimensions
            const itemDims = getItemDimensions(resolvedItemId);

            // Use line overrides where available, otherwise item defaults
            result.thickness = isValidDimension(thickness) ? thickness : itemDims.thickness;
            result.width = isValidDimension(width) ? width : itemDims.width;
            result.length = isValidDimension(length) ? length : itemDims.length;
            result.piecesPerBundle = itemDims.piecesPerBundle;

            // Determine source
            if (isValidDimension(thickness) || isValidDimension(width) || isValidDimension(length)) {
                result.source = 'line+item';
            } else {
                result.source = itemDims.source;
            }

            result.isComplete = isValidDimension(result.thickness) &&
                               isValidDimension(result.width) &&
                               isValidDimension(result.length);
            result.isValid = result.isComplete;

            if (!result.isComplete) {
                const missing = [];
                if (!isValidDimension(result.thickness)) missing.push('thickness');
                if (!isValidDimension(result.width)) missing.push('width');
                if (!isValidDimension(result.length)) missing.push('length');
                result.error = `Missing dimensions: ${missing.join(', ')}`;
            }

            return result;

        } catch (e) {
            result.error = `Error resolving dimensions: ${e.message}`;
            return result;
        }
    };

    /**
     * Get dimensions from an item record
     *
     * @param {number|string} itemId - Item internal ID
     * @returns {DimensionResult}
     */
    const getItemDimensions = (itemId) => {
        const result = {
            thickness: 0,
            width: 0,
            length: 0,
            piecesPerBundle: 1,
            source: 'default',
            isComplete: false,
            isValid: false,
            isLumber: false,
            allowDynamicDims: false,
            species: null,
            grade: null,
            error: null
        };

        if (!itemId) {
            result.error = 'No item ID provided';
            return result;
        }

        try {
            const columns = [
                ITEM_FIELDS.IS_LUMBER,
                ITEM_FIELDS.NOMINAL_THICKNESS,
                ITEM_FIELDS.NOMINAL_WIDTH,
                ITEM_FIELDS.NOMINAL_LENGTH,
                ITEM_FIELDS.PIECES_PER_BUNDLE,
                ITEM_FIELDS.ALLOW_DYNAMIC_DIMS,
                ITEM_FIELDS.SPECIES,
                ITEM_FIELDS.GRADE
            ];

            const lookupResult = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: columns
            });

            result.isLumber = lookupResult[ITEM_FIELDS.IS_LUMBER] === true;
            result.allowDynamicDims = lookupResult[ITEM_FIELDS.ALLOW_DYNAMIC_DIMS] === true;

            result.thickness = parseNumeric(lookupResult[ITEM_FIELDS.NOMINAL_THICKNESS], DEFAULTS.THICKNESS);
            result.width = parseNumeric(lookupResult[ITEM_FIELDS.NOMINAL_WIDTH], DEFAULTS.WIDTH);
            result.length = parseNumeric(lookupResult[ITEM_FIELDS.NOMINAL_LENGTH], DEFAULTS.LENGTH);
            result.piecesPerBundle = parseNumeric(lookupResult[ITEM_FIELDS.PIECES_PER_BUNDLE], 1) || 1;

            // Handle list/record fields for species and grade
            if (lookupResult[ITEM_FIELDS.SPECIES] && lookupResult[ITEM_FIELDS.SPECIES].length > 0) {
                result.species = lookupResult[ITEM_FIELDS.SPECIES][0].value;
            }
            if (lookupResult[ITEM_FIELDS.GRADE] && lookupResult[ITEM_FIELDS.GRADE].length > 0) {
                result.grade = lookupResult[ITEM_FIELDS.GRADE][0].value;
            }

            result.source = 'item';
            result.isComplete = isValidDimension(result.thickness) &&
                               isValidDimension(result.width) &&
                               isValidDimension(result.length);
            result.isValid = result.isComplete;

            return result;

        } catch (e) {
            result.error = `Error loading item dimensions: ${e.message}`;
            // Return system defaults
            result.thickness = DEFAULTS.THICKNESS;
            result.width = DEFAULTS.WIDTH;
            result.length = DEFAULTS.LENGTH;
            result.source = 'default';
            return result;
        }
    };

    /**
     * Get dimensions from a tally sheet record
     *
     * @param {number|string} tallyId - Tally sheet internal ID
     * @returns {DimensionResult}
     */
    const getTallyDimensions = (tallyId) => {
        const result = {
            thickness: 0,
            width: 0,
            length: 0,
            piecesPerBundle: 1,
            source: 'default',
            isComplete: false,
            isValid: false,
            error: null,
            tallyInfo: null
        };

        if (!tallyId) {
            result.error = 'No tally ID provided';
            return result;
        }

        try {
            const lookupResult = search.lookupFields({
                type: Constants.RECORD_TYPES.TALLY_SHEET,
                id: tallyId,
                columns: [
                    TALLY_FIELDS.THICKNESS,
                    TALLY_FIELDS.WIDTH,
                    TALLY_FIELDS.LENGTH,
                    TALLY_FIELDS.PIECES,
                    TALLY_FIELDS.ITEM,
                    TALLY_FIELDS.GRADE,
                    TALLY_FIELDS.MOISTURE_PCT
                ]
            });

            result.thickness = parseNumeric(lookupResult[TALLY_FIELDS.THICKNESS]);
            result.width = parseNumeric(lookupResult[TALLY_FIELDS.WIDTH]);
            result.length = parseNumeric(lookupResult[TALLY_FIELDS.LENGTH]);
            result.piecesPerBundle = parseNumeric(lookupResult[TALLY_FIELDS.PIECES], 1) || 1;

            // If tally doesn't have dimensions, fall back to item
            if (!isValidDimension(result.thickness) || !isValidDimension(result.width) || !isValidDimension(result.length)) {
                const itemField = lookupResult[TALLY_FIELDS.ITEM];
                if (itemField && itemField.length > 0) {
                    const itemDims = getItemDimensions(itemField[0].value);
                    result.thickness = isValidDimension(result.thickness) ? result.thickness : itemDims.thickness;
                    result.width = isValidDimension(result.width) ? result.width : itemDims.width;
                    result.length = isValidDimension(result.length) ? result.length : itemDims.length;
                    result.source = 'tally+item';
                }
            } else {
                result.source = 'tally';
            }

            result.isComplete = isValidDimension(result.thickness) &&
                               isValidDimension(result.width) &&
                               isValidDimension(result.length);
            result.isValid = result.isComplete;

            // Store additional tally info
            result.tallyInfo = {
                grade: lookupResult[TALLY_FIELDS.GRADE],
                moisture: parseNumeric(lookupResult[TALLY_FIELDS.MOISTURE_PCT])
            };

            return result;

        } catch (e) {
            result.error = `Error loading tally dimensions: ${e.message}`;
            return result;
        }
    };

    /**
     * Resolve dimensions with full fallback chain
     * Priority: lineOverride → tally → item → defaults
     *
     * @param {Object} params - Parameters
     * @param {Object} [params.lineOverrides] - Line-level dimension overrides
     * @param {number} [params.tallyId] - Tally sheet ID
     * @param {number} [params.itemId] - Item ID
     * @returns {DimensionResult}
     */
    const resolveWithFallback = (params) => {
        const { lineOverrides, tallyId, itemId } = params;

        const result = {
            thickness: 0,
            width: 0,
            length: 0,
            piecesPerBundle: 1,
            source: 'default',
            isComplete: false,
            isValid: false,
            error: null,
            resolutionPath: []
        };

        // Start with defaults
        let thickness = DEFAULTS.THICKNESS;
        let width = DEFAULTS.WIDTH;
        let length = DEFAULTS.LENGTH;
        let piecesPerBundle = 1;
        let source = 'default';

        // Layer 1: Item defaults
        if (itemId) {
            const itemDims = getItemDimensions(itemId);
            if (itemDims.isValid) {
                thickness = itemDims.thickness;
                width = itemDims.width;
                length = itemDims.length;
                piecesPerBundle = itemDims.piecesPerBundle;
                source = 'item';
                result.resolutionPath.push('item');
            }
        }

        // Layer 2: Tally sheet
        if (tallyId && SettingsDAO.isTallyEnabled()) {
            const tallyDims = getTallyDimensions(tallyId);
            if (isValidDimension(tallyDims.thickness)) {
                thickness = tallyDims.thickness;
                source = 'tally';
            }
            if (isValidDimension(tallyDims.width)) {
                width = tallyDims.width;
                source = 'tally';
            }
            if (isValidDimension(tallyDims.length)) {
                length = tallyDims.length;
                source = 'tally';
            }
            if (tallyDims.piecesPerBundle > 0) {
                piecesPerBundle = tallyDims.piecesPerBundle;
            }
            if (source === 'tally') {
                result.resolutionPath.push('tally');
            }
        }

        // Layer 3: Line overrides (highest priority)
        if (lineOverrides) {
            if (isValidDimension(lineOverrides.thickness)) {
                thickness = lineOverrides.thickness;
                source = 'line';
            }
            if (isValidDimension(lineOverrides.width)) {
                width = lineOverrides.width;
                source = 'line';
            }
            if (isValidDimension(lineOverrides.length)) {
                length = lineOverrides.length;
                source = 'line';
            }
            if (lineOverrides.piecesPerBundle > 0) {
                piecesPerBundle = lineOverrides.piecesPerBundle;
            }
            if (source === 'line') {
                result.resolutionPath.push('line');
            }
        }

        result.thickness = thickness;
        result.width = width;
        result.length = length;
        result.piecesPerBundle = piecesPerBundle;
        result.source = source;
        result.isComplete = isValidDimension(thickness) && isValidDimension(width) && isValidDimension(length);
        result.isValid = result.isComplete;

        return result;
    };

    /**
     * Check if an item is a lumber item
     * @param {number|string} itemId - Item internal ID
     * @returns {boolean}
     */
    const isLumberItem = (itemId) => {
        if (!itemId) return false;

        try {
            const lookupResult = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: [ITEM_FIELDS.IS_LUMBER]
            });
            return lookupResult[ITEM_FIELDS.IS_LUMBER] === true;
        } catch (e) {
            return false;
        }
    };

    /**
     * Check if an item allows dynamic dimension overrides
     * @param {number|string} itemId - Item internal ID
     * @returns {boolean}
     */
    const allowsDynamicDimensions = (itemId) => {
        if (!itemId) return false;

        try {
            const lookupResult = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: [ITEM_FIELDS.ALLOW_DYNAMIC_DIMS]
            });
            return lookupResult[ITEM_FIELDS.ALLOW_DYNAMIC_DIMS] === true;
        } catch (e) {
            return false;
        }
    };

    /**
     * Get the default dimensions from system settings
     * @returns {Object}
     */
    const getSystemDefaults = () => {
        return {
            thickness: DEFAULTS.THICKNESS,
            width: DEFAULTS.WIDTH,
            length: DEFAULTS.LENGTH,
            piecesPerBundle: 1
        };
    };

    /**
     * Validate dimensions meet business rules
     * @param {DimensionResult} dims - Dimensions to validate
     * @returns {Object} Validation result
     */
    const validateDimensions = (dims) => {
        const errors = [];
        const warnings = [];

        if (!dims.isComplete) {
            errors.push('Incomplete dimensions');
        }

        // Business rule validations
        if (dims.thickness > 12) {
            warnings.push(`Thickness ${dims.thickness}" exceeds typical lumber thickness`);
        }
        if (dims.width > 24) {
            warnings.push(`Width ${dims.width}" exceeds typical lumber width`);
        }
        if (dims.length > 24) {
            warnings.push(`Length ${dims.length}' exceeds typical lumber length`);
        }

        // Check for suspiciously small values
        if (dims.thickness > 0 && dims.thickness < 0.25) {
            warnings.push(`Thickness ${dims.thickness}" is unusually thin`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            hasWarnings: warnings.length > 0
        };
    };

    /**
     * Format dimensions for display
     * @param {DimensionResult} dims - Dimensions to format
     * @param {string} [format='standard'] - Format type
     * @returns {string} Formatted string
     */
    const formatDimensions = (dims, format = 'standard') => {
        if (!dims || !dims.isValid) {
            return 'N/A';
        }

        switch (format) {
            case 'compact':
                return `${dims.thickness}"×${dims.width}"×${dims.length}'`;
            case 'full':
                return `${dims.thickness}" thick × ${dims.width}" wide × ${dims.length}' long`;
            case 'standard':
            default:
                return `${dims.thickness}" × ${dims.width}" × ${dims.length}'`;
        }
    };

    return {
        // Primary resolution functions
        resolveFromTransactionLine,
        resolveWithFallback,

        // Source-specific getters
        getItemDimensions,
        getTallyDimensions,
        getSystemDefaults,

        // Item checks
        isLumberItem,
        allowsDynamicDimensions,

        // Validation and formatting
        validateDimensions,
        formatDimensions,

        // Utilities
        parseNumeric,
        isValidDimension
    };
});
