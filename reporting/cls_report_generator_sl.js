/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @file cls_report_generator_sl.js
 * @description Report Generator Suitelet for Consule LumberSuite™
 *              Generates configurable reports for production, inventory, and sales
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module reporting/cls_report_generator_sl
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/record',
    'N/runtime',
    'N/format',
    'N/file',
    'N/render',
    'N/xml',
    '../lib/cls_settings_dao',
    '../lib/cls_lumber_constants'
], function(
    serverWidget,
    search,
    record,
    runtime,
    format,
    file,
    render,
    xml,
    settingsDAO,
    constants
) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    const REPORT_TYPES = {
        PRODUCTION_SUMMARY: {
            id: 'production_summary',
            name: 'Production Summary Report',
            description: 'Summary of production output, yield, and efficiency metrics',
            category: 'production'
        },
        YIELD_ANALYSIS: {
            id: 'yield_analysis',
            name: 'Yield Analysis Report',
            description: 'Detailed yield analysis by operation, item, and operator',
            category: 'yield'
        },
        INVENTORY_STATUS: {
            id: 'inventory_status',
            name: 'Inventory Status Report',
            description: 'Current tally inventory by location and item',
            category: 'inventory'
        },
        INVENTORY_AGING: {
            id: 'inventory_aging',
            name: 'Inventory Aging Report',
            description: 'Age analysis of tally inventory',
            category: 'inventory'
        },
        TALLY_CONSUMPTION: {
            id: 'tally_consumption',
            name: 'Tally Consumption Report',
            description: 'Tally consumption history and allocation details',
            category: 'inventory'
        },
        REPACK_SUMMARY: {
            id: 'repack_summary',
            name: 'Repack Operations Report',
            description: 'Summary of repack operations and yield',
            category: 'production'
        },
        SALES_BF: {
            id: 'sales_bf',
            name: 'Sales by BF Report',
            description: 'Sales analysis by board feet sold',
            category: 'sales'
        },
        WORK_ORDER_STATUS: {
            id: 'work_order_status',
            name: 'Work Order Status Report',
            description: 'Active and completed work orders with BF consumption',
            category: 'production'
        }
    };

    const OUTPUT_FORMATS = {
        HTML: 'html',
        PDF: 'pdf',
        CSV: 'csv',
        EXCEL: 'excel'
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
            if (request.method === 'GET') {
                if (request.parameters.generate === 'true') {
                    generateReport(context);
                } else {
                    response.writePage(buildReportSelectionForm(request));
                }
            } else {
                generateReport(context);
            }

        } catch (error) {
            log.error({
                title: 'Report Generator Error',
                details: error.message
            });
            response.write(`Error: ${error.message}`);
        }
    }

    /**
     * Builds the report selection form
     *
     * @param {Object} request - Request object
     * @returns {Form} Form object
     */
    function buildReportSelectionForm(request) {
        const form = serverWidget.createForm({
            title: 'LumberSuite™ Report Generator'
        });

        form.clientScriptModulePath = './cls_report_generator_cs.js';

        // Report category selection
        const categoryGroup = form.addFieldGroup({
            id: 'custgroup_category',
            label: 'Report Selection'
        });

        const categoryField = form.addField({
            id: 'custpage_category',
            type: serverWidget.FieldType.SELECT,
            label: 'Report Category',
            container: 'custgroup_category'
        });

        categoryField.addSelectOption({ value: '', text: '-- Select Category --' });
        categoryField.addSelectOption({ value: 'production', text: 'Production Reports' });
        categoryField.addSelectOption({ value: 'inventory', text: 'Inventory Reports' });
        categoryField.addSelectOption({ value: 'yield', text: 'Yield Reports' });
        categoryField.addSelectOption({ value: 'sales', text: 'Sales Reports' });

        // Report type selection
        const reportField = form.addField({
            id: 'custpage_report_type',
            type: serverWidget.FieldType.SELECT,
            label: 'Report',
            container: 'custgroup_category'
        });
        reportField.isMandatory = true;

        reportField.addSelectOption({ value: '', text: '-- Select Report --' });
        Object.values(REPORT_TYPES).forEach(report => {
            reportField.addSelectOption({
                value: report.id,
                text: report.name
            });
        });

        // Report description
        const descField = form.addField({
            id: 'custpage_report_desc',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Description',
            container: 'custgroup_category'
        });
        descField.defaultValue = '<div id="reportDescription" style="padding: 10px; background: #f5f5f5; border-radius: 4px; margin-top: 10px;">Select a report to see its description</div>';

        // Date range section
        const dateGroup = form.addFieldGroup({
            id: 'custgroup_dates',
            label: 'Date Range'
        });

        const rangeTypeField = form.addField({
            id: 'custpage_range_type',
            type: serverWidget.FieldType.SELECT,
            label: 'Date Range',
            container: 'custgroup_dates'
        });

        rangeTypeField.addSelectOption({ value: 'today', text: 'Today' });
        rangeTypeField.addSelectOption({ value: 'yesterday', text: 'Yesterday' });
        rangeTypeField.addSelectOption({ value: 'thisweek', text: 'This Week' });
        rangeTypeField.addSelectOption({ value: 'lastweek', text: 'Last Week' });
        rangeTypeField.addSelectOption({ value: 'thismonth', text: 'This Month', isSelected: true });
        rangeTypeField.addSelectOption({ value: 'lastmonth', text: 'Last Month' });
        rangeTypeField.addSelectOption({ value: 'thisquarter', text: 'This Quarter' });
        rangeTypeField.addSelectOption({ value: 'thisyear', text: 'This Year' });
        rangeTypeField.addSelectOption({ value: 'custom', text: 'Custom Range' });

        form.addField({
            id: 'custpage_date_from',
            type: serverWidget.FieldType.DATE,
            label: 'From Date',
            container: 'custgroup_dates'
        });

        form.addField({
            id: 'custpage_date_to',
            type: serverWidget.FieldType.DATE,
            label: 'To Date',
            container: 'custgroup_dates'
        });

        // Filters section
        const filterGroup = form.addFieldGroup({
            id: 'custgroup_filters',
            label: 'Filters (Optional)'
        });

        form.addField({
            id: 'custpage_location',
            type: serverWidget.FieldType.SELECT,
            source: 'location',
            label: 'Location',
            container: 'custgroup_filters'
        });

        form.addField({
            id: 'custpage_item',
            type: serverWidget.FieldType.SELECT,
            source: 'item',
            label: 'Item',
            container: 'custgroup_filters'
        });

        form.addField({
            id: 'custpage_employee',
            type: serverWidget.FieldType.SELECT,
            source: 'employee',
            label: 'Operator',
            container: 'custgroup_filters'
        });

        // Output options
        const outputGroup = form.addFieldGroup({
            id: 'custgroup_output',
            label: 'Output Options'
        });

        const formatField = form.addField({
            id: 'custpage_output_format',
            type: serverWidget.FieldType.SELECT,
            label: 'Output Format',
            container: 'custgroup_output'
        });

        formatField.addSelectOption({ value: OUTPUT_FORMATS.HTML, text: 'View in Browser (HTML)' });
        formatField.addSelectOption({ value: OUTPUT_FORMATS.PDF, text: 'Download PDF' });
        formatField.addSelectOption({ value: OUTPUT_FORMATS.CSV, text: 'Download CSV' });
        formatField.addSelectOption({ value: OUTPUT_FORMATS.EXCEL, text: 'Download Excel' });

        const groupByField = form.addField({
            id: 'custpage_group_by',
            type: serverWidget.FieldType.SELECT,
            label: 'Group By',
            container: 'custgroup_output'
        });

        groupByField.addSelectOption({ value: 'none', text: 'No Grouping' });
        groupByField.addSelectOption({ value: 'date', text: 'Date' });
        groupByField.addSelectOption({ value: 'item', text: 'Item' });
        groupByField.addSelectOption({ value: 'location', text: 'Location' });
        groupByField.addSelectOption({ value: 'operator', text: 'Operator' });

        const includeCharts = form.addField({
            id: 'custpage_include_charts',
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Include Charts',
            container: 'custgroup_output'
        });
        includeCharts.defaultValue = 'T';

        // Buttons
        form.addSubmitButton({ label: 'Generate Report' });

        form.addButton({
            id: 'custpage_btn_preview',
            label: 'Preview',
            functionName: 'previewReport'
        });

        form.addButton({
            id: 'custpage_btn_schedule',
            label: 'Schedule Report',
            functionName: 'scheduleReport'
        });

        // Available reports list
        const reportsListField = form.addField({
            id: 'custpage_reports_list',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Available Reports'
        });
        reportsListField.defaultValue = buildReportsListHtml();

        return form;
    }

    /**
     * Builds available reports list HTML
     *
     * @returns {string} HTML content
     */
    function buildReportsListHtml() {
        const categories = {
            production: { name: 'Production', icon: '🏭', reports: [] },
            inventory: { name: 'Inventory', icon: '📦', reports: [] },
            yield: { name: 'Yield', icon: '📊', reports: [] },
            sales: { name: 'Sales', icon: '💰', reports: [] }
        };

        Object.values(REPORT_TYPES).forEach(report => {
            if (categories[report.category]) {
                categories[report.category].reports.push(report);
            }
        });

        let html = `
            <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                <h3 style="margin-top: 0;">Available Reports</h3>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
        `;

        Object.values(categories).forEach(category => {
            html += `
                <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 15px 0;">${category.icon} ${category.name} Reports</h4>
                    <ul style="margin: 0; padding-left: 20px;">
                        ${category.reports.map(r => `
                            <li style="margin-bottom: 8px;">
                                <strong>${r.name}</strong>
                                <div style="font-size: 12px; color: #666;">${r.description}</div>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        });

        html += '</div></div>';
        return html;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REPORT GENERATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Generates the selected report
     *
     * @param {Object} context - Request context
     */
    function generateReport(context) {
        const { request, response } = context;

        const reportType = request.parameters.custpage_report_type;
        const outputFormat = request.parameters.custpage_output_format || OUTPUT_FORMATS.HTML;
        const params = extractReportParams(request);

        if (!reportType) {
            response.write('Error: Please select a report type');
            return;
        }

        log.debug({
            title: 'Generating Report',
            details: `Type: ${reportType}, Format: ${outputFormat}`
        });

        let reportData;

        switch (reportType) {
            case 'production_summary':
                reportData = generateProductionSummary(params);
                break;
            case 'yield_analysis':
                reportData = generateYieldAnalysis(params);
                break;
            case 'inventory_status':
                reportData = generateInventoryStatus(params);
                break;
            case 'inventory_aging':
                reportData = generateInventoryAging(params);
                break;
            case 'tally_consumption':
                reportData = generateTallyConsumption(params);
                break;
            case 'repack_summary':
                reportData = generateRepackSummary(params);
                break;
            case 'sales_bf':
                reportData = generateSalesBF(params);
                break;
            case 'work_order_status':
                reportData = generateWorkOrderStatus(params);
                break;
            default:
                response.write('Error: Unknown report type');
                return;
        }

        // Output based on format
        switch (outputFormat) {
            case OUTPUT_FORMATS.PDF:
                outputPDF(response, reportData);
                break;
            case OUTPUT_FORMATS.CSV:
                outputCSV(response, reportData);
                break;
            case OUTPUT_FORMATS.EXCEL:
                outputExcel(response, reportData);
                break;
            default:
                outputHTML(response, reportData);
        }
    }

    /**
     * Extracts report parameters from request
     *
     * @param {Object} request - Request object
     * @returns {Object} Report parameters
     */
    function extractReportParams(request) {
        return {
            rangeType: request.parameters.custpage_range_type || 'thismonth',
            dateFrom: request.parameters.custpage_date_from,
            dateTo: request.parameters.custpage_date_to,
            location: request.parameters.custpage_location,
            item: request.parameters.custpage_item,
            employee: request.parameters.custpage_employee,
            groupBy: request.parameters.custpage_group_by || 'none',
            includeCharts: request.parameters.custpage_include_charts === 'T'
        };
    }

    /**
     * Gets date filter for search based on range type
     *
     * @param {string} fieldId - Date field ID
     * @param {Object} params - Report parameters
     * @returns {Array} Search filters
     */
    function getDateFilter(fieldId, params) {
        if (params.rangeType === 'custom' && params.dateFrom && params.dateTo) {
            return [[fieldId, 'within', params.dateFrom, params.dateTo]];
        }

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

        const range = rangeMap[params.rangeType] || 'thismonth';
        return [[fieldId, 'within', range]];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REPORT GENERATORS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Generates Production Summary Report
     *
     * @param {Object} params - Report parameters
     * @returns {Object} Report data
     */
    function generateProductionSummary(params) {
        const report = {
            title: 'Production Summary Report',
            subtitle: `Generated: ${new Date().toLocaleString()}`,
            columns: ['Date', 'Work Orders', 'Output BF', 'Input BF', 'Waste BF', 'Yield %'],
            rows: [],
            totals: { workOrders: 0, outputBF: 0, inputBF: 0, wasteBF: 0 },
            charts: []
        };

        try {
            const filters = getDateFilter('custrecord_cls_yield_date', params);

            if (params.location) {
                filters.push('AND', ['custrecord_cls_yield_location', 'anyof', params.location]);
            }

            const prodSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: filters,
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_yield_date',
                        summary: search.Summary.GROUP,
                        sort: search.Sort.ASC
                    }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_input_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_waste_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })
                ]
            });

            prodSearch.run().each(result => {
                const date = result.getValue({
                    name: 'custrecord_cls_yield_date',
                    summary: search.Summary.GROUP
                });
                const orders = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                const outputBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_output_bf',
                    summary: search.Summary.SUM
                })) || 0;
                const inputBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_input_bf',
                    summary: search.Summary.SUM
                })) || 0;
                const wasteBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_waste_bf',
                    summary: search.Summary.SUM
                })) || 0;
                const yieldPct = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_percentage',
                    summary: search.Summary.AVG
                })) || 0;

                report.rows.push([
                    date,
                    orders,
                    outputBF.toFixed(2),
                    inputBF.toFixed(2),
                    wasteBF.toFixed(2),
                    yieldPct.toFixed(1) + '%'
                ]);

                report.totals.workOrders += orders;
                report.totals.outputBF += outputBF;
                report.totals.inputBF += inputBF;
                report.totals.wasteBF += wasteBF;

                if (params.includeCharts) {
                    report.charts.push({ date: date, value: outputBF });
                }

                return true;
            });

            report.totals.avgYield = report.totals.inputBF > 0
                ? (report.totals.outputBF / report.totals.inputBF * 100).toFixed(1) + '%'
                : '0%';

        } catch (e) {
            log.error({ title: 'Production Summary Error', details: e.message });
            report.error = e.message;
        }

        return report;
    }

    /**
     * Generates Yield Analysis Report
     *
     * @param {Object} params - Report parameters
     * @returns {Object} Report data
     */
    function generateYieldAnalysis(params) {
        const report = {
            title: 'Yield Analysis Report',
            subtitle: `Generated: ${new Date().toLocaleString()}`,
            columns: ['Operation Type', 'Count', 'Input BF', 'Output BF', 'Waste BF', 'Avg Yield'],
            rows: [],
            byOperator: [],
            totals: {}
        };

        try {
            const filters = getDateFilter('custrecord_cls_yield_date', params);

            // By operation type
            const typeSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: filters,
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_yield_operation',
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: 'custrecord_cls_yield_input_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_waste_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })
                ]
            });

            typeSearch.run().each(result => {
                const operation = result.getText({
                    name: 'custrecord_cls_yield_operation',
                    summary: search.Summary.GROUP
                }) || result.getValue({
                    name: 'custrecord_cls_yield_operation',
                    summary: search.Summary.GROUP
                }) || 'Unknown';

                report.rows.push([
                    operation,
                    result.getValue({ name: 'internalid', summary: search.Summary.COUNT }),
                    (parseFloat(result.getValue({ name: 'custrecord_cls_yield_input_bf', summary: search.Summary.SUM })) || 0).toFixed(2),
                    (parseFloat(result.getValue({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM })) || 0).toFixed(2),
                    (parseFloat(result.getValue({ name: 'custrecord_cls_yield_waste_bf', summary: search.Summary.SUM })) || 0).toFixed(2),
                    (parseFloat(result.getValue({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })) || 0).toFixed(1) + '%'
                ]);

                return true;
            });

            // By operator
            const opSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: filters.concat([
                    'AND',
                    ['custrecord_cls_yield_operator', 'noneof', '@NONE@']
                ]),
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_yield_operator',
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({
                        name: 'custrecord_cls_yield_percentage',
                        summary: search.Summary.AVG,
                        sort: search.Sort.DESC
                    })
                ]
            });

            opSearch.run().each(result => {
                report.byOperator.push({
                    name: result.getText({
                        name: 'custrecord_cls_yield_operator',
                        summary: search.Summary.GROUP
                    }),
                    count: result.getValue({ name: 'internalid', summary: search.Summary.COUNT }),
                    avgYield: (parseFloat(result.getValue({
                        name: 'custrecord_cls_yield_percentage',
                        summary: search.Summary.AVG
                    })) || 0).toFixed(1) + '%'
                });
                return true;
            });

        } catch (e) {
            log.error({ title: 'Yield Analysis Error', details: e.message });
            report.error = e.message;
        }

        return report;
    }

    /**
     * Generates Inventory Status Report
     *
     * @param {Object} params - Report parameters
     * @returns {Object} Report data
     */
    function generateInventoryStatus(params) {
        const report = {
            title: 'Inventory Status Report',
            subtitle: `As of: ${new Date().toLocaleString()}`,
            columns: ['Tally #', 'Item', 'Location', 'Status', 'Total BF', 'Available BF', 'Pieces'],
            rows: [],
            summary: { totalBF: 0, availableBF: 0, tallies: 0 },
            byLocation: []
        };

        try {
            const filters = [['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]];

            if (params.location) {
                filters.push('AND', ['custrecord_cls_tally_location', 'anyof', params.location]);
            }

            if (params.item) {
                filters.push('AND', ['custrecord_cls_tally_item', 'anyof', params.item]);
            }

            const invSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: filters,
                columns: [
                    'name',
                    'custrecord_cls_tally_item',
                    'custrecord_cls_tally_location',
                    'custrecord_cls_tally_status',
                    'custrecord_cls_tally_bf_total',
                    'custrecord_cls_tally_bf_available',
                    'custrecord_cls_tally_pieces'
                ]
            });

            invSearch.run().each(result => {
                const totalBF = parseFloat(result.getValue('custrecord_cls_tally_bf_total')) || 0;
                const availBF = parseFloat(result.getValue('custrecord_cls_tally_bf_available')) || 0;

                report.rows.push([
                    result.getValue('name'),
                    result.getText('custrecord_cls_tally_item'),
                    result.getText('custrecord_cls_tally_location'),
                    result.getValue('custrecord_cls_tally_status'),
                    totalBF.toFixed(2),
                    availBF.toFixed(2),
                    result.getValue('custrecord_cls_tally_pieces') || 0
                ]);

                report.summary.totalBF += totalBF;
                report.summary.availableBF += availBF;
                report.summary.tallies++;

                return true;
            });

            // Group by location summary
            const locSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: filters,
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_tally_location',
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({
                        name: 'custrecord_cls_tally_bf_available',
                        summary: search.Summary.SUM
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })
                ]
            });

            locSearch.run().each(result => {
                report.byLocation.push({
                    location: result.getText({
                        name: 'custrecord_cls_tally_location',
                        summary: search.Summary.GROUP
                    }),
                    bf: parseFloat(result.getValue({
                        name: 'custrecord_cls_tally_bf_available',
                        summary: search.Summary.SUM
                    })) || 0,
                    tallies: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }), 10) || 0
                });
                return true;
            });

        } catch (e) {
            log.error({ title: 'Inventory Status Error', details: e.message });
            report.error = e.message;
        }

        return report;
    }

    /**
     * Generates Inventory Aging Report
     *
     * @param {Object} params - Report parameters
     * @returns {Object} Report data
     */
    function generateInventoryAging(params) {
        const report = {
            title: 'Inventory Aging Report',
            subtitle: `As of: ${new Date().toLocaleString()}`,
            columns: ['Tally #', 'Item', 'Location', 'Date Created', 'Age (Days)', 'Available BF', 'Status'],
            rows: [],
            agingBuckets: {
                '0-30': { count: 0, bf: 0 },
                '31-60': { count: 0, bf: 0 },
                '61-90': { count: 0, bf: 0 },
                '90+': { count: 0, bf: 0 }
            }
        };

        try {
            const filters = [['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]];

            if (params.location) {
                filters.push('AND', ['custrecord_cls_tally_location', 'anyof', params.location]);
            }

            const agingSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: filters,
                columns: [
                    'name',
                    'custrecord_cls_tally_item',
                    'custrecord_cls_tally_location',
                    search.createColumn({ name: 'created', sort: search.Sort.ASC }),
                    'custrecord_cls_tally_bf_available',
                    'custrecord_cls_tally_status'
                ]
            });

            const today = new Date();

            agingSearch.run().each(result => {
                const createdDate = result.getValue('created');
                const created = new Date(createdDate);
                const ageDays = Math.floor((today - created) / (1000 * 60 * 60 * 24));
                const availBF = parseFloat(result.getValue('custrecord_cls_tally_bf_available')) || 0;

                report.rows.push([
                    result.getValue('name'),
                    result.getText('custrecord_cls_tally_item'),
                    result.getText('custrecord_cls_tally_location'),
                    createdDate,
                    ageDays,
                    availBF.toFixed(2),
                    result.getValue('custrecord_cls_tally_status')
                ]);

                // Categorize into buckets
                if (ageDays <= 30) {
                    report.agingBuckets['0-30'].count++;
                    report.agingBuckets['0-30'].bf += availBF;
                } else if (ageDays <= 60) {
                    report.agingBuckets['31-60'].count++;
                    report.agingBuckets['31-60'].bf += availBF;
                } else if (ageDays <= 90) {
                    report.agingBuckets['61-90'].count++;
                    report.agingBuckets['61-90'].bf += availBF;
                } else {
                    report.agingBuckets['90+'].count++;
                    report.agingBuckets['90+'].bf += availBF;
                }

                return true;
            });

        } catch (e) {
            log.error({ title: 'Inventory Aging Error', details: e.message });
            report.error = e.message;
        }

        return report;
    }

    /**
     * Generates Tally Consumption Report
     *
     * @param {Object} params - Report parameters
     * @returns {Object} Report data
     */
    function generateTallyConsumption(params) {
        const report = {
            title: 'Tally Consumption Report',
            subtitle: `Generated: ${new Date().toLocaleString()}`,
            columns: ['Date', 'Tally #', 'Item', 'Allocated To', 'BF Consumed', 'Remaining BF'],
            rows: [],
            totals: { consumed: 0, allocations: 0 }
        };

        try {
            const filters = getDateFilter('custrecord_cls_alloc_date', params);

            const allocSearch = search.create({
                type: 'customrecord_cls_tally_allocation',
                filters: filters,
                columns: [
                    search.createColumn({ name: 'custrecord_cls_alloc_date', sort: search.Sort.DESC }),
                    'custrecord_cls_alloc_tally',
                    'custrecord_cls_alloc_item',
                    'custrecord_cls_alloc_transaction',
                    'custrecord_cls_alloc_bf',
                    'custrecord_cls_alloc_remaining'
                ]
            });

            allocSearch.run().each(result => {
                const bfConsumed = parseFloat(result.getValue('custrecord_cls_alloc_bf')) || 0;

                report.rows.push([
                    result.getValue('custrecord_cls_alloc_date'),
                    result.getText('custrecord_cls_alloc_tally'),
                    result.getText('custrecord_cls_alloc_item'),
                    result.getText('custrecord_cls_alloc_transaction'),
                    bfConsumed.toFixed(2),
                    (parseFloat(result.getValue('custrecord_cls_alloc_remaining')) || 0).toFixed(2)
                ]);

                report.totals.consumed += bfConsumed;
                report.totals.allocations++;

                return true;
            });

        } catch (e) {
            log.error({ title: 'Tally Consumption Error', details: e.message });
            report.error = e.message;
        }

        return report;
    }

    /**
     * Generates Repack Summary Report
     *
     * @param {Object} params - Report parameters
     * @returns {Object} Report data
     */
    function generateRepackSummary(params) {
        const report = {
            title: 'Repack Operations Summary',
            subtitle: `Generated: ${new Date().toLocaleString()}`,
            columns: ['Repack #', 'Type', 'Date', 'Input BF', 'Output BF', 'Waste BF', 'Yield %', 'Operator'],
            rows: [],
            totals: { input: 0, output: 0, waste: 0, count: 0 }
        };

        try {
            const filters = [
                ['custrecord_cls_repack_status', 'is', 'completed']
            ].concat(getDateFilter('custrecord_cls_repack_date', params));

            if (params.employee) {
                filters.push('AND', ['custrecord_cls_repack_operator', 'anyof', params.employee]);
            }

            const repackSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: filters,
                columns: [
                    'custrecord_cls_repack_number',
                    'custrecord_cls_repack_type',
                    search.createColumn({ name: 'custrecord_cls_repack_date', sort: search.Sort.DESC }),
                    'custrecord_cls_repack_input_bf',
                    'custrecord_cls_repack_output_bf',
                    'custrecord_cls_repack_waste_bf',
                    'custrecord_cls_repack_yield_pct',
                    'custrecord_cls_repack_operator'
                ]
            });

            repackSearch.run().each(result => {
                const inputBF = parseFloat(result.getValue('custrecord_cls_repack_input_bf')) || 0;
                const outputBF = parseFloat(result.getValue('custrecord_cls_repack_output_bf')) || 0;
                const wasteBF = parseFloat(result.getValue('custrecord_cls_repack_waste_bf')) || 0;

                report.rows.push([
                    result.getValue('custrecord_cls_repack_number'),
                    result.getText('custrecord_cls_repack_type'),
                    result.getValue('custrecord_cls_repack_date'),
                    inputBF.toFixed(2),
                    outputBF.toFixed(2),
                    wasteBF.toFixed(2),
                    (parseFloat(result.getValue('custrecord_cls_repack_yield_pct')) || 0).toFixed(1) + '%',
                    result.getText('custrecord_cls_repack_operator')
                ]);

                report.totals.input += inputBF;
                report.totals.output += outputBF;
                report.totals.waste += wasteBF;
                report.totals.count++;

                return true;
            });

            report.totals.avgYield = report.totals.input > 0
                ? (report.totals.output / report.totals.input * 100).toFixed(1) + '%'
                : '0%';

        } catch (e) {
            log.error({ title: 'Repack Summary Error', details: e.message });
            report.error = e.message;
        }

        return report;
    }

    /**
     * Generates Sales by BF Report
     *
     * @param {Object} params - Report parameters
     * @returns {Object} Report data
     */
    function generateSalesBF(params) {
        const report = {
            title: 'Sales by Board Feet Report',
            subtitle: `Generated: ${new Date().toLocaleString()}`,
            columns: ['Order #', 'Date', 'Customer', 'Item', 'Quantity', 'BF Sold', 'Amount'],
            rows: [],
            totals: { bf: 0, amount: 0, orders: 0 }
        };

        try {
            const filters = [
                ['type', 'anyof', 'SalesOrd'],
                'AND',
                ['mainline', 'is', 'F'],
                'AND',
                ['taxline', 'is', 'F'],
                'AND',
                ['shipping', 'is', 'F']
            ].concat(getDateFilter('trandate', params));

            const salesSearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: filters,
                columns: [
                    'tranid',
                    search.createColumn({ name: 'trandate', sort: search.Sort.DESC }),
                    'entity',
                    'item',
                    'quantity',
                    'custcol_cls_bf_total', // Custom BF column
                    'amount'
                ]
            });

            salesSearch.run().each(result => {
                const bf = parseFloat(result.getValue('custcol_cls_bf_total')) || 0;
                const amount = parseFloat(result.getValue('amount')) || 0;

                report.rows.push([
                    result.getValue('tranid'),
                    result.getValue('trandate'),
                    result.getText('entity'),
                    result.getText('item'),
                    result.getValue('quantity'),
                    bf.toFixed(2),
                    '$' + amount.toFixed(2)
                ]);

                report.totals.bf += bf;
                report.totals.amount += amount;
                report.totals.orders++;

                return report.rows.length < 500; // Limit rows
            });

            report.totals.avgPricePerBF = report.totals.bf > 0
                ? '$' + (report.totals.amount / report.totals.bf).toFixed(2)
                : '$0.00';

        } catch (e) {
            log.error({ title: 'Sales BF Error', details: e.message });
            report.error = e.message;
        }

        return report;
    }

    /**
     * Generates Work Order Status Report
     *
     * @param {Object} params - Report parameters
     * @returns {Object} Report data
     */
    function generateWorkOrderStatus(params) {
        const report = {
            title: 'Work Order Status Report',
            subtitle: `Generated: ${new Date().toLocaleString()}`,
            columns: ['Work Order #', 'Item', 'Quantity', 'Status', '% Complete', 'BF Consumed', 'Created'],
            rows: [],
            summary: { active: 0, completed: 0, totalBF: 0 }
        };

        try {
            const filters = [['type', 'anyof', 'WorkOrd']];

            if (params.item) {
                filters.push('AND', ['item', 'anyof', params.item]);
            }

            const woSearch = search.create({
                type: search.Type.WORK_ORDER,
                filters: filters,
                columns: [
                    'tranid',
                    'item',
                    'quantity',
                    'status',
                    'percentcomplete',
                    'custbody_cls_bf_consumed', // Custom BF field
                    search.createColumn({ name: 'created', sort: search.Sort.DESC })
                ]
            });

            woSearch.run().each(result => {
                const status = result.getValue('status');
                const bfConsumed = parseFloat(result.getValue('custbody_cls_bf_consumed')) || 0;

                report.rows.push([
                    result.getValue('tranid'),
                    result.getText('item'),
                    result.getValue('quantity'),
                    result.getText('status'),
                    (parseFloat(result.getValue('percentcomplete')) || 0).toFixed(0) + '%',
                    bfConsumed.toFixed(2),
                    result.getValue('created')
                ]);

                if (status === 'WorkOrd:G') {
                    report.summary.completed++;
                } else {
                    report.summary.active++;
                }
                report.summary.totalBF += bfConsumed;

                return report.rows.length < 500;
            });

        } catch (e) {
            log.error({ title: 'Work Order Status Error', details: e.message });
            report.error = e.message;
        }

        return report;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OUTPUT FORMATTERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Outputs report as HTML
     *
     * @param {Object} response - Response object
     * @param {Object} reportData - Report data
     */
    function outputHTML(response, reportData) {
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${reportData.title}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .header h1 { color: #2c5530; margin-bottom: 5px; }
                .header .subtitle { color: #666; }
                .summary { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                .summary-grid { display: flex; gap: 30px; }
                .summary-item { text-align: center; }
                .summary-value { font-size: 24px; font-weight: bold; color: #2c5530; }
                .summary-label { font-size: 12px; color: #666; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #2c5530; color: white; padding: 12px; text-align: left; }
                td { padding: 10px; border-bottom: 1px solid #ddd; }
                tr:hover { background: #f5f5f5; }
                .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; }
                .totals-row { background: #e9ecef; font-weight: bold; }
                @media print {
                    .no-print { display: none; }
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${reportData.title}</h1>
                <div class="subtitle">${reportData.subtitle}</div>
            </div>

            ${reportData.summary ? buildSummaryHtml(reportData.summary) : ''}
            ${reportData.totals ? buildTotalsHtml(reportData.totals) : ''}

            <table>
                <thead>
                    <tr>
                        ${reportData.columns.map(col => `<th>${col}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${reportData.rows.map(row => `
                        <tr>
                            ${row.map(cell => `<td>${cell}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            ${reportData.byLocation ? buildLocationSummaryHtml(reportData.byLocation) : ''}
            ${reportData.byOperator ? buildOperatorSummaryHtml(reportData.byOperator) : ''}
            ${reportData.agingBuckets ? buildAgingBucketsHtml(reportData.agingBuckets) : ''}

            <div class="footer">
                <p>LumberSuite™ Report Generator | ${new Date().toLocaleString()}</p>
            </div>

            <div class="no-print" style="margin-top: 20px; text-align: center;">
                <button onclick="window.print()">Print Report</button>
                <button onclick="window.close()">Close</button>
            </div>
        </body>
        </html>
        `;

        response.write(html);
    }

    /**
     * Builds summary HTML
     *
     * @param {Object} summary - Summary data
     * @returns {string} HTML content
     */
    function buildSummaryHtml(summary) {
        const items = Object.entries(summary).map(([key, value]) => `
            <div class="summary-item">
                <div class="summary-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>
                <div class="summary-label">${key.replace(/([A-Z])/g, ' $1').trim()}</div>
            </div>
        `).join('');

        return `<div class="summary"><div class="summary-grid">${items}</div></div>`;
    }

    /**
     * Builds totals HTML
     *
     * @param {Object} totals - Totals data
     * @returns {string} HTML content
     */
    function buildTotalsHtml(totals) {
        const items = Object.entries(totals).map(([key, value]) => `
            <div class="summary-item">
                <div class="summary-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>
                <div class="summary-label">${key.replace(/([A-Z])/g, ' $1').trim()}</div>
            </div>
        `).join('');

        return `<div class="summary"><strong>Totals:</strong><div class="summary-grid">${items}</div></div>`;
    }

    /**
     * Builds location summary HTML
     *
     * @param {Array} byLocation - Location data
     * @returns {string} HTML content
     */
    function buildLocationSummaryHtml(byLocation) {
        if (!byLocation || byLocation.length === 0) return '';

        return `
            <h3>By Location</h3>
            <table>
                <thead><tr><th>Location</th><th>BF</th><th>Tallies</th></tr></thead>
                <tbody>
                    ${byLocation.map(loc => `
                        <tr>
                            <td>${loc.location}</td>
                            <td>${loc.bf.toFixed(2)}</td>
                            <td>${loc.tallies}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Builds operator summary HTML
     *
     * @param {Array} byOperator - Operator data
     * @returns {string} HTML content
     */
    function buildOperatorSummaryHtml(byOperator) {
        if (!byOperator || byOperator.length === 0) return '';

        return `
            <h3>By Operator</h3>
            <table>
                <thead><tr><th>Operator</th><th>Operations</th><th>Avg Yield</th></tr></thead>
                <tbody>
                    ${byOperator.map(op => `
                        <tr>
                            <td>${op.name}</td>
                            <td>${op.count}</td>
                            <td>${op.avgYield}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Builds aging buckets HTML
     *
     * @param {Object} buckets - Aging bucket data
     * @returns {string} HTML content
     */
    function buildAgingBucketsHtml(buckets) {
        return `
            <h3>Aging Summary</h3>
            <div class="summary">
                <div class="summary-grid">
                    ${Object.entries(buckets).map(([range, data]) => `
                        <div class="summary-item">
                            <div class="summary-value">${data.count}</div>
                            <div class="summary-label">${range} Days (${data.bf.toFixed(0)} BF)</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Outputs report as CSV
     *
     * @param {Object} response - Response object
     * @param {Object} reportData - Report data
     */
    function outputCSV(response, reportData) {
        let csv = reportData.columns.join(',') + '\n';

        reportData.rows.forEach(row => {
            csv += row.map(cell => {
                // Escape quotes and wrap in quotes if needed
                const str = String(cell).replace(/"/g, '""');
                return str.includes(',') || str.includes('"') || str.includes('\n')
                    ? `"${str}"`
                    : str;
            }).join(',') + '\n';
        });

        response.setHeader({
            name: 'Content-Type',
            value: 'text/csv'
        });
        response.setHeader({
            name: 'Content-Disposition',
            value: `attachment; filename="${reportData.title.replace(/\s+/g, '_')}.csv"`
        });
        response.write(csv);
    }

    /**
     * Outputs report as Excel (CSV with Excel formatting)
     *
     * @param {Object} response - Response object
     * @param {Object} reportData - Report data
     */
    function outputExcel(response, reportData) {
        // Use tab-separated for better Excel compatibility
        let tsv = reportData.columns.join('\t') + '\n';

        reportData.rows.forEach(row => {
            tsv += row.map(cell => String(cell).replace(/\t/g, ' ')).join('\t') + '\n';
        });

        response.setHeader({
            name: 'Content-Type',
            value: 'application/vnd.ms-excel'
        });
        response.setHeader({
            name: 'Content-Disposition',
            value: `attachment; filename="${reportData.title.replace(/\s+/g, '_')}.xls"`
        });
        response.write(tsv);
    }

    /**
     * Outputs report as PDF
     *
     * @param {Object} response - Response object
     * @param {Object} reportData - Report data
     */
    function outputPDF(response, reportData) {
        try {
            // Build XML for PDF rendering
            let xmlContent = `<?xml version="1.0"?>
            <!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
            <pdf>
                <head>
                    <style type="text/css">
                        body { font-family: Arial, sans-serif; font-size: 10pt; }
                        table { width: 100%; border-collapse: collapse; }
                        th { background-color: #2c5530; color: white; padding: 8px; text-align: left; }
                        td { padding: 6px; border-bottom: 1px solid #ddd; }
                        .header { text-align: center; margin-bottom: 20px; }
                        .title { font-size: 16pt; font-weight: bold; color: #2c5530; }
                        .subtitle { font-size: 10pt; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">${xml.escape({ xmlText: reportData.title })}</div>
                        <div class="subtitle">${xml.escape({ xmlText: reportData.subtitle })}</div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                ${reportData.columns.map(col => `<th>${xml.escape({ xmlText: col })}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${reportData.rows.slice(0, 100).map(row => `
                                <tr>
                                    ${row.map(cell => `<td>${xml.escape({ xmlText: String(cell) })}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </body>
            </pdf>`;

            const pdfFile = render.xmlToPdf({
                xmlString: xmlContent
            });

            response.setHeader({
                name: 'Content-Type',
                value: 'application/pdf'
            });
            response.setHeader({
                name: 'Content-Disposition',
                value: `attachment; filename="${reportData.title.replace(/\s+/g, '_')}.pdf"`
            });
            response.writeFile({ file: pdfFile });

        } catch (e) {
            log.error({ title: 'PDF generation error', details: e.message });
            // Fallback to HTML
            outputHTML(response, reportData);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE EXPORTS
    // ═══════════════════════════════════════════════════════════════════════

    return {
        onRequest: onRequest
    };
});
