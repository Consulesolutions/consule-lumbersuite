/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @file cls_report_scheduler_mr.js
 * @description Report Scheduler Map/Reduce Script for Consule LumberSuite™
 *              Generates and distributes scheduled reports automatically
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module reporting/cls_report_scheduler_mr
 */

define([
    'N/record',
    'N/search',
    'N/runtime',
    'N/email',
    'N/file',
    'N/render',
    'N/format',
    'N/url',
    '../lib/cls_settings_dao',
    '../lib/cls_lumber_constants'
], function(
    record,
    search,
    runtime,
    email,
    file,
    render,
    format,
    url,
    settingsDAO,
    constants
) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    const REPORT_TYPES = {
        DAILY_PRODUCTION: 'daily_production',
        DAILY_YIELD: 'daily_yield',
        WEEKLY_SUMMARY: 'weekly_summary',
        MONTHLY_SUMMARY: 'monthly_summary',
        INVENTORY_SNAPSHOT: 'inventory_snapshot',
        LOW_YIELD_ALERT: 'low_yield_alert',
        AGING_ALERT: 'aging_alert'
    };

    const SCHEDULE_FREQUENCY = {
        DAILY: 'daily',
        WEEKLY: 'weekly',
        MONTHLY: 'monthly'
    };

    const OUTPUT_FOLDER_ID = null; // Set via script parameter

    // ═══════════════════════════════════════════════════════════════════════
    // GET INPUT DATA
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * getInputData Entry Point
     *
     * @returns {Array} Input data for processing
     */
    function getInputData() {
        log.audit({
            title: 'Report Scheduler Started',
            details: `Execution: ${new Date().toISOString()}`
        });

        const scheduledReports = getScheduledReports();

        log.debug({
            title: 'Reports to Generate',
            details: `Found ${scheduledReports.length} scheduled reports`
        });

        return scheduledReports;
    }

    /**
     * Gets scheduled reports due for generation
     *
     * @returns {Array} Scheduled reports
     */
    function getScheduledReports() {
        const reports = [];
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday
        const dayOfMonth = today.getDate();

        // Check for scheduled report configurations
        try {
            const scheduleSearch = search.create({
                type: 'customrecord_cls_report_schedule',
                filters: [
                    ['isinactive', 'is', 'F']
                ],
                columns: [
                    'custrecord_cls_sched_report_type',
                    'custrecord_cls_sched_frequency',
                    'custrecord_cls_sched_day',
                    'custrecord_cls_sched_recipients',
                    'custrecord_cls_sched_filters',
                    'custrecord_cls_sched_output_format',
                    'custrecord_cls_sched_last_run'
                ]
            });

            scheduleSearch.run().each(result => {
                const frequency = result.getValue('custrecord_cls_sched_frequency');
                const schedDay = parseInt(result.getValue('custrecord_cls_sched_day'), 10) || 1;
                let shouldRun = false;

                switch (frequency) {
                    case SCHEDULE_FREQUENCY.DAILY:
                        shouldRun = true;
                        break;
                    case SCHEDULE_FREQUENCY.WEEKLY:
                        shouldRun = (dayOfWeek === schedDay);
                        break;
                    case SCHEDULE_FREQUENCY.MONTHLY:
                        shouldRun = (dayOfMonth === schedDay);
                        break;
                }

                if (shouldRun) {
                    reports.push({
                        scheduleId: result.id,
                        reportType: result.getValue('custrecord_cls_sched_report_type'),
                        frequency: frequency,
                        recipients: result.getValue('custrecord_cls_sched_recipients'),
                        filters: result.getValue('custrecord_cls_sched_filters'),
                        outputFormat: result.getValue('custrecord_cls_sched_output_format') || 'pdf'
                    });
                }

                return true;
            });

        } catch (e) {
            log.debug({
                title: 'No schedule records found',
                details: 'Using default report schedule'
            });
        }

        // Add default daily reports if no custom schedules
        if (reports.length === 0) {
            reports.push({
                reportType: REPORT_TYPES.DAILY_PRODUCTION,
                frequency: SCHEDULE_FREQUENCY.DAILY,
                isDefault: true
            });

            reports.push({
                reportType: REPORT_TYPES.DAILY_YIELD,
                frequency: SCHEDULE_FREQUENCY.DAILY,
                isDefault: true
            });

            // Add weekly summary on Monday
            if (dayOfWeek === 1) {
                reports.push({
                    reportType: REPORT_TYPES.WEEKLY_SUMMARY,
                    frequency: SCHEDULE_FREQUENCY.WEEKLY,
                    isDefault: true
                });
            }

            // Add monthly summary on 1st
            if (dayOfMonth === 1) {
                reports.push({
                    reportType: REPORT_TYPES.MONTHLY_SUMMARY,
                    frequency: SCHEDULE_FREQUENCY.MONTHLY,
                    isDefault: true
                });
            }
        }

        // Always check for alerts
        reports.push({
            reportType: REPORT_TYPES.LOW_YIELD_ALERT,
            frequency: SCHEDULE_FREQUENCY.DAILY,
            isAlert: true
        });

        reports.push({
            reportType: REPORT_TYPES.AGING_ALERT,
            frequency: SCHEDULE_FREQUENCY.DAILY,
            isAlert: true
        });

        return reports;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MAP
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * map Entry Point
     *
     * @param {Object} context - Map context
     */
    function map(context) {
        const reportConfig = JSON.parse(context.value);

        try {
            log.debug({
                title: 'Generating Report',
                details: `Type: ${reportConfig.reportType}`
            });

            let result;

            switch (reportConfig.reportType) {
                case REPORT_TYPES.DAILY_PRODUCTION:
                    result = generateDailyProduction(reportConfig);
                    break;

                case REPORT_TYPES.DAILY_YIELD:
                    result = generateDailyYield(reportConfig);
                    break;

                case REPORT_TYPES.WEEKLY_SUMMARY:
                    result = generateWeeklySummary(reportConfig);
                    break;

                case REPORT_TYPES.MONTHLY_SUMMARY:
                    result = generateMonthlySummary(reportConfig);
                    break;

                case REPORT_TYPES.INVENTORY_SNAPSHOT:
                    result = generateInventorySnapshot(reportConfig);
                    break;

                case REPORT_TYPES.LOW_YIELD_ALERT:
                    result = checkLowYieldAlerts(reportConfig);
                    break;

                case REPORT_TYPES.AGING_ALERT:
                    result = checkAgingAlerts(reportConfig);
                    break;

                default:
                    result = { success: false, message: 'Unknown report type' };
            }

            context.write({
                key: reportConfig.reportType,
                value: JSON.stringify(result)
            });

        } catch (e) {
            log.error({
                title: `Error generating ${reportConfig.reportType}`,
                details: e.message
            });

            context.write({
                key: reportConfig.reportType,
                value: JSON.stringify({
                    success: false,
                    error: e.message
                })
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REPORT GENERATORS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Generates daily production report
     *
     * @param {Object} config - Report configuration
     * @returns {Object} Report result
     */
    function generateDailyProduction(config) {
        const report = {
            title: 'Daily Production Report',
            date: format.format({ value: new Date(), type: format.Type.DATE }),
            data: {
                workOrdersCompleted: 0,
                totalOutputBF: 0,
                totalInputBF: 0,
                avgYield: 0,
                byItem: [],
                byOperator: []
            }
        };

        try {
            // Get yesterday's production data
            const prodSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [
                    ['custrecord_cls_yield_date', 'on', 'yesterday']
                ],
                columns: [
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_input_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })
                ]
            });

            prodSearch.run().each(result => {
                report.data.workOrdersCompleted = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                report.data.totalOutputBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_output_bf',
                    summary: search.Summary.SUM
                })) || 0;
                report.data.totalInputBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_input_bf',
                    summary: search.Summary.SUM
                })) || 0;
                report.data.avgYield = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_percentage',
                    summary: search.Summary.AVG
                })) || 0;
                return true;
            });

            // Get by item breakdown
            const itemSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [['custrecord_cls_yield_date', 'on', 'yesterday']],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_item', summary: search.Summary.GROUP }),
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM })
                ]
            });

            itemSearch.run().each(result => {
                report.data.byItem.push({
                    item: result.getText({
                        name: 'custrecord_cls_yield_item',
                        summary: search.Summary.GROUP
                    }),
                    bf: parseFloat(result.getValue({
                        name: 'custrecord_cls_yield_output_bf',
                        summary: search.Summary.SUM
                    })) || 0
                });
                return true;
            });

            // Generate and save report
            const fileId = saveReportFile(report, config);

            // Send email if recipients configured
            if (config.recipients) {
                sendReportEmail(report, config, fileId);
            }

            // Update last run time
            if (config.scheduleId) {
                updateLastRunTime(config.scheduleId);
            }

            return {
                success: true,
                reportType: REPORT_TYPES.DAILY_PRODUCTION,
                fileId: fileId,
                data: report.data
            };

        } catch (e) {
            log.error({ title: 'Daily production report error', details: e.message });
            return { success: false, error: e.message };
        }
    }

    /**
     * Generates daily yield report
     *
     * @param {Object} config - Report configuration
     * @returns {Object} Report result
     */
    function generateDailyYield(config) {
        const report = {
            title: 'Daily Yield Report',
            date: format.format({ value: new Date(), type: format.Type.DATE }),
            data: {
                avgYield: 0,
                operationsCount: 0,
                byType: [],
                lowYieldOperations: []
            }
        };

        try {
            // Get yesterday's yield summary
            const yieldSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [['custrecord_cls_yield_date', 'on', 'yesterday']],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            yieldSearch.run().each(result => {
                report.data.avgYield = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_percentage',
                    summary: search.Summary.AVG
                })) || 0;
                report.data.operationsCount = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                return true;
            });

            // Get by operation type
            const typeSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [['custrecord_cls_yield_date', 'on', 'yesterday']],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_operation', summary: search.Summary.GROUP }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            typeSearch.run().each(result => {
                report.data.byType.push({
                    type: result.getText({
                        name: 'custrecord_cls_yield_operation',
                        summary: search.Summary.GROUP
                    }) || 'Unknown',
                    avgYield: parseFloat(result.getValue({
                        name: 'custrecord_cls_yield_percentage',
                        summary: search.Summary.AVG
                    })) || 0,
                    count: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }), 10) || 0
                });
                return true;
            });

            // Get low yield operations (below 70%)
            const lowYieldSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [
                    ['custrecord_cls_yield_date', 'on', 'yesterday'],
                    'AND',
                    ['custrecord_cls_yield_percentage', 'lessthan', 70]
                ],
                columns: [
                    'custrecord_cls_yield_source_ref',
                    'custrecord_cls_yield_operation',
                    'custrecord_cls_yield_percentage',
                    'custrecord_cls_yield_operator'
                ]
            });

            lowYieldSearch.run().each(result => {
                report.data.lowYieldOperations.push({
                    reference: result.getValue('custrecord_cls_yield_source_ref'),
                    type: result.getText('custrecord_cls_yield_operation'),
                    yield: parseFloat(result.getValue('custrecord_cls_yield_percentage')) || 0,
                    operator: result.getText('custrecord_cls_yield_operator')
                });
                return true;
            });

            const fileId = saveReportFile(report, config);

            if (config.recipients) {
                sendReportEmail(report, config, fileId);
            }

            if (config.scheduleId) {
                updateLastRunTime(config.scheduleId);
            }

            return {
                success: true,
                reportType: REPORT_TYPES.DAILY_YIELD,
                fileId: fileId,
                data: report.data
            };

        } catch (e) {
            log.error({ title: 'Daily yield report error', details: e.message });
            return { success: false, error: e.message };
        }
    }

    /**
     * Generates weekly summary report
     *
     * @param {Object} config - Report configuration
     * @returns {Object} Report result
     */
    function generateWeeklySummary(config) {
        const report = {
            title: 'Weekly Production Summary',
            date: format.format({ value: new Date(), type: format.Type.DATE }),
            period: 'Last 7 Days',
            data: {
                totalProduction: 0,
                avgDailyProduction: 0,
                avgYield: 0,
                totalWaste: 0,
                topItems: [],
                dailyBreakdown: []
            }
        };

        try {
            // Get weekly totals
            const weeklySearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [['custrecord_cls_yield_date', 'within', 'lastweektodate']],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_waste_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })
                ]
            });

            weeklySearch.run().each(result => {
                report.data.totalProduction = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_output_bf',
                    summary: search.Summary.SUM
                })) || 0;
                report.data.totalWaste = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_waste_bf',
                    summary: search.Summary.SUM
                })) || 0;
                report.data.avgYield = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_percentage',
                    summary: search.Summary.AVG
                })) || 0;
                return true;
            });

            report.data.avgDailyProduction = report.data.totalProduction / 7;

            // Get daily breakdown
            const dailySearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [['custrecord_cls_yield_date', 'within', 'lastweektodate']],
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

            dailySearch.run().each(result => {
                report.data.dailyBreakdown.push({
                    date: result.getValue({
                        name: 'custrecord_cls_yield_date',
                        summary: search.Summary.GROUP
                    }),
                    bf: parseFloat(result.getValue({
                        name: 'custrecord_cls_yield_output_bf',
                        summary: search.Summary.SUM
                    })) || 0,
                    yield: parseFloat(result.getValue({
                        name: 'custrecord_cls_yield_percentage',
                        summary: search.Summary.AVG
                    })) || 0
                });
                return true;
            });

            const fileId = saveReportFile(report, config);

            if (config.recipients) {
                sendReportEmail(report, config, fileId);
            }

            if (config.scheduleId) {
                updateLastRunTime(config.scheduleId);
            }

            return {
                success: true,
                reportType: REPORT_TYPES.WEEKLY_SUMMARY,
                fileId: fileId,
                data: report.data
            };

        } catch (e) {
            log.error({ title: 'Weekly summary error', details: e.message });
            return { success: false, error: e.message };
        }
    }

    /**
     * Generates monthly summary report
     *
     * @param {Object} config - Report configuration
     * @returns {Object} Report result
     */
    function generateMonthlySummary(config) {
        const report = {
            title: 'Monthly Production Summary',
            date: format.format({ value: new Date(), type: format.Type.DATE }),
            period: 'Last Month',
            data: {
                totalProduction: 0,
                avgYield: 0,
                comparisonToPrevious: 0,
                inventoryChange: 0,
                topPerformers: [],
                needsImprovement: []
            }
        };

        try {
            // Get last month's totals
            const monthlySearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [['custrecord_cls_yield_date', 'within', 'lastmonthtodate']],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })
                ]
            });

            monthlySearch.run().each(result => {
                report.data.totalProduction = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_output_bf',
                    summary: search.Summary.SUM
                })) || 0;
                report.data.avgYield = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_percentage',
                    summary: search.Summary.AVG
                })) || 0;
                return true;
            });

            // Get top performers by yield
            const topSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [
                    ['custrecord_cls_yield_date', 'within', 'lastmonthtodate'],
                    'AND',
                    ['custrecord_cls_yield_operator', 'noneof', '@NONE@']
                ],
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_yield_operator',
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({
                        name: 'custrecord_cls_yield_percentage',
                        summary: search.Summary.AVG,
                        sort: search.Sort.DESC
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })
                ]
            });

            const operators = [];
            topSearch.run().each(result => {
                operators.push({
                    name: result.getText({
                        name: 'custrecord_cls_yield_operator',
                        summary: search.Summary.GROUP
                    }),
                    avgYield: parseFloat(result.getValue({
                        name: 'custrecord_cls_yield_percentage',
                        summary: search.Summary.AVG
                    })) || 0,
                    operations: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }), 10) || 0
                });
                return true;
            });

            report.data.topPerformers = operators.slice(0, 5);
            report.data.needsImprovement = operators.slice(-3).reverse();

            const fileId = saveReportFile(report, config);

            if (config.recipients) {
                sendReportEmail(report, config, fileId);
            }

            if (config.scheduleId) {
                updateLastRunTime(config.scheduleId);
            }

            return {
                success: true,
                reportType: REPORT_TYPES.MONTHLY_SUMMARY,
                fileId: fileId,
                data: report.data
            };

        } catch (e) {
            log.error({ title: 'Monthly summary error', details: e.message });
            return { success: false, error: e.message };
        }
    }

    /**
     * Generates inventory snapshot report
     *
     * @param {Object} config - Report configuration
     * @returns {Object} Report result
     */
    function generateInventorySnapshot(config) {
        const report = {
            title: 'Inventory Snapshot',
            date: format.format({ value: new Date(), type: format.Type.DATE }),
            data: {
                totalBF: 0,
                activeTallies: 0,
                byLocation: [],
                byItem: []
            }
        };

        try {
            // Get inventory totals
            const invSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: [['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_tally_bf_available', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            invSearch.run().each(result => {
                report.data.totalBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_tally_bf_available',
                    summary: search.Summary.SUM
                })) || 0;
                report.data.activeTallies = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                return true;
            });

            // By location
            const locSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: [['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_tally_location', summary: search.Summary.GROUP }),
                    search.createColumn({
                        name: 'custrecord_cls_tally_bf_available',
                        summary: search.Summary.SUM,
                        sort: search.Sort.DESC
                    })
                ]
            });

            locSearch.run().each(result => {
                report.data.byLocation.push({
                    location: result.getText({
                        name: 'custrecord_cls_tally_location',
                        summary: search.Summary.GROUP
                    }),
                    bf: parseFloat(result.getValue({
                        name: 'custrecord_cls_tally_bf_available',
                        summary: search.Summary.SUM
                    })) || 0
                });
                return true;
            });

            const fileId = saveReportFile(report, config);

            return {
                success: true,
                reportType: REPORT_TYPES.INVENTORY_SNAPSHOT,
                fileId: fileId,
                data: report.data
            };

        } catch (e) {
            log.error({ title: 'Inventory snapshot error', details: e.message });
            return { success: false, error: e.message };
        }
    }

    /**
     * Checks for low yield alerts
     *
     * @param {Object} config - Report configuration
     * @returns {Object} Alert result
     */
    function checkLowYieldAlerts(config) {
        const alerts = [];

        try {
            // Find operations with yield below threshold
            const alertSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [
                    ['custrecord_cls_yield_date', 'on', 'yesterday'],
                    'AND',
                    ['custrecord_cls_yield_percentage', 'lessthan', 60]
                ],
                columns: [
                    'custrecord_cls_yield_source_ref',
                    'custrecord_cls_yield_operation',
                    'custrecord_cls_yield_percentage',
                    'custrecord_cls_yield_operator',
                    'custrecord_cls_yield_input_bf',
                    'custrecord_cls_yield_waste_bf'
                ]
            });

            alertSearch.run().each(result => {
                alerts.push({
                    reference: result.getValue('custrecord_cls_yield_source_ref'),
                    type: result.getText('custrecord_cls_yield_operation'),
                    yield: parseFloat(result.getValue('custrecord_cls_yield_percentage')) || 0,
                    operator: result.getText('custrecord_cls_yield_operator'),
                    inputBF: parseFloat(result.getValue('custrecord_cls_yield_input_bf')) || 0,
                    wasteBF: parseFloat(result.getValue('custrecord_cls_yield_waste_bf')) || 0
                });
                return true;
            });

            // Send alert if any found
            if (alerts.length > 0) {
                sendLowYieldAlert(alerts);
            }

            return {
                success: true,
                reportType: REPORT_TYPES.LOW_YIELD_ALERT,
                alertCount: alerts.length,
                alerts: alerts
            };

        } catch (e) {
            log.error({ title: 'Low yield alert check error', details: e.message });
            return { success: false, error: e.message };
        }
    }

    /**
     * Checks for inventory aging alerts
     *
     * @param {Object} config - Report configuration
     * @returns {Object} Alert result
     */
    function checkAgingAlerts(config) {
        const alerts = [];

        try {
            // Find tallies older than 90 days
            const alertSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: [
                    ['custrecord_cls_tally_status', 'anyof', ['active', 'partial']],
                    'AND',
                    ['created', 'before', 'daysago90']
                ],
                columns: [
                    'name',
                    'custrecord_cls_tally_item',
                    'custrecord_cls_tally_location',
                    'custrecord_cls_tally_bf_available',
                    'created'
                ]
            });

            alertSearch.run().each(result => {
                const createdDate = new Date(result.getValue('created'));
                const ageDays = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));

                alerts.push({
                    tallyNumber: result.getValue('name'),
                    item: result.getText('custrecord_cls_tally_item'),
                    location: result.getText('custrecord_cls_tally_location'),
                    bf: parseFloat(result.getValue('custrecord_cls_tally_bf_available')) || 0,
                    ageDays: ageDays
                });

                return alerts.length < 50; // Limit alerts
            });

            // Send alert if any found
            if (alerts.length > 0) {
                sendAgingAlert(alerts);
            }

            return {
                success: true,
                reportType: REPORT_TYPES.AGING_ALERT,
                alertCount: alerts.length,
                alerts: alerts
            };

        } catch (e) {
            log.error({ title: 'Aging alert check error', details: e.message });
            return { success: false, error: e.message };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Saves report to file cabinet
     *
     * @param {Object} report - Report data
     * @param {Object} config - Report configuration
     * @returns {string} File ID
     */
    function saveReportFile(report, config) {
        try {
            const content = JSON.stringify(report, null, 2);
            const fileName = `${report.title.replace(/\s+/g, '_')}_${report.date.replace(/\//g, '-')}.json`;

            const folderId = runtime.getCurrentScript().getParameter({
                name: 'custscript_cls_report_folder'
            }) || -15; // Default to SuiteScripts folder

            const reportFile = file.create({
                name: fileName,
                fileType: file.Type.JSON,
                contents: content,
                folder: folderId
            });

            const fileId = reportFile.save();

            log.debug({
                title: 'Report File Saved',
                details: `File ID: ${fileId}, Name: ${fileName}`
            });

            return fileId;

        } catch (e) {
            log.error({ title: 'Save report file error', details: e.message });
            return null;
        }
    }

    /**
     * Sends report email
     *
     * @param {Object} report - Report data
     * @param {Object} config - Report configuration
     * @param {string} fileId - Attached file ID
     */
    function sendReportEmail(report, config, fileId) {
        try {
            const recipients = config.recipients
                ? config.recipients.split(',').map(r => r.trim())
                : [];

            if (recipients.length === 0) {
                // Get admin email from settings
                const settings = settingsDAO.getSettings();
                if (settings.adminEmail) {
                    recipients.push(settings.adminEmail);
                }
            }

            if (recipients.length === 0) return;

            const body = buildEmailBody(report);

            const emailOptions = {
                author: runtime.getCurrentUser().id,
                recipients: recipients,
                subject: `LumberSuite™: ${report.title} - ${report.date}`,
                body: body
            };

            if (fileId) {
                emailOptions.attachments = [file.load({ id: fileId })];
            }

            email.send(emailOptions);

            log.debug({
                title: 'Report Email Sent',
                details: `Recipients: ${recipients.join(', ')}`
            });

        } catch (e) {
            log.error({ title: 'Send report email error', details: e.message });
        }
    }

    /**
     * Builds email body from report data
     *
     * @param {Object} report - Report data
     * @returns {string} Email body
     */
    function buildEmailBody(report) {
        let body = `
LumberSuite™ ${report.title}
Generated: ${report.date}
${report.period ? `Period: ${report.period}` : ''}

========================================
SUMMARY
========================================
`;

        if (report.data) {
            Object.entries(report.data).forEach(([key, value]) => {
                if (typeof value !== 'object') {
                    const label = key.replace(/([A-Z])/g, ' $1').trim();
                    body += `${label}: ${typeof value === 'number' ? value.toLocaleString() : value}\n`;
                }
            });
        }

        body += `
========================================

This is an automated report from LumberSuite™.
Please do not reply to this email.
`;

        return body;
    }

    /**
     * Sends low yield alert email
     *
     * @param {Array} alerts - Alert data
     */
    function sendLowYieldAlert(alerts) {
        try {
            const settings = settingsDAO.getSettings();
            const recipient = settings.adminEmail || runtime.getCurrentUser().email;

            if (!recipient) return;

            let body = `
LumberSuite™ LOW YIELD ALERT
========================================

The following operations had yield below 60% yesterday:

`;

            alerts.forEach(alert => {
                body += `
Reference: ${alert.reference}
Type: ${alert.type}
Operator: ${alert.operator}
Yield: ${alert.yield.toFixed(1)}%
Input BF: ${alert.inputBF.toFixed(2)}
Waste BF: ${alert.wasteBF.toFixed(2)}
---
`;
            });

            body += `
========================================
Total Alerts: ${alerts.length}

Please investigate these operations.

This is an automated alert from LumberSuite™.
`;

            email.send({
                author: runtime.getCurrentUser().id,
                recipients: recipient,
                subject: `⚠ LumberSuite™ Low Yield Alert - ${alerts.length} Operations`,
                body: body
            });

        } catch (e) {
            log.error({ title: 'Send low yield alert error', details: e.message });
        }
    }

    /**
     * Sends aging alert email
     *
     * @param {Array} alerts - Alert data
     */
    function sendAgingAlert(alerts) {
        try {
            const settings = settingsDAO.getSettings();
            const recipient = settings.adminEmail || runtime.getCurrentUser().email;

            if (!recipient) return;

            const totalBF = alerts.reduce((sum, a) => sum + a.bf, 0);

            let body = `
LumberSuite™ INVENTORY AGING ALERT
========================================

The following tallies are over 90 days old:

`;

            alerts.slice(0, 20).forEach(alert => {
                body += `
Tally: ${alert.tallyNumber}
Item: ${alert.item}
Location: ${alert.location}
Available BF: ${alert.bf.toFixed(2)}
Age: ${alert.ageDays} days
---
`;
            });

            if (alerts.length > 20) {
                body += `\n... and ${alerts.length - 20} more tallies\n`;
            }

            body += `
========================================
Total Aging Tallies: ${alerts.length}
Total Aging BF: ${totalBF.toFixed(2)}

Please review these tallies for potential action.

This is an automated alert from LumberSuite™.
`;

            email.send({
                author: runtime.getCurrentUser().id,
                recipients: recipient,
                subject: `📦 LumberSuite™ Inventory Aging Alert - ${alerts.length} Tallies`,
                body: body
            });

        } catch (e) {
            log.error({ title: 'Send aging alert error', details: e.message });
        }
    }

    /**
     * Updates schedule last run time
     *
     * @param {string} scheduleId - Schedule record ID
     */
    function updateLastRunTime(scheduleId) {
        try {
            record.submitFields({
                type: 'customrecord_cls_report_schedule',
                id: scheduleId,
                values: {
                    'custrecord_cls_sched_last_run': new Date()
                }
            });
        } catch (e) {
            log.debug({ title: 'Update last run error', details: e.message });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REDUCE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * reduce Entry Point
     *
     * @param {Object} context - Reduce context
     */
    function reduce(context) {
        const reportType = context.key;
        const results = context.values.map(v => JSON.parse(v));

        const summary = {
            reportType: reportType,
            success: results.every(r => r.success),
            totalGenerated: results.length,
            errors: results.filter(r => !r.success).map(r => r.error)
        };

        context.write({
            key: 'summary',
            value: JSON.stringify(summary)
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SUMMARIZE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * summarize Entry Point
     *
     * @param {Object} summary - Summary object
     */
    function summarize(summary) {
        const results = {
            duration: summary.seconds,
            usage: summary.usage,
            reports: [],
            errors: []
        };

        // Collect results
        summary.output.iterator().each(function(key, value) {
            const data = JSON.parse(value);
            results.reports.push(data);
            if (data.errors && data.errors.length > 0) {
                results.errors = results.errors.concat(data.errors);
            }
            return true;
        });

        // Collect errors from stages
        if (summary.inputSummary.error) {
            results.errors.push({ stage: 'input', error: summary.inputSummary.error });
        }

        summary.mapSummary.errors.iterator().each(function(key, error) {
            results.errors.push({ stage: 'map', key: key, error: error });
            return true;
        });

        log.audit({
            title: 'Report Scheduler Complete',
            details: JSON.stringify({
                duration: `${summary.seconds}s`,
                reportsGenerated: results.reports.length,
                errors: results.errors.length
            })
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE EXPORTS
    // ═══════════════════════════════════════════════════════════════════════

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});
