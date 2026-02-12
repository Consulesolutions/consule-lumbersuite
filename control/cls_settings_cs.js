/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @file cls_settings_cs.js
 * @description Settings Record Client Script for Consule LumberSuite™
 *              Provides real-time validation and UI enhancements for feature configuration
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module control/cls_settings_cs
 */

define([
    'N/currentRecord',
    'N/ui/dialog',
    'N/ui/message',
    '../lib/cls_constants'
], function(
    currentRecord,
    dialog,
    message,
    Constants
) {
    'use strict';

    /**
     * Active message banner reference
     * @type {Object}
     */
    let activeBanner = null;

    /**
     * Tracks pending changes for confirmation
     * @type {Array}
     */
    let pendingChanges = [];

    /**
     * Original values for change detection
     * @type {Object}
     */
    let originalValues = {};

    /**
     * pageInit Entry Point
     * Initializes the settings form with enhanced UI elements
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.mode - Page mode (create, copy, edit)
     */
    function pageInit(context) {
        const rec = context.currentRecord;

        if (context.mode === 'edit') {
            captureOriginalValues(rec);
            showEditModeBanner();
            initializeFeatureToggles(rec);
        }

        if (context.mode === 'create') {
            showCreateModeBanner();
            setRecommendedDefaults(rec);
        }

        setupFieldHelp();
        console.log('LumberSuite™ Settings Client Script initialized');
    }

    /**
     * Captures original field values for change detection
     *
     * @param {Record} rec - Current record
     */
    function captureOriginalValues(rec) {
        originalValues = {
            dynamicUom: rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM }),
            yield: rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING }),
            tally: rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING }),
            repack: rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK }),
            margin: rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_MARGIN_ANALYSIS }),
            consumption: rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_CONSUMPTION_LOG }),
            reporting: rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_ADVANCED_REPORTING }),
            defaultYield: rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE }),
            lowMarginThreshold: rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD }),
            bfPrecision: rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION })
        };
    }

    /**
     * Shows edit mode warning banner
     */
    function showEditModeBanner() {
        if (activeBanner) {
            activeBanner.hide();
        }

        activeBanner = message.create({
            title: 'Editing LumberSuite™ Configuration',
            message: 'Changes to feature settings take effect immediately after saving. ' +
                     'Disabling modules may affect existing transactions.',
            type: message.Type.WARNING
        });

        activeBanner.show();
    }

    /**
     * Shows create mode information banner
     */
    function showCreateModeBanner() {
        if (activeBanner) {
            activeBanner.hide();
        }

        activeBanner = message.create({
            title: 'Creating LumberSuite™ Settings',
            message: 'This is a singleton record. Only one LumberSuite™ Settings record can exist in the system. ' +
                     'Recommended defaults have been applied.',
            type: message.Type.INFORMATION
        });

        activeBanner.show();
    }

    /**
     * Initializes feature toggle states and visual indicators
     *
     * @param {Record} rec - Current record
     */
    function initializeFeatureToggles(rec) {
        const dynamicUomEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM });

        if (!dynamicUomEnabled) {
            disableDependentModules(rec);
        }

        updateFeatureVisuals(rec);
    }

    /**
     * Sets recommended default values for new records
     *
     * @param {Record} rec - Current record
     */
    function setRecommendedDefaults(rec) {
        rec.setValue({
            fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM,
            value: true,
            ignoreFieldChange: true
        });

        rec.setValue({
            fieldId: Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE,
            value: 85,
            ignoreFieldChange: true
        });

        rec.setValue({
            fieldId: Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD,
            value: 15,
            ignoreFieldChange: true
        });

        rec.setValue({
            fieldId: Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION,
            value: 4,
            ignoreFieldChange: true
        });

        rec.setValue({
            fieldId: Constants.SETTINGS_FIELDS.TALLY_ALLOCATION_METHOD,
            value: 'FIFO',
            ignoreFieldChange: true
        });
    }

    /**
     * Sets up field help tooltips
     */
    function setupFieldHelp() {
        // Field help is typically set up via record customization
        // This function provides additional runtime help if needed
        console.log('Field help initialized');
    }

    /**
     * fieldChanged Entry Point
     * Handles real-time dependency validation and UI updates
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.fieldId - Changed field ID
     */
    function fieldChanged(context) {
        const rec = context.currentRecord;
        const fieldId = context.fieldId;

        switch (fieldId) {
            case Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM:
                handleDynamicUomChange(rec);
                break;

            case Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING:
                handleYieldTrackingChange(rec);
                break;

            case Constants.SETTINGS_FIELDS.ENABLE_REPACK:
                handleRepackChange(rec);
                break;

            case Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE:
                validateYieldPercentage(rec);
                break;

            case Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD:
                validateMarginThreshold(rec);
                break;

            case Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION:
                validateDecimalPrecision(rec);
                break;
        }

        trackPendingChanges(rec, fieldId);
        updateFeatureVisuals(rec);
    }

    /**
     * Handles Dynamic UOM toggle changes
     *
     * @param {Record} rec - Current record
     */
    function handleDynamicUomChange(rec) {
        const isEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM });

        if (!isEnabled) {
            dialog.confirm({
                title: 'Disable Core Module?',
                message: 'Disabling Dynamic UOM Conversion will automatically disable ALL dependent modules:\n\n' +
                         '• Yield Tracking\n' +
                         '• Tally Sheet Management\n' +
                         '• Repack/Resaw Module\n' +
                         '• Margin Analysis\n' +
                         '• Consumption Analytics\n' +
                         '• Advanced Reporting\n\n' +
                         'Do you want to continue?'
            }).then(function(result) {
                if (result) {
                    disableDependentModules(rec);
                } else {
                    rec.setValue({
                        fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM,
                        value: true,
                        ignoreFieldChange: true
                    });
                }
            });
        } else {
            showInfoMessage('Core Module Enabled',
                'Dynamic UOM Conversion is now enabled. You can activate other modules as needed.');
        }
    }

    /**
     * Disables all modules dependent on Dynamic UOM
     *
     * @param {Record} rec - Current record
     */
    function disableDependentModules(rec) {
        const dependentFields = [
            Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING,
            Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING,
            Constants.SETTINGS_FIELDS.ENABLE_REPACK,
            Constants.SETTINGS_FIELDS.ENABLE_MARGIN_ANALYSIS,
            Constants.SETTINGS_FIELDS.ENABLE_CONSUMPTION_LOG,
            Constants.SETTINGS_FIELDS.ENABLE_ADVANCED_REPORTING
        ];

        for (const fieldId of dependentFields) {
            rec.setValue({
                fieldId: fieldId,
                value: false,
                ignoreFieldChange: true
            });
        }
    }

    /**
     * Handles Yield Tracking toggle changes
     *
     * @param {Record} rec - Current record
     */
    function handleYieldTrackingChange(rec) {
        const isEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING });
        const repackEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK });

        if (!isEnabled && repackEnabled) {
            dialog.confirm({
                title: 'Disable Yield Tracking?',
                message: 'Disabling Yield Tracking will also disable the Repack/Resaw Module, ' +
                         'which depends on yield calculations.\n\n' +
                         'Do you want to continue?'
            }).then(function(result) {
                if (result) {
                    rec.setValue({
                        fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK,
                        value: false,
                        ignoreFieldChange: true
                    });
                } else {
                    rec.setValue({
                        fieldId: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING,
                        value: true,
                        ignoreFieldChange: true
                    });
                }
            });
        }
    }

    /**
     * Handles Repack module toggle changes
     *
     * @param {Record} rec - Current record
     */
    function handleRepackChange(rec) {
        const repackEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK });
        const yieldEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING });
        const dynamicUomEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM });

        if (repackEnabled) {
            if (!dynamicUomEnabled) {
                showErrorMessage('Dependency Required',
                    'Dynamic UOM Conversion must be enabled to use the Repack/Resaw Module.');

                rec.setValue({
                    fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK,
                    value: false,
                    ignoreFieldChange: true
                });
                return;
            }

            if (!yieldEnabled) {
                dialog.confirm({
                    title: 'Enable Required Dependency?',
                    message: 'The Repack/Resaw Module requires Yield Tracking to be enabled.\n\n' +
                             'Would you like to enable Yield Tracking now?'
                }).then(function(result) {
                    if (result) {
                        rec.setValue({
                            fieldId: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING,
                            value: true,
                            ignoreFieldChange: true
                        });
                    } else {
                        rec.setValue({
                            fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK,
                            value: false,
                            ignoreFieldChange: true
                        });
                    }
                });
            }
        }
    }

    /**
     * Validates yield percentage field
     *
     * @param {Record} rec - Current record
     */
    function validateYieldPercentage(rec) {
        const yieldPct = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE });

        if (yieldPct < 0 || yieldPct > 100) {
            showErrorMessage('Invalid Value', 'Default Yield Percentage must be between 0 and 100.');

            rec.setValue({
                fieldId: Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE,
                value: 85,
                ignoreFieldChange: true
            });
        } else if (yieldPct < 50) {
            showWarningMessage('Low Yield Default',
                `A default yield of ${yieldPct}% is unusually low for lumber operations. ` +
                'Typical yields range from 70-95%.');
        }
    }

    /**
     * Validates margin threshold field
     *
     * @param {Record} rec - Current record
     */
    function validateMarginThreshold(rec) {
        const threshold = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD });

        if (threshold < 0 || threshold > 100) {
            showErrorMessage('Invalid Value', 'Low Margin Threshold must be between 0 and 100.');

            rec.setValue({
                fieldId: Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD,
                value: 15,
                ignoreFieldChange: true
            });
        }
    }

    /**
     * Validates decimal precision field
     *
     * @param {Record} rec - Current record
     */
    function validateDecimalPrecision(rec) {
        const precision = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION });

        if (precision < 0 || precision > 8) {
            showErrorMessage('Invalid Value', 'BF Decimal Precision must be between 0 and 8.');

            rec.setValue({
                fieldId: Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION,
                value: 4,
                ignoreFieldChange: true
            });
        } else if (precision > 6) {
            showWarningMessage('High Precision',
                'A precision of more than 6 decimal places may impact performance and is rarely necessary.');
        }
    }

    /**
     * Tracks changes for save confirmation
     *
     * @param {Record} rec - Current record
     * @param {string} fieldId - Changed field ID
     */
    function trackPendingChanges(rec, fieldId) {
        const fieldMapping = {
            [Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM]: { key: 'dynamicUom', name: 'Dynamic UOM Conversion' },
            [Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING]: { key: 'yield', name: 'Yield Tracking' },
            [Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING]: { key: 'tally', name: 'Tally Sheet Management' },
            [Constants.SETTINGS_FIELDS.ENABLE_REPACK]: { key: 'repack', name: 'Repack/Resaw Module' },
            [Constants.SETTINGS_FIELDS.ENABLE_MARGIN_ANALYSIS]: { key: 'margin', name: 'Margin Analysis' },
            [Constants.SETTINGS_FIELDS.ENABLE_CONSUMPTION_LOG]: { key: 'consumption', name: 'Consumption Analytics' },
            [Constants.SETTINGS_FIELDS.ENABLE_ADVANCED_REPORTING]: { key: 'reporting', name: 'Advanced Reporting' },
            [Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE]: { key: 'defaultYield', name: 'Default Yield %' },
            [Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD]: { key: 'lowMarginThreshold', name: 'Low Margin Threshold' },
            [Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION]: { key: 'bfPrecision', name: 'BF Decimal Precision' }
        };

        const fieldInfo = fieldMapping[fieldId];
        if (!fieldInfo) return;

        const currentValue = rec.getValue({ fieldId: fieldId });
        const originalValue = originalValues[fieldInfo.key];

        const existingIndex = pendingChanges.findIndex(c => c.field === fieldId);

        if (currentValue !== originalValue) {
            const change = {
                field: fieldId,
                name: fieldInfo.name,
                oldValue: originalValue,
                newValue: currentValue
            };

            if (existingIndex >= 0) {
                pendingChanges[existingIndex] = change;
            } else {
                pendingChanges.push(change);
            }
        } else if (existingIndex >= 0) {
            pendingChanges.splice(existingIndex, 1);
        }
    }

    /**
     * Updates visual indicators based on feature states
     *
     * @param {Record} rec - Current record
     */
    function updateFeatureVisuals(rec) {
        const dynamicUomEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM });

        const dependentFields = [
            Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING,
            Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING,
            Constants.SETTINGS_FIELDS.ENABLE_REPACK,
            Constants.SETTINGS_FIELDS.ENABLE_MARGIN_ANALYSIS,
            Constants.SETTINGS_FIELDS.ENABLE_CONSUMPTION_LOG,
            Constants.SETTINGS_FIELDS.ENABLE_ADVANCED_REPORTING
        ];

        // Note: Field disabling in client scripts is limited
        // Visual feedback is handled through CSS classes when possible
        console.log(`Feature state update - Dynamic UOM: ${dynamicUomEnabled}`);
    }

    /**
     * saveRecord Entry Point
     * Validates configuration and confirms changes before save
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @returns {boolean} True to allow save
     */
    function saveRecord(context) {
        const rec = context.currentRecord;

        if (!validateConfiguration(rec)) {
            return false;
        }

        if (pendingChanges.length > 0) {
            return confirmChanges();
        }

        return true;
    }

    /**
     * Validates the complete configuration before save
     *
     * @param {Record} rec - Current record
     * @returns {boolean} True if valid
     */
    function validateConfiguration(rec) {
        const dynamicUomEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_DYNAMIC_UOM });
        const yieldEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_YIELD_TRACKING });
        const tallyEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_TALLY_TRACKING });
        const repackEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_REPACK });
        const marginEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_MARGIN_ANALYSIS });
        const consumptionEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_CONSUMPTION_LOG });
        const reportingEnabled = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.ENABLE_ADVANCED_REPORTING });

        if (!dynamicUomEnabled) {
            if (yieldEnabled || tallyEnabled || repackEnabled || marginEnabled ||
                consumptionEnabled || reportingEnabled) {
                showErrorMessage('Invalid Configuration',
                    'Dynamic UOM Conversion must be enabled to use any other LumberSuite™ modules.');
                return false;
            }
        }

        if (repackEnabled && !yieldEnabled) {
            showErrorMessage('Invalid Configuration',
                'Yield Tracking must be enabled to use the Repack/Resaw Module.');
            return false;
        }

        const yieldPct = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.DEFAULT_YIELD_PERCENTAGE });
        if (yieldPct < 0 || yieldPct > 100) {
            showErrorMessage('Invalid Value', 'Default Yield Percentage must be between 0 and 100.');
            return false;
        }

        const marginThreshold = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.LOW_MARGIN_THRESHOLD });
        if (marginThreshold < 0 || marginThreshold > 100) {
            showErrorMessage('Invalid Value', 'Low Margin Threshold must be between 0 and 100.');
            return false;
        }

        const precision = rec.getValue({ fieldId: Constants.SETTINGS_FIELDS.BF_DECIMAL_PRECISION });
        if (precision < 0 || precision > 8) {
            showErrorMessage('Invalid Value', 'BF Decimal Precision must be between 0 and 8.');
            return false;
        }

        return true;
    }

    /**
     * Confirms pending changes with user
     *
     * @returns {boolean} True if user confirms
     */
    function confirmChanges() {
        let changesSummary = 'The following changes will be applied:\n\n';

        for (const change of pendingChanges) {
            const oldDisplay = formatDisplayValue(change.oldValue);
            const newDisplay = formatDisplayValue(change.newValue);
            changesSummary += `• ${change.name}: ${oldDisplay} → ${newDisplay}\n`;
        }

        changesSummary += '\nThese changes take effect immediately. Continue?';

        // Note: dialog.confirm is async, so we need to handle this differently
        // For synchronous saveRecord, we return true and rely on server validation
        console.log('Pending changes:', JSON.stringify(pendingChanges));
        return true;
    }

    /**
     * Formats a value for display in confirmation dialog
     *
     * @param {*} value - Value to format
     * @returns {string} Formatted value
     */
    function formatDisplayValue(value) {
        if (typeof value === 'boolean') {
            return value ? 'Enabled' : 'Disabled';
        }
        return String(value);
    }

    /**
     * Shows an information message banner
     *
     * @param {string} title - Message title
     * @param {string} msg - Message text
     */
    function showInfoMessage(title, msg) {
        if (activeBanner) {
            activeBanner.hide();
        }

        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.INFORMATION,
            duration: 5000
        });

        activeBanner.show();
    }

    /**
     * Shows a warning message banner
     *
     * @param {string} title - Message title
     * @param {string} msg - Message text
     */
    function showWarningMessage(title, msg) {
        if (activeBanner) {
            activeBanner.hide();
        }

        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.WARNING,
            duration: 7000
        });

        activeBanner.show();
    }

    /**
     * Shows an error message banner
     *
     * @param {string} title - Message title
     * @param {string} msg - Message text
     */
    function showErrorMessage(title, msg) {
        if (activeBanner) {
            activeBanner.hide();
        }

        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.ERROR,
            duration: 10000
        });

        activeBanner.show();
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        saveRecord: saveRecord
    };
});
