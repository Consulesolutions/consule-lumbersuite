/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @file cls_tally_allocation_cs.js
 * @description Tally Allocation Client Script for Consule LumberSuite™
 *              Client-side functionality for the Tally Allocation Suitelet
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module tally/cls_tally_allocation_cs
 */

define([
    'N/currentRecord',
    'N/url',
    'N/https',
    'N/ui/dialog'
], function(
    currentRecord,
    url,
    https,
    dialog
) {
    'use strict';

    /**
     * pageInit Entry Point
     *
     * @param {Object} context - Script context
     */
    function pageInit(context) {
        console.log('LumberSuite™ Tally Allocation Client Script initialized');
        checkForMessages();
    }

    /**
     * Checks URL for status messages
     */
    function checkForMessages() {
        const urlParams = new URLSearchParams(window.location.search);
        const msg = urlParams.get('msg');
        const error = urlParams.get('error');

        if (msg === 'success') {
            dialog.alert({
                title: 'Success',
                message: 'Allocation completed successfully.'
            });
        } else if (msg === 'error' && error) {
            dialog.alert({
                title: 'Error',
                message: `Allocation failed: ${decodeURIComponent(error)}`
            });
        }
    }

    /**
     * fieldChanged Entry Point
     *
     * @param {Object} context - Script context
     */
    function fieldChanged(context) {
        const fieldId = context.fieldId;

        if (fieldId === 'custpage_quantity') {
            calculateAllocationBF();
        }
    }

    /**
     * Calculates BF for allocation based on quantity
     */
    function calculateAllocationBF() {
        // This would calculate BF based on piece count and BF per piece
        // For now, just log
        console.log('Calculating allocation BF...');
    }

    /**
     * Toggles select all checkboxes
     */
    function toggleSelectAll() {
        const selectAll = document.getElementById('selectAll');
        const checkboxes = document.querySelectorAll('.tallyCheckbox');

        checkboxes.forEach(function(checkbox) {
            checkbox.checked = selectAll.checked;
        });
    }

    /**
     * Previews FIFO allocation
     */
    function previewFIFO() {
        const rec = currentRecord.get();

        const itemId = rec.getValue({ fieldId: 'custpage_fifo_item' });
        const locationId = rec.getValue({ fieldId: 'custpage_fifo_location' });
        const requiredBF = parseFloat(rec.getValue({ fieldId: 'custpage_fifo_bf' })) || 0;

        if (!itemId || !locationId || requiredBF <= 0) {
            dialog.alert({
                title: 'Missing Information',
                message: 'Please fill in Item, Location, and Required BF to preview allocation.'
            });
            return;
        }

        dialog.alert({
            title: 'FIFO Preview',
            message: `Preview functionality will show which tallies would be used to fulfill ${requiredBF} BF for the selected item and location.`
        });
    }

    /**
     * Gets selected tally IDs
     *
     * @returns {Array} Selected tally IDs
     */
    function getSelectedTallies() {
        const selected = [];
        const checkboxes = document.querySelectorAll('.tallyCheckbox:checked');

        checkboxes.forEach(function(checkbox) {
            selected.push(checkbox.value);
        });

        return selected;
    }

    /**
     * Allocates selected tallies
     */
    function allocateSelected() {
        const selected = getSelectedTallies();

        if (selected.length === 0) {
            dialog.alert({
                title: 'No Selection',
                message: 'Please select at least one tally to allocate.'
            });
            return;
        }

        dialog.confirm({
            title: 'Confirm Allocation',
            message: `Allocate ${selected.length} selected tallies?`
        }).then(function(result) {
            if (result) {
                console.log('Allocating tallies:', selected);
                // Would submit allocation request
            }
        });
    }

    /**
     * Exports tally data to CSV
     */
    function exportToCsv() {
        dialog.alert({
            title: 'Export',
            message: 'Export functionality will generate a CSV file of the current tally list.'
        });
    }

    /**
     * Refreshes the search results
     */
    function refreshResults() {
        const form = document.getElementById('main_form');
        if (form) {
            form.submit();
        }
    }

    // Expose functions globally
    window.toggleSelectAll = toggleSelectAll;
    window.previewFIFO = previewFIFO;
    window.getSelectedTallies = getSelectedTallies;
    window.allocateSelected = allocateSelected;
    window.exportToCsv = exportToCsv;
    window.refreshResults = refreshResults;

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged
    };
});
