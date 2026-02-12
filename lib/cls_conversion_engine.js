/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module cls_conversion_engine
 *
 * Consule LumberSuite™ - Dynamic UOM Conversion Engine
 * Converts between BF, LF, SF, MBF, MSF, and Bundle units
 *
 * This is the master conversion module that orchestrates all UOM conversions
 * for the LumberSuite application. All inventory is stored in BF (Board Feet),
 * and this engine handles conversion to/from display/selling UOMs.
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
    const UOM_LABELS = Constants.UOM_LABELS;
    const PRECISION = Constants.PRECISION;

    /**
     * Get the configured BF precision from settings
     * @returns {number} Decimal precision for BF values
     */
    const getPrecision = () => {
        try {
            return SettingsDAO.getBFPrecision();
        } catch (e) {
            return PRECISION.BF;
        }
    };

    /**
     * Validate that required parameters are present for conversion
     * @param {Object} params - Parameters to validate
     * @param {string} uomCode - UOM code being converted
     * @returns {Object} Validation result
     */
    const validateConversionParams = (params, uomCode) => {
        const { sourceQty, thickness, width, length, piecesPerBundle } = params;
        const errors = [];

        if (sourceQty === undefined || sourceQty === null) {
            errors.push('Source quantity is required');
        }

        // Check dimension requirements based on UOM
        const requiresThickness = [UOM_CODES.LINEAR_FEET, UOM_CODES.SQUARE_FEET,
                                    UOM_CODES.MSF, UOM_CODES.EACH, UOM_CODES.BUNDLE];
        const requiresWidth = [UOM_CODES.LINEAR_FEET, UOM_CODES.EACH, UOM_CODES.BUNDLE];
        const requiresLength = [UOM_CODES.EACH, UOM_CODES.BUNDLE];

        if (requiresThickness.includes(uomCode) && !thickness) {
            errors.push('Thickness is required for this UOM conversion');
        }

        if (requiresWidth.includes(uomCode) && !width) {
            errors.push('Width is required for this UOM conversion');
        }

        if (requiresLength.includes(uomCode) && !length) {
            errors.push('Length is required for this UOM conversion');
        }

        if (uomCode === UOM_CODES.BUNDLE && !piecesPerBundle) {
            errors.push('Pieces per bundle is required for bundle conversion');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    };

    /**
     * Master conversion function - converts any UOM to Board Feet (BF)
     * This is the primary function for converting selling UOM to inventory UOM
     *
     * @param {Object} params - Conversion parameters
     * @param {string} params.sourceUom - Source UOM code (LF, SF, BF, MBF, MSF, EACH, BUNDLE)
     * @param {number} params.sourceQty - Quantity in source UOM
     * @param {number} params.thickness - Thickness in inches
     * @param {number} params.width - Width in inches
     * @param {number} params.length - Length in feet (required for EACH/BUNDLE)
     * @param {number} [params.piecesPerBundle=1] - Pieces per bundle (for BUNDLE)
     * @param {number} [params.precision] - Decimal precision override
     * @returns {Object} { boardFeet: number, conversionFactor: number, isValid: boolean, error: string }
     */
    const convertToBoardFeet = (params) => {
        const {
            sourceUom,
            sourceQty,
            thickness,
            width,
            length,
            piecesPerBundle = 1,
            precision
        } = params;

        // Use configured precision or passed override
        const bfPrecision = precision !== undefined ? precision : getPrecision();

        // Validate UOM code
        if (!sourceUom || !Object.values(UOM_CODES).includes(sourceUom)) {
            return {
                boardFeet: 0,
                conversionFactor: 0,
                isValid: false,
                error: `Invalid UOM code: ${sourceUom}`
            };
        }

        // Handle null/zero quantity
        if (!sourceQty || parseFloat(sourceQty) === 0) {
            return {
                boardFeet: 0,
                conversionFactor: 0,
                isValid: true,
                error: null
            };
        }

        const qty = parseFloat(sourceQty);
        const t = parseFloat(thickness) || 0;
        const w = parseFloat(width) || 0;
        const l = parseFloat(length) || 0;
        const ppb = parseInt(piecesPerBundle, 10) || 1;

        let boardFeet = 0;
        let conversionFactor = 1;

        try {
            switch (sourceUom) {
                case UOM_CODES.BOARD_FEET:
                    // BF to BF - no conversion needed
                    boardFeet = qty;
                    conversionFactor = 1;
                    break;

                case UOM_CODES.LINEAR_FEET:
                    // BF = LF × (Thickness × Width) / 12
                    if (t <= 0 || w <= 0) {
                        return {
                            boardFeet: 0,
                            conversionFactor: 0,
                            isValid: false,
                            error: 'Thickness and width required for LF conversion'
                        };
                    }
                    conversionFactor = (t * w) / 12;
                    boardFeet = qty * conversionFactor;
                    break;

                case UOM_CODES.SQUARE_FEET:
                    // BF = SF × (Thickness / 12)
                    if (t <= 0) {
                        return {
                            boardFeet: 0,
                            conversionFactor: 0,
                            isValid: false,
                            error: 'Thickness required for SF conversion'
                        };
                    }
                    conversionFactor = t / 12;
                    boardFeet = qty * conversionFactor;
                    break;

                case UOM_CODES.MBF:
                    // MBF = 1000 Board Feet
                    conversionFactor = 1000;
                    boardFeet = qty * conversionFactor;
                    break;

                case UOM_CODES.MSF:
                    // MSF = 1000 Square Feet, then convert SF to BF
                    if (t <= 0) {
                        return {
                            boardFeet: 0,
                            conversionFactor: 0,
                            isValid: false,
                            error: 'Thickness required for MSF conversion'
                        };
                    }
                    // Factor = (thickness/12) * 1000
                    conversionFactor = (t / 12) * 1000;
                    boardFeet = qty * conversionFactor;
                    break;

                case UOM_CODES.EACH:
                    // Each piece: BF = (T × W × L) / 12
                    if (t <= 0 || w <= 0 || l <= 0) {
                        return {
                            boardFeet: 0,
                            conversionFactor: 0,
                            isValid: false,
                            error: 'All dimensions required for EACH conversion'
                        };
                    }
                    conversionFactor = BFCalculator.calculateBF({
                        thickness: t,
                        width: w,
                        length: l,
                        precision: PRECISION.FACTOR
                    });
                    boardFeet = qty * conversionFactor;
                    break;

                case UOM_CODES.BUNDLE:
                    // Bundle: BF = pieces × piecesPerBundle × BF per piece
                    if (t <= 0 || w <= 0 || l <= 0) {
                        return {
                            boardFeet: 0,
                            conversionFactor: 0,
                            isValid: false,
                            error: 'All dimensions required for BUNDLE conversion'
                        };
                    }
                    const bfPerPiece = BFCalculator.calculateBF({
                        thickness: t,
                        width: w,
                        length: l,
                        precision: PRECISION.FACTOR
                    });
                    conversionFactor = bfPerPiece * ppb;
                    boardFeet = qty * conversionFactor;
                    break;

                default:
                    return {
                        boardFeet: 0,
                        conversionFactor: 0,
                        isValid: false,
                        error: `Unsupported UOM code: ${sourceUom}`
                    };
            }

            return {
                boardFeet: BFCalculator.roundTo(boardFeet, bfPrecision),
                conversionFactor: BFCalculator.roundTo(conversionFactor, PRECISION.FACTOR),
                isValid: true,
                error: null,
                sourceUom: sourceUom,
                sourceQty: qty
            };

        } catch (e) {
            return {
                boardFeet: 0,
                conversionFactor: 0,
                isValid: false,
                error: `Conversion error: ${e.message}`
            };
        }
    };

    /**
     * Reverse conversion - Board Feet to target UOM
     * Used for displaying BF inventory in user's preferred UOM
     *
     * @param {Object} params - Conversion parameters
     * @param {number} params.boardFeet - Board feet to convert
     * @param {string} params.targetUom - Target UOM code
     * @param {number} params.thickness - Thickness in inches
     * @param {number} params.width - Width in inches
     * @param {number} params.length - Length in feet
     * @param {number} [params.piecesPerBundle=1] - Pieces per bundle
     * @param {number} [params.precision] - Decimal precision override
     * @returns {Object} { displayQty: number, conversionFactor: number, isValid: boolean, error: string }
     */
    const convertFromBoardFeet = (params) => {
        const {
            boardFeet,
            targetUom,
            thickness,
            width,
            length,
            piecesPerBundle = 1,
            precision
        } = params;

        const bfPrecision = precision !== undefined ? precision : getPrecision();

        // Validate UOM code
        if (!targetUom || !Object.values(UOM_CODES).includes(targetUom)) {
            return {
                displayQty: 0,
                conversionFactor: 0,
                isValid: false,
                error: `Invalid UOM code: ${targetUom}`
            };
        }

        // Handle null/zero BF
        if (!boardFeet || parseFloat(boardFeet) === 0) {
            return {
                displayQty: 0,
                conversionFactor: 0,
                isValid: true,
                error: null
            };
        }

        const bf = parseFloat(boardFeet);
        const t = parseFloat(thickness) || 0;
        const w = parseFloat(width) || 0;
        const l = parseFloat(length) || 0;
        const ppb = parseInt(piecesPerBundle, 10) || 1;

        let displayQty = 0;
        let conversionFactor = 1;

        try {
            switch (targetUom) {
                case UOM_CODES.BOARD_FEET:
                    displayQty = bf;
                    conversionFactor = 1;
                    break;

                case UOM_CODES.LINEAR_FEET:
                    if (t <= 0 || w <= 0) {
                        return {
                            displayQty: 0,
                            conversionFactor: 0,
                            isValid: false,
                            error: 'Thickness and width required for LF conversion'
                        };
                    }
                    // LF = BF / ((T × W) / 12)
                    conversionFactor = (t * w) / 12;
                    displayQty = bf / conversionFactor;
                    break;

                case UOM_CODES.SQUARE_FEET:
                    if (t <= 0) {
                        return {
                            displayQty: 0,
                            conversionFactor: 0,
                            isValid: false,
                            error: 'Thickness required for SF conversion'
                        };
                    }
                    // SF = BF / (T / 12)
                    conversionFactor = t / 12;
                    displayQty = bf / conversionFactor;
                    break;

                case UOM_CODES.MBF:
                    conversionFactor = 1000;
                    displayQty = bf / conversionFactor;
                    break;

                case UOM_CODES.MSF:
                    if (t <= 0) {
                        return {
                            displayQty: 0,
                            conversionFactor: 0,
                            isValid: false,
                            error: 'Thickness required for MSF conversion'
                        };
                    }
                    conversionFactor = (t / 12) * 1000;
                    displayQty = bf / conversionFactor;
                    break;

                case UOM_CODES.EACH:
                    if (t <= 0 || w <= 0 || l <= 0) {
                        return {
                            displayQty: 0,
                            conversionFactor: 0,
                            isValid: false,
                            error: 'All dimensions required for EACH conversion'
                        };
                    }
                    conversionFactor = BFCalculator.calculateBF({
                        thickness: t,
                        width: w,
                        length: l,
                        precision: PRECISION.FACTOR
                    });
                    displayQty = bf / conversionFactor;
                    break;

                case UOM_CODES.BUNDLE:
                    if (t <= 0 || w <= 0 || l <= 0) {
                        return {
                            displayQty: 0,
                            conversionFactor: 0,
                            isValid: false,
                            error: 'All dimensions required for BUNDLE conversion'
                        };
                    }
                    const bfPerPiece = BFCalculator.calculateBF({
                        thickness: t,
                        width: w,
                        length: l,
                        precision: PRECISION.FACTOR
                    });
                    conversionFactor = bfPerPiece * ppb;
                    displayQty = bf / conversionFactor;
                    break;

                default:
                    return {
                        displayQty: 0,
                        conversionFactor: 0,
                        isValid: false,
                        error: `Unsupported UOM code: ${targetUom}`
                    };
            }

            return {
                displayQty: BFCalculator.roundTo(displayQty, bfPrecision),
                conversionFactor: BFCalculator.roundTo(conversionFactor, PRECISION.FACTOR),
                isValid: true,
                error: null,
                targetUom: targetUom,
                boardFeet: bf
            };

        } catch (e) {
            return {
                displayQty: 0,
                conversionFactor: 0,
                isValid: false,
                error: `Conversion error: ${e.message}`
            };
        }
    };

    /**
     * Convert between any two UOMs
     * Converts source → BF → target
     *
     * @param {Object} params - Conversion parameters
     * @param {string} params.sourceUom - Source UOM code
     * @param {number} params.sourceQty - Source quantity
     * @param {string} params.targetUom - Target UOM code
     * @param {number} params.thickness - Thickness in inches
     * @param {number} params.width - Width in inches
     * @param {number} params.length - Length in feet
     * @param {number} [params.piecesPerBundle=1] - Pieces per bundle
     * @returns {Object} Conversion result
     */
    const convertBetweenUOMs = (params) => {
        const { sourceUom, sourceQty, targetUom, thickness, width, length, piecesPerBundle } = params;

        // First convert to BF
        const toBFResult = convertToBoardFeet({
            sourceUom,
            sourceQty,
            thickness,
            width,
            length,
            piecesPerBundle
        });

        if (!toBFResult.isValid) {
            return {
                result: 0,
                isValid: false,
                error: toBFResult.error,
                intermediaryBF: 0
            };
        }

        // Then convert from BF to target
        const fromBFResult = convertFromBoardFeet({
            boardFeet: toBFResult.boardFeet,
            targetUom,
            thickness,
            width,
            length,
            piecesPerBundle
        });

        if (!fromBFResult.isValid) {
            return {
                result: 0,
                isValid: false,
                error: fromBFResult.error,
                intermediaryBF: toBFResult.boardFeet
            };
        }

        return {
            result: fromBFResult.displayQty,
            isValid: true,
            error: null,
            sourceUom,
            sourceQty,
            targetUom,
            intermediaryBF: toBFResult.boardFeet,
            totalConversionFactor: toBFResult.conversionFactor / fromBFResult.conversionFactor
        };
    };

    /**
     * Calculate all conversion factors for a given dimension set
     * Used to display conversion reference on forms
     *
     * @param {number} thickness - Thickness in inches
     * @param {number} width - Width in inches
     * @param {number} length - Length in feet
     * @param {number} [piecesPerBundle=1] - Pieces per bundle
     * @returns {Object} All conversion factors
     */
    const calculateConversionMatrix = (thickness, width, length, piecesPerBundle = 1) => {
        const t = parseFloat(thickness) || 0;
        const w = parseFloat(width) || 0;
        const l = parseFloat(length) || 0;
        const ppb = parseInt(piecesPerBundle, 10) || 1;

        const bfPerPiece = t > 0 && w > 0 && l > 0
            ? BFCalculator.calculateBF({ thickness: t, width: w, length: l })
            : 0;

        return {
            // Factors to multiply source qty to get BF
            toBF: {
                [UOM_CODES.BOARD_FEET]: 1,
                [UOM_CODES.LINEAR_FEET]: t > 0 && w > 0 ? (t * w) / 12 : null,
                [UOM_CODES.SQUARE_FEET]: t > 0 ? t / 12 : null,
                [UOM_CODES.MBF]: 1000,
                [UOM_CODES.MSF]: t > 0 ? (t / 12) * 1000 : null,
                [UOM_CODES.EACH]: bfPerPiece || null,
                [UOM_CODES.BUNDLE]: bfPerPiece > 0 ? bfPerPiece * ppb : null
            },
            // Factors to divide BF to get target qty
            fromBF: {
                [UOM_CODES.BOARD_FEET]: 1,
                [UOM_CODES.LINEAR_FEET]: t > 0 && w > 0 ? (t * w) / 12 : null,
                [UOM_CODES.SQUARE_FEET]: t > 0 ? t / 12 : null,
                [UOM_CODES.MBF]: 1000,
                [UOM_CODES.MSF]: t > 0 ? (t / 12) * 1000 : null,
                [UOM_CODES.EACH]: bfPerPiece || null,
                [UOM_CODES.BUNDLE]: bfPerPiece > 0 ? bfPerPiece * ppb : null
            },
            // Human-readable descriptions
            descriptions: {
                [UOM_CODES.LINEAR_FEET]: t > 0 && w > 0
                    ? `1 LF = ${BFCalculator.roundTo((t * w) / 12, 4)} BF`
                    : 'Requires thickness and width',
                [UOM_CODES.SQUARE_FEET]: t > 0
                    ? `1 SF = ${BFCalculator.roundTo(t / 12, 4)} BF`
                    : 'Requires thickness',
                [UOM_CODES.MBF]: '1 MBF = 1,000 BF',
                [UOM_CODES.MSF]: t > 0
                    ? `1 MSF = ${BFCalculator.roundTo((t / 12) * 1000, 4)} BF`
                    : 'Requires thickness',
                [UOM_CODES.EACH]: bfPerPiece > 0
                    ? `1 PC = ${bfPerPiece} BF`
                    : 'Requires all dimensions',
                [UOM_CODES.BUNDLE]: bfPerPiece > 0
                    ? `1 BDL (${ppb} pcs) = ${BFCalculator.roundTo(bfPerPiece * ppb, 4)} BF`
                    : 'Requires all dimensions'
            },
            dimensions: {
                thickness: t,
                width: w,
                length: l,
                piecesPerBundle: ppb
            },
            bfPerPiece: bfPerPiece
        };
    };

    /**
     * Get list of available UOMs that can be used with given dimensions
     * Some UOMs require specific dimensions to be set
     *
     * @param {number} thickness - Thickness in inches
     * @param {number} width - Width in inches
     * @param {number} length - Length in feet
     * @returns {Array} Available UOM options
     */
    const getAvailableUOMs = (thickness, width, length) => {
        const t = parseFloat(thickness) || 0;
        const w = parseFloat(width) || 0;
        const l = parseFloat(length) || 0;

        const uoms = [
            {
                code: UOM_CODES.BOARD_FEET,
                label: UOM_LABELS.BF,
                available: true,
                requiresDimensions: false
            },
            {
                code: UOM_CODES.LINEAR_FEET,
                label: UOM_LABELS.LF,
                available: t > 0 && w > 0,
                requiresDimensions: true,
                requiredDims: ['thickness', 'width']
            },
            {
                code: UOM_CODES.SQUARE_FEET,
                label: UOM_LABELS.SF,
                available: t > 0,
                requiresDimensions: true,
                requiredDims: ['thickness']
            },
            {
                code: UOM_CODES.MBF,
                label: UOM_LABELS.MBF,
                available: true,
                requiresDimensions: false
            },
            {
                code: UOM_CODES.MSF,
                label: UOM_LABELS.MSF,
                available: t > 0,
                requiresDimensions: true,
                requiredDims: ['thickness']
            },
            {
                code: UOM_CODES.EACH,
                label: UOM_LABELS.EACH,
                available: t > 0 && w > 0 && l > 0,
                requiresDimensions: true,
                requiredDims: ['thickness', 'width', 'length']
            },
            {
                code: UOM_CODES.BUNDLE,
                label: UOM_LABELS.BUNDLE,
                available: t > 0 && w > 0 && l > 0,
                requiresDimensions: true,
                requiredDims: ['thickness', 'width', 'length', 'piecesPerBundle']
            }
        ];

        return uoms;
    };

    /**
     * Check if Dynamic UOM conversion is enabled
     * @returns {boolean}
     */
    const isEnabled = () => {
        try {
            return SettingsDAO.isDynamicUomEnabled();
        } catch (e) {
            return true; // Default to enabled
        }
    };

    /**
     * Get UOM label for display
     * @param {string} uomCode - UOM code
     * @returns {string} Display label
     */
    const getUOMLabel = (uomCode) => {
        return UOM_LABELS[uomCode] || uomCode;
    };

    /**
     * Validate a UOM code
     * @param {string} uomCode - UOM code to validate
     * @returns {boolean}
     */
    const isValidUOM = (uomCode) => {
        return Object.values(UOM_CODES).includes(uomCode);
    };

    return {
        // Core conversion functions
        convertToBoardFeet,
        convertFromBoardFeet,
        convertBetweenUOMs,

        // Reference data
        calculateConversionMatrix,
        getAvailableUOMs,

        // Utilities
        isEnabled,
        getUOMLabel,
        isValidUOM,
        validateConversionParams,

        // Constants re-export for convenience
        UOM_CODES,
        UOM_LABELS
    };
});
