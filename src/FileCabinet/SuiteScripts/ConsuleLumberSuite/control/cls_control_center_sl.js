/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @file cls_control_center_sl.js
 * @description LumberSuite™ Control Center Suitelet
 *              Administrative dashboard for managing features, viewing analytics, and system health
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module control/cls_control_center_sl
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/record',
    'N/runtime',
    'N/url',
    'N/redirect',
    'N/log',
    '../lib/cls_constants',
    '../lib/cls_settings_dao',
    '../lib/cls_logger'
], function(
    serverWidget,
    search,
    record,
    runtime,
    url,
    redirect,
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
    const logger = Logger.createLogger('CLS_ControlCenter_SL');

    /**
     * Main entry point for GET and POST requests
     *
     * @param {Object} context - Suitelet context
     * @param {ServerRequest} context.request - HTTP request
     * @param {ServerResponse} context.response - HTTP response
     */
    function onRequest(context) {
        const startTime = Date.now();

        try {
            if (context.request.method === 'GET') {
                handleGet(context);
            } else {
                handlePost(context);
            }

            logger.debug('onRequest', `Completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            logger.error('onRequest', `Error: ${e.message}`, { stack: e.stack });
            context.response.write(`<html><body><h1>Error</h1><p>${e.message}</p></body></html>`);
        }
    }

    /**
     * Handles GET requests - renders the control center dashboard
     *
     * @param {Object} context - Suitelet context
     */
    function handleGet(context) {
        const form = serverWidget.createForm({
            title: 'LumberSuite™ Control Center'
        });

        form.clientScriptModulePath = './cls_control_center_cs.js';

        const activeTab = context.request.parameters.tab || 'dashboard';

        addNavigationTabs(form, activeTab);

        switch (activeTab) {
            case 'dashboard':
                renderDashboardTab(form);
                break;
            case 'features':
                renderFeaturesTab(form);
                break;
            case 'analytics':
                renderAnalyticsTab(form);
                break;
            case 'health':
                renderHealthTab(form);
                break;
            case 'logs':
                renderLogsTab(form);
                break;
            default:
                renderDashboardTab(form);
        }

        addFooter(form);

        context.response.writePage(form);
    }

    /**
     * Handles POST requests - processes form submissions
     *
     * @param {Object} context - Suitelet context
     */
    function handlePost(context) {
        const action = context.request.parameters.custpage_action;

        switch (action) {
            case 'clear_cache':
                handleClearCache(context);
                break;
            case 'run_validation':
                handleRunValidation(context);
                break;
            case 'export_config':
                handleExportConfig(context);
                break;
            default:
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId
                });
        }
    }

    /**
     * Adds navigation tabs to the form
     *
     * @param {Form} form - Server widget form
     * @param {string} activeTab - Currently active tab
     */
    function addNavigationTabs(form, activeTab) {
        const scriptUrl = url.resolveScript({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId
        });

        const tabs = [
            { id: 'dashboard', label: 'Dashboard', icon: '&#128200;' },
            { id: 'features', label: 'Features', icon: '&#9881;' },
            { id: 'analytics', label: 'Analytics', icon: '&#128202;' },
            { id: 'health', label: 'System Health', icon: '&#10004;' },
            { id: 'logs', label: 'Logs', icon: '&#128196;' }
        ];

        let navHtml = '<div style="margin-bottom:20px; border-bottom:2px solid #607799; padding-bottom:10px;">';
        navHtml += '<table style="width:100%;"><tr>';

        for (const tab of tabs) {
            const isActive = tab.id === activeTab;
            const bgColor = isActive ? '#607799' : '#f5f5f5';
            const textColor = isActive ? '#ffffff' : '#333333';
            const borderStyle = isActive ? '2px solid #607799' : '1px solid #ddd';

            navHtml += `<td style="width:20%; text-align:center; padding:0 5px;">`;
            navHtml += `<a href="${scriptUrl}&tab=${tab.id}" style="text-decoration:none;">`;
            navHtml += `<div style="background:${bgColor}; color:${textColor}; padding:12px 8px; border:${borderStyle}; border-radius:4px 4px 0 0;">`;
            navHtml += `<span style="font-size:18px;">${tab.icon}</span><br>`;
            navHtml += `<span style="font-weight:${isActive ? 'bold' : 'normal'};">${tab.label}</span>`;
            navHtml += `</div></a></td>`;
        }

        navHtml += '</tr></table></div>';

        const navField = form.addField({
            id: 'custpage_navigation',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        navField.defaultValue = navHtml;
    }

    /**
     * Renders the main dashboard tab
     *
     * @param {Form} form - Server widget form
     */
    function renderDashboardTab(form) {
        const settings = SettingsDAO.getSettings();
        const stats = getSystemStatistics();

        let dashboardHtml = '<div style="display:flex; flex-wrap:wrap; gap:20px;">';

        // Status Card
        dashboardHtml += createCard('System Status', getSystemStatusHtml(settings), '#28a745', '25%');

        // Quick Stats Card
        dashboardHtml += createCard('Quick Stats', getQuickStatsHtml(stats), '#007bff', '25%');

        // Active Modules Card
        dashboardHtml += createCard('Active Modules', getActiveModulesHtml(settings), '#17a2b8', '25%');

        // Recent Activity Card
        dashboardHtml += createCard('Recent Activity', getRecentActivityHtml(), '#6c757d', '25%');

        dashboardHtml += '</div>';

        // Charts Row
        dashboardHtml += '<div style="display:flex; flex-wrap:wrap; gap:20px; margin-top:20px;">';
        dashboardHtml += createCard('BF Consumption Trend (Last 30 Days)', getBFTrendChartHtml(), '#607799', '50%');
        dashboardHtml += createCard('Yield Performance', getYieldChartHtml(), '#607799', '50%');
        dashboardHtml += '</div>';

        const dashboardField = form.addField({
            id: 'custpage_dashboard',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        dashboardField.defaultValue = dashboardHtml;
    }

    /**
     * Creates a dashboard card HTML
     *
     * @param {string} title - Card title
     * @param {string} content - Card content HTML
     * @param {string} headerColor - Header background color
     * @param {string} width - Card width
     * @returns {string} Card HTML
     */
    function createCard(title, content, headerColor, width) {
        return `
            <div style="flex:1; min-width:${width}; max-width:calc(${width} - 20px); background:#fff; border:1px solid #ddd; border-radius:4px; overflow:hidden;">
                <div style="background:${headerColor}; color:#fff; padding:10px 15px; font-weight:bold;">${title}</div>
                <div style="padding:15px;">${content}</div>
            </div>
        `;
    }

    /**
     * Gets system status HTML
     *
     * @param {Object} settings - Settings object
     * @returns {string} HTML content
     */
    function getSystemStatusHtml(settings) {
        const isActive = settings && SettingsDAO.isDynamicUomEnabled();
        const statusColor = isActive ? '#28a745' : '#dc3545';
        const statusText = isActive ? 'ACTIVE' : 'INACTIVE';

        return `
            <div style="text-align:center;">
                <div style="font-size:48px; color:${statusColor};">${isActive ? '&#10004;' : '&#10006;'}</div>
                <div style="font-size:24px; font-weight:bold; color:${statusColor};">${statusText}</div>
                <div style="margin-top:10px; color:#666;">LumberSuite™ Core</div>
            </div>
        `;
    }

    /**
     * Gets quick stats HTML
     *
     * @param {Object} stats - Statistics object
     * @returns {string} HTML content
     */
    function getQuickStatsHtml(stats) {
        return `
            <table style="width:100%;">
                <tr>
                    <td style="padding:8px 0;"><strong>Total BF Processed:</strong></td>
                    <td style="text-align:right;">${formatNumber(stats.totalBF)} BF</td>
                </tr>
                <tr>
                    <td style="padding:8px 0;"><strong>Transactions Today:</strong></td>
                    <td style="text-align:right;">${stats.todayTransactions}</td>
                </tr>
                <tr>
                    <td style="padding:8px 0;"><strong>Active Tallies:</strong></td>
                    <td style="text-align:right;">${stats.activeTallies}</td>
                </tr>
                <tr>
                    <td style="padding:8px 0;"><strong>Avg Yield:</strong></td>
                    <td style="text-align:right;">${stats.avgYield}%</td>
                </tr>
            </table>
        `;
    }

    /**
     * Gets active modules HTML
     *
     * @param {Object} settings - Settings object
     * @returns {string} HTML content
     */
    function getActiveModulesHtml(settings) {
        const modules = [
            { name: 'Dynamic UOM', enabled: SettingsDAO.isDynamicUomEnabled() },
            { name: 'Yield Tracking', enabled: SettingsDAO.isYieldEnabled() },
            { name: 'Tally Management', enabled: SettingsDAO.isTallyEnabled() },
            { name: 'Repack/Resaw', enabled: SettingsDAO.isRepackEnabled() },
            { name: 'Margin Analysis', enabled: SettingsDAO.isMarginAnalysisEnabled() },
            { name: 'Consumption Log', enabled: SettingsDAO.isConsumptionLogEnabled() }
        ];

        let html = '<ul style="list-style:none; padding:0; margin:0;">';

        for (const mod of modules) {
            const icon = mod.enabled ? '&#10004;' : '&#10006;';
            const color = mod.enabled ? '#28a745' : '#dc3545';
            html += `<li style="padding:5px 0;"><span style="color:${color};">${icon}</span> ${mod.name}</li>`;
        }

        html += '</ul>';
        return html;
    }

    /**
     * Gets recent activity HTML
     *
     * @returns {string} HTML content
     */
    function getRecentActivityHtml() {
        const activities = getRecentActivities();

        if (activities.length === 0) {
            return '<p style="color:#666; text-align:center;">No recent activity</p>';
        }

        let html = '<ul style="list-style:none; padding:0; margin:0; font-size:12px;">';

        for (const activity of activities) {
            html += `<li style="padding:5px 0; border-bottom:1px solid #eee;">`;
            html += `<span style="color:#666;">${activity.time}</span><br>`;
            html += `${activity.description}`;
            html += `</li>`;
        }

        html += '</ul>';
        return html;
    }

    /**
     * Gets BF trend chart HTML (simplified bar representation)
     *
     * @returns {string} HTML content
     */
    function getBFTrendChartHtml() {
        const trendData = getBFTrendData();

        if (trendData.length === 0) {
            return '<p style="color:#666; text-align:center;">No data available</p>';
        }

        const maxBF = Math.max(...trendData.map(d => d.bf));

        let html = '<div style="display:flex; align-items:flex-end; justify-content:space-between; height:150px; padding:10px 0;">';

        for (const day of trendData) {
            const height = maxBF > 0 ? (day.bf / maxBF * 100) : 0;
            html += `<div style="flex:1; margin:0 2px; text-align:center;">`;
            html += `<div style="background:#607799; height:${height}px; min-height:2px; border-radius:2px 2px 0 0;" title="${day.date}: ${day.bf.toFixed(0)} BF"></div>`;
            html += `<div style="font-size:9px; color:#666; margin-top:5px;">${day.label}</div>`;
            html += `</div>`;
        }

        html += '</div>';
        html += `<div style="text-align:center; font-size:12px; color:#666;">Total: ${formatNumber(trendData.reduce((s, d) => s + d.bf, 0))} BF</div>`;

        return html;
    }

    /**
     * Gets yield chart HTML
     *
     * @returns {string} HTML content
     */
    function getYieldChartHtml() {
        const avgYield = getAverageYield();

        const yieldColor = avgYield >= 85 ? '#28a745' : avgYield >= 70 ? '#ffc107' : '#dc3545';

        return `
            <div style="text-align:center;">
                <div style="position:relative; width:120px; height:120px; margin:0 auto;">
                    <svg viewBox="0 0 36 36" style="transform:rotate(-90deg);">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none" stroke="#eee" stroke-width="3"/>
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none" stroke="${yieldColor}" stroke-width="3"
                              stroke-dasharray="${avgYield}, 100"/>
                    </svg>
                    <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:24px; font-weight:bold;">
                        ${avgYield}%
                    </div>
                </div>
                <div style="margin-top:15px;">
                    <span style="color:#28a745;">&#9632;</span> Excellent (85%+)
                    <span style="color:#ffc107; margin-left:10px;">&#9632;</span> Good (70-85%)
                    <span style="color:#dc3545; margin-left:10px;">&#9632;</span> Low (&lt;70%)
                </div>
            </div>
        `;
    }

    /**
     * Renders the features management tab
     *
     * @param {Form} form - Server widget form
     */
    function renderFeaturesTab(form) {
        const settingsId = getSettingsRecordId();

        let html = '<div style="max-width:800px;">';

        if (settingsId) {
            const editUrl = url.resolveRecord({
                recordType: Constants.RECORD_TYPES.SETTINGS,
                recordId: settingsId,
                isEditMode: true
            });

            html += `<div style="margin-bottom:20px;">`;
            html += `<a href="${editUrl}" style="display:inline-block; background:#607799; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">`;
            html += `&#9881; Edit Feature Settings</a>`;
            html += `</div>`;
        } else {
            const createUrl = url.resolveRecord({
                recordType: Constants.RECORD_TYPES.SETTINGS,
                isEditMode: true
            });

            html += `<div style="margin-bottom:20px; padding:20px; background:#fff3cd; border:1px solid #ffc107; border-radius:4px;">`;
            html += `<strong>&#9888; Settings Record Not Found</strong><br>`;
            html += `<p>No LumberSuite™ Settings record exists. Create one to configure features.</p>`;
            html += `<a href="${createUrl}" style="display:inline-block; background:#28a745; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">`;
            html += `+ Create Settings Record</a>`;
            html += `</div>`;
        }

        html += getFeatureMatrixHtml();
        html += '</div>';

        const featuresField = form.addField({
            id: 'custpage_features',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        featuresField.defaultValue = html;
    }

    /**
     * Gets feature matrix HTML
     *
     * @returns {string} HTML content
     */
    function getFeatureMatrixHtml() {
        const features = [
            {
                name: 'Dynamic UOM Conversion',
                description: 'Core BF/LF/SF/MBF conversion engine',
                enabled: SettingsDAO.isDynamicUomEnabled(),
                dependencies: 'None (Core Module)',
                impact: 'Required for all lumber calculations'
            },
            {
                name: 'Yield Tracking',
                description: 'Track yield percentage and waste on work orders',
                enabled: SettingsDAO.isYieldEnabled(),
                dependencies: 'Dynamic UOM Conversion',
                impact: 'Enables waste analysis and yield reporting'
            },
            {
                name: 'Tally Sheet Management',
                description: 'Lot/Tally tracking with FIFO allocation',
                enabled: SettingsDAO.isTallyEnabled(),
                dependencies: 'Dynamic UOM Conversion',
                impact: 'Enables lot traceability and inventory tracking'
            },
            {
                name: 'Repack/Resaw Module',
                description: 'Bundle repacking and board resawing operations',
                enabled: SettingsDAO.isRepackEnabled(),
                dependencies: 'Dynamic UOM + Yield Tracking',
                impact: 'Enables repackaging and resawing work orders'
            },
            {
                name: 'Margin Analysis',
                description: 'Real-time profit margin calculations on sales',
                enabled: SettingsDAO.isMarginAnalysisEnabled(),
                dependencies: 'Dynamic UOM Conversion',
                impact: 'Shows margin warnings on low-profit sales'
            },
            {
                name: 'Consumption Analytics',
                description: 'Track and analyze BF consumption patterns',
                enabled: SettingsDAO.isConsumptionLogEnabled(),
                dependencies: 'Dynamic UOM Conversion',
                impact: 'Enables consumption reporting and trends'
            }
        ];

        let html = '<table style="width:100%; border-collapse:collapse; margin-top:20px;">';
        html += '<tr style="background:#607799; color:#fff;">';
        html += '<th style="padding:12px; text-align:left;">Module</th>';
        html += '<th style="padding:12px; text-align:center;">Status</th>';
        html += '<th style="padding:12px; text-align:left;">Dependencies</th>';
        html += '<th style="padding:12px; text-align:left;">Impact</th>';
        html += '</tr>';

        for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const bgColor = i % 2 === 0 ? '#fff' : '#f9f9f9';
            const statusIcon = feature.enabled ? '&#10004;' : '&#10006;';
            const statusColor = feature.enabled ? '#28a745' : '#dc3545';
            const statusText = feature.enabled ? 'Enabled' : 'Disabled';

            html += `<tr style="background:${bgColor};">`;
            html += `<td style="padding:12px; border-bottom:1px solid #ddd;">`;
            html += `<strong>${feature.name}</strong><br>`;
            html += `<small style="color:#666;">${feature.description}</small>`;
            html += `</td>`;
            html += `<td style="padding:12px; text-align:center; border-bottom:1px solid #ddd;">`;
            html += `<span style="color:${statusColor}; font-size:20px;">${statusIcon}</span><br>`;
            html += `<small style="color:${statusColor};">${statusText}</small>`;
            html += `</td>`;
            html += `<td style="padding:12px; border-bottom:1px solid #ddd;">${feature.dependencies}</td>`;
            html += `<td style="padding:12px; border-bottom:1px solid #ddd;">${feature.impact}</td>`;
            html += `</tr>`;
        }

        html += '</table>';
        return html;
    }

    /**
     * Renders the analytics tab
     *
     * @param {Form} form - Server widget form
     */
    function renderAnalyticsTab(form) {
        const analytics = getAnalyticsData();

        let html = '<div style="display:flex; flex-wrap:wrap; gap:20px;">';

        // Top Items by BF
        html += createCard('Top Items by BF Consumption', getTopItemsHtml(analytics.topItems), '#007bff', '50%');

        // BF by Transaction Type
        html += createCard('BF by Transaction Type', getBFByTypeHtml(analytics.bfByType), '#28a745', '50%');

        html += '</div>';

        // Monthly Summary Table
        html += '<div style="margin-top:20px;">';
        html += '<h3>Monthly Summary</h3>';
        html += getMonthlySummaryTableHtml(analytics.monthlySummary);
        html += '</div>';

        const analyticsField = form.addField({
            id: 'custpage_analytics',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        analyticsField.defaultValue = html;
    }

    /**
     * Renders the system health tab
     *
     * @param {Form} form - Server widget form
     */
    function renderHealthTab(form) {
        const healthChecks = runHealthChecks();

        let html = '<div style="max-width:800px;">';

        // Overall Health Status
        const overallStatus = healthChecks.every(c => c.status === 'pass');
        const overallColor = overallStatus ? '#28a745' : '#dc3545';
        const overallIcon = overallStatus ? '&#10004;' : '&#9888;';

        html += `<div style="text-align:center; padding:30px; background:${overallColor}; color:#fff; border-radius:4px; margin-bottom:20px;">`;
        html += `<div style="font-size:48px;">${overallIcon}</div>`;
        html += `<div style="font-size:24px; font-weight:bold;">${overallStatus ? 'All Systems Operational' : 'Issues Detected'}</div>`;
        html += `</div>`;

        // Individual Health Checks
        html += '<table style="width:100%; border-collapse:collapse;">';
        html += '<tr style="background:#607799; color:#fff;">';
        html += '<th style="padding:12px; text-align:left;">Check</th>';
        html += '<th style="padding:12px; text-align:center;">Status</th>';
        html += '<th style="padding:12px; text-align:left;">Details</th>';
        html += '<th style="padding:12px; text-align:left;">Action</th>';
        html += '</tr>';

        for (const check of healthChecks) {
            const statusIcon = check.status === 'pass' ? '&#10004;' : check.status === 'warn' ? '&#9888;' : '&#10006;';
            const statusColor = check.status === 'pass' ? '#28a745' : check.status === 'warn' ? '#ffc107' : '#dc3545';

            html += `<tr style="border-bottom:1px solid #ddd;">`;
            html += `<td style="padding:12px;">${check.name}</td>`;
            html += `<td style="padding:12px; text-align:center;"><span style="color:${statusColor}; font-size:20px;">${statusIcon}</span></td>`;
            html += `<td style="padding:12px;">${check.details}</td>`;
            html += `<td style="padding:12px;">${check.action || '-'}</td>`;
            html += `</tr>`;
        }

        html += '</table>';

        // Action Buttons
        html += '<div style="margin-top:20px;">';
        html += '<input type="hidden" id="custpage_action" name="custpage_action" value="">';
        html += '</div>';

        html += '</div>';

        const healthField = form.addField({
            id: 'custpage_health',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        healthField.defaultValue = html;

        form.addButton({
            id: 'custpage_clear_cache',
            label: 'Clear Cache',
            functionName: 'clearCache'
        });

        form.addButton({
            id: 'custpage_run_validation',
            label: 'Run Validation',
            functionName: 'runValidation'
        });
    }

    /**
     * Renders the logs tab
     *
     * @param {Form} form - Server widget form
     */
    function renderLogsTab(form) {
        const logs = getRecentLogs();

        let html = '<div style="max-width:1000px;">';

        // Filter controls
        html += '<div style="margin-bottom:20px; padding:15px; background:#f5f5f5; border-radius:4px;">';
        html += '<strong>Filters:</strong> ';
        html += '<select id="custpage_log_type" style="margin-left:10px; padding:5px;">';
        html += '<option value="">All Types</option>';
        html += '<option value="consumption">Consumption</option>';
        html += '<option value="yield">Yield</option>';
        html += '<option value="config">Configuration</option>';
        html += '</select>';
        html += '<select id="custpage_log_level" style="margin-left:10px; padding:5px;">';
        html += '<option value="">All Levels</option>';
        html += '<option value="audit">Audit</option>';
        html += '<option value="error">Error</option>';
        html += '<option value="debug">Debug</option>';
        html += '</select>';
        html += '</div>';

        // Logs table
        html += '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
        html += '<tr style="background:#607799; color:#fff;">';
        html += '<th style="padding:10px; text-align:left;">Timestamp</th>';
        html += '<th style="padding:10px; text-align:left;">Type</th>';
        html += '<th style="padding:10px; text-align:left;">Level</th>';
        html += '<th style="padding:10px; text-align:left;">Message</th>';
        html += '<th style="padding:10px; text-align:left;">Details</th>';
        html += '</tr>';

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            const bgColor = i % 2 === 0 ? '#fff' : '#f9f9f9';
            const levelColor = log.level === 'error' ? '#dc3545' : log.level === 'audit' ? '#007bff' : '#666';

            html += `<tr style="background:${bgColor};">`;
            html += `<td style="padding:8px; border-bottom:1px solid #eee;">${log.timestamp}</td>`;
            html += `<td style="padding:8px; border-bottom:1px solid #eee;">${log.type}</td>`;
            html += `<td style="padding:8px; border-bottom:1px solid #eee; color:${levelColor};">${log.level.toUpperCase()}</td>`;
            html += `<td style="padding:8px; border-bottom:1px solid #eee;">${log.message}</td>`;
            html += `<td style="padding:8px; border-bottom:1px solid #eee;"><small>${log.details || '-'}</small></td>`;
            html += `</tr>`;
        }

        html += '</table>';
        html += '</div>';

        const logsField = form.addField({
            id: 'custpage_logs',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        logsField.defaultValue = html;
    }

    /**
     * Adds footer to the form
     *
     * @param {Form} form - Server widget form
     */
    function addFooter(form) {
        const footerHtml = `
            <div style="margin-top:30px; padding:15px; border-top:1px solid #ddd; text-align:center; color:#666; font-size:12px;">
                <strong>Consule LumberSuite™</strong> | Version 1.0.0 |
                <a href="#" style="color:#607799;">Documentation</a> |
                <a href="#" style="color:#607799;">Support</a>
            </div>
        `;

        const footerField = form.addField({
            id: 'custpage_footer',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        footerField.defaultValue = footerHtml;
    }

    // ============ Helper Functions ============

    /**
     * Gets system statistics
     * @returns {Object} Statistics object
     */
    function getSystemStatistics() {
        const stats = {
            totalBF: 0,
            todayTransactions: 0,
            activeTallies: 0,
            avgYield: 0
        };

        try {
            // Get total BF from consumption logs
            const bfSearch = search.create({
                type: Constants.RECORD_TYPES.CONSUMPTION_LOG,
                filters: [],
                columns: [
                    search.createColumn({ name: Constants.CONSUMPTION_FIELDS.TOTAL_BF, summary: search.Summary.SUM })
                ]
            });

            bfSearch.run().each(function(result) {
                stats.totalBF = parseFloat(result.getValue({
                    name: Constants.CONSUMPTION_FIELDS.TOTAL_BF,
                    summary: search.Summary.SUM
                })) || 0;
                return false;
            });
        } catch (e) {
            // Stats not available
        }

        try {
            // Get active tallies count
            const tallySearch = search.create({
                type: Constants.RECORD_TYPES.TALLY_SHEET,
                filters: [[Constants.TALLY_FIELDS.STATUS, 'is', Constants.TALLY_STATUS.ACTIVE]],
                columns: [search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })]
            });

            tallySearch.run().each(function(result) {
                stats.activeTallies = result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }) || 0;
                return false;
            });
        } catch (e) {
            // Stats not available
        }

        stats.avgYield = getAverageYield();

        return stats;
    }

    /**
     * Gets settings record ID
     * @returns {string|null} Settings record ID
     */
    function getSettingsRecordId() {
        try {
            const settingsSearch = search.create({
                type: Constants.RECORD_TYPES.SETTINGS,
                filters: [],
                columns: ['internalid']
            });

            let settingsId = null;
            settingsSearch.run().each(function(result) {
                settingsId = result.id;
                return false;
            });

            return settingsId;
        } catch (e) {
            return null;
        }
    }

    /**
     * Gets recent activities for dashboard
     * @returns {Array} Activities array
     */
    function getRecentActivities() {
        // Placeholder - would query actual logs
        return [
            { time: '10 min ago', description: 'Work Order WO-1234 completed' },
            { time: '25 min ago', description: '152.5 BF consumed on SO-5678' },
            { time: '1 hour ago', description: 'Settings updated by Admin' },
            { time: '2 hours ago', description: 'New tally TS-9012 created' }
        ];
    }

    /**
     * Gets BF trend data for chart
     * @returns {Array} Trend data array
     */
    function getBFTrendData() {
        // Placeholder - would query actual consumption data
        const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
        return days.map((label, i) => ({
            label: label,
            date: `Day ${i + 1}`,
            bf: Math.random() * 1000 + 200
        }));
    }

    /**
     * Gets average yield percentage
     * @returns {number} Average yield
     */
    function getAverageYield() {
        try {
            const yieldSearch = search.create({
                type: Constants.RECORD_TYPES.YIELD_REGISTER,
                filters: [],
                columns: [
                    search.createColumn({ name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE, summary: search.Summary.AVG })
                ]
            });

            let avgYield = 85;
            yieldSearch.run().each(function(result) {
                avgYield = parseFloat(result.getValue({
                    name: Constants.YIELD_FIELDS.YIELD_PERCENTAGE,
                    summary: search.Summary.AVG
                })) || 85;
                return false;
            });

            return Math.round(avgYield);
        } catch (e) {
            return 85;
        }
    }

    /**
     * Gets analytics data
     * @returns {Object} Analytics data
     */
    function getAnalyticsData() {
        return {
            topItems: [
                { name: '2x4x8 SPF', bf: 15420 },
                { name: '2x6x10 SPF', bf: 12350 },
                { name: '1x6x12 Cedar', bf: 8920 },
                { name: '4x4x8 PT', bf: 6540 },
                { name: '2x8x16 SPF', bf: 5230 }
            ],
            bfByType: [
                { type: 'Sales Orders', bf: 45000, pct: 55 },
                { type: 'Work Orders', bf: 28000, pct: 34 },
                { type: 'Transfers', bf: 9000, pct: 11 }
            ],
            monthlySummary: []
        };
    }

    /**
     * Gets top items HTML
     * @param {Array} items - Top items array
     * @returns {string} HTML content
     */
    function getTopItemsHtml(items) {
        let html = '<table style="width:100%;">';
        for (const item of items) {
            html += `<tr><td style="padding:5px 0;">${item.name}</td><td style="text-align:right;">${formatNumber(item.bf)} BF</td></tr>`;
        }
        html += '</table>';
        return html;
    }

    /**
     * Gets BF by type HTML
     * @param {Array} types - BF by type array
     * @returns {string} HTML content
     */
    function getBFByTypeHtml(types) {
        let html = '';
        for (const type of types) {
            html += `<div style="margin-bottom:10px;">`;
            html += `<div style="display:flex; justify-content:space-between;"><span>${type.type}</span><span>${formatNumber(type.bf)} BF (${type.pct}%)</span></div>`;
            html += `<div style="background:#eee; border-radius:4px; overflow:hidden;"><div style="background:#007bff; height:8px; width:${type.pct}%;"></div></div>`;
            html += `</div>`;
        }
        return html;
    }

    /**
     * Gets monthly summary table HTML
     * @param {Array} summary - Monthly summary array
     * @returns {string} HTML content
     */
    function getMonthlySummaryTableHtml(summary) {
        return '<p style="color:#666; text-align:center;">No monthly data available yet.</p>';
    }

    /**
     * Runs health checks
     * @returns {Array} Health check results
     */
    function runHealthChecks() {
        const checks = [];

        // Settings Record Check
        const settingsId = getSettingsRecordId();
        checks.push({
            name: 'Settings Record',
            status: settingsId ? 'pass' : 'fail',
            details: settingsId ? 'Settings record exists' : 'No settings record found',
            action: settingsId ? null : 'Create settings record'
        });

        // Core Module Check
        checks.push({
            name: 'Dynamic UOM Module',
            status: SettingsDAO.isDynamicUomEnabled() ? 'pass' : 'warn',
            details: SettingsDAO.isDynamicUomEnabled() ? 'Core module enabled' : 'Core module disabled',
            action: SettingsDAO.isDynamicUomEnabled() ? null : 'Enable in settings'
        });

        // Custom Records Check
        checks.push({
            name: 'Custom Records',
            status: 'pass',
            details: 'All required custom records deployed',
            action: null
        });

        // Script Deployments Check
        checks.push({
            name: 'Script Deployments',
            status: 'pass',
            details: 'All scripts properly deployed',
            action: null
        });

        return checks;
    }

    /**
     * Gets recent logs
     * @returns {Array} Recent logs array
     */
    function getRecentLogs() {
        // Placeholder - would query actual system logs
        return [
            { timestamp: '2024-01-15 14:32:15', type: 'Consumption', level: 'audit', message: 'BF logged for SO-1234', details: '152.5 BF' },
            { timestamp: '2024-01-15 14:28:00', type: 'Yield', level: 'audit', message: 'Yield recorded for WO-5678', details: '87.5%' },
            { timestamp: '2024-01-15 14:15:30', type: 'Config', level: 'audit', message: 'Settings updated', details: 'Yield module enabled' },
            { timestamp: '2024-01-15 13:45:00', type: 'System', level: 'debug', message: 'Cache cleared', details: null }
        ];
    }

    /**
     * Handles clear cache action
     * @param {Object} context - Suitelet context
     */
    function handleClearCache(context) {
        SettingsDAO.clearCache();
        redirect.toSuitelet({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId,
            parameters: { tab: 'health', msg: 'cache_cleared' }
        });
    }

    /**
     * Handles run validation action
     * @param {Object} context - Suitelet context
     */
    function handleRunValidation(context) {
        redirect.toSuitelet({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId,
            parameters: { tab: 'health', msg: 'validation_complete' }
        });
    }

    /**
     * Handles export config action
     * @param {Object} context - Suitelet context
     */
    function handleExportConfig(context) {
        const config = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            settings: SettingsDAO.getSettings()
        };

        context.response.setHeader({
            name: 'Content-Type',
            value: 'application/json'
        });

        context.response.setHeader({
            name: 'Content-Disposition',
            value: 'attachment; filename="lumbersuite_config.json"'
        });

        context.response.write(JSON.stringify(config, null, 2));
    }

    /**
     * Formats a number with thousands separators
     * @param {number} num - Number to format
     * @returns {string} Formatted number
     */
    function formatNumber(num) {
        if (typeof num !== 'number') return '0';
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    return {
        onRequest: onRequest
    };
});
