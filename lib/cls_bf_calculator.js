/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module cls_bf_calculator
 *
 * Consule LumberSuite™ - Board Feet Calculator
 * Core mathematical engine for all board feet calculations
 *
 * Board Foot Definition:
 * A board foot is a unit of volume equal to a board that is 1 inch thick,
 * 12 inches wide, and 1 foot long (144 cubic inches).
 *
 * Standard Formula:
 * BF = (Thickness[inches] × Width[inches] × Length[feet]) / 12
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define(['./cls_constants'], (Constants) => {

    const PRECISION = Constants.PRECISION;

    /**
     * Round a number to specified decimal places
     * @param {number} value - Value to round
     * @param {number} decimals - Number of decimal places
     * @returns {number} Rounded value
     */
    const roundTo = (value, decimals) => {
        if (typeof value !== 'number' || isNaN(value)) {
            return 0;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    };

    /**
     * Validate dimension inputs
     * @param {number} thickness - Thickness in inches
     * @param {number} width - Width in inches
     * @param {number} length - Length in feet
     * @returns {Object} Validation result with isValid and message
     */
    const validateDimensions = (thickness, width, length) => {
        const errors = [];

        if (thickness === undefined || thickness === null || thickness <= 0) {
            errors.push('Thickness must be a positive number');
        }
        if (width === undefined || width === null || width <= 0) {
            errors.push('Width must be a positive number');
        }
        if (length === undefined || length === null || length <= 0) {
            errors.push('Length must be a positive number');
        }

        return {
            isValid: errors.length === 0,
            message: errors.join('; ')
        };
    };

    /**
     * Calculate board feet from dimensions
     * Primary calculation method
     *
     * Formula: BF = (Thickness × Width × Length) / 12
     * Where: Thickness in inches, Width in inches, Length in feet
     *
     * @param {Object} params - Dimension parameters
     * @param {number} params.thickness - Thickness in inches
     * @param {number} params.width - Width in inches
     * @param {number} params.length - Length in feet
     * @param {number} [params.precision=4] - Decimal precision
     * @returns {number} Board feet
     */
    const calculateBF = (params) => {
        const {
            thickness,
            width,
            length,
            precision = PRECISION.BF
        } = params;

        // Handle missing or invalid values
        if (!thickness || !width || !length) {
            return 0;
        }

        const t = parseFloat(thickness);
        const w = parseFloat(width);
        const l = parseFloat(length);

        if (isNaN(t) || isNaN(w) || isNaN(l)) {
            return 0;
        }

        if (t <= 0 || w <= 0 || l <= 0) {
            return 0;
        }

        // Standard formula: (T × W × L) / 12
        const boardFeet = (t * w * l) / 12;

        return roundTo(boardFeet, precision);
    };

    /**
     * Calculate board feet from dimensions where length is in inches
     * Alternate formula for inch-based measurements
     *
     * Formula: BF = (Thickness × Width × Length) / 144
     * Where: All dimensions in inches
     *
     * @param {Object} params - Dimension parameters
     * @param {number} params.thickness - Thickness in inches
     * @param {number} params.width - Width in inches
     * @param {number} params.lengthInches - Length in inches
     * @param {number} [params.precision=4] - Decimal precision
     * @returns {number} Board feet
     */
    const calculateBFFromInches = (params) => {
        const {
            thickness,
            width,
            lengthInches,
            precision = PRECISION.BF
        } = params;

        if (!thickness || !width || !lengthInches) {
            return 0;
        }

        const t = parseFloat(thickness);
        const w = parseFloat(width);
        const l = parseFloat(lengthInches);

        if (isNaN(t) || isNaN(w) || isNaN(l) || t <= 0 || w <= 0 || l <= 0) {
            return 0;
        }

        // Formula for all inches: (T × W × L) / 144
        const boardFeet = (t * w * l) / 144;

        return roundTo(boardFeet, precision);
    };

    /**
     * Calculate board feet from linear feet
     * Used when selling by linear foot
     *
     * Formula: BF = LF × (Thickness × Width) / 12
     *
     * @param {number} linearFeet - Quantity in linear feet
     * @param {number} thickness - Thickness in inches
     * @param {number} width - Width in inches
     * @param {number} [precision=4] - Decimal precision
     * @returns {number} Board feet
     */
    const calculateBFFromLF = (linearFeet, thickness, width, precision = PRECISION.BF) => {
        if (!linearFeet || !thickness || !width) {
            return 0;
        }

        const lf = parseFloat(linearFeet);
        const t = parseFloat(thickness);
        const w = parseFloat(width);

        if (isNaN(lf) || isNaN(t) || isNaN(w) || lf <= 0 || t <= 0 || w <= 0) {
            return 0;
        }

        // BF = LF × (T × W) / 12
        const boardFeet = lf * (t * w) / 12;

        return roundTo(boardFeet, precision);
    };

    /**
     * Calculate board feet from square feet
     * Used when selling by square foot (flooring, paneling, etc.)
     *
     * Formula: BF = SF × (Thickness / 12)
     * Note: SF already accounts for width × length
     *
     * @param {number} squareFeet - Quantity in square feet
     * @param {number} thickness - Thickness in inches
     * @param {number} [precision=4] - Decimal precision
     * @returns {number} Board feet
     */
    const calculateBFFromSF = (squareFeet, thickness, precision = PRECISION.BF) => {
        if (!squareFeet || !thickness) {
            return 0;
        }

        const sf = parseFloat(squareFeet);
        const t = parseFloat(thickness);

        if (isNaN(sf) || isNaN(t) || sf <= 0 || t <= 0) {
            return 0;
        }

        // BF = SF × (T / 12)
        const boardFeet = sf * (t / 12);

        return roundTo(boardFeet, precision);
    };

    /**
     * Calculate board feet from MBF (Thousand Board Feet)
     *
     * @param {number} mbf - Quantity in MBF
     * @param {number} [precision=4] - Decimal precision
     * @returns {number} Board feet
     */
    const calculateBFFromMBF = (mbf, precision = PRECISION.BF) => {
        if (!mbf) return 0;

        const value = parseFloat(mbf);
        if (isNaN(value) || value <= 0) return 0;

        return roundTo(value * 1000, precision);
    };

    /**
     * Calculate board feet from MSF (Thousand Square Feet)
     *
     * @param {number} msf - Quantity in MSF
     * @param {number} thickness - Thickness in inches
     * @param {number} [precision=4] - Decimal precision
     * @returns {number} Board feet
     */
    const calculateBFFromMSF = (msf, thickness, precision = PRECISION.BF) => {
        if (!msf || !thickness) return 0;

        const value = parseFloat(msf);
        const t = parseFloat(thickness);

        if (isNaN(value) || isNaN(t) || value <= 0 || t <= 0) return 0;

        // MSF × 1000 = SF, then SF × (T/12) = BF
        const squareFeet = value * 1000;
        return roundTo(squareFeet * (t / 12), precision);
    };

    /**
     * Calculate board feet from piece count (Each/Bundle)
     *
     * @param {number} pieces - Number of pieces
     * @param {number} thickness - Thickness in inches
     * @param {number} width - Width in inches
     * @param {number} length - Length in feet
     * @param {number} [precision=4] - Decimal precision
     * @returns {number} Board feet
     */
    const calculateBFFromPieces = (pieces, thickness, width, length, precision = PRECISION.BF) => {
        if (!pieces || !thickness || !width || !length) return 0;

        const p = parseFloat(pieces);
        const bfPerPiece = calculateBF({ thickness, width, length, precision: 6 });

        if (p <= 0 || bfPerPiece <= 0) return 0;

        return roundTo(p * bfPerPiece, precision);
    };

    // ============================================
    // Reverse Calculations (BF to other UOMs)
    // ============================================

    /**
     * Calculate linear feet from board feet
     *
     * Formula: LF = BF / ((T × W) / 12)
     *
     * @param {number} boardFeet - Board feet quantity
     * @param {number} thickness - Thickness in inches
     * @param {number} width - Width in inches
     * @param {number} [precision=4] - Decimal precision
     * @returns {number} Linear feet
     */
    const calculateLFFromBF = (boardFeet, thickness, width, precision = PRECISION.BF) => {
        if (!boardFeet || !thickness || !width) return 0;

        const bf = parseFloat(boardFeet);
        const t = parseFloat(thickness);
        const w = parseFloat(width);

        if (isNaN(bf) || isNaN(t) || isNaN(w) || t <= 0 || w <= 0) return 0;

        const factor = (t * w) / 12;
        if (factor <= 0) return 0;

        return roundTo(bf / factor, precision);
    };

    /**
     * Calculate square feet from board feet
     *
     * Formula: SF = BF / (T / 12)
     *
     * @param {number} boardFeet - Board feet quantity
     * @param {number} thickness - Thickness in inches
     * @param {number} [precision=4] - Decimal precision
     * @returns {number} Square feet
     */
    const calculateSFFromBF = (boardFeet, thickness, precision = PRECISION.BF) => {
        if (!boardFeet || !thickness) return 0;

        const bf = parseFloat(boardFeet);
        const t = parseFloat(thickness);

        if (isNaN(bf) || isNaN(t) || t <= 0) return 0;

        const factor = t / 12;
        if (factor <= 0) return 0;

        return roundTo(bf / factor, precision);
    };

    /**
     * Calculate MBF from board feet
     *
     * @param {number} boardFeet - Board feet quantity
     * @param {number} [precision=4] - Decimal precision
     * @returns {number} Thousand board feet
     */
    const calculateMBFFromBF = (boardFeet, precision = PRECISION.BF) => {
        if (!boardFeet) return 0;

        const bf = parseFloat(boardFeet);
        if (isNaN(bf)) return 0;

        return roundTo(bf / 1000, precision);
    };

    /**
     * Calculate MSF from board feet
     *
     * @param {number} boardFeet - Board feet quantity
     * @param {number} thickness - Thickness in inches
     * @param {number} [precision=4] - Decimal precision
     * @returns {number} Thousand square feet
     */
    const calculateMSFFromBF = (boardFeet, thickness, precision = PRECISION.BF) => {
        if (!boardFeet || !thickness) return 0;

        const squareFeet = calculateSFFromBF(boardFeet, thickness, 6);
        if (squareFeet <= 0) return 0;

        return roundTo(squareFeet / 1000, precision);
    };

    /**
     * Calculate piece count from board feet
     *
     * @param {number} boardFeet - Board feet quantity
     * @param {number} thickness - Thickness in inches
     * @param {number} width - Width in inches
     * @param {number} length - Length in feet
     * @param {number} [precision=4] - Decimal precision
     * @returns {number} Number of pieces
     */
    const calculatePiecesFromBF = (boardFeet, thickness, width, length, precision = PRECISION.BF) => {
        if (!boardFeet || !thickness || !width || !length) return 0;

        const bf = parseFloat(boardFeet);
        const bfPerPiece = calculateBF({ thickness, width, length, precision: 6 });

        if (bfPerPiece <= 0) return 0;

        return roundTo(bf / bfPerPiece, precision);
    };

    // ============================================
    // Utility Calculations
    // ============================================

    /**
     * Calculate Surface Measure
     * Used in lumber grading and board foot calculation reference
     *
     * SM = (Width × Length) / 12
     * Where: Width in inches, Length in feet
     *
     * @param {number} width - Width in inches
     * @param {number} length - Length in feet
     * @returns {number} Surface measure
     */
    const calculateSurfaceMeasure = (width, length) => {
        if (!width || !length) return 0;

        const w = parseFloat(width);
        const l = parseFloat(length);

        if (isNaN(w) || isNaN(l) || w <= 0 || l <= 0) return 0;

        return roundTo((w * l) / 12, 4);
    };

    /**
     * Calculate BF per linear foot for given cross-section
     * Useful for quick reference and pricing
     *
     * @param {number} thickness - Thickness in inches
     * @param {number} width - Width in inches
     * @returns {number} BF per linear foot
     */
    const calculateBFPerLinearFoot = (thickness, width) => {
        if (!thickness || !width) return 0;

        const t = parseFloat(thickness);
        const w = parseFloat(width);

        if (isNaN(t) || isNaN(w) || t <= 0 || w <= 0) return 0;

        // (T × W) / 12 = BF per LF
        return roundTo((t * w) / 12, PRECISION.FACTOR);
    };

    /**
     * Calculate BF per square foot for given thickness
     *
     * @param {number} thickness - Thickness in inches
     * @returns {number} BF per square foot
     */
    const calculateBFPerSquareFoot = (thickness) => {
        if (!thickness) return 0;

        const t = parseFloat(thickness);
        if (isNaN(t) || t <= 0) return 0;

        // T / 12 = BF per SF
        return roundTo(t / 12, PRECISION.FACTOR);
    };

    /**
     * Calculate all conversion factors for a dimension set
     * Returns a reference object for pricing and display
     *
     * @param {number} thickness - Thickness in inches
     * @param {number} width - Width in inches
     * @param {number} length - Length in feet
     * @returns {Object} Conversion factors
     */
    const calculateConversionFactors = (thickness, width, length) => {
        const t = parseFloat(thickness) || 0;
        const w = parseFloat(width) || 0;
        const l = parseFloat(length) || 0;

        return {
            bfPerPiece: calculateBF({ thickness: t, width: w, length: l }),
            bfPerLinearFoot: calculateBFPerLinearFoot(t, w),
            bfPerSquareFoot: calculateBFPerSquareFoot(t),
            lfToBfFactor: (t * w) / 12,
            sfToBfFactor: t / 12,
            surfaceMeasure: calculateSurfaceMeasure(w, l),
            cubicFeet: roundTo((t * w * l * 12) / 1728, 4), // Volume in cubic feet
            dimensions: {
                thickness: t,
                width: w,
                length: l
            }
        };
    };

    /**
     * Apply yield percentage to theoretical BF
     * Calculate actual required consumption based on expected yield
     *
     * @param {number} theoreticalBF - Required finished BF
     * @param {number} yieldPct - Expected yield percentage (0-100)
     * @returns {number} Required raw material BF
     */
    const applyYield = (theoreticalBF, yieldPct) => {
        if (!theoreticalBF || !yieldPct) return theoreticalBF;

        const bf = parseFloat(theoreticalBF);
        const pct = parseFloat(yieldPct);

        if (isNaN(bf) || isNaN(pct) || pct <= 0 || pct > 100) {
            return bf;
        }

        // If yield is 95%, need to consume: BF / 0.95
        return roundTo(bf / (pct / 100), PRECISION.BF);
    };

    /**
     * Calculate waste from consumption
     *
     * @param {number} consumedBF - Total BF consumed
     * @param {number} outputBF - Actual BF output
     * @returns {Object} Waste analysis
     */
    const calculateWaste = (consumedBF, outputBF) => {
        const consumed = parseFloat(consumedBF) || 0;
        const output = parseFloat(outputBF) || 0;

        const wasteBF = consumed - output;
        const yieldPct = consumed > 0 ? (output / consumed) * 100 : 0;
        const wastePct = consumed > 0 ? (wasteBF / consumed) * 100 : 0;

        return {
            consumedBF: roundTo(consumed, PRECISION.BF),
            outputBF: roundTo(output, PRECISION.BF),
            wasteBF: roundTo(wasteBF, PRECISION.BF),
            yieldPct: roundTo(yieldPct, PRECISION.PERCENTAGE),
            wastePct: roundTo(wastePct, PRECISION.PERCENTAGE)
        };
    };

    /**
     * Validate that a BF quantity is reasonable for given dimensions
     * Sanity check for data entry
     *
     * @param {number} boardFeet - BF to validate
     * @param {number} thickness - Thickness in inches
     * @param {number} width - Width in inches
     * @param {number} length - Length in feet
     * @returns {Object} Validation result
     */
    const validateBFQuantity = (boardFeet, thickness, width, length) => {
        const bf = parseFloat(boardFeet) || 0;
        const bfPerPiece = calculateBF({ thickness, width, length });

        if (bfPerPiece <= 0) {
            return {
                isValid: false,
                message: 'Invalid dimensions provided',
                impliedPieces: 0
            };
        }

        const impliedPieces = bf / bfPerPiece;

        // Warn if implied pieces is a very fractional number
        const remainder = impliedPieces % 1;
        const isWholeNumber = remainder < 0.001 || remainder > 0.999;

        return {
            isValid: true,
            impliedPieces: roundTo(impliedPieces, 2),
            isWholeNumber: isWholeNumber,
            message: isWholeNumber ? '' : `Note: ${roundTo(impliedPieces, 2)} pieces implied`,
            bfPerPiece: bfPerPiece
        };
    };

    return {
        // Core calculations
        calculateBF,
        calculateBFFromInches,
        calculateBFFromLF,
        calculateBFFromSF,
        calculateBFFromMBF,
        calculateBFFromMSF,
        calculateBFFromPieces,

        // Reverse calculations
        calculateLFFromBF,
        calculateSFFromBF,
        calculateMBFFromBF,
        calculateMSFFromBF,
        calculatePiecesFromBF,

        // Utility calculations
        calculateSurfaceMeasure,
        calculateBFPerLinearFoot,
        calculateBFPerSquareFoot,
        calculateConversionFactors,

        // Yield and waste
        applyYield,
        calculateWaste,

        // Validation
        validateDimensions,
        validateBFQuantity,

        // Utility
        roundTo
    };
});
