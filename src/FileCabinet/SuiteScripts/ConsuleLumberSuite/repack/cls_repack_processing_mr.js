/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @file cls_repack_processing_mr.js
 * @description Repack Processing Map/Reduce Script for Consule LumberSuite™
 *              Batch processing for repack operations, analytics, and maintenance
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module repack/cls_repack_processing_mr
 */

define([
    'N/record',
    'N/search',
    'N/runtime',
    'N/email',
    'N/format',
    '../lib/cls_settings_dao',
    '../lib/cls_lumber_constants'
], function(
    record,
    search,
    runtime,
    email,
    format,
    settingsDAO,
    constants
) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    const PROCESSING_MODES = {
        ANALYTICS: 'analytics',
        CLEANUP: 'cleanup',
        YIELD_SUMMARY: 'yield_summary',
        STALE_ORDERS: 'stale_orders',
        FULL_PROCESSING: 'full'
    };

    const YIELD_THRESHOLDS = {
        EXCELLENT: 90,
        GOOD: 80,
        ACCEPTABLE: 70,
        POOR: 60
    };

    const STALE_ORDER_DAYS = {
        DRAFT: 7,
        PENDING: 3,
        IN_PROGRESS: 1
    };

    // ═══════════════════════════════════════════════════════════════════════
    // GET INPUT DATA
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * getInputData Entry Point
     *
     * @returns {Array|Object|Search} Input data
     */
    function getInputData() {
        log.audit({
            title: 'Repack Processing Started',
            details: `Script: ${runtime.getCurrentScript().id}`
        });

        // Check feature enabled
        if (!settingsDAO.isFeatureEnabled('repack')) {
            log.audit({
                title: 'Repack Feature Disabled',
                details: 'Skipping processing'
            });
            return [];
        }

        const mode = runtime.getCurrentScript().getParameter({
            name: 'custscript_cls_repack_process_mode'
        }) || PROCESSING_MODES.FULL_PROCESSING;

        log.debug({ title: 'Processing Mode', details: mode });

        const inputData = [];

        // Add analytics task
        if (mode === PROCESSING_MODES.ANALYTICS || mode === PROCESSING_MODES.FULL_PROCESSING) {
            inputData.push({
                taskType: 'analytics',
                description: 'Calculate daily repack analytics'
            });
        }

        // Add yield summary task
        if (mode === PROCESSING_MODES.YIELD_SUMMARY || mode === PROCESSING_MODES.FULL_PROCESSING) {
            inputData.push({
                taskType: 'yield_summary',
                description: 'Generate yield summary by type and operator'
            });
        }

        // Add stale order detection
        if (mode === PROCESSING_MODES.STALE_ORDERS || mode === PROCESSING_MODES.FULL_PROCESSING) {
            const staleOrders = findStaleOrders();
            staleOrders.forEach(order => {
                inputData.push({
                    taskType: 'stale_order',
                    orderId: order.id,
                    orderNumber: order.number,
                    status: order.status,
                    daysOld: order.daysOld
                });
            });
        }

        // Add cleanup tasks
        if (mode === PROCESSING_MODES.CLEANUP || mode === PROCESSING_MODES.FULL_PROCESSING) {
            inputData.push({
                taskType: 'cleanup',
                description: 'Clean up cancelled orders older than 90 days'
            });
        }

        // Add individual order processing for validation
        const ordersToValidate = findOrdersNeedingValidation();
        ordersToValidate.forEach(order => {
            inputData.push({
                taskType: 'validate_order',
                orderId: order.id,
                orderNumber: order.number
            });
        });

        log.debug({
            title: 'Input Data Generated',
            details: `${inputData.length} tasks to process`
        });

        return inputData;
    }

    /**
     * Finds stale orders
     *
     * @returns {Array} Stale orders
     */
    function findStaleOrders() {
        const staleOrders = [];

        try {
            const staleSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'anyof', ['draft', 'pending', 'in_progress']]
                ],
                columns: [
                    'internalid',
                    'custrecord_cls_repack_number',
                    'custrecord_cls_repack_status',
                    'custrecord_cls_repack_date',
                    'created'
                ]
            });

            staleSearch.run().each(result => {
                const status = result.getValue('custrecord_cls_repack_status');
                const createdDate = result.getValue('created');
                const threshold = STALE_ORDER_DAYS[status.toUpperCase()] || 7;

                if (createdDate) {
                    const created = new Date(createdDate);
                    const now = new Date();
                    const diffDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));

                    if (diffDays > threshold) {
                        staleOrders.push({
                            id: result.getValue('internalid'),
                            number: result.getValue('custrecord_cls_repack_number'),
                            status: status,
                            daysOld: diffDays
                        });
                    }
                }

                return true;
            });

        } catch (e) {
            log.error({ title: 'Stale order search error', details: e.message });
        }

        return staleOrders;
    }

    /**
     * Finds orders needing validation
     *
     * @returns {Array} Orders to validate
     */
    function findOrdersNeedingValidation() {
        const orders = [];

        try {
            // Find completed orders from today that may need validation
            const validationSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'is', 'completed'],
                    'AND',
                    ['custrecord_cls_repack_date', 'on', 'today']
                ],
                columns: [
                    'internalid',
                    'custrecord_cls_repack_number',
                    'custrecord_cls_repack_yield_pct'
                ]
            });

            validationSearch.run().each(result => {
                const yieldPct = parseFloat(result.getValue('custrecord_cls_repack_yield_pct')) || 0;

                // Flag low yield orders for validation
                if (yieldPct < YIELD_THRESHOLDS.ACCEPTABLE) {
                    orders.push({
                        id: result.getValue('internalid'),
                        number: result.getValue('custrecord_cls_repack_number')
                    });
                }

                return true;
            });

        } catch (e) {
            log.error({ title: 'Validation search error', details: e.message });
        }

        return orders;
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
        const data = JSON.parse(context.value);

        try {
            let result;

            switch (data.taskType) {
                case 'analytics':
                    result = processAnalytics();
                    break;

                case 'yield_summary':
                    result = processYieldSummary();
                    break;

                case 'stale_order':
                    result = processStaleOrder(data);
                    break;

                case 'cleanup':
                    result = processCleanup();
                    break;

                case 'validate_order':
                    result = validateOrder(data);
                    break;

                default:
                    result = { success: false, message: 'Unknown task type' };
            }

            context.write({
                key: data.taskType,
                value: JSON.stringify(result)
            });

        } catch (e) {
            log.error({
                title: `Error processing ${data.taskType}`,
                details: e.message
            });

            context.write({
                key: data.taskType,
                value: JSON.stringify({
                    success: false,
                    error: e.message
                })
            });
        }
    }

    /**
     * Processes analytics calculation
     *
     * @returns {Object} Result
     */
    function processAnalytics() {
        const analytics = {
            date: new Date().toISOString().split('T')[0],
            totalOrders: 0,
            completedOrders: 0,
            totalInputBF: 0,
            totalOutputBF: 0,
            totalWasteBF: 0,
            avgYield: 0,
            byType: {},
            byOperator: {}
        };

        try {
            // Get today's completed orders
            const analyticsSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'is', 'completed'],
                    'AND',
                    ['custrecord_cls_repack_date', 'on', 'today']
                ],
                columns: [
                    'custrecord_cls_repack_type',
                    'custrecord_cls_repack_operator',
                    'custrecord_cls_repack_input_bf',
                    'custrecord_cls_repack_output_bf',
                    'custrecord_cls_repack_waste_bf',
                    'custrecord_cls_repack_yield_pct'
                ]
            });

            analyticsSearch.run().each(result => {
                const repackType = result.getValue('custrecord_cls_repack_type');
                const operator = result.getValue('custrecord_cls_repack_operator');
                const inputBF = parseFloat(result.getValue('custrecord_cls_repack_input_bf')) || 0;
                const outputBF = parseFloat(result.getValue('custrecord_cls_repack_output_bf')) || 0;
                const wasteBF = parseFloat(result.getValue('custrecord_cls_repack_waste_bf')) || 0;
                const yieldPct = parseFloat(result.getValue('custrecord_cls_repack_yield_pct')) || 0;

                analytics.completedOrders++;
                analytics.totalInputBF += inputBF;
                analytics.totalOutputBF += outputBF;
                analytics.totalWasteBF += wasteBF;

                // Aggregate by type
                if (!analytics.byType[repackType]) {
                    analytics.byType[repackType] = {
                        count: 0,
                        inputBF: 0,
                        outputBF: 0,
                        yieldTotal: 0
                    };
                }
                analytics.byType[repackType].count++;
                analytics.byType[repackType].inputBF += inputBF;
                analytics.byType[repackType].outputBF += outputBF;
                analytics.byType[repackType].yieldTotal += yieldPct;

                // Aggregate by operator
                if (operator) {
                    if (!analytics.byOperator[operator]) {
                        analytics.byOperator[operator] = {
                            count: 0,
                            inputBF: 0,
                            outputBF: 0,
                            yieldTotal: 0
                        };
                    }
                    analytics.byOperator[operator].count++;
                    analytics.byOperator[operator].inputBF += inputBF;
                    analytics.byOperator[operator].outputBF += outputBF;
                    analytics.byOperator[operator].yieldTotal += yieldPct;
                }

                return true;
            });

            // Calculate averages
            analytics.avgYield = analytics.totalInputBF > 0
                ? (analytics.totalOutputBF / analytics.totalInputBF) * 100
                : 0;

            // Calculate type averages
            Object.keys(analytics.byType).forEach(type => {
                const typeData = analytics.byType[type];
                typeData.avgYield = typeData.count > 0
                    ? typeData.yieldTotal / typeData.count
                    : 0;
            });

            // Calculate operator averages
            Object.keys(analytics.byOperator).forEach(op => {
                const opData = analytics.byOperator[op];
                opData.avgYield = opData.count > 0
                    ? opData.yieldTotal / opData.count
                    : 0;
            });

            // Store analytics in custom record
            saveAnalyticsRecord(analytics);

            log.audit({
                title: 'Analytics Processed',
                details: `Completed: ${analytics.completedOrders}, Avg Yield: ${analytics.avgYield.toFixed(1)}%`
            });

        } catch (e) {
            log.error({ title: 'Analytics processing error', details: e.message });
            return { success: false, error: e.message };
        }

        return { success: true, analytics: analytics };
    }

    /**
     * Saves analytics to custom record
     *
     * @param {Object} analytics - Analytics data
     */
    function saveAnalyticsRecord(analytics) {
        try {
            // Check for existing record for today
            const existingSearch = search.create({
                type: 'customrecord_cls_repack_daily_summary',
                filters: [
                    ['custrecord_cls_rds_date', 'on', 'today']
                ],
                columns: ['internalid']
            });

            const existing = existingSearch.run().getRange({ start: 0, end: 1 });

            let summaryRec;
            if (existing.length > 0) {
                summaryRec = record.load({
                    type: 'customrecord_cls_repack_daily_summary',
                    id: existing[0].getValue('internalid'),
                    isDynamic: true
                });
            } else {
                summaryRec = record.create({
                    type: 'customrecord_cls_repack_daily_summary',
                    isDynamic: true
                });
                summaryRec.setValue({
                    fieldId: 'custrecord_cls_rds_date',
                    value: new Date()
                });
            }

            summaryRec.setValue({
                fieldId: 'custrecord_cls_rds_total_orders',
                value: analytics.completedOrders
            });

            summaryRec.setValue({
                fieldId: 'custrecord_cls_rds_total_input_bf',
                value: analytics.totalInputBF
            });

            summaryRec.setValue({
                fieldId: 'custrecord_cls_rds_total_output_bf',
                value: analytics.totalOutputBF
            });

            summaryRec.setValue({
                fieldId: 'custrecord_cls_rds_total_waste_bf',
                value: analytics.totalWasteBF
            });

            summaryRec.setValue({
                fieldId: 'custrecord_cls_rds_avg_yield',
                value: analytics.avgYield
            });

            summaryRec.setValue({
                fieldId: 'custrecord_cls_rds_by_type_json',
                value: JSON.stringify(analytics.byType)
            });

            summaryRec.setValue({
                fieldId: 'custrecord_cls_rds_by_operator_json',
                value: JSON.stringify(analytics.byOperator)
            });

            summaryRec.save();

        } catch (e) {
            log.error({ title: 'Save analytics error', details: e.message });
        }
    }

    /**
     * Processes yield summary
     *
     * @returns {Object} Result
     */
    function processYieldSummary() {
        const summary = {
            period: '30_days',
            byType: {},
            byOperator: {},
            trends: []
        };

        try {
            // Get yield data for last 30 days grouped by type
            const typeSearch = search.create({
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
                        name: 'internalid',
                        summary: search.Summary.COUNT
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
                    })
                ]
            });

            typeSearch.run().each(result => {
                const type = result.getValue({
                    name: 'custrecord_cls_repack_type',
                    summary: search.Summary.GROUP
                });

                summary.byType[type] = {
                    count: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }), 10) || 0,
                    inputBF: parseFloat(result.getValue({
                        name: 'custrecord_cls_repack_input_bf',
                        summary: search.Summary.SUM
                    })) || 0,
                    outputBF: parseFloat(result.getValue({
                        name: 'custrecord_cls_repack_output_bf',
                        summary: search.Summary.SUM
                    })) || 0,
                    avgYield: parseFloat(result.getValue({
                        name: 'custrecord_cls_repack_yield_pct',
                        summary: search.Summary.AVG
                    })) || 0
                };

                return true;
            });

            // Get yield data grouped by operator
            const operatorSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'is', 'completed'],
                    'AND',
                    ['custrecord_cls_repack_date', 'within', 'lastndaystodate', 30],
                    'AND',
                    ['custrecord_cls_repack_operator', 'noneof', '@NONE@']
                ],
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_repack_operator',
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }),
                    search.createColumn({
                        name: 'custrecord_cls_repack_yield_pct',
                        summary: search.Summary.AVG
                    })
                ]
            });

            operatorSearch.run().each(result => {
                const operator = result.getValue({
                    name: 'custrecord_cls_repack_operator',
                    summary: search.Summary.GROUP
                });
                const operatorName = result.getText({
                    name: 'custrecord_cls_repack_operator',
                    summary: search.Summary.GROUP
                });

                summary.byOperator[operator] = {
                    name: operatorName,
                    count: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }), 10) || 0,
                    avgYield: parseFloat(result.getValue({
                        name: 'custrecord_cls_repack_yield_pct',
                        summary: search.Summary.AVG
                    })) || 0
                };

                return true;
            });

            // Calculate daily trend for the period
            const trendSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'is', 'completed'],
                    'AND',
                    ['custrecord_cls_repack_date', 'within', 'lastndaystodate', 30]
                ],
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_repack_date',
                        summary: search.Summary.GROUP,
                        sort: search.Sort.ASC
                    }),
                    search.createColumn({
                        name: 'custrecord_cls_repack_yield_pct',
                        summary: search.Summary.AVG
                    })
                ]
            });

            trendSearch.run().each(result => {
                summary.trends.push({
                    date: result.getValue({
                        name: 'custrecord_cls_repack_date',
                        summary: search.Summary.GROUP
                    }),
                    avgYield: parseFloat(result.getValue({
                        name: 'custrecord_cls_repack_yield_pct',
                        summary: search.Summary.AVG
                    })) || 0
                });

                return true;
            });

            log.audit({
                title: 'Yield Summary Processed',
                details: `Types: ${Object.keys(summary.byType).length}, Operators: ${Object.keys(summary.byOperator).length}`
            });

        } catch (e) {
            log.error({ title: 'Yield summary error', details: e.message });
            return { success: false, error: e.message };
        }

        return { success: true, summary: summary };
    }

    /**
     * Processes stale order notification
     *
     * @param {Object} data - Order data
     * @returns {Object} Result
     */
    function processStaleOrder(data) {
        try {
            // Load the order
            const repackRec = record.load({
                type: 'customrecord_cls_repack_workorder',
                id: data.orderId
            });

            const operatorId = repackRec.getValue({
                fieldId: 'custrecord_cls_repack_operator'
            });

            // Add note to the record
            const existingNotes = repackRec.getValue({
                fieldId: 'custrecord_cls_repack_notes'
            }) || '';

            const timestamp = format.format({
                value: new Date(),
                type: format.Type.DATETIME
            });

            const newNote = `[${timestamp}] SYSTEM: Order has been ${data.status} for ${data.daysOld} days. Please update or close.`;

            record.submitFields({
                type: 'customrecord_cls_repack_workorder',
                id: data.orderId,
                values: {
                    'custrecord_cls_repack_notes': existingNotes ? `${newNote}\n${existingNotes}` : newNote
                }
            });

            // Send notification if operator is assigned
            if (operatorId) {
                try {
                    email.send({
                        author: runtime.getCurrentUser().id,
                        recipients: operatorId,
                        subject: `Stale Repack Order: ${data.orderNumber}`,
                        body: `Repack order ${data.orderNumber} has been in "${data.status}" status for ${data.daysOld} days.\n\n` +
                              `Please review and update or close this order.\n\n` +
                              `This is an automated notification from LumberSuite™.`
                    });
                } catch (emailError) {
                    log.debug({ title: 'Email notification skipped', details: emailError.message });
                }
            }

            log.audit({
                title: 'Stale Order Processed',
                details: `Order: ${data.orderNumber}, Status: ${data.status}, Days: ${data.daysOld}`
            });

            return { success: true, orderId: data.orderId, notified: !!operatorId };

        } catch (e) {
            log.error({ title: 'Stale order processing error', details: e.message });
            return { success: false, error: e.message };
        }
    }

    /**
     * Processes cleanup of old cancelled orders
     *
     * @returns {Object} Result
     */
    function processCleanup() {
        const cleanupResult = {
            ordersDeleted: 0,
            errors: []
        };

        try {
            // Find cancelled orders older than 90 days
            const cleanupSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'is', 'cancelled'],
                    'AND',
                    ['created', 'before', 'daysago90']
                ],
                columns: ['internalid', 'custrecord_cls_repack_number']
            });

            const ordersToDelete = [];
            cleanupSearch.run().each(result => {
                ordersToDelete.push({
                    id: result.getValue('internalid'),
                    number: result.getValue('custrecord_cls_repack_number')
                });
                return ordersToDelete.length < 100; // Limit batch size
            });

            // Delete the orders
            ordersToDelete.forEach(order => {
                try {
                    record.delete({
                        type: 'customrecord_cls_repack_workorder',
                        id: order.id
                    });
                    cleanupResult.ordersDeleted++;
                    log.debug({
                        title: 'Order Deleted',
                        details: `Deleted cancelled order: ${order.number}`
                    });
                } catch (e) {
                    cleanupResult.errors.push({
                        orderId: order.id,
                        error: e.message
                    });
                }
            });

            log.audit({
                title: 'Cleanup Completed',
                details: `Deleted: ${cleanupResult.ordersDeleted}, Errors: ${cleanupResult.errors.length}`
            });

        } catch (e) {
            log.error({ title: 'Cleanup error', details: e.message });
            return { success: false, error: e.message };
        }

        return { success: true, result: cleanupResult };
    }

    /**
     * Validates an order's data integrity
     *
     * @param {Object} data - Order data
     * @returns {Object} Result
     */
    function validateOrder(data) {
        const validationResult = {
            orderId: data.orderId,
            orderNumber: data.orderNumber,
            issues: [],
            corrections: []
        };

        try {
            const repackRec = record.load({
                type: 'customrecord_cls_repack_workorder',
                id: data.orderId,
                isDynamic: true
            });

            const inputBF = parseFloat(repackRec.getValue({
                fieldId: 'custrecord_cls_repack_input_bf'
            })) || 0;

            const outputBF = parseFloat(repackRec.getValue({
                fieldId: 'custrecord_cls_repack_output_bf'
            })) || 0;

            const wasteBF = parseFloat(repackRec.getValue({
                fieldId: 'custrecord_cls_repack_waste_bf'
            })) || 0;

            const yieldPct = parseFloat(repackRec.getValue({
                fieldId: 'custrecord_cls_repack_yield_pct'
            })) || 0;

            let needsSave = false;

            // Validate waste calculation
            const expectedWaste = inputBF - outputBF;
            if (Math.abs(wasteBF - expectedWaste) > 0.01) {
                validationResult.issues.push({
                    field: 'waste_bf',
                    issue: `Waste BF mismatch: ${wasteBF} vs expected ${expectedWaste}`
                });

                repackRec.setValue({
                    fieldId: 'custrecord_cls_repack_waste_bf',
                    value: expectedWaste
                });
                validationResult.corrections.push('Corrected waste BF');
                needsSave = true;
            }

            // Validate yield percentage
            const expectedYield = inputBF > 0 ? (outputBF / inputBF) * 100 : 0;
            if (Math.abs(yieldPct - expectedYield) > 0.1) {
                validationResult.issues.push({
                    field: 'yield_pct',
                    issue: `Yield % mismatch: ${yieldPct} vs expected ${expectedYield}`
                });

                repackRec.setValue({
                    fieldId: 'custrecord_cls_repack_yield_pct',
                    value: expectedYield
                });
                validationResult.corrections.push('Corrected yield percentage');
                needsSave = true;
            }

            // Check for output exceeding input
            if (outputBF > inputBF) {
                validationResult.issues.push({
                    field: 'output_bf',
                    issue: `Output BF (${outputBF}) exceeds input BF (${inputBF})`,
                    severity: 'critical'
                });
            }

            // Save corrections if needed
            if (needsSave) {
                repackRec.save();
                log.audit({
                    title: 'Order Validated and Corrected',
                    details: `Order: ${data.orderNumber}, Corrections: ${validationResult.corrections.length}`
                });
            }

        } catch (e) {
            log.error({ title: 'Validation error', details: e.message });
            validationResult.issues.push({
                field: 'general',
                issue: e.message,
                severity: 'error'
            });
        }

        return {
            success: validationResult.issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
            result: validationResult
        };
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
        const taskType = context.key;
        const results = context.values.map(v => JSON.parse(v));

        // Aggregate results by task type
        const aggregated = {
            taskType: taskType,
            totalTasks: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            details: []
        };

        results.forEach(result => {
            if (result.error) {
                aggregated.details.push({
                    success: false,
                    error: result.error
                });
            } else if (result.analytics) {
                aggregated.details.push({
                    success: true,
                    completedOrders: result.analytics.completedOrders,
                    avgYield: result.analytics.avgYield
                });
            } else if (result.result) {
                aggregated.details.push({
                    success: true,
                    data: result.result
                });
            }
        });

        context.write({
            key: 'summary_' + taskType,
            value: JSON.stringify(aggregated)
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
        const summaryData = {
            dateTime: new Date().toISOString(),
            duration: summary.seconds,
            usage: {
                units: summary.usage
            },
            taskResults: {},
            errors: []
        };

        // Collect results
        summary.output.iterator().each(function(key, value) {
            summaryData.taskResults[key] = JSON.parse(value);
            return true;
        });

        // Collect errors
        if (summary.inputSummary.error) {
            summaryData.errors.push({
                stage: 'input',
                error: summary.inputSummary.error
            });
        }

        summary.mapSummary.errors.iterator().each(function(key, error) {
            summaryData.errors.push({
                stage: 'map',
                key: key,
                error: error
            });
            return true;
        });

        summary.reduceSummary.errors.iterator().each(function(key, error) {
            summaryData.errors.push({
                stage: 'reduce',
                key: key,
                error: error
            });
            return true;
        });

        // Log summary
        log.audit({
            title: 'Repack Processing Complete',
            details: JSON.stringify({
                duration: `${summary.seconds}s`,
                tasks: Object.keys(summaryData.taskResults).length,
                errors: summaryData.errors.length
            })
        });

        // Send summary notification if there are errors
        if (summaryData.errors.length > 0) {
            sendErrorNotification(summaryData);
        }
    }

    /**
     * Sends error notification email
     *
     * @param {Object} summaryData - Summary data
     */
    function sendErrorNotification(summaryData) {
        try {
            const settings = settingsDAO.getSettings();
            const adminEmail = settings.adminEmail;

            if (!adminEmail) return;

            const errorList = summaryData.errors.map(e =>
                `- ${e.stage}: ${e.error || 'Unknown error'}`
            ).join('\n');

            email.send({
                author: runtime.getCurrentUser().id,
                recipients: adminEmail,
                subject: 'LumberSuite™ Repack Processing Errors',
                body: `The repack processing job completed with ${summaryData.errors.length} error(s).\n\n` +
                      `Processing Time: ${summaryData.duration}s\n` +
                      `Date/Time: ${summaryData.dateTime}\n\n` +
                      `Errors:\n${errorList}\n\n` +
                      `Please review the script execution log for more details.`
            });

        } catch (e) {
            log.error({ title: 'Error sending notification', details: e.message });
        }
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
