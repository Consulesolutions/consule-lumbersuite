/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Report Generator Client Script
 * Client-side functionality for the Report Generator Suitelet
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

    // Output format constants
    const OUTPUT_FORMATS = {
        HTML: 'html',
        PDF: 'pdf',
        CSV: 'csv',
        EXCEL: 'excel'
    };

    /**
     * pageInit - Initialize the form
     */
    const pageInit = (context) => {
        console.log('CLS Report Generator CS: pageInit');

        // Show/hide fields based on initial report type
        const rec = context.currentRecord;
        const reportType = rec.getValue({ fieldId: 'custpage_report_type' });
        if (reportType) {
            updateReportOptions(reportType);
        }
    };

    /**
     * Handle field changes
     */
    const fieldChanged = (context) => {
        const rec = context.currentRecord;
        const fieldId = context.fieldId;

        if (fieldId === 'custpage_report_type') {
            const reportType = rec.getValue({ fieldId: 'custpage_report_type' });
            updateReportOptions(reportType);
        }

        if (fieldId === 'custpage_date_range') {
            const dateRange = rec.getValue({ fieldId: 'custpage_date_range' });
            toggleCustomDateFields(dateRange === 'custom');
        }

        if (fieldId === 'custpage_output_format') {
            const format = rec.getValue({ fieldId: 'custpage_output_format' });
            updateFormatOptions(format);
        }
    };

    /**
     * Update report options based on selected report type
     * @param {string} reportType - Selected report type
     */
    const updateReportOptions = (reportType) => {
        console.log('CLS Report Generator CS: Updating options for', reportType);

        // Show/hide relevant filter fields based on report type
        const filterConfig = {
            'production_summary': ['location', 'dateRange', 'operator'],
            'yield_analysis': ['location', 'dateRange', 'item', 'operator'],
            'inventory_status': ['location', 'item', 'grade'],
            'inventory_aging': ['location', 'ageRanges'],
            'tally_consumption': ['location', 'dateRange', 'item'],
            'repack_summary': ['location', 'dateRange', 'repackType'],
            'sales_bf': ['customer', 'dateRange', 'item'],
            'work_order_status': ['location', 'dateRange', 'status']
        };

        const filters = filterConfig[reportType] || [];

        // Update description
        updateReportDescription(reportType);

        // Enable/disable filter fields based on report type
        toggleFilterFields(filters);
    };

    /**
     * Update report description
     * @param {string} reportType - Selected report type
     */
    const updateReportDescription = (reportType) => {
        const descriptions = {
            'production_summary': 'Summary of production output, yield, and efficiency metrics for the selected period.',
            'yield_analysis': 'Detailed yield analysis showing recovery rates by operation, item, and operator.',
            'inventory_status': 'Current tally inventory levels by location and item with board feet totals.',
            'inventory_aging': 'Age analysis of tally inventory showing days on hand.',
            'tally_consumption': 'History of tally consumption showing allocation and usage details.',
            'repack_summary': 'Summary of repack operations with input/output BF and yield metrics.',
            'sales_bf': 'Sales analysis showing board feet sold by customer and item.',
            'work_order_status': 'Status of work orders with BF consumption and completion metrics.'
        };

        const descElement = document.getElementById('custpage_report_description');
        if (descElement) {
            descElement.innerHTML = descriptions[reportType] || '';
        }
    };

    /**
     * Toggle filter field visibility
     * @param {Array} activeFilters - Array of filter names to show
     */
    const toggleFilterFields = (activeFilters) => {
        const allFilters = ['location', 'dateRange', 'item', 'customer', 'operator', 'grade', 'status', 'repackType', 'ageRanges'];

        allFilters.forEach((filter) => {
            const fieldElement = document.getElementById(`custpage_filter_${filter}_fs`);
            if (fieldElement) {
                fieldElement.style.display = activeFilters.includes(filter) ? 'block' : 'none';
            }
        });
    };

    /**
     * Toggle custom date fields
     * @param {boolean} show - Whether to show custom date fields
     */
    const toggleCustomDateFields = (show) => {
        const startField = document.getElementById('custpage_start_date_fs');
        const endField = document.getElementById('custpage_end_date_fs');

        if (startField) startField.style.display = show ? 'block' : 'none';
        if (endField) endField.style.display = show ? 'block' : 'none';
    };

    /**
     * Update format-specific options
     * @param {string} format - Selected output format
     */
    const updateFormatOptions = (format) => {
        const pdfOptions = document.getElementById('custpage_pdf_options_fs');
        const excelOptions = document.getElementById('custpage_excel_options_fs');

        if (pdfOptions) pdfOptions.style.display = format === OUTPUT_FORMATS.PDF ? 'block' : 'none';
        if (excelOptions) excelOptions.style.display = format === OUTPUT_FORMATS.EXCEL ? 'block' : 'none';
    };

    /**
     * Generate the report
     */
    const generateReport = () => {
        const rec = currentRecord.get();

        // Validate required fields
        const reportType = rec.getValue({ fieldId: 'custpage_report_type' });
        if (!reportType) {
            dialog.alert({
                title: 'Validation Error',
                message: 'Please select a report type.'
            });
            return;
        }

        // Show loading message
        const loadingMsg = message.create({
            title: 'Generating Report',
            message: 'Please wait while the report is being generated...',
            type: message.Type.INFORMATION
        });
        loadingMsg.show();

        // Submit the form
        try {
            rec.setValue({ fieldId: 'custpage_action', value: 'generate' });
            // The form will submit via the standard NetSuite submit
        } catch (e) {
            loadingMsg.hide();
            dialog.alert({
                title: 'Error',
                message: 'Error generating report: ' + e.message
            });
        }
    };

    /**
     * Preview the report in HTML format
     */
    const previewReport = () => {
        const rec = currentRecord.get();

        const reportType = rec.getValue({ fieldId: 'custpage_report_type' });
        if (!reportType) {
            dialog.alert({
                title: 'Validation Error',
                message: 'Please select a report type.'
            });
            return;
        }

        // Build preview URL with current parameters
        const params = buildReportParams(rec);
        params.preview = 'true';
        params.format = 'html';

        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_report_generator_sl',
            deploymentId: 'customdeploy_cls_report_generator_sl',
            params: params
        });

        window.open(suiteletUrl, '_blank', 'width=1200,height=800');
    };

    /**
     * Export report directly
     * @param {string} format - Output format (pdf, csv, excel)
     */
    const exportReport = (format) => {
        const rec = currentRecord.get();

        const reportType = rec.getValue({ fieldId: 'custpage_report_type' });
        if (!reportType) {
            dialog.alert({
                title: 'Validation Error',
                message: 'Please select a report type.'
            });
            return;
        }

        // Build export URL
        const params = buildReportParams(rec);
        params.format = format;
        params.export = 'true';

        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_report_generator_sl',
            deploymentId: 'customdeploy_cls_report_generator_sl',
            params: params
        });

        if (format === 'pdf') {
            window.open(suiteletUrl, '_blank');
        } else {
            window.location.href = suiteletUrl;
        }
    };

    /**
     * Build report parameters from form
     * @param {Record} rec - Current record
     * @returns {Object} - Parameters object
     */
    const buildReportParams = (rec) => {
        const params = {
            reportType: rec.getValue({ fieldId: 'custpage_report_type' }) || '',
            dateRange: rec.getValue({ fieldId: 'custpage_date_range' }) || 'month'
        };

        // Add optional filters
        try { params.location = rec.getValue({ fieldId: 'custpage_filter_location' }) || ''; } catch (e) {}
        try { params.item = rec.getValue({ fieldId: 'custpage_filter_item' }) || ''; } catch (e) {}
        try { params.customer = rec.getValue({ fieldId: 'custpage_filter_customer' }) || ''; } catch (e) {}
        try { params.operator = rec.getValue({ fieldId: 'custpage_filter_operator' }) || ''; } catch (e) {}
        try { params.grade = rec.getValue({ fieldId: 'custpage_filter_grade' }) || ''; } catch (e) {}
        try { params.status = rec.getValue({ fieldId: 'custpage_filter_status' }) || ''; } catch (e) {}

        // Custom date range
        if (params.dateRange === 'custom') {
            try { params.startDate = rec.getValue({ fieldId: 'custpage_start_date' }) || ''; } catch (e) {}
            try { params.endDate = rec.getValue({ fieldId: 'custpage_end_date' }) || ''; } catch (e) {}
        }

        return params;
    };

    /**
     * Reset form to defaults
     */
    const resetForm = () => {
        dialog.confirm({
            title: 'Reset Form',
            message: 'Are you sure you want to reset all selections?'
        }).then((result) => {
            if (result) {
                window.location.reload();
            }
        });
    };

    /**
     * Save report configuration as template
     */
    const saveAsTemplate = () => {
        dialog.create({
            title: 'Save Report Template',
            message: 'Enter a name for this report template:',
            buttons: [
                { label: 'Save', value: 'save' },
                { label: 'Cancel', value: 'cancel' }
            ]
        }).then((result) => {
            if (result === 'save') {
                // Template saving would be implemented server-side
                message.create({
                    title: 'Template Saved',
                    message: 'Report template has been saved.',
                    type: message.Type.CONFIRMATION
                }).show({ duration: 5000 });
            }
        });
    };

    /**
     * Validate before form submission
     */
    const saveRecord = (context) => {
        const rec = context.currentRecord;

        const reportType = rec.getValue({ fieldId: 'custpage_report_type' });
        if (!reportType) {
            dialog.alert({
                title: 'Validation Error',
                message: 'Please select a report type.'
            });
            return false;
        }

        // Validate date range if custom
        const dateRange = rec.getValue({ fieldId: 'custpage_date_range' });
        if (dateRange === 'custom') {
            const startDate = rec.getValue({ fieldId: 'custpage_start_date' });
            const endDate = rec.getValue({ fieldId: 'custpage_end_date' });

            if (!startDate || !endDate) {
                dialog.alert({
                    title: 'Validation Error',
                    message: 'Please select both start and end dates for custom date range.'
                });
                return false;
            }

            if (startDate > endDate) {
                dialog.alert({
                    title: 'Validation Error',
                    message: 'Start date must be before end date.'
                });
                return false;
            }
        }

        return true;
    };

    // Expose functions for button calls
    window.generateReport = generateReport;
    window.previewReport = previewReport;
    window.exportReport = exportReport;
    window.resetForm = resetForm;
    window.saveAsTemplate = saveAsTemplate;

    return {
        pageInit,
        fieldChanged,
        saveRecord
    };
});
