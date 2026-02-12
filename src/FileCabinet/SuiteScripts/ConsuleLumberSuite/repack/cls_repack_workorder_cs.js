/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @file cls_repack_workorder_cs.js
 * @description Repack Work Order Client Script for Consule LumberSuite™
 *              Client-side functionality for repack operations
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module repack/cls_repack_workorder_cs
 */

define([
    'N/currentRecord',
    'N/search',
    'N/url',
    'N/https',
    'N/ui/dialog',
    'N/ui/message'
], function(
    currentRecord,
    search,
    url,
    https,
    dialog,
    message
) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    const FIELD_IDS = {
        REPACK_TYPE: 'custrecord_cls_repack_type',
        STATUS: 'custrecord_cls_repack_status',
        SOURCE_TALLY: 'custrecord_cls_repack_source_tally',
        SOURCE_ITEM: 'custrecord_cls_repack_source_item',
        OUTPUT_ITEM: 'custrecord_cls_repack_output_item',
        SOURCE_LOCATION: 'custrecord_cls_repack_location',
        INPUT_BF: 'custrecord_cls_repack_input_bf',
        OUTPUT_BF: 'custrecord_cls_repack_output_bf',
        WASTE_BF: 'custrecord_cls_repack_waste_bf',
        YIELD_PERCENT: 'custrecord_cls_repack_yield_pct',
        INPUT_PIECES: 'custrecord_cls_repack_input_pieces',
        OUTPUT_PIECES: 'custrecord_cls_repack_output_pieces',
        WASTE_PIECES: 'custrecord_cls_repack_waste_pieces',
        OUTPUT_THICKNESS: 'custrecord_cls_repack_out_thickness',
        OUTPUT_WIDTH: 'custrecord_cls_repack_out_width',
        OUTPUT_LENGTH: 'custrecord_cls_repack_out_length',
        BF_PER_PIECE: 'custrecord_cls_repack_bf_per_piece'
    };

    const REPACK_TYPES = {
        BUNDLE_REPACK: 'bundle_repack',
        BOARD_RESAW: 'board_resaw',
        BUNDLE_SPLIT: 'bundle_split',
        BOARD_TRIM: 'board_trim',
        GRADE_SORT: 'grade_sort'
    };

    let isCalculating = false;

    // ═══════════════════════════════════════════════════════════════════════
    // PAGE INIT
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * pageInit Entry Point
     *
     * @param {Object} context - Script context
     */
    function pageInit(context) {
        console.log('LumberSuite™ Repack Work Order Client Script initialized');

        const rec = context.currentRecord;

        // Show type-specific instructions on load
        updateTypeInstructions(rec);

        // Display yield indicator if we have output
        const outputBF = parseFloat(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;
        if (outputBF > 0) {
            displayYieldIndicator(rec);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FIELD CHANGED
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * fieldChanged Entry Point
     *
     * @param {Object} context - Script context
     */
    function fieldChanged(context) {
        const rec = context.currentRecord;
        const fieldId = context.fieldId;

        if (isCalculating) return;

        try {
            isCalculating = true;

            switch (fieldId) {
                case FIELD_IDS.SOURCE_TALLY:
                    onSourceTallyChanged(rec);
                    break;

                case FIELD_IDS.REPACK_TYPE:
                    onRepackTypeChanged(rec);
                    break;

                case FIELD_IDS.OUTPUT_PIECES:
                case FIELD_IDS.OUTPUT_THICKNESS:
                case FIELD_IDS.OUTPUT_WIDTH:
                case FIELD_IDS.OUTPUT_LENGTH:
                    calculateOutputBF(rec);
                    break;

                case FIELD_IDS.OUTPUT_BF:
                    calculateYieldMetrics(rec);
                    break;

                case FIELD_IDS.INPUT_BF:
                    recalculateWaste(rec);
                    break;

                case FIELD_IDS.OUTPUT_ITEM:
                    onOutputItemChanged(rec);
                    break;
            }

        } finally {
            isCalculating = false;
        }
    }

    /**
     * Handles source tally selection change
     *
     * @param {Record} rec - Current record
     */
    function onSourceTallyChanged(rec) {
        const tallyId = rec.getValue({ fieldId: FIELD_IDS.SOURCE_TALLY });

        if (!tallyId) {
            clearSourceFields(rec);
            return;
        }

        // Fetch tally details
        try {
            const tallyData = search.lookupFields({
                type: 'customrecord_cls_tally_sheet',
                id: tallyId,
                columns: [
                    'custrecord_cls_tally_item',
                    'custrecord_cls_tally_location',
                    'custrecord_cls_tally_bf_available',
                    'custrecord_cls_tally_pieces',
                    'custrecord_cls_tally_status'
                ]
            });

            // Check availability
            const status = tallyData.custrecord_cls_tally_status;
            if (status === 'consumed' || status === 'void' || status === 'closed') {
                dialog.alert({
                    title: 'Tally Unavailable',
                    message: `This tally is ${status} and cannot be used for repack.`
                });
                rec.setValue({ fieldId: FIELD_IDS.SOURCE_TALLY, value: '' });
                return;
            }

            // Populate source item
            const itemRef = tallyData.custrecord_cls_tally_item;
            if (itemRef && itemRef.length > 0) {
                rec.setValue({
                    fieldId: FIELD_IDS.SOURCE_ITEM,
                    value: itemRef[0].value
                });

                // Default output item to same as source
                const outputItem = rec.getValue({ fieldId: FIELD_IDS.OUTPUT_ITEM });
                if (!outputItem) {
                    rec.setValue({
                        fieldId: FIELD_IDS.OUTPUT_ITEM,
                        value: itemRef[0].value
                    });
                }
            }

            // Populate location
            const locationRef = tallyData.custrecord_cls_tally_location;
            if (locationRef && locationRef.length > 0) {
                rec.setValue({
                    fieldId: FIELD_IDS.SOURCE_LOCATION,
                    value: locationRef[0].value
                });
            }

            // Populate available BF and pieces
            const availableBF = parseFloat(tallyData.custrecord_cls_tally_bf_available) || 0;
            const pieces = parseInt(tallyData.custrecord_cls_tally_pieces, 10) || 0;

            rec.setValue({
                fieldId: FIELD_IDS.INPUT_BF,
                value: availableBF
            });

            rec.setValue({
                fieldId: FIELD_IDS.INPUT_PIECES,
                value: pieces
            });

            // Show tally info message
            showMessage('info', 'Tally Loaded',
                `Available: ${availableBF.toFixed(2)} BF, ${pieces} pieces`);

        } catch (e) {
            console.error('Error fetching tally data:', e);
            dialog.alert({
                title: 'Error',
                message: 'Failed to load tally details. Please try again.'
            });
        }
    }

    /**
     * Clears source fields
     *
     * @param {Record} rec - Current record
     */
    function clearSourceFields(rec) {
        rec.setValue({ fieldId: FIELD_IDS.SOURCE_ITEM, value: '' });
        rec.setValue({ fieldId: FIELD_IDS.INPUT_BF, value: 0 });
        rec.setValue({ fieldId: FIELD_IDS.INPUT_PIECES, value: 0 });
    }

    /**
     * Handles repack type change
     *
     * @param {Record} rec - Current record
     */
    function onRepackTypeChanged(rec) {
        const repackType = rec.getValue({ fieldId: FIELD_IDS.REPACK_TYPE });

        updateTypeInstructions(rec);

        // Show/hide dimension fields based on type
        const dimensionFields = [
            FIELD_IDS.OUTPUT_THICKNESS,
            FIELD_IDS.OUTPUT_WIDTH,
            FIELD_IDS.OUTPUT_LENGTH
        ];

        const showDimensions = (repackType === REPACK_TYPES.BOARD_RESAW ||
                               repackType === REPACK_TYPES.BOARD_TRIM);

        // Note: Client script cannot hide fields, but we can show guidance
        if (showDimensions) {
            showMessage('info', 'Dimension Entry',
                'Enter output dimensions to calculate BF per piece.');
        }
    }

    /**
     * Updates type-specific instructions
     *
     * @param {Record} rec - Current record
     */
    function updateTypeInstructions(rec) {
        const repackType = rec.getValue({ fieldId: FIELD_IDS.REPACK_TYPE });

        const instructions = {
            [REPACK_TYPES.BUNDLE_REPACK]: 'Repackage boards from source bundle into new bundles. ' +
                'Enter output pieces and BF for the new bundle configuration.',
            [REPACK_TYPES.BOARD_RESAW]: 'Resaw boards into different dimensions. ' +
                'Enter new dimensions and piece count. BF will be auto-calculated.',
            [REPACK_TYPES.BUNDLE_SPLIT]: 'Split a bundle into multiple smaller bundles. ' +
                'Enter output pieces for this portion of the split.',
            [REPACK_TYPES.BOARD_TRIM]: 'Trim boards to specific lengths. ' +
                'Enter new length and piece count.',
            [REPACK_TYPES.GRADE_SORT]: 'Sort and repackage boards by grade. ' +
                'Track yield for the selected grade output.'
        };

        const instruction = instructions[repackType];
        if (instruction) {
            console.log('Repack Instructions:', instruction);
        }
    }

    /**
     * Calculates output BF from dimensions
     *
     * @param {Record} rec - Current record
     */
    function calculateOutputBF(rec) {
        const thickness = parseFloat(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_THICKNESS })) || 0;
        const width = parseFloat(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_WIDTH })) || 0;
        const length = parseFloat(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_LENGTH })) || 0;
        const pieces = parseInt(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_PIECES }), 10) || 0;

        if (thickness > 0 && width > 0 && length > 0) {
            // BF = (Thickness × Width × Length) / 12
            const bfPerPiece = (thickness * width * length) / 12;
            const totalBF = bfPerPiece * pieces;

            rec.setValue({
                fieldId: FIELD_IDS.BF_PER_PIECE,
                value: bfPerPiece
            });

            rec.setValue({
                fieldId: FIELD_IDS.OUTPUT_BF,
                value: totalBF
            });

            console.log(`Calculated: ${bfPerPiece.toFixed(4)} BF/pc × ${pieces} = ${totalBF.toFixed(2)} BF`);
        }

        // Recalculate yield
        calculateYieldMetrics(rec);
    }

    /**
     * Calculates yield metrics
     *
     * @param {Record} rec - Current record
     */
    function calculateYieldMetrics(rec) {
        const inputBF = parseFloat(rec.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;
        const outputBF = parseFloat(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;

        if (inputBF <= 0) return;

        // Validate output doesn't exceed input
        if (outputBF > inputBF) {
            showMessage('warning', 'Invalid Output',
                'Output BF cannot exceed input BF. Please verify values.');
            return;
        }

        // Calculate waste and yield
        const wasteBF = inputBF - outputBF;
        const yieldPct = (outputBF / inputBF) * 100;

        rec.setValue({
            fieldId: FIELD_IDS.WASTE_BF,
            value: wasteBF
        });

        rec.setValue({
            fieldId: FIELD_IDS.YIELD_PERCENT,
            value: yieldPct
        });

        // Display yield indicator
        displayYieldIndicator(rec);
    }

    /**
     * Recalculates waste when input changes
     *
     * @param {Record} rec - Current record
     */
    function recalculateWaste(rec) {
        const inputBF = parseFloat(rec.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;
        const outputBF = parseFloat(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;

        if (outputBF > 0) {
            const wasteBF = Math.max(0, inputBF - outputBF);
            const yieldPct = inputBF > 0 ? (outputBF / inputBF) * 100 : 0;

            rec.setValue({
                fieldId: FIELD_IDS.WASTE_BF,
                value: wasteBF
            });

            rec.setValue({
                fieldId: FIELD_IDS.YIELD_PERCENT,
                value: yieldPct
            });

            displayYieldIndicator(rec);
        }
    }

    /**
     * Displays visual yield indicator
     *
     * @param {Record} rec - Current record
     */
    function displayYieldIndicator(rec) {
        const yieldPct = parseFloat(rec.getValue({ fieldId: FIELD_IDS.YIELD_PERCENT })) || 0;

        let type = 'information';
        let title = 'Yield';
        let msg = '';

        if (yieldPct >= 90) {
            type = 'confirmation';
            title = 'Excellent Yield';
            msg = `${yieldPct.toFixed(1)}% - Outstanding efficiency`;
        } else if (yieldPct >= 80) {
            type = 'information';
            title = 'Good Yield';
            msg = `${yieldPct.toFixed(1)}% - Within expected range`;
        } else if (yieldPct >= 70) {
            type = 'warning';
            title = 'Below Target Yield';
            msg = `${yieldPct.toFixed(1)}% - Consider reviewing process`;
        } else if (yieldPct > 0) {
            type = 'error';
            title = 'Low Yield Alert';
            msg = `${yieldPct.toFixed(1)}% - Significant waste detected`;
        }

        if (msg) {
            showMessage(type, title, msg);
        }
    }

    /**
     * Handles output item change
     *
     * @param {Record} rec - Current record
     */
    function onOutputItemChanged(rec) {
        const outputItemId = rec.getValue({ fieldId: FIELD_IDS.OUTPUT_ITEM });

        if (!outputItemId) return;

        // Try to get default dimensions from item
        try {
            const itemData = search.lookupFields({
                type: search.Type.INVENTORY_ITEM,
                id: outputItemId,
                columns: [
                    'custitem_cls_nominal_thickness',
                    'custitem_cls_nominal_width',
                    'custitem_cls_length'
                ]
            });

            const thickness = parseFloat(itemData.custitem_cls_nominal_thickness) || 0;
            const width = parseFloat(itemData.custitem_cls_nominal_width) || 0;
            const length = parseFloat(itemData.custitem_cls_length) || 0;

            if (thickness > 0) {
                rec.setValue({
                    fieldId: FIELD_IDS.OUTPUT_THICKNESS,
                    value: thickness
                });
            }

            if (width > 0) {
                rec.setValue({
                    fieldId: FIELD_IDS.OUTPUT_WIDTH,
                    value: width
                });
            }

            if (length > 0) {
                rec.setValue({
                    fieldId: FIELD_IDS.OUTPUT_LENGTH,
                    value: length
                });
            }

            // Recalculate if we have dimensions
            if (thickness > 0 && width > 0 && length > 0) {
                calculateOutputBF(rec);
            }

        } catch (e) {
            console.log('Could not fetch item dimensions:', e.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDATE FIELD
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * validateField Entry Point
     *
     * @param {Object} context - Script context
     * @returns {boolean} Field is valid
     */
    function validateField(context) {
        const rec = context.currentRecord;
        const fieldId = context.fieldId;

        switch (fieldId) {
            case FIELD_IDS.INPUT_BF:
                return validateInputBF(rec);

            case FIELD_IDS.OUTPUT_BF:
                return validateOutputBF(rec);

            case FIELD_IDS.OUTPUT_PIECES:
                return validateOutputPieces(rec);

            case FIELD_IDS.OUTPUT_THICKNESS:
            case FIELD_IDS.OUTPUT_WIDTH:
            case FIELD_IDS.OUTPUT_LENGTH:
                return validateDimension(rec, fieldId);
        }

        return true;
    }

    /**
     * Validates input BF
     *
     * @param {Record} rec - Current record
     * @returns {boolean} Valid
     */
    function validateInputBF(rec) {
        const inputBF = parseFloat(rec.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;

        if (inputBF < 0) {
            dialog.alert({
                title: 'Invalid Value',
                message: 'Input BF cannot be negative.'
            });
            return false;
        }

        return true;
    }

    /**
     * Validates output BF
     *
     * @param {Record} rec - Current record
     * @returns {boolean} Valid
     */
    function validateOutputBF(rec) {
        const inputBF = parseFloat(rec.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;
        const outputBF = parseFloat(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;

        if (outputBF < 0) {
            dialog.alert({
                title: 'Invalid Value',
                message: 'Output BF cannot be negative.'
            });
            return false;
        }

        if (outputBF > inputBF && inputBF > 0) {
            dialog.alert({
                title: 'Invalid Output',
                message: `Output BF (${outputBF.toFixed(2)}) cannot exceed input BF (${inputBF.toFixed(2)}).`
            });
            return false;
        }

        return true;
    }

    /**
     * Validates output pieces
     *
     * @param {Record} rec - Current record
     * @returns {boolean} Valid
     */
    function validateOutputPieces(rec) {
        const outputPieces = parseInt(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_PIECES }), 10) || 0;

        if (outputPieces < 0) {
            dialog.alert({
                title: 'Invalid Value',
                message: 'Output pieces cannot be negative.'
            });
            return false;
        }

        return true;
    }

    /**
     * Validates dimension field
     *
     * @param {Record} rec - Current record
     * @param {string} fieldId - Field ID
     * @returns {boolean} Valid
     */
    function validateDimension(rec, fieldId) {
        const value = parseFloat(rec.getValue({ fieldId: fieldId })) || 0;

        if (value < 0) {
            dialog.alert({
                title: 'Invalid Dimension',
                message: 'Dimension values cannot be negative.'
            });
            return false;
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SAVE RECORD
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * saveRecord Entry Point
     *
     * @param {Object} context - Script context
     * @returns {boolean} Allow save
     */
    function saveRecord(context) {
        const rec = context.currentRecord;
        const status = rec.getValue({ fieldId: FIELD_IDS.STATUS });

        // Validate required fields
        const sourceTally = rec.getValue({ fieldId: FIELD_IDS.SOURCE_TALLY });
        if (!sourceTally) {
            dialog.alert({
                title: 'Missing Required Field',
                message: 'Please select a source tally.'
            });
            return false;
        }

        const repackType = rec.getValue({ fieldId: FIELD_IDS.REPACK_TYPE });
        if (!repackType) {
            dialog.alert({
                title: 'Missing Required Field',
                message: 'Please select a repack type.'
            });
            return false;
        }

        const inputBF = parseFloat(rec.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;
        if (inputBF <= 0) {
            dialog.alert({
                title: 'Invalid Input',
                message: 'Input BF must be greater than zero.'
            });
            return false;
        }

        // Additional validation for completion
        if (status === 'completed') {
            return validateCompletion(rec);
        }

        return true;
    }

    /**
     * Validates completion requirements
     *
     * @param {Record} rec - Current record
     * @returns {boolean} Valid for completion
     */
    function validateCompletion(rec) {
        const outputBF = parseFloat(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;
        const outputPieces = parseInt(rec.getValue({ fieldId: FIELD_IDS.OUTPUT_PIECES }), 10) || 0;

        if (outputBF <= 0) {
            dialog.alert({
                title: 'Completion Error',
                message: 'Output BF is required to complete the repack.'
            });
            return false;
        }

        if (outputPieces <= 0) {
            dialog.alert({
                title: 'Completion Error',
                message: 'Output pieces count is required to complete the repack.'
            });
            return false;
        }

        // Warn on low yield
        const yieldPct = parseFloat(rec.getValue({ fieldId: FIELD_IDS.YIELD_PERCENT })) || 0;
        if (yieldPct < 70) {
            // Note: Synchronous confirm would be better but using async for compatibility
            return confirm(`Yield is ${yieldPct.toFixed(1)}% which is below 70%. Continue with completion?`);
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ACTION HANDLERS (Called from buttons)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Starts processing the repack order
     *
     * @param {number} repackId - Repack record ID
     */
    function startProcessing(repackId) {
        dialog.confirm({
            title: 'Start Processing',
            message: 'This will mark the repack order as pending and lock source tally. Continue?'
        }).then(function(result) {
            if (result) {
                updateRepackStatus(repackId, 'pending');
            }
        });
    }

    /**
     * Cancels the repack order
     *
     * @param {number} repackId - Repack record ID
     */
    function cancelOrder(repackId) {
        dialog.confirm({
            title: 'Cancel Order',
            message: 'Are you sure you want to cancel this repack order?'
        }).then(function(result) {
            if (result) {
                updateRepackStatus(repackId, 'cancelled');
            }
        });
    }

    /**
     * Begins the repack operation
     *
     * @param {number} repackId - Repack record ID
     */
    function beginRepack(repackId) {
        dialog.confirm({
            title: 'Begin Repack',
            message: 'Start the repack operation now?'
        }).then(function(result) {
            if (result) {
                updateRepackStatus(repackId, 'in_progress');
            }
        });
    }

    /**
     * Completes the repack operation
     *
     * @param {number} repackId - Repack record ID
     */
    function completeRepack(repackId) {
        dialog.confirm({
            title: 'Complete Repack',
            message: 'Mark this repack as complete? This will consume the source tally and create output tally.'
        }).then(function(result) {
            if (result) {
                // Open completion form
                const completionUrl = url.resolveScript({
                    scriptId: 'customscript_cls_repack_wizard_sl',
                    deploymentId: 'customdeploy_cls_repack_wizard_sl',
                    params: {
                        mode: 'complete',
                        repackId: repackId
                    }
                });
                window.location.href = completionUrl;
            }
        });
    }

    /**
     * Pauses the repack operation
     *
     * @param {number} repackId - Repack record ID
     */
    function pauseRepack(repackId) {
        dialog.confirm({
            title: 'Pause Repack',
            message: 'Pause this repack operation?'
        }).then(function(result) {
            if (result) {
                updateRepackStatus(repackId, 'pending');
            }
        });
    }

    /**
     * Prints repack report
     *
     * @param {number} repackId - Repack record ID
     */
    function printReport(repackId) {
        const printUrl = url.resolveScript({
            scriptId: 'customscript_cls_repack_wizard_sl',
            deploymentId: 'customdeploy_cls_repack_wizard_sl',
            params: {
                mode: 'print',
                repackId: repackId
            }
        });
        window.open(printUrl, '_blank');
    }

    /**
     * Views output tally
     *
     * @param {number} repackId - Repack record ID
     */
    function viewOutputTally(repackId) {
        try {
            const repackData = search.lookupFields({
                type: 'customrecord_cls_repack_workorder',
                id: repackId,
                columns: ['custrecord_cls_repack_created_tally']
            });

            const tallyRef = repackData.custrecord_cls_repack_created_tally;
            if (tallyRef && tallyRef.length > 0) {
                const tallyUrl = url.resolveRecord({
                    recordType: 'customrecord_cls_tally_sheet',
                    recordId: tallyRef[0].value
                });
                window.open(tallyUrl, '_blank');
            } else {
                dialog.alert({
                    title: 'No Output Tally',
                    message: 'No output tally was created for this repack.'
                });
            }
        } catch (e) {
            dialog.alert({
                title: 'Error',
                message: 'Failed to open output tally.'
            });
        }
    }

    /**
     * Updates repack status via REST
     *
     * @param {number} repackId - Repack record ID
     * @param {string} newStatus - New status value
     */
    function updateRepackStatus(repackId, newStatus) {
        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_repack_wizard_sl',
            deploymentId: 'customdeploy_cls_repack_wizard_sl',
            params: {
                action: 'updateStatus',
                repackId: repackId,
                status: newStatus
            }
        });

        https.get.promise({
            url: suiteletUrl
        }).then(function(response) {
            const result = JSON.parse(response.body);
            if (result.success) {
                showMessage('confirmation', 'Success', 'Status updated successfully.');
                window.location.reload();
            } else {
                dialog.alert({
                    title: 'Error',
                    message: result.message || 'Failed to update status.'
                });
            }
        }).catch(function(error) {
            dialog.alert({
                title: 'Error',
                message: 'Failed to update status: ' + error.message
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Shows a temporary message banner
     *
     * @param {string} type - Message type
     * @param {string} title - Message title
     * @param {string} msg - Message text
     */
    function showMessage(type, title, msg) {
        try {
            const msgWidget = message.create({
                type: message.Type[type.toUpperCase()] || message.Type.INFORMATION,
                title: title,
                message: msg,
                duration: 5000
            });
            msgWidget.show();
        } catch (e) {
            console.log(`${title}: ${msg}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSE GLOBAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    window.startProcessing = startProcessing;
    window.cancelOrder = cancelOrder;
    window.beginRepack = beginRepack;
    window.completeRepack = completeRepack;
    window.pauseRepack = pauseRepack;
    window.printReport = printReport;
    window.viewOutputTally = viewOutputTally;

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE EXPORTS
    // ═══════════════════════════════════════════════════════════════════════

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        validateField: validateField,
        saveRecord: saveRecord
    };
});
