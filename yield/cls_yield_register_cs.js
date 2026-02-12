/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @file cls_yield_register_cs.js
 * @description Yield Register Client Script for Consule LumberSuite™
 *              Provides real-time yield calculations and user feedback
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module yield/cls_yield_register_cs
 */

define([
    'N/currentRecord',
    'N/search',
    'N/ui/dialog',
    'N/ui/message',
    '../lib/cls_constants',
    '../lib/cls_settings_dao'
], function(
    currentRecord,
    search,
    dialog,
    message,
    Constants,
    SettingsDAO
) {
    'use strict';

    /**
     * Flag to prevent recursive field changes
     * @type {boolean}
     */
    let isCalculating = false;

    /**
     * Active message banner reference
     * @type {Object}
     */
    let activeBanner = null;

    /**
     * Item data cache
     * @type {Map}
     */
    const itemCache = new Map();

    /**
     * Variance thresholds
     * @type {Object}
     */
    const VARIANCE_THRESHOLDS = {
        WARNING: 5,
        CRITICAL: 15
    };

    /**
     * pageInit Entry Point
     * Initializes the yield register form
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.mode - Page mode
     */
    function pageInit(context) {
        const rec = context.currentRecord;

        if (context.mode === 'create') {
            initializeNewRecord(rec);
        }

        if (context.mode === 'edit') {
            showEditModeWarning();
        }

        updateYieldDisplay(rec);

        console.log('LumberSuite™ Yield Register Client Script initialized');
    }

    /**
     * Initializes a new yield register record
     *
     * @param {Record} rec - Current record
     */
    function initializeNewRecord(rec) {
        // Set default expected yield from settings
        const defaultYield = SettingsDAO.getDefaultYieldPercentage() || 85;

        rec.setValue({
            fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD,
            value: defaultYield,
            ignoreFieldChange: true
        });

        showInfoBanner('New Yield Entry',
            'Enter the input and output BF values. Yield percentage will be calculated automatically.');
    }

    /**
     * Shows edit mode warning banner
     */
    function showEditModeWarning() {
        showWarningBanner('Adjustment Mode',
            'Changes to this yield record will be logged as an adjustment. Please provide a reason in the notes field.');
    }

    /**
     * fieldChanged Entry Point
     * Handles field changes for real-time calculations
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.fieldId - Changed field ID
     */
    function fieldChanged(context) {
        if (isCalculating) {
            return;
        }

        const rec = context.currentRecord;
        const fieldId = context.fieldId;

        switch (fieldId) {
            case Constants.YIELD_FIELDS.INPUT_BF:
            case Constants.YIELD_FIELDS.OUTPUT_BF:
                calculateYieldMetrics(rec);
                break;

            case Constants.YIELD_FIELDS.ITEM:
                handleItemChange(rec);
                break;

            case Constants.YIELD_FIELDS.SOURCE_TRANSACTION:
                handleSourceTransactionChange(rec);
                break;

            case Constants.YIELD_FIELDS.EXPECTED_YIELD:
                updateVarianceDisplay(rec);
                break;

            case Constants.YIELD_FIELDS.SAWDUST_BF:
            case Constants.YIELD_FIELDS.TRIM_WASTE_BF:
            case Constants.YIELD_FIELDS.DEFECT_WASTE_BF:
            case Constants.YIELD_FIELDS.OTHER_WASTE_BF:
                validateWasteBreakdown(rec);
                break;
        }

        updateYieldDisplay(rec);
    }

    /**
     * Calculates yield metrics based on input/output BF
     *
     * @param {Record} rec - Current record
     */
    function calculateYieldMetrics(rec) {
        isCalculating = true;

        try {
            const inputBF = parseFloat(rec.getValue({
                fieldId: Constants.YIELD_FIELDS.INPUT_BF
            })) || 0;

            const outputBF = parseFloat(rec.getValue({
                fieldId: Constants.YIELD_FIELDS.OUTPUT_BF
            })) || 0;

            // Calculate yield percentage
            let yieldPct = 0;
            if (inputBF > 0) {
                yieldPct = (outputBF / inputBF) * 100;
            }

            rec.setValue({
                fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                value: yieldPct,
                ignoreFieldChange: true
            });

            // Calculate waste BF
            const wasteBF = Math.max(0, inputBF - outputBF);

            rec.setValue({
                fieldId: Constants.YIELD_FIELDS.WASTE_BF,
                value: wasteBF,
                ignoreFieldChange: true
            });

            // Calculate waste percentage
            let wastePct = 0;
            if (inputBF > 0) {
                wastePct = (wasteBF / inputBF) * 100;
            }

            rec.setValue({
                fieldId: Constants.YIELD_FIELDS.WASTE_PERCENTAGE,
                value: wastePct,
                ignoreFieldChange: true
            });

            // Calculate variance
            const expectedYield = parseFloat(rec.getValue({
                fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD
            })) || 85;

            const variance = yieldPct - expectedYield;

            rec.setValue({
                fieldId: Constants.YIELD_FIELDS.YIELD_VARIANCE,
                value: variance,
                ignoreFieldChange: true
            });

            // Show appropriate messages based on variance
            showVarianceMessage(variance, yieldPct);

        } finally {
            isCalculating = false;
        }
    }

    /**
     * Shows variance-based message to user
     *
     * @param {number} variance - Yield variance
     * @param {number} yieldPct - Actual yield percentage
     */
    function showVarianceMessage(variance, yieldPct) {
        const absVariance = Math.abs(variance);

        if (absVariance <= VARIANCE_THRESHOLDS.WARNING) {
            showSuccessBanner('Yield On Target',
                `Yield of ${yieldPct.toFixed(1)}% is within acceptable range.`);
        } else if (absVariance <= VARIANCE_THRESHOLDS.CRITICAL) {
            showWarningBanner('Yield Variance Detected',
                `Yield of ${yieldPct.toFixed(1)}% shows a ${absVariance.toFixed(1)}% variance from expected.`);
        } else {
            showErrorBanner('Critical Yield Variance',
                `Yield of ${yieldPct.toFixed(1)}% shows a significant ${absVariance.toFixed(1)}% variance. Please verify measurements.`);
        }
    }

    /**
     * Handles item field change
     *
     * @param {Record} rec - Current record
     */
    function handleItemChange(rec) {
        const itemId = rec.getValue({ fieldId: Constants.YIELD_FIELDS.ITEM });

        if (!itemId) {
            return;
        }

        // Load item data and set expected yield
        const itemData = getItemData(itemId);

        if (itemData && itemData.defaultYield) {
            rec.setValue({
                fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD,
                value: itemData.defaultYield,
                ignoreFieldChange: true
            });

            showInfoBanner('Item Selected',
                `Expected yield set to ${itemData.defaultYield}% based on item default.`);
        }

        // Show historical yield info if available
        if (itemData && itemData.avgYield) {
            console.log(`Historical average yield for item: ${itemData.avgYield.toFixed(1)}%`);
        }
    }

    /**
     * Gets item data with caching
     *
     * @param {string|number} itemId - Item internal ID
     * @returns {Object|null} Item data
     */
    function getItemData(itemId) {
        if (!itemId) {
            return null;
        }

        if (itemCache.has(itemId)) {
            return itemCache.get(itemId);
        }

        try {
            const itemLookup = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: [
                    Constants.ITEM_FIELDS.DEFAULT_YIELD,
                    Constants.ITEM_FIELDS.AVG_YIELD,
                    Constants.ITEM_FIELDS.SPECIES,
                    Constants.ITEM_FIELDS.GRADE,
                    'itemid'
                ]
            });

            const itemData = {
                id: itemId,
                itemId: itemLookup.itemid,
                defaultYield: parseFloat(itemLookup[Constants.ITEM_FIELDS.DEFAULT_YIELD]) || 85,
                avgYield: parseFloat(itemLookup[Constants.ITEM_FIELDS.AVG_YIELD]) || 0,
                species: itemLookup[Constants.ITEM_FIELDS.SPECIES],
                grade: itemLookup[Constants.ITEM_FIELDS.GRADE]
            };

            itemCache.set(itemId, itemData);
            return itemData;
        } catch (e) {
            console.error('Error loading item data:', e.message);
            return null;
        }
    }

    /**
     * Handles source transaction change
     *
     * @param {Record} rec - Current record
     */
    function handleSourceTransactionChange(rec) {
        const sourceId = rec.getValue({ fieldId: Constants.YIELD_FIELDS.SOURCE_TRANSACTION });

        if (!sourceId) {
            return;
        }

        // Try to load source transaction data
        try {
            const sourceData = getSourceTransactionData(sourceId);

            if (sourceData) {
                // Pre-fill input BF from source if available
                if (sourceData.consumedBF && !rec.getValue({ fieldId: Constants.YIELD_FIELDS.INPUT_BF })) {
                    rec.setValue({
                        fieldId: Constants.YIELD_FIELDS.INPUT_BF,
                        value: sourceData.consumedBF,
                        ignoreFieldChange: false
                    });
                }

                // Set item from source if not already set
                if (sourceData.item && !rec.getValue({ fieldId: Constants.YIELD_FIELDS.ITEM })) {
                    rec.setValue({
                        fieldId: Constants.YIELD_FIELDS.ITEM,
                        value: sourceData.item,
                        ignoreFieldChange: false
                    });
                }

                showInfoBanner('Source Loaded',
                    `Data loaded from source transaction. Input BF: ${sourceData.consumedBF || 'N/A'}`);
            }
        } catch (e) {
            console.error('Error loading source transaction:', e.message);
        }
    }

    /**
     * Gets source transaction data
     *
     * @param {string|number} sourceId - Source transaction ID
     * @returns {Object|null} Source transaction data
     */
    function getSourceTransactionData(sourceId) {
        try {
            const woLookup = search.lookupFields({
                type: search.Type.WORK_ORDER,
                id: sourceId,
                columns: [
                    Constants.BODY_FIELDS.TOTAL_BF,
                    Constants.BODY_FIELDS.CONSUMED_BF,
                    'assemblyitem',
                    'tranid'
                ]
            });

            return {
                tranId: woLookup.tranid,
                consumedBF: parseFloat(woLookup[Constants.BODY_FIELDS.CONSUMED_BF]) ||
                           parseFloat(woLookup[Constants.BODY_FIELDS.TOTAL_BF]) || 0,
                item: woLookup.assemblyitem?.[0]?.value || null
            };
        } catch (e) {
            console.error('Error looking up source transaction:', e.message);
            return null;
        }
    }

    /**
     * Validates waste breakdown totals
     *
     * @param {Record} rec - Current record
     */
    function validateWasteBreakdown(rec) {
        const totalWaste = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.WASTE_BF
        })) || 0;

        const sawdust = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.SAWDUST_BF
        })) || 0;

        const trim = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.TRIM_WASTE_BF
        })) || 0;

        const defect = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.DEFECT_WASTE_BF
        })) || 0;

        const other = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.OTHER_WASTE_BF
        })) || 0;

        const categorizedTotal = sawdust + trim + defect + other;

        if (categorizedTotal > totalWaste + 0.01) {
            showErrorBanner('Waste Breakdown Error',
                `Categorized waste (${categorizedTotal.toFixed(2)} BF) exceeds total waste (${totalWaste.toFixed(2)} BF).`);
        } else if (categorizedTotal > 0 && categorizedTotal < totalWaste - 0.01) {
            const uncategorized = totalWaste - categorizedTotal;
            showWarningBanner('Uncategorized Waste',
                `${uncategorized.toFixed(2)} BF of waste is not categorized.`);
        }
    }

    /**
     * Updates the variance display
     *
     * @param {Record} rec - Current record
     */
    function updateVarianceDisplay(rec) {
        const yieldPct = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
        })) || 0;

        const expectedYield = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD
        })) || 85;

        const variance = yieldPct - expectedYield;

        isCalculating = true;
        try {
            rec.setValue({
                fieldId: Constants.YIELD_FIELDS.YIELD_VARIANCE,
                value: variance,
                ignoreFieldChange: true
            });
        } finally {
            isCalculating = false;
        }
    }

    /**
     * Updates the yield display with calculated values
     *
     * @param {Record} rec - Current record
     */
    function updateYieldDisplay(rec) {
        const inputBF = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.INPUT_BF
        })) || 0;

        const outputBF = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.OUTPUT_BF
        })) || 0;

        const yieldPct = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
        })) || 0;

        const wasteBF = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.WASTE_BF
        })) || 0;

        // Log current values for debugging
        console.log(`Yield Metrics - Input: ${inputBF} BF, Output: ${outputBF} BF, Yield: ${yieldPct.toFixed(1)}%, Waste: ${wasteBF.toFixed(2)} BF`);
    }

    /**
     * validateField Entry Point
     * Validates individual fields
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.fieldId - Field being validated
     * @returns {boolean} True if valid
     */
    function validateField(context) {
        const rec = context.currentRecord;
        const fieldId = context.fieldId;

        switch (fieldId) {
            case Constants.YIELD_FIELDS.INPUT_BF:
                return validateInputBF(rec);

            case Constants.YIELD_FIELDS.OUTPUT_BF:
                return validateOutputBF(rec);

            case Constants.YIELD_FIELDS.EXPECTED_YIELD:
                return validateExpectedYield(rec);
        }

        return true;
    }

    /**
     * Validates Input BF field
     *
     * @param {Record} rec - Current record
     * @returns {boolean} True if valid
     */
    function validateInputBF(rec) {
        const inputBF = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.INPUT_BF
        })) || 0;

        if (inputBF < 0) {
            showErrorBanner('Invalid Input', 'Input BF cannot be negative.');
            return false;
        }

        if (inputBF === 0) {
            showWarningBanner('Zero Input', 'Input BF is zero. Yield calculations will not be meaningful.');
        }

        return true;
    }

    /**
     * Validates Output BF field
     *
     * @param {Record} rec - Current record
     * @returns {boolean} True if valid
     */
    function validateOutputBF(rec) {
        const inputBF = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.INPUT_BF
        })) || 0;

        const outputBF = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.OUTPUT_BF
        })) || 0;

        if (outputBF < 0) {
            showErrorBanner('Invalid Output', 'Output BF cannot be negative.');
            return false;
        }

        if (outputBF > inputBF) {
            dialog.alert({
                title: 'Output Exceeds Input',
                message: 'Output BF cannot exceed Input BF. Please verify your measurements.'
            });
            return false;
        }

        return true;
    }

    /**
     * Validates Expected Yield field
     *
     * @param {Record} rec - Current record
     * @returns {boolean} True if valid
     */
    function validateExpectedYield(rec) {
        const expectedYield = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD
        })) || 0;

        if (expectedYield < 0 || expectedYield > 100) {
            showErrorBanner('Invalid Expected Yield', 'Expected yield must be between 0% and 100%.');
            return false;
        }

        return true;
    }

    /**
     * saveRecord Entry Point
     * Validates the record before saving
     *
     * @param {Object} context - Script context
     * @param {Record} context.currentRecord - Current record
     * @returns {boolean} True to allow save
     */
    function saveRecord(context) {
        const rec = context.currentRecord;

        // Validate required fields
        const inputBF = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.INPUT_BF
        })) || 0;

        const outputBF = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.OUTPUT_BF
        })) || 0;

        if (inputBF <= 0) {
            dialog.alert({
                title: 'Missing Input BF',
                message: 'Input BF is required and must be greater than zero.'
            });
            return false;
        }

        if (outputBF < 0) {
            dialog.alert({
                title: 'Invalid Output BF',
                message: 'Output BF cannot be negative.'
            });
            return false;
        }

        if (outputBF > inputBF) {
            dialog.alert({
                title: 'Invalid Values',
                message: 'Output BF cannot exceed Input BF. Please verify your measurements.'
            });
            return false;
        }

        // Warn about significant variance
        const yieldPct = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.YIELD_PERCENTAGE
        })) || 0;

        const expectedYield = parseFloat(rec.getValue({
            fieldId: Constants.YIELD_FIELDS.EXPECTED_YIELD
        })) || 85;

        const variance = Math.abs(yieldPct - expectedYield);

        if (variance > VARIANCE_THRESHOLDS.CRITICAL) {
            // For critical variance, we don't block but the user has already been warned
            console.log(`Saving yield record with critical variance: ${variance.toFixed(1)}%`);
        }

        return true;
    }

    // ============ UI Helper Functions ============

    /**
     * Shows an info banner
     *
     * @param {string} title - Banner title
     * @param {string} msg - Banner message
     */
    function showInfoBanner(title, msg) {
        hideBanner();
        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.INFORMATION,
            duration: 5000
        });
        activeBanner.show();
    }

    /**
     * Shows a success banner
     *
     * @param {string} title - Banner title
     * @param {string} msg - Banner message
     */
    function showSuccessBanner(title, msg) {
        hideBanner();
        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.CONFIRMATION,
            duration: 5000
        });
        activeBanner.show();
    }

    /**
     * Shows a warning banner
     *
     * @param {string} title - Banner title
     * @param {string} msg - Banner message
     */
    function showWarningBanner(title, msg) {
        hideBanner();
        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.WARNING,
            duration: 7000
        });
        activeBanner.show();
    }

    /**
     * Shows an error banner
     *
     * @param {string} title - Banner title
     * @param {string} msg - Banner message
     */
    function showErrorBanner(title, msg) {
        hideBanner();
        activeBanner = message.create({
            title: title,
            message: msg,
            type: message.Type.ERROR,
            duration: 10000
        });
        activeBanner.show();
    }

    /**
     * Hides the active banner
     */
    function hideBanner() {
        if (activeBanner) {
            try {
                activeBanner.hide();
            } catch (e) {
                // Banner may already be hidden
            }
            activeBanner = null;
        }
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        validateField: validateField,
        saveRecord: saveRecord
    };
});
