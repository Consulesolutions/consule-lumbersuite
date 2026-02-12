/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * @file cls_settings_ue.js
 * @description Settings Record User Event Script for Consule LumberSuite™
 *              Manages the singleton settings record and feature toggles
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module control/cls_settings_ue
 */

define([
    'N/record',
    'N/search',
    'N/runtime',
    'N/cache',
    'N/log',
    'N/ui/serverWidget',
    '../lib/cls_constants',
    '../lib/cls_logger'
], function(
    record,
    search,
    runtime,
    cache,
    log,
    serverWidget,
    Constants,
    Logger
) {
    'use strict';

    /**
     * Module-level logger instance
     * @type {Object}
     */
    const logger = Logger.createLogger('CLS_Settings_UE');

    /**
     * Cache name for settings
     * @type {string}
     */
    const SETTINGS_CACHE_NAME = 'CLS_SETTINGS_CACHE';

    /**
     * beforeLoad Entry Point
     * Adds feature status dashboard and prevents duplicate creation
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {string} context.type - Trigger type
     * @param {Form} context.form - Current form
     */
    function beforeLoad(context) {
        const startTime = Date.now();

        try {
            const settingsRec = context.newRecord;
            const form = context.form;

            if (context.type === context.UserEventType.CREATE) {
                if (settingsRecordExists()) {
                    throw new Error('LumberSuite™ Settings record already exists. Only one settings record is allowed.');
                }
            }

            if (context.type === context.UserEventType.VIEW) {
                addFeatureStatusDashboard(settingsRec, form);
                addDependencyMatrix(settingsRec, form);
                addUsageStatistics(settingsRec, form);
            }

            if (context.type === context.UserEventType.EDIT) {
                addFeatureWarnings(settingsRec, form);
            }

            logger.debug('beforeLoad', `Completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('beforeLoad', `Error: ${e.message}`, { stack: e.stack });
            throw e;
        }
    }

    /**
     * beforeSubmit Entry Point
     * Validates feature dependencies and prevents invalid configurations
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record (edit only)
     * @param {string} context.type - Trigger type
     */
    function beforeSubmit(context) {
        const startTime = Date.now();

        try {
            if (context.type === context.UserEventType.DELETE) {
                throw new Error('LumberSuite™ Settings record cannot be deleted.');
            }

            if (context.type === context.UserEventType.CREATE) {
                if (settingsRecordExists()) {
                    throw new Error('LumberSuite™ Settings record already exists. Only one settings record is allowed.');
                }
            }

            const settingsRec = context.newRecord;

            validateFeatureDependencies(settingsRec);
            validateLicenseRequirements(settingsRec);
            setDefaultValues(settingsRec, context.type);
            calculateFeatureHash(settingsRec);

            logger.audit('beforeSubmit', `Settings validation completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('beforeSubmit', `Error: ${e.message}`, { stack: e.stack });
            throw e;
        }
    }

    /**
     * afterSubmit Entry Point
     * Clears cache and logs configuration changes
     *
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record (edit only)
     * @param {string} context.type - Trigger type
     */
    function afterSubmit(context) {
        const startTime = Date.now();

        try {
            clearSettingsCache();

            if (context.type === context.UserEventType.EDIT) {
                logConfigurationChanges(context.newRecord, context.oldRecord);
            }

            if (context.type === context.UserEventType.CREATE) {
                logInitialConfiguration(context.newRecord);
            }

            logger.audit('afterSubmit', `Settings post-processing completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('afterSubmit', `Error: ${e.message}`, { stack: e.stack });
        }
    }

    /**
     * Checks if a settings record already exists
     *
     * @returns {boolean} True if settings record exists
     */
    function settingsRecordExists() {
        const settingsSearch = search.create({
            type: Constants.RECORD_TYPES.SETTINGS,
            filters: [],
            columns: ['internalid']
        });

        const results = settingsSearch.run().getRange({ start: 0, end: 1 });
        return results.length > 0;
    }

    /**
     * Adds feature status dashboard to the form
     *
     * @param {Record} settingsRec - Settings record
     * @param {Form} form - Current form
     */
    function addFeatureStatusDashboard(settingsRec, form) {
        try {
            const dashboardGroup = form.addFieldGroup({
                id: 'custpage_cls_feature_dashboard',
                label: 'Feature Status Dashboard'
            });

            const features = getFeatureStatus(settingsRec);
            let statusHtml = '<table style="width:100%; border-collapse:collapse;">';
            statusHtml += '<tr style="background:#f5f5f5;">';
            statusHtml += '<th style="padding:8px; text-align:left; border:1px solid #ddd;">Module</th>';
            statusHtml += '<th style="padding:8px; text-align:center; border:1px solid #ddd;">Status</th>';
            statusHtml += '<th style="padding:8px; text-align:left; border:1px solid #ddd;">Dependencies</th>';
            statusHtml += '<th style="padding:8px; text-align:left; border:1px solid #ddd;">Last Modified</th>';
            statusHtml += '</tr>';

            for (const feature of features) {
                const statusColor = feature.enabled ? '#28a745' : '#dc3545';
                const statusText = feature.enabled ? 'ENABLED' : 'DISABLED';
                const statusIcon = feature.enabled ? '&#10004;' : '&#10006;';

                statusHtml += `<tr>`;
                statusHtml += `<td style="padding:8px; border:1px solid #ddd;"><strong>${feature.name}</strong><br><small>${feature.description}</small></td>`;
                statusHtml += `<td style="padding:8px; text-align:center; border:1px solid #ddd; color:${statusColor};"><span style="font-size:18px;">${statusIcon}</span> ${statusText}</td>`;
                statusHtml += `<td style="padding:8px; border:1px solid #ddd;">${feature.dependencies || 'None'}</td>`;
                statusHtml += `<td style="padding:8px; border:1px solid #ddd;">${feature.lastModified || 'N/A'}</td>`;
                statusHtml += `</tr>`;
            }

            statusHtml += '</table>';

            const dashboardField = form.addField({
                id: 'custpage_cls_status_dashboard',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cls_feature_dashboard'
            });

            dashboardField.defaultValue = statusHtml;
        } catch (e) {
            logger.error('addFeatureStatusDashboard', `Error adding dashboard: ${e.message}`);
        }
    }

    /**
     * Gets feature status from settings record
     *
     * @param {Record} settingsRec - Settings record
     * @returns {Array} Array of feature status objects
     */
    function getFeatureStatus(settingsRec) {
        const lastModified = settingsRec.getValue({ fieldId: 'lastmodifieddate' }) || new Date();
        const modifiedStr = formatDate(lastModified);

        return [
            {
                name: 'Dynamic UOM Conversion',
                description: 'Core BF/LF/SF/MBF conversion engine',
                enabled: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM }) || false,
                dependencies: 'None (Core Module)',
                lastModified: modifiedStr
            },
            {
                name: 'Yield Tracking',
                description: 'Track yield percentage and waste on work orders',
                enabled: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING }) || false,
                dependencies: 'Dynamic UOM Conversion',
                lastModified: modifiedStr
            },
            {
                name: 'Tally Sheet Management',
                description: 'Lot/Tally tracking with FIFO allocation',
                enabled: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING }) || false,
                dependencies: 'Dynamic UOM Conversion',
                lastModified: modifiedStr
            },
            {
                name: 'Repack/Resaw Module',
                description: 'Bundle repacking and board resawing operations',
                enabled: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK }) || false,
                dependencies: 'Dynamic UOM Conversion, Yield Tracking',
                lastModified: modifiedStr
            },
            {
                name: 'Margin Analysis',
                description: 'Real-time profit margin calculations on sales',
                enabled: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_MARGIN_ANALYSIS }) || false,
                dependencies: 'Dynamic UOM Conversion',
                lastModified: modifiedStr
            },
            {
                name: 'Consumption Analytics',
                description: 'Track and analyze BF consumption patterns',
                enabled: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_CONSUMPTION_LOG }) || false,
                dependencies: 'Dynamic UOM Conversion',
                lastModified: modifiedStr
            },
            {
                name: 'Advanced Reporting',
                description: 'Enhanced saved searches and dashboards',
                enabled: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_ADVANCED_REPORTING }) || false,
                dependencies: 'Dynamic UOM Conversion',
                lastModified: modifiedStr
            }
        ];
    }

    /**
     * Adds dependency matrix to the form
     *
     * @param {Record} settingsRec - Settings record
     * @param {Form} form - Current form
     */
    function addDependencyMatrix(settingsRec, form) {
        try {
            const matrixGroup = form.addFieldGroup({
                id: 'custpage_cls_dependency_matrix',
                label: 'Module Dependency Matrix'
            });

            let matrixHtml = '<div style="padding:10px;">';
            matrixHtml += '<p><strong>Module Dependencies:</strong></p>';
            matrixHtml += '<ul style="list-style-type:none; padding:0;">';
            matrixHtml += '<li style="padding:5px 0;"><span style="color:#007bff;">&#9679;</span> <strong>Dynamic UOM Conversion</strong> &rarr; Core (Required for all modules)</li>';
            matrixHtml += '<li style="padding:5px 0;"><span style="color:#28a745;">&#9679;</span> <strong>Yield Tracking</strong> &rarr; Requires: Dynamic UOM</li>';
            matrixHtml += '<li style="padding:5px 0;"><span style="color:#28a745;">&#9679;</span> <strong>Tally Sheet Management</strong> &rarr; Requires: Dynamic UOM</li>';
            matrixHtml += '<li style="padding:5px 0;"><span style="color:#ffc107;">&#9679;</span> <strong>Repack/Resaw</strong> &rarr; Requires: Dynamic UOM + Yield Tracking</li>';
            matrixHtml += '<li style="padding:5px 0;"><span style="color:#17a2b8;">&#9679;</span> <strong>Margin Analysis</strong> &rarr; Requires: Dynamic UOM</li>';
            matrixHtml += '<li style="padding:5px 0;"><span style="color:#17a2b8;">&#9679;</span> <strong>Consumption Analytics</strong> &rarr; Requires: Dynamic UOM</li>';
            matrixHtml += '<li style="padding:5px 0;"><span style="color:#6c757d;">&#9679;</span> <strong>Advanced Reporting</strong> &rarr; Requires: Dynamic UOM</li>';
            matrixHtml += '</ul>';
            matrixHtml += '</div>';

            const matrixField = form.addField({
                id: 'custpage_cls_dep_matrix',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cls_dependency_matrix'
            });

            matrixField.defaultValue = matrixHtml;
        } catch (e) {
            logger.error('addDependencyMatrix', `Error adding matrix: ${e.message}`);
        }
    }

    /**
     * Adds usage statistics section to the form
     *
     * @param {Record} settingsRec - Settings record
     * @param {Form} form - Current form
     */
    function addUsageStatistics(settingsRec, form) {
        try {
            const statsGroup = form.addFieldGroup({
                id: 'custpage_cls_usage_stats',
                label: 'Usage Statistics'
            });

            const stats = getUsageStatistics();

            let statsHtml = '<table style="width:100%; border-collapse:collapse;">';
            statsHtml += '<tr>';
            statsHtml += '<td style="padding:15px; text-align:center; border:1px solid #ddd; width:25%;">';
            statsHtml += `<div style="font-size:24px; font-weight:bold; color:#007bff;">${stats.totalTransactions}</div>`;
            statsHtml += '<div>Transactions Processed</div></td>';
            statsHtml += '<td style="padding:15px; text-align:center; border:1px solid #ddd; width:25%;">';
            statsHtml += `<div style="font-size:24px; font-weight:bold; color:#28a745;">${stats.totalBF}</div>`;
            statsHtml += '<div>Total BF Tracked</div></td>';
            statsHtml += '<td style="padding:15px; text-align:center; border:1px solid #ddd; width:25%;">';
            statsHtml += `<div style="font-size:24px; font-weight:bold; color:#ffc107;">${stats.activeTallies}</div>`;
            statsHtml += '<div>Active Tallies</div></td>';
            statsHtml += '<td style="padding:15px; text-align:center; border:1px solid #ddd; width:25%;">';
            statsHtml += `<div style="font-size:24px; font-weight:bold; color:#17a2b8;">${stats.avgYield}%</div>`;
            statsHtml += '<div>Average Yield</div></td>';
            statsHtml += '</tr>';
            statsHtml += '</table>';

            const statsField = form.addField({
                id: 'custpage_cls_statistics',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cls_usage_stats'
            });

            statsField.defaultValue = statsHtml;
        } catch (e) {
            logger.error('addUsageStatistics', `Error adding statistics: ${e.message}`);
        }
    }

    /**
     * Gets usage statistics from the system
     *
     * @returns {Object} Usage statistics
     */
    function getUsageStatistics() {
        const stats = {
            totalTransactions: 0,
            totalBF: '0',
            activeTallies: 0,
            avgYield: '0'
        };

        try {
            const consumptionSearch = search.create({
                type: Constants.RECORD_TYPES.CONSUMPTION_LOG,
                filters: [],
                columns: [
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: Constants.CONSUMPTION_FIELDS.TOTAL_BF, summary: search.Summary.SUM })
                ]
            });

            consumptionSearch.run().each(function(result) {
                stats.totalTransactions = result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }) || 0;

                const totalBF = parseFloat(result.getValue({
                    name: Constants.CONSUMPTION_FIELDS.TOTAL_BF,
                    summary: search.Summary.SUM
                })) || 0;

                stats.totalBF = formatNumber(totalBF);
                return false;
            });
        } catch (e) {
            logger.debug('getUsageStatistics', `Consumption stats not available: ${e.message}`);
        }

        try {
            const tallySearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_SHEET,
                filters: [
                    [Constants.TALLY_FIELDS.STATUS, 'is', Constants.TALLY_STATUS.ACTIVE]
                ],
                columns: [
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            tallySearch.run().each(function(result) {
                stats.activeTallies = result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }) || 0;
                return false;
            });
        } catch (e) {
            logger.debug('getUsageStatistics', `Tally stats not available: ${e.message}`);
        }

        try {
            const yieldSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [],
                columns: [
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.AVG })
                ]
            });

            yieldSearch.run().each(function(result) {
                const avgYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.AVG
                })) || 0;

                stats.avgYield = avgYield.toFixed(1);
                return false;
            });
        } catch (e) {
            logger.debug('getUsageStatistics', `Yield stats not available: ${e.message}`);
        }

        return stats;
    }

    /**
     * Adds feature warnings for edit mode
     *
     * @param {Record} settingsRec - Settings record
     * @param {Form} form - Current form
     */
    function addFeatureWarnings(settingsRec, form) {
        try {
            const warningGroup = form.addFieldGroup({
                id: 'custpage_cls_warnings',
                label: 'Important Notices'
            });

            let warningHtml = '<div style="padding:10px; background:#fff3cd; border:1px solid #ffc107; border-radius:4px;">';
            warningHtml += '<p style="margin:0;"><strong>&#9888; Warning:</strong> Disabling modules may affect existing transactions and reports.</p>';
            warningHtml += '<ul style="margin:10px 0 0 0;">';
            warningHtml += '<li>Disabling <strong>Dynamic UOM Conversion</strong> will disable ALL dependent modules.</li>';
            warningHtml += '<li>Disabling <strong>Yield Tracking</strong> will also disable Repack/Resaw Module.</li>';
            warningHtml += '<li>Changes take effect immediately after saving.</li>';
            warningHtml += '<li>Existing data will be preserved but may not be accessible until re-enabled.</li>';
            warningHtml += '</ul>';
            warningHtml += '</div>';

            const warningField = form.addField({
                id: 'custpage_cls_warning_msg',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cls_warnings'
            });

            warningField.defaultValue = warningHtml;
        } catch (e) {
            logger.error('addFeatureWarnings', `Error adding warnings: ${e.message}`);
        }
    }

    /**
     * Validates feature dependencies
     *
     * @param {Record} settingsRec - Settings record
     * @throws {Error} If invalid dependency configuration
     */
    function validateFeatureDependencies(settingsRec) {
        const dynamicUomEnabled = settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM });
        const yieldEnabled = settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING });
        const tallyEnabled = settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING });
        const repackEnabled = settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK });
        const marginEnabled = settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_MARGIN_ANALYSIS });
        const consumptionEnabled = settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_CONSUMPTION_LOG });
        const reportingEnabled = settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_ADVANCED_REPORTING });

        if (!dynamicUomEnabled) {
            if (yieldEnabled || tallyEnabled || repackEnabled || marginEnabled || consumptionEnabled || reportingEnabled) {
                throw new Error('Dynamic UOM Conversion must be enabled to use any other LumberSuite™ modules.');
            }
        }

        if (repackEnabled && !yieldEnabled) {
            throw new Error('Yield Tracking must be enabled to use the Repack/Resaw Module.');
        }

        logger.debug('validateFeatureDependencies', 'All feature dependencies validated successfully');
    }

    /**
     * Validates license requirements for enabled features
     *
     * @param {Record} settingsRec - Settings record
     */
    function validateLicenseRequirements(settingsRec) {
        const licenseKey = settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.LICENSE_KEY });
        const licenseExpiry = settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.LICENSE_EXPIRY });

        if (licenseExpiry && new Date(licenseExpiry) < new Date()) {
            logger.warn('validateLicenseRequirements', 'License has expired. Some features may be limited.');
        }

        logger.debug('validateLicenseRequirements', 'License validation completed');
    }

    /**
     * Sets default values for new settings records
     *
     * @param {Record} settingsRec - Settings record
     * @param {string} eventType - Event type
     */
    function setDefaultValues(settingsRec, eventType) {
        if (eventType !== 'create') {
            return;
        }

        if (!settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE })) {
            settingsRec.setValue({
                fieldId: Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE,
                value: 85
            });
        }

        if (!settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD })) {
            settingsRec.setValue({
                fieldId: Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD,
                value: 15
            });
        }

        if (!settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION })) {
            settingsRec.setValue({
                fieldId: Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION,
                value: 4
            });
        }

        if (!settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.TALLY_ALLOCATION_METHOD })) {
            settingsRec.setValue({
                fieldId: Constants.SETTINGS_FIELDS.TALLY_ALLOCATION_METHOD,
                value: 'FIFO'
            });
        }

        settingsRec.setValue({
            fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM,
            value: true
        });

        logger.debug('setDefaultValues', 'Default values set for new settings record');
    }

    /**
     * Calculates and stores feature configuration hash
     *
     * @param {Record} settingsRec - Settings record
     */
    function calculateFeatureHash(settingsRec) {
        const features = {
            dynamicUom: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM }),
            yield: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING }),
            tally: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING }),
            repack: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK }),
            margin: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_MARGIN_ANALYSIS }),
            consumption: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_CONSUMPTION_LOG }),
            reporting: settingsRec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_ADVANCED_REPORTING })
        };

        const featureString = JSON.stringify(features);
        let hash = 0;
        for (let i = 0; i < featureString.length; i++) {
            const char = featureString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        settingsRec.setValue({
            fieldId: Constants.SETTINGS_FIELDS.FEATURE_HASH,
            value: Math.abs(hash).toString(16)
        });

        logger.debug('calculateFeatureHash', `Feature hash: ${Math.abs(hash).toString(16)}`);
    }

    /**
     * Clears the settings cache
     */
    function clearSettingsCache() {
        try {
            const settingsCache = cache.getCache({
                name: SETTINGS_CACHE_NAME,
                scope: cache.Scope.PUBLIC
            });

            settingsCache.remove({ key: 'settings' });
            settingsCache.remove({ key: 'features' });

            logger.audit('clearSettingsCache', 'Settings cache cleared');
        } catch (e) {
            logger.debug('clearSettingsCache', `Cache clear failed: ${e.message}`);
        }
    }

    /**
     * Logs configuration changes between old and new records
     *
     * @param {Record} newRecord - New record
     * @param {Record} oldRecord - Old record
     */
    function logConfigurationChanges(newRecord, oldRecord) {
        const changes = [];

        const fieldsToCheck = [
            { field: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM, name: 'Dynamic UOM Conversion' },
            { field: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING, name: 'Yield Tracking' },
            { field: Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING, name: 'Tally Sheet Management' },
            { field: Constants.SETTINGS_FIELDS.ENABLE_REPACK, name: 'Repack/Resaw Module' },
            { field: Constants.SETTINGS_FIELDS.ENABLE_MARGIN_ANALYSIS, name: 'Margin Analysis' },
            { field: Constants.SETTINGS_FIELDS.ENABLE_CONSUMPTION_LOG, name: 'Consumption Analytics' },
            { field: Constants.SETTINGS_FIELDS.ENABLE_ADVANCED_REPORTING, name: 'Advanced Reporting' },
            { field: Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE, name: 'Default Yield %' },
            { field: Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD, name: 'Low Margin Threshold' },
            { field: Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION, name: 'BF Decimal Precision' }
        ];

        for (const fieldInfo of fieldsToCheck) {
            const oldValue = oldRecord.getValue({ fieldId: fieldInfo.field });
            const newValue = newRecord.getValue({ fieldId: fieldInfo.field });

            if (oldValue !== newValue) {
                changes.push({
                    field: fieldInfo.name,
                    oldValue: String(oldValue),
                    newValue: String(newValue)
                });
            }
        }

        if (changes.length > 0) {
            try {
                const auditLog = record.create({
                    type: Constants.RECORD_TYPES.CONFIG_AUDIT_LOG,
                    isDynamic: false
                });

                auditLog.setValue({
                    fieldId: 'custrecord_cls_audit_date',
                    value: new Date()
                });

                auditLog.setValue({
                    fieldId: 'custrecord_cls_audit_user',
                    value: runtime.getCurrentUser().id
                });

                auditLog.setValue({
                    fieldId: 'custrecord_cls_audit_changes',
                    value: JSON.stringify(changes)
                });

                auditLog.save();

                logger.audit('logConfigurationChanges', `Logged ${changes.length} configuration changes`);
            } catch (e) {
                logger.warn('logConfigurationChanges', `Could not create audit log: ${e.message}`);
                logger.audit('logConfigurationChanges', `Changes: ${JSON.stringify(changes)}`);
            }
        }
    }

    /**
     * Logs initial configuration for new settings records
     *
     * @param {Record} newRecord - New record
     */
    function logInitialConfiguration(newRecord) {
        const config = {
            dynamicUom: newRecord.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM }),
            yield: newRecord.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING }),
            tally: newRecord.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING }),
            repack: newRecord.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK }),
            margin: newRecord.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_MARGIN_ANALYSIS }),
            consumption: newRecord.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_CONSUMPTION_LOG }),
            reporting: newRecord.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_ADVANCED_REPORTING }),
            defaultYield: newRecord.getValue({ fieldId: Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE }),
            lowMarginThreshold: newRecord.getValue({ fieldId: Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD }),
            bfPrecision: newRecord.getValue({ fieldId: Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION })
        };

        logger.audit('logInitialConfiguration', `LumberSuite™ Settings created: ${JSON.stringify(config)}`);
    }

    /**
     * Formats a date for display
     *
     * @param {Date} date - Date to format
     * @returns {string} Formatted date string
     */
    function formatDate(date) {
        if (!date) return 'N/A';

        try {
            const d = new Date(date);
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return 'N/A';
        }
    }

    /**
     * Formats a number with thousands separators
     *
     * @param {number} num - Number to format
     * @returns {string} Formatted number string
     */
    function formatNumber(num) {
        if (typeof num !== 'number') return '0';

        if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }

        return num.toFixed(0);
    }

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
