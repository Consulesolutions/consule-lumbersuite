/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @file cls_yield_analysis_sl.js
 * @description Yield Analysis Suitelet for Consule LumberSuite™
 *              Comprehensive yield reporting and trend analysis dashboard
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module yield/cls_yield_analysis_sl
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/record',
    'N/runtime',
    'N/url',
    'N/format',
    'N/log',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_logger'
], function(
    serverWidget,
    search,
    record,
    runtime,
    url,
    format,
    log,
    Constants,
    SettingsDAO,
    Logger
) {
    'use strict';

    /**
     * Module-level logger instance
     * @type {Object}
     */
    const logger = Logger.createLogger('CLS_YieldAnalysis_SL');

    /**
     * Date range options
     * @type {Array}
     */
    const DATE_RANGES = [
        { value: '7', text: 'Last 7 Days' },
        { value: '30', text: 'Last 30 Days' },
        { value: '90', text: 'Last 90 Days' },
        { value: '180', text: 'Last 6 Months' },
        { value: '365', text: 'Last Year' },
        { value: 'all', text: 'All Time' }
    ];

    /**
     * Main entry point
     *
     * @param {Object} context - Suitelet context
     */
    function onRequest(context) {
        const startTime = Date.now();

        try {
            if (context.request.method === 'GET') {
                renderAnalysisDashboard(context);
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
     * Renders the yield analysis dashboard
     *
     * @param {Object} context - Suitelet context
     */
    function renderAnalysisDashboard(context) {
        const form = serverWidget.createForm({
            title: 'LumberSuite™ Yield Analysis'
        });

        // Get filter parameters
        const params = context.request.parameters;
        const dateRange = params.dateRange || '30';
        const itemFilter = params.item || '';
        const locationFilter = params.location || '';

        // Add filter section
        addFilterSection(form, dateRange, itemFilter, locationFilter);

        // Get yield data
        const yieldData = getYieldData(dateRange, itemFilter, locationFilter);

        // Add dashboard sections
        addSummarySection(form, yieldData);
        addTrendSection(form, yieldData);
        addItemBreakdownSection(form, yieldData);
        addVarianceAnalysisSection(form, yieldData);
        addWasteBreakdownSection(form, yieldData);
        addRecentEntriesSection(form, yieldData);

        // Add export button
        form.addButton({
            id: 'custpage_export',
            label: 'Export to CSV',
            functionName: 'exportToCsv'
        });

        form.clientScriptModulePath = './cls_yield_analysis_cs.js';

        context.response.writePage(form);
    }

    /**
     * Adds filter section to the form
     *
     * @param {Form} form - Server widget form
     * @param {string} dateRange - Selected date range
     * @param {string} itemFilter - Selected item filter
     * @param {string} locationFilter - Selected location filter
     */
    function addFilterSection(form, dateRange, itemFilter, locationFilter) {
        const filterGroup = form.addFieldGroup({
            id: 'custpage_filters',
            label: 'Filters'
        });

        // Date range filter
        const dateField = form.addField({
            id: 'custpage_date_range',
            type: serverWidget.FieldType.SELECT,
            label: 'Date Range',
            container: 'custpage_filters'
        });

        for (const range of DATE_RANGES) {
            dateField.addSelectOption({
                value: range.value,
                text: range.text,
                isSelected: range.value === dateRange
            });
        }

        // Item filter
        const itemField = form.addField({
            id: 'custpage_item_filter',
            type: serverWidget.FieldType.SELECT,
            label: 'Item',
            source: 'item',
            container: 'custpage_filters'
        });

        itemField.addSelectOption({ value: '', text: '- All Items -', isSelected: !itemFilter });

        // Location filter
        const locationField = form.addField({
            id: 'custpage_location_filter',
            type: serverWidget.FieldType.SELECT,
            label: 'Location',
            source: 'location',
            container: 'custpage_filters'
        });

        locationField.addSelectOption({ value: '', text: '- All Locations -', isSelected: !locationFilter });

        // Apply button
        form.addSubmitButton({ label: 'Apply Filters' });
    }

    /**
     * Gets yield data based on filters
     *
     * @param {string} dateRange - Date range filter
     * @param {string} itemFilter - Item filter
     * @param {string} locationFilter - Location filter
     * @returns {Object} Yield data object
     */
    function getYieldData(dateRange, itemFilter, locationFilter) {
        const data = {
            summary: {
                totalEntries: 0,
                totalInputBF: 0,
                totalOutputBF: 0,
                totalWasteBF: 0,
                avgYield: 0,
                minYield: 0,
                maxYield: 0,
                entriesAboveTarget: 0,
                entriesBelowTarget: 0
            },
            trend: [],
            byItem: [],
            byLocation: [],
            varianceDistribution: {
                excellent: 0,
                good: 0,
                warning: 0,
                critical: 0
            },
            wasteBreakdown: {
                sawdust: 0,
                trim: 0,
                defect: 0,
                other: 0,
                uncategorized: 0
            },
            recentEntries: []
        };

        try {
            // Build filters
            const filters = [];

            if (dateRange && dateRange !== 'all') {
                filters.push([Constants.YIELD_FIELDS.YIELD_DATE, 'within', `lastNdays:${dateRange}`]);
            }

            if (itemFilter) {
                if (filters.length > 0) filters.push('AND');
                filters.push([Constants.YIELD_FIELDS.ITEM, 'is', itemFilter]);
            }

            if (locationFilter) {
                if (filters.length > 0) filters.push('AND');
                filters.push([Constants.YIELD_FIELDS.LOCATION, 'is', locationFilter]);
            }

            // Get summary statistics
            data.summary = getYieldSummary(filters);

            // Get trend data
            data.trend = getYieldTrend(filters, dateRange);

            // Get breakdown by item
            data.byItem = getYieldByItem(filters);

            // Get variance distribution
            data.varianceDistribution = getVarianceDistribution(filters);

            // Get waste breakdown
            data.wasteBreakdown = getWasteBreakdown(filters);

            // Get recent entries
            data.recentEntries = getRecentEntries(filters);

        } catch (e) {
            logger.error('getYieldData', `Error: ${e.message}`);
        }

        return data;
    }

    /**
     * Gets yield summary statistics
     *
     * @param {Array} filters - Search filters
     * @returns {Object} Summary statistics
     */
    function getYieldSummary(filters) {
        const summary = {
            totalEntries: 0,
            totalInputBF: 0,
            totalOutputBF: 0,
            totalWasteBF: 0,
            avgYield: 0,
            minYield: 0,
            maxYield: 0,
            entriesAboveTarget: 0,
            entriesBelowTarget: 0
        };

        try {
            const yieldSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: filters,
                columns: [
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.INPUT_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.OUTPUT_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.WASTE_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.AVG }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.MIN }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.MAX })
                ]
            });

            yieldSearch.run().each(function(result) {
                summary.totalEntries = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;

                summary.totalInputBF = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.INPUT_BF,
                    summary: search.Summary.SUM
                })) || 0;

                summary.totalOutputBF = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.OUTPUT_BF,
                    summary: search.Summary.SUM
                })) || 0;

                summary.totalWasteBF = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.WASTE_BF,
                    summary: search.Summary.SUM
                })) || 0;

                summary.avgYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.AVG
                })) || 0;

                summary.minYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.MIN
                })) || 0;

                summary.maxYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.MAX
                })) || 0;

                return false;
            });

            // Count entries above/below target
            const defaultYield = SettingsDAO.getDefaultYieldPercentage() || 85;

            const aboveSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: filters.length > 0 ?
                    filters.concat(['AND', [Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'greaterthanorequalto', defaultYield]]) :
                    [[Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'greaterthanorequalto', defaultYield]],
                columns: [search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })]
            });

            aboveSearch.run().each(function(result) {
                summary.entriesAboveTarget = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;
                return false;
            });

            summary.entriesBelowTarget = summary.totalEntries - summary.entriesAboveTarget;

        } catch (e) {
            logger.error('getYieldSummary', `Error: ${e.message}`);
        }

        return summary;
    }

    /**
     * Gets yield trend data
     *
     * @param {Array} filters - Search filters
     * @param {string} dateRange - Date range
     * @returns {Array} Trend data array
     */
    function getYieldTrend(filters, dateRange) {
        const trend = [];

        try {
            const groupBy = parseInt(dateRange) <= 30 ? 'day' : 'week';

            const trendSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: filters,
                columns: [
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.YIELD_DATE,
                        summary: search.Summary.GROUP,
                        function: groupBy === 'day' ? 'day' : 'weekofyear'
                    }),
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                        summary: search.Summary.AVG
                    }),
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.INPUT_BF,
                        summary: search.Summary.SUM
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })
                ]
            });

            trendSearch.run().each(function(result) {
                trend.push({
                    period: result.getValue({
                        name: Constants.YIELD_FIELDS.YIELD_DATE,
                        summary: search.Summary.GROUP
                    }),
                    avgYield: parseFloat(result.getValue({
                        name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                        summary: search.Summary.AVG
                    })) || 0,
                    totalBF: parseFloat(result.getValue({
                        name: Constants.YIELD_FIELDS.INPUT_BF,
                        summary: search.Summary.SUM
                    })) || 0,
                    count: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })) || 0
                });
                return true;
            });

        } catch (e) {
            logger.error('getYieldTrend', `Error: ${e.message}`);
        }

        return trend;
    }

    /**
     * Gets yield breakdown by item
     *
     * @param {Array} filters - Search filters
     * @returns {Array} Item breakdown array
     */
    function getYieldByItem(filters) {
        const items = [];

        try {
            const itemSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: filters,
                columns: [
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.ITEM,
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                        summary: search.Summary.AVG
                    }),
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.INPUT_BF,
                        summary: search.Summary.SUM
                    }),
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.OUTPUT_BF,
                        summary: search.Summary.SUM
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })
                ]
            });

            itemSearch.run().each(function(result) {
                const itemId = result.getValue({
                    name: Constants.YIELD_FIELDS.ITEM,
                    summary: search.Summary.GROUP
                });

                const itemName = result.getText({
                    name: Constants.YIELD_FIELDS.ITEM,
                    summary: search.Summary.GROUP
                });

                items.push({
                    id: itemId,
                    name: itemName || 'Unknown',
                    avgYield: parseFloat(result.getValue({
                        name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                        summary: search.Summary.AVG
                    })) || 0,
                    inputBF: parseFloat(result.getValue({
                        name: Constants.YIELD_FIELDS.INPUT_BF,
                        summary: search.Summary.SUM
                    })) || 0,
                    outputBF: parseFloat(result.getValue({
                        name: Constants.YIELD_FIELDS.OUTPUT_BF,
                        summary: search.Summary.SUM
                    })) || 0,
                    entries: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })) || 0
                });

                return items.length < 20; // Limit to top 20
            });

            // Sort by total input BF descending
            items.sort((a, b) => b.inputBF - a.inputBF);

        } catch (e) {
            logger.error('getYieldByItem', `Error: ${e.message}`);
        }

        return items;
    }

    /**
     * Gets variance distribution
     *
     * @param {Array} filters - Search filters
     * @returns {Object} Variance distribution
     */
    function getVarianceDistribution(filters) {
        const distribution = {
            excellent: 0,
            good: 0,
            warning: 0,
            critical: 0
        };

        try {
            const defaultYield = SettingsDAO.getDefaultYieldPercentage() || 85;

            // Excellent: variance >= 0 (at or above target)
            const excellentFilters = filters.length > 0 ?
                filters.concat(['AND', [Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'greaterthanorequalto', defaultYield]]) :
                [[Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'greaterthanorequalto', defaultYield]];

            distribution.excellent = countEntries(excellentFilters);

            // Good: variance -5% to 0%
            const goodFilters = filters.length > 0 ?
                filters.concat(['AND', [Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'between', defaultYield - 5, defaultYield - 0.01]]) :
                [[Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'between', defaultYield - 5, defaultYield - 0.01]];

            distribution.good = countEntries(goodFilters);

            // Warning: variance -15% to -5%
            const warningFilters = filters.length > 0 ?
                filters.concat(['AND', [Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'between', defaultYield - 15, defaultYield - 5.01]]) :
                [[Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'between', defaultYield - 15, defaultYield - 5.01]];

            distribution.warning = countEntries(warningFilters);

            // Critical: variance < -15%
            const criticalFilters = filters.length > 0 ?
                filters.concat(['AND', [Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'lessthan', defaultYield - 15]]) :
                [[Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'lessthan', defaultYield - 15]];

            distribution.critical = countEntries(criticalFilters);

        } catch (e) {
            logger.error('getVarianceDistribution', `Error: ${e.message}`);
        }

        return distribution;
    }

    /**
     * Counts entries matching filters
     *
     * @param {Array} filters - Search filters
     * @returns {number} Entry count
     */
    function countEntries(filters) {
        try {
            const countSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: filters,
                columns: [search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })]
            });

            let count = 0;
            countSearch.run().each(function(result) {
                count = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;
                return false;
            });

            return count;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Gets waste breakdown
     *
     * @param {Array} filters - Search filters
     * @returns {Object} Waste breakdown
     */
    function getWasteBreakdown(filters) {
        const breakdown = {
            sawdust: 0,
            trim: 0,
            defect: 0,
            other: 0,
            uncategorized: 0
        };

        try {
            const wasteSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: filters,
                columns: [
                    search.createColumn({ name: Constants.YIELD_FIELDS.SAWDUST_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.TRIM_WASTE_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.DEFECT_WASTE_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.OTHER_WASTE_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.WASTE_BF, summary: search.Summary.SUM })
                ]
            });

            wasteSearch.run().each(function(result) {
                breakdown.sawdust = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.SAWDUST_BF,
                    summary: search.Summary.SUM
                })) || 0;

                breakdown.trim = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.TRIM_WASTE_BF,
                    summary: search.Summary.SUM
                })) || 0;

                breakdown.defect = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.DEFECT_WASTE_BF,
                    summary: search.Summary.SUM
                })) || 0;

                breakdown.other = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.OTHER_WASTE_BF,
                    summary: search.Summary.SUM
                })) || 0;

                const totalWaste = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.WASTE_BF,
                    summary: search.Summary.SUM
                })) || 0;

                const categorized = breakdown.sawdust + breakdown.trim + breakdown.defect + breakdown.other;
                breakdown.uncategorized = Math.max(0, totalWaste - categorized);

                return false;
            });

        } catch (e) {
            logger.error('getWasteBreakdown', `Error: ${e.message}`);
        }

        return breakdown;
    }

    /**
     * Gets recent yield entries
     *
     * @param {Array} filters - Search filters
     * @returns {Array} Recent entries
     */
    function getRecentEntries(filters) {
        const entries = [];

        try {
            const recentSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: filters,
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_DATE, sort: search.Sort.DESC }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.ITEM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.INPUT_BF }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.OUTPUT_BF }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.WASTE_BF }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.SOURCE_TRANSACTION })
                ]
            });

            recentSearch.run().each(function(result) {
                entries.push({
                    id: result.id,
                    date: result.getValue({ name: Constants.YIELD_FIELDS.YIELD_DATE }),
                    item: result.getText({ name: Constants.YIELD_FIELDS.ITEM }) || 'N/A',
                    inputBF: parseFloat(result.getValue({ name: Constants.YIELD_FIELDS.INPUT_BF })) || 0,
                    outputBF: parseFloat(result.getValue({ name: Constants.YIELD_FIELDS.OUTPUT_BF })) || 0,
                    yieldPct: parseFloat(result.getValue({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE })) || 0,
                    wasteBF: parseFloat(result.getValue({ name: Constants.YIELD_FIELDS.WASTE_BF })) || 0,
                    sourceId: result.getValue({ name: Constants.YIELD_FIELDS.SOURCE_TRANSACTION })
                });

                return entries.length < 20;
            });

        } catch (e) {
            logger.error('getRecentEntries', `Error: ${e.message}`);
        }

        return entries;
    }

    /**
     * Adds summary section to the form
     *
     * @param {Form} form - Server widget form
     * @param {Object} data - Yield data
     */
    function addSummarySection(form, data) {
        const summaryGroup = form.addFieldGroup({
            id: 'custpage_summary',
            label: 'Yield Summary'
        });

        const summary = data.summary;
        const defaultYield = SettingsDAO.getDefaultYieldPercentage() || 85;

        let html = '<div style="display:flex; flex-wrap:wrap; gap:15px;">';

        // Total Entries
        html += createMetricCard('Total Entries', summary.totalEntries.toString(), '#607799');

        // Average Yield
        const yieldColor = summary.avgYield >= defaultYield ? '#28a745' : '#dc3545';
        html += createMetricCard('Average Yield', `${summary.avgYield.toFixed(1)}%`, yieldColor);

        // Total Input BF
        html += createMetricCard('Total Input BF', formatNumber(summary.totalInputBF), '#17a2b8');

        // Total Output BF
        html += createMetricCard('Total Output BF', formatNumber(summary.totalOutputBF), '#28a745');

        // Total Waste BF
        html += createMetricCard('Total Waste BF', formatNumber(summary.totalWasteBF), '#ffc107');

        // Yield Range
        html += createMetricCard('Yield Range', `${summary.minYield.toFixed(1)}% - ${summary.maxYield.toFixed(1)}%`, '#6c757d');

        html += '</div>';

        // Performance indicator
        const pctAboveTarget = summary.totalEntries > 0 ?
            (summary.entriesAboveTarget / summary.totalEntries * 100) : 0;

        html += '<div style="margin-top:20px; padding:15px; background:#f8f9fa; border-radius:4px;">';
        html += `<strong>Performance:</strong> ${summary.entriesAboveTarget} of ${summary.totalEntries} entries `;
        html += `(${pctAboveTarget.toFixed(1)}%) met or exceeded the ${defaultYield}% yield target.`;
        html += '</div>';

        const summaryField = form.addField({
            id: 'custpage_summary_display',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' ',
            container: 'custpage_summary'
        });

        summaryField.defaultValue = html;
    }

    /**
     * Creates a metric card HTML
     *
     * @param {string} label - Card label
     * @param {string} value - Card value
     * @param {string} color - Accent color
     * @returns {string} HTML string
     */
    function createMetricCard(label, value, color) {
        return `
            <div style="flex:1; min-width:150px; padding:15px; background:#fff; border-left:4px solid ${color}; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                <div style="font-size:24px; font-weight:bold; color:${color};">${value}</div>
                <div style="color:#666; font-size:12px;">${label}</div>
            </div>
        `;
    }

    /**
     * Adds trend section to the form
     *
     * @param {Form} form - Server widget form
     * @param {Object} data - Yield data
     */
    function addTrendSection(form, data) {
        const trendGroup = form.addFieldGroup({
            id: 'custpage_trend',
            label: 'Yield Trend'
        });

        const trend = data.trend;
        const defaultYield = SettingsDAO.getDefaultYieldPercentage() || 85;

        let html = '<div style="padding:10px;">';

        if (trend.length === 0) {
            html += '<p style="color:#666; text-align:center;">No trend data available for the selected period.</p>';
        } else {
            const maxYield = Math.max(...trend.map(t => t.avgYield), defaultYield + 10);

            html += '<div style="display:flex; align-items:flex-end; justify-content:space-between; height:200px; padding:20px 0; border-bottom:1px solid #ddd; position:relative;">';

            // Target line
            const targetPosition = ((defaultYield / maxYield) * 100);
            html += `<div style="position:absolute; left:0; right:0; bottom:${targetPosition}%; border-top:2px dashed #dc3545; z-index:1;">`;
            html += `<span style="position:absolute; right:0; top:-20px; font-size:10px; color:#dc3545;">Target: ${defaultYield}%</span>`;
            html += '</div>';

            for (const point of trend) {
                const height = (point.avgYield / maxYield * 100);
                const barColor = point.avgYield >= defaultYield ? '#28a745' : '#ffc107';

                html += '<div style="flex:1; margin:0 2px; text-align:center; position:relative; z-index:2;">';
                html += `<div style="background:${barColor}; height:${height}%; min-height:5px; border-radius:2px 2px 0 0;" `;
                html += `title="${point.period}: ${point.avgYield.toFixed(1)}%"></div>`;
                html += `<div style="font-size:9px; color:#666; margin-top:5px; transform:rotate(-45deg); white-space:nowrap;">${point.period}</div>`;
                html += '</div>';
            }

            html += '</div>';
        }

        html += '</div>';

        const trendField = form.addField({
            id: 'custpage_trend_display',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' ',
            container: 'custpage_trend'
        });

        trendField.defaultValue = html;
    }

    /**
     * Adds item breakdown section
     *
     * @param {Form} form - Server widget form
     * @param {Object} data - Yield data
     */
    function addItemBreakdownSection(form, data) {
        const itemGroup = form.addFieldGroup({
            id: 'custpage_items',
            label: 'Yield by Item'
        });

        const items = data.byItem;
        const defaultYield = SettingsDAO.getDefaultYieldPercentage() || 85;

        let html = '<table style="width:100%; border-collapse:collapse;">';
        html += '<tr style="background:#607799; color:#fff;">';
        html += '<th style="padding:10px; text-align:left;">Item</th>';
        html += '<th style="padding:10px; text-align:right;">Entries</th>';
        html += '<th style="padding:10px; text-align:right;">Input BF</th>';
        html += '<th style="padding:10px; text-align:right;">Output BF</th>';
        html += '<th style="padding:10px; text-align:right;">Avg Yield</th>';
        html += '<th style="padding:10px; text-align:center;">Status</th>';
        html += '</tr>';

        if (items.length === 0) {
            html += '<tr><td colspan="6" style="padding:20px; text-align:center; color:#666;">No item data available.</td></tr>';
        } else {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const bgColor = i % 2 === 0 ? '#fff' : '#f9f9f9';
                const yieldColor = item.avgYield >= defaultYield ? '#28a745' : '#dc3545';
                const statusIcon = item.avgYield >= defaultYield ? '&#10004;' : '&#9888;';

                html += `<tr style="background:${bgColor};">`;
                html += `<td style="padding:10px; border-bottom:1px solid #eee;">${item.name}</td>`;
                html += `<td style="padding:10px; text-align:right; border-bottom:1px solid #eee;">${item.entries}</td>`;
                html += `<td style="padding:10px; text-align:right; border-bottom:1px solid #eee;">${formatNumber(item.inputBF)}</td>`;
                html += `<td style="padding:10px; text-align:right; border-bottom:1px solid #eee;">${formatNumber(item.outputBF)}</td>`;
                html += `<td style="padding:10px; text-align:right; border-bottom:1px solid #eee; color:${yieldColor}; font-weight:bold;">${item.avgYield.toFixed(1)}%</td>`;
                html += `<td style="padding:10px; text-align:center; border-bottom:1px solid #eee; color:${yieldColor};">${statusIcon}</td>`;
                html += '</tr>';
            }
        }

        html += '</table>';

        const itemField = form.addField({
            id: 'custpage_items_display',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' ',
            container: 'custpage_items'
        });

        itemField.defaultValue = html;
    }

    /**
     * Adds variance analysis section
     *
     * @param {Form} form - Server widget form
     * @param {Object} data - Yield data
     */
    function addVarianceAnalysisSection(form, data) {
        const varianceGroup = form.addFieldGroup({
            id: 'custpage_variance',
            label: 'Variance Distribution'
        });

        const dist = data.varianceDistribution;
        const total = dist.excellent + dist.good + dist.warning + dist.critical;

        let html = '<div style="display:flex; gap:20px; padding:15px;">';

        // Pie chart representation using bars
        html += '<div style="flex:1;">';
        html += '<table style="width:100%;">';

        const categories = [
            { name: 'Excellent (At/Above Target)', count: dist.excellent, color: '#28a745' },
            { name: 'Good (-5% to 0%)', count: dist.good, color: '#17a2b8' },
            { name: 'Warning (-15% to -5%)', count: dist.warning, color: '#ffc107' },
            { name: 'Critical (Below -15%)', count: dist.critical, color: '#dc3545' }
        ];

        for (const cat of categories) {
            const pct = total > 0 ? (cat.count / total * 100) : 0;
            html += '<tr>';
            html += `<td style="padding:8px; width:200px;">${cat.name}</td>`;
            html += '<td style="padding:8px;">';
            html += `<div style="background:#eee; border-radius:4px; overflow:hidden;">`;
            html += `<div style="background:${cat.color}; height:20px; width:${pct}%;"></div>`;
            html += '</div></td>';
            html += `<td style="padding:8px; text-align:right; width:100px;">${cat.count} (${pct.toFixed(1)}%)</td>`;
            html += '</tr>';
        }

        html += '</table>';
        html += '</div>';

        html += '</div>';

        const varianceField = form.addField({
            id: 'custpage_variance_display',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' ',
            container: 'custpage_variance'
        });

        varianceField.defaultValue = html;
    }

    /**
     * Adds waste breakdown section
     *
     * @param {Form} form - Server widget form
     * @param {Object} data - Yield data
     */
    function addWasteBreakdownSection(form, data) {
        const wasteGroup = form.addFieldGroup({
            id: 'custpage_waste',
            label: 'Waste Breakdown'
        });

        const waste = data.wasteBreakdown;
        const total = waste.sawdust + waste.trim + waste.defect + waste.other + waste.uncategorized;

        let html = '<div style="display:flex; gap:20px; padding:15px;">';

        const categories = [
            { name: 'Sawdust', value: waste.sawdust, color: '#8B4513' },
            { name: 'Trim Waste', value: waste.trim, color: '#A0522D' },
            { name: 'Defect Waste', value: waste.defect, color: '#D2691E' },
            { name: 'Other', value: waste.other, color: '#CD853F' },
            { name: 'Uncategorized', value: waste.uncategorized, color: '#DEB887' }
        ];

        html += '<div style="flex:1;">';
        html += '<table style="width:100%;">';

        for (const cat of categories) {
            const pct = total > 0 ? (cat.value / total * 100) : 0;
            html += '<tr>';
            html += `<td style="padding:8px;"><span style="display:inline-block; width:12px; height:12px; background:${cat.color}; border-radius:2px; margin-right:8px;"></span>${cat.name}</td>`;
            html += `<td style="padding:8px; text-align:right;">${formatNumber(cat.value)} BF</td>`;
            html += `<td style="padding:8px; text-align:right; color:#666;">${pct.toFixed(1)}%</td>`;
            html += '</tr>';
        }

        html += '<tr style="border-top:2px solid #333; font-weight:bold;">';
        html += '<td style="padding:8px;">Total Waste</td>';
        html += `<td style="padding:8px; text-align:right;">${formatNumber(total)} BF</td>`;
        html += '<td style="padding:8px; text-align:right;">100%</td>';
        html += '</tr>';

        html += '</table>';
        html += '</div>';

        html += '</div>';

        const wasteField = form.addField({
            id: 'custpage_waste_display',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' ',
            container: 'custpage_waste'
        });

        wasteField.defaultValue = html;
    }

    /**
     * Adds recent entries section
     *
     * @param {Form} form - Server widget form
     * @param {Object} data - Yield data
     */
    function addRecentEntriesSection(form, data) {
        const recentGroup = form.addFieldGroup({
            id: 'custpage_recent',
            label: 'Recent Yield Entries'
        });

        const entries = data.recentEntries;
        const defaultYield = SettingsDAO.getDefaultYieldPercentage() || 85;

        let html = '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
        html += '<tr style="background:#607799; color:#fff;">';
        html += '<th style="padding:8px; text-align:left;">Date</th>';
        html += '<th style="padding:8px; text-align:left;">Item</th>';
        html += '<th style="padding:8px; text-align:right;">Input BF</th>';
        html += '<th style="padding:8px; text-align:right;">Output BF</th>';
        html += '<th style="padding:8px; text-align:right;">Waste BF</th>';
        html += '<th style="padding:8px; text-align:right;">Yield</th>';
        html += '<th style="padding:8px; text-align:center;">View</th>';
        html += '</tr>';

        if (entries.length === 0) {
            html += '<tr><td colspan="7" style="padding:20px; text-align:center; color:#666;">No recent entries.</td></tr>';
        } else {
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const bgColor = i % 2 === 0 ? '#fff' : '#f9f9f9';
                const yieldColor = entry.yieldPct >= defaultYield ? '#28a745' : '#dc3545';

                const viewUrl = url.resolveRecord({
                    recordType: Constants.RECORD_TYPES.YIELD_REGISTER,
                    recordId: entry.id
                });

                html += `<tr style="background:${bgColor};">`;
                html += `<td style="padding:8px; border-bottom:1px solid #eee;">${entry.date}</td>`;
                html += `<td style="padding:8px; border-bottom:1px solid #eee;">${entry.item}</td>`;
                html += `<td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">${entry.inputBF.toFixed(2)}</td>`;
                html += `<td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">${entry.outputBF.toFixed(2)}</td>`;
                html += `<td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">${entry.wasteBF.toFixed(2)}</td>`;
                html += `<td style="padding:8px; text-align:right; border-bottom:1px solid #eee; color:${yieldColor}; font-weight:bold;">${entry.yieldPct.toFixed(1)}%</td>`;
                html += `<td style="padding:8px; text-align:center; border-bottom:1px solid #eee;"><a href="${viewUrl}" target="_blank">View</a></td>`;
                html += '</tr>';
            }
        }

        html += '</table>';

        const recentField = form.addField({
            id: 'custpage_recent_display',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' ',
            container: 'custpage_recent'
        });

        recentField.defaultValue = html;
    }

    /**
     * Handles POST request
     *
     * @param {Object} context - Suitelet context
     */
    function handlePostRequest(context) {
        const params = context.request.parameters;

        const redirectUrl = url.resolveScript({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId,
            params: {
                dateRange: params.custpage_date_range || '30',
                item: params.custpage_item_filter || '',
                location: params.custpage_location_filter || ''
            }
        });

        context.response.sendRedirect({ url: redirectUrl });
    }

    /**
     * Formats a number with thousands separators
     *
     * @param {number} num - Number to format
     * @returns {string} Formatted number
     */
    function formatNumber(num) {
        if (typeof num !== 'number') return '0';
        return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }

    return {
        onRequest: onRequest
    };
});
