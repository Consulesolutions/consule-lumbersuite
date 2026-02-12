/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @file cls_yield_analytics_mr.js
 * @description Yield Analytics Map/Reduce Script for Consule LumberSuite™
 *              Batch processes yield data for trend analysis, anomaly detection, and reporting
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module yield/cls_yield_analytics_mr
 */

define([
    'N/search',
    'N/record',
    'N/runtime',
    'N/email',
    'N/format',
    'N/log',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_logger'
], function(
    search,
    record,
    runtime,
    email,
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
    const logger = Logger.createLogger('CLS_YieldAnalytics_MR');

    /**
     * Analysis types
     * @type {Object}
     */
    const ANALYSIS_TYPES = {
        DAILY_SUMMARY: 'daily_summary',
        ITEM_ANALYSIS: 'item_analysis',
        ANOMALY_DETECTION: 'anomaly_detection',
        TREND_CALCULATION: 'trend_calculation',
        BENCHMARK_UPDATE: 'benchmark_update'
    };

    /**
     * Threshold for anomaly detection (standard deviations)
     * @type {number}
     */
    const ANOMALY_THRESHOLD = 2;

    /**
     * getInputData Entry Point
     * Defines the yield records to analyze
     *
     * @returns {Object} Search or array of data to process
     */
    function getInputData() {
        logger.audit('getInputData', 'Starting yield analytics processing');

        const scriptParams = runtime.getCurrentScript();
        const analysisType = scriptParams.getParameter({ name: 'custscript_cls_analysis_type' }) || 'all';
        const daysToAnalyze = parseInt(scriptParams.getParameter({ name: 'custscript_cls_days' })) || 30;

        const analyses = [];

        if (analysisType === 'all' || analysisType === ANALYSIS_TYPES.DAILY_SUMMARY) {
            analyses.push({
                type: ANALYSIS_TYPES.DAILY_SUMMARY,
                days: daysToAnalyze
            });
        }

        if (analysisType === 'all' || analysisType === ANALYSIS_TYPES.ITEM_ANALYSIS) {
            const items = getItemsWithYieldData(daysToAnalyze);
            for (const itemId of items) {
                analyses.push({
                    type: ANALYSIS_TYPES.ITEM_ANALYSIS,
                    itemId: itemId,
                    days: daysToAnalyze
                });
            }
        }

        if (analysisType === 'all' || analysisType === ANALYSIS_TYPES.ANOMALY_DETECTION) {
            analyses.push({
                type: ANALYSIS_TYPES.ANOMALY_DETECTION,
                days: daysToAnalyze
            });
        }

        if (analysisType === 'all' || analysisType === ANALYSIS_TYPES.TREND_CALCULATION) {
            analyses.push({
                type: ANALYSIS_TYPES.TREND_CALCULATION,
                days: daysToAnalyze
            });
        }

        if (analysisType === 'all' || analysisType === ANALYSIS_TYPES.BENCHMARK_UPDATE) {
            analyses.push({
                type: ANALYSIS_TYPES.BENCHMARK_UPDATE,
                days: 90 // Use 90 days for benchmark calculations
            });
        }

        logger.debug('getInputData', `Prepared ${analyses.length} analysis tasks`);

        return analyses;
    }

    /**
     * Gets items with yield data in the specified period
     *
     * @param {number} days - Number of days to look back
     * @returns {Array} Array of item IDs
     */
    function getItemsWithYieldData(days) {
        const items = [];

        try {
            const itemSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [
                    [Constants.YIELD_FIELDS.YIELD_DATE, 'within', `lastNdays:${days}`]
                ],
                columns: [
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.ITEM,
                        summary: search.Summary.GROUP
                    })
                ]
            });

            itemSearch.run().each(function(result) {
                const itemId = result.getValue({
                    name: Constants.YIELD_FIELDS.ITEM,
                    summary: search.Summary.GROUP
                });

                if (itemId) {
                    items.push(itemId);
                }

                return true;
            });
        } catch (e) {
            logger.error('getItemsWithYieldData', `Error: ${e.message}`);
        }

        return items;
    }

    /**
     * map Entry Point
     * Performs individual analysis tasks
     *
     * @param {Object} context - Map/Reduce context
     */
    function map(context) {
        const analysis = JSON.parse(context.value);

        logger.debug('map', `Processing analysis type: ${analysis.type}`);

        let result = {
            type: analysis.type,
            status: 'success',
            data: {}
        };

        try {
            switch (analysis.type) {
                case ANALYSIS_TYPES.DAILY_SUMMARY:
                    result.data = calculateDailySummary(analysis.days);
                    break;

                case ANALYSIS_TYPES.ITEM_ANALYSIS:
                    result.data = analyzeItemYield(analysis.itemId, analysis.days);
                    result.itemId = analysis.itemId;
                    break;

                case ANALYSIS_TYPES.ANOMALY_DETECTION:
                    result.data = detectAnomalies(analysis.days);
                    break;

                case ANALYSIS_TYPES.TREND_CALCULATION:
                    result.data = calculateTrends(analysis.days);
                    break;

                case ANALYSIS_TYPES.BENCHMARK_UPDATE:
                    result.data = updateBenchmarks(analysis.days);
                    break;

                default:
                    result.status = 'skipped';
                    result.message = `Unknown analysis type: ${analysis.type}`;
            }
        } catch (e) {
            result.status = 'error';
            result.error = e.message;
            logger.error('map', `Error in ${analysis.type}: ${e.message}`);
        }

        context.write({
            key: analysis.type,
            value: JSON.stringify(result)
        });
    }

    /**
     * Calculates daily yield summary
     *
     * @param {number} days - Number of days to analyze
     * @returns {Object} Daily summary data
     */
    function calculateDailySummary(days) {
        const summary = {
            dailyData: [],
            totals: {
                entries: 0,
                inputBF: 0,
                outputBF: 0,
                wasteBF: 0,
                avgYield: 0
            }
        };

        try {
            const dailySearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [
                    [Constants.YIELD_FIELDS.YIELD_DATE, 'within', `lastNdays:${days}`]
                ],
                columns: [
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.YIELD_DATE,
                        summary: search.Summary.GROUP,
                        function: 'day'
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
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
                        name: Constants.YIELD_FIELDS.WASTE_BF,
                        summary: search.Summary.SUM
                    }),
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                        summary: search.Summary.AVG
                    })
                ]
            });

            dailySearch.run().each(function(result) {
                const dayData = {
                    date: result.getValue({
                        name: Constants.YIELD_FIELDS.YIELD_DATE,
                        summary: search.Summary.GROUP
                    }),
                    entries: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })) || 0,
                    inputBF: parseFloat(result.getValue({
                        name: Constants.YIELD_FIELDS.INPUT_BF,
                        summary: search.Summary.SUM
                    })) || 0,
                    outputBF: parseFloat(result.getValue({
                        name: Constants.YIELD_FIELDS.OUTPUT_BF,
                        summary: search.Summary.SUM
                    })) || 0,
                    wasteBF: parseFloat(result.getValue({
                        name: Constants.YIELD_FIELDS.WASTE_BF,
                        summary: search.Summary.SUM
                    })) || 0,
                    avgYield: parseFloat(result.getValue({
                        name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                        summary: search.Summary.AVG
                    })) || 0
                };

                summary.dailyData.push(dayData);

                summary.totals.entries += dayData.entries;
                summary.totals.inputBF += dayData.inputBF;
                summary.totals.outputBF += dayData.outputBF;
                summary.totals.wasteBF += dayData.wasteBF;

                return true;
            });

            // Calculate overall average yield
            if (summary.totals.inputBF > 0) {
                summary.totals.avgYield = (summary.totals.outputBF / summary.totals.inputBF) * 100;
            }

        } catch (e) {
            logger.error('calculateDailySummary', `Error: ${e.message}`);
        }

        return summary;
    }

    /**
     * Analyzes yield for a specific item
     *
     * @param {string} itemId - Item internal ID
     * @param {number} days - Number of days to analyze
     * @returns {Object} Item analysis data
     */
    function analyzeItemYield(itemId, days) {
        const analysis = {
            itemId: itemId,
            statistics: {
                count: 0,
                avgYield: 0,
                minYield: 0,
                maxYield: 0,
                stdDev: 0,
                totalInputBF: 0,
                totalOutputBF: 0,
                totalWasteBF: 0
            },
            trend: 'stable',
            recommendations: []
        };

        try {
            // Get basic statistics
            const statsSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [
                    [Constants.YIELD_FIELDS.ITEM, 'is', itemId],
                    'AND',
                    [Constants.YIELD_FIELDS.YIELD_DATE, 'within', `lastNdays:${days}`]
                ],
                columns: [
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.AVG }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.MIN }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.MAX }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.INPUT_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.OUTPUT_BF, summary: search.Summary.SUM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.WASTE_BF, summary: search.Summary.SUM })
                ]
            });

            statsSearch.run().each(function(result) {
                analysis.statistics.count = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;

                analysis.statistics.avgYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.AVG
                })) || 0;

                analysis.statistics.minYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.MIN
                })) || 0;

                analysis.statistics.maxYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.MAX
                })) || 0;

                analysis.statistics.totalInputBF = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.INPUT_BF,
                    summary: search.Summary.SUM
                })) || 0;

                analysis.statistics.totalOutputBF = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.OUTPUT_BF,
                    summary: search.Summary.SUM
                })) || 0;

                analysis.statistics.totalWasteBF = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.WASTE_BF,
                    summary: search.Summary.SUM
                })) || 0;

                return false;
            });

            // Calculate standard deviation
            analysis.statistics.stdDev = calculateStdDev(itemId, days, analysis.statistics.avgYield);

            // Determine trend
            analysis.trend = calculateItemTrend(itemId, days);

            // Generate recommendations
            analysis.recommendations = generateRecommendations(analysis);

        } catch (e) {
            logger.error('analyzeItemYield', `Error: ${e.message}`);
        }

        return analysis;
    }

    /**
     * Calculates standard deviation for item yield
     *
     * @param {string} itemId - Item internal ID
     * @param {number} days - Number of days
     * @param {number} mean - Mean yield percentage
     * @returns {number} Standard deviation
     */
    function calculateStdDev(itemId, days, mean) {
        try {
            const yieldValues = [];

            const yieldSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [
                    [Constants.YIELD_FIELDS.ITEM, 'is', itemId],
                    'AND',
                    [Constants.YIELD_FIELDS.YIELD_DATE, 'within', `lastNdays:${days}`]
                ],
                columns: [Constants.YIELD_FIELDS.YIELD_PERCENTAGE]
            });

            yieldSearch.run().each(function(result) {
                const yieldPct = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
                })) || 0;
                yieldValues.push(yieldPct);
                return true;
            });

            if (yieldValues.length < 2) {
                return 0;
            }

            const squaredDiffs = yieldValues.map(value => Math.pow(value - mean, 2));
            const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;

            return Math.sqrt(avgSquaredDiff);

        } catch (e) {
            logger.error('calculateStdDev', `Error: ${e.message}`);
            return 0;
        }
    }

    /**
     * Calculates yield trend for an item
     *
     * @param {string} itemId - Item internal ID
     * @param {number} days - Number of days
     * @returns {string} Trend direction
     */
    function calculateItemTrend(itemId, days) {
        try {
            const halfDays = Math.floor(days / 2);

            // Get average for first half
            const firstHalfAvg = getAverageYieldForPeriod(itemId, halfDays, days);

            // Get average for second half (recent)
            const secondHalfAvg = getAverageYieldForPeriod(itemId, 0, halfDays);

            const diff = secondHalfAvg - firstHalfAvg;

            if (diff > 2) {
                return 'improving';
            } else if (diff < -2) {
                return 'declining';
            } else {
                return 'stable';
            }

        } catch (e) {
            logger.error('calculateItemTrend', `Error: ${e.message}`);
            return 'unknown';
        }
    }

    /**
     * Gets average yield for a specific period
     *
     * @param {string} itemId - Item internal ID
     * @param {number} startDays - Start of period (days ago)
     * @param {number} endDays - End of period (days ago)
     * @returns {number} Average yield
     */
    function getAverageYieldForPeriod(itemId, startDays, endDays) {
        try {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() - startDays);

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - endDays);

            const avgSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [
                    [Constants.YIELD_FIELDS.ITEM, 'is', itemId],
                    'AND',
                    [Constants.YIELD_FIELDS.YIELD_DATE, 'within', startDate, endDate]
                ],
                columns: [
                    search.createColumn({
                        name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                        summary: search.Summary.AVG
                    })
                ]
            });

            let avg = 0;
            avgSearch.run().each(function(result) {
                avg = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.AVG
                })) || 0;
                return false;
            });

            return avg;

        } catch (e) {
            return 0;
        }
    }

    /**
     * Generates recommendations based on analysis
     *
     * @param {Object} analysis - Item analysis data
     * @returns {Array} Recommendations
     */
    function generateRecommendations(analysis) {
        const recommendations = [];
        const defaultYield = SettingsDAO.getDefaultYieldPercentage() || 85;

        if (analysis.statistics.avgYield < defaultYield - 10) {
            recommendations.push({
                type: 'critical',
                message: `Average yield (${analysis.statistics.avgYield.toFixed(1)}%) is significantly below target. Review process and equipment.`
            });
        }

        if (analysis.statistics.stdDev > 10) {
            recommendations.push({
                type: 'warning',
                message: `High yield variability (StdDev: ${analysis.statistics.stdDev.toFixed(1)}%). Investigate inconsistent factors.`
            });
        }

        if (analysis.trend === 'declining') {
            recommendations.push({
                type: 'warning',
                message: 'Yield trend is declining. Monitor for equipment wear or process drift.'
            });
        }

        if (analysis.statistics.maxYield - analysis.statistics.minYield > 20) {
            recommendations.push({
                type: 'info',
                message: `Wide yield range (${analysis.statistics.minYield.toFixed(1)}% - ${analysis.statistics.maxYield.toFixed(1)}%). Consider standardizing procedures.`
            });
        }

        if (analysis.trend === 'improving' && analysis.statistics.avgYield >= defaultYield) {
            recommendations.push({
                type: 'success',
                message: 'Excellent performance. Yield is above target and improving.'
            });
        }

        return recommendations;
    }

    /**
     * Detects yield anomalies
     *
     * @param {number} days - Number of days to analyze
     * @returns {Object} Anomaly detection results
     */
    function detectAnomalies(days) {
        const anomalies = {
            detected: [],
            summary: {
                totalChecked: 0,
                anomaliesFound: 0
            }
        };

        try {
            // Get overall statistics
            const overallStats = getOverallStatistics(days);

            // Search for entries outside normal range
            const lowerBound = overallStats.avgYield - (ANOMALY_THRESHOLD * overallStats.stdDev);
            const upperBound = overallStats.avgYield + (ANOMALY_THRESHOLD * overallStats.stdDev);

            const anomalySearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [
                    [Constants.YIELD_FIELDS.YIELD_DATE, 'within', `lastNdays:${days}`],
                    'AND',
                    [
                        [Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'lessthan', lowerBound],
                        'OR',
                        [Constants.YIELD_FIELDS.YIELD_PERCENTAGE, 'greaterthan', upperBound]
                    ]
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_DATE }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.ITEM }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.INPUT_BF }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.SOURCE_TRANSACTION })
                ]
            });

            anomalySearch.run().each(function(result) {
                const yieldPct = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
                })) || 0;

                anomalies.detected.push({
                    id: result.id,
                    date: result.getValue({ name: Constants.YIELD_FIELDS.YIELD_DATE }),
                    item: result.getText({ name: Constants.YIELD_FIELDS.ITEM }),
                    yieldPct: yieldPct,
                    inputBF: parseFloat(result.getValue({ name: Constants.YIELD_FIELDS.INPUT_BF })) || 0,
                    sourceId: result.getValue({ name: Constants.YIELD_FIELDS.SOURCE_TRANSACTION }),
                    deviation: Math.abs(yieldPct - overallStats.avgYield) / overallStats.stdDev,
                    type: yieldPct < lowerBound ? 'low' : 'high'
                });

                return anomalies.detected.length < 100; // Limit to 100 anomalies
            });

            anomalies.summary.totalChecked = overallStats.count;
            anomalies.summary.anomaliesFound = anomalies.detected.length;
            anomalies.summary.threshold = ANOMALY_THRESHOLD;
            anomalies.summary.bounds = { lower: lowerBound, upper: upperBound };

        } catch (e) {
            logger.error('detectAnomalies', `Error: ${e.message}`);
        }

        return anomalies;
    }

    /**
     * Gets overall yield statistics
     *
     * @param {number} days - Number of days
     * @returns {Object} Overall statistics
     */
    function getOverallStatistics(days) {
        const stats = {
            count: 0,
            avgYield: 0,
            stdDev: 0
        };

        try {
            // Get count and average
            const avgSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [
                    [Constants.YIELD_FIELDS.YIELD_DATE, 'within', `lastNdays:${days}`]
                ],
                columns: [
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.AVG })
                ]
            });

            avgSearch.run().each(function(result) {
                stats.count = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;

                stats.avgYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.AVG
                })) || 0;

                return false;
            });

            // Calculate standard deviation
            if (stats.count > 1) {
                const yieldValues = [];

                const yieldSearch = search.create({
                    type: Constants.RECORD_TYPES.YIELD_REGISTER,
                    filters: [
                        [Constants.YIELD_FIELDS.YIELD_DATE, 'within', `lastNdays:${days}`]
                    ],
                    columns: [Constants.YIELD_FIELDS.YIELD_PERCENTAGE]
                });

                yieldSearch.run().each(function(result) {
                    yieldValues.push(parseFloat(result.getValue({
                        name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
                    })) || 0);
                    return yieldValues.length < 1000;
                });

                const squaredDiffs = yieldValues.map(v => Math.pow(v - stats.avgYield, 2));
                stats.stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length);
            }

        } catch (e) {
            logger.error('getOverallStatistics', `Error: ${e.message}`);
        }

        return stats;
    }

    /**
     * Calculates yield trends
     *
     * @param {number} days - Number of days
     * @returns {Object} Trend data
     */
    function calculateTrends(days) {
        const trends = {
            overall: 'stable',
            weeklyChange: 0,
            monthlyChange: 0,
            projectedYield: 0
        };

        try {
            // Compare recent week to previous week
            const thisWeekAvg = getAverageYieldForPeriod(null, 0, 7);
            const lastWeekAvg = getAverageYieldForPeriod(null, 7, 14);

            trends.weeklyChange = thisWeekAvg - lastWeekAvg;

            // Compare recent month to previous month
            const thisMonthAvg = getAverageYieldForPeriod(null, 0, 30);
            const lastMonthAvg = getAverageYieldForPeriod(null, 30, 60);

            trends.monthlyChange = thisMonthAvg - lastMonthAvg;

            // Determine overall trend
            if (trends.weeklyChange > 1 && trends.monthlyChange > 0) {
                trends.overall = 'improving';
            } else if (trends.weeklyChange < -1 && trends.monthlyChange < 0) {
                trends.overall = 'declining';
            } else {
                trends.overall = 'stable';
            }

            // Simple linear projection
            trends.projectedYield = thisWeekAvg + (trends.weeklyChange * 4); // 4-week projection

        } catch (e) {
            logger.error('calculateTrends', `Error: ${e.message}`);
        }

        return trends;
    }

    /**
     * Updates benchmark data
     *
     * @param {number} days - Number of days for benchmark calculation
     * @returns {Object} Benchmark update results
     */
    function updateBenchmarks(days) {
        const benchmarks = {
            updated: 0,
            errors: 0
        };

        try {
            const items = getItemsWithYieldData(days);

            for (const itemId of items) {
                try {
                    const stats = analyzeItemYield(itemId, days);

                    record.submitFields({
                        type: record.Type.INVENTORY_ITEM,
                        id: itemId,
                        values: {
                            [Constants.ITEM_FIELDS.BENCHMARK_YIELD]: stats.statistics.avgYield,
                            [Constants.ITEM_FIELDS.YIELD_STD_DEV]: stats.statistics.stdDev,
                            [Constants.ITEM_FIELDS.BENCHMARK_DATE]: new Date()
                        }
                    });

                    benchmarks.updated++;
                } catch (e) {
                    benchmarks.errors++;
                    logger.debug('updateBenchmarks', `Error updating item ${itemId}: ${e.message}`);
                }
            }

        } catch (e) {
            logger.error('updateBenchmarks', `Error: ${e.message}`);
        }

        return benchmarks;
    }

    /**
     * reduce Entry Point
     * Aggregates analysis results
     *
     * @param {Object} context - Map/Reduce context
     */
    function reduce(context) {
        const analysisType = context.key;
        const results = context.values.map(v => JSON.parse(v));

        const aggregated = {
            type: analysisType,
            resultCount: results.length,
            successCount: results.filter(r => r.status === 'success').length,
            errorCount: results.filter(r => r.status === 'error').length,
            data: results.map(r => r.data)
        };

        context.write({
            key: 'results',
            value: JSON.stringify(aggregated)
        });
    }

    /**
     * summarize Entry Point
     * Creates final analytics report
     *
     * @param {Object} context - Summarize context
     */
    function summarize(context) {
        logger.audit('summarize', 'Generating yield analytics report');

        const report = {
            executionTime: 0,
            results: {},
            anomaliesDetected: 0,
            itemsAnalyzed: 0,
            benchmarksUpdated: 0
        };

        const startTime = Date.now();

        context.output.iterator().each(function(key, value) {
            const aggregated = JSON.parse(value);
            report.results[aggregated.type] = aggregated;

            if (aggregated.type === ANALYSIS_TYPES.ANOMALY_DETECTION && aggregated.data[0]) {
                report.anomaliesDetected = aggregated.data[0].summary?.anomaliesFound || 0;
            }

            if (aggregated.type === ANALYSIS_TYPES.ITEM_ANALYSIS) {
                report.itemsAnalyzed = aggregated.resultCount;
            }

            if (aggregated.type === ANALYSIS_TYPES.BENCHMARK_UPDATE && aggregated.data[0]) {
                report.benchmarksUpdated = aggregated.data[0].updated || 0;
            }

            return true;
        });

        // Log errors
        logMapReduceErrors(context);

        report.executionTime = Date.now() - startTime;

        // Create analytics report record
        createAnalyticsReport(report);

        // Send alerts if anomalies detected
        if (report.anomaliesDetected > 0) {
            sendAnomalyAlert(report);
        }

        logger.audit('summarize', `Analytics complete - Items: ${report.itemsAnalyzed}, Anomalies: ${report.anomaliesDetected}, Benchmarks: ${report.benchmarksUpdated}`);
    }

    /**
     * Logs Map/Reduce errors
     *
     * @param {Object} context - Summarize context
     */
    function logMapReduceErrors(context) {
        if (context.inputSummary.error) {
            logger.error('summarize', `Input error: ${context.inputSummary.error}`);
        }

        context.mapSummary.errors.iterator().each(function(key, error) {
            logger.error('summarize', `Map error for ${key}: ${error}`);
            return true;
        });

        context.reduceSummary.errors.iterator().each(function(key, error) {
            logger.error('summarize', `Reduce error for ${key}: ${error}`);
            return true;
        });
    }

    /**
     * Creates analytics report record
     *
     * @param {Object} report - Report data
     */
    function createAnalyticsReport(report) {
        try {
            const reportRec = record.create({
                type: Constants.RECORD_TYPES.ANALYTICS_REPORT,
                isDynamic: false
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_report_date',
                value: new Date()
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_report_type',
                value: 'yield_analytics'
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_report_data',
                value: JSON.stringify(report)
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_items_analyzed',
                value: report.itemsAnalyzed
            });

            reportRec.setValue({
                fieldId: 'custrecord_cls_anomalies_found',
                value: report.anomaliesDetected
            });

            const reportId = reportRec.save();
            logger.audit('createAnalyticsReport', `Created analytics report: ${reportId}`);
        } catch (e) {
            logger.error('createAnalyticsReport', `Error: ${e.message}`);
            logger.audit('createAnalyticsReport', `Report data: ${JSON.stringify(report)}`);
        }
    }

    /**
     * Sends anomaly alert email
     *
     * @param {Object} report - Report data
     */
    function sendAnomalyAlert(report) {
        try {
            const adminEmail = SettingsDAO.getAdminEmail();
            if (!adminEmail) {
                return;
            }

            const body = `
LumberSuite™ Yield Analytics Alert

${report.anomaliesDetected} yield anomalies were detected during the latest analysis.

Summary:
- Items Analyzed: ${report.itemsAnalyzed}
- Anomalies Found: ${report.anomaliesDetected}
- Benchmarks Updated: ${report.benchmarksUpdated}

Please review the Yield Analysis dashboard for details.

--
LumberSuite™ Automated Analytics
            `;

            email.send({
                author: runtime.getCurrentUser().id,
                recipients: adminEmail,
                subject: `[LumberSuite™] Yield Alert - ${report.anomaliesDetected} Anomalies Detected`,
                body: body
            });

            logger.audit('sendAnomalyAlert', 'Anomaly alert sent');
        } catch (e) {
            logger.error('sendAnomalyAlert', `Error: ${e.message}`);
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});
