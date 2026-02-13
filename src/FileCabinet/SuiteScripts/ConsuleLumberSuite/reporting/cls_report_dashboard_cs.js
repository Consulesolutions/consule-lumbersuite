/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Consule LumberSuite™ - Report Dashboard Client Script
 * Client-side functionality for the Report Dashboard Suitelet
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

    // Date range constants
    const DATE_RANGES = {
        TODAY: 'today',
        WEEK: 'week',
        MONTH: 'month',
        QUARTER: 'quarter',
        YEAR: 'year',
        CUSTOM: 'custom'
    };

    /**
     * pageInit - Initialize the dashboard
     */
    const pageInit = (context) => {
        console.log('CLS Report Dashboard CS: pageInit');

        // Initialize any charts or dynamic content
        initializeCharts();
    };

    /**
     * Initialize dashboard charts
     */
    const initializeCharts = () => {
        // Charts are typically rendered server-side or via inline HTML
        // This function can be used for any client-side chart updates
        console.log('CLS Report Dashboard CS: Initializing charts');
    };

    /**
     * Change date range and refresh dashboard
     * @param {string} range - Date range constant
     */
    const changeDateRange = (range) => {
        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_report_dashboard_sl',
            deploymentId: 'customdeploy_cls_report_dashboard_sl',
            params: { range: range }
        });
        window.location.href = suiteletUrl;
    };

    /**
     * Change dashboard section
     * @param {string} section - Section name
     */
    const changeSection = (section) => {
        const rec = currentRecord.get();
        const currentRange = rec.getValue({ fieldId: 'custpage_date_range' }) || 'month';

        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_report_dashboard_sl',
            deploymentId: 'customdeploy_cls_report_dashboard_sl',
            params: { section: section, range: currentRange }
        });
        window.location.href = suiteletUrl;
    };

    /**
     * Refresh dashboard data
     */
    const refreshDashboard = () => {
        showLoadingMessage('Refreshing dashboard...');
        window.location.reload();
    };

    /**
     * Export dashboard to PDF
     */
    const exportToPDF = () => {
        const rec = currentRecord.get();
        const section = rec.getValue({ fieldId: 'custpage_section' }) || 'overview';
        const range = rec.getValue({ fieldId: 'custpage_date_range' }) || 'month';

        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_report_dashboard_sl',
            deploymentId: 'customdeploy_cls_report_dashboard_sl',
            params: { section: section, range: range, export: 'pdf' }
        });
        window.open(suiteletUrl, '_blank');
    };

    /**
     * Export dashboard data to Excel
     */
    const exportToExcel = () => {
        const rec = currentRecord.get();
        const section = rec.getValue({ fieldId: 'custpage_section' }) || 'overview';
        const range = rec.getValue({ fieldId: 'custpage_date_range' }) || 'month';

        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_report_dashboard_sl',
            deploymentId: 'customdeploy_cls_report_dashboard_sl',
            params: { section: section, range: range, export: 'excel' }
        });
        window.location.href = suiteletUrl;
    };

    /**
     * Navigate to detailed report
     * @param {string} reportType - Type of report to view
     */
    const viewDetailedReport = (reportType) => {
        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_report_generator_sl',
            deploymentId: 'customdeploy_cls_report_generator_sl',
            params: { reportType: reportType }
        });
        window.open(suiteletUrl, '_blank');
    };

    /**
     * Apply custom date range
     */
    const applyCustomDateRange = () => {
        const rec = currentRecord.get();
        const startDate = rec.getValue({ fieldId: 'custpage_start_date' });
        const endDate = rec.getValue({ fieldId: 'custpage_end_date' });

        if (!startDate || !endDate) {
            dialog.alert({
                title: 'Validation Error',
                message: 'Please select both start and end dates.'
            });
            return;
        }

        if (startDate > endDate) {
            dialog.alert({
                title: 'Validation Error',
                message: 'Start date must be before end date.'
            });
            return;
        }

        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cls_report_dashboard_sl',
            deploymentId: 'customdeploy_cls_report_dashboard_sl',
            params: {
                range: 'custom',
                startDate: startDate,
                endDate: endDate
            }
        });
        window.location.href = suiteletUrl;
    };

    /**
     * Show loading message
     * @param {string} msg - Message to display
     */
    const showLoadingMessage = (msg) => {
        try {
            message.create({
                title: 'Loading',
                message: msg || 'Please wait...',
                type: message.Type.INFORMATION
            }).show();
        } catch (e) {
            // Silent fail
        }
    };

    /**
     * Handle field changes
     */
    const fieldChanged = (context) => {
        const fieldId = context.fieldId;

        if (fieldId === 'custpage_date_range') {
            const rec = context.currentRecord;
            const range = rec.getValue({ fieldId: 'custpage_date_range' });

            if (range === DATE_RANGES.CUSTOM) {
                // Show custom date fields
                showCustomDateFields(true);
            } else {
                showCustomDateFields(false);
                changeDateRange(range);
            }
        }
    };

    /**
     * Show/hide custom date fields
     * @param {boolean} show - Whether to show the fields
     */
    const showCustomDateFields = (show) => {
        const startDateField = document.getElementById('custpage_start_date_fs');
        const endDateField = document.getElementById('custpage_end_date_fs');
        const applyBtn = document.getElementById('custpage_apply_dates');

        if (startDateField) startDateField.style.display = show ? 'block' : 'none';
        if (endDateField) endDateField.style.display = show ? 'block' : 'none';
        if (applyBtn) applyBtn.style.display = show ? 'inline-block' : 'none';
    };

    /**
     * Drill down to specific data
     * @param {string} dataType - Type of data to drill into
     * @param {string} value - Value to filter by
     */
    const drillDown = (dataType, value) => {
        console.log('CLS Report Dashboard CS: Drilling down to', dataType, value);

        // Navigate to appropriate detail view
        let reportType = '';
        switch (dataType) {
            case 'production':
                reportType = 'production_summary';
                break;
            case 'yield':
                reportType = 'yield_analysis';
                break;
            case 'inventory':
                reportType = 'inventory_status';
                break;
            case 'sales':
                reportType = 'sales_bf';
                break;
            default:
                reportType = dataType;
        }

        viewDetailedReport(reportType);
    };

    // Expose functions for button calls
    window.changeDateRange = changeDateRange;
    window.changeSection = changeSection;
    window.refreshDashboard = refreshDashboard;
    window.exportToPDF = exportToPDF;
    window.exportToExcel = exportToExcel;
    window.viewDetailedReport = viewDetailedReport;
    window.applyCustomDateRange = applyCustomDateRange;
    window.drillDown = drillDown;

    return {
        pageInit,
        fieldChanged
    };
});
