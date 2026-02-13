/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * @file cls_report_export_rl.js
 * @description Report Export RESTlet for Consule LumberSuite™
 *              API endpoint for exporting report data in various formats
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module reporting/cls_report_export_rl
 */

define([
    'N/search',
    'N/record',
    'N/runtime',
    'N/format',
    'N/file',
    '../lib/cls_settings_dao',
    '../lib/cls_constants'
], function(
    search,
    record,
    runtime,
    format,
    file,
    settingsDAO,
    constants
) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    const DATA_TYPES = {
        PRODUCTION: 'production',
        YIELD: 'yield',
        INVENTORY: 'inventory',
        TALLIES: 'tallies',
        REPACKS: 'repacks',
        ALLOCATIONS: 'allocations',
        SALES: 'sales',
        WORK_ORDERS: 'workorders',
        KPI: 'kpi'
    };

    const OUTPUT_FORMATS = {
        JSON: 'json',
        CSV: 'csv',
        SUMMARY: 'summary'
    };

    // ═══════════════════════════════════════════════════════════════════════
    // GET - Retrieve Data
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * GET Entry Point
     *
     * @param {Object} params - Request parameters
     * @returns {Object|string} Response data
     */
    function get(params) {
        try {
            validateRequest(params);

            const dataType = params.type;
            const outputFormat = params.format || OUTPUT_FORMATS.JSON;
            const options = parseOptions(params);

            log.debug({
                title: 'Export Request',
                details: `Type: ${dataType}, Format: ${outputFormat}`
            });

            let data;

            switch (dataType) {
                case DATA_TYPES.PRODUCTION:
                    data = getProductionData(options);
                    break;

                case DATA_TYPES.YIELD:
                    data = getYieldData(options);
                    break;

                case DATA_TYPES.INVENTORY:
                    data = getInventoryData(options);
                    break;

                case DATA_TYPES.TALLIES:
                    data = getTallyData(options);
                    break;

                case DATA_TYPES.REPACKS:
                    data = getRepackData(options);
                    break;

                case DATA_TYPES.ALLOCATIONS:
                    data = getAllocationData(options);
                    break;

                case DATA_TYPES.SALES:
                    data = getSalesData(options);
                    break;

                case DATA_TYPES.WORK_ORDERS:
                    data = getWorkOrderData(options);
                    break;

                case DATA_TYPES.KPI:
                    data = getKPIData(options);
                    break;

                default:
                    return createErrorResponse('Unknown data type: ' + dataType);
            }

            return formatOutput(data, outputFormat);

        } catch (error) {
            log.error({
                title: 'Export Error',
                details: error.message
            });
            return createErrorResponse(error.message);
        }
    }

    /**
     * Validates request parameters
     *
     * @param {Object} params - Request parameters
     */
    function validateRequest(params) {
        if (!params.type) {
            throw new Error('Missing required parameter: type');
        }

        if (!Object.values(DATA_TYPES).includes(params.type)) {
            throw new Error('Invalid data type: ' + params.type);
        }
    }

    /**
     * Parses options from request parameters
     *
     * @param {Object} params - Request parameters
     * @returns {Object} Parsed options
     */
    function parseOptions(params) {
        return {
            dateFrom: params.dateFrom || null,
            dateTo: params.dateTo || null,
            dateRange: params.dateRange || 'thismonth',
            location: params.location || null,
            item: params.item || null,
            operator: params.operator || null,
            status: params.status || null,
            limit: parseInt(params.limit, 10) || 1000,
            offset: parseInt(params.offset, 10) || 0,
            groupBy: params.groupBy || null,
            sortBy: params.sortBy || null,
            sortDir: params.sortDir || 'asc'
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DATA RETRIEVERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Gets production data
     *
     * @param {Object} options - Query options
     * @returns {Object} Production data
     */
    function getProductionData(options) {
        const result = {
            type: DATA_TYPES.PRODUCTION,
            timestamp: new Date().toISOString(),
            count: 0,
            records: []
        };

        try {
            const filters = buildDateFilters('custrecord_cls_yield_date', options);

            if (options.location) {
                filters.push('AND', ['custrecord_cls_yield_location', 'anyof', options.location]);
            }

            if (options.item) {
                filters.push('AND', ['custrecord_cls_yield_item', 'anyof', options.item]);
            }

            const columns = [
                search.createColumn({ name: 'custrecord_cls_yield_date', sort: search.Sort.DESC }),
                'custrecord_cls_yield_source_type',
                'custrecord_cls_yield_source_ref',
                'custrecord_cls_yield_item',
                'custrecord_cls_yield_operation',
                'custrecord_cls_yield_input_bf',
                'custrecord_cls_yield_output_bf',
                'custrecord_cls_yield_waste_bf',
                'custrecord_cls_yield_percentage',
                'custrecord_cls_yield_operator',
                'custrecord_cls_yield_location'
            ];

            const prodSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: filters,
                columns: columns
            });

            const pagedResults = prodSearch.runPaged({ pageSize: 1000 });

            pagedResults.pageRanges.forEach(pageRange => {
                if (result.records.length >= options.limit) return;

                const page = pagedResults.fetch({ index: pageRange.index });
                page.data.forEach(searchResult => {
                    if (result.records.length >= options.limit) return;

                    result.records.push({
                        id: searchResult.id,
                        date: searchResult.getValue('custrecord_cls_yield_date'),
                        sourceType: searchResult.getValue('custrecord_cls_yield_source_type'),
                        sourceRef: searchResult.getValue('custrecord_cls_yield_source_ref'),
                        item: searchResult.getText('custrecord_cls_yield_item'),
                        itemId: searchResult.getValue('custrecord_cls_yield_item'),
                        operation: searchResult.getValue('custrecord_cls_yield_operation'),
                        inputBF: parseFloat(searchResult.getValue('custrecord_cls_yield_input_bf')) || 0,
                        outputBF: parseFloat(searchResult.getValue('custrecord_cls_yield_output_bf')) || 0,
                        wasteBF: parseFloat(searchResult.getValue('custrecord_cls_yield_waste_bf')) || 0,
                        yieldPct: parseFloat(searchResult.getValue('custrecord_cls_yield_percentage')) || 0,
                        operator: searchResult.getText('custrecord_cls_yield_operator'),
                        operatorId: searchResult.getValue('custrecord_cls_yield_operator'),
                        location: searchResult.getText('custrecord_cls_yield_location'),
                        locationId: searchResult.getValue('custrecord_cls_yield_location')
                    });
                });
            });

            result.count = result.records.length;

        } catch (e) {
            log.error({ title: 'Get production data error', details: e.message });
            result.error = e.message;
        }

        return result;
    }

    /**
     * Gets yield data
     *
     * @param {Object} options - Query options
     * @returns {Object} Yield data
     */
    function getYieldData(options) {
        const result = {
            type: DATA_TYPES.YIELD,
            timestamp: new Date().toISOString(),
            summary: {},
            byOperation: [],
            byOperator: [],
            trend: []
        };

        try {
            const filters = buildDateFilters('custrecord_cls_yield_date', options);

            // Overall summary
            const summarySearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: filters,
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_input_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_waste_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            summarySearch.run().each(r => {
                result.summary = {
                    totalInputBF: parseFloat(r.getValue({ name: 'custrecord_cls_yield_input_bf', summary: search.Summary.SUM })) || 0,
                    totalOutputBF: parseFloat(r.getValue({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM })) || 0,
                    totalWasteBF: parseFloat(r.getValue({ name: 'custrecord_cls_yield_waste_bf', summary: search.Summary.SUM })) || 0,
                    avgYield: parseFloat(r.getValue({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })) || 0,
                    operationCount: parseInt(r.getValue({ name: 'internalid', summary: search.Summary.COUNT }), 10) || 0
                };
                return true;
            });

            // By operation type
            const opTypeSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: filters,
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_operation', summary: search.Summary.GROUP }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })
                ]
            });

            opTypeSearch.run().each(r => {
                result.byOperation.push({
                    operation: r.getText({ name: 'custrecord_cls_yield_operation', summary: search.Summary.GROUP }) ||
                               r.getValue({ name: 'custrecord_cls_yield_operation', summary: search.Summary.GROUP }),
                    count: parseInt(r.getValue({ name: 'internalid', summary: search.Summary.COUNT }), 10) || 0,
                    avgYield: parseFloat(r.getValue({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })) || 0
                });
                return true;
            });

            // By operator
            const operatorSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: filters.concat([
                    'AND',
                    ['custrecord_cls_yield_operator', 'noneof', '@NONE@']
                ]),
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_operator', summary: search.Summary.GROUP }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({
                        name: 'custrecord_cls_yield_percentage',
                        summary: search.Summary.AVG,
                        sort: search.Sort.DESC
                    })
                ]
            });

            operatorSearch.run().each(r => {
                result.byOperator.push({
                    operator: r.getText({ name: 'custrecord_cls_yield_operator', summary: search.Summary.GROUP }),
                    operatorId: r.getValue({ name: 'custrecord_cls_yield_operator', summary: search.Summary.GROUP }),
                    count: parseInt(r.getValue({ name: 'internalid', summary: search.Summary.COUNT }), 10) || 0,
                    avgYield: parseFloat(r.getValue({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })) || 0
                });
                return true;
            });

            // Daily trend
            const trendSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: filters,
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_yield_date',
                        summary: search.Summary.GROUP,
                        sort: search.Sort.ASC
                    }),
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })
                ]
            });

            trendSearch.run().each(r => {
                result.trend.push({
                    date: r.getValue({ name: 'custrecord_cls_yield_date', summary: search.Summary.GROUP }),
                    outputBF: parseFloat(r.getValue({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM })) || 0,
                    avgYield: parseFloat(r.getValue({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })) || 0
                });
                return true;
            });

        } catch (e) {
            log.error({ title: 'Get yield data error', details: e.message });
            result.error = e.message;
        }

        return result;
    }

    /**
     * Gets inventory data
     *
     * @param {Object} options - Query options
     * @returns {Object} Inventory data
     */
    function getInventoryData(options) {
        const result = {
            type: DATA_TYPES.INVENTORY,
            timestamp: new Date().toISOString(),
            summary: {},
            byLocation: [],
            byItem: []
        };

        try {
            const filters = [['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]];

            if (options.location) {
                filters.push('AND', ['custrecord_cls_tally_location', 'anyof', options.location]);
            }

            // Summary
            const summarySearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: filters,
                columns: [
                    search.createColumn({ name: 'custrecord_cls_tally_bf_total', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_tally_bf_available', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_tally_pieces', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            summarySearch.run().each(r => {
                result.summary = {
                    totalBF: parseFloat(r.getValue({ name: 'custrecord_cls_tally_bf_total', summary: search.Summary.SUM })) || 0,
                    availableBF: parseFloat(r.getValue({ name: 'custrecord_cls_tally_bf_available', summary: search.Summary.SUM })) || 0,
                    totalPieces: parseInt(r.getValue({ name: 'custrecord_cls_tally_pieces', summary: search.Summary.SUM }), 10) || 0,
                    tallyCount: parseInt(r.getValue({ name: 'internalid', summary: search.Summary.COUNT }), 10) || 0
                };
                return true;
            });

            // By location
            const locSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: filters,
                columns: [
                    search.createColumn({ name: 'custrecord_cls_tally_location', summary: search.Summary.GROUP }),
                    search.createColumn({
                        name: 'custrecord_cls_tally_bf_available',
                        summary: search.Summary.SUM,
                        sort: search.Sort.DESC
                    }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            locSearch.run().each(r => {
                result.byLocation.push({
                    location: r.getText({ name: 'custrecord_cls_tally_location', summary: search.Summary.GROUP }),
                    locationId: r.getValue({ name: 'custrecord_cls_tally_location', summary: search.Summary.GROUP }),
                    availableBF: parseFloat(r.getValue({ name: 'custrecord_cls_tally_bf_available', summary: search.Summary.SUM })) || 0,
                    tallyCount: parseInt(r.getValue({ name: 'internalid', summary: search.Summary.COUNT }), 10) || 0
                });
                return true;
            });

            // By item
            const itemSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: filters,
                columns: [
                    search.createColumn({ name: 'custrecord_cls_tally_item', summary: search.Summary.GROUP }),
                    search.createColumn({
                        name: 'custrecord_cls_tally_bf_available',
                        summary: search.Summary.SUM,
                        sort: search.Sort.DESC
                    }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            itemSearch.run().each(r => {
                result.byItem.push({
                    item: r.getText({ name: 'custrecord_cls_tally_item', summary: search.Summary.GROUP }),
                    itemId: r.getValue({ name: 'custrecord_cls_tally_item', summary: search.Summary.GROUP }),
                    availableBF: parseFloat(r.getValue({ name: 'custrecord_cls_tally_bf_available', summary: search.Summary.SUM })) || 0,
                    tallyCount: parseInt(r.getValue({ name: 'internalid', summary: search.Summary.COUNT }), 10) || 0
                });
                return result.byItem.length < 50;
            });

        } catch (e) {
            log.error({ title: 'Get inventory data error', details: e.message });
            result.error = e.message;
        }

        return result;
    }

    /**
     * Gets tally data
     *
     * @param {Object} options - Query options
     * @returns {Object} Tally data
     */
    function getTallyData(options) {
        const result = {
            type: DATA_TYPES.TALLIES,
            timestamp: new Date().toISOString(),
            count: 0,
            records: []
        };

        try {
            const filters = [];

            if (options.status) {
                filters.push(['custrecord_cls_tally_status', 'is', options.status]);
            } else {
                filters.push(['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]);
            }

            if (options.location) {
                filters.push('AND', ['custrecord_cls_tally_location', 'anyof', options.location]);
            }

            if (options.item) {
                filters.push('AND', ['custrecord_cls_tally_item', 'anyof', options.item]);
            }

            const tallySearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: filters,
                columns: [
                    search.createColumn({ name: 'name', sort: search.Sort.DESC }),
                    'custrecord_cls_tally_item',
                    'custrecord_cls_tally_location',
                    'custrecord_cls_tally_status',
                    'custrecord_cls_tally_bf_total',
                    'custrecord_cls_tally_bf_available',
                    'custrecord_cls_tally_pieces',
                    'custrecord_cls_tally_thickness',
                    'custrecord_cls_tally_width',
                    'custrecord_cls_tally_length',
                    'created'
                ]
            });

            tallySearch.run().each(r => {
                if (result.records.length >= options.limit) return false;

                result.records.push({
                    id: r.id,
                    tallyNumber: r.getValue('name'),
                    item: r.getText('custrecord_cls_tally_item'),
                    itemId: r.getValue('custrecord_cls_tally_item'),
                    location: r.getText('custrecord_cls_tally_location'),
                    locationId: r.getValue('custrecord_cls_tally_location'),
                    status: r.getValue('custrecord_cls_tally_status'),
                    totalBF: parseFloat(r.getValue('custrecord_cls_tally_bf_total')) || 0,
                    availableBF: parseFloat(r.getValue('custrecord_cls_tally_bf_available')) || 0,
                    pieces: parseInt(r.getValue('custrecord_cls_tally_pieces'), 10) || 0,
                    thickness: parseFloat(r.getValue('custrecord_cls_tally_thickness')) || 0,
                    width: parseFloat(r.getValue('custrecord_cls_tally_width')) || 0,
                    length: parseFloat(r.getValue('custrecord_cls_tally_length')) || 0,
                    created: r.getValue('created')
                });

                return true;
            });

            result.count = result.records.length;

        } catch (e) {
            log.error({ title: 'Get tally data error', details: e.message });
            result.error = e.message;
        }

        return result;
    }

    /**
     * Gets repack data
     *
     * @param {Object} options - Query options
     * @returns {Object} Repack data
     */
    function getRepackData(options) {
        const result = {
            type: DATA_TYPES.REPACKS,
            timestamp: new Date().toISOString(),
            count: 0,
            records: []
        };

        try {
            const filters = buildDateFilters('custrecord_cls_repack_date', options);

            if (options.status) {
                filters.push('AND', ['custrecord_cls_repack_status', 'is', options.status]);
            }

            if (options.operator) {
                filters.push('AND', ['custrecord_cls_repack_operator', 'anyof', options.operator]);
            }

            const repackSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: filters,
                columns: [
                    search.createColumn({ name: 'custrecord_cls_repack_date', sort: search.Sort.DESC }),
                    'custrecord_cls_repack_number',
                    'custrecord_cls_repack_type',
                    'custrecord_cls_repack_status',
                    'custrecord_cls_repack_source_tally',
                    'custrecord_cls_repack_input_bf',
                    'custrecord_cls_repack_output_bf',
                    'custrecord_cls_repack_waste_bf',
                    'custrecord_cls_repack_yield_pct',
                    'custrecord_cls_repack_operator'
                ]
            });

            repackSearch.run().each(r => {
                if (result.records.length >= options.limit) return false;

                result.records.push({
                    id: r.id,
                    date: r.getValue('custrecord_cls_repack_date'),
                    repackNumber: r.getValue('custrecord_cls_repack_number'),
                    type: r.getText('custrecord_cls_repack_type'),
                    status: r.getValue('custrecord_cls_repack_status'),
                    sourceTally: r.getText('custrecord_cls_repack_source_tally'),
                    inputBF: parseFloat(r.getValue('custrecord_cls_repack_input_bf')) || 0,
                    outputBF: parseFloat(r.getValue('custrecord_cls_repack_output_bf')) || 0,
                    wasteBF: parseFloat(r.getValue('custrecord_cls_repack_waste_bf')) || 0,
                    yieldPct: parseFloat(r.getValue('custrecord_cls_repack_yield_pct')) || 0,
                    operator: r.getText('custrecord_cls_repack_operator')
                });

                return true;
            });

            result.count = result.records.length;

        } catch (e) {
            log.error({ title: 'Get repack data error', details: e.message });
            result.error = e.message;
        }

        return result;
    }

    /**
     * Gets allocation data
     *
     * @param {Object} options - Query options
     * @returns {Object} Allocation data
     */
    function getAllocationData(options) {
        const result = {
            type: DATA_TYPES.ALLOCATIONS,
            timestamp: new Date().toISOString(),
            count: 0,
            records: []
        };

        try {
            const filters = buildDateFilters('custrecord_cls_alloc_date', options);

            const allocSearch = search.create({
                type: 'customrecord_cls_tally_allocation',
                filters: filters,
                columns: [
                    search.createColumn({ name: 'custrecord_cls_alloc_date', sort: search.Sort.DESC }),
                    'custrecord_cls_alloc_tally',
                    'custrecord_cls_alloc_item',
                    'custrecord_cls_alloc_transaction',
                    'custrecord_cls_alloc_bf',
                    'custrecord_cls_alloc_type'
                ]
            });

            allocSearch.run().each(r => {
                if (result.records.length >= options.limit) return false;

                result.records.push({
                    id: r.id,
                    date: r.getValue('custrecord_cls_alloc_date'),
                    tally: r.getText('custrecord_cls_alloc_tally'),
                    tallyId: r.getValue('custrecord_cls_alloc_tally'),
                    item: r.getText('custrecord_cls_alloc_item'),
                    transaction: r.getText('custrecord_cls_alloc_transaction'),
                    transactionId: r.getValue('custrecord_cls_alloc_transaction'),
                    bf: parseFloat(r.getValue('custrecord_cls_alloc_bf')) || 0,
                    allocationType: r.getValue('custrecord_cls_alloc_type')
                });

                return true;
            });

            result.count = result.records.length;

        } catch (e) {
            log.error({ title: 'Get allocation data error', details: e.message });
            result.error = e.message;
        }

        return result;
    }

    /**
     * Gets sales data
     *
     * @param {Object} options - Query options
     * @returns {Object} Sales data
     */
    function getSalesData(options) {
        const result = {
            type: DATA_TYPES.SALES,
            timestamp: new Date().toISOString(),
            summary: {},
            records: []
        };

        try {
            const filters = [
                ['type', 'anyof', 'SalesOrd'],
                'AND',
                ['mainline', 'is', 'T']
            ].concat(buildDateFilters('trandate', options));

            // Summary
            const summarySearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: filters,
                columns: [
                    search.createColumn({ name: 'amount', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            summarySearch.run().each(r => {
                result.summary = {
                    totalAmount: parseFloat(r.getValue({ name: 'amount', summary: search.Summary.SUM })) || 0,
                    orderCount: parseInt(r.getValue({ name: 'internalid', summary: search.Summary.COUNT }), 10) || 0
                };
                return true;
            });

            // Individual orders
            const ordersSearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: filters,
                columns: [
                    'tranid',
                    search.createColumn({ name: 'trandate', sort: search.Sort.DESC }),
                    'entity',
                    'amount',
                    'status'
                ]
            });

            ordersSearch.run().each(r => {
                if (result.records.length >= options.limit) return false;

                result.records.push({
                    id: r.id,
                    tranId: r.getValue('tranid'),
                    date: r.getValue('trandate'),
                    customer: r.getText('entity'),
                    customerId: r.getValue('entity'),
                    amount: parseFloat(r.getValue('amount')) || 0,
                    status: r.getText('status')
                });

                return true;
            });

        } catch (e) {
            log.error({ title: 'Get sales data error', details: e.message });
            result.error = e.message;
        }

        return result;
    }

    /**
     * Gets work order data
     *
     * @param {Object} options - Query options
     * @returns {Object} Work order data
     */
    function getWorkOrderData(options) {
        const result = {
            type: DATA_TYPES.WORK_ORDERS,
            timestamp: new Date().toISOString(),
            count: 0,
            records: []
        };

        try {
            const filters = [['type', 'anyof', 'WorkOrd']];

            if (options.status) {
                filters.push('AND', ['status', 'anyof', options.status]);
            }

            if (options.item) {
                filters.push('AND', ['item', 'anyof', options.item]);
            }

            const woSearch = search.create({
                type: search.Type.WORK_ORDER,
                filters: filters,
                columns: [
                    'tranid',
                    search.createColumn({ name: 'trandate', sort: search.Sort.DESC }),
                    'item',
                    'quantity',
                    'status',
                    'percentcomplete',
                    'custbody_cls_bf_consumed'
                ]
            });

            woSearch.run().each(r => {
                if (result.records.length >= options.limit) return false;

                result.records.push({
                    id: r.id,
                    tranId: r.getValue('tranid'),
                    date: r.getValue('trandate'),
                    item: r.getText('item'),
                    itemId: r.getValue('item'),
                    quantity: parseInt(r.getValue('quantity'), 10) || 0,
                    status: r.getText('status'),
                    statusId: r.getValue('status'),
                    percentComplete: parseFloat(r.getValue('percentcomplete')) || 0,
                    bfConsumed: parseFloat(r.getValue('custbody_cls_bf_consumed')) || 0
                });

                return true;
            });

            result.count = result.records.length;

        } catch (e) {
            log.error({ title: 'Get work order data error', details: e.message });
            result.error = e.message;
        }

        return result;
    }

    /**
     * Gets KPI data
     *
     * @param {Object} options - Query options
     * @returns {Object} KPI data
     */
    function getKPIData(options) {
        const result = {
            type: DATA_TYPES.KPI,
            timestamp: new Date().toISOString(),
            production: {},
            inventory: {},
            yield: {},
            sales: {}
        };

        try {
            // Production KPIs
            const prodSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: buildDateFilters('custrecord_cls_yield_date', options),
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            prodSearch.run().each(r => {
                result.production = {
                    totalOutputBF: parseFloat(r.getValue({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM })) || 0,
                    avgYield: parseFloat(r.getValue({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })) || 0,
                    operationCount: parseInt(r.getValue({ name: 'internalid', summary: search.Summary.COUNT }), 10) || 0
                };
                return true;
            });

            // Inventory KPIs
            const invSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: [['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_tally_bf_available', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            invSearch.run().each(r => {
                result.inventory = {
                    availableBF: parseFloat(r.getValue({ name: 'custrecord_cls_tally_bf_available', summary: search.Summary.SUM })) || 0,
                    activeTallies: parseInt(r.getValue({ name: 'internalid', summary: search.Summary.COUNT }), 10) || 0
                };
                return true;
            });

        } catch (e) {
            log.error({ title: 'Get KPI data error', details: e.message });
            result.error = e.message;
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Builds date filters for search
     *
     * @param {string} fieldId - Date field ID
     * @param {Object} options - Query options
     * @returns {Array} Filter array
     */
    function buildDateFilters(fieldId, options) {
        const filters = [];

        if (options.dateFrom && options.dateTo) {
            filters.push([fieldId, 'within', options.dateFrom, options.dateTo]);
        } else {
            const rangeMap = {
                'today': 'today',
                'yesterday': 'yesterday',
                'thisweek': 'thisweek',
                'lastweek': 'lastweek',
                'thismonth': 'thismonth',
                'lastmonth': 'lastmonth',
                'thisquarter': 'thisfiscalquarter',
                'thisyear': 'thisfiscalyear'
            };

            const range = rangeMap[options.dateRange] || 'thismonth';
            filters.push([fieldId, 'within', range]);
        }

        return filters;
    }

    /**
     * Formats output based on format type
     *
     * @param {Object} data - Data to format
     * @param {string} outputFormat - Output format
     * @returns {Object|string} Formatted output
     */
    function formatOutput(data, outputFormat) {
        switch (outputFormat) {
            case OUTPUT_FORMATS.CSV:
                return convertToCSV(data);

            case OUTPUT_FORMATS.SUMMARY:
                return createSummaryResponse(data);

            default:
                return data;
        }
    }

    /**
     * Converts data to CSV format
     *
     * @param {Object} data - Data to convert
     * @returns {string} CSV string
     */
    function convertToCSV(data) {
        if (!data.records || data.records.length === 0) {
            return 'No records found';
        }

        const headers = Object.keys(data.records[0]);
        let csv = headers.join(',') + '\n';

        data.records.forEach(record => {
            csv += headers.map(h => {
                const val = String(record[h] || '').replace(/"/g, '""');
                return val.includes(',') || val.includes('"') ? `"${val}"` : val;
            }).join(',') + '\n';
        });

        return csv;
    }

    /**
     * Creates summary response
     *
     * @param {Object} data - Data to summarize
     * @returns {Object} Summary response
     */
    function createSummaryResponse(data) {
        return {
            type: data.type,
            timestamp: data.timestamp,
            recordCount: data.count || (data.records ? data.records.length : 0),
            summary: data.summary || null,
            hasError: !!data.error,
            error: data.error || null
        };
    }

    /**
     * Creates error response
     *
     * @param {string} message - Error message
     * @returns {Object} Error response
     */
    function createErrorResponse(message) {
        return {
            success: false,
            error: message,
            timestamp: new Date().toISOString()
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST - Create/Update Operations
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * POST Entry Point - For saving report configurations
     *
     * @param {Object} body - Request body
     * @returns {Object} Response
     */
    function post(body) {
        try {
            const action = body.action;

            switch (action) {
                case 'saveSchedule':
                    return saveReportSchedule(body);

                case 'deleteSchedule':
                    return deleteReportSchedule(body.scheduleId);

                default:
                    return { success: false, error: 'Unknown action' };
            }

        } catch (error) {
            log.error({
                title: 'POST Error',
                details: error.message
            });
            return createErrorResponse(error.message);
        }
    }

    /**
     * Saves report schedule configuration
     *
     * @param {Object} config - Schedule configuration
     * @returns {Object} Result
     */
    function saveReportSchedule(config) {
        try {
            let scheduleRec;

            if (config.scheduleId) {
                scheduleRec = record.load({
                    type: 'customrecord_cls_report_schedule',
                    id: config.scheduleId,
                    isDynamic: true
                });
            } else {
                scheduleRec = record.create({
                    type: 'customrecord_cls_report_schedule',
                    isDynamic: true
                });
            }

            if (config.reportType) {
                scheduleRec.setValue({
                    fieldId: 'custrecord_cls_sched_report_type',
                    value: config.reportType
                });
            }

            if (config.frequency) {
                scheduleRec.setValue({
                    fieldId: 'custrecord_cls_sched_frequency',
                    value: config.frequency
                });
            }

            if (config.day) {
                scheduleRec.setValue({
                    fieldId: 'custrecord_cls_sched_day',
                    value: config.day
                });
            }

            if (config.recipients) {
                scheduleRec.setValue({
                    fieldId: 'custrecord_cls_sched_recipients',
                    value: config.recipients
                });
            }

            if (config.filters) {
                scheduleRec.setValue({
                    fieldId: 'custrecord_cls_sched_filters',
                    value: JSON.stringify(config.filters)
                });
            }

            const scheduleId = scheduleRec.save();

            return {
                success: true,
                scheduleId: scheduleId,
                message: 'Schedule saved successfully'
            };

        } catch (e) {
            log.error({ title: 'Save schedule error', details: e.message });
            return { success: false, error: e.message };
        }
    }

    /**
     * Deletes report schedule
     *
     * @param {string} scheduleId - Schedule ID
     * @returns {Object} Result
     */
    function deleteReportSchedule(scheduleId) {
        try {
            record.delete({
                type: 'customrecord_cls_report_schedule',
                id: scheduleId
            });

            return {
                success: true,
                message: 'Schedule deleted successfully'
            };

        } catch (e) {
            log.error({ title: 'Delete schedule error', details: e.message });
            return { success: false, error: e.message };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE EXPORTS
    // ═══════════════════════════════════════════════════════════════════════

    return {
        get: get,
        post: post
    };
});
