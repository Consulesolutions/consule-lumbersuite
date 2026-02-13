/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * @file cls_repack_workorder_ue.js
 * @description Repack Work Order User Event Script for Consule LumberSuite™
 *              Handles bundle repacking and board resawing operations
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module repack/cls_repack_workorder_ue
 */

define([
    'N/record',
    'N/search',
    'N/ui/serverWidget',
    'N/runtime',
    'N/format',
    '../lib/cls_conversion_engine',
    '../lib/cls_settings_dao',
    '../lib/cls_constants'
], function(
    record,
    search,
    serverWidget,
    runtime,
    format,
    uomEngine,
    settingsDAO,
    constants
) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    const REPACK_TYPES = {
        BUNDLE_REPACK: 'bundle_repack',
        BOARD_RESAW: 'board_resaw',
        BUNDLE_SPLIT: 'bundle_split',
        BOARD_TRIM: 'board_trim',
        GRADE_SORT: 'grade_sort'
    };

    const REPACK_STATUS = {
        DRAFT: 'draft',
        PENDING: 'pending',
        IN_PROGRESS: 'in_progress',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    };

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
        REPACK_NUMBER: 'custrecord_cls_repack_number',
        REPACK_DATE: 'custrecord_cls_repack_date',
        OPERATOR: 'custrecord_cls_repack_operator',
        WORK_CENTER: 'custrecord_cls_repack_work_center',
        INSTRUCTIONS: 'custrecord_cls_repack_instructions',
        NOTES: 'custrecord_cls_repack_notes',
        CREATED_TALLY: 'custrecord_cls_repack_created_tally',
        YIELD_REGISTER: 'custrecord_cls_repack_yield_register',
        START_TIME: 'custrecord_cls_repack_start_time',
        END_TIME: 'custrecord_cls_repack_end_time',
        DURATION_MINS: 'custrecord_cls_repack_duration'
    };

    // ═══════════════════════════════════════════════════════════════════════
    // BEFORE LOAD
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * beforeLoad Entry Point
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {string} context.type - Event type
     * @param {Form} context.form - Form object
     */
    function beforeLoad(context) {
        const { newRecord, type, form } = context;

        try {
            // Check if repack feature is enabled
            if (!settingsDAO.isFeatureEnabled('repack')) {
                return;
            }

            if (type === context.UserEventType.CREATE) {
                setDefaultValues(newRecord);
            }

            if (type === context.UserEventType.VIEW) {
                addDashboardFields(form, newRecord);
                addActionButtons(form, newRecord);
            }

            if (type === context.UserEventType.EDIT) {
                restrictEditableFields(form, newRecord);
            }

            // Add repack type descriptions
            addTypeDescriptions(form);

        } catch (error) {
            log.error({
                title: 'Error in beforeLoad',
                details: error.message
            });
        }
    }

    /**
     * Sets default values for new repack work orders
     *
     * @param {Record} newRecord - Current record
     */
    function setDefaultValues(newRecord) {
        // Set default status
        newRecord.setValue({
            fieldId: FIELD_IDS.STATUS,
            value: REPACK_STATUS.DRAFT
        });

        // Set default date
        newRecord.setValue({
            fieldId: FIELD_IDS.REPACK_DATE,
            value: new Date()
        });

        // Set current user as operator
        const currentUser = runtime.getCurrentUser();
        newRecord.setValue({
            fieldId: FIELD_IDS.OPERATOR,
            value: currentUser.id
        });
    }

    /**
     * Adds dashboard fields to view mode
     *
     * @param {Form} form - Form object
     * @param {Record} newRecord - Current record
     */
    function addDashboardFields(form, newRecord) {
        const status = newRecord.getValue({ fieldId: FIELD_IDS.STATUS });

        // Add status indicator field group
        const dashboardGroup = form.addFieldGroup({
            id: 'custgroup_repack_dashboard',
            label: 'Repack Dashboard'
        });

        // Yield summary field
        const yieldSummary = form.addField({
            id: 'custpage_yield_summary',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Yield Summary',
            container: 'custgroup_repack_dashboard'
        });

        const yieldHtml = buildYieldSummaryHtml(newRecord);
        yieldSummary.defaultValue = yieldHtml;

        // Processing timeline
        if (status === REPACK_STATUS.COMPLETED || status === REPACK_STATUS.IN_PROGRESS) {
            const timelineField = form.addField({
                id: 'custpage_processing_timeline',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Processing Timeline',
                container: 'custgroup_repack_dashboard'
            });

            const timelineHtml = buildTimelineHtml(newRecord);
            timelineField.defaultValue = timelineHtml;
        }

        // Source tally details
        addSourceTallyDetails(form, newRecord);

        // Output details
        if (status === REPACK_STATUS.COMPLETED) {
            addOutputDetails(form, newRecord);
        }
    }

    /**
     * Builds yield summary HTML
     *
     * @param {Record} newRecord - Current record
     * @returns {string} HTML content
     */
    function buildYieldSummaryHtml(newRecord) {
        const inputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;
        const outputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;
        const wasteBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.WASTE_BF })) || 0;
        const yieldPct = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.YIELD_PERCENT })) || 0;
        const status = newRecord.getValue({ fieldId: FIELD_IDS.STATUS });

        // Determine yield indicator color
        let yieldColor = '#6c757d'; // gray for pending
        let yieldIcon = '⏳';

        if (status === REPACK_STATUS.COMPLETED) {
            if (yieldPct >= 90) {
                yieldColor = '#28a745'; // green
                yieldIcon = '✓';
            } else if (yieldPct >= 75) {
                yieldColor = '#ffc107'; // yellow
                yieldIcon = '⚠';
            } else {
                yieldColor = '#dc3545'; // red
                yieldIcon = '✗';
            }
        }

        return `
            <div style="display: flex; gap: 30px; padding: 15px; background: #f8f9fa; border-radius: 8px; margin-bottom: 15px;">
                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 12px; color: #666; text-transform: uppercase;">Input BF</div>
                    <div style="font-size: 28px; font-weight: bold; color: #333;">${inputBF.toFixed(2)}</div>
                </div>
                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 12px; color: #666; text-transform: uppercase;">Output BF</div>
                    <div style="font-size: 28px; font-weight: bold; color: #28a745;">${outputBF.toFixed(2)}</div>
                </div>
                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 12px; color: #666; text-transform: uppercase;">Waste BF</div>
                    <div style="font-size: 28px; font-weight: bold; color: #dc3545;">${wasteBF.toFixed(2)}</div>
                </div>
                <div style="text-align: center; flex: 1; border-left: 2px solid #ddd; padding-left: 30px;">
                    <div style="font-size: 12px; color: #666; text-transform: uppercase;">Yield</div>
                    <div style="font-size: 28px; font-weight: bold; color: ${yieldColor};">
                        ${yieldIcon} ${yieldPct.toFixed(1)}%
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Builds processing timeline HTML
     *
     * @param {Record} newRecord - Current record
     * @returns {string} HTML content
     */
    function buildTimelineHtml(newRecord) {
        const startTime = newRecord.getValue({ fieldId: FIELD_IDS.START_TIME });
        const endTime = newRecord.getValue({ fieldId: FIELD_IDS.END_TIME });
        const duration = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.DURATION_MINS })) || 0;

        const formatTime = (dateVal) => {
            if (!dateVal) return 'N/A';
            return format.format({
                value: dateVal,
                type: format.Type.DATETIME
            });
        };

        const hours = Math.floor(duration / 60);
        const mins = Math.round(duration % 60);
        const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        return `
            <div style="padding: 10px; background: #e9ecef; border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div>
                        <span style="color: #666;">Started:</span>
                        <strong>${formatTime(startTime)}</strong>
                    </div>
                    <div style="color: #999;">→</div>
                    <div>
                        <span style="color: #666;">Completed:</span>
                        <strong>${formatTime(endTime)}</strong>
                    </div>
                    <div style="margin-left: auto; background: #fff; padding: 5px 15px; border-radius: 20px;">
                        <span style="color: #666;">Duration:</span>
                        <strong>${durationStr}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Adds source tally details section
     *
     * @param {Form} form - Form object
     * @param {Record} newRecord - Current record
     */
    function addSourceTallyDetails(form, newRecord) {
        const sourceTallyId = newRecord.getValue({ fieldId: FIELD_IDS.SOURCE_TALLY });
        if (!sourceTallyId) return;

        try {
            const tallyData = search.lookupFields({
                type: 'customrecord_cls_tally_sheet',
                id: sourceTallyId,
                columns: [
                    'name',
                    'custrecord_cls_tally_item',
                    'custrecord_cls_tally_bf_total',
                    'custrecord_cls_tally_bf_available',
                    'custrecord_cls_tally_pieces',
                    'custrecord_cls_tally_status'
                ]
            });

            const tallyGroup = form.addFieldGroup({
                id: 'custgroup_source_tally',
                label: 'Source Tally Details'
            });

            const tallyDetailsField = form.addField({
                id: 'custpage_source_tally_details',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Source Details',
                container: 'custgroup_source_tally'
            });

            const totalBF = parseFloat(tallyData.custrecord_cls_tally_bf_total) || 0;
            const availableBF = parseFloat(tallyData.custrecord_cls_tally_bf_available) || 0;
            const consumedPct = totalBF > 0 ? ((totalBF - availableBF) / totalBF * 100) : 0;

            const html = `
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; padding: 10px;">
                    <div>
                        <div style="color: #666; font-size: 11px;">Tally Number</div>
                        <div style="font-weight: bold;">${tallyData.name}</div>
                    </div>
                    <div>
                        <div style="color: #666; font-size: 11px;">Total BF</div>
                        <div style="font-weight: bold;">${totalBF.toFixed(2)}</div>
                    </div>
                    <div>
                        <div style="color: #666; font-size: 11px;">Available BF</div>
                        <div style="font-weight: bold; color: ${availableBF > 0 ? '#28a745' : '#dc3545'};">${availableBF.toFixed(2)}</div>
                    </div>
                    <div>
                        <div style="color: #666; font-size: 11px;">Consumption</div>
                        <div style="font-weight: bold;">${consumedPct.toFixed(1)}%</div>
                    </div>
                </div>
            `;

            tallyDetailsField.defaultValue = html;
        } catch (e) {
            log.debug({ title: 'Source tally lookup failed', details: e.message });
        }
    }

    /**
     * Adds output details for completed repack
     *
     * @param {Form} form - Form object
     * @param {Record} newRecord - Current record
     */
    function addOutputDetails(form, newRecord) {
        const createdTallyId = newRecord.getValue({ fieldId: FIELD_IDS.CREATED_TALLY });

        const outputGroup = form.addFieldGroup({
            id: 'custgroup_output_details',
            label: 'Output Details'
        });

        const outputField = form.addField({
            id: 'custpage_output_details',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Output Summary',
            container: 'custgroup_output_details'
        });

        const outputPieces = parseInt(newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_PIECES }), 10) || 0;
        const outputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;
        const wastePieces = parseInt(newRecord.getValue({ fieldId: FIELD_IDS.WASTE_PIECES }), 10) || 0;
        const wasteBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.WASTE_BF })) || 0;

        let tallyLink = 'No tally created';
        if (createdTallyId) {
            tallyLink = `<a href="/app/common/custom/custrecordentry.nl?rectype=customrecord_cls_tally_sheet&id=${createdTallyId}">View Output Tally</a>`;
        }

        const html = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 15px; background: #d4edda; border-radius: 8px;">
                <div>
                    <div style="color: #155724; font-size: 11px;">Output Pieces</div>
                    <div style="font-size: 20px; font-weight: bold; color: #155724;">${outputPieces}</div>
                    <div style="font-size: 12px; color: #155724;">${outputBF.toFixed(2)} BF</div>
                </div>
                <div>
                    <div style="color: #856404; font-size: 11px;">Waste</div>
                    <div style="font-size: 20px; font-weight: bold; color: #856404;">${wastePieces}</div>
                    <div style="font-size: 12px; color: #856404;">${wasteBF.toFixed(2)} BF</div>
                </div>
                <div>
                    <div style="color: #155724; font-size: 11px;">Output Tally</div>
                    <div style="font-size: 14px; padding-top: 5px;">${tallyLink}</div>
                </div>
            </div>
        `;

        outputField.defaultValue = html;
    }

    /**
     * Adds action buttons based on status
     *
     * @param {Form} form - Form object
     * @param {Record} newRecord - Current record
     */
    function addActionButtons(form, newRecord) {
        const status = newRecord.getValue({ fieldId: FIELD_IDS.STATUS });
        const repackId = newRecord.id;

        if (status === REPACK_STATUS.DRAFT) {
            form.addButton({
                id: 'custpage_btn_start',
                label: 'Start Processing',
                functionName: `startProcessing(${repackId})`
            });

            form.addButton({
                id: 'custpage_btn_cancel',
                label: 'Cancel Order',
                functionName: `cancelOrder(${repackId})`
            });
        }

        if (status === REPACK_STATUS.PENDING) {
            form.addButton({
                id: 'custpage_btn_begin',
                label: 'Begin Repack',
                functionName: `beginRepack(${repackId})`
            });
        }

        if (status === REPACK_STATUS.IN_PROGRESS) {
            form.addButton({
                id: 'custpage_btn_complete',
                label: 'Complete Repack',
                functionName: `completeRepack(${repackId})`
            });

            form.addButton({
                id: 'custpage_btn_pause',
                label: 'Pause',
                functionName: `pauseRepack(${repackId})`
            });
        }

        if (status === REPACK_STATUS.COMPLETED) {
            form.addButton({
                id: 'custpage_btn_print',
                label: 'Print Report',
                functionName: `printReport(${repackId})`
            });

            form.addButton({
                id: 'custpage_btn_view_tally',
                label: 'View Output Tally',
                functionName: `viewOutputTally(${repackId})`
            });
        }
    }

    /**
     * Restricts editable fields based on status
     *
     * @param {Form} form - Form object
     * @param {Record} newRecord - Current record
     */
    function restrictEditableFields(form, newRecord) {
        const status = newRecord.getValue({ fieldId: FIELD_IDS.STATUS });

        if (status === REPACK_STATUS.COMPLETED || status === REPACK_STATUS.CANCELLED) {
            // Make all fields read-only for completed/cancelled
            const readOnlyFields = [
                FIELD_IDS.REPACK_TYPE, FIELD_IDS.SOURCE_TALLY, FIELD_IDS.SOURCE_ITEM,
                FIELD_IDS.OUTPUT_ITEM, FIELD_IDS.SOURCE_LOCATION, FIELD_IDS.INPUT_BF,
                FIELD_IDS.INPUT_PIECES, FIELD_IDS.INSTRUCTIONS
            ];

            readOnlyFields.forEach(fieldId => {
                try {
                    const field = form.getField({ id: fieldId });
                    if (field) {
                        field.updateDisplayType({
                            displayType: serverWidget.FieldDisplayType.INLINE
                        });
                    }
                } catch (e) {
                    // Field may not exist
                }
            });
        }

        if (status === REPACK_STATUS.IN_PROGRESS) {
            // Restrict source changes during processing
            const restrictedFields = [
                FIELD_IDS.SOURCE_TALLY, FIELD_IDS.SOURCE_ITEM, FIELD_IDS.REPACK_TYPE
            ];

            restrictedFields.forEach(fieldId => {
                try {
                    const field = form.getField({ id: fieldId });
                    if (field) {
                        field.updateDisplayType({
                            displayType: serverWidget.FieldDisplayType.DISABLED
                        });
                    }
                } catch (e) {
                    // Field may not exist
                }
            });
        }
    }

    /**
     * Adds repack type descriptions as help text
     *
     * @param {Form} form - Form object
     */
    function addTypeDescriptions(form) {
        try {
            const typeField = form.getField({ id: FIELD_IDS.REPACK_TYPE });
            if (typeField) {
                typeField.setHelpText({
                    help: 'Bundle Repack: Repackage boards into new bundles. ' +
                          'Board Resaw: Saw boards into different dimensions. ' +
                          'Bundle Split: Split bundles into smaller bundles. ' +
                          'Board Trim: Trim boards to specific lengths. ' +
                          'Grade Sort: Sort and repackage by grade.'
                });
            }
        } catch (e) {
            // Field may not exist
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BEFORE SUBMIT
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * beforeSubmit Entry Point
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record
     * @param {string} context.type - Event type
     */
    function beforeSubmit(context) {
        const { newRecord, oldRecord, type } = context;

        try {
            // Check if repack feature is enabled
            if (!settingsDAO.isFeatureEnabled('repack')) {
                throw new Error('Repack feature is not enabled. Please contact your administrator.');
            }

            if (type === context.UserEventType.CREATE) {
                generateRepackNumber(newRecord);
                validateSourceTally(newRecord);
                calculateInputMetrics(newRecord);
            }

            if (type === context.UserEventType.EDIT) {
                validateStatusTransition(newRecord, oldRecord);

                const newStatus = newRecord.getValue({ fieldId: FIELD_IDS.STATUS });

                if (newStatus === REPACK_STATUS.IN_PROGRESS) {
                    recordStartTime(newRecord, oldRecord);
                }

                if (newStatus === REPACK_STATUS.COMPLETED) {
                    validateCompletionData(newRecord);
                    calculateYieldMetrics(newRecord);
                    recordEndTime(newRecord);
                }
            }

            if (type === context.UserEventType.DELETE) {
                validateDeletion(newRecord);
            }

        } catch (error) {
            log.error({
                title: 'Error in beforeSubmit',
                details: error.message
            });
            throw error;
        }
    }

    /**
     * Generates unique repack number
     *
     * @param {Record} newRecord - Current record
     */
    function generateRepackNumber(newRecord) {
        const today = new Date();
        const dateStr = format.format({
            value: today,
            type: format.Type.DATE
        }).replace(/\//g, '');

        // Get next sequence number for today
        const searchResults = search.create({
            type: 'customrecord_cls_repack_workorder',
            filters: [
                ['custrecord_cls_repack_date', 'on', 'today']
            ],
            columns: ['internalid']
        }).run().getRange({ start: 0, end: 1000 });

        const sequence = (searchResults.length + 1).toString().padStart(4, '0');
        const repackNumber = `RP${dateStr}${sequence}`;

        newRecord.setValue({
            fieldId: FIELD_IDS.REPACK_NUMBER,
            value: repackNumber
        });

        log.debug({ title: 'Generated repack number', details: repackNumber });
    }

    /**
     * Validates source tally availability
     *
     * @param {Record} newRecord - Current record
     */
    function validateSourceTally(newRecord) {
        const sourceTallyId = newRecord.getValue({ fieldId: FIELD_IDS.SOURCE_TALLY });

        if (!sourceTallyId) {
            throw new Error('Source tally is required for repack operations.');
        }

        // Check tally status and availability
        const tallyData = search.lookupFields({
            type: 'customrecord_cls_tally_sheet',
            id: sourceTallyId,
            columns: [
                'custrecord_cls_tally_status',
                'custrecord_cls_tally_bf_available',
                'custrecord_cls_tally_item'
            ]
        });

        const status = tallyData.custrecord_cls_tally_status;
        if (status === 'consumed' || status === 'void' || status === 'closed') {
            throw new Error(`Source tally is not available (status: ${status}).`);
        }

        const availableBF = parseFloat(tallyData.custrecord_cls_tally_bf_available) || 0;
        if (availableBF <= 0) {
            throw new Error('Source tally has no available BF for repack.');
        }

        // Auto-populate source item if not set
        const sourceItem = newRecord.getValue({ fieldId: FIELD_IDS.SOURCE_ITEM });
        if (!sourceItem && tallyData.custrecord_cls_tally_item) {
            const itemRef = tallyData.custrecord_cls_tally_item;
            if (itemRef && itemRef.length > 0) {
                newRecord.setValue({
                    fieldId: FIELD_IDS.SOURCE_ITEM,
                    value: itemRef[0].value
                });
            }
        }
    }

    /**
     * Calculates input metrics from source tally
     *
     * @param {Record} newRecord - Current record
     */
    function calculateInputMetrics(newRecord) {
        const sourceTallyId = newRecord.getValue({ fieldId: FIELD_IDS.SOURCE_TALLY });
        const inputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;

        if (sourceTallyId && inputBF <= 0) {
            // Default to all available BF from tally
            const tallyData = search.lookupFields({
                type: 'customrecord_cls_tally_sheet',
                id: sourceTallyId,
                columns: [
                    'custrecord_cls_tally_bf_available',
                    'custrecord_cls_tally_pieces'
                ]
            });

            const availableBF = parseFloat(tallyData.custrecord_cls_tally_bf_available) || 0;
            const pieces = parseInt(tallyData.custrecord_cls_tally_pieces, 10) || 0;

            newRecord.setValue({
                fieldId: FIELD_IDS.INPUT_BF,
                value: availableBF
            });

            newRecord.setValue({
                fieldId: FIELD_IDS.INPUT_PIECES,
                value: pieces
            });
        }
    }

    /**
     * Validates status transition rules
     *
     * @param {Record} newRecord - Current record
     * @param {Record} oldRecord - Previous record
     */
    function validateStatusTransition(newRecord, oldRecord) {
        const oldStatus = oldRecord.getValue({ fieldId: FIELD_IDS.STATUS });
        const newStatus = newRecord.getValue({ fieldId: FIELD_IDS.STATUS });

        if (oldStatus === newStatus) return;

        const validTransitions = {
            [REPACK_STATUS.DRAFT]: [REPACK_STATUS.PENDING, REPACK_STATUS.CANCELLED],
            [REPACK_STATUS.PENDING]: [REPACK_STATUS.IN_PROGRESS, REPACK_STATUS.CANCELLED],
            [REPACK_STATUS.IN_PROGRESS]: [REPACK_STATUS.COMPLETED, REPACK_STATUS.PENDING],
            [REPACK_STATUS.COMPLETED]: [],
            [REPACK_STATUS.CANCELLED]: []
        };

        const allowed = validTransitions[oldStatus] || [];
        if (!allowed.includes(newStatus)) {
            throw new Error(`Invalid status transition from "${oldStatus}" to "${newStatus}".`);
        }
    }

    /**
     * Records start time when processing begins
     *
     * @param {Record} newRecord - Current record
     * @param {Record} oldRecord - Previous record
     */
    function recordStartTime(newRecord, oldRecord) {
        const oldStatus = oldRecord.getValue({ fieldId: FIELD_IDS.STATUS });

        if (oldStatus !== REPACK_STATUS.IN_PROGRESS) {
            newRecord.setValue({
                fieldId: FIELD_IDS.START_TIME,
                value: new Date()
            });
        }
    }

    /**
     * Validates completion data is complete
     *
     * @param {Record} newRecord - Current record
     */
    function validateCompletionData(newRecord) {
        const outputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;
        const outputPieces = parseInt(newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_PIECES }), 10) || 0;

        if (outputBF <= 0) {
            throw new Error('Output BF is required to complete the repack order.');
        }

        if (outputPieces <= 0) {
            throw new Error('Output pieces count is required to complete the repack order.');
        }

        const inputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;
        if (outputBF > inputBF) {
            throw new Error('Output BF cannot exceed input BF.');
        }
    }

    /**
     * Calculates yield metrics on completion
     *
     * @param {Record} newRecord - Current record
     */
    function calculateYieldMetrics(newRecord) {
        const inputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;
        const outputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;
        const inputPieces = parseInt(newRecord.getValue({ fieldId: FIELD_IDS.INPUT_PIECES }), 10) || 0;
        const outputPieces = parseInt(newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_PIECES }), 10) || 0;

        // Calculate waste
        const wasteBF = inputBF - outputBF;
        newRecord.setValue({
            fieldId: FIELD_IDS.WASTE_BF,
            value: wasteBF
        });

        const wastePieces = inputPieces - outputPieces;
        newRecord.setValue({
            fieldId: FIELD_IDS.WASTE_PIECES,
            value: Math.max(0, wastePieces)
        });

        // Calculate yield percentage
        const yieldPct = inputBF > 0 ? (outputBF / inputBF * 100) : 0;
        newRecord.setValue({
            fieldId: FIELD_IDS.YIELD_PERCENT,
            value: yieldPct
        });

        log.debug({
            title: 'Yield metrics calculated',
            details: `Input: ${inputBF} BF, Output: ${outputBF} BF, Waste: ${wasteBF} BF, Yield: ${yieldPct.toFixed(2)}%`
        });
    }

    /**
     * Records end time on completion
     *
     * @param {Record} newRecord - Current record
     */
    function recordEndTime(newRecord) {
        const endTime = new Date();
        newRecord.setValue({
            fieldId: FIELD_IDS.END_TIME,
            value: endTime
        });

        // Calculate duration
        const startTime = newRecord.getValue({ fieldId: FIELD_IDS.START_TIME });
        if (startTime) {
            const durationMs = endTime.getTime() - new Date(startTime).getTime();
            const durationMins = durationMs / (1000 * 60);
            newRecord.setValue({
                fieldId: FIELD_IDS.DURATION_MINS,
                value: durationMins
            });
        }
    }

    /**
     * Validates deletion is allowed
     *
     * @param {Record} newRecord - Current record
     */
    function validateDeletion(newRecord) {
        const status = newRecord.getValue({ fieldId: FIELD_IDS.STATUS });

        if (status === REPACK_STATUS.COMPLETED) {
            throw new Error('Completed repack orders cannot be deleted. Please void instead.');
        }

        if (status === REPACK_STATUS.IN_PROGRESS) {
            throw new Error('Cannot delete repack order while processing is in progress.');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AFTER SUBMIT
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * afterSubmit Entry Point
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record
     * @param {string} context.type - Event type
     */
    function afterSubmit(context) {
        const { newRecord, oldRecord, type } = context;

        try {
            if (type === context.UserEventType.CREATE) {
                log.audit({
                    title: 'Repack Work Order Created',
                    details: `Repack Order ${newRecord.getValue({ fieldId: FIELD_IDS.REPACK_NUMBER })} created`
                });
            }

            if (type === context.UserEventType.EDIT) {
                const oldStatus = oldRecord ? oldRecord.getValue({ fieldId: FIELD_IDS.STATUS }) : null;
                const newStatus = newRecord.getValue({ fieldId: FIELD_IDS.STATUS });

                if (oldStatus !== newStatus) {
                    handleStatusChange(newRecord, oldStatus, newStatus);
                }
            }

        } catch (error) {
            log.error({
                title: 'Error in afterSubmit',
                details: error.message
            });
        }
    }

    /**
     * Handles status change side effects
     *
     * @param {Record} newRecord - Current record
     * @param {string} oldStatus - Previous status
     * @param {string} newStatus - New status
     */
    function handleStatusChange(newRecord, oldStatus, newStatus) {
        const repackId = newRecord.id;
        const repackNumber = newRecord.getValue({ fieldId: FIELD_IDS.REPACK_NUMBER });

        log.audit({
            title: 'Repack Status Changed',
            details: `Repack ${repackNumber}: ${oldStatus} → ${newStatus}`
        });

        if (newStatus === REPACK_STATUS.COMPLETED) {
            // Consume source tally
            consumeSourceTally(newRecord);

            // Create output tally
            createOutputTally(newRecord);

            // Create yield register entry
            if (settingsDAO.isFeatureEnabled('yield')) {
                createYieldRegisterEntry(newRecord);
            }
        }

        if (newStatus === REPACK_STATUS.CANCELLED) {
            // Release any holds on source tally
            releaseSourceTallyHold(newRecord);
        }
    }

    /**
     * Consumes BF from source tally
     *
     * @param {Record} newRecord - Current record
     */
    function consumeSourceTally(newRecord) {
        const sourceTallyId = newRecord.getValue({ fieldId: FIELD_IDS.SOURCE_TALLY });
        const inputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;

        if (!sourceTallyId || inputBF <= 0) return;

        try {
            const tallyRec = record.load({
                type: 'customrecord_cls_tally_sheet',
                id: sourceTallyId,
                isDynamic: true
            });

            const currentAvailable = parseFloat(tallyRec.getValue({
                fieldId: 'custrecord_cls_tally_bf_available'
            })) || 0;

            const newAvailable = Math.max(0, currentAvailable - inputBF);

            tallyRec.setValue({
                fieldId: 'custrecord_cls_tally_bf_available',
                value: newAvailable
            });

            // Update status if fully consumed
            if (newAvailable <= 0) {
                tallyRec.setValue({
                    fieldId: 'custrecord_cls_tally_status',
                    value: 'consumed'
                });
            } else {
                tallyRec.setValue({
                    fieldId: 'custrecord_cls_tally_status',
                    value: 'partial'
                });
            }

            tallyRec.save();

            log.debug({
                title: 'Source tally consumed',
                details: `Tally ${sourceTallyId}: Consumed ${inputBF} BF, Remaining: ${newAvailable} BF`
            });

        } catch (e) {
            log.error({
                title: 'Failed to consume source tally',
                details: e.message
            });
        }
    }

    /**
     * Creates output tally from repack results
     *
     * @param {Record} newRecord - Current record
     */
    function createOutputTally(newRecord) {
        const outputItem = newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_ITEM });
        const location = newRecord.getValue({ fieldId: FIELD_IDS.SOURCE_LOCATION });
        const outputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;
        const outputPieces = parseInt(newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_PIECES }), 10) || 0;
        const repackNumber = newRecord.getValue({ fieldId: FIELD_IDS.REPACK_NUMBER });

        if (!outputItem || outputBF <= 0) return;

        try {
            const tallyRec = record.create({
                type: 'customrecord_cls_tally_sheet',
                isDynamic: true
            });

            tallyRec.setValue({
                fieldId: 'custrecord_cls_tally_item',
                value: outputItem
            });

            tallyRec.setValue({
                fieldId: 'custrecord_cls_tally_location',
                value: location
            });

            tallyRec.setValue({
                fieldId: 'custrecord_cls_tally_bf_total',
                value: outputBF
            });

            tallyRec.setValue({
                fieldId: 'custrecord_cls_tally_bf_available',
                value: outputBF
            });

            tallyRec.setValue({
                fieldId: 'custrecord_cls_tally_pieces',
                value: outputPieces
            });

            tallyRec.setValue({
                fieldId: 'custrecord_cls_tally_status',
                value: 'active'
            });

            tallyRec.setValue({
                fieldId: 'custrecord_cls_tally_source',
                value: 'repack'
            });

            tallyRec.setValue({
                fieldId: 'custrecord_cls_tally_notes',
                value: `Created from repack: ${repackNumber}`
            });

            const tallyId = tallyRec.save();

            // Update repack record with created tally reference
            record.submitFields({
                type: 'customrecord_cls_repack_workorder',
                id: newRecord.id,
                values: {
                    [FIELD_IDS.CREATED_TALLY]: tallyId
                }
            });

            log.audit({
                title: 'Output tally created',
                details: `Tally ID ${tallyId} created from repack ${repackNumber}`
            });

        } catch (e) {
            log.error({
                title: 'Failed to create output tally',
                details: e.message
            });
        }
    }

    /**
     * Creates yield register entry for tracking
     *
     * @param {Record} newRecord - Current record
     */
    function createYieldRegisterEntry(newRecord) {
        const repackNumber = newRecord.getValue({ fieldId: FIELD_IDS.REPACK_NUMBER });
        const inputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.INPUT_BF })) || 0;
        const outputBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.OUTPUT_BF })) || 0;
        const wasteBF = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.WASTE_BF })) || 0;
        const yieldPct = parseFloat(newRecord.getValue({ fieldId: FIELD_IDS.YIELD_PERCENT })) || 0;
        const repackType = newRecord.getValue({ fieldId: FIELD_IDS.REPACK_TYPE });
        const operator = newRecord.getValue({ fieldId: FIELD_IDS.OPERATOR });
        const workCenter = newRecord.getValue({ fieldId: FIELD_IDS.WORK_CENTER });

        try {
            const yieldRec = record.create({
                type: 'customrecord_cls_yield_register',
                isDynamic: true
            });

            yieldRec.setValue({
                fieldId: 'custrecord_cls_yield_source_type',
                value: 'repack'
            });

            yieldRec.setValue({
                fieldId: 'custrecord_cls_yield_source_ref',
                value: repackNumber
            });

            yieldRec.setValue({
                fieldId: 'custrecord_cls_yield_input_bf',
                value: inputBF
            });

            yieldRec.setValue({
                fieldId: 'custrecord_cls_yield_output_bf',
                value: outputBF
            });

            yieldRec.setValue({
                fieldId: 'custrecord_cls_yield_waste_bf',
                value: wasteBF
            });

            yieldRec.setValue({
                fieldId: 'custrecord_cls_yield_percentage',
                value: yieldPct
            });

            yieldRec.setValue({
                fieldId: 'custrecord_cls_yield_operation',
                value: repackType
            });

            yieldRec.setValue({
                fieldId: 'custrecord_cls_yield_operator',
                value: operator
            });

            if (workCenter) {
                yieldRec.setValue({
                    fieldId: 'custrecord_cls_yield_work_center',
                    value: workCenter
                });
            }

            yieldRec.setValue({
                fieldId: 'custrecord_cls_yield_date',
                value: new Date()
            });

            const yieldId = yieldRec.save();

            // Link yield register to repack
            record.submitFields({
                type: 'customrecord_cls_repack_workorder',
                id: newRecord.id,
                values: {
                    [FIELD_IDS.YIELD_REGISTER]: yieldId
                }
            });

            log.audit({
                title: 'Yield register entry created',
                details: `Yield ID ${yieldId} created for repack ${repackNumber}`
            });

        } catch (e) {
            log.error({
                title: 'Failed to create yield register entry',
                details: e.message
            });
        }
    }

    /**
     * Releases hold on source tally when cancelled
     *
     * @param {Record} newRecord - Current record
     */
    function releaseSourceTallyHold(newRecord) {
        const sourceTallyId = newRecord.getValue({ fieldId: FIELD_IDS.SOURCE_TALLY });

        if (!sourceTallyId) return;

        try {
            // Remove any pending allocation flags
            record.submitFields({
                type: 'customrecord_cls_tally_sheet',
                id: sourceTallyId,
                values: {
                    'custrecord_cls_tally_pending_repack': false
                }
            });

            log.debug({
                title: 'Released tally hold',
                details: `Tally ${sourceTallyId} released from cancelled repack`
            });

        } catch (e) {
            log.debug({
                title: 'No hold to release',
                details: e.message
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE EXPORTS
    // ═══════════════════════════════════════════════════════════════════════

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
