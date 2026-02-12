/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @file cls_repack_wizard_sl.js
 * @description Repack Wizard Suitelet for Consule LumberSuite™
 *              Interactive wizard for repack operations with guided workflow
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module repack/cls_repack_wizard_sl
 */

define([
    'N/ui/serverWidget',
    'N/record',
    'N/search',
    'N/redirect',
    'N/runtime',
    'N/format',
    'N/url',
    '../lib/cls_uom_engine',
    '../lib/cls_settings_dao',
    '../lib/cls_lumber_constants'
], function(
    serverWidget,
    record,
    search,
    redirect,
    runtime,
    format,
    url,
    uomEngine,
    settingsDAO,
    constants
) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    const REPACK_TYPES = {
        BUNDLE_REPACK: { value: 'bundle_repack', label: 'Bundle Repack', icon: '📦' },
        BOARD_RESAW: { value: 'board_resaw', label: 'Board Resaw', icon: '🪚' },
        BUNDLE_SPLIT: { value: 'bundle_split', label: 'Bundle Split', icon: '✂️' },
        BOARD_TRIM: { value: 'board_trim', label: 'Board Trim', icon: '📏' },
        GRADE_SORT: { value: 'grade_sort', label: 'Grade Sort', icon: '🏷️' }
    };

    const WIZARD_MODES = {
        LIST: 'list',
        CREATE: 'create',
        COMPLETE: 'complete',
        PRINT: 'print'
    };

    // ═══════════════════════════════════════════════════════════════════════
    // ON REQUEST
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * onRequest Entry Point
     *
     * @param {Object} context - Request context
     */
    function onRequest(context) {
        const { request, response } = context;

        try {
            // Check feature enabled
            if (!settingsDAO.isFeatureEnabled('repack')) {
                response.write('Repack feature is not enabled. Please contact your administrator.');
                return;
            }

            // Handle API actions
            const action = request.parameters.action;
            if (action) {
                handleApiAction(context);
                return;
            }

            // Determine mode
            const mode = request.parameters.mode || WIZARD_MODES.LIST;

            if (request.method === 'GET') {
                handleGet(context, mode);
            } else {
                handlePost(context, mode);
            }

        } catch (error) {
            log.error({
                title: 'Repack Wizard Error',
                details: error.message
            });
            response.write(`Error: ${error.message}`);
        }
    }

    /**
     * Handles API actions
     *
     * @param {Object} context - Request context
     */
    function handleApiAction(context) {
        const { request, response } = context;
        const action = request.parameters.action;

        let result = { success: false, message: 'Unknown action' };

        try {
            switch (action) {
                case 'updateStatus':
                    result = updateRepackStatus(request.parameters);
                    break;

                case 'getTallyDetails':
                    result = getTallyDetails(request.parameters.tallyId);
                    break;

                case 'getItemDimensions':
                    result = getItemDimensions(request.parameters.itemId);
                    break;

                case 'calculateBF':
                    result = calculateBF(request.parameters);
                    break;
            }
        } catch (e) {
            result = { success: false, message: e.message };
        }

        response.setHeader({ name: 'Content-Type', value: 'application/json' });
        response.write(JSON.stringify(result));
    }

    /**
     * Updates repack status
     *
     * @param {Object} params - Request parameters
     * @returns {Object} Result
     */
    function updateRepackStatus(params) {
        const repackId = params.repackId;
        const newStatus = params.status;

        if (!repackId || !newStatus) {
            return { success: false, message: 'Missing required parameters' };
        }

        record.submitFields({
            type: 'customrecord_cls_repack_workorder',
            id: repackId,
            values: {
                'custrecord_cls_repack_status': newStatus
            }
        });

        return { success: true, message: 'Status updated' };
    }

    /**
     * Gets tally details
     *
     * @param {string} tallyId - Tally ID
     * @returns {Object} Tally data
     */
    function getTallyDetails(tallyId) {
        if (!tallyId) {
            return { success: false, message: 'Missing tally ID' };
        }

        const tallyData = search.lookupFields({
            type: 'customrecord_cls_tally_sheet',
            id: tallyId,
            columns: [
                'name',
                'custrecord_cls_tally_item',
                'custrecord_cls_tally_location',
                'custrecord_cls_tally_bf_total',
                'custrecord_cls_tally_bf_available',
                'custrecord_cls_tally_pieces',
                'custrecord_cls_tally_status'
            ]
        });

        return { success: true, data: tallyData };
    }

    /**
     * Gets item dimensions
     *
     * @param {string} itemId - Item ID
     * @returns {Object} Item dimensions
     */
    function getItemDimensions(itemId) {
        if (!itemId) {
            return { success: false, message: 'Missing item ID' };
        }

        const itemData = search.lookupFields({
            type: search.Type.INVENTORY_ITEM,
            id: itemId,
            columns: [
                'custitem_cls_nominal_thickness',
                'custitem_cls_nominal_width',
                'custitem_cls_length'
            ]
        });

        return { success: true, data: itemData };
    }

    /**
     * Calculates BF from parameters
     *
     * @param {Object} params - Dimension parameters
     * @returns {Object} Calculated BF
     */
    function calculateBF(params) {
        const thickness = parseFloat(params.thickness) || 0;
        const width = parseFloat(params.width) || 0;
        const length = parseFloat(params.length) || 0;
        const pieces = parseInt(params.pieces, 10) || 0;

        const bfPerPiece = (thickness * width * length) / 12;
        const totalBF = bfPerPiece * pieces;

        return {
            success: true,
            bfPerPiece: bfPerPiece,
            totalBF: totalBF
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Handles GET requests
     *
     * @param {Object} context - Request context
     * @param {string} mode - Wizard mode
     */
    function handleGet(context, mode) {
        const { request, response } = context;

        switch (mode) {
            case WIZARD_MODES.LIST:
                response.writePage(buildListPage(request));
                break;

            case WIZARD_MODES.CREATE:
                response.writePage(buildCreatePage(request));
                break;

            case WIZARD_MODES.COMPLETE:
                response.writePage(buildCompletePage(request));
                break;

            case WIZARD_MODES.PRINT:
                response.write(buildPrintReport(request));
                break;

            default:
                response.writePage(buildListPage(request));
        }
    }

    /**
     * Builds the list/dashboard page
     *
     * @param {Object} request - Request object
     * @returns {Form} Form object
     */
    function buildListPage(request) {
        const form = serverWidget.createForm({
            title: 'LumberSuite™ Repack Operations'
        });

        // Add client script
        form.clientScriptModulePath = './cls_repack_wizard_cs.js';

        // Add action buttons
        form.addButton({
            id: 'custpage_btn_new_repack',
            label: 'New Repack Order',
            functionName: 'navigateToCreate'
        });

        form.addButton({
            id: 'custpage_btn_refresh',
            label: 'Refresh',
            functionName: 'refreshPage'
        });

        // Add tabs
        form.addTab({
            id: 'custpage_tab_active',
            label: 'Active Orders'
        });

        form.addTab({
            id: 'custpage_tab_completed',
            label: 'Completed'
        });

        form.addTab({
            id: 'custpage_tab_analytics',
            label: 'Analytics'
        });

        // Build active orders section
        addActiveOrdersSection(form, request);

        // Build completed orders section
        addCompletedOrdersSection(form, request);

        // Build analytics section
        addAnalyticsSection(form);

        return form;
    }

    /**
     * Adds active orders section
     *
     * @param {Form} form - Form object
     * @param {Object} request - Request object
     */
    function addActiveOrdersSection(form, request) {
        // Summary statistics
        const summaryField = form.addField({
            id: 'custpage_active_summary',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Summary',
            container: 'custpage_tab_active'
        });

        const stats = getOrderStatistics();
        summaryField.defaultValue = buildStatsSummaryHtml(stats);

        // Active orders sublist
        const activeList = form.addSublist({
            id: 'custpage_active_orders',
            type: serverWidget.SublistType.LIST,
            label: 'Active Repack Orders',
            tab: 'custpage_tab_active'
        });

        activeList.addField({
            id: 'custpage_repack_number',
            type: serverWidget.FieldType.TEXT,
            label: 'Repack #'
        });

        activeList.addField({
            id: 'custpage_repack_type',
            type: serverWidget.FieldType.TEXT,
            label: 'Type'
        });

        activeList.addField({
            id: 'custpage_status',
            type: serverWidget.FieldType.TEXT,
            label: 'Status'
        });

        activeList.addField({
            id: 'custpage_source_tally',
            type: serverWidget.FieldType.TEXT,
            label: 'Source Tally'
        });

        activeList.addField({
            id: 'custpage_input_bf',
            type: serverWidget.FieldType.FLOAT,
            label: 'Input BF'
        });

        activeList.addField({
            id: 'custpage_operator',
            type: serverWidget.FieldType.TEXT,
            label: 'Operator'
        });

        activeList.addField({
            id: 'custpage_actions',
            type: serverWidget.FieldType.TEXT,
            label: 'Actions'
        });

        // Populate active orders
        const activeOrders = searchActiveOrders();
        activeOrders.forEach((order, index) => {
            activeList.setSublistValue({
                id: 'custpage_repack_number',
                line: index,
                value: order.repackNumber
            });

            activeList.setSublistValue({
                id: 'custpage_repack_type',
                line: index,
                value: order.typeName
            });

            activeList.setSublistValue({
                id: 'custpage_status',
                line: index,
                value: formatStatus(order.status)
            });

            activeList.setSublistValue({
                id: 'custpage_source_tally',
                line: index,
                value: order.sourceTallyName || 'N/A'
            });

            activeList.setSublistValue({
                id: 'custpage_input_bf',
                line: index,
                value: order.inputBF
            });

            activeList.setSublistValue({
                id: 'custpage_operator',
                line: index,
                value: order.operatorName || 'N/A'
            });

            activeList.setSublistValue({
                id: 'custpage_actions',
                line: index,
                value: buildActionLinks(order)
            });
        });
    }

    /**
     * Adds completed orders section
     *
     * @param {Form} form - Form object
     * @param {Object} request - Request object
     */
    function addCompletedOrdersSection(form, request) {
        // Filter fields
        const filterGroup = form.addFieldGroup({
            id: 'custgroup_completed_filters',
            label: 'Filters',
            tab: 'custpage_tab_completed'
        });

        form.addField({
            id: 'custpage_completed_from',
            type: serverWidget.FieldType.DATE,
            label: 'From Date',
            container: 'custgroup_completed_filters'
        });

        form.addField({
            id: 'custpage_completed_to',
            type: serverWidget.FieldType.DATE,
            label: 'To Date',
            container: 'custgroup_completed_filters'
        });

        // Completed orders sublist
        const completedList = form.addSublist({
            id: 'custpage_completed_orders',
            type: serverWidget.SublistType.LIST,
            label: 'Completed Orders',
            tab: 'custpage_tab_completed'
        });

        completedList.addField({
            id: 'custpage_comp_number',
            type: serverWidget.FieldType.TEXT,
            label: 'Repack #'
        });

        completedList.addField({
            id: 'custpage_comp_type',
            type: serverWidget.FieldType.TEXT,
            label: 'Type'
        });

        completedList.addField({
            id: 'custpage_comp_date',
            type: serverWidget.FieldType.TEXT,
            label: 'Completed'
        });

        completedList.addField({
            id: 'custpage_comp_input',
            type: serverWidget.FieldType.FLOAT,
            label: 'Input BF'
        });

        completedList.addField({
            id: 'custpage_comp_output',
            type: serverWidget.FieldType.FLOAT,
            label: 'Output BF'
        });

        completedList.addField({
            id: 'custpage_comp_yield',
            type: serverWidget.FieldType.PERCENT,
            label: 'Yield %'
        });

        completedList.addField({
            id: 'custpage_comp_actions',
            type: serverWidget.FieldType.TEXT,
            label: 'Actions'
        });

        // Populate recent completed orders
        const completedOrders = searchCompletedOrders(30);
        completedOrders.forEach((order, index) => {
            completedList.setSublistValue({
                id: 'custpage_comp_number',
                line: index,
                value: order.repackNumber
            });

            completedList.setSublistValue({
                id: 'custpage_comp_type',
                line: index,
                value: order.typeName
            });

            completedList.setSublistValue({
                id: 'custpage_comp_date',
                line: index,
                value: order.completedDate || ''
            });

            completedList.setSublistValue({
                id: 'custpage_comp_input',
                line: index,
                value: order.inputBF
            });

            completedList.setSublistValue({
                id: 'custpage_comp_output',
                line: index,
                value: order.outputBF
            });

            completedList.setSublistValue({
                id: 'custpage_comp_yield',
                line: index,
                value: order.yieldPct / 100
            });

            completedList.setSublistValue({
                id: 'custpage_comp_actions',
                line: index,
                value: `<a href="#" onclick="viewOrder(${order.id})">View</a> | <a href="#" onclick="printReport(${order.id})">Print</a>`
            });
        });
    }

    /**
     * Adds analytics section
     *
     * @param {Form} form - Form object
     */
    function addAnalyticsSection(form) {
        const analyticsField = form.addField({
            id: 'custpage_analytics',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Analytics',
            container: 'custpage_tab_analytics'
        });

        const analytics = calculateRepackAnalytics();
        analyticsField.defaultValue = buildAnalyticsHtml(analytics);
    }

    /**
     * Builds the create wizard page
     *
     * @param {Object} request - Request object
     * @returns {Form} Form object
     */
    function buildCreatePage(request) {
        const form = serverWidget.createForm({
            title: 'New Repack Order'
        });

        form.clientScriptModulePath = './cls_repack_wizard_cs.js';

        // Hidden field for mode
        const modeField = form.addField({
            id: 'custpage_mode',
            type: serverWidget.FieldType.TEXT,
            label: 'Mode'
        });
        modeField.defaultValue = 'create';
        modeField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        // Step 1: Repack Type Selection
        const typeGroup = form.addFieldGroup({
            id: 'custgroup_step1',
            label: 'Step 1: Select Repack Type'
        });

        const typeField = form.addField({
            id: 'custpage_repack_type',
            type: serverWidget.FieldType.SELECT,
            label: 'Repack Type',
            container: 'custgroup_step1'
        });
        typeField.isMandatory = true;

        typeField.addSelectOption({ value: '', text: '-- Select Type --' });
        Object.values(REPACK_TYPES).forEach(type => {
            typeField.addSelectOption({
                value: type.value,
                text: `${type.icon} ${type.label}`
            });
        });

        // Type description
        const typeDescField = form.addField({
            id: 'custpage_type_description',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Description',
            container: 'custgroup_step1'
        });
        typeDescField.defaultValue = '<div id="typeDescription" style="padding: 10px; background: #f0f0f0; border-radius: 4px;">Select a repack type to see description</div>';

        // Step 2: Source Selection
        const sourceGroup = form.addFieldGroup({
            id: 'custgroup_step2',
            label: 'Step 2: Select Source'
        });

        const tallyField = form.addField({
            id: 'custpage_source_tally',
            type: serverWidget.FieldType.SELECT,
            source: 'customrecord_cls_tally_sheet',
            label: 'Source Tally',
            container: 'custgroup_step2'
        });
        tallyField.isMandatory = true;

        const locationField = form.addField({
            id: 'custpage_location',
            type: serverWidget.FieldType.SELECT,
            source: 'location',
            label: 'Location',
            container: 'custgroup_step2'
        });

        // Tally details display
        const tallyDetailsField = form.addField({
            id: 'custpage_tally_details',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Tally Details',
            container: 'custgroup_step2'
        });
        tallyDetailsField.defaultValue = '<div id="tallyDetails"></div>';

        // Step 3: Input Configuration
        const inputGroup = form.addFieldGroup({
            id: 'custgroup_step3',
            label: 'Step 3: Input Configuration'
        });

        form.addField({
            id: 'custpage_input_bf',
            type: serverWidget.FieldType.FLOAT,
            label: 'Input BF',
            container: 'custgroup_step3'
        }).isMandatory = true;

        form.addField({
            id: 'custpage_input_pieces',
            type: serverWidget.FieldType.INTEGER,
            label: 'Input Pieces',
            container: 'custgroup_step3'
        });

        // Step 4: Output Configuration
        const outputGroup = form.addFieldGroup({
            id: 'custgroup_step4',
            label: 'Step 4: Output Configuration'
        });

        const outputItemField = form.addField({
            id: 'custpage_output_item',
            type: serverWidget.FieldType.SELECT,
            source: 'item',
            label: 'Output Item',
            container: 'custgroup_step4'
        });

        form.addField({
            id: 'custpage_output_thickness',
            type: serverWidget.FieldType.FLOAT,
            label: 'Output Thickness (in)',
            container: 'custgroup_step4'
        });

        form.addField({
            id: 'custpage_output_width',
            type: serverWidget.FieldType.FLOAT,
            label: 'Output Width (in)',
            container: 'custgroup_step4'
        });

        form.addField({
            id: 'custpage_output_length',
            type: serverWidget.FieldType.FLOAT,
            label: 'Output Length (ft)',
            container: 'custgroup_step4'
        });

        // Step 5: Assignment
        const assignGroup = form.addFieldGroup({
            id: 'custgroup_step5',
            label: 'Step 5: Assignment'
        });

        form.addField({
            id: 'custpage_operator',
            type: serverWidget.FieldType.SELECT,
            source: 'employee',
            label: 'Operator',
            container: 'custgroup_step5'
        });

        form.addField({
            id: 'custpage_work_center',
            type: serverWidget.FieldType.SELECT,
            source: 'customrecord_cls_work_center',
            label: 'Work Center',
            container: 'custgroup_step5'
        });

        form.addField({
            id: 'custpage_instructions',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Instructions',
            container: 'custgroup_step5'
        });

        // Buttons
        form.addSubmitButton({ label: 'Create Repack Order' });

        form.addButton({
            id: 'custpage_btn_cancel',
            label: 'Cancel',
            functionName: 'navigateToList'
        });

        return form;
    }

    /**
     * Builds completion page for finishing a repack
     *
     * @param {Object} request - Request object
     * @returns {Form} Form object
     */
    function buildCompletePage(request) {
        const repackId = request.parameters.repackId;

        if (!repackId) {
            throw new Error('Repack ID is required');
        }

        // Load existing repack data
        const repackRec = record.load({
            type: 'customrecord_cls_repack_workorder',
            id: repackId
        });

        const form = serverWidget.createForm({
            title: 'Complete Repack Order'
        });

        form.clientScriptModulePath = './cls_repack_wizard_cs.js';

        // Hidden fields
        const idField = form.addField({
            id: 'custpage_repack_id',
            type: serverWidget.FieldType.TEXT,
            label: 'Repack ID'
        });
        idField.defaultValue = repackId;
        idField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        const modeField = form.addField({
            id: 'custpage_mode',
            type: serverWidget.FieldType.TEXT,
            label: 'Mode'
        });
        modeField.defaultValue = 'complete';
        modeField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        // Order summary
        const summaryGroup = form.addFieldGroup({
            id: 'custgroup_summary',
            label: 'Repack Order Summary'
        });

        const summaryField = form.addField({
            id: 'custpage_order_summary',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Summary',
            container: 'custgroup_summary'
        });
        summaryField.defaultValue = buildRepackSummaryHtml(repackRec);

        // Output entry
        const outputGroup = form.addFieldGroup({
            id: 'custgroup_output',
            label: 'Output Results'
        });

        const outputBFField = form.addField({
            id: 'custpage_output_bf',
            type: serverWidget.FieldType.FLOAT,
            label: 'Output BF',
            container: 'custgroup_output'
        });
        outputBFField.isMandatory = true;

        const outputPiecesField = form.addField({
            id: 'custpage_output_pieces',
            type: serverWidget.FieldType.INTEGER,
            label: 'Output Pieces',
            container: 'custgroup_output'
        });
        outputPiecesField.isMandatory = true;

        // Yield preview
        const yieldGroup = form.addFieldGroup({
            id: 'custgroup_yield',
            label: 'Yield Preview'
        });

        const yieldField = form.addField({
            id: 'custpage_yield_preview',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Preview',
            container: 'custgroup_yield'
        });
        yieldField.defaultValue = '<div id="yieldPreview" style="padding: 15px; text-align: center;"><em>Enter output values to calculate yield</em></div>';

        // Waste breakdown
        const wasteGroup = form.addFieldGroup({
            id: 'custgroup_waste',
            label: 'Waste Breakdown (Optional)'
        });

        form.addField({
            id: 'custpage_waste_sawdust',
            type: serverWidget.FieldType.FLOAT,
            label: 'Sawdust BF',
            container: 'custgroup_waste'
        });

        form.addField({
            id: 'custpage_waste_trim',
            type: serverWidget.FieldType.FLOAT,
            label: 'Trim Waste BF',
            container: 'custgroup_waste'
        });

        form.addField({
            id: 'custpage_waste_defect',
            type: serverWidget.FieldType.FLOAT,
            label: 'Defect BF',
            container: 'custgroup_waste'
        });

        // Notes
        form.addField({
            id: 'custpage_completion_notes',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Completion Notes'
        });

        // Buttons
        form.addSubmitButton({ label: 'Complete Repack' });

        form.addButton({
            id: 'custpage_btn_back',
            label: 'Back to Order',
            functionName: `viewOrder(${repackId})`
        });

        return form;
    }

    /**
     * Builds print report HTML
     *
     * @param {Object} request - Request object
     * @returns {string} HTML content
     */
    function buildPrintReport(request) {
        const repackId = request.parameters.repackId;

        if (!repackId) {
            return '<h1>Error: Repack ID required</h1>';
        }

        const repackRec = record.load({
            type: 'customrecord_cls_repack_workorder',
            id: repackId
        });

        const repackNumber = repackRec.getValue({ fieldId: 'custrecord_cls_repack_number' });
        const repackType = repackRec.getValue({ fieldId: 'custrecord_cls_repack_type' });
        const status = repackRec.getValue({ fieldId: 'custrecord_cls_repack_status' });
        const inputBF = parseFloat(repackRec.getValue({ fieldId: 'custrecord_cls_repack_input_bf' })) || 0;
        const outputBF = parseFloat(repackRec.getValue({ fieldId: 'custrecord_cls_repack_output_bf' })) || 0;
        const wasteBF = parseFloat(repackRec.getValue({ fieldId: 'custrecord_cls_repack_waste_bf' })) || 0;
        const yieldPct = parseFloat(repackRec.getValue({ fieldId: 'custrecord_cls_repack_yield_pct' })) || 0;
        const repackDate = repackRec.getValue({ fieldId: 'custrecord_cls_repack_date' });
        const notes = repackRec.getValue({ fieldId: 'custrecord_cls_repack_notes' }) || '';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Repack Report - ${repackNumber}</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
                .logo { font-size: 24px; font-weight: bold; color: #2c5530; }
                h1 { margin: 10px 0; }
                .section { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 8px; }
                .section h2 { margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
                .metrics { display: flex; justify-content: space-around; text-align: center; }
                .metric { padding: 15px; }
                .metric-value { font-size: 28px; font-weight: bold; }
                .metric-label { font-size: 12px; color: #666; text-transform: uppercase; }
                .yield-good { color: #28a745; }
                .yield-warning { color: #ffc107; }
                .yield-poor { color: #dc3545; }
                .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">LumberSuite™</div>
                <h1>Repack Report</h1>
                <div>${repackNumber}</div>
            </div>

            <div class="section">
                <h2>Order Details</h2>
                <table style="width: 100%;">
                    <tr>
                        <td><strong>Type:</strong> ${repackType}</td>
                        <td><strong>Status:</strong> ${status}</td>
                    </tr>
                    <tr>
                        <td><strong>Date:</strong> ${repackDate ? format.format({ value: repackDate, type: format.Type.DATE }) : 'N/A'}</td>
                        <td><strong>Report Generated:</strong> ${new Date().toLocaleString()}</td>
                    </tr>
                </table>
            </div>

            <div class="section">
                <h2>Yield Metrics</h2>
                <div class="metrics">
                    <div class="metric">
                        <div class="metric-value">${inputBF.toFixed(2)}</div>
                        <div class="metric-label">Input BF</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${outputBF.toFixed(2)}</div>
                        <div class="metric-label">Output BF</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${wasteBF.toFixed(2)}</div>
                        <div class="metric-label">Waste BF</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value ${yieldPct >= 85 ? 'yield-good' : yieldPct >= 70 ? 'yield-warning' : 'yield-poor'}">${yieldPct.toFixed(1)}%</div>
                        <div class="metric-label">Yield</div>
                    </div>
                </div>
            </div>

            ${notes ? `<div class="section"><h2>Notes</h2><p>${notes}</p></div>` : ''}

            <div class="footer">
                <p>Consule LumberSuite™ - Repack Management System</p>
            </div>

            <div class="no-print" style="margin-top: 20px; text-align: center;">
                <button onclick="window.print()">Print Report</button>
                <button onclick="window.close()">Close</button>
            </div>
        </body>
        </html>
        `;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Handles POST requests
     *
     * @param {Object} context - Request context
     * @param {string} mode - Wizard mode
     */
    function handlePost(context, mode) {
        const { request, response } = context;

        if (mode === WIZARD_MODES.CREATE) {
            handleCreateSubmit(context);
        } else if (mode === 'complete') {
            handleCompleteSubmit(context);
        } else {
            // Default to list page
            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: { mode: WIZARD_MODES.LIST }
            });
        }
    }

    /**
     * Handles create form submission
     *
     * @param {Object} context - Request context
     */
    function handleCreateSubmit(context) {
        const { request } = context;

        try {
            // Create repack work order
            const repackRec = record.create({
                type: 'customrecord_cls_repack_workorder',
                isDynamic: true
            });

            repackRec.setValue({
                fieldId: 'custrecord_cls_repack_type',
                value: request.parameters.custpage_repack_type
            });

            repackRec.setValue({
                fieldId: 'custrecord_cls_repack_source_tally',
                value: request.parameters.custpage_source_tally
            });

            repackRec.setValue({
                fieldId: 'custrecord_cls_repack_location',
                value: request.parameters.custpage_location
            });

            repackRec.setValue({
                fieldId: 'custrecord_cls_repack_input_bf',
                value: parseFloat(request.parameters.custpage_input_bf) || 0
            });

            repackRec.setValue({
                fieldId: 'custrecord_cls_repack_input_pieces',
                value: parseInt(request.parameters.custpage_input_pieces, 10) || 0
            });

            if (request.parameters.custpage_output_item) {
                repackRec.setValue({
                    fieldId: 'custrecord_cls_repack_output_item',
                    value: request.parameters.custpage_output_item
                });
            }

            if (request.parameters.custpage_output_thickness) {
                repackRec.setValue({
                    fieldId: 'custrecord_cls_repack_out_thickness',
                    value: parseFloat(request.parameters.custpage_output_thickness) || 0
                });
            }

            if (request.parameters.custpage_output_width) {
                repackRec.setValue({
                    fieldId: 'custrecord_cls_repack_out_width',
                    value: parseFloat(request.parameters.custpage_output_width) || 0
                });
            }

            if (request.parameters.custpage_output_length) {
                repackRec.setValue({
                    fieldId: 'custrecord_cls_repack_out_length',
                    value: parseFloat(request.parameters.custpage_output_length) || 0
                });
            }

            if (request.parameters.custpage_operator) {
                repackRec.setValue({
                    fieldId: 'custrecord_cls_repack_operator',
                    value: request.parameters.custpage_operator
                });
            }

            if (request.parameters.custpage_work_center) {
                repackRec.setValue({
                    fieldId: 'custrecord_cls_repack_work_center',
                    value: request.parameters.custpage_work_center
                });
            }

            if (request.parameters.custpage_instructions) {
                repackRec.setValue({
                    fieldId: 'custrecord_cls_repack_instructions',
                    value: request.parameters.custpage_instructions
                });
            }

            const repackId = repackRec.save();

            // Redirect to view the new record
            redirect.toRecord({
                type: 'customrecord_cls_repack_workorder',
                id: repackId
            });

        } catch (e) {
            log.error({ title: 'Create Repack Error', details: e.message });

            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: {
                    mode: WIZARD_MODES.CREATE,
                    error: e.message
                }
            });
        }
    }

    /**
     * Handles completion form submission
     *
     * @param {Object} context - Request context
     */
    function handleCompleteSubmit(context) {
        const { request } = context;
        const repackId = request.parameters.custpage_repack_id;

        try {
            const outputBF = parseFloat(request.parameters.custpage_output_bf) || 0;
            const outputPieces = parseInt(request.parameters.custpage_output_pieces, 10) || 0;
            const notes = request.parameters.custpage_completion_notes || '';

            // Update repack record
            const values = {
                'custrecord_cls_repack_output_bf': outputBF,
                'custrecord_cls_repack_output_pieces': outputPieces,
                'custrecord_cls_repack_status': 'completed'
            };

            if (notes) {
                values['custrecord_cls_repack_notes'] = notes;
            }

            // Add waste breakdown if provided
            if (request.parameters.custpage_waste_sawdust) {
                values['custrecord_cls_repack_waste_sawdust'] = parseFloat(request.parameters.custpage_waste_sawdust) || 0;
            }
            if (request.parameters.custpage_waste_trim) {
                values['custrecord_cls_repack_waste_trim'] = parseFloat(request.parameters.custpage_waste_trim) || 0;
            }
            if (request.parameters.custpage_waste_defect) {
                values['custrecord_cls_repack_waste_defect'] = parseFloat(request.parameters.custpage_waste_defect) || 0;
            }

            record.submitFields({
                type: 'customrecord_cls_repack_workorder',
                id: repackId,
                values: values
            });

            // Redirect to the completed record
            redirect.toRecord({
                type: 'customrecord_cls_repack_workorder',
                id: repackId
            });

        } catch (e) {
            log.error({ title: 'Complete Repack Error', details: e.message });

            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: {
                    mode: WIZARD_MODES.COMPLETE,
                    repackId: repackId,
                    error: e.message
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Gets order statistics
     *
     * @returns {Object} Statistics
     */
    function getOrderStatistics() {
        const stats = {
            draft: 0,
            pending: 0,
            inProgress: 0,
            completedToday: 0,
            totalBFToday: 0
        };

        try {
            const countSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'noneof', ['completed', 'cancelled']]
                ],
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_repack_status',
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })
                ]
            });

            countSearch.run().each(result => {
                const status = result.getValue({
                    name: 'custrecord_cls_repack_status',
                    summary: search.Summary.GROUP
                });
                const count = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;

                if (status === 'draft') stats.draft = count;
                else if (status === 'pending') stats.pending = count;
                else if (status === 'in_progress') stats.inProgress = count;

                return true;
            });

            // Get today's completed
            const todaySearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'is', 'completed'],
                    'AND',
                    ['custrecord_cls_repack_date', 'on', 'today']
                ],
                columns: [
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }),
                    search.createColumn({
                        name: 'custrecord_cls_repack_output_bf',
                        summary: search.Summary.SUM
                    })
                ]
            });

            todaySearch.run().each(result => {
                stats.completedToday = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                stats.totalBFToday = parseFloat(result.getValue({
                    name: 'custrecord_cls_repack_output_bf',
                    summary: search.Summary.SUM
                })) || 0;
                return true;
            });

        } catch (e) {
            log.debug({ title: 'Stats search error', details: e.message });
        }

        return stats;
    }

    /**
     * Builds stats summary HTML
     *
     * @param {Object} stats - Statistics
     * @returns {string} HTML content
     */
    function buildStatsSummaryHtml(stats) {
        return `
            <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                <div style="flex: 1; padding: 15px; background: #fff3cd; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold;">${stats.draft}</div>
                    <div style="color: #856404;">Draft</div>
                </div>
                <div style="flex: 1; padding: 15px; background: #cce5ff; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold;">${stats.pending}</div>
                    <div style="color: #004085;">Pending</div>
                </div>
                <div style="flex: 1; padding: 15px; background: #d4edda; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold;">${stats.inProgress}</div>
                    <div style="color: #155724;">In Progress</div>
                </div>
                <div style="flex: 1; padding: 15px; background: #e2e3e5; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold;">${stats.completedToday}</div>
                    <div style="color: #383d41;">Completed Today</div>
                </div>
                <div style="flex: 1; padding: 15px; background: #f8d7da; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold;">${stats.totalBFToday.toFixed(0)}</div>
                    <div style="color: #721c24;">BF Today</div>
                </div>
            </div>
        `;
    }

    /**
     * Searches for active orders
     *
     * @returns {Array} Active orders
     */
    function searchActiveOrders() {
        const orders = [];

        try {
            const orderSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'noneof', ['completed', 'cancelled']]
                ],
                columns: [
                    'internalid',
                    'custrecord_cls_repack_number',
                    'custrecord_cls_repack_type',
                    'custrecord_cls_repack_status',
                    'custrecord_cls_repack_source_tally',
                    'custrecord_cls_repack_input_bf',
                    'custrecord_cls_repack_operator'
                ]
            });

            orderSearch.run().each(result => {
                orders.push({
                    id: result.getValue('internalid'),
                    repackNumber: result.getValue('custrecord_cls_repack_number'),
                    type: result.getValue('custrecord_cls_repack_type'),
                    typeName: result.getText('custrecord_cls_repack_type'),
                    status: result.getValue('custrecord_cls_repack_status'),
                    sourceTallyName: result.getText('custrecord_cls_repack_source_tally'),
                    inputBF: parseFloat(result.getValue('custrecord_cls_repack_input_bf')) || 0,
                    operatorName: result.getText('custrecord_cls_repack_operator')
                });
                return true;
            });

        } catch (e) {
            log.debug({ title: 'Active orders search error', details: e.message });
        }

        return orders;
    }

    /**
     * Searches for completed orders
     *
     * @param {number} days - Number of days to look back
     * @returns {Array} Completed orders
     */
    function searchCompletedOrders(days) {
        const orders = [];

        try {
            const orderSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'is', 'completed'],
                    'AND',
                    ['custrecord_cls_repack_date', 'within', 'lastndaystodate', days]
                ],
                columns: [
                    'internalid',
                    'custrecord_cls_repack_number',
                    'custrecord_cls_repack_type',
                    'custrecord_cls_repack_date',
                    'custrecord_cls_repack_input_bf',
                    'custrecord_cls_repack_output_bf',
                    'custrecord_cls_repack_yield_pct'
                ]
            });

            orderSearch.run().each(result => {
                const dateVal = result.getValue('custrecord_cls_repack_date');
                orders.push({
                    id: result.getValue('internalid'),
                    repackNumber: result.getValue('custrecord_cls_repack_number'),
                    typeName: result.getText('custrecord_cls_repack_type'),
                    completedDate: dateVal ? format.format({ value: new Date(dateVal), type: format.Type.DATE }) : '',
                    inputBF: parseFloat(result.getValue('custrecord_cls_repack_input_bf')) || 0,
                    outputBF: parseFloat(result.getValue('custrecord_cls_repack_output_bf')) || 0,
                    yieldPct: parseFloat(result.getValue('custrecord_cls_repack_yield_pct')) || 0
                });
                return true;
            });

        } catch (e) {
            log.debug({ title: 'Completed orders search error', details: e.message });
        }

        return orders;
    }

    /**
     * Formats status for display
     *
     * @param {string} status - Status value
     * @returns {string} Formatted status
     */
    function formatStatus(status) {
        const colors = {
            'draft': '#6c757d',
            'pending': '#007bff',
            'in_progress': '#28a745',
            'completed': '#17a2b8',
            'cancelled': '#dc3545'
        };

        const labels = {
            'draft': 'Draft',
            'pending': 'Pending',
            'in_progress': 'In Progress',
            'completed': 'Completed',
            'cancelled': 'Cancelled'
        };

        const color = colors[status] || '#6c757d';
        const label = labels[status] || status;

        return `<span style="color: ${color}; font-weight: bold;">${label}</span>`;
    }

    /**
     * Builds action links for an order
     *
     * @param {Object} order - Order data
     * @returns {string} HTML links
     */
    function buildActionLinks(order) {
        let links = `<a href="#" onclick="viewOrder(${order.id})">View</a>`;

        if (order.status === 'draft') {
            links += ` | <a href="#" onclick="startProcessing(${order.id})">Start</a>`;
        } else if (order.status === 'pending') {
            links += ` | <a href="#" onclick="beginRepack(${order.id})">Begin</a>`;
        } else if (order.status === 'in_progress') {
            links += ` | <a href="#" onclick="completeRepack(${order.id})">Complete</a>`;
        }

        return links;
    }

    /**
     * Calculates repack analytics
     *
     * @returns {Object} Analytics data
     */
    function calculateRepackAnalytics() {
        const analytics = {
            avgYield: 0,
            totalInputBF: 0,
            totalOutputBF: 0,
            totalWasteBF: 0,
            byType: {}
        };

        try {
            const analyticsSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'is', 'completed'],
                    'AND',
                    ['custrecord_cls_repack_date', 'within', 'lastndaystodate', 30]
                ],
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_repack_type',
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({
                        name: 'custrecord_cls_repack_input_bf',
                        summary: search.Summary.SUM
                    }),
                    search.createColumn({
                        name: 'custrecord_cls_repack_output_bf',
                        summary: search.Summary.SUM
                    }),
                    search.createColumn({
                        name: 'custrecord_cls_repack_yield_pct',
                        summary: search.Summary.AVG
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })
                ]
            });

            analyticsSearch.run().each(result => {
                const type = result.getValue({
                    name: 'custrecord_cls_repack_type',
                    summary: search.Summary.GROUP
                });
                const typeName = result.getText({
                    name: 'custrecord_cls_repack_type',
                    summary: search.Summary.GROUP
                });
                const inputBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_repack_input_bf',
                    summary: search.Summary.SUM
                })) || 0;
                const outputBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_repack_output_bf',
                    summary: search.Summary.SUM
                })) || 0;
                const avgYield = parseFloat(result.getValue({
                    name: 'custrecord_cls_repack_yield_pct',
                    summary: search.Summary.AVG
                })) || 0;
                const count = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;

                analytics.totalInputBF += inputBF;
                analytics.totalOutputBF += outputBF;
                analytics.byType[type] = {
                    name: typeName,
                    inputBF: inputBF,
                    outputBF: outputBF,
                    avgYield: avgYield,
                    count: count
                };

                return true;
            });

            analytics.totalWasteBF = analytics.totalInputBF - analytics.totalOutputBF;
            analytics.avgYield = analytics.totalInputBF > 0
                ? (analytics.totalOutputBF / analytics.totalInputBF) * 100
                : 0;

        } catch (e) {
            log.debug({ title: 'Analytics search error', details: e.message });
        }

        return analytics;
    }

    /**
     * Builds analytics HTML
     *
     * @param {Object} analytics - Analytics data
     * @returns {string} HTML content
     */
    function buildAnalyticsHtml(analytics) {
        let typeRows = '';
        Object.values(analytics.byType).forEach(type => {
            typeRows += `
                <tr>
                    <td>${type.name}</td>
                    <td>${type.count}</td>
                    <td>${type.inputBF.toFixed(2)}</td>
                    <td>${type.outputBF.toFixed(2)}</td>
                    <td>${type.avgYield.toFixed(1)}%</td>
                </tr>
            `;
        });

        return `
            <div style="padding: 20px;">
                <h3>Last 30 Days Summary</h3>
                <div style="display: flex; gap: 30px; margin-bottom: 20px;">
                    <div style="text-align: center;">
                        <div style="font-size: 32px; font-weight: bold;">${analytics.totalInputBF.toFixed(0)}</div>
                        <div style="color: #666;">Total Input BF</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 32px; font-weight: bold; color: #28a745;">${analytics.totalOutputBF.toFixed(0)}</div>
                        <div style="color: #666;">Total Output BF</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 32px; font-weight: bold; color: #dc3545;">${analytics.totalWasteBF.toFixed(0)}</div>
                        <div style="color: #666;">Total Waste BF</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 32px; font-weight: bold; color: ${analytics.avgYield >= 85 ? '#28a745' : '#ffc107'};">${analytics.avgYield.toFixed(1)}%</div>
                        <div style="color: #666;">Average Yield</div>
                    </div>
                </div>

                <h3>By Repack Type</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f5f5f5;">
                            <th style="padding: 10px; text-align: left;">Type</th>
                            <th style="padding: 10px; text-align: center;">Orders</th>
                            <th style="padding: 10px; text-align: right;">Input BF</th>
                            <th style="padding: 10px; text-align: right;">Output BF</th>
                            <th style="padding: 10px; text-align: right;">Avg Yield</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${typeRows || '<tr><td colspan="5" style="text-align: center; padding: 20px;">No data available</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Builds repack summary HTML for completion page
     *
     * @param {Record} repackRec - Repack record
     * @returns {string} HTML content
     */
    function buildRepackSummaryHtml(repackRec) {
        const repackNumber = repackRec.getValue({ fieldId: 'custrecord_cls_repack_number' });
        const repackType = repackRec.getText({ fieldId: 'custrecord_cls_repack_type' });
        const inputBF = parseFloat(repackRec.getValue({ fieldId: 'custrecord_cls_repack_input_bf' })) || 0;
        const inputPieces = parseInt(repackRec.getValue({ fieldId: 'custrecord_cls_repack_input_pieces' }), 10) || 0;
        const sourceTally = repackRec.getText({ fieldId: 'custrecord_cls_repack_source_tally' });

        return `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; padding: 15px; background: #e9ecef; border-radius: 8px;">
                <div>
                    <div style="color: #666; font-size: 11px;">Repack Number</div>
                    <div style="font-weight: bold;">${repackNumber}</div>
                </div>
                <div>
                    <div style="color: #666; font-size: 11px;">Type</div>
                    <div style="font-weight: bold;">${repackType}</div>
                </div>
                <div>
                    <div style="color: #666; font-size: 11px;">Source Tally</div>
                    <div style="font-weight: bold;">${sourceTally || 'N/A'}</div>
                </div>
                <div>
                    <div style="color: #666; font-size: 11px;">Input</div>
                    <div style="font-weight: bold;">${inputBF.toFixed(2)} BF / ${inputPieces} pcs</div>
                </div>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE EXPORTS
    // ═══════════════════════════════════════════════════════════════════════

    return {
        onRequest: onRequest
    };
});
