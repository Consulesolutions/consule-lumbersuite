/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Repack Wizard Client Script
 * Client-side functionality for the Repack Wizard Suitelet
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    'N/currentRecord',
    'N/url',
    'N/https',
    'N/ui/dialog',
    'N/ui/message'
], (
    currentRecord,
    url,
    https,
    dialog,
    message
) => {

    /**
     * pageInit - Initialize the form
     */
    const pageInit = (context) => {
        console.log('CLS Repack Wizard CS: pageInit');
    };

    /**
     * Navigate to create new repack order
     */
    const navigateToCreate = () => {
        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_repack_wizard_sl',
            deploymentId: 'customdeploy_cls_repack_wizard_sl',
            params: { mode: 'create' }
        });
        window.location.href = suiteletUrl;
    };

    /**
     * Refresh the current page
     */
    const refreshPage = () => {
        window.location.reload();
    };

    /**
     * Navigate to complete a repack order
     * @param {string} repackId - Repack order internal ID
     */
    const completeRepack = (repackId) => {
        if (!repackId) {
            dialog.alert({ title: 'Error', message: 'No repack order ID provided.' });
            return;
        }

        dialog.confirm({
            title: 'Complete Repack Order',
            message: 'Are you ready to complete this repack order? This will finalize all output tallies.'
        }).then((result) => {
            if (result) {
                const suiteletUrl = url.resolveScript({
                    scriptId: 'customscript_cls_repack_wizard_sl',
                    deploymentId: 'customdeploy_cls_repack_wizard_sl',
                    params: { mode: 'complete', repackId: repackId }
                });
                window.location.href = suiteletUrl;
            }
        });
    };

    /**
     * View repack order details
     * @param {string} repackId - Repack order internal ID
     */
    const viewRepack = (repackId) => {
        if (!repackId) return;

        const recordUrl = url.resolveRecord({
            recordType: 'customrecord_cls_repack_order',
            recordId: repackId
        });
        window.open(recordUrl, '_blank');
    };

    /**
     * Print repack order ticket
     * @param {string} repackId - Repack order internal ID
     */
    const printRepack = (repackId) => {
        if (!repackId) return;

        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_repack_wizard_sl',
            deploymentId: 'customdeploy_cls_repack_wizard_sl',
            params: { mode: 'print', repackId: repackId }
        });
        window.open(suiteletUrl, '_blank');
    };

    /**
     * Handle repack type selection change
     */
    const fieldChanged = (context) => {
        const rec = context.currentRecord;
        const fieldId = context.fieldId;

        if (fieldId === 'custpage_repack_type') {
            const repackType = rec.getValue({ fieldId: 'custpage_repack_type' });
            updateTypeDescription(repackType);
        }

        if (fieldId === 'custpage_source_tally') {
            const tallyId = rec.getValue({ fieldId: 'custpage_source_tally' });
            if (tallyId) {
                loadTallyDetails(tallyId, rec);
            }
        }
    };

    /**
     * Update type description based on selection
     */
    const updateTypeDescription = (repackType) => {
        const descriptions = {
            'bundle_repack': 'Create new bundles from existing lumber with different configurations.',
            'board_resaw': 'Resaw boards to different dimensions.',
            'bundle_split': 'Split a bundle into multiple smaller bundles.',
            'board_trim': 'Trim boards to a specific length.',
            'grade_sort': 'Sort lumber by grade into separate tallies.'
        };

        const descField = document.getElementById('custpage_type_description');
        if (descField) {
            descField.innerHTML = descriptions[repackType] || '';
        }
    };

    /**
     * Load tally details when source tally is selected
     */
    const loadTallyDetails = (tallyId, rec) => {
        // This would typically make an API call to get tally details
        // For now, just log the selection
        console.log('CLS Repack Wizard CS: Loading tally details for', tallyId);
    };

    /**
     * Calculate output BF based on inputs
     */
    const calculateOutputBF = () => {
        const rec = currentRecord.get();

        const inputBF = parseFloat(rec.getValue({ fieldId: 'custpage_input_bf' })) || 0;
        const yieldPct = parseFloat(rec.getValue({ fieldId: 'custpage_expected_yield' })) || 85;

        const outputBF = (inputBF * yieldPct) / 100;

        try {
            rec.setValue({
                fieldId: 'custpage_expected_output_bf',
                value: outputBF.toFixed(4),
                ignoreFieldChange: true
            });
        } catch (e) {
            console.error('Error setting output BF:', e);
        }
    };

    /**
     * Validate before save/submit
     */
    const saveRecord = (context) => {
        const rec = context.currentRecord;

        // Check required fields based on current mode
        const repackType = rec.getValue({ fieldId: 'custpage_repack_type' });
        const sourceTally = rec.getValue({ fieldId: 'custpage_source_tally' });

        if (!repackType) {
            dialog.alert({ title: 'Validation Error', message: 'Please select a repack type.' });
            return false;
        }

        if (!sourceTally) {
            dialog.alert({ title: 'Validation Error', message: 'Please select a source tally.' });
            return false;
        }

        return true;
    };

    /**
     * Add output line to sublist
     */
    const addOutputLine = () => {
        const rec = currentRecord.get();

        try {
            rec.selectNewLine({ sublistId: 'custpage_output_lines' });

            message.create({
                title: 'Line Added',
                message: 'New output line added. Enter the output tally details.',
                type: message.Type.INFORMATION
            }).show({ duration: 3000 });
        } catch (e) {
            console.error('Error adding output line:', e);
        }
    };

    /**
     * Remove output line from sublist
     * @param {number} lineNum - Line number to remove
     */
    const removeOutputLine = (lineNum) => {
        const rec = currentRecord.get();

        dialog.confirm({
            title: 'Remove Line',
            message: 'Are you sure you want to remove this output line?'
        }).then((result) => {
            if (result) {
                try {
                    rec.removeLine({ sublistId: 'custpage_output_lines', line: lineNum });
                } catch (e) {
                    console.error('Error removing output line:', e);
                }
            }
        });
    };

    // Expose functions for button calls
    window.navigateToCreate = navigateToCreate;
    window.refreshPage = refreshPage;
    window.completeRepack = completeRepack;
    window.viewRepack = viewRepack;
    window.printRepack = printRepack;
    window.calculateOutputBF = calculateOutputBF;
    window.addOutputLine = addOutputLine;
    window.removeOutputLine = removeOutputLine;

    return {
        pageInit,
        fieldChanged,
        saveRecord
    };
});
