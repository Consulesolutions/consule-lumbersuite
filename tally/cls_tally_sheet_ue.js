/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * @file cls_tally_sheet_ue.js
 * @description Tally Sheet User Event Script for Consule LumberSuite™
 *              Manages tally sheet lifecycle, BF calculations, and allocation tracking
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module tally/cls_tally_sheet_ue
 */

define([
    'N/record',
    'N/search',
    'N/runtime',
    'N/ui/serverWidget',
    'N/format',
    'N/log',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_bf_calculator',
    '../lib/cls_dimension_resolver',
    '../lib/cls_logger'
], function(
    record,
    search,
    runtime,
    serverWidget,
    format,
    log,
    Constants,
    SettingsDAO,
    BFCalculator,
    DimensionResolver,
    Logger
) {
    'use strict';

    /**
     * Module-level logger instance
     * @type {Object}
     */
    const logger = Logger.createLogger('CLS_TallySheet_UE');

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
     * beforeLoad Entry Point
     * Adds tally dashboard, allocation history, and action buttons
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {string} context.type - Trigger type
     * @param {Form} context.form - Current form
     */
    function beforeLoad(context) {
        const startTime = Date.now();

        try {
            if (!SettingsDAO.isTallyEnabled()) {
                return;
            }

            const tallyRec = context.newRecord;
            const form = context.form;

            if (context.type === context.UserEventType.VIEW) {
                addTallyDashboard(tallyRec, form);
                addAllocationHistory(tallyRec, form);
                addConsumptionSummary(tallyRec, form);
                addActionButtons(tallyRec, form);
            }

            if (context.type === context.UserEventType.CREATE) {
                setDefaultValues(tallyRec);
            }

            if (context.type === context.UserEventType.EDIT) {
                addEditWarnings(tallyRec, form);
            }

            logger.debug('beforeLoad', `Completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('beforeLoad', `Error: ${e.message}`, { stack: e.stack });
        }
    }

    /**
     * beforeSubmit Entry Point
     * Calculates BF totals, validates data, and manages status transitions
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record (edit only)
     * @param {string} context.type - Trigger type
     */
    function beforeSubmit(context) {
        const startTime = Date.now();

        try {
            if (!SettingsDAO.isTallyEnabled()) {
                return;
            }

            if (context.type === context.UserEventType.DELETE) {
                validateDeletion(context.oldRecord);
                return;
            }

            const tallyRec = context.newRecord;

            validateRequiredFields(tallyRec);
            calculateTallyBF(tallyRec);
            calculatePieceCount(tallyRec);
            validateDimensions(tallyRec);
            updateStatus(tallyRec, context.type, context.oldRecord);
            generateTallyNumber(tallyRec, context.type);

            logger.audit('beforeSubmit', `Tally sheet processing completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('beforeSubmit', `Error: ${e.message}`, { stack: e.stack });
            throw e;
        }
    }

    /**
     * afterSubmit Entry Point
     * Creates allocation records, updates inventory, and logs activity
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record (edit only)
     * @param {string} context.type - Trigger type
     */
    function afterSubmit(context) {
        const startTime = Date.now();

        try {
            if (!SettingsDAO.isTallyEnabled()) {
                return;
            }

            const tallyRec = record.load({
                type: Constants.RECORD_TYPES.TALLY_SHEET,
                id: context.newRecord.id,
                isDynamic: false
            });

            if (context.type === context.UserEventType.CREATE) {
                initializeAllocationTracking(tallyRec);
                logTallyCreation(tallyRec);
            }

            if (context.type === context.UserEventType.EDIT) {
                handleQuantityAdjustment(tallyRec, context.oldRecord);
                logTallyModification(tallyRec, context.oldRecord);
            }

            if (context.type === context.UserEventType.DELETE) {
                handleTallyDeletion(context.oldRecord);
            }

            updateRelatedRecords(tallyRec);

            logger.audit('afterSubmit', `Tally sheet post-processing completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('afterSubmit', `Error: ${e.message}`, { stack: e.stack });
        }
    }

    /**
     * Adds tally dashboard section to the form
     *
     * @param {Record} tallyRec - Tally sheet record
     * @param {Form} form - Current form
     */
    function addTallyDashboard(tallyRec, form) {
        try {
            const dashboardGroup = form.addFieldGroup({
                id: 'custpage_cls_tally_dashboard',
                label: 'Tally Dashboard'
            });

            const originalBF = parseFloat(tallyRec.getValue({
                fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF
            })) || 0;

            const remainingBF = parseFloat(tallyRec.getValue({
                fieldId: Constants.TALLY_FIELDS.REMAINING_BF
            })) || 0;

            const consumedBF = originalBF - remainingBF;
            const consumedPct = originalBF > 0 ? (consumedBF / originalBF * 100) : 0;

            const status = tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.STATUS });
            const statusColor = getStatusColor(status);

            let dashboardHtml = '<div style="display:flex; gap:20px; flex-wrap:wrap;">';

            // Status Card
            dashboardHtml += `<div style="flex:1; min-width:200px; padding:20px; background:${statusColor.bg}; border-radius:8px; text-align:center;">`;
            dashboardHtml += `<div style="font-size:14px; color:${statusColor.text}; text-transform:uppercase;">Status</div>`;
            dashboardHtml += `<div style="font-size:28px; font-weight:bold; color:${statusColor.text};">${status.toUpperCase()}</div>`;
            dashboardHtml += '</div>';

            // Original BF Card
            dashboardHtml += '<div style="flex:1; min-width:200px; padding:20px; background:#e3f2fd; border-radius:8px; text-align:center;">';
            dashboardHtml += '<div style="font-size:14px; color:#1976d2;">Original BF</div>';
            dashboardHtml += `<div style="font-size:28px; font-weight:bold; color:#1976d2;">${originalBF.toFixed(2)}</div>`;
            dashboardHtml += '</div>';

            // Remaining BF Card
            dashboardHtml += '<div style="flex:1; min-width:200px; padding:20px; background:#e8f5e9; border-radius:8px; text-align:center;">';
            dashboardHtml += '<div style="font-size:14px; color:#388e3c;">Remaining BF</div>';
            dashboardHtml += `<div style="font-size:28px; font-weight:bold; color:#388e3c;">${remainingBF.toFixed(2)}</div>`;
            dashboardHtml += '</div>';

            // Consumed BF Card
            dashboardHtml += '<div style="flex:1; min-width:200px; padding:20px; background:#fff3e0; border-radius:8px; text-align:center;">';
            dashboardHtml += '<div style="font-size:14px; color:#f57c00;">Consumed BF</div>';
            dashboardHtml += `<div style="font-size:28px; font-weight:bold; color:#f57c00;">${consumedBF.toFixed(2)}</div>`;
            dashboardHtml += `<div style="font-size:12px; color:#666;">(${consumedPct.toFixed(1)}%)</div>`;
            dashboardHtml += '</div>';

            dashboardHtml += '</div>';

            // Progress bar
            dashboardHtml += '<div style="margin-top:20px; padding:10px; background:#f5f5f5; border-radius:4px;">';
            dashboardHtml += '<div style="display:flex; justify-content:space-between; margin-bottom:5px;">';
            dashboardHtml += '<span>Consumption Progress</span>';
            dashboardHtml += `<span>${consumedPct.toFixed(1)}% consumed</span>`;
            dashboardHtml += '</div>';
            dashboardHtml += '<div style="background:#e0e0e0; border-radius:4px; height:20px; overflow:hidden;">';
            dashboardHtml += `<div style="background:linear-gradient(90deg, #f57c00 0%, #ff9800 100%); height:100%; width:${Math.min(100, consumedPct)}%; transition:width 0.3s;"></div>`;
            dashboardHtml += '</div>';
            dashboardHtml += '</div>';

            const dashboardField = form.addField({
                id: 'custpage_cls_dashboard_display',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cls_tally_dashboard'
            });

            dashboardField.defaultValue = dashboardHtml;
        } catch (e) {
            logger.error('addTallyDashboard', `Error: ${e.message}`);
        }
    }

    /**
     * Gets status color scheme
     *
     * @param {string} status - Tally status
     * @returns {Object} Color scheme
     */
    function getStatusColor(status) {
        const colors = {
            [TALLY_STATUS.DRAFT]: { bg: '#f5f5f5', text: '#666' },
            [TALLY_STATUS.ACTIVE]: { bg: '#e8f5e9', text: '#388e3c' },
            [TALLY_STATUS.PARTIAL]: { bg: '#fff3e0', text: '#f57c00' },
            [TALLY_STATUS.CONSUMED]: { bg: '#ffebee', text: '#d32f2f' },
            [TALLY_STATUS.CLOSED]: { bg: '#e0e0e0', text: '#424242' },
            [TALLY_STATUS.VOID]: { bg: '#fce4ec', text: '#c2185b' }
        };

        return colors[status] || colors[TALLY_STATUS.DRAFT];
    }

    /**
     * Adds allocation history section
     *
     * @param {Record} tallyRec - Tally sheet record
     * @param {Form} form - Current form
     */
    function addAllocationHistory(tallyRec, form) {
        try {
            const historyGroup = form.addFieldGroup({
                id: 'custpage_cls_allocation_history',
                label: 'Allocation History'
            });

            const allocations = getAllocationHistory(tallyRec.id);

            let historyHtml = '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
            historyHtml += '<tr style="background:#607799; color:#fff;">';
            historyHtml += '<th style="padding:8px; text-align:left;">Date</th>';
            historyHtml += '<th style="padding:8px; text-align:left;">Transaction</th>';
            historyHtml += '<th style="padding:8px; text-align:left;">Type</th>';
            historyHtml += '<th style="padding:8px; text-align:right;">Quantity</th>';
            historyHtml += '<th style="padding:8px; text-align:right;">BF</th>';
            historyHtml += '<th style="padding:8px; text-align:left;">Status</th>';
            historyHtml += '</tr>';

            if (allocations.length === 0) {
                historyHtml += '<tr><td colspan="6" style="padding:20px; text-align:center; color:#666;">No allocations recorded.</td></tr>';
            } else {
                for (let i = 0; i < allocations.length; i++) {
                    const alloc = allocations[i];
                    const bgColor = i % 2 === 0 ? '#fff' : '#f9f9f9';
                    const statusColor = alloc.status === 'consumed' ? '#28a745' : '#ffc107';

                    historyHtml += `<tr style="background:${bgColor};">`;
                    historyHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${alloc.date}</td>`;
                    historyHtml += `<td style="padding:8px; border-bottom:1px solid #eee;"><a href="${alloc.tranUrl}" target="_blank">${alloc.tranId}</a></td>`;
                    historyHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${alloc.tranType}</td>`;
                    historyHtml += `<td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">${alloc.quantity}</td>`;
                    historyHtml += `<td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">${alloc.boardFeet.toFixed(2)}</td>`;
                    historyHtml += `<td style="padding:8px; border-bottom:1px solid #eee; color:${statusColor};">${alloc.status}</td>`;
                    historyHtml += '</tr>';
                }
            }

            historyHtml += '</table>';

            const historyField = form.addField({
                id: 'custpage_cls_history_display',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cls_allocation_history'
            });

            historyField.defaultValue = historyHtml;
        } catch (e) {
            logger.error('addAllocationHistory', `Error: ${e.message}`);
        }
    }

    /**
     * Gets allocation history for a tally
     *
     * @param {string|number} tallyId - Tally sheet ID
     * @returns {Array} Allocation history
     */
    function getAllocationHistory(tallyId) {
        const allocations = [];

        try {
            const allocSearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                filters: [
                    [Constants.TALLY_FIELDS.TALLY_SHEET, 'is', tallyId]
                ],
                columns: [
                    search.createColumn({ name: 'created', sort: search.Sort.DESC }),
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.SOURCE_TRANSACTION }),
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.TRANSACTION_TYPE }),
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.QUANTITY }),
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.BOARD_FEET }),
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.STATUS })
                ]
            });

            allocSearch.run().each(function(result) {
                const tranId = result.getValue({ name: Constants.ALLOCATION_FIELDS.SOURCE_TRANSACTION });

                allocations.push({
                    date: result.getValue({ name: 'created' }),
                    tranId: result.getText({ name: Constants.ALLOCATION_FIELDS.SOURCE_TRANSACTION }) || tranId,
                    tranUrl: `/app/common/transaction/transaction.nl?id=${tranId}`,
                    tranType: result.getValue({ name: Constants.ALLOCATION_FIELDS.TRANSACTION_TYPE }),
                    quantity: parseFloat(result.getValue({ name: Constants.ALLOCATION_FIELDS.QUANTITY })) || 0,
                    boardFeet: parseFloat(result.getValue({ name: Constants.ALLOCATION_FIELDS.BOARD_FEET })) || 0,
                    status: result.getValue({ name: Constants.ALLOCATION_FIELDS.STATUS })
                });

                return allocations.length < 50;
            });
        } catch (e) {
            logger.error('getAllocationHistory', `Error: ${e.message}`);
        }

        return allocations;
    }

    /**
     * Adds consumption summary section
     *
     * @param {Record} tallyRec - Tally sheet record
     * @param {Form} form - Current form
     */
    function addConsumptionSummary(tallyRec, form) {
        try {
            const summaryGroup = form.addFieldGroup({
                id: 'custpage_cls_consumption_summary',
                label: 'Consumption by Transaction Type'
            });

            const summary = getConsumptionByType(tallyRec.id);

            let summaryHtml = '<div style="display:flex; gap:15px; flex-wrap:wrap; padding:10px;">';

            for (const type of summary) {
                summaryHtml += `<div style="flex:1; min-width:150px; padding:15px; background:#f8f9fa; border-radius:4px; text-align:center;">`;
                summaryHtml += `<div style="font-size:20px; font-weight:bold; color:#607799;">${type.count}</div>`;
                summaryHtml += `<div style="font-size:12px; color:#666;">${type.type}</div>`;
                summaryHtml += `<div style="font-size:14px; color:#333; margin-top:5px;">${type.totalBF.toFixed(2)} BF</div>`;
                summaryHtml += '</div>';
            }

            if (summary.length === 0) {
                summaryHtml += '<div style="width:100%; text-align:center; color:#666; padding:20px;">No consumption recorded.</div>';
            }

            summaryHtml += '</div>';

            const summaryField = form.addField({
                id: 'custpage_cls_consumption_display',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cls_consumption_summary'
            });

            summaryField.defaultValue = summaryHtml;
        } catch (e) {
            logger.error('addConsumptionSummary', `Error: ${e.message}`);
        }
    }

    /**
     * Gets consumption grouped by transaction type
     *
     * @param {string|number} tallyId - Tally sheet ID
     * @returns {Array} Consumption summary by type
     */
    function getConsumptionByType(tallyId) {
        const summary = [];

        try {
            const typeSearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                filters: [
                    [Constants.TALLY_FIELDS.TALLY_SHEET, 'is', tallyId],
                    'AND',
                    [Constants.ALLOCATION_FIELDS.STATUS, 'is', 'consumed']
                ],
                columns: [
                    search.createColumn({
                        name: Constants.ALLOCATION_FIELDS.TRANSACTION_TYPE,
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }),
                    search.createColumn({
                        name: Constants.ALLOCATION_FIELDS.BOARD_FEET,
                        summary: search.Summary.SUM
                    })
                ]
            });

            typeSearch.run().each(function(result) {
                summary.push({
                    type: result.getValue({
                        name: Constants.ALLOCATION_FIELDS.TRANSACTION_TYPE,
                        summary: search.Summary.GROUP
                    }) || 'Unknown',
                    count: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })) || 0,
                    totalBF: parseFloat(result.getValue({
                        name: Constants.ALLOCATION_FIELDS.BOARD_FEET,
                        summary: search.Summary.SUM
                    })) || 0
                });
                return true;
            });
        } catch (e) {
            logger.error('getConsumptionByType', `Error: ${e.message}`);
        }

        return summary;
    }

    /**
     * Adds action buttons to the form
     *
     * @param {Record} tallyRec - Tally sheet record
     * @param {Form} form - Current form
     */
    function addActionButtons(tallyRec, form) {
        const status = tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.STATUS });

        if (status === TALLY_STATUS.DRAFT) {
            form.addButton({
                id: 'custpage_activate',
                label: 'Activate Tally',
                functionName: 'activateTally'
            });
        }

        if (status === TALLY_STATUS.ACTIVE || status === TALLY_STATUS.PARTIAL) {
            form.addButton({
                id: 'custpage_close',
                label: 'Close Tally',
                functionName: 'closeTally'
            });

            form.addButton({
                id: 'custpage_split',
                label: 'Split Tally',
                functionName: 'splitTally'
            });
        }

        if (status !== TALLY_STATUS.VOID && status !== TALLY_STATUS.CONSUMED) {
            form.addButton({
                id: 'custpage_void',
                label: 'Void Tally',
                functionName: 'voidTally'
            });
        }

        form.addButton({
            id: 'custpage_print',
            label: 'Print Tally',
            functionName: 'printTally'
        });
    }

    /**
     * Adds edit warnings
     *
     * @param {Record} tallyRec - Tally sheet record
     * @param {Form} form - Current form
     */
    function addEditWarnings(tallyRec, form) {
        const status = tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.STATUS });
        const remainingBF = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.REMAINING_BF
        })) || 0;

        const originalBF = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF
        })) || 0;

        let warningHtml = '';

        if (status !== TALLY_STATUS.DRAFT && remainingBF < originalBF) {
            warningHtml += '<div style="padding:10px; background:#fff3cd; border:1px solid #ffc107; border-radius:4px; margin-bottom:10px;">';
            warningHtml += '<strong>&#9888; Warning:</strong> This tally has existing allocations. ';
            warningHtml += 'Reducing the original quantity may cause allocation conflicts.';
            warningHtml += '</div>';
        }

        if (status === TALLY_STATUS.CONSUMED) {
            warningHtml += '<div style="padding:10px; background:#f8d7da; border:1px solid #f5c6cb; border-radius:4px; margin-bottom:10px;">';
            warningHtml += '<strong>&#10006; Consumed:</strong> This tally is fully consumed. ';
            warningHtml += 'Edits are limited to non-quantity fields.';
            warningHtml += '</div>';
        }

        if (warningHtml) {
            const warningField = form.addField({
                id: 'custpage_cls_edit_warning',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            warningField.defaultValue = warningHtml;
        }
    }

    /**
     * Sets default values for new tally sheets
     *
     * @param {Record} tallyRec - Tally sheet record
     */
    function setDefaultValues(tallyRec) {
        tallyRec.setValue({
            fieldId: Constants.TALLY_FIELDS.STATUS,
            value: TALLY_STATUS.DRAFT
        });

        tallyRec.setValue({
            fieldId: Constants.TALLY_FIELDS.TALLY_DATE,
            value: new Date()
        });

        tallyRec.setValue({
            fieldId: Constants.TALLY_FIELDS.CREATED_BY,
            value: runtime.getCurrentUser().id
        });
    }

    /**
     * Validates required fields
     *
     * @param {Record} tallyRec - Tally sheet record
     * @throws {Error} If validation fails
     */
    function validateRequiredFields(tallyRec) {
        const item = tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.ITEM });
        if (!item) {
            throw new Error('Item is required for tally sheet.');
        }

        const location = tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.LOCATION });
        if (!location) {
            throw new Error('Location is required for tally sheet.');
        }
    }

    /**
     * Calculates total BF for the tally sheet
     *
     * @param {Record} tallyRec - Tally sheet record
     */
    function calculateTallyBF(tallyRec) {
        const thickness = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.THICKNESS
        })) || 0;

        const width = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.WIDTH
        })) || 0;

        const length = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.LENGTH
        })) || 0;

        const pieceCount = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.PIECE_COUNT
        })) || 0;

        // Calculate BF per piece
        const bfPerPiece = BFCalculator.calculateBF({
            thickness: thickness,
            width: width,
            length: length,
            quantity: 1
        });

        tallyRec.setValue({
            fieldId: Constants.TALLY_FIELDS.BF_PER_PIECE,
            value: bfPerPiece
        });

        // Calculate total original BF
        const totalBF = bfPerPiece * pieceCount;

        tallyRec.setValue({
            fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF,
            value: totalBF
        });

        // Set remaining BF (only on create or if not yet set)
        const existingRemaining = tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.REMAINING_BF
        });

        if (!existingRemaining || existingRemaining === 0) {
            tallyRec.setValue({
                fieldId: Constants.TALLY_FIELDS.REMAINING_BF,
                value: totalBF
            });

            tallyRec.setValue({
                fieldId: Constants.TALLY_FIELDS.REMAINING_PIECES,
                value: pieceCount
            });
        }

        logger.debug('calculateTallyBF',
            `Pieces: ${pieceCount}, BF/Piece: ${bfPerPiece.toFixed(4)}, Total: ${totalBF.toFixed(4)} BF`);
    }

    /**
     * Calculates piece count from bundle information
     *
     * @param {Record} tallyRec - Tally sheet record
     */
    function calculatePieceCount(tallyRec) {
        const bundleCount = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.BUNDLE_COUNT
        })) || 0;

        const piecesPerBundle = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.PIECES_PER_BUNDLE
        })) || 0;

        if (bundleCount > 0 && piecesPerBundle > 0) {
            const calculatedPieces = bundleCount * piecesPerBundle;
            const currentPieces = parseFloat(tallyRec.getValue({
                fieldId: Constants.TALLY_FIELDS.PIECE_COUNT
            })) || 0;

            // Only update if not manually set or if bundle info is newer
            if (currentPieces === 0) {
                tallyRec.setValue({
                    fieldId: Constants.TALLY_FIELDS.PIECE_COUNT,
                    value: calculatedPieces
                });
            }
        }
    }

    /**
     * Validates tally dimensions
     *
     * @param {Record} tallyRec - Tally sheet record
     */
    function validateDimensions(tallyRec) {
        const thickness = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.THICKNESS
        })) || 0;

        const width = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.WIDTH
        })) || 0;

        const length = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.LENGTH
        })) || 0;

        if (thickness <= 0 || width <= 0 || length <= 0) {
            logger.warn('validateDimensions', 'Missing or invalid dimensions - BF calculations may be inaccurate');
        }

        // Check for unreasonable dimensions
        if (thickness > 24 || width > 48 || length > 40) {
            logger.warn('validateDimensions',
                `Unusual dimensions detected: ${thickness}" x ${width}" x ${length}'`);
        }
    }

    /**
     * Updates tally status based on remaining quantity
     *
     * @param {Record} tallyRec - Tally sheet record
     * @param {string} eventType - Event type
     * @param {Record} oldRecord - Previous record
     */
    function updateStatus(tallyRec, eventType, oldRecord) {
        const currentStatus = tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.STATUS });

        // Don't change void or closed status
        if (currentStatus === TALLY_STATUS.VOID || currentStatus === TALLY_STATUS.CLOSED) {
            return;
        }

        const remainingBF = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.REMAINING_BF
        })) || 0;

        const originalBF = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF
        })) || 0;

        if (remainingBF <= 0) {
            tallyRec.setValue({
                fieldId: Constants.TALLY_FIELDS.STATUS,
                value: TALLY_STATUS.CONSUMED
            });
        } else if (remainingBF < originalBF && currentStatus !== TALLY_STATUS.DRAFT) {
            tallyRec.setValue({
                fieldId: Constants.TALLY_FIELDS.STATUS,
                value: TALLY_STATUS.PARTIAL
            });
        }
    }

    /**
     * Generates unique tally number
     *
     * @param {Record} tallyRec - Tally sheet record
     * @param {string} eventType - Event type
     */
    function generateTallyNumber(tallyRec, eventType) {
        if (eventType !== 'create') {
            return;
        }

        const existingNumber = tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.TALLY_NUMBER
        });

        if (existingNumber) {
            return;
        }

        try {
            const prefix = 'TS';
            const date = new Date();
            const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

            // Get next sequence number
            const seqSearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_SHEET,
                filters: [
                    [Constants.TALLY_FIELDS.TALLY_NUMBER, 'startswith', `${prefix}${dateStr}`]
                ],
                columns: [
                    search.createColumn({
                        name: Constants.TALLY_FIELDS.TALLY_NUMBER,
                        sort: search.Sort.DESC
                    })
                ]
            });

            let nextSeq = 1;
            seqSearch.run().each(function(result) {
                const lastNumber = result.getValue({ name: Constants.TALLY_FIELDS.TALLY_NUMBER });
                const seqPart = lastNumber.substring(prefix.length + dateStr.length);
                nextSeq = parseInt(seqPart) + 1 || 1;
                return false;
            });

            const tallyNumber = `${prefix}${dateStr}${String(nextSeq).padStart(4, '0')}`;

            tallyRec.setValue({
                fieldId: Constants.TALLY_FIELDS.TALLY_NUMBER,
                value: tallyNumber
            });

            logger.debug('generateTallyNumber', `Generated tally number: ${tallyNumber}`);
        } catch (e) {
            logger.error('generateTallyNumber', `Error: ${e.message}`);
        }
    }

    /**
     * Validates tally can be deleted
     *
     * @param {Record} oldRecord - Record being deleted
     * @throws {Error} If deletion not allowed
     */
    function validateDeletion(oldRecord) {
        const status = oldRecord.getValue({ fieldId: Constants.TALLY_FIELDS.STATUS });
        const remainingBF = parseFloat(oldRecord.getValue({
            fieldId: Constants.TALLY_FIELDS.REMAINING_BF
        })) || 0;

        const originalBF = parseFloat(oldRecord.getValue({
            fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF
        })) || 0;

        if (remainingBF < originalBF) {
            throw new Error('Cannot delete tally sheet with existing allocations. Void the tally instead.');
        }

        if (status === TALLY_STATUS.CONSUMED) {
            throw new Error('Cannot delete a consumed tally sheet.');
        }
    }

    /**
     * Initializes allocation tracking for new tally
     *
     * @param {Record} tallyRec - Tally sheet record
     */
    function initializeAllocationTracking(tallyRec) {
        // Create initial allocation record for tracking
        try {
            const allocationRec = record.create({
                type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                isDynamic: false
            });

            allocationRec.setValue({
                fieldId: Constants.TALLY_FIELDS.TALLY_SHEET,
                value: tallyRec.id
            });

            allocationRec.setValue({
                fieldId: Constants.ALLOCATION_FIELDS.TRANSACTION_TYPE,
                value: 'initial'
            });

            allocationRec.setValue({
                fieldId: Constants.ALLOCATION_FIELDS.QUANTITY,
                value: tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.PIECE_COUNT })
            });

            allocationRec.setValue({
                fieldId: Constants.ALLOCATION_FIELDS.BOARD_FEET,
                value: tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF })
            });

            allocationRec.setValue({
                fieldId: Constants.ALLOCATION_FIELDS.STATUS,
                value: 'available'
            });

            allocationRec.setValue({
                fieldId: Constants.ALLOCATION_FIELDS.ALLOCATION_DATE,
                value: new Date()
            });

            allocationRec.save();

            logger.debug('initializeAllocationTracking', `Created initial allocation for tally ${tallyRec.id}`);
        } catch (e) {
            logger.error('initializeAllocationTracking', `Error: ${e.message}`);
        }
    }

    /**
     * Logs tally creation
     *
     * @param {Record} tallyRec - Tally sheet record
     */
    function logTallyCreation(tallyRec) {
        logger.audit('logTallyCreation', `Tally created: ${tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.TALLY_NUMBER })}, ` +
            `Item: ${tallyRec.getText({ fieldId: Constants.TALLY_FIELDS.ITEM })}, ` +
            `BF: ${tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF })}`);
    }

    /**
     * Handles quantity adjustments
     *
     * @param {Record} tallyRec - Current record
     * @param {Record} oldRecord - Previous record
     */
    function handleQuantityAdjustment(tallyRec, oldRecord) {
        const oldOriginalBF = parseFloat(oldRecord.getValue({
            fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF
        })) || 0;

        const newOriginalBF = parseFloat(tallyRec.getValue({
            fieldId: Constants.TALLY_FIELDS.ORIGINAL_BF
        })) || 0;

        if (Math.abs(oldOriginalBF - newOriginalBF) > 0.01) {
            const adjustment = newOriginalBF - oldOriginalBF;

            // Adjust remaining BF proportionally
            const oldRemaining = parseFloat(oldRecord.getValue({
                fieldId: Constants.TALLY_FIELDS.REMAINING_BF
            })) || 0;

            const newRemaining = oldRemaining + adjustment;

            if (newRemaining < 0) {
                throw new Error('Adjustment would result in negative remaining BF. Cannot reduce below consumed amount.');
            }

            record.submitFields({
                type: Constants.RECORD_TYPES.TALLY_SHEET,
                id: tallyRec.id,
                values: {
                    [Constants.TALLY_FIELDS.REMAINING_BF]: newRemaining
                }
            });

            logger.audit('handleQuantityAdjustment',
                `Tally ${tallyRec.id} adjusted: ${oldOriginalBF} -> ${newOriginalBF} BF (Δ${adjustment.toFixed(2)})`);
        }
    }

    /**
     * Logs tally modification
     *
     * @param {Record} tallyRec - Current record
     * @param {Record} oldRecord - Previous record
     */
    function logTallyModification(tallyRec, oldRecord) {
        const changes = [];

        const fieldsToCheck = [
            { field: Constants.TALLY_FIELDS.PIECE_COUNT, name: 'Piece Count' },
            { field: Constants.TALLY_FIELDS.ORIGINAL_BF, name: 'Original BF' },
            { field: Constants.TALLY_FIELDS.STATUS, name: 'Status' },
            { field: Constants.TALLY_FIELDS.LOCATION, name: 'Location' }
        ];

        for (const f of fieldsToCheck) {
            const oldVal = oldRecord.getValue({ fieldId: f.field });
            const newVal = tallyRec.getValue({ fieldId: f.field });

            if (String(oldVal) !== String(newVal)) {
                changes.push(`${f.name}: ${oldVal} → ${newVal}`);
            }
        }

        if (changes.length > 0) {
            logger.audit('logTallyModification',
                `Tally ${tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.TALLY_NUMBER })} modified: ${changes.join(', ')}`);
        }
    }

    /**
     * Handles tally deletion
     *
     * @param {Record} oldRecord - Deleted record
     */
    function handleTallyDeletion(oldRecord) {
        try {
            // Delete associated allocations
            const allocSearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                filters: [
                    [Constants.TALLY_FIELDS.TALLY_SHEET, 'is', oldRecord.id]
                ],
                columns: ['internalid']
            });

            allocSearch.run().each(function(result) {
                record.delete({
                    type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                    id: result.id
                });
                return true;
            });

            logger.audit('handleTallyDeletion',
                `Tally ${oldRecord.getValue({ fieldId: Constants.TALLY_FIELDS.TALLY_NUMBER })} deleted`);
        } catch (e) {
            logger.error('handleTallyDeletion', `Error: ${e.message}`);
        }
    }

    /**
     * Updates related records after tally changes
     *
     * @param {Record} tallyRec - Tally sheet record
     */
    function updateRelatedRecords(tallyRec) {
        // This function can be extended to update related transactions
        // when tally information changes
    }

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
