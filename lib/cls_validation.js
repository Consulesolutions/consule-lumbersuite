/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module cls_validation
 *
 * Consule LumberSuite™ - Validation Module
 * Centralized validation utilities for all LumberSuite operations
 *
 * Provides validation for:
 * - Dimensions (thickness, width, length)
 * - UOM conversions
 * - Tally sheets
 * - Work order data
 * - Settings
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    './cls_constants',
    './cls_settings_dao',
    './cls_bf_calculator'
], (Constants, SettingsDAO, BFCalculator) => {

    const UOM_CODES = Constants.UOM_CODES;
    const ERRORS = Constants.ERRORS;

    /**
     * Validation result object
     * @typedef {Object} ValidationResult
     * @property {boolean} isValid - Whether validation passed
     * @property {Array<string>} errors - List of error messages
     * @property {Array<string>} warnings - List of warning messages
     * @property {Object} [data] - Additional validation data
     */

    /**
     * Create a validation result object
     * @param {boolean} isValid
     * @param {Array<string>} errors
     * @param {Array<string>} warnings
     * @param {Object} [data]
     * @returns {ValidationResult}
     */
    const createResult = (isValid, errors = [], warnings = [], data = null) => {
        return {
            isValid,
            errors,
            warnings,
            hasWarnings: warnings.length > 0,
            data
        };
    };

    // ============================================
    // Dimension Validation
    // ============================================

    /**
     * Validate a single dimension value
     *
     * @param {*} value - Value to validate
     * @param {string} name - Name of dimension for error messages
     * @param {Object} [options] - Validation options
     * @param {number} [options.min=0] - Minimum value
     * @param {number} [options.max=1000] - Maximum value
     * @param {boolean} [options.required=true] - Whether required
     * @returns {ValidationResult}
     */
    const validateDimension = (value, name, options = {}) => {
        const {
            min = 0,
            max = 1000,
            required = true
        } = options;

        const errors = [];
        const warnings = [];

        // Check if provided
        if (value === null || value === undefined || value === '') {
            if (required) {
                errors.push(`${name} is required`);
            }
            return createResult(errors.length === 0, errors, warnings);
        }

        // Parse numeric value
        const numValue = parseFloat(value);

        if (isNaN(numValue)) {
            errors.push(`${name} must be a valid number`);
            return createResult(false, errors, warnings);
        }

        // Check range
        if (numValue <= min) {
            errors.push(`${name} must be greater than ${min}`);
        }

        if (numValue > max) {
            warnings.push(`${name} (${numValue}) exceeds typical maximum of ${max}`);
        }

        return createResult(errors.length === 0, errors, warnings, { value: numValue });
    };

    /**
     * Validate a complete dimension set (thickness, width, length)
     *
     * @param {Object} dimensions - Dimension values
     * @param {number} dimensions.thickness - Thickness in inches
     * @param {number} dimensions.width - Width in inches
     * @param {number} dimensions.length - Length in feet
     * @param {Object} [options] - Validation options
     * @param {boolean} [options.allRequired=true] - Whether all dimensions required
     * @returns {ValidationResult}
     */
    const validateDimensions = (dimensions, options = {}) => {
        const { allRequired = true } = options;

        const errors = [];
        const warnings = [];

        // Validate thickness (typically 0.25" to 12")
        const thicknessResult = validateDimension(
            dimensions.thickness,
            'Thickness',
            { min: 0, max: 12, required: allRequired }
        );
        errors.push(...thicknessResult.errors);
        warnings.push(...thicknessResult.warnings);

        // Validate width (typically up to 24")
        const widthResult = validateDimension(
            dimensions.width,
            'Width',
            { min: 0, max: 48, required: allRequired }
        );
        errors.push(...widthResult.errors);
        warnings.push(...widthResult.warnings);

        // Validate length (typically up to 24')
        const lengthResult = validateDimension(
            dimensions.length,
            'Length',
            { min: 0, max: 40, required: allRequired }
        );
        errors.push(...lengthResult.errors);
        warnings.push(...lengthResult.warnings);

        // Additional business logic warnings
        if (thicknessResult.data && thicknessResult.data.value < 0.25) {
            warnings.push('Thickness under 0.25" is unusually thin for lumber');
        }

        if (widthResult.data && widthResult.data.value < 1) {
            warnings.push('Width under 1" is unusually narrow for lumber');
        }

        // Check if dimensions require settings validation
        if (SettingsDAO.areDimensionsRequired()) {
            if (!dimensions.thickness || !dimensions.width || !dimensions.length) {
                errors.push('All dimensions are required by system settings');
            }
        }

        return createResult(errors.length === 0, errors, warnings, {
            thickness: thicknessResult.data?.value,
            width: widthResult.data?.value,
            length: lengthResult.data?.value
        });
    };

    // ============================================
    // UOM Validation
    // ============================================

    /**
     * Validate a UOM code
     *
     * @param {string} uomCode - UOM code to validate
     * @returns {ValidationResult}
     */
    const validateUOMCode = (uomCode) => {
        if (!uomCode) {
            return createResult(false, ['UOM code is required']);
        }

        const validCodes = Object.values(UOM_CODES);

        if (!validCodes.includes(uomCode)) {
            return createResult(false, [`Invalid UOM code: ${uomCode}. Valid codes: ${validCodes.join(', ')}`]);
        }

        return createResult(true, [], [], { uomCode });
    };

    /**
     * Validate that dimensions are sufficient for a UOM conversion
     *
     * @param {string} uomCode - UOM code
     * @param {Object} dimensions - Available dimensions
     * @returns {ValidationResult}
     */
    const validateDimensionsForUOM = (uomCode, dimensions) => {
        const errors = [];
        const { thickness, width, length } = dimensions;

        const hasThickness = thickness !== null && thickness !== undefined && thickness > 0;
        const hasWidth = width !== null && width !== undefined && width > 0;
        const hasLength = length !== null && length !== undefined && length > 0;

        switch (uomCode) {
            case UOM_CODES.BOARD_FEET:
            case UOM_CODES.MBF:
                // No dimensions needed for BF to BF
                break;

            case UOM_CODES.LINEAR_FEET:
                if (!hasThickness) errors.push('Thickness required for Linear Feet conversion');
                if (!hasWidth) errors.push('Width required for Linear Feet conversion');
                break;

            case UOM_CODES.SQUARE_FEET:
            case UOM_CODES.MSF:
                if (!hasThickness) errors.push('Thickness required for Square Feet conversion');
                break;

            case UOM_CODES.EACH:
            case UOM_CODES.BUNDLE:
                if (!hasThickness) errors.push('Thickness required for piece conversion');
                if (!hasWidth) errors.push('Width required for piece conversion');
                if (!hasLength) errors.push('Length required for piece conversion');
                break;
        }

        return createResult(errors.length === 0, errors);
    };

    // ============================================
    // Quantity Validation
    // ============================================

    /**
     * Validate a quantity value
     *
     * @param {*} value - Quantity value
     * @param {string} [name='Quantity'] - Name for error messages
     * @param {Object} [options] - Validation options
     * @returns {ValidationResult}
     */
    const validateQuantity = (value, name = 'Quantity', options = {}) => {
        const {
            allowZero = false,
            allowNegative = false,
            maxValue = 999999999
        } = options;

        const errors = [];
        const warnings = [];

        if (value === null || value === undefined || value === '') {
            errors.push(`${name} is required`);
            return createResult(false, errors);
        }

        const numValue = parseFloat(value);

        if (isNaN(numValue)) {
            errors.push(`${name} must be a valid number`);
            return createResult(false, errors);
        }

        if (!allowNegative && numValue < 0) {
            errors.push(`${name} cannot be negative`);
        }

        if (!allowZero && numValue === 0) {
            errors.push(`${name} cannot be zero`);
        }

        if (numValue > maxValue) {
            errors.push(`${name} exceeds maximum allowed value of ${maxValue}`);
        }

        return createResult(errors.length === 0, errors, warnings, { value: numValue });
    };

    /**
     * Validate board feet quantity
     *
     * @param {number} boardFeet - BF value
     * @param {Object} [dimensions] - Optional dimensions for sanity check
     * @returns {ValidationResult}
     */
    const validateBoardFeet = (boardFeet, dimensions = null) => {
        const errors = [];
        const warnings = [];

        const qtyResult = validateQuantity(boardFeet, 'Board Feet');
        if (!qtyResult.isValid) {
            return qtyResult;
        }

        const bf = qtyResult.data.value;

        // If dimensions provided, check if BF makes sense
        if (dimensions && dimensions.thickness && dimensions.width && dimensions.length) {
            const bfPerPiece = BFCalculator.calculateBF(dimensions);
            if (bfPerPiece > 0) {
                const impliedPieces = bf / bfPerPiece;

                if (impliedPieces < 0.01) {
                    warnings.push(`BF quantity implies less than 1% of a piece`);
                }

                // Check if it's a reasonable fractional amount
                const remainder = impliedPieces % 1;
                if (remainder > 0.01 && remainder < 0.99) {
                    warnings.push(`BF quantity implies ${BFCalculator.roundTo(impliedPieces, 2)} pieces (fractional)`);
                }
            }
        }

        return createResult(true, errors, warnings, { boardFeet: bf });
    };

    // ============================================
    // Percentage Validation
    // ============================================

    /**
     * Validate a percentage value
     *
     * @param {*} value - Percentage value
     * @param {string} [name='Percentage'] - Name for error messages
     * @param {Object} [options] - Validation options
     * @returns {ValidationResult}
     */
    const validatePercentage = (value, name = 'Percentage', options = {}) => {
        const {
            min = 0,
            max = 100,
            allowNull = false
        } = options;

        const errors = [];
        const warnings = [];

        if (value === null || value === undefined || value === '') {
            if (!allowNull) {
                errors.push(`${name} is required`);
            }
            return createResult(errors.length === 0, errors);
        }

        const numValue = parseFloat(value);

        if (isNaN(numValue)) {
            errors.push(`${name} must be a valid number`);
            return createResult(false, errors);
        }

        if (numValue < min) {
            errors.push(`${name} must be at least ${min}%`);
        }

        if (numValue > max) {
            errors.push(`${name} cannot exceed ${max}%`);
        }

        return createResult(errors.length === 0, errors, warnings, { value: numValue });
    };

    /**
     * Validate yield percentage
     *
     * @param {number} yieldPct - Yield percentage
     * @returns {ValidationResult}
     */
    const validateYieldPercentage = (yieldPct) => {
        const result = validatePercentage(yieldPct, 'Yield', { min: 1, max: 100 });

        if (result.isValid && result.data.value < 50) {
            result.warnings.push('Yield below 50% is unusually low');
            result.hasWarnings = true;
        }

        return result;
    };

    /**
     * Validate waste percentage
     *
     * @param {number} wastePct - Waste percentage
     * @returns {ValidationResult}
     */
    const validateWastePercentage = (wastePct) => {
        const result = validatePercentage(wastePct, 'Waste', { min: 0, max: 100 });

        if (result.isValid && result.data.value > 50) {
            result.warnings.push('Waste above 50% is unusually high');
            result.hasWarnings = true;
        }

        return result;
    };

    // ============================================
    // Tally Validation
    // ============================================

    /**
     * Validate tally sheet data
     *
     * @param {Object} tallyData - Tally sheet data
     * @returns {ValidationResult}
     */
    const validateTallyData = (tallyData) => {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!tallyData.itemId) {
            errors.push('Item is required for tally sheet');
        }

        if (!tallyData.locationId) {
            errors.push('Location is required for tally sheet');
        }

        if (!tallyData.subsidiaryId) {
            errors.push('Subsidiary is required for tally sheet');
        }

        // Validate received BF
        const bfResult = validateQuantity(tallyData.receivedBF, 'Received BF');
        if (!bfResult.isValid) {
            errors.push(...bfResult.errors);
        }

        // Optional field validation
        if (tallyData.moisturePct !== undefined && tallyData.moisturePct !== null) {
            const moistureResult = validatePercentage(tallyData.moisturePct, 'Moisture', { min: 0, max: 100 });
            if (!moistureResult.isValid) {
                errors.push(...moistureResult.errors);
            }
            if (moistureResult.isValid && moistureResult.data.value > 25) {
                warnings.push('Moisture above 25% is unusually high for kiln-dried lumber');
            }
        }

        // Validate dimensions if provided
        if (tallyData.thickness || tallyData.width || tallyData.length) {
            const dimResult = validateDimensions({
                thickness: tallyData.thickness,
                width: tallyData.width,
                length: tallyData.length
            }, { allRequired: false });
            errors.push(...dimResult.errors);
            warnings.push(...dimResult.warnings);
        }

        return createResult(errors.length === 0, errors, warnings);
    };

    /**
     * Validate tally allocation
     *
     * @param {Object} allocation - Allocation data
     * @param {number} availableBF - Available BF in tally
     * @returns {ValidationResult}
     */
    const validateTallyAllocation = (allocation, availableBF) => {
        const errors = [];
        const warnings = [];

        if (!allocation.tallyId) {
            errors.push('Tally sheet is required for allocation');
        }

        if (!allocation.workOrderId) {
            errors.push('Work Order is required for allocation');
        }

        const allocResult = validateQuantity(allocation.allocatedBF, 'Allocated BF');
        if (!allocResult.isValid) {
            errors.push(...allocResult.errors);
        } else if (allocResult.data.value > availableBF) {
            errors.push(`Cannot allocate ${allocResult.data.value} BF. Only ${availableBF} BF available.`);
        }

        return createResult(errors.length === 0, errors, warnings);
    };

    // ============================================
    // Work Order Validation
    // ============================================

    /**
     * Validate work order line for BF calculation
     *
     * @param {Object} lineData - Line data
     * @returns {ValidationResult}
     */
    const validateWorkOrderLine = (lineData) => {
        const errors = [];
        const warnings = [];

        if (!lineData.itemId) {
            errors.push('Item is required');
        }

        // Validate quantity
        const qtyResult = validateQuantity(lineData.quantity, 'Quantity');
        if (!qtyResult.isValid) {
            errors.push(...qtyResult.errors);
        }

        // Validate UOM if provided
        if (lineData.sellingUom) {
            const uomResult = validateUOMCode(lineData.sellingUom);
            if (!uomResult.isValid) {
                errors.push(...uomResult.errors);
            } else {
                // Check dimensions for UOM
                const dimForUomResult = validateDimensionsForUOM(lineData.sellingUom, {
                    thickness: lineData.thickness,
                    width: lineData.width,
                    length: lineData.length
                });
                if (!dimForUomResult.isValid) {
                    errors.push(...dimForUomResult.errors);
                }
            }
        }

        // Validate yield if provided
        if (lineData.yieldPct !== undefined && lineData.yieldPct !== null) {
            const yieldResult = validateYieldPercentage(lineData.yieldPct);
            if (!yieldResult.isValid) {
                errors.push(...yieldResult.errors);
            }
            warnings.push(...yieldResult.warnings);
        }

        return createResult(errors.length === 0, errors, warnings);
    };

    // ============================================
    // Settings Validation
    // ============================================

    /**
     * Validate settings configuration
     *
     * @param {Object} settings - Settings object
     * @returns {ValidationResult}
     */
    const validateSettings = (settings) => {
        const errors = [];
        const warnings = [];

        // Validate default yield
        if (settings.DEFAULT_YIELD !== undefined) {
            const yieldResult = validateYieldPercentage(settings.DEFAULT_YIELD);
            if (!yieldResult.isValid) {
                errors.push(`Default Yield: ${yieldResult.errors.join(', ')}`);
            }
        }

        // Validate default waste
        if (settings.DEFAULT_WASTE !== undefined) {
            const wasteResult = validateWastePercentage(settings.DEFAULT_WASTE);
            if (!wasteResult.isValid) {
                errors.push(`Default Waste: ${wasteResult.errors.join(', ')}`);
            }
        }

        // Validate BF precision
        if (settings.BF_PRECISION !== undefined) {
            const precision = parseInt(settings.BF_PRECISION, 10);
            if (isNaN(precision) || precision < 0 || precision > 8) {
                errors.push('BF Precision must be between 0 and 8');
            }
        }

        // Module dependency validation
        if (settings.ENABLE_WASTE && !settings.ENABLE_YIELD) {
            errors.push('Waste Tracking requires Yield Tracking to be enabled');
        }

        if (settings.ENABLE_REPACK && !settings.ENABLE_TALLY) {
            errors.push('Repack Module requires Tally Sheets to be enabled');
        }

        return createResult(errors.length === 0, errors, warnings);
    };

    // ============================================
    // Utility Functions
    // ============================================

    /**
     * Combine multiple validation results
     *
     * @param {...ValidationResult} results - Validation results to combine
     * @returns {ValidationResult}
     */
    const combineResults = (...results) => {
        const errors = [];
        const warnings = [];

        results.forEach((result) => {
            if (result) {
                errors.push(...(result.errors || []));
                warnings.push(...(result.warnings || []));
            }
        });

        return createResult(errors.length === 0, errors, warnings);
    };

    /**
     * Format validation result for display
     *
     * @param {ValidationResult} result - Validation result
     * @returns {string} Formatted message
     */
    const formatResult = (result) => {
        const lines = [];

        if (!result.isValid) {
            lines.push('Validation Errors:');
            result.errors.forEach((error) => {
                lines.push(`  • ${error}`);
            });
        }

        if (result.hasWarnings) {
            lines.push('Warnings:');
            result.warnings.forEach((warning) => {
                lines.push(`  ⚠ ${warning}`);
            });
        }

        return lines.join('\n');
    };

    return {
        // Dimension validation
        validateDimension,
        validateDimensions,

        // UOM validation
        validateUOMCode,
        validateDimensionsForUOM,

        // Quantity validation
        validateQuantity,
        validateBoardFeet,

        // Percentage validation
        validatePercentage,
        validateYieldPercentage,
        validateWastePercentage,

        // Tally validation
        validateTallyData,
        validateTallyAllocation,

        // Work order validation
        validateWorkOrderLine,

        // Settings validation
        validateSettings,

        // Utilities
        createResult,
        combineResults,
        formatResult
    };
});
