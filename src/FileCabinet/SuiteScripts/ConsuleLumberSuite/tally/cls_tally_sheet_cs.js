/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @file cls_tally_sheet_cs.js
 * @description Tally Sheet Client Script for Consule LumberSuite™
 *              Provides real-time BF calculations and tally management
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module tally/cls_tally_sheet_cs
 */

define([
    'N/currentRecord',
    'N/search',
    'N/url',
    'N/ui/dialog',
    'N/ui/message',
    'N/https',
    '../lib/cls_constants',
    '../lib/cls_bf_calculator'
], function(
    currentRecord,
    search,
    url,
    dialog,
    message,
    https,
    Constants,
    BFCalculator
) {
    'use strict';

    /**
     * Flag to prevent recursive field changes
     * @type {boolean}
     */
    let isCalculating = false;

    /**
     * Active message banner
     * @type {Object}
     */
    let activeBanner = null;

    /**
     * Item data cache
     * @type {Map}
     */
    const itemCache = new Map();

    /**
     * Tally status constants
     * @type {Object}
     */
    const TALLY_STATUS = {
        DRAFT: 'draft',
        ACTIVE: 'active',
        PARTIAL: 'partial',
        CONSUMED: 'consumed',
        CLOSED: 'closed',
        VOID: 'void'
    };

    /**
     * pageInit Entry Point
     * Initializes the tally sheet form
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.mode - Page mode
     */
    function pageInit(context) {
        const rec = context.currentRecord;

        if (context.mode === 'create') {
            showInfoBanner('New Tally Sheet', 'Enter item, dimensions, and piece count to calculate BF.');
        }

        if (context.mode === 'edit') {
            const status = rec.getValue({ fieldId: Constants.TALLY_FIELDS.STATUS });
            if (status === TALLY_STATUS.CONSUMED) {
                showWarningBanner('Consumed Tally', 'This tally is fully consumed. Editing is limited.');
            }
        }

        updateBFDisplay(rec);

        console.log('LumberSuite™ Tally Sheet Client Script initialized');
    }

    /**
     * fieldChanged Entry Point
     * Handles field changes for real-time calculations
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.fieldId - Changed field ID
     */
    function fieldChanged(context) {
        if (isCalculating) {
            return;
        }

        const rec = context.currentRecord;
        const fieldId = context.fieldId;

        switch (fieldId) {
            case Constants.TALLY_FIELDS.ITEM:
                handleItemChange(rec);
                break;

            case Constants.TALLY_FIELDS.THICKNESS:
            case Constants.TALLY_FIELDS.WIDTH:
            case Constants.TALLY_FIELDS.LENGTH:
            case Constants.TALLY_FIELDS.PIECE_COUNT:
                calculateTallyBF(rec);
                break;

            case Constants.TALLY_FIELDS.BUNDLE_COUNT:
            case Constants.TALLY_FIELDS.PIECES_PER_BUNDLE:
                calculatePiecesFromBundles(rec);
                calculateTallyBF(rec);
                break;

            case Constants.TALLY_FIELDS.STATUS:
                handleStatusChange(rec);
                break;
        }

        updateBFDisplay(rec);
    }

    /**
     * Handles item selection change
     *
     * @param {Record} rec - Current record
     */
    function handleItemChange(rec) {
        const itemId = rec.getValue({ fieldId: Constants.TALLY_FIELDS.ITEM });

        if (!itemId) {
            return;
        }

        const itemData = getItemData(itemId);

        if (itemData) {
            isCalculating = true;

            try {
                // Set dimensions from item defaults
                if (itemData.nominalThickness) {
                    rec.setValue({
                        fieldId: Constants.TALLY_FIELDS.THICKNESS,
                        value: itemData.nominalThickness,
                        ignoreFieldChange: true
                    });
                }

                if (itemData.nominalWidth) {
                    rec.setValue({
                        fieldId: Constants.TALLY_FIELDS.WIDTH,
                        value: itemData.nominalWidth,
                        ignoreFieldChange: true
                    });
                }

                if (itemData.nominalLength) {
                    rec.setValue({
                        fieldId: Constants.TALLY_FIELDS.LENGTH,
                        value: itemData.nominalLength,
                        ignoreFieldChange: true
                    });
                }

                if (itemData.piecesPerBundle) {
                    rec.setValue({
                        fieldId: Constants.TALLY_FIELDS.PIECES_PER_BUNDLE,
                        value: itemData.piecesPerBundle,
                        ignoreFieldChange: true
                    });
                }

                showInfoBanner('Item Selected',
                    `Dimensions set from item defaults: ${itemData.nominalThickness}" x ${itemData.nominalWidth}" x ${itemData.nominalLength}'`);

            } finally {
                isCalculating = false;
            }

            // Recalculate BF with new dimensions
            calculateTallyBF(rec);
        }
    }

    /**
     * Gets item data with caching
     *
     * @param {string|number} itemId - Item internal ID
     * @returns {Object|null} Item data
     */
    function getItemData(itemId) {
        if (!itemId) {
            return null;
        }

        if (itemCache.has(itemId)) {
            return itemCache.get(itemId);
        }

        try {
            const itemLookup = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: [
                    Constants.ITEM_FIELDS.NOMINAL_THICKNESS,
                    Constants.ITEM_FIELDS.NOMINAL_WIDTH,
                    Constants.ITEM_FIELDS.NOMINAL_LENGTH,
                    Constants.ITEM_FIELDS.PIECES_PER_BUNDLE,
                    Constants.ITEM_FIELDS.SPECIES,
                    Constants.ITEM_FIELDS.GRADE,
                    'itemid'
                ]
            });

            const itemData = {
                id: itemId,
                itemId: itemLookup.itemid,
                nominalThickness: parseFloat(itemLookup[Constants.ITEM_FIELDS.NOMINAL_THICKNESS]) || 0,
                nominalWidth: parseFloat(itemLookup[Constants.ITEM_FIELDS.NOMINAL_WIDTH]) || 0,
                nominalLength: parseFloat(itemLookup[Constants.ITEM_FIELDS.NOMINAL_LENGTH]) || 0,
                piecesPerBundle: parseFloat(itemLookup[Constants.ITEM_FIELDS.PIECES_PER_BUNDLE]) || 0,
                species: itemLookup[Constants.ITEM_FIELDS.SPECIES],
                grade: itemLookup[Constants.ITEM_FIELDS.GRADE]
            };

            itemCache.set(itemId, itemData);
            return itemData;
        } catch (e) {
            console.error('Error loading item data:', e.message);
            return null;
        }
    }

    /**
     * Calculates tally BF based on dimensions and piece count
     *
     * @param {Record} rec - Current record
     */
    function calculateTallyBF(rec) {
        isCalculating = true;

        try {
            const thickness = parseFloat(rec.getValue({
                fieldId: Constants.TALLY_FIELDS.THICKNESS
            })) || 0;

            const width = parseFloat(rec.getValue({
                fieldId: Constants.TALLY_FIELDS.WIDTH
            })) || 0;

            const length = parseFloat(rec.getValue({
                fieldId: Constants.TALLY_FIELDS.LENGTH
            })) || 0;

            const pieceCount = parseFloat(rec.getValue({
                fieldId: Constants.TALLY_FIELDS.PIECE_COUNT
            })) || 0;

            // Calculate BF per piece
            let bfPerPiece = 0;
            if (thickness > 0 && width > 0 && length > 0) {
                bfPerPiece = (thickness * width * length) / 12;
            }

            rec.setValue({
                fieldId: Constants.TALLY_FIELDS.BF_PER_PIECE,
                value: bfPerPiece,
                ignoreFieldChange: true
            });

            // Calculate total BF
            const totalBF = bfPerPiece * pieceCount;

            rec.setValue({
                fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF,
                value: totalBF,
                ignoreFieldChange: true
            });

            // Update remaining BF for new records
            const status = rec.getValue({ fieldId: Constants.TALLY_FIELDS.STATUS });
            if (status === TALLY_STATUS.DRAFT || !status) {
                rec.setValue({
                    fieldId: Constants.TALLY_FIELDS.REMAINING_BF,
                    value: totalBF,
                    ignoreFieldChange: true
                });

                rec.setValue({
                    fieldId: Constants.TALLY_FIELDS.REMAINING_PIECES,
                    value: pieceCount,
                    ignoreFieldChange: true
                });
            }

            console.log(`Tally BF: ${pieceCount} pcs x ${bfPerPiece.toFixed(4)} BF/pc = ${totalBF.toFixed(4)} BF`);

        } finally {
            isCalculating = false;
        }
    }

    /**
     * Calculates piece count from bundle information
     *
     * @param {Record} rec - Current record
     */
    function calculatePiecesFromBundles(rec) {
        isCalculating = true;

        try {
            const bundleCount = parseFloat(rec.getValue({
                fieldId: Constants.TALLY_FIELDS.BUNDLE_COUNT
            })) || 0;

            const piecesPerBundle = parseFloat(rec.getValue({
                fieldId: Constants.TALLY_FIELDS.PIECES_PER_BUNDLE
            })) || 0;

            if (bundleCount > 0 && piecesPerBundle > 0) {
                const totalPieces = bundleCount * piecesPerBundle;

                rec.setValue({
                    fieldId: Constants.TALLY_FIELDS.PIECE_COUNT,
                    value: totalPieces,
                    ignoreFieldChange: true
                });

                showInfoBanner('Pieces Calculated',
                    `${bundleCount} bundles x ${piecesPerBundle} pcs/bundle = ${totalPieces} total pieces`);
            }
        } finally {
            isCalculating = false;
        }
    }

    /**
     * Handles status change
     *
     * @param {Record} rec - Current record
     */
    function handleStatusChange(rec) {
        const newStatus = rec.getValue({ fieldId: Constants.TALLY_FIELDS.STATUS });

        switch (newStatus) {
            case TALLY_STATUS.VOID:
                showWarningBanner('Voiding Tally',
                    'This tally will be marked as void. Any existing allocations will remain but no new allocations will be allowed.');
                break;

            case TALLY_STATUS.CLOSED:
                showInfoBanner('Closing Tally',
                    'This tally will be closed. Remaining inventory will be written off.');
                break;

            case TALLY_STATUS.ACTIVE:
                showSuccessBanner('Activating Tally',
                    'This tally will be activated and available for allocation.');
                break;
        }
    }

    /**
     * Updates the BF display
     *
     * @param {Record} rec - Current record
     */
    function updateBFDisplay(rec) {
        const bfPerPiece = parseFloat(rec.getValue({
            fieldId: Constants.TALLY_FIELDS.BF_PER_PIECE
        })) || 0;

        const originalBF = parseFloat(rec.getValue({
            fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF
        })) || 0;

        const remainingBF = parseFloat(rec.getValue({
            fieldId: Constants.TALLY_FIELDS.REMAINING_BF
        })) || 0;

        const pieceCount = parseFloat(rec.getValue({
            fieldId: Constants.TALLY_FIELDS.PIECE_COUNT
        })) || 0;

        console.log(`Tally Summary: ${pieceCount} pcs, ${bfPerPiece.toFixed(4)} BF/pc, Total: ${originalBF.toFixed(2)} BF, Remaining: ${remainingBF.toFixed(2)} BF`);
    }

    /**
     * validateField Entry Point
     * Validates individual field values
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.fieldId - Field being validated
     * @returns {boolean} True if valid
     */
    function validateField(context) {
        const rec = context.currentRecord;
        const fieldId = context.fieldId;

        switch (fieldId) {
            case Constants.TALLY_FIELDS.THICKNESS:
            case Constants.TALLY_FIELDS.WIDTH:
            case Constants.TALLY_FIELDS.LENGTH:
                return validateDimension(rec, fieldId);

            case Constants.TALLY_FIELDS.PIECE_COUNT:
                return validatePieceCount(rec);

            case Constants.TALLY_FIELDS.BUNDLE_COUNT:
            case Constants.TALLY_FIELDS.PIECES_PER_BUNDLE:
                return validateBundleInfo(rec, fieldId);
        }

        return true;
    }

    /**
     * Validates dimension field
     *
     * @param {Record} rec - Current record
     * @param {string} fieldId - Field ID
     * @returns {boolean} True if valid
     */
    function validateDimension(rec, fieldId) {
        const value = parseFloat(rec.getValue({ fieldId: fieldId })) || 0;

        if (value < 0) {
            showErrorBanner('Invalid Dimension', 'Dimensions cannot be negative.');
            return false;
        }

        // Check for unreasonable values
        const limits = {
            [Constants.TALLY_FIELDS.THICKNESS]: { max: 24, name: 'Thickness' },
            [Constants.TALLY_FIELDS.WIDTH]: { max: 48, name: 'Width' },
            [Constants.TALLY_FIELDS.LENGTH]: { max: 40, name: 'Length' }
        };

        const limit = limits[fieldId];
        if (limit && value > limit.max) {
            showWarningBanner('Unusual Dimension',
                `${limit.name} of ${value} seems unusually large. Please verify.`);
        }

        return true;
    }

    /**
     * Validates piece count
     *
     * @param {Record} rec - Current record
     * @returns {boolean} True if valid
     */
    function validatePieceCount(rec) {
        const pieceCount = parseFloat(rec.getValue({
            fieldId: Constants.TALLY_FIELDS.PIECE_COUNT
        })) || 0;

        if (pieceCount < 0) {
            showErrorBanner('Invalid Piece Count', 'Piece count cannot be negative.');
            return false;
        }

        // Check against remaining pieces for edited records
        const status = rec.getValue({ fieldId: Constants.TALLY_FIELDS.STATUS });
        if (status !== TALLY_STATUS.DRAFT) {
            const remainingPieces = parseFloat(rec.getValue({
                fieldId: Constants.TALLY_FIELDS.REMAINING_PIECES
            })) || 0;

            const originalPieces = parseFloat(rec.getValue({
                fieldId: Constants.TALLY_FIELDS.ORIGINAL_PIECES
            })) || pieceCount;

            const consumedPieces = originalPieces - remainingPieces;

            if (pieceCount < consumedPieces) {
                showErrorBanner('Invalid Reduction',
                    `Cannot reduce below ${consumedPieces} pieces (already consumed).`);
                return false;
            }
        }

        return true;
    }

    /**
     * Validates bundle information
     *
     * @param {Record} rec - Current record
     * @param {string} fieldId - Field ID
     * @returns {boolean} True if valid
     */
    function validateBundleInfo(rec, fieldId) {
        const value = parseFloat(rec.getValue({ fieldId: fieldId })) || 0;

        if (value < 0) {
            showErrorBanner('Invalid Value', 'Bundle values cannot be negative.');
            return false;
        }

        return true;
    }

    /**
     * saveRecord Entry Point
     * Validates the complete record before saving
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @returns {boolean} True to allow save
     */
    function saveRecord(context) {
        const rec = context.currentRecord;

        // Validate required fields
        const item = rec.getValue({ fieldId: Constants.TALLY_FIELDS.ITEM });
        if (!item) {
            dialog.alert({
                title: 'Missing Item',
                message: 'Please select an item for this tally sheet.'
            });
            return false;
        }

        const location = rec.getValue({ fieldId: Constants.TALLY_FIELDS.LOCATION });
        if (!location) {
            dialog.alert({
                title: 'Missing Location',
                message: 'Please select a location for this tally sheet.'
            });
            return false;
        }

        // Validate dimensions
        const thickness = parseFloat(rec.getValue({ fieldId: Constants.TALLY_FIELDS.THICKNESS })) || 0;
        const width = parseFloat(rec.getValue({ fieldId: Constants.TALLY_FIELDS.WIDTH })) || 0;
        const length = parseFloat(rec.getValue({ fieldId: Constants.TALLY_FIELDS.LENGTH })) || 0;

        if (thickness <= 0 || width <= 0 || length <= 0) {
            dialog.alert({
                title: 'Invalid Dimensions',
                message: 'Please enter valid dimensions (thickness, width, and length).'
            });
            return false;
        }

        // Validate piece count
        const pieceCount = parseFloat(rec.getValue({ fieldId: Constants.TALLY_FIELDS.PIECE_COUNT })) || 0;
        if (pieceCount <= 0) {
            dialog.alert({
                title: 'Invalid Piece Count',
                message: 'Please enter a valid piece count.'
            });
            return false;
        }

        return true;
    }

    // ============ Action Button Handlers ============

    /**
     * Activates a draft tally
     */
    function activateTally() {
        dialog.confirm({
            title: 'Activate Tally',
            message: 'Activating this tally will make it available for allocation on transactions. Continue?'
        }).then(function(result) {
            if (result) {
                const rec = currentRecord.get();
                rec.setValue({
                    fieldId: Constants.TALLY_FIELDS.STATUS,
                    value: TALLY_STATUS.ACTIVE
                });

                showSuccessBanner('Status Changed', 'Tally will be activated when saved.');
            }
        });
    }

    /**
     * Closes a tally
     */
    function closeTally() {
        const rec = currentRecord.get();
        const remainingBF = parseFloat(rec.getValue({
            fieldId: Constants.TALLY_FIELDS.REMAINING_BF
        })) || 0;

        let msg = 'Closing this tally will prevent further allocations.';
        if (remainingBF > 0) {
            msg += ` ${remainingBF.toFixed(2)} BF will be written off.`;
        }
        msg += ' Continue?';

        dialog.confirm({
            title: 'Close Tally',
            message: msg
        }).then(function(result) {
            if (result) {
                rec.setValue({
                    fieldId: Constants.TALLY_FIELDS.STATUS,
                    value: TALLY_STATUS.CLOSED
                });

                showInfoBanner('Status Changed', 'Tally will be closed when saved.');
            }
        });
    }

    /**
     * Voids a tally
     */
    function voidTally() {
        dialog.confirm({
            title: 'Void Tally',
            message: 'Voiding this tally will mark it as invalid. Existing allocations will remain but no new allocations will be allowed. Continue?'
        }).then(function(result) {
            if (result) {
                const rec = currentRecord.get();
                rec.setValue({
                    fieldId: Constants.TALLY_FIELDS.STATUS,
                    value: TALLY_STATUS.VOID
                });

                showWarningBanner('Status Changed', 'Tally will be voided when saved.');
            }
        });
    }

    /**
     * Splits a tally into multiple tallies
     */
    function splitTally() {
        const rec = currentRecord.get();
        const remainingPieces = parseFloat(rec.getValue({
            fieldId: Constants.TALLY_FIELDS.REMAINING_PIECES
        })) || 0;

        if (remainingPieces < 2) {
            dialog.alert({
                title: 'Cannot Split',
                message: 'This tally does not have enough remaining pieces to split.'
            });
            return;
        }

        dialog.alert({
            title: 'Split Tally',
            message: `This tally has ${remainingPieces} remaining pieces. Use the Tally Allocation Suitelet to split this tally into multiple tallies.`
        });
    }

    /**
     * Prints the tally sheet
     */
    function printTally() {
        const rec = currentRecord.get();
        const tallyId = rec.id;

        if (!tallyId) {
            dialog.alert({
                title: 'Save First',
                message: 'Please save the tally sheet before printing.'
            });
            return;
        }

        // Open print view
        const printUrl = url.resolveScript({
            scriptId: 'customscript_cls_tally_print_sl',
            deploymentId: 'customdeploy_cls_tally_print_sl',
            params: { tallyId: tallyId }
        });

        window.open(printUrl, '_blank');
    }

    // ============ UI Helper Functions ============

    /**
     * Shows info banner
     *
     * @param {string} title - Banner title
     * @param {string} msg - Banner message
     */
    function showInfoBanner(title, msg) {
        hideBanner();
        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.INFORMATION,
            duration: 5000
        });
        activeBanner.show();
    }

    /**
     * Shows success banner
     *
     * @param {string} title - Banner title
     * @param {string} msg - Banner message
     */
    function showSuccessBanner(title, msg) {
        hideBanner();
        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.CONFIRMATION,
            duration: 5000
        });
        activeBanner.show();
    }

    /**
     * Shows warning banner
     *
     * @param {string} title - Banner title
     * @param {string} msg - Banner message
     */
    function showWarningBanner(title, msg) {
        hideBanner();
        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.WARNING,
            duration: 7000
        });
        activeBanner.show();
    }

    /**
     * Shows error banner
     *
     * @param {string} title - Banner title
     * @param {string} msg - Banner message
     */
    function showErrorBanner(title, msg) {
        hideBanner();
        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.ERROR,
            duration: 10000
        });
        activeBanner.show();
    }

    /**
     * Hides active banner
     */
    function hideBanner() {
        if (activeBanner) {
            try {
                activeBanner.hide();
            } catch (e) {
                // Banner may already be hidden
            }
            activeBanner = null;
        }
    }

    // Expose action functions globally
    window.activateTally = activateTally;
    window.closeTally = closeTally;
    window.voidTally = voidTally;
    window.splitTally = splitTally;
    window.printTally = printTally;

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        validateField: validateField,
        saveRecord: saveRecord
    };
});
