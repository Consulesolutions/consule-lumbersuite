/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @file cls_tally_allocation_sl.js
 * @description Tally Allocation Suitelet for Consule LumberSuite™
 *              Provides FIFO allocation, tally search, and allocation management
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module tally/cls_tally_allocation_sl
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/record',
    'N/runtime',
    'N/url',
    'N/redirect',
    'N/log',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_tally_service',
    '../lib/cls_logger'
], function(
    serverWidget,
    search,
    record,
    runtime,
    url,
    redirect,
    log,
    Constants,
    SettingsDAO,
    TallyService,
    Logger
) {
    'use strict';

    /**
     * Module-level logger instance
     * @type {Object}
     */
    const logger = Logger.createLogger('CLS_TallyAllocation_SL');

    /**
     * Allocation methods
     * @type {Object}
     */
    const ALLOCATION_METHODS = {
        FIFO: 'fifo',
        LIFO: 'lifo',
        MANUAL: 'manual',
        SPECIFIC: 'specific'
    };

    /**
     * Main entry point
     *
     * @param {Object} context - Suitelet context
     */
    function onRequest(context) {
        const startTime = Date.now();

        try {
            const action = context.request.parameters.action || 'search';

            if (context.request.method === 'GET') {
                switch (action) {
                    case 'search':
                        renderSearchPage(context);
                        break;
                    case 'allocate':
                        renderAllocationPage(context);
                        break;
                    case 'split':
                        renderSplitPage(context);
                        break;
                    case 'history':
                        renderHistoryPage(context);
                        break;
                    default:
                        renderSearchPage(context);
                }
            } else {
                handlePostRequest(context);
            }

            logger.debug('onRequest', `Completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('onRequest', `Error: ${e.message}`, { stack: e.stack });
            context.response.write(`<html><body><h1>Error</h1><p>${e.message}</p></body></html>`);
        }
    }

    /**
     * Renders the tally search page
     *
     * @param {Object} context - Suitelet context
     */
    function renderSearchPage(context) {
        const form = serverWidget.createForm({
            title: 'LumberSuite™ Tally Allocation'
        });

        const params = context.request.parameters;

        // Add navigation tabs
        addNavigationTabs(form, 'search');

        // Add filter section
        addSearchFilters(form, params);

        // Add search results
        if (params.search === 'true') {
            addSearchResults(form, params);
        }

        form.addSubmitButton({ label: 'Search Tallies' });

        form.addField({
            id: 'custpage_search',
            type: serverWidget.FieldType.TEXT,
            label: ' '
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = 'true';

        form.clientScriptModulePath = './cls_tally_allocation_cs.js';

        context.response.writePage(form);
    }

    /**
     * Adds navigation tabs
     *
     * @param {Form} form - Server widget form
     * @param {string} activeTab - Currently active tab
     */
    function addNavigationTabs(form, activeTab) {
        const scriptUrl = url.resolveScript({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId
        });

        const tabs = [
            { id: 'search', label: 'Search Tallies', action: 'search' },
            { id: 'allocate', label: 'Allocate', action: 'allocate' },
            { id: 'history', label: 'Allocation History', action: 'history' }
        ];

        let navHtml = '<div style="margin-bottom:20px; display:flex; gap:10px;">';

        for (const tab of tabs) {
            const isActive = tab.id === activeTab;
            const bgColor = isActive ? '#607799' : '#f0f0f0';
            const textColor = isActive ? '#fff' : '#333';

            navHtml += `<a href="${scriptUrl}&action=${tab.action}" style="text-decoration:none;">`;
            navHtml += `<div style="padding:10px 20px; background:${bgColor}; color:${textColor}; border-radius:4px;">`;
            navHtml += `${tab.label}</div></a>`;
        }

        navHtml += '</div>';

        const navField = form.addField({
            id: 'custpage_nav',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        navField.defaultValue = navHtml;
    }

    /**
     * Adds search filter fields
     *
     * @param {Form} form - Server widget form
     * @param {Object} params - Request parameters
     */
    function addSearchFilters(form, params) {
        const filterGroup = form.addFieldGroup({
            id: 'custpage_filters',
            label: 'Search Filters'
        });

        // Item filter
        const itemField = form.addField({
            id: 'custpage_item',
            type: serverWidget.FieldType.SELECT,
            label: 'Item',
            source: 'item',
            container: 'custpage_filters'
        });
        itemField.addSelectOption({ value: '', text: '- Any Item -' });
        if (params.custpage_item) {
            itemField.defaultValue = params.custpage_item;
        }

        // Location filter
        const locationField = form.addField({
            id: 'custpage_location',
            type: serverWidget.FieldType.SELECT,
            label: 'Location',
            source: 'location',
            container: 'custpage_filters'
        });
        locationField.addSelectOption({ value: '', text: '- Any Location -' });
        if (params.custpage_location) {
            locationField.defaultValue = params.custpage_location;
        }

        // Status filter
        const statusField = form.addField({
            id: 'custpage_status',
            type: serverWidget.FieldType.SELECT,
            label: 'Status',
            container: 'custpage_filters'
        });
        statusField.addSelectOption({ value: '', text: '- Any Status -' });
        statusField.addSelectOption({ value: 'active', text: 'Active' });
        statusField.addSelectOption({ value: 'partial', text: 'Partial' });
        statusField.addSelectOption({ value: 'draft', text: 'Draft' });
        if (params.custpage_status) {
            statusField.defaultValue = params.custpage_status;
        }

        // Minimum BF filter
        const minBFField = form.addField({
            id: 'custpage_min_bf',
            type: serverWidget.FieldType.FLOAT,
            label: 'Min Remaining BF',
            container: 'custpage_filters'
        });
        if (params.custpage_min_bf) {
            minBFField.defaultValue = params.custpage_min_bf;
        }

        // Show only available
        const availableField = form.addField({
            id: 'custpage_available_only',
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Show Only Available for Allocation',
            container: 'custpage_filters'
        });
        if (params.custpage_available_only === 'T') {
            availableField.defaultValue = 'T';
        }
    }

    /**
     * Adds search results to the form
     *
     * @param {Form} form - Server widget form
     * @param {Object} params - Filter parameters
     */
    function addSearchResults(form, params) {
        const resultsGroup = form.addFieldGroup({
            id: 'custpage_results',
            label: 'Search Results'
        });

        const tallies = searchTallies(params);

        // Summary
        let summaryHtml = `<div style="margin-bottom:15px; padding:10px; background:#f5f5f5; border-radius:4px;">`;
        summaryHtml += `<strong>Found ${tallies.length} tallies</strong>`;
        if (tallies.length > 0) {
            const totalBF = tallies.reduce((sum, t) => sum + t.remainingBF, 0);
            summaryHtml += ` | Total Available: ${totalBF.toFixed(2)} BF`;
        }
        summaryHtml += '</div>';

        // Results table
        let tableHtml = '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
        tableHtml += '<tr style="background:#607799; color:#fff;">';
        tableHtml += '<th style="padding:8px; text-align:center;"><input type="checkbox" id="selectAll" onclick="toggleSelectAll()"></th>';
        tableHtml += '<th style="padding:8px; text-align:left;">Tally #</th>';
        tableHtml += '<th style="padding:8px; text-align:left;">Item</th>';
        tableHtml += '<th style="padding:8px; text-align:left;">Dimensions</th>';
        tableHtml += '<th style="padding:8px; text-align:left;">Location</th>';
        tableHtml += '<th style="padding:8px; text-align:right;">Orig BF</th>';
        tableHtml += '<th style="padding:8px; text-align:right;">Remaining BF</th>';
        tableHtml += '<th style="padding:8px; text-align:center;">Status</th>';
        tableHtml += '<th style="padding:8px; text-align:left;">Date</th>';
        tableHtml += '<th style="padding:8px; text-align:center;">Actions</th>';
        tableHtml += '</tr>';

        if (tallies.length === 0) {
            tableHtml += '<tr><td colspan="10" style="padding:20px; text-align:center; color:#666;">No tallies found matching the criteria.</td></tr>';
        } else {
            for (let i = 0; i < tallies.length; i++) {
                const tally = tallies[i];
                const bgColor = i % 2 === 0 ? '#fff' : '#f9f9f9';
                const statusColor = getStatusColor(tally.status);

                const viewUrl = url.resolveRecord({
                    recordType: Constants.RECORD_TYPES.TALLY_SHEET,
                    recordId: tally.id
                });

                const allocateUrl = url.resolveScript({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    params: { action: 'allocate', tallyId: tally.id }
                });

                tableHtml += `<tr style="background:${bgColor};">`;
                tableHtml += `<td style="padding:8px; text-align:center; border-bottom:1px solid #eee;">`;
                tableHtml += `<input type="checkbox" name="tally_${tally.id}" value="${tally.id}" class="tallyCheckbox">`;
                tableHtml += `</td>`;
                tableHtml += `<td style="padding:8px; border-bottom:1px solid #eee;"><a href="${viewUrl}" target="_blank">${tally.tallyNumber}</a></td>`;
                tableHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${tally.itemName}</td>`;
                tableHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${tally.thickness}" x ${tally.width}" x ${tally.length}'</td>`;
                tableHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${tally.locationName}</td>`;
                tableHtml += `<td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">${tally.originalBF.toFixed(2)}</td>`;
                tableHtml += `<td style="padding:8px; text-align:right; border-bottom:1px solid #eee; font-weight:bold;">${tally.remainingBF.toFixed(2)}</td>`;
                tableHtml += `<td style="padding:8px; text-align:center; border-bottom:1px solid #eee;"><span style="color:${statusColor};">${tally.status}</span></td>`;
                tableHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${tally.date}</td>`;
                tableHtml += `<td style="padding:8px; text-align:center; border-bottom:1px solid #eee;">`;
                tableHtml += `<a href="${allocateUrl}" style="color:#607799;">Allocate</a>`;
                tableHtml += `</td>`;
                tableHtml += '</tr>';
            }
        }

        tableHtml += '</table>';

        const resultsField = form.addField({
            id: 'custpage_results_display',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' ',
            container: 'custpage_results'
        });
        resultsField.defaultValue = summaryHtml + tableHtml;
    }

    /**
     * Searches for tallies based on filters
     *
     * @param {Object} params - Filter parameters
     * @returns {Array} Array of tally objects
     */
    function searchTallies(params) {
        const tallies = [];

        try {
            const filters = [];

            if (params.custpage_item) {
                filters.push([Constants.TALLY_FIELDS.ITEM, 'is', params.custpage_item]);
            }

            if (params.custpage_location) {
                if (filters.length > 0) filters.push('AND');
                filters.push([Constants.TALLY_FIELDS.LOCATION, 'is', params.custpage_location]);
            }

            if (params.custpage_status) {
                if (filters.length > 0) filters.push('AND');
                filters.push([Constants.TALLY_FIELDS.STATUS, 'is', params.custpage_status]);
            }

            if (params.custpage_min_bf) {
                if (filters.length > 0) filters.push('AND');
                filters.push([Constants.TALLY_FIELDS.REMAINING_BF, 'greaterthanorequalto', params.custpage_min_bf]);
            }

            if (params.custpage_available_only === 'T') {
                if (filters.length > 0) filters.push('AND');
                filters.push([Constants.TALLY_FIELDS.STATUS, 'anyof', ['active', 'partial']]);
                if (filters.length > 0) filters.push('AND');
                filters.push([Constants.TALLY_FIELDS.REMAINING_BF, 'greaterthan', 0]);
            }

            const tallySearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_SHEET,
                filters: filters.length > 0 ? filters : [],
                columns: [
                    search.createColumn({ name: Constants.TALLY_FIELDS.TALLY_NUMBER }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.ITEM }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.THICKNESS }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.WIDTH }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.LENGTH }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.LOCATION }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.ORIGINAL_BF }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.REMAINING_BF }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.STATUS }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.TALLY_DATE, sort: search.Sort.DESC })
                ]
            });

            tallySearch.run().each(function(result) {
                tallies.push({
                    id: result.id,
                    tallyNumber: result.getValue({ name: Constants.TALLY_FIELDS.TALLY_NUMBER }),
                    itemId: result.getValue({ name: Constants.TALLY_FIELDS.ITEM }),
                    itemName: result.getText({ name: Constants.TALLY_FIELDS.ITEM }),
                    thickness: parseFloat(result.getValue({ name: Constants.TALLY_FIELDS.THICKNESS })) || 0,
                    width: parseFloat(result.getValue({ name: Constants.TALLY_FIELDS.WIDTH })) || 0,
                    length: parseFloat(result.getValue({ name: Constants.TALLY_FIELDS.LENGTH })) || 0,
                    locationId: result.getValue({ name: Constants.TALLY_FIELDS.LOCATION }),
                    locationName: result.getText({ name: Constants.TALLY_FIELDS.LOCATION }),
                    originalBF: parseFloat(result.getValue({ name: Constants.TALLY_FIELDS.ORIGINAL_BF })) || 0,
                    remainingBF: parseFloat(result.getValue({ name: Constants.TALLY_FIELDS.REMAINING_BF })) || 0,
                    status: result.getValue({ name: Constants.TALLY_FIELDS.STATUS }),
                    date: result.getValue({ name: Constants.TALLY_FIELDS.TALLY_DATE })
                });

                return tallies.length < 100; // Limit results
            });

        } catch (e) {
            logger.error('searchTallies', `Error: ${e.message}`);
        }

        return tallies;
    }

    /**
     * Renders the allocation page
     *
     * @param {Object} context - Suitelet context
     */
    function renderAllocationPage(context) {
        const form = serverWidget.createForm({
            title: 'LumberSuite™ Tally Allocation'
        });

        addNavigationTabs(form, 'allocate');

        const params = context.request.parameters;
        const tallyId = params.tallyId;

        if (tallyId) {
            addSpecificTallyAllocation(form, tallyId);
        } else {
            addFIFOAllocationForm(form, params);
        }

        form.clientScriptModulePath = './cls_tally_allocation_cs.js';

        context.response.writePage(form);
    }

    /**
     * Adds specific tally allocation form
     *
     * @param {Form} form - Server widget form
     * @param {string} tallyId - Tally sheet ID
     */
    function addSpecificTallyAllocation(form, tallyId) {
        try {
            const tally = getTallyDetails(tallyId);

            if (!tally) {
                throw new Error('Tally not found');
            }

            // Tally details
            let detailsHtml = '<div style="padding:15px; background:#f8f9fa; border-radius:4px; margin-bottom:20px;">';
            detailsHtml += `<h3 style="margin:0 0 15px 0;">Allocating from: ${tally.tallyNumber}</h3>`;
            detailsHtml += '<table style="width:100%;">';
            detailsHtml += `<tr><td style="width:150px;"><strong>Item:</strong></td><td>${tally.itemName}</td></tr>`;
            detailsHtml += `<tr><td><strong>Dimensions:</strong></td><td>${tally.thickness}" x ${tally.width}" x ${tally.length}'</td></tr>`;
            detailsHtml += `<tr><td><strong>Location:</strong></td><td>${tally.locationName}</td></tr>`;
            detailsHtml += `<tr><td><strong>BF per Piece:</strong></td><td>${tally.bfPerPiece.toFixed(4)}</td></tr>`;
            detailsHtml += `<tr><td><strong>Remaining:</strong></td><td><strong style="color:#28a745;">${tally.remainingBF.toFixed(2)} BF (${tally.remainingPieces} pcs)</strong></td></tr>`;
            detailsHtml += '</table>';
            detailsHtml += '</div>';

            const detailsField = form.addField({
                id: 'custpage_tally_details',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            detailsField.defaultValue = detailsHtml;

            // Allocation form
            const allocGroup = form.addFieldGroup({
                id: 'custpage_allocation',
                label: 'Create Allocation'
            });

            form.addField({
                id: 'custpage_tally_id',
                type: serverWidget.FieldType.TEXT,
                label: 'Tally ID',
                container: 'custpage_allocation'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = tallyId;

            const tranField = form.addField({
                id: 'custpage_transaction',
                type: serverWidget.FieldType.SELECT,
                label: 'Target Transaction',
                source: 'transaction',
                container: 'custpage_allocation'
            });
            tranField.isMandatory = true;

            const qtyField = form.addField({
                id: 'custpage_quantity',
                type: serverWidget.FieldType.INTEGER,
                label: 'Pieces to Allocate',
                container: 'custpage_allocation'
            });
            qtyField.isMandatory = true;

            const bfField = form.addField({
                id: 'custpage_bf',
                type: serverWidget.FieldType.FLOAT,
                label: 'BF to Allocate (calculated)',
                container: 'custpage_allocation'
            });
            bfField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

            const notesField = form.addField({
                id: 'custpage_notes',
                type: serverWidget.FieldType.TEXTAREA,
                label: 'Notes',
                container: 'custpage_allocation'
            });

            form.addField({
                id: 'custpage_action_type',
                type: serverWidget.FieldType.TEXT,
                label: ' '
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = 'allocate_specific';

            form.addSubmitButton({ label: 'Create Allocation' });

        } catch (e) {
            logger.error('addSpecificTallyAllocation', `Error: ${e.message}`);

            const errorField = form.addField({
                id: 'custpage_error',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            errorField.defaultValue = `<div style="padding:20px; background:#f8d7da; color:#721c24; border-radius:4px;">Error: ${e.message}</div>`;
        }
    }

    /**
     * Gets tally details
     *
     * @param {string} tallyId - Tally sheet ID
     * @returns {Object|null} Tally details
     */
    function getTallyDetails(tallyId) {
        try {
            const tallyRec = record.load({
                type: Constants.RECORD_TYPES.TALLY_SHEET,
                id: tallyId
            });

            return {
                id: tallyId,
                tallyNumber: tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.TALLY_NUMBER }),
                itemId: tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.ITEM }),
                itemName: tallyRec.getText({ fieldId: Constants.TALLY_FIELDS.ITEM }),
                thickness: parseFloat(tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.THICKNESS })) || 0,
                width: parseFloat(tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.WIDTH })) || 0,
                length: parseFloat(tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.LENGTH })) || 0,
                locationId: tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.LOCATION }),
                locationName: tallyRec.getText({ fieldId: Constants.TALLY_FIELDS.LOCATION }),
                bfPerPiece: parseFloat(tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.BF_PER_PIECE })) || 0,
                remainingBF: parseFloat(tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.REMAINING_BF })) || 0,
                remainingPieces: parseFloat(tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.REMAINING_PIECES })) || 0,
                status: tallyRec.getValue({ fieldId: Constants.TALLY_FIELDS.STATUS })
            };
        } catch (e) {
            logger.error('getTallyDetails', `Error: ${e.message}`);
            return null;
        }
    }

    /**
     * Adds FIFO allocation form
     *
     * @param {Form} form - Server widget form
     * @param {Object} params - Request parameters
     */
    function addFIFOAllocationForm(form, params) {
        const allocGroup = form.addFieldGroup({
            id: 'custpage_fifo_allocation',
            label: 'FIFO Allocation'
        });

        let introHtml = '<div style="padding:15px; background:#e3f2fd; border-radius:4px; margin-bottom:20px;">';
        introHtml += '<strong>FIFO Allocation</strong><br>';
        introHtml += 'Enter the item, location, and required BF. The system will automatically allocate from the oldest available tallies first.';
        introHtml += '</div>';

        const introField = form.addField({
            id: 'custpage_fifo_intro',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        introField.defaultValue = introHtml;

        const itemField = form.addField({
            id: 'custpage_fifo_item',
            type: serverWidget.FieldType.SELECT,
            label: 'Item',
            source: 'item',
            container: 'custpage_fifo_allocation'
        });
        itemField.isMandatory = true;

        const locationField = form.addField({
            id: 'custpage_fifo_location',
            type: serverWidget.FieldType.SELECT,
            label: 'Location',
            source: 'location',
            container: 'custpage_fifo_allocation'
        });
        locationField.isMandatory = true;

        const bfField = form.addField({
            id: 'custpage_fifo_bf',
            type: serverWidget.FieldType.FLOAT,
            label: 'Required BF',
            container: 'custpage_fifo_allocation'
        });
        bfField.isMandatory = true;

        const tranField = form.addField({
            id: 'custpage_fifo_transaction',
            type: serverWidget.FieldType.SELECT,
            label: 'Target Transaction',
            source: 'transaction',
            container: 'custpage_fifo_allocation'
        });
        tranField.isMandatory = true;

        form.addField({
            id: 'custpage_action_type',
            type: serverWidget.FieldType.TEXT,
            label: ' '
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = 'allocate_fifo';

        form.addSubmitButton({ label: 'Process FIFO Allocation' });

        // Preview button
        form.addButton({
            id: 'custpage_preview',
            label: 'Preview Allocation',
            functionName: 'previewFIFO'
        });
    }

    /**
     * Renders the allocation history page
     *
     * @param {Object} context - Suitelet context
     */
    function renderHistoryPage(context) {
        const form = serverWidget.createForm({
            title: 'LumberSuite™ Allocation History'
        });

        addNavigationTabs(form, 'history');

        const params = context.request.parameters;

        // Add filters
        addHistoryFilters(form, params);

        // Add history results
        addHistoryResults(form, params);

        form.addSubmitButton({ label: 'Search History' });

        form.clientScriptModulePath = './cls_tally_allocation_cs.js';

        context.response.writePage(form);
    }

    /**
     * Adds history filter fields
     *
     * @param {Form} form - Server widget form
     * @param {Object} params - Request parameters
     */
    function addHistoryFilters(form, params) {
        const filterGroup = form.addFieldGroup({
            id: 'custpage_history_filters',
            label: 'Filters'
        });

        const dateFromField = form.addField({
            id: 'custpage_date_from',
            type: serverWidget.FieldType.DATE,
            label: 'Date From',
            container: 'custpage_history_filters'
        });

        const dateToField = form.addField({
            id: 'custpage_date_to',
            type: serverWidget.FieldType.DATE,
            label: 'Date To',
            container: 'custpage_history_filters'
        });

        const tallyField = form.addField({
            id: 'custpage_history_tally',
            type: serverWidget.FieldType.SELECT,
            label: 'Tally Sheet',
            source: Constants.RECORD_TYPES.TALLY_SHEET,
            container: 'custpage_history_filters'
        });
        tallyField.addSelectOption({ value: '', text: '- Any Tally -' });

        const statusField = form.addField({
            id: 'custpage_history_status',
            type: serverWidget.FieldType.SELECT,
            label: 'Allocation Status',
            container: 'custpage_history_filters'
        });
        statusField.addSelectOption({ value: '', text: '- Any Status -' });
        statusField.addSelectOption({ value: 'available', text: 'Available' });
        statusField.addSelectOption({ value: 'allocated', text: 'Allocated' });
        statusField.addSelectOption({ value: 'consumed', text: 'Consumed' });
        statusField.addSelectOption({ value: 'reversed', text: 'Reversed' });
    }

    /**
     * Adds history results
     *
     * @param {Form} form - Server widget form
     * @param {Object} params - Filter parameters
     */
    function addHistoryResults(form, params) {
        const allocations = getAllocationHistory(params);

        let tableHtml = '<table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:20px;">';
        tableHtml += '<tr style="background:#607799; color:#fff;">';
        tableHtml += '<th style="padding:8px; text-align:left;">Date</th>';
        tableHtml += '<th style="padding:8px; text-align:left;">Tally #</th>';
        tableHtml += '<th style="padding:8px; text-align:left;">Item</th>';
        tableHtml += '<th style="padding:8px; text-align:left;">Transaction</th>';
        tableHtml += '<th style="padding:8px; text-align:right;">Quantity</th>';
        tableHtml += '<th style="padding:8px; text-align:right;">BF</th>';
        tableHtml += '<th style="padding:8px; text-align:center;">Status</th>';
        tableHtml += '<th style="padding:8px; text-align:left;">User</th>';
        tableHtml += '</tr>';

        if (allocations.length === 0) {
            tableHtml += '<tr><td colspan="8" style="padding:20px; text-align:center; color:#666;">No allocation history found.</td></tr>';
        } else {
            for (let i = 0; i < allocations.length; i++) {
                const alloc = allocations[i];
                const bgColor = i % 2 === 0 ? '#fff' : '#f9f9f9';
                const statusColor = getStatusColor(alloc.status);

                tableHtml += `<tr style="background:${bgColor};">`;
                tableHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${alloc.date}</td>`;
                tableHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${alloc.tallyNumber}</td>`;
                tableHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${alloc.itemName}</td>`;
                tableHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${alloc.transactionName}</td>`;
                tableHtml += `<td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">${alloc.quantity}</td>`;
                tableHtml += `<td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">${alloc.boardFeet.toFixed(2)}</td>`;
                tableHtml += `<td style="padding:8px; text-align:center; border-bottom:1px solid #eee;"><span style="color:${statusColor};">${alloc.status}</span></td>`;
                tableHtml += `<td style="padding:8px; border-bottom:1px solid #eee;">${alloc.userName}</td>`;
                tableHtml += '</tr>';
            }
        }

        tableHtml += '</table>';

        const historyField = form.addField({
            id: 'custpage_history_results',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        historyField.defaultValue = tableHtml;
    }

    /**
     * Gets allocation history
     *
     * @param {Object} params - Filter parameters
     * @returns {Array} Allocation history
     */
    function getAllocationHistory(params) {
        const allocations = [];

        try {
            const filters = [];

            if (params.custpage_date_from) {
                filters.push([Constants.ALLOCATION_FIELDS.ALLOCATION_DATE, 'onorafter', params.custpage_date_from]);
            }

            if (params.custpage_date_to) {
                if (filters.length > 0) filters.push('AND');
                filters.push([Constants.ALLOCATION_FIELDS.ALLOCATION_DATE, 'onorbefore', params.custpage_date_to]);
            }

            if (params.custpage_history_tally) {
                if (filters.length > 0) filters.push('AND');
                filters.push([Constants.TALLY_FIELDS.TALLY_SHEET, 'is', params.custpage_history_tally]);
            }

            if (params.custpage_history_status) {
                if (filters.length > 0) filters.push('AND');
                filters.push([Constants.ALLOCATION_FIELDS.STATUS, 'is', params.custpage_history_status]);
            }

            const allocSearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_ALLOCATION,
                filters: filters.length > 0 ? filters : [],
                columns: [
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.ALLOCATION_DATE, sort: search.Sort.DESC }),
                    search.createColumn({ name: Constants.TALLY_FIELDS.TALLY_SHEET }),
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.SOURCE_TRANSACTION }),
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.QUANTITY }),
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.BOARD_FEET }),
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.STATUS }),
                    search.createColumn({ name: Constants.ALLOCATION_FIELDS.CREATED_BY })
                ]
            });

            allocSearch.run().each(function(result) {
                allocations.push({
                    id: result.id,
                    date: result.getValue({ name: Constants.ALLOCATION_FIELDS.ALLOCATION_DATE }),
                    tallyId: result.getValue({ name: Constants.TALLY_FIELDS.TALLY_SHEET }),
                    tallyNumber: result.getText({ name: Constants.TALLY_FIELDS.TALLY_SHEET }),
                    itemName: 'N/A', // Would need join
                    transactionId: result.getValue({ name: Constants.ALLOCATION_FIELDS.SOURCE_TRANSACTION }),
                    transactionName: result.getText({ name: Constants.ALLOCATION_FIELDS.SOURCE_TRANSACTION }) || 'N/A',
                    quantity: parseFloat(result.getValue({ name: Constants.ALLOCATION_FIELDS.QUANTITY })) || 0,
                    boardFeet: parseFloat(result.getValue({ name: Constants.ALLOCATION_FIELDS.BOARD_FEET })) || 0,
                    status: result.getValue({ name: Constants.ALLOCATION_FIELDS.STATUS }),
                    userName: result.getText({ name: Constants.ALLOCATION_FIELDS.CREATED_BY }) || 'System'
                });

                return allocations.length < 100;
            });

        } catch (e) {
            logger.error('getAllocationHistory', `Error: ${e.message}`);
        }

        return allocations;
    }

    /**
     * Handles POST requests
     *
     * @param {Object} context - Suitelet context
     */
    function handlePostRequest(context) {
        const params = context.request.parameters;
        const actionType = params.custpage_action_type;

        try {
            switch (actionType) {
                case 'allocate_specific':
                    processSpecificAllocation(params);
                    break;

                case 'allocate_fifo':
                    processFIFOAllocation(params);
                    break;

                default:
                    // Regular search - redirect back
                    break;
            }

            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: { action: 'search', msg: 'success' }
            });

        } catch (e) {
            logger.error('handlePostRequest', `Error: ${e.message}`);

            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: { action: 'search', msg: 'error', error: e.message }
            });
        }
    }

    /**
     * Processes specific tally allocation
     *
     * @param {Object} params - Form parameters
     */
    function processSpecificAllocation(params) {
        const tallyId = params.custpage_tally_id;
        const transactionId = params.custpage_transaction;
        const quantity = parseInt(params.custpage_quantity) || 0;
        const notes = params.custpage_notes || '';

        if (!tallyId || !transactionId || quantity <= 0) {
            throw new Error('Missing required allocation parameters');
        }

        TallyService.createAllocation({
            tallyId: tallyId,
            transactionId: transactionId,
            quantity: quantity,
            notes: notes
        });

        logger.audit('processSpecificAllocation', `Allocated ${quantity} pieces from tally ${tallyId} to transaction ${transactionId}`);
    }

    /**
     * Processes FIFO allocation
     *
     * @param {Object} params - Form parameters
     */
    function processFIFOAllocation(params) {
        const itemId = params.custpage_fifo_item;
        const locationId = params.custpage_fifo_location;
        const requiredBF = parseFloat(params.custpage_fifo_bf) || 0;
        const transactionId = params.custpage_fifo_transaction;

        if (!itemId || !locationId || requiredBF <= 0 || !transactionId) {
            throw new Error('Missing required FIFO allocation parameters');
        }

        const result = TallyService.allocateFIFO({
            itemId: itemId,
            locationId: locationId,
            requiredBF: requiredBF,
            transactionId: transactionId
        });

        logger.audit('processFIFOAllocation', `FIFO allocated ${result.allocatedBF} BF from ${result.talliesUsed} tallies`);
    }

    /**
     * Gets status color
     *
     * @param {string} status - Status value
     * @returns {string} Color code
     */
    function getStatusColor(status) {
        const colors = {
            'draft': '#6c757d',
            'active': '#28a745',
            'partial': '#ffc107',
            'consumed': '#dc3545',
            'closed': '#6c757d',
            'void': '#c2185b',
            'available': '#28a745',
            'allocated': '#17a2b8',
            'reversed': '#dc3545'
        };

        return colors[status] || '#333';
    }

    /**
     * Renders the split page
     *
     * @param {Object} context - Suitelet context
     */
    function renderSplitPage(context) {
        const form = serverWidget.createForm({
            title: 'LumberSuite™ Split Tally'
        });

        // Split functionality would be implemented here
        // This allows users to split one tally into multiple tallies

        form.addField({
            id: 'custpage_split_info',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        }).defaultValue = '<div style="padding:20px; text-align:center; color:#666;">Split functionality coming soon.</div>';

        context.response.writePage(form);
    }

    return {
        onRequest: onRequest
    };
});
