/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * @file cls_yield_register_ue.js
 * @description Yield Register User Event Script for Consule LumberSuite™
 *              Manages yield tracking records, waste calculations, and variance analysis
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module yield/cls_yield_register_ue
 */

define([
    'N/record',
    'N/search',
    'N/runtime',
    'N/ui/serverWidget',
    'N/log',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_bf_calculator',
    '../lib/cls_yield_service',
    '../lib/cls_logger'
], function(
    record,
    search,
    runtime,
    serverWidget,
    log,
    Constants,
    SettingsDAO,
    BFCalculator,
    YieldService,
    Logger
) {
    'use strict';

    /**
     * Module-level logger instance
     * @type {Object}
     */
    const logger = Logger.createLogger('CLS_YieldRegister_UE');

    /**
     * Yield status constants
     * @type {Object}
     */
    const YIELD_STATUS = {
        PENDING: 'pending',
        CALCULATED: 'calculated',
        VERIFIED: 'verified',
        ADJUSTED: 'adjusted'
    };

    /**
     * Variance thresholds for alerts
     * @type {Object}
     */
    const VARIANCE_THRESHOLDS = {
        WARNING: 5,   // 5% variance triggers warning
        CRITICAL: 15  // 15% variance triggers critical alert
    };

    /**
     * beforeLoad Entry Point
     * Adds yield analysis dashboard and variance indicators
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {string} context.type - Trigger type
     * @param {Form} context.form - Current form
     */
    function beforeLoad(context) {
        const startTime = Date.now();

        try {
            if (!SettingsDAO.isYieldEnabled()) {
                return;
            }

            const yieldRec = context.newRecord;
            const form = context.form;

            if (context.type === context.UserEventType.VIEW) {
                addYieldAnalysisSection(yieldRec, form);
                addVarianceIndicators(yieldRec, form);
                addHistoricalComparison(yieldRec, form);
            }

            if (context.type === context.UserEventType.CREATE) {
                setDefaultValues(yieldRec);
            }

            if (context.type === context.UserEventType.EDIT) {
                addAdjustmentWarning(form);
            }

            logger.debug('beforeLoad', `Completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('beforeLoad', `Error: ${e.message}`, { stack: e.stack });
        }
    }

    /**
     * beforeSubmit Entry Point
     * Calculates yield metrics, validates data, and detects anomalies
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record (edit only)
     * @param {string} context.type - Trigger type
     */
    function beforeSubmit(context) {
        const startTime = Date.now();

        try {
            if (!SettingsDAO.isYieldEnabled()) {
                return;
            }

            if (context.type === context.UserEventType.DELETE) {
                return;
            }

            const yieldRec = context.newRecord;

            validateRequiredFields(yieldRec);
            calculateYieldMetrics(yieldRec);
            calculateWasteBreakdown(yieldRec);
            detectAnomalies(yieldRec);
            updateStatus(yieldRec, context.type);

            logger.audit('beforeSubmit', `Yield register processing completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('beforeSubmit', `Error: ${e.message}`, { stack: e.stack });
            throw e;
        }
    }

    /**
     * afterSubmit Entry Point
     * Updates related records, triggers alerts, and logs analytics
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record (edit only)
     * @param {string} context.type - Trigger type
     */
    function afterSubmit(context) {
        const startTime = Date.now();

        try {
            if (!SettingsDAO.isYieldEnabled()) {
                return;
            }

            const yieldRec = record.load({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                id: context.newRecord.id,
                isDynamic: false
            });

            if (context.type === context.UserEventType.CREATE) {
                updateSourceTransaction(yieldRec);
                updateItemYieldStats(yieldRec);
                checkForAlerts(yieldRec);
            }

            if (context.type === context.UserEventType.EDIT) {
                logAdjustment(yieldRec, context.oldRecord);
                recalculateRelatedStats(yieldRec);
            }

            logYieldAnalytics(yieldRec, context.type);

            logger.audit('afterSubmit', `Yield register post-processing completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('afterSubmit', `Error: ${e.message}`, { stack: e.stack });
        }
    }

    /**
     * Adds yield analysis section to the form
     *
     * @param {Record} yieldRec - Yield register record
     * @param {Form} form - Current form
     */
    function addYieldAnalysisSection(yieldRec, form) {
        try {
            const analysisGroup = form.addFieldGroup({
                id: 'custpage_cls_yield_analysis',
                label: 'Yield Analysis'
            });

            const inputBF = parseFloat(yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.INPUT_BF
            })) || 0;

            const outputBF = parseFloat(yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.OUTPUT_BF
            })) || 0;

            const yieldPct = parseFloat(yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
            })) || 0;

            const wasteBF = parseFloat(yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.WASTE_BF
            })) || 0;

            const expectedYield = parseFloat(yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD
            })) || SettingsDAO.getDefaultYieldPercentage();

            const variance = yieldPct - expectedYield;

            let analysisHtml = '<table style="width:100%; border-collapse:collapse;">';

            // Input/Output row
            analysisHtml += '<tr>';
            analysisHtml += '<td style="padding:10px; width:25%;">';
            analysisHtml += '<div style="text-align:center; padding:15px; background:#e3f2fd; border-radius:4px;">';
            analysisHtml += `<div style="font-size:24px; font-weight:bold; color:#1976d2;">${inputBF.toFixed(2)}</div>`;
            analysisHtml += '<div style="color:#666;">Input BF</div></div></td>';

            analysisHtml += '<td style="padding:10px; width:25%;">';
            analysisHtml += '<div style="text-align:center; padding:15px; background:#e8f5e9; border-radius:4px;">';
            analysisHtml += `<div style="font-size:24px; font-weight:bold; color:#388e3c;">${outputBF.toFixed(2)}</div>`;
            analysisHtml += '<div style="color:#666;">Output BF</div></div></td>';

            analysisHtml += '<td style="padding:10px; width:25%;">';
            analysisHtml += '<div style="text-align:center; padding:15px; background:#fff3e0; border-radius:4px;">';
            analysisHtml += `<div style="font-size:24px; font-weight:bold; color:#f57c00;">${wasteBF.toFixed(2)}</div>`;
            analysisHtml += '<div style="color:#666;">Waste BF</div></div></td>';

            const yieldColor = getYieldColor(yieldPct, expectedYield);
            analysisHtml += '<td style="padding:10px; width:25%;">';
            analysisHtml += `<div style="text-align:center; padding:15px; background:${yieldColor.bg}; border-radius:4px;">`;
            analysisHtml += `<div style="font-size:24px; font-weight:bold; color:${yieldColor.text};">${yieldPct.toFixed(1)}%</div>`;
            analysisHtml += '<div style="color:#666;">Yield</div></div></td>';
            analysisHtml += '</tr>';

            // Variance row
            analysisHtml += '<tr><td colspan="4" style="padding:15px 10px;">';
            analysisHtml += '<div style="display:flex; justify-content:space-between; align-items:center;">';
            analysisHtml += `<div><strong>Expected Yield:</strong> ${expectedYield.toFixed(1)}%</div>`;

            const varianceColor = variance >= 0 ? '#28a745' : '#dc3545';
            const varianceSign = variance >= 0 ? '+' : '';
            analysisHtml += `<div><strong>Variance:</strong> <span style="color:${varianceColor}; font-weight:bold;">${varianceSign}${variance.toFixed(1)}%</span></div>`;

            const efficiency = inputBF > 0 ? (outputBF / inputBF * 100) : 0;
            analysisHtml += `<div><strong>Efficiency:</strong> ${efficiency.toFixed(1)}%</div>`;
            analysisHtml += '</div></td></tr>';

            analysisHtml += '</table>';

            const analysisField = form.addField({
                id: 'custpage_cls_analysis_display',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cls_yield_analysis'
            });

            analysisField.defaultValue = analysisHtml;
        } catch (e) {
            logger.error('addYieldAnalysisSection', `Error: ${e.message}`);
        }
    }

    /**
     * Gets yield color based on performance
     *
     * @param {number} yieldPct - Actual yield percentage
     * @param {number} expectedYield - Expected yield percentage
     * @returns {Object} Background and text colors
     */
    function getYieldColor(yieldPct, expectedYield) {
        const variance = yieldPct - expectedYield;

        if (variance >= 0) {
            return { bg: '#d4edda', text: '#155724' }; // Green
        } else if (variance >= -VARIANCE_THRESHOLDS.WARNING) {
            return { bg: '#fff3cd', text: '#856404' }; // Yellow
        } else if (variance >= -VARIANCE_THRESHOLDS.CRITICAL) {
            return { bg: '#ffe0b2', text: '#e65100' }; // Orange
        } else {
            return { bg: '#f8d7da', text: '#721c24' }; // Red
        }
    }

    /**
     * Adds variance indicators to the form
     *
     * @param {Record} yieldRec - Yield register record
     * @param {Form} form - Current form
     */
    function addVarianceIndicators(yieldRec, form) {
        try {
            const varianceGroup = form.addFieldGroup({
                id: 'custpage_cls_variance_indicators',
                label: 'Variance Analysis'
            });

            const yieldPct = parseFloat(yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
            })) || 0;

            const expectedYield = parseFloat(yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD
            })) || SettingsDAO.getDefaultYieldPercentage();

            const variance = yieldPct - expectedYield;
            const absVariance = Math.abs(variance);

            let indicatorHtml = '<div style="padding:10px;">';

            // Variance gauge
            indicatorHtml += '<div style="margin-bottom:15px;">';
            indicatorHtml += '<div style="display:flex; justify-content:space-between; margin-bottom:5px;">';
            indicatorHtml += '<span>Poor</span><span>Expected</span><span>Excellent</span></div>';

            const gaugePosition = Math.min(100, Math.max(0, ((yieldPct / expectedYield) * 50)));
            indicatorHtml += '<div style="position:relative; height:20px; background:linear-gradient(to right, #dc3545, #ffc107, #28a745); border-radius:10px;">';
            indicatorHtml += `<div style="position:absolute; left:${gaugePosition}%; top:-5px; width:4px; height:30px; background:#333; border-radius:2px;"></div>`;
            indicatorHtml += '</div></div>';

            // Status indicator
            let statusIcon, statusText, statusColor;
            if (absVariance <= VARIANCE_THRESHOLDS.WARNING) {
                statusIcon = '&#10004;';
                statusText = 'Within acceptable range';
                statusColor = '#28a745';
            } else if (absVariance <= VARIANCE_THRESHOLDS.CRITICAL) {
                statusIcon = '&#9888;';
                statusText = 'Warning: Notable variance detected';
                statusColor = '#ffc107';
            } else {
                statusIcon = '&#10006;';
                statusText = 'Critical: Significant variance requires attention';
                statusColor = '#dc3545';
            }

            indicatorHtml += `<div style="padding:10px; background:#f8f9fa; border-left:4px solid ${statusColor}; border-radius:0 4px 4px 0;">`;
            indicatorHtml += `<span style="font-size:20px; color:${statusColor};">${statusIcon}</span> `;
            indicatorHtml += `<strong>${statusText}</strong>`;
            indicatorHtml += '</div>';

            indicatorHtml += '</div>';

            const indicatorField = form.addField({
                id: 'custpage_cls_variance_display',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cls_variance_indicators'
            });

            indicatorField.defaultValue = indicatorHtml;
        } catch (e) {
            logger.error('addVarianceIndicators', `Error: ${e.message}`);
        }
    }

    /**
     * Adds historical comparison section
     *
     * @param {Record} yieldRec - Yield register record
     * @param {Form} form - Current form
     */
    function addHistoricalComparison(yieldRec, form) {
        try {
            const historyGroup = form.addFieldGroup({
                id: 'custpage_cls_historical',
                label: 'Historical Comparison'
            });

            const itemId = yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.ITEM });
            const currentYield = parseFloat(yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
            })) || 0;

            const historicalData = getHistoricalYieldData(itemId, yieldRec.id);

            let historyHtml = '<table style="width:100%; border-collapse:collapse;">';
            historyHtml += '<tr style="background:#f5f5f5;">';
            historyHtml += '<th style="padding:8px; text-align:left; border:1px solid #ddd;">Period</th>';
            historyHtml += '<th style="padding:8px; text-align:right; border:1px solid #ddd;">Avg Yield</th>';
            historyHtml += '<th style="padding:8px; text-align:right; border:1px solid #ddd;">Min</th>';
            historyHtml += '<th style="padding:8px; text-align:right; border:1px solid #ddd;">Max</th>';
            historyHtml += '<th style="padding:8px; text-align:right; border:1px solid #ddd;">Entries</th>';
            historyHtml += '<th style="padding:8px; text-align:center; border:1px solid #ddd;">vs Current</th>';
            historyHtml += '</tr>';

            for (const period of historicalData) {
                const diff = currentYield - period.avgYield;
                const diffColor = diff >= 0 ? '#28a745' : '#dc3545';
                const diffSign = diff >= 0 ? '+' : '';

                historyHtml += '<tr>';
                historyHtml += `<td style="padding:8px; border:1px solid #ddd;">${period.label}</td>`;
                historyHtml += `<td style="padding:8px; text-align:right; border:1px solid #ddd;">${period.avgYield.toFixed(1)}%</td>`;
                historyHtml += `<td style="padding:8px; text-align:right; border:1px solid #ddd;">${period.minYield.toFixed(1)}%</td>`;
                historyHtml += `<td style="padding:8px; text-align:right; border:1px solid #ddd;">${period.maxYield.toFixed(1)}%</td>`;
                historyHtml += `<td style="padding:8px; text-align:right; border:1px solid #ddd;">${period.count}</td>`;
                historyHtml += `<td style="padding:8px; text-align:center; border:1px solid #ddd; color:${diffColor};">${diffSign}${diff.toFixed(1)}%</td>`;
                historyHtml += '</tr>';
            }

            historyHtml += '</table>';

            if (historicalData.length === 0) {
                historyHtml = '<p style="color:#666; text-align:center;">No historical data available for this item.</p>';
            }

            const historyField = form.addField({
                id: 'custpage_cls_history_display',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cls_historical'
            });

            historyField.defaultValue = historyHtml;
        } catch (e) {
            logger.error('addHistoricalComparison', `Error: ${e.message}`);
        }
    }

    /**
     * Gets historical yield data for an item
     *
     * @param {string|number} itemId - Item internal ID
     * @param {string|number} excludeId - Record ID to exclude
     * @returns {Array} Historical data array
     */
    function getHistoricalYieldData(itemId, excludeId) {
        const periods = [];

        if (!itemId) {
            return periods;
        }

        try {
            // Last 30 days
            const last30 = getYieldStatsForPeriod(itemId, 30, excludeId);
            if (last30.count > 0) {
                periods.push({ label: 'Last 30 Days', ...last30 });
            }

            // Last 90 days
            const last90 = getYieldStatsForPeriod(itemId, 90, excludeId);
            if (last90.count > 0) {
                periods.push({ label: 'Last 90 Days', ...last90 });
            }

            // All time
            const allTime = getYieldStatsForPeriod(itemId, 0, excludeId);
            if (allTime.count > 0) {
                periods.push({ label: 'All Time', ...allTime });
            }
        } catch (e) {
            logger.error('getHistoricalYieldData', `Error: ${e.message}`);
        }

        return periods;
    }

    /**
     * Gets yield statistics for a time period
     *
     * @param {string|number} itemId - Item internal ID
     * @param {number} days - Number of days (0 for all time)
     * @param {string|number} excludeId - Record ID to exclude
     * @returns {Object} Statistics object
     */
    function getYieldStatsForPeriod(itemId, days, excludeId) {
        const stats = {
            avgYield: 0,
            minYield: 0,
            maxYield: 0,
            count: 0
        };

        try {
            const filters = [
                [Constants.YIELD_FIELDS.ITEM, 'is', itemId]
            ];

            if (excludeId) {
                filters.push('AND');
                filters.push(['internalid', 'noneof', excludeId]);
            }

            if (days > 0) {
                filters.push('AND');
                filters.push([Constants.YIELD_FIELDS.YIELD_DATE, 'within', `lastNdays:${days}`]);
            }

            const yieldSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: filters,
                columns: [
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.AVG }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.MIN }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.MAX }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            yieldSearch.run().each(function(result) {
                stats.avgYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.AVG
                })) || 0;

                stats.minYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.MIN
                })) || 0;

                stats.maxYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.MAX
                })) || 0;

                stats.count = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;

                return false;
            });
        } catch (e) {
            logger.debug('getYieldStatsForPeriod', `Error: ${e.message}`);
        }

        return stats;
    }

    /**
     * Sets default values for new yield records
     *
     * @param {Record} yieldRec - Yield register record
     */
    function setDefaultValues(yieldRec) {
        yieldRec.setValue({
            fieldId: Constants.YIELD_FIELDS.YIELD_DATE,
            value: new Date()
        });

        yieldRec.setValue({
            fieldId: Constants.YIELD_FIELDS.STATUS,
            value: YIELD_STATUS.PENDING
        });

        yieldRec.setValue({
            fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD,
            value: SettingsDAO.getDefaultYieldPercentage()
        });

        yieldRec.setValue({
            fieldId: Constants.YIELD_FIELDS.CREATED_BY,
            value: runtime.getCurrentUser().id
        });
    }

    /**
     * Adds adjustment warning for edit mode
     *
     * @param {Form} form - Current form
     */
    function addAdjustmentWarning(form) {
        try {
            const warningHtml = `
                <div style="padding:10px; background:#fff3cd; border:1px solid #ffc107; border-radius:4px; margin-bottom:15px;">
                    <strong>&#9888; Adjustment Mode</strong><br>
                    Changes to this yield record will be logged as an adjustment.
                    Please provide a reason for the adjustment in the notes field.
                </div>
            `;

            const warningField = form.addField({
                id: 'custpage_cls_adjustment_warning',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });

            warningField.defaultValue = warningHtml;
        } catch (e) {
            logger.error('addAdjustmentWarning', `Error: ${e.message}`);
        }
    }

    /**
     * Validates required fields
     *
     * @param {Record} yieldRec - Yield register record
     * @throws {Error} If validation fails
     */
    function validateRequiredFields(yieldRec) {
        const inputBF = yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.INPUT_BF });
        const outputBF = yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.OUTPUT_BF });

        if (!inputBF || inputBF <= 0) {
            throw new Error('Input BF is required and must be greater than zero.');
        }

        if (outputBF === null || outputBF === undefined || outputBF < 0) {
            throw new Error('Output BF is required and cannot be negative.');
        }

        if (outputBF > inputBF) {
            throw new Error('Output BF cannot exceed Input BF.');
        }
    }

    /**
     * Calculates yield metrics
     *
     * @param {Record} yieldRec - Yield register record
     */
    function calculateYieldMetrics(yieldRec) {
        const inputBF = parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.INPUT_BF
        })) || 0;

        const outputBF = parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.OUTPUT_BF
        })) || 0;

        // Calculate yield percentage
        const yieldPct = inputBF > 0 ? (outputBF / inputBF * 100) : 0;

        yieldRec.setValue({
            fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
            value: yieldPct
        });

        // Calculate waste BF
        const wasteBF = inputBF - outputBF;

        yieldRec.setValue({
            fieldId: Constants.YIELD_FIELDS.WASTE_BF,
            value: wasteBF
        });

        // Calculate waste percentage
        const wastePct = inputBF > 0 ? (wasteBF / inputBF * 100) : 0;

        yieldRec.setValue({
            fieldId: Constants.YIELD_FIELDS.WASTE_PERCENTAGE,
            value: wastePct
        });

        // Calculate variance from expected
        const expectedYield = parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD
        })) || SettingsDAO.getDefaultYieldPercentage();

        const variance = yieldPct - expectedYield;

        yieldRec.setValue({
            fieldId: Constants.YIELD_FIELDS.YIELD_VARIANCE,
            value: variance
        });

        // Calculate efficiency ratio
        const efficiency = expectedYield > 0 ? (yieldPct / expectedYield * 100) : 0;

        yieldRec.setValue({
            fieldId: Constants.YIELD_FIELDS.EFFICIENCY_RATIO,
            value: efficiency
        });

        logger.debug('calculateYieldMetrics',
            `Input: ${inputBF} BF, Output: ${outputBF} BF, Yield: ${yieldPct.toFixed(1)}%, Waste: ${wasteBF.toFixed(2)} BF`);
    }

    /**
     * Calculates waste breakdown by category
     *
     * @param {Record} yieldRec - Yield register record
     */
    function calculateWasteBreakdown(yieldRec) {
        const totalWaste = parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.WASTE_BF
        })) || 0;

        // Get waste category values if provided
        const sawdustBF = parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.SAWDUST_BF
        })) || 0;

        const trimBF = parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.TRIM_WASTE_BF
        })) || 0;

        const defectBF = parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.DEFECT_WASTE_BF
        })) || 0;

        const otherWaste = parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.OTHER_WASTE_BF
        })) || 0;

        // Calculate categorized total
        const categorizedTotal = sawdustBF + trimBF + defectBF + otherWaste;

        // If categories don't add up to total, put remainder in "uncategorized"
        if (categorizedTotal > 0 && Math.abs(categorizedTotal - totalWaste) > 0.01) {
            const uncategorized = totalWaste - categorizedTotal;

            yieldRec.setValue({
                fieldId: Constants.YIELD_FIELDS.UNCATEGORIZED_WASTE_BF,
                value: Math.max(0, uncategorized)
            });
        }

        // Calculate waste category percentages
        if (totalWaste > 0) {
            yieldRec.setValue({
                fieldId: Constants.YIELD_FIELDS.SAWDUST_PCT,
                value: (sawdustBF / totalWaste * 100)
            });

            yieldRec.setValue({
                fieldId: Constants.YIELD_FIELDS.TRIM_WASTE_PCT,
                value: (trimBF / totalWaste * 100)
            });

            yieldRec.setValue({
                fieldId: Constants.YIELD_FIELDS.DEFECT_WASTE_PCT,
                value: (defectBF / totalWaste * 100)
            });
        }
    }

    /**
     * Detects yield anomalies
     *
     * @param {Record} yieldRec - Yield register record
     */
    function detectAnomalies(yieldRec) {
        const anomalies = [];

        const yieldPct = parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
        })) || 0;

        const expectedYield = parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD
        })) || 85;

        const variance = Math.abs(yieldPct - expectedYield);

        // Check for significant variance
        if (variance > VARIANCE_THRESHOLDS.CRITICAL) {
            anomalies.push(`Critical variance: ${variance.toFixed(1)}% from expected yield`);
        }

        // Check for unusually high yield (possible data error)
        if (yieldPct > 98) {
            anomalies.push('Unusually high yield (>98%) - verify measurements');
        }

        // Check for unusually low yield
        if (yieldPct < 50) {
            anomalies.push('Unusually low yield (<50%) - verify process');
        }

        // Store anomalies
        if (anomalies.length > 0) {
            yieldRec.setValue({
                fieldId: Constants.YIELD_FIELDS.ANOMALY_FLAGS,
                value: anomalies.join('; ')
            });

            yieldRec.setValue({
                fieldId: Constants.YIELD_FIELDS.HAS_ANOMALY,
                value: true
            });
        } else {
            yieldRec.setValue({
                fieldId: Constants.YIELD_FIELDS.HAS_ANOMALY,
                value: false
            });
        }
    }

    /**
     * Updates the yield record status
     *
     * @param {Record} yieldRec - Yield register record
     * @param {string} eventType - Event type
     */
    function updateStatus(yieldRec, eventType) {
        if (eventType === 'create') {
            yieldRec.setValue({
                fieldId: Constants.YIELD_FIELDS.STATUS,
                value: YIELD_STATUS.CALCULATED
            });
        } else if (eventType === 'edit') {
            const currentStatus = yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.STATUS
            });

            if (currentStatus !== YIELD_STATUS.VERIFIED) {
                yieldRec.setValue({
                    fieldId: Constants.YIELD_FIELDS.STATUS,
                    value: YIELD_STATUS.ADJUSTED
                });
            }
        }
    }

    /**
     * Updates the source transaction with yield data
     *
     * @param {Record} yieldRec - Yield register record
     */
    function updateSourceTransaction(yieldRec) {
        try {
            const sourceType = yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.SOURCE_TYPE
            });

            const sourceId = yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.SOURCE_TRANSACTION
            });

            if (!sourceId) {
                return;
            }

            const yieldPct = yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
            });

            const wasteBF = yieldRec.getValue({
                fieldId: Constants.YIELD_FIELDS.WASTE_BF
            });

            record.submitFields({
                type: sourceType || record.Type.WORK_ORDER,
                id: sourceId,
                values: {
                    [Constants.BODY_FIELDS.ACTUAL_YIELD]: yieldPct,
                    [Constants.BODY_FIELDS.ACTUAL_WASTE_BF]: wasteBF,
                    [Constants.BODY_FIELDS.YIELD_REGISTER]: yieldRec.id
                }
            });

            logger.debug('updateSourceTransaction', `Updated source transaction ${sourceId}`);
        } catch (e) {
            logger.error('updateSourceTransaction', `Error: ${e.message}`);
        }
    }

    /**
     * Updates item-level yield statistics
     *
     * @param {Record} yieldRec - Yield register record
     */
    function updateItemYieldStats(yieldRec) {
        try {
            const itemId = yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.ITEM });

            if (!itemId) {
                return;
            }

            // Get updated statistics for the item
            const stats = getYieldStatsForPeriod(itemId, 0, null);

            if (stats.count > 0) {
                record.submitFields({
                    type: record.Type.INVENTORY_ITEM,
                    id: itemId,
                    values: {
                        [Constants.ITEM_FIELDS.AVG_YIELD]: stats.avgYield,
                        [Constants.ITEM_FIELDS.YIELD_ENTRY_COUNT]: stats.count,
                        [Constants.ITEM_FIELDS.LAST_YIELD_DATE]: new Date()
                    }
                });

                logger.debug('updateItemYieldStats', `Updated item ${itemId} with avg yield ${stats.avgYield.toFixed(1)}%`);
            }
        } catch (e) {
            logger.error('updateItemYieldStats', `Error: ${e.message}`);
        }
    }

    /**
     * Checks for alerts based on yield data
     *
     * @param {Record} yieldRec - Yield register record
     */
    function checkForAlerts(yieldRec) {
        const hasAnomaly = yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.HAS_ANOMALY
        });

        const variance = Math.abs(parseFloat(yieldRec.getValue({
            fieldId: Constants.YIELD_FIELDS.YIELD_VARIANCE
        })) || 0);

        if (hasAnomaly || variance > VARIANCE_THRESHOLDS.CRITICAL) {
            YieldService.createAlert({
                yieldRegisterId: yieldRec.id,
                alertType: variance > VARIANCE_THRESHOLDS.CRITICAL ? 'critical' : 'warning',
                message: `Yield variance of ${variance.toFixed(1)}% detected`,
                item: yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.ITEM }),
                sourceTransaction: yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.SOURCE_TRANSACTION })
            });
        }
    }

    /**
     * Logs yield adjustment
     *
     * @param {Record} yieldRec - Current record
     * @param {Record} oldRecord - Previous record
     */
    function logAdjustment(yieldRec, oldRecord) {
        try {
            const changes = [];

            const fieldsToCheck = [
                { field: Constants.YIELD_FIELDS.INPUT_BF, name: 'Input BF' },
                { field: Constants.YIELD_FIELDS.OUTPUT_BF, name: 'Output BF' },
                { field: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, name: 'Yield %' },
                { field: Constants.YIELD_FIELDS.WASTE_BF, name: 'Waste BF' }
            ];

            for (const f of fieldsToCheck) {
                const oldVal = oldRecord.getValue({ fieldId: f.field });
                const newVal = yieldRec.getValue({ fieldId: f.field });

                if (oldVal !== newVal) {
                    changes.push({
                        field: f.name,
                        oldValue: oldVal,
                        newValue: newVal
                    });
                }
            }

            if (changes.length > 0) {
                YieldService.logAdjustment({
                    yieldRegisterId: yieldRec.id,
                    adjustedBy: runtime.getCurrentUser().id,
                    adjustmentDate: new Date(),
                    changes: changes,
                    reason: yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.ADJUSTMENT_NOTES })
                });
            }
        } catch (e) {
            logger.error('logAdjustment', `Error: ${e.message}`);
        }
    }

    /**
     * Recalculates related statistics after adjustment
     *
     * @param {Record} yieldRec - Yield register record
     */
    function recalculateRelatedStats(yieldRec) {
        updateItemYieldStats(yieldRec);
    }

    /**
     * Logs yield analytics
     *
     * @param {Record} yieldRec - Yield register record
     * @param {string} eventType - Event type
     */
    function logYieldAnalytics(yieldRec, eventType) {
        try {
            const analyticsData = {
                yieldRegisterId: yieldRec.id,
                eventType: eventType,
                timestamp: new Date().toISOString(),
                item: yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.ITEM }),
                inputBF: yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.INPUT_BF }),
                outputBF: yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.OUTPUT_BF }),
                yieldPct: yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE }),
                wasteBF: yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.WASTE_BF }),
                variance: yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.YIELD_VARIANCE }),
                hasAnomaly: yieldRec.getValue({ fieldId: Constants.YIELD_FIELDS.HAS_ANOMALY })
            };

            logger.audit('logYieldAnalytics', `Yield data: ${JSON.stringify(analyticsData)}`);
        } catch (e) {
            logger.error('logYieldAnalytics', `Error: ${e.message}`);
        }
    }

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
