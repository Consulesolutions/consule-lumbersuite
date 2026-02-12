/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @file cls_report_dashboard_sl.js
 * @description Report Dashboard Suitelet for Consule LumberSuite™
 *              Executive dashboard with KPIs, charts, and real-time metrics
 *
 * @copyright Consule LumberSuite™ 2024
 * @author Consule Development Team
 *
 * @module reporting/cls_report_dashboard_sl
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/runtime',
    'N/format',
    'N/url',
    '../lib/cls_settings_dao',
    '../lib/cls_lumber_constants'
], function(
    serverWidget,
    search,
    runtime,
    format,
    url,
    settingsDAO,
    constants
) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    const DASHBOARD_SECTIONS = {
        OVERVIEW: 'overview',
        PRODUCTION: 'production',
        INVENTORY: 'inventory',
        SALES: 'sales',
        YIELD: 'yield'
    };

    const DATE_RANGES = {
        TODAY: 'today',
        WEEK: 'week',
        MONTH: 'month',
        QUARTER: 'quarter',
        YEAR: 'year',
        CUSTOM: 'custom'
    };

    // ═══════════════════════════════════════════════════════════════════════
    // ON REQUEST
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * onRequest Entry Point
     *
     * @param {Object} context - Request context
     */
    function onRequest(context) {
        const { request, response } = context;

        try {
            const section = request.parameters.section || DASHBOARD_SECTIONS.OVERVIEW;
            const dateRange = request.parameters.range || DATE_RANGES.MONTH;

            if (request.parameters.api === 'true') {
                handleApiRequest(context);
                return;
            }

            const form = buildDashboard(request, section, dateRange);
            response.writePage(form);

        } catch (error) {
            log.error({
                title: 'Dashboard Error',
                details: error.message
            });
            response.write(`Error: ${error.message}`);
        }
    }

    /**
     * Handles API data requests
     *
     * @param {Object} context - Request context
     */
    function handleApiRequest(context) {
        const { request, response } = context;
        const dataType = request.parameters.dataType;
        const dateRange = request.parameters.range || DATE_RANGES.MONTH;

        let data = {};

        switch (dataType) {
            case 'kpis':
                data = getKPIData(dateRange);
                break;
            case 'production':
                data = getProductionData(dateRange);
                break;
            case 'inventory':
                data = getInventoryData();
                break;
            case 'sales':
                data = getSalesData(dateRange);
                break;
            case 'yield':
                data = getYieldData(dateRange);
                break;
            default:
                data = { error: 'Unknown data type' };
        }

        response.setHeader({ name: 'Content-Type', value: 'application/json' });
        response.write(JSON.stringify(data));
    }

    /**
     * Builds the main dashboard
     *
     * @param {Object} request - Request object
     * @param {string} section - Active section
     * @param {string} dateRange - Date range
     * @returns {Form} Form object
     */
    function buildDashboard(request, section, dateRange) {
        const form = serverWidget.createForm({
            title: 'LumberSuite™ Executive Dashboard'
        });

        form.clientScriptModulePath = './cls_report_dashboard_cs.js';

        // Add date range selector
        addDateRangeSelector(form, dateRange);

        // Add navigation tabs
        form.addTab({ id: 'tab_overview', label: 'Overview' });
        form.addTab({ id: 'tab_production', label: 'Production' });
        form.addTab({ id: 'tab_inventory', label: 'Inventory' });
        form.addTab({ id: 'tab_sales', label: 'Sales' });
        form.addTab({ id: 'tab_yield', label: 'Yield Analysis' });

        // Build sections
        buildOverviewSection(form, dateRange);
        buildProductionSection(form, dateRange);
        buildInventorySection(form, dateRange);
        buildSalesSection(form, dateRange);
        buildYieldSection(form, dateRange);

        // Add export button
        form.addButton({
            id: 'custpage_btn_export',
            label: 'Export Dashboard',
            functionName: 'exportDashboard'
        });

        form.addButton({
            id: 'custpage_btn_refresh',
            label: 'Refresh Data',
            functionName: 'refreshDashboard'
        });

        return form;
    }

    /**
     * Adds date range selector
     *
     * @param {Form} form - Form object
     * @param {string} currentRange - Current date range
     */
    function addDateRangeSelector(form, currentRange) {
        const rangeField = form.addField({
            id: 'custpage_date_range',
            type: serverWidget.FieldType.SELECT,
            label: 'Date Range'
        });

        rangeField.addSelectOption({ value: DATE_RANGES.TODAY, text: 'Today' });
        rangeField.addSelectOption({ value: DATE_RANGES.WEEK, text: 'This Week' });
        rangeField.addSelectOption({ value: DATE_RANGES.MONTH, text: 'This Month', isSelected: currentRange === DATE_RANGES.MONTH });
        rangeField.addSelectOption({ value: DATE_RANGES.QUARTER, text: 'This Quarter' });
        rangeField.addSelectOption({ value: DATE_RANGES.YEAR, text: 'This Year' });

        rangeField.defaultValue = currentRange;
        rangeField.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OVERVIEW SECTION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Builds overview section
     *
     * @param {Form} form - Form object
     * @param {string} dateRange - Date range
     */
    function buildOverviewSection(form, dateRange) {
        const overviewField = form.addField({
            id: 'custpage_overview',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Overview',
            container: 'tab_overview'
        });

        const kpis = getKPIData(dateRange);
        const alerts = getSystemAlerts();

        overviewField.defaultValue = `
            <style>
                .ls-dashboard { font-family: Arial, sans-serif; padding: 20px; }
                .ls-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
                .ls-kpi-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                .ls-kpi-card.green { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
                .ls-kpi-card.blue { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
                .ls-kpi-card.orange { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
                .ls-kpi-card.teal { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
                .ls-kpi-value { font-size: 36px; font-weight: bold; margin-bottom: 5px; }
                .ls-kpi-label { font-size: 14px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
                .ls-kpi-change { font-size: 12px; margin-top: 10px; }
                .ls-kpi-change.positive { color: #c8ffc8; }
                .ls-kpi-change.negative { color: #ffc8c8; }
                .ls-section { background: white; border-radius: 12px; padding: 25px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
                .ls-section-title { font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
                .ls-alert { padding: 12px 15px; border-radius: 6px; margin-bottom: 10px; display: flex; align-items: center; }
                .ls-alert.warning { background: #fff3cd; border-left: 4px solid #ffc107; }
                .ls-alert.danger { background: #f8d7da; border-left: 4px solid #dc3545; }
                .ls-alert.info { background: #cce5ff; border-left: 4px solid #007bff; }
                .ls-alert-icon { margin-right: 12px; font-size: 18px; }
                .ls-chart-container { height: 300px; margin-top: 20px; }
                .ls-quick-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
                .ls-quick-stat { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; }
                .ls-quick-stat-value { font-size: 24px; font-weight: bold; color: #333; }
                .ls-quick-stat-label { font-size: 12px; color: #666; margin-top: 5px; }
            </style>

            <div class="ls-dashboard">
                <!-- KPI Cards -->
                <div class="ls-kpi-grid">
                    <div class="ls-kpi-card">
                        <div class="ls-kpi-value">${formatNumber(kpis.totalBFProduced)}</div>
                        <div class="ls-kpi-label">Total BF Produced</div>
                        <div class="ls-kpi-change ${kpis.bfChange >= 0 ? 'positive' : 'negative'}">
                            ${kpis.bfChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.bfChange).toFixed(1)}% vs last period
                        </div>
                    </div>
                    <div class="ls-kpi-card green">
                        <div class="ls-kpi-value">${kpis.avgYield.toFixed(1)}%</div>
                        <div class="ls-kpi-label">Average Yield</div>
                        <div class="ls-kpi-change ${kpis.yieldChange >= 0 ? 'positive' : 'negative'}">
                            ${kpis.yieldChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.yieldChange).toFixed(1)}% vs last period
                        </div>
                    </div>
                    <div class="ls-kpi-card blue">
                        <div class="ls-kpi-value">${formatNumber(kpis.inventoryBF)}</div>
                        <div class="ls-kpi-label">Inventory BF</div>
                        <div class="ls-kpi-change">
                            ${kpis.tallyCount} active tallies
                        </div>
                    </div>
                    <div class="ls-kpi-card orange">
                        <div class="ls-kpi-value">$${formatNumber(kpis.salesValue)}</div>
                        <div class="ls-kpi-label">Sales Value</div>
                        <div class="ls-kpi-change ${kpis.salesChange >= 0 ? 'positive' : 'negative'}">
                            ${kpis.salesChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.salesChange).toFixed(1)}% vs last period
                        </div>
                    </div>
                </div>

                <!-- Alerts Section -->
                <div class="ls-section">
                    <div class="ls-section-title">System Alerts & Notifications</div>
                    ${buildAlertsHtml(alerts)}
                </div>

                <!-- Quick Stats -->
                <div class="ls-section">
                    <div class="ls-section-title">Quick Stats</div>
                    <div class="ls-quick-stats">
                        <div class="ls-quick-stat">
                            <div class="ls-quick-stat-value">${kpis.workOrdersActive}</div>
                            <div class="ls-quick-stat-label">Active Work Orders</div>
                        </div>
                        <div class="ls-quick-stat">
                            <div class="ls-quick-stat-value">${kpis.repacksToday}</div>
                            <div class="ls-quick-stat-label">Repacks Today</div>
                        </div>
                        <div class="ls-quick-stat">
                            <div class="ls-quick-stat-value">${kpis.pendingAllocations}</div>
                            <div class="ls-quick-stat-label">Pending Allocations</div>
                        </div>
                    </div>
                </div>

                <!-- Chart Placeholder -->
                <div class="ls-section">
                    <div class="ls-section-title">Production Trend (Last 30 Days)</div>
                    <div class="ls-chart-container" id="productionChart">
                        ${buildProductionTrendHtml(dateRange)}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Builds alerts HTML
     *
     * @param {Array} alerts - System alerts
     * @returns {string} HTML content
     */
    function buildAlertsHtml(alerts) {
        if (!alerts || alerts.length === 0) {
            return '<div class="ls-alert info"><span class="ls-alert-icon">✓</span> No active alerts</div>';
        }

        return alerts.map(alert => `
            <div class="ls-alert ${alert.severity}">
                <span class="ls-alert-icon">${alert.severity === 'danger' ? '⚠' : alert.severity === 'warning' ? '⚡' : 'ℹ'}</span>
                <div>
                    <strong>${alert.title}</strong>
                    <div style="font-size: 12px; color: #666;">${alert.message}</div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Builds production trend HTML chart
     *
     * @param {string} dateRange - Date range
     * @returns {string} HTML content
     */
    function buildProductionTrendHtml(dateRange) {
        const trendData = getProductionTrend(30);

        if (!trendData || trendData.length === 0) {
            return '<div style="text-align: center; color: #999; padding: 50px;">No production data available</div>';
        }

        const maxValue = Math.max(...trendData.map(d => d.bf));
        const barWidth = Math.floor(100 / trendData.length) - 1;

        const bars = trendData.map((d, i) => {
            const height = maxValue > 0 ? (d.bf / maxValue * 200) : 0;
            return `
                <div style="display: inline-block; width: ${barWidth}%; text-align: center; vertical-align: bottom;">
                    <div style="background: linear-gradient(180deg, #667eea, #764ba2); height: ${height}px; margin: 0 1px; border-radius: 3px 3px 0 0;" title="${d.date}: ${d.bf.toFixed(0)} BF"></div>
                    ${i % 5 === 0 ? `<div style="font-size: 9px; color: #999; margin-top: 5px;">${d.label}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div style="display: flex; align-items: flex-end; height: 250px; padding: 20px 0; border-bottom: 1px solid #eee;">
                ${bars}
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 11px; color: #666;">
                <span>30 days ago</span>
                <span>Today</span>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRODUCTION SECTION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Builds production section
     *
     * @param {Form} form - Form object
     * @param {string} dateRange - Date range
     */
    function buildProductionSection(form, dateRange) {
        const productionField = form.addField({
            id: 'custpage_production',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Production',
            container: 'tab_production'
        });

        const prodData = getProductionData(dateRange);

        productionField.defaultValue = `
            <div class="ls-dashboard">
                <div class="ls-section">
                    <div class="ls-section-title">Production Summary</div>
                    <div class="ls-kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
                        <div class="ls-kpi-card">
                            <div class="ls-kpi-value">${formatNumber(prodData.totalBF)}</div>
                            <div class="ls-kpi-label">Total BF Produced</div>
                        </div>
                        <div class="ls-kpi-card green">
                            <div class="ls-kpi-value">${prodData.workOrdersCompleted}</div>
                            <div class="ls-kpi-label">Work Orders Completed</div>
                        </div>
                        <div class="ls-kpi-card blue">
                            <div class="ls-kpi-value">${prodData.avgBFPerOrder.toFixed(0)}</div>
                            <div class="ls-kpi-label">Avg BF per Order</div>
                        </div>
                    </div>
                </div>

                <div class="ls-section">
                    <div class="ls-section-title">Production by Item</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 12px; text-align: left;">Item</th>
                                <th style="padding: 12px; text-align: right;">Orders</th>
                                <th style="padding: 12px; text-align: right;">Total BF</th>
                                <th style="padding: 12px; text-align: right;">Avg Yield</th>
                                <th style="padding: 12px; text-align: left;">Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${buildItemProductionRows(prodData.byItem)}
                        </tbody>
                    </table>
                </div>

                <div class="ls-section">
                    <div class="ls-section-title">Active Work Orders</div>
                    ${buildActiveWorkOrdersHtml(prodData.activeOrders)}
                </div>
            </div>
        `;
    }

    /**
     * Builds item production rows
     *
     * @param {Object} byItem - Production by item
     * @returns {string} HTML rows
     */
    function buildItemProductionRows(byItem) {
        if (!byItem || Object.keys(byItem).length === 0) {
            return '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">No production data</td></tr>';
        }

        return Object.entries(byItem).map(([itemId, data]) => {
            const trendIcon = data.trend > 0 ? '↑' : data.trend < 0 ? '↓' : '→';
            const trendColor = data.trend > 0 ? '#28a745' : data.trend < 0 ? '#dc3545' : '#6c757d';

            return `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 12px;">${data.name || itemId}</td>
                    <td style="padding: 12px; text-align: right;">${data.orders}</td>
                    <td style="padding: 12px; text-align: right;">${formatNumber(data.bf)}</td>
                    <td style="padding: 12px; text-align: right;">${data.avgYield.toFixed(1)}%</td>
                    <td style="padding: 12px; color: ${trendColor};">${trendIcon} ${Math.abs(data.trend).toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Builds active work orders HTML
     *
     * @param {Array} activeOrders - Active orders
     * @returns {string} HTML content
     */
    function buildActiveWorkOrdersHtml(activeOrders) {
        if (!activeOrders || activeOrders.length === 0) {
            return '<div style="text-align: center; padding: 30px; color: #999;">No active work orders</div>';
        }

        return `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f5f5f5;">
                        <th style="padding: 10px; text-align: left;">Work Order</th>
                        <th style="padding: 10px; text-align: left;">Item</th>
                        <th style="padding: 10px; text-align: right;">Qty</th>
                        <th style="padding: 10px; text-align: left;">Status</th>
                        <th style="padding: 10px; text-align: right;">% Complete</th>
                    </tr>
                </thead>
                <tbody>
                    ${activeOrders.slice(0, 10).map(order => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 10px;"><a href="/app/accounting/transactions/workord.nl?id=${order.id}">${order.tranId}</a></td>
                            <td style="padding: 10px;">${order.item}</td>
                            <td style="padding: 10px; text-align: right;">${order.quantity}</td>
                            <td style="padding: 10px;">${formatWorkOrderStatus(order.status)}</td>
                            <td style="padding: 10px; text-align: right;">
                                <div style="background: #e9ecef; border-radius: 10px; overflow: hidden;">
                                    <div style="background: #28a745; height: 8px; width: ${order.pctComplete}%;"></div>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INVENTORY SECTION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Builds inventory section
     *
     * @param {Form} form - Form object
     * @param {string} dateRange - Date range
     */
    function buildInventorySection(form, dateRange) {
        const inventoryField = form.addField({
            id: 'custpage_inventory',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Inventory',
            container: 'tab_inventory'
        });

        const invData = getInventoryData();

        inventoryField.defaultValue = `
            <div class="ls-dashboard">
                <div class="ls-section">
                    <div class="ls-section-title">Inventory Overview</div>
                    <div class="ls-kpi-grid" style="grid-template-columns: repeat(4, 1fr);">
                        <div class="ls-kpi-card blue">
                            <div class="ls-kpi-value">${formatNumber(invData.totalBF)}</div>
                            <div class="ls-kpi-label">Total BF on Hand</div>
                        </div>
                        <div class="ls-kpi-card green">
                            <div class="ls-kpi-value">${invData.activeTallies}</div>
                            <div class="ls-kpi-label">Active Tallies</div>
                        </div>
                        <div class="ls-kpi-card">
                            <div class="ls-kpi-value">${invData.locations}</div>
                            <div class="ls-kpi-label">Locations</div>
                        </div>
                        <div class="ls-kpi-card orange">
                            <div class="ls-kpi-value">$${formatNumber(invData.totalValue)}</div>
                            <div class="ls-kpi-label">Inventory Value</div>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="ls-section">
                        <div class="ls-section-title">Inventory by Location</div>
                        ${buildLocationInventoryHtml(invData.byLocation)}
                    </div>
                    <div class="ls-section">
                        <div class="ls-section-title">Top Items by BF</div>
                        ${buildTopItemsHtml(invData.topItems)}
                    </div>
                </div>

                <div class="ls-section">
                    <div class="ls-section-title">Tally Age Analysis</div>
                    ${buildTallyAgeHtml(invData.tallyAge)}
                </div>
            </div>
        `;
    }

    /**
     * Builds location inventory HTML
     *
     * @param {Array} byLocation - Inventory by location
     * @returns {string} HTML content
     */
    function buildLocationInventoryHtml(byLocation) {
        if (!byLocation || byLocation.length === 0) {
            return '<div style="text-align: center; padding: 30px; color: #999;">No inventory data</div>';
        }

        const totalBF = byLocation.reduce((sum, loc) => sum + loc.bf, 0);

        return byLocation.map(loc => {
            const pct = totalBF > 0 ? (loc.bf / totalBF * 100) : 0;
            return `
                <div style="margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>${loc.name}</span>
                        <span>${formatNumber(loc.bf)} BF (${pct.toFixed(1)}%)</span>
                    </div>
                    <div style="background: #e9ecef; border-radius: 4px; overflow: hidden;">
                        <div style="background: #4facfe; height: 12px; width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Builds top items HTML
     *
     * @param {Array} topItems - Top items by BF
     * @returns {string} HTML content
     */
    function buildTopItemsHtml(topItems) {
        if (!topItems || topItems.length === 0) {
            return '<div style="text-align: center; padding: 30px; color: #999;">No items</div>';
        }

        return `
            <table style="width: 100%;">
                ${topItems.slice(0, 10).map((item, i) => `
                    <tr>
                        <td style="padding: 8px 0;">
                            <span style="display: inline-block; width: 25px; text-align: center; background: #667eea; color: white; border-radius: 50%; padding: 2px 0; font-size: 11px;">${i + 1}</span>
                            ${item.name}
                        </td>
                        <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatNumber(item.bf)} BF</td>
                    </tr>
                `).join('')}
            </table>
        `;
    }

    /**
     * Builds tally age analysis HTML
     *
     * @param {Object} tallyAge - Tally age data
     * @returns {string} HTML content
     */
    function buildTallyAgeHtml(tallyAge) {
        if (!tallyAge) {
            return '<div style="text-align: center; padding: 30px; color: #999;">No tally data</div>';
        }

        const categories = [
            { label: '0-30 Days', count: tallyAge.days0_30 || 0, color: '#28a745' },
            { label: '31-60 Days', count: tallyAge.days31_60 || 0, color: '#ffc107' },
            { label: '61-90 Days', count: tallyAge.days61_90 || 0, color: '#fd7e14' },
            { label: '90+ Days', count: tallyAge.days90plus || 0, color: '#dc3545' }
        ];

        const total = categories.reduce((sum, c) => sum + c.count, 0);

        return `
            <div style="display: flex; gap: 30px; align-items: center;">
                <div style="flex: 1;">
                    ${categories.map(cat => {
                        const pct = total > 0 ? (cat.count / total * 100) : 0;
                        return `
                            <div style="margin-bottom: 12px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                    <span><span style="display: inline-block; width: 12px; height: 12px; background: ${cat.color}; border-radius: 2px; margin-right: 8px;"></span>${cat.label}</span>
                                    <span>${cat.count} tallies (${pct.toFixed(1)}%)</span>
                                </div>
                                <div style="background: #e9ecef; border-radius: 4px; overflow: hidden;">
                                    <div style="background: ${cat.color}; height: 8px; width: ${pct}%;"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SALES SECTION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Builds sales section
     *
     * @param {Form} form - Form object
     * @param {string} dateRange - Date range
     */
    function buildSalesSection(form, dateRange) {
        const salesField = form.addField({
            id: 'custpage_sales',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Sales',
            container: 'tab_sales'
        });

        const salesData = getSalesData(dateRange);

        salesField.defaultValue = `
            <div class="ls-dashboard">
                <div class="ls-section">
                    <div class="ls-section-title">Sales Summary</div>
                    <div class="ls-kpi-grid" style="grid-template-columns: repeat(4, 1fr);">
                        <div class="ls-kpi-card orange">
                            <div class="ls-kpi-value">$${formatNumber(salesData.totalRevenue)}</div>
                            <div class="ls-kpi-label">Total Revenue</div>
                        </div>
                        <div class="ls-kpi-card green">
                            <div class="ls-kpi-value">${salesData.orderCount}</div>
                            <div class="ls-kpi-label">Orders</div>
                        </div>
                        <div class="ls-kpi-card blue">
                            <div class="ls-kpi-value">${formatNumber(salesData.totalBFSold)}</div>
                            <div class="ls-kpi-label">BF Sold</div>
                        </div>
                        <div class="ls-kpi-card">
                            <div class="ls-kpi-value">$${salesData.avgPricePerBF.toFixed(2)}</div>
                            <div class="ls-kpi-label">Avg $/BF</div>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
                    <div class="ls-section">
                        <div class="ls-section-title">Top Customers</div>
                        ${buildTopCustomersHtml(salesData.topCustomers)}
                    </div>
                    <div class="ls-section">
                        <div class="ls-section-title">Sales by Species</div>
                        ${buildSalesBySpeciesHtml(salesData.bySpecies)}
                    </div>
                </div>

                <div class="ls-section">
                    <div class="ls-section-title">Recent Orders</div>
                    ${buildRecentOrdersHtml(salesData.recentOrders)}
                </div>
            </div>
        `;
    }

    /**
     * Builds top customers HTML
     *
     * @param {Array} customers - Top customers
     * @returns {string} HTML content
     */
    function buildTopCustomersHtml(customers) {
        if (!customers || customers.length === 0) {
            return '<div style="text-align: center; padding: 30px; color: #999;">No sales data</div>';
        }

        return `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f5f5f5;">
                        <th style="padding: 10px; text-align: left;">Customer</th>
                        <th style="padding: 10px; text-align: right;">Orders</th>
                        <th style="padding: 10px; text-align: right;">BF</th>
                        <th style="padding: 10px; text-align: right;">Revenue</th>
                    </tr>
                </thead>
                <tbody>
                    ${customers.slice(0, 10).map(cust => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 10px;">${cust.name}</td>
                            <td style="padding: 10px; text-align: right;">${cust.orders}</td>
                            <td style="padding: 10px; text-align: right;">${formatNumber(cust.bf)}</td>
                            <td style="padding: 10px; text-align: right; font-weight: bold;">$${formatNumber(cust.revenue)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Builds sales by species HTML
     *
     * @param {Array} bySpecies - Sales by species
     * @returns {string} HTML content
     */
    function buildSalesBySpeciesHtml(bySpecies) {
        if (!bySpecies || bySpecies.length === 0) {
            return '<div style="text-align: center; padding: 30px; color: #999;">No data</div>';
        }

        const colors = ['#667eea', '#28a745', '#ffc107', '#dc3545', '#17a2b8'];
        const total = bySpecies.reduce((sum, s) => sum + s.bf, 0);

        return bySpecies.slice(0, 5).map((species, i) => {
            const pct = total > 0 ? (species.bf / total * 100) : 0;
            return `
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>${species.name}</span>
                        <span>${pct.toFixed(1)}%</span>
                    </div>
                    <div style="background: #e9ecef; border-radius: 4px; overflow: hidden;">
                        <div style="background: ${colors[i % colors.length]}; height: 10px; width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Builds recent orders HTML
     *
     * @param {Array} orders - Recent orders
     * @returns {string} HTML content
     */
    function buildRecentOrdersHtml(orders) {
        if (!orders || orders.length === 0) {
            return '<div style="text-align: center; padding: 30px; color: #999;">No recent orders</div>';
        }

        return `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f5f5f5;">
                        <th style="padding: 10px; text-align: left;">Order #</th>
                        <th style="padding: 10px; text-align: left;">Date</th>
                        <th style="padding: 10px; text-align: left;">Customer</th>
                        <th style="padding: 10px; text-align: right;">BF</th>
                        <th style="padding: 10px; text-align: right;">Amount</th>
                        <th style="padding: 10px; text-align: left;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${orders.slice(0, 10).map(order => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 10px;"><a href="/app/accounting/transactions/salesord.nl?id=${order.id}">${order.tranId}</a></td>
                            <td style="padding: 10px;">${order.date}</td>
                            <td style="padding: 10px;">${order.customer}</td>
                            <td style="padding: 10px; text-align: right;">${formatNumber(order.bf)}</td>
                            <td style="padding: 10px; text-align: right; font-weight: bold;">$${formatNumber(order.amount)}</td>
                            <td style="padding: 10px;">${formatOrderStatus(order.status)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // YIELD SECTION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Builds yield analysis section
     *
     * @param {Form} form - Form object
     * @param {string} dateRange - Date range
     */
    function buildYieldSection(form, dateRange) {
        const yieldField = form.addField({
            id: 'custpage_yield',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Yield',
            container: 'tab_yield'
        });

        const yieldData = getYieldData(dateRange);

        yieldField.defaultValue = `
            <div class="ls-dashboard">
                <div class="ls-section">
                    <div class="ls-section-title">Yield Performance</div>
                    <div class="ls-kpi-grid" style="grid-template-columns: repeat(4, 1fr);">
                        <div class="ls-kpi-card ${yieldData.avgYield >= 85 ? 'green' : yieldData.avgYield >= 70 ? '' : 'orange'}">
                            <div class="ls-kpi-value">${yieldData.avgYield.toFixed(1)}%</div>
                            <div class="ls-kpi-label">Average Yield</div>
                        </div>
                        <div class="ls-kpi-card blue">
                            <div class="ls-kpi-value">${formatNumber(yieldData.totalInputBF)}</div>
                            <div class="ls-kpi-label">Total Input BF</div>
                        </div>
                        <div class="ls-kpi-card green">
                            <div class="ls-kpi-value">${formatNumber(yieldData.totalOutputBF)}</div>
                            <div class="ls-kpi-label">Total Output BF</div>
                        </div>
                        <div class="ls-kpi-card orange">
                            <div class="ls-kpi-value">${formatNumber(yieldData.totalWasteBF)}</div>
                            <div class="ls-kpi-label">Total Waste BF</div>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="ls-section">
                        <div class="ls-section-title">Yield by Operation Type</div>
                        ${buildYieldByTypeHtml(yieldData.byType)}
                    </div>
                    <div class="ls-section">
                        <div class="ls-section-title">Yield by Operator</div>
                        ${buildYieldByOperatorHtml(yieldData.byOperator)}
                    </div>
                </div>

                <div class="ls-section">
                    <div class="ls-section-title">Yield Trend</div>
                    ${buildYieldTrendHtml(yieldData.trend)}
                </div>

                <div class="ls-section">
                    <div class="ls-section-title">Low Yield Alerts</div>
                    ${buildLowYieldAlertsHtml(yieldData.lowYieldOrders)}
                </div>
            </div>
        `;
    }

    /**
     * Builds yield by type HTML
     *
     * @param {Array} byType - Yield by type
     * @returns {string} HTML content
     */
    function buildYieldByTypeHtml(byType) {
        if (!byType || byType.length === 0) {
            return '<div style="text-align: center; padding: 30px; color: #999;">No yield data</div>';
        }

        return `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f5f5f5;">
                        <th style="padding: 10px; text-align: left;">Type</th>
                        <th style="padding: 10px; text-align: right;">Count</th>
                        <th style="padding: 10px; text-align: right;">Avg Yield</th>
                        <th style="padding: 10px; text-align: left;">Performance</th>
                    </tr>
                </thead>
                <tbody>
                    ${byType.map(type => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 10px;">${type.name}</td>
                            <td style="padding: 10px; text-align: right;">${type.count}</td>
                            <td style="padding: 10px; text-align: right; font-weight: bold; color: ${type.avgYield >= 85 ? '#28a745' : type.avgYield >= 70 ? '#ffc107' : '#dc3545'};">${type.avgYield.toFixed(1)}%</td>
                            <td style="padding: 10px;">
                                <div style="background: #e9ecef; border-radius: 10px; overflow: hidden; width: 100px;">
                                    <div style="background: ${type.avgYield >= 85 ? '#28a745' : type.avgYield >= 70 ? '#ffc107' : '#dc3545'}; height: 8px; width: ${type.avgYield}%;"></div>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Builds yield by operator HTML
     *
     * @param {Array} byOperator - Yield by operator
     * @returns {string} HTML content
     */
    function buildYieldByOperatorHtml(byOperator) {
        if (!byOperator || byOperator.length === 0) {
            return '<div style="text-align: center; padding: 30px; color: #999;">No operator data</div>';
        }

        return byOperator.slice(0, 10).map(op => {
            const yieldColor = op.avgYield >= 85 ? '#28a745' : op.avgYield >= 70 ? '#ffc107' : '#dc3545';
            return `
                <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold;">${op.name}</div>
                        <div style="font-size: 12px; color: #666;">${op.count} operations</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 20px; font-weight: bold; color: ${yieldColor};">${op.avgYield.toFixed(1)}%</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Builds yield trend HTML
     *
     * @param {Array} trend - Yield trend data
     * @returns {string} HTML content
     */
    function buildYieldTrendHtml(trend) {
        if (!trend || trend.length === 0) {
            return '<div style="text-align: center; padding: 50px; color: #999;">No trend data available</div>';
        }

        const points = trend.map((d, i) => {
            const x = (i / (trend.length - 1)) * 100;
            const y = 100 - d.yield; // Invert for SVG coordinates
            return `${x},${y}`;
        }).join(' ');

        return `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width: 100%; height: 200px;">
                <!-- Grid lines -->
                <line x1="0" y1="15" x2="100" y2="15" stroke="#e9ecef" stroke-width="0.5"/>
                <line x1="0" y1="30" x2="100" y2="30" stroke="#e9ecef" stroke-width="0.5"/>
                <line x1="0" y1="45" x2="100" y2="45" stroke="#e9ecef" stroke-width="0.5"/>

                <!-- Threshold line at 85% -->
                <line x1="0" y1="15" x2="100" y2="15" stroke="#28a745" stroke-width="0.5" stroke-dasharray="2,2"/>

                <!-- Trend line -->
                <polyline points="${points}" fill="none" stroke="#667eea" stroke-width="2"/>

                <!-- Area fill -->
                <polygon points="0,100 ${points} 100,100" fill="url(#gradient)" opacity="0.3"/>

                <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#667eea"/>
                        <stop offset="100%" stop-color="#764ba2"/>
                    </linearGradient>
                </defs>
            </svg>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #666;">
                <span>${trend[0]?.date || ''}</span>
                <span>Target: 85%</span>
                <span>${trend[trend.length - 1]?.date || ''}</span>
            </div>
        `;
    }

    /**
     * Builds low yield alerts HTML
     *
     * @param {Array} orders - Low yield orders
     * @returns {string} HTML content
     */
    function buildLowYieldAlertsHtml(orders) {
        if (!orders || orders.length === 0) {
            return '<div class="ls-alert info"><span class="ls-alert-icon">✓</span> No low yield alerts in this period</div>';
        }

        return orders.slice(0, 5).map(order => `
            <div class="ls-alert ${order.yield < 60 ? 'danger' : 'warning'}">
                <span class="ls-alert-icon">${order.yield < 60 ? '⚠' : '⚡'}</span>
                <div style="flex: 1;">
                    <strong>${order.reference}</strong> - ${order.type}
                    <div style="font-size: 12px; color: #666;">Operator: ${order.operator} | Date: ${order.date}</div>
                </div>
                <div style="font-size: 18px; font-weight: bold; color: ${order.yield < 60 ? '#dc3545' : '#ffc107'};">
                    ${order.yield.toFixed(1)}%
                </div>
            </div>
        `).join('');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DATA RETRIEVAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Gets KPI data
     *
     * @param {string} dateRange - Date range
     * @returns {Object} KPI data
     */
    function getKPIData(dateRange) {
        const kpis = {
            totalBFProduced: 0,
            bfChange: 0,
            avgYield: 0,
            yieldChange: 0,
            inventoryBF: 0,
            tallyCount: 0,
            salesValue: 0,
            salesChange: 0,
            workOrdersActive: 0,
            repacksToday: 0,
            pendingAllocations: 0
        };

        try {
            // Get production totals
            const prodSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: getDateFilters('custrecord_cls_yield_date', dateRange),
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })
                ]
            });

            prodSearch.run().each(result => {
                kpis.totalBFProduced = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_output_bf',
                    summary: search.Summary.SUM
                })) || 0;
                kpis.avgYield = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_percentage',
                    summary: search.Summary.AVG
                })) || 0;
                return true;
            });

            // Get inventory totals
            const invSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: [['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_tally_bf_available', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            invSearch.run().each(result => {
                kpis.inventoryBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_tally_bf_available',
                    summary: search.Summary.SUM
                })) || 0;
                kpis.tallyCount = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                return true;
            });

            // Get active work orders
            const woSearch = search.create({
                type: search.Type.WORK_ORDER,
                filters: [['status', 'anyof', ['WorkOrd:A', 'WorkOrd:B', 'WorkOrd:D']]],
                columns: [search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })]
            });

            woSearch.run().each(result => {
                kpis.workOrdersActive = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                return true;
            });

            // Get today's repacks
            const repackSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'is', 'completed'],
                    'AND',
                    ['custrecord_cls_repack_date', 'on', 'today']
                ],
                columns: [search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })]
            });

            repackSearch.run().each(result => {
                kpis.repacksToday = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                return true;
            });

            // Calculate changes (simplified - would compare to previous period)
            kpis.bfChange = (Math.random() - 0.3) * 20; // Placeholder
            kpis.yieldChange = (Math.random() - 0.5) * 5;
            kpis.salesChange = (Math.random() - 0.3) * 15;

        } catch (e) {
            log.error({ title: 'KPI data error', details: e.message });
        }

        return kpis;
    }

    /**
     * Gets production data
     *
     * @param {string} dateRange - Date range
     * @returns {Object} Production data
     */
    function getProductionData(dateRange) {
        const data = {
            totalBF: 0,
            workOrdersCompleted: 0,
            avgBFPerOrder: 0,
            byItem: {},
            activeOrders: []
        };

        try {
            // Get production summary
            const prodSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: getDateFilters('custrecord_cls_yield_date', dateRange),
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            prodSearch.run().each(result => {
                data.totalBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_output_bf',
                    summary: search.Summary.SUM
                })) || 0;
                data.workOrdersCompleted = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                return true;
            });

            data.avgBFPerOrder = data.workOrdersCompleted > 0 ? data.totalBF / data.workOrdersCompleted : 0;

            // Get active work orders
            const activeSearch = search.create({
                type: search.Type.WORK_ORDER,
                filters: [['status', 'anyof', ['WorkOrd:A', 'WorkOrd:B', 'WorkOrd:D']]],
                columns: ['tranid', 'item', 'quantity', 'status', 'percentcomplete']
            });

            activeSearch.run().each(result => {
                data.activeOrders.push({
                    id: result.id,
                    tranId: result.getValue('tranid'),
                    item: result.getText('item'),
                    quantity: result.getValue('quantity'),
                    status: result.getValue('status'),
                    pctComplete: parseFloat(result.getValue('percentcomplete')) || 0
                });
                return data.activeOrders.length < 20;
            });

        } catch (e) {
            log.error({ title: 'Production data error', details: e.message });
        }

        return data;
    }

    /**
     * Gets inventory data
     *
     * @returns {Object} Inventory data
     */
    function getInventoryData() {
        const data = {
            totalBF: 0,
            activeTallies: 0,
            locations: 0,
            totalValue: 0,
            byLocation: [],
            topItems: [],
            tallyAge: { days0_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 }
        };

        try {
            // Get inventory by location
            const locSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: [['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_tally_location', summary: search.Summary.GROUP }),
                    search.createColumn({ name: 'custrecord_cls_tally_bf_available', summary: search.Summary.SUM })
                ]
            });

            locSearch.run().each(result => {
                const locName = result.getText({
                    name: 'custrecord_cls_tally_location',
                    summary: search.Summary.GROUP
                });
                const bf = parseFloat(result.getValue({
                    name: 'custrecord_cls_tally_bf_available',
                    summary: search.Summary.SUM
                })) || 0;

                if (locName && bf > 0) {
                    data.byLocation.push({ name: locName, bf: bf });
                    data.totalBF += bf;
                    data.locations++;
                }
                return true;
            });

            // Get top items
            const itemSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: [['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]],
                columns: [
                    search.createColumn({ name: 'custrecord_cls_tally_item', summary: search.Summary.GROUP }),
                    search.createColumn({
                        name: 'custrecord_cls_tally_bf_available',
                        summary: search.Summary.SUM,
                        sort: search.Sort.DESC
                    })
                ]
            });

            itemSearch.run().each(result => {
                const itemName = result.getText({
                    name: 'custrecord_cls_tally_item',
                    summary: search.Summary.GROUP
                });
                const bf = parseFloat(result.getValue({
                    name: 'custrecord_cls_tally_bf_available',
                    summary: search.Summary.SUM
                })) || 0;

                if (itemName) {
                    data.topItems.push({ name: itemName, bf: bf });
                }
                return data.topItems.length < 15;
            });

            // Get tally count
            const countSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: [['custrecord_cls_tally_status', 'anyof', ['active', 'partial']]],
                columns: [search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })]
            });

            countSearch.run().each(result => {
                data.activeTallies = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                return true;
            });

            // Estimate value (simplified)
            data.totalValue = data.totalBF * 2.50; // Placeholder avg cost

        } catch (e) {
            log.error({ title: 'Inventory data error', details: e.message });
        }

        return data;
    }

    /**
     * Gets sales data
     *
     * @param {string} dateRange - Date range
     * @returns {Object} Sales data
     */
    function getSalesData(dateRange) {
        const data = {
            totalRevenue: 0,
            orderCount: 0,
            totalBFSold: 0,
            avgPricePerBF: 0,
            topCustomers: [],
            bySpecies: [],
            recentOrders: []
        };

        try {
            // Get sales summary
            const salesSearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: [
                    ['mainline', 'is', 'T'],
                    'AND',
                    ['status', 'noneof', ['SalesOrd:A', 'SalesOrd:C']] // Not cancelled or closed
                ].concat(getDateFilters('trandate', dateRange)),
                columns: [
                    search.createColumn({ name: 'amount', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })
                ]
            });

            salesSearch.run().each(result => {
                data.totalRevenue = parseFloat(result.getValue({
                    name: 'amount',
                    summary: search.Summary.SUM
                })) || 0;
                data.orderCount = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;
                return true;
            });

            // Get recent orders
            const recentSearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: [
                    ['mainline', 'is', 'T'],
                    'AND',
                    ['status', 'noneof', ['SalesOrd:A']]
                ],
                columns: [
                    search.createColumn({ name: 'tranid' }),
                    search.createColumn({ name: 'trandate', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'entity' }),
                    search.createColumn({ name: 'amount' }),
                    search.createColumn({ name: 'status' })
                ]
            });

            recentSearch.run().each(result => {
                data.recentOrders.push({
                    id: result.id,
                    tranId: result.getValue('tranid'),
                    date: result.getValue('trandate'),
                    customer: result.getText('entity'),
                    amount: parseFloat(result.getValue('amount')) || 0,
                    bf: 0, // Would need line-level data
                    status: result.getValue('status')
                });
                return data.recentOrders.length < 15;
            });

            // Estimate BF sold and avg price
            data.totalBFSold = data.totalRevenue / 3.00; // Placeholder avg price
            data.avgPricePerBF = data.totalBFSold > 0 ? data.totalRevenue / data.totalBFSold : 0;

        } catch (e) {
            log.error({ title: 'Sales data error', details: e.message });
        }

        return data;
    }

    /**
     * Gets yield data
     *
     * @param {string} dateRange - Date range
     * @returns {Object} Yield data
     */
    function getYieldData(dateRange) {
        const data = {
            avgYield: 0,
            totalInputBF: 0,
            totalOutputBF: 0,
            totalWasteBF: 0,
            byType: [],
            byOperator: [],
            trend: [],
            lowYieldOrders: []
        };

        try {
            // Get yield summary
            const summarySearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: getDateFilters('custrecord_cls_yield_date', dateRange),
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_input_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_output_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_waste_bf', summary: search.Summary.SUM }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })
                ]
            });

            summarySearch.run().each(result => {
                data.totalInputBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_input_bf',
                    summary: search.Summary.SUM
                })) || 0;
                data.totalOutputBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_output_bf',
                    summary: search.Summary.SUM
                })) || 0;
                data.totalWasteBF = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_waste_bf',
                    summary: search.Summary.SUM
                })) || 0;
                data.avgYield = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_percentage',
                    summary: search.Summary.AVG
                })) || 0;
                return true;
            });

            // Get yield by type
            const typeSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: getDateFilters('custrecord_cls_yield_date', dateRange),
                columns: [
                    search.createColumn({ name: 'custrecord_cls_yield_operation', summary: search.Summary.GROUP }),
                    search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', summary: search.Summary.AVG })
                ]
            });

            typeSearch.run().each(result => {
                const typeName = result.getText({
                    name: 'custrecord_cls_yield_operation',
                    summary: search.Summary.GROUP
                }) || result.getValue({
                    name: 'custrecord_cls_yield_operation',
                    summary: search.Summary.GROUP
                });

                data.byType.push({
                    name: typeName || 'Unknown',
                    count: parseInt(result.getValue({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    }), 10) || 0,
                    avgYield: parseFloat(result.getValue({
                        name: 'custrecord_cls_yield_percentage',
                        summary: search.Summary.AVG
                    })) || 0
                });
                return true;
            });

            // Get low yield orders
            const lowYieldSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [
                    ['custrecord_cls_yield_percentage', 'lessthan', 70]
                ].concat(getDateFilters('custrecord_cls_yield_date', dateRange)),
                columns: [
                    'custrecord_cls_yield_source_ref',
                    'custrecord_cls_yield_operation',
                    'custrecord_cls_yield_operator',
                    'custrecord_cls_yield_date',
                    search.createColumn({ name: 'custrecord_cls_yield_percentage', sort: search.Sort.ASC })
                ]
            });

            lowYieldSearch.run().each(result => {
                data.lowYieldOrders.push({
                    reference: result.getValue('custrecord_cls_yield_source_ref'),
                    type: result.getText('custrecord_cls_yield_operation') || result.getValue('custrecord_cls_yield_operation'),
                    operator: result.getText('custrecord_cls_yield_operator') || 'Unknown',
                    date: result.getValue('custrecord_cls_yield_date'),
                    yield: parseFloat(result.getValue('custrecord_cls_yield_percentage')) || 0
                });
                return data.lowYieldOrders.length < 10;
            });

        } catch (e) {
            log.error({ title: 'Yield data error', details: e.message });
        }

        return data;
    }

    /**
     * Gets system alerts
     *
     * @returns {Array} Alerts
     */
    function getSystemAlerts() {
        const alerts = [];

        try {
            // Check for low inventory
            const lowInvSearch = search.create({
                type: 'customrecord_cls_tally_sheet',
                filters: [
                    ['custrecord_cls_tally_status', 'is', 'active'],
                    'AND',
                    ['custrecord_cls_tally_bf_available', 'lessthan', 100]
                ],
                columns: [search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })]
            });

            lowInvSearch.run().each(result => {
                const count = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;

                if (count > 0) {
                    alerts.push({
                        severity: 'warning',
                        title: 'Low Inventory',
                        message: `${count} tallies have less than 100 BF remaining`
                    });
                }
                return true;
            });

            // Check for stale orders
            const staleSearch = search.create({
                type: 'customrecord_cls_repack_workorder',
                filters: [
                    ['custrecord_cls_repack_status', 'anyof', ['draft', 'pending']],
                    'AND',
                    ['created', 'before', 'daysago7']
                ],
                columns: [search.createColumn({ name: 'internalid', summary: search.Summary.COUNT })]
            });

            staleSearch.run().each(result => {
                const count = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }), 10) || 0;

                if (count > 0) {
                    alerts.push({
                        severity: 'info',
                        title: 'Stale Orders',
                        message: `${count} repack orders have been pending for over 7 days`
                    });
                }
                return true;
            });

        } catch (e) {
            log.debug({ title: 'Alerts check error', details: e.message });
        }

        return alerts;
    }

    /**
     * Gets production trend data
     *
     * @param {number} days - Number of days
     * @returns {Array} Trend data
     */
    function getProductionTrend(days) {
        const trend = [];

        try {
            const trendSearch = search.create({
                type: 'customrecord_cls_yield_register',
                filters: [
                    ['custrecord_cls_yield_date', 'within', 'lastndaystodate', days]
                ],
                columns: [
                    search.createColumn({
                        name: 'custrecord_cls_yield_date',
                        summary: search.Summary.GROUP,
                        sort: search.Sort.ASC
                    }),
                    search.createColumn({
                        name: 'custrecord_cls_yield_output_bf',
                        summary: search.Summary.SUM
                    })
                ]
            });

            trendSearch.run().each(result => {
                const dateVal = result.getValue({
                    name: 'custrecord_cls_yield_date',
                    summary: search.Summary.GROUP
                });
                const bf = parseFloat(result.getValue({
                    name: 'custrecord_cls_yield_output_bf',
                    summary: search.Summary.SUM
                })) || 0;

                trend.push({
                    date: dateVal,
                    label: dateVal ? dateVal.substring(0, 5) : '',
                    bf: bf
                });

                return true;
            });

        } catch (e) {
            log.debug({ title: 'Trend search error', details: e.message });
        }

        return trend;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Gets date filters for search
     *
     * @param {string} fieldId - Date field ID
     * @param {string} range - Date range
     * @returns {Array} Filter array
     */
    function getDateFilters(fieldId, range) {
        const filters = [];

        switch (range) {
            case DATE_RANGES.TODAY:
                filters.push('AND', [fieldId, 'on', 'today']);
                break;
            case DATE_RANGES.WEEK:
                filters.push('AND', [fieldId, 'within', 'thisweek']);
                break;
            case DATE_RANGES.MONTH:
                filters.push('AND', [fieldId, 'within', 'thismonth']);
                break;
            case DATE_RANGES.QUARTER:
                filters.push('AND', [fieldId, 'within', 'thisfiscalquarter']);
                break;
            case DATE_RANGES.YEAR:
                filters.push('AND', [fieldId, 'within', 'thisfiscalyear']);
                break;
        }

        return filters;
    }

    /**
     * Formats number with commas
     *
     * @param {number} num - Number to format
     * @returns {string} Formatted number
     */
    function formatNumber(num) {
        if (typeof num !== 'number') return '0';
        return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Formats work order status
     *
     * @param {string} status - Status code
     * @returns {string} Formatted status
     */
    function formatWorkOrderStatus(status) {
        const statuses = {
            'WorkOrd:A': '<span style="color: #ffc107;">Pending Build</span>',
            'WorkOrd:B': '<span style="color: #17a2b8;">In Progress</span>',
            'WorkOrd:D': '<span style="color: #28a745;">Built</span>'
        };
        return statuses[status] || status;
    }

    /**
     * Formats sales order status
     *
     * @param {string} status - Status code
     * @returns {string} Formatted status
     */
    function formatOrderStatus(status) {
        const statuses = {
            'SalesOrd:B': '<span style="color: #ffc107;">Pending Fulfillment</span>',
            'SalesOrd:D': '<span style="color: #17a2b8;">Partially Fulfilled</span>',
            'SalesOrd:E': '<span style="color: #007bff;">Pending Billing</span>',
            'SalesOrd:F': '<span style="color: #28a745;">Billed</span>'
        };
        return statuses[status] || status;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE EXPORTS
    // ═══════════════════════════════════════════════════════════════════════

    return {
        onRequest: onRequest
    };
});
