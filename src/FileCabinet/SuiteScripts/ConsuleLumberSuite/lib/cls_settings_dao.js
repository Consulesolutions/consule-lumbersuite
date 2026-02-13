/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module cls_settings_dao
 *
 * Consule LumberSuite™ - Settings Data Access Object
 * Manages the singleton CLS Settings record with caching for performance
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    'N/record',
    'N/search',
    'N/cache',
    'N/runtime',
    './cls_constants'
], (record, search, cache, runtime, Constants) => {

    const RECORD_TYPE = Constants.RECORD_TYPES.SETTINGS;
    const FIELDS = Constants.SETTINGS_FIELDS;
    const CACHE_NAME = Constants.CACHE_CONFIG.SETTINGS_CACHE_NAME;
    const CACHE_KEY = Constants.CACHE_CONFIG.SETTINGS_CACHE_KEY;
    const CACHE_TTL = Constants.CACHE_CONFIG.SETTINGS_CACHE_TTL;

    // In-memory cache for current execution context
    let memoryCache = null;

    /**
     * Get or create the singleton settings record internal ID
     * @returns {number|null} Settings record internal ID
     */
    const getSettingsRecordId = () => {
        try {
            const searchObj = search.create({
                type: RECORD_TYPE,
                filters: [],
                columns: ['internalid']
            });

            let settingsId = null;
            searchObj.run().each((result) => {
                settingsId = parseInt(result.id, 10);
                return false; // Only need first record
            });

            return settingsId;
        } catch (e) {
            log.error({
                title: 'CLS Settings DAO - getSettingsRecordId',
                details: e.message
            });
            return null;
        }
    };

    /**
     * Create the singleton settings record if it doesn't exist
     * @returns {number} New settings record internal ID
     */
    const createSettingsRecord = () => {
        try {
            const newSettings = record.create({
                type: RECORD_TYPE,
                isDynamic: true
            });

            // Set default values
            newSettings.setValue({ fieldId: FIELDS.NAME, value: 'LumberSuite Settings' });
            newSettings.setValue({ fieldId: FIELDS.ENABLE_DYNAMIC_UOM, value: true });
            newSettings.setValue({ fieldId: FIELDS.DEFAULT_YIELD, value: Constants.DEFAULTS.YIELD_PCT });
            newSettings.setValue({ fieldId: FIELDS.DEFAULT_WASTE, value: Constants.DEFAULTS.WASTE_PCT });
            newSettings.setValue({ fieldId: FIELDS.BF_PRECISION, value: Constants.DEFAULTS.BF_PRECISION });

            const settingsId = newSettings.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });

            log.audit({
                title: 'CLS Settings DAO',
                details: `Created new settings record with ID: ${settingsId}`
            });

            return settingsId;
        } catch (e) {
            log.error({
                title: 'CLS Settings DAO - createSettingsRecord',
                details: e.message
            });
            throw e;
        }
    };

    /**
     * Load all settings values from the database
     * @returns {Object} Settings object with all field values
     */
    const loadSettingsFromDB = () => {
        let settingsId = getSettingsRecordId();

        if (!settingsId) {
            settingsId = createSettingsRecord();
        }

        try {
            const settingsRecord = record.load({
                type: RECORD_TYPE,
                id: settingsId
            });

            const settings = {
                _internalId: settingsId,
                _loadedAt: new Date().toISOString()
            };

            // Load all settings fields
            Object.keys(FIELDS).forEach((key) => {
                const fieldId = FIELDS[key];
                settings[key] = settingsRecord.getValue({ fieldId });
            });

            return settings;
        } catch (e) {
            log.error({
                title: 'CLS Settings DAO - loadSettingsFromDB',
                details: e.message
            });

            // Return defaults on error
            return getDefaultSettings();
        }
    };

    /**
     * Get default settings values
     * @returns {Object} Default settings object
     */
    const getDefaultSettings = () => {
        return {
            _internalId: null,
            _loadedAt: new Date().toISOString(),
            ENABLE_YIELD: false,
            ENABLE_WASTE: false,
            ENABLE_TALLY: false,
            ENABLE_REPACK: false,
            ENABLE_DYNAMIC_UOM: true,
            ENABLE_GRADE: false,
            ENABLE_MOISTURE: false,
            ALLOW_WO_OVERRIDE: false,
            ENABLE_ADV_REPORT: false,
            DEFAULT_YIELD: Constants.DEFAULTS.YIELD_PCT,
            DEFAULT_WASTE: Constants.DEFAULTS.WASTE_PCT,
            BF_PRECISION: Constants.DEFAULTS.BF_PRECISION,
            ENFORCE_TALLY_FIFO: true,
            AUTO_CREATE_TALLY: false,
            REQUIRE_DIMENSIONS: false
        };
    };

    /**
     * Get cached settings - checks memory cache, then application cache, then database
     * @returns {Object} Settings object
     */
    const getSettings = () => {
        // Check memory cache first (fastest)
        if (memoryCache) {
            return memoryCache;
        }

        try {
            // Try application cache
            const appCache = cache.getCache({ name: CACHE_NAME });
            const cachedValue = appCache.get({
                key: CACHE_KEY,
                loader: () => JSON.stringify(loadSettingsFromDB()),
                ttl: CACHE_TTL
            });

            memoryCache = JSON.parse(cachedValue);
            return memoryCache;
        } catch (e) {
            log.debug({
                title: 'CLS Settings DAO - Cache Miss',
                details: 'Loading settings from database'
            });

            // Fallback to direct database load
            const settings = loadSettingsFromDB();
            memoryCache = settings;
            return settings;
        }
    };

    /**
     * Clear all settings caches
     * Should be called after settings are updated
     */
    const clearCache = () => {
        // Clear memory cache
        memoryCache = null;

        try {
            // Clear application cache
            const appCache = cache.getCache({ name: CACHE_NAME });
            appCache.remove({ key: CACHE_KEY });

            log.debug({
                title: 'CLS Settings DAO',
                details: 'Settings cache cleared'
            });
        } catch (e) {
            // Cache may not exist yet
            log.debug({
                title: 'CLS Settings DAO - clearCache',
                details: 'Cache did not exist or could not be cleared'
            });
        }
    };

    /**
     * Update a specific setting value
     * @param {string} fieldId - The field ID to update
     * @param {*} value - The new value
     * @returns {boolean} Success status
     */
    const updateSetting = (fieldId, value) => {
        const settingsId = getSettingsRecordId();

        if (!settingsId) {
            log.error({
                title: 'CLS Settings DAO - updateSetting',
                details: 'Settings record not found'
            });
            return false;
        }

        try {
            record.submitFields({
                type: RECORD_TYPE,
                id: settingsId,
                values: {
                    [fieldId]: value
                }
            });

            clearCache();
            return true;
        } catch (e) {
            log.error({
                title: 'CLS Settings DAO - updateSetting',
                details: e.message
            });
            return false;
        }
    };

    /**
     * Update multiple settings at once
     * @param {Object} values - Object with fieldId: value pairs
     * @returns {boolean} Success status
     */
    const updateSettings = (values) => {
        const settingsId = getSettingsRecordId();

        if (!settingsId) {
            log.error({
                title: 'CLS Settings DAO - updateSettings',
                details: 'Settings record not found'
            });
            return false;
        }

        try {
            record.submitFields({
                type: RECORD_TYPE,
                id: settingsId,
                values: values
            });

            clearCache();
            return true;
        } catch (e) {
            log.error({
                title: 'CLS Settings DAO - updateSettings',
                details: e.message
            });
            return false;
        }
    };

    // ============================================
    // Feature Check Convenience Methods
    // ============================================

    /**
     * Check if Yield Tracking is enabled
     * @returns {boolean}
     */
    const isYieldEnabled = () => {
        return getSettings().ENABLE_YIELD === true;
    };

    /**
     * Check if Waste Tracking is enabled
     * @returns {boolean}
     */
    const isWasteEnabled = () => {
        return getSettings().ENABLE_WASTE === true;
    };

    /**
     * Check if Tally Sheets are enabled
     * @returns {boolean}
     */
    const isTallyEnabled = () => {
        return getSettings().ENABLE_TALLY === true;
    };

    /**
     * Check if Repack Module is enabled
     * @returns {boolean}
     */
    const isRepackEnabled = () => {
        return getSettings().ENABLE_REPACK === true;
    };

    /**
     * Check if Dynamic UOM Engine is enabled
     * Defaults to true if not explicitly disabled
     * @returns {boolean}
     */
    const isDynamicUomEnabled = () => {
        const settings = getSettings();
        return settings.ENABLE_DYNAMIC_UOM !== false;
    };

    /**
     * Check if Grade Tracking is enabled
     * @returns {boolean}
     */
    const isGradeEnabled = () => {
        return getSettings().ENABLE_GRADE === true;
    };

    /**
     * Check if Moisture Tracking is enabled
     * @returns {boolean}
     */
    const isMoistureEnabled = () => {
        return getSettings().ENABLE_MOISTURE === true;
    };

    /**
     * Check if WO BF Override is allowed
     * @returns {boolean}
     */
    const isWoOverrideAllowed = () => {
        return getSettings().ALLOW_WO_OVERRIDE === true;
    };

    /**
     * Check if Advanced Reporting is enabled
     * @returns {boolean}
     */
    const isAdvReportingEnabled = () => {
        return getSettings().ENABLE_ADV_REPORT === true;
    };

    /**
     * Check if Margin Analysis is enabled
     * Uses Advanced Reporting setting as this is a sub-feature
     * @returns {boolean}
     */
    const isMarginAnalysisEnabled = () => {
        return isAdvReportingEnabled();
    };

    /**
     * Check if Feature is enabled (generic checker)
     * @param {string} featureName - Feature name
     * @returns {boolean}
     */
    const isFeatureEnabled = (featureName) => {
        switch (featureName.toLowerCase()) {
            case 'yield': return isYieldEnabled();
            case 'waste': return isWasteEnabled();
            case 'tally': return isTallyEnabled();
            case 'repack': return isRepackEnabled();
            case 'dynamic_uom': return isDynamicUomEnabled();
            case 'grade': return isGradeEnabled();
            case 'moisture': return isMoistureEnabled();
            case 'margin_analysis': return isMarginAnalysisEnabled();
            case 'adv_report': return isAdvReportingEnabled();
            default: return false;
        }
    };

    /**
     * Check if Tally FIFO is enforced
     * @returns {boolean}
     */
    const isTallyFifoEnforced = () => {
        const settings = getSettings();
        return settings.ENFORCE_TALLY_FIFO !== false; // Default true
    };

    /**
     * Check if auto-create tally on receipt is enabled
     * @returns {boolean}
     */
    const isAutoCreateTallyEnabled = () => {
        return getSettings().AUTO_CREATE_TALLY === true;
    };

    /**
     * Check if dimensions are required
     * @returns {boolean}
     */
    const areDimensionsRequired = () => {
        return getSettings().REQUIRE_DIMENSIONS === true;
    };

    // ============================================
    // Default Value Getters
    // ============================================

    /**
     * Get the default yield percentage
     * @returns {number} Yield percentage (0-100)
     */
    const getDefaultYield = () => {
        const settings = getSettings();
        const value = parseFloat(settings.DEFAULT_YIELD);
        return isNaN(value) ? Constants.DEFAULTS.YIELD_PCT : value;
    };

    /**
     * Get the default waste percentage
     * @returns {number} Waste percentage (0-100)
     */
    const getDefaultWaste = () => {
        const settings = getSettings();
        const value = parseFloat(settings.DEFAULT_WASTE);
        return isNaN(value) ? Constants.DEFAULTS.WASTE_PCT : value;
    };

    /**
     * Get the BF decimal precision
     * @returns {number} Number of decimal places
     */
    const getBFPrecision = () => {
        const settings = getSettings();
        const value = parseInt(settings.BF_PRECISION, 10);
        return isNaN(value) ? Constants.DEFAULTS.BF_PRECISION : value;
    };

    /**
     * Get the default yield percentage (alias for getDefaultYield)
     * @returns {number} Yield percentage (0-100)
     */
    const getDefaultYieldPercentage = () => {
        return getDefaultYield();
    };

    /**
     * Get admin email for notifications
     * @returns {string|null} Admin email address
     */
    const getAdminEmail = () => {
        const settings = getSettings();
        return settings.ADMIN_EMAIL || null;
    };

    /**
     * Check if auto-correct is enabled for yield calculations
     * @returns {boolean}
     */
    const isAutoCorrectEnabled = () => {
        // Default to true for automatic corrections
        return true;
    };

    /**
     * Check if consumption logging is enabled
     * Uses yield tracking as the indicator
     * @returns {boolean}
     */
    const isConsumptionLogEnabled = () => {
        return isYieldEnabled();
    };

    // ============================================
    // Module Status Check
    // ============================================

    /**
     * Get an object showing which modules are enabled
     * Useful for logging and debugging
     * @returns {Object} Module status object
     */
    const getModuleStatus = () => {
        return {
            yieldTracking: isYieldEnabled(),
            wasteTracking: isWasteEnabled(),
            tallySheets: isTallyEnabled(),
            repackModule: isRepackEnabled(),
            dynamicUom: isDynamicUomEnabled(),
            gradeTracking: isGradeEnabled(),
            moistureTracking: isMoistureEnabled(),
            woOverride: isWoOverrideAllowed(),
            advancedReporting: isAdvReportingEnabled()
        };
    };

    /**
     * Check if any optional modules are enabled
     * @returns {boolean}
     */
    const hasOptionalModules = () => {
        return isYieldEnabled() ||
               isWasteEnabled() ||
               isTallyEnabled() ||
               isRepackEnabled() ||
               isGradeEnabled() ||
               isMoistureEnabled();
    };

    /**
     * Validate module dependencies
     * @returns {Object} Validation result with isValid and messages
     */
    const validateDependencies = () => {
        const messages = [];
        let isValid = true;

        // Waste tracking requires yield tracking
        if (isWasteEnabled() && !isYieldEnabled()) {
            messages.push('Waste Tracking requires Yield Tracking to be enabled.');
            isValid = false;
        }

        // Repack module requires tally sheets
        if (isRepackEnabled() && !isTallyEnabled()) {
            messages.push('Repack Module requires Tally Sheets to be enabled.');
            isValid = false;
        }

        return {
            isValid,
            messages
        };
    };

    return {
        // Core CRUD
        getSettingsRecordId,
        getSettings,
        clearCache,
        updateSetting,
        updateSettings,

        // Feature checks
        isYieldEnabled,
        isWasteEnabled,
        isTallyEnabled,
        isRepackEnabled,
        isDynamicUomEnabled,
        isGradeEnabled,
        isMoistureEnabled,
        isWoOverrideAllowed,
        isAdvReportingEnabled,
        isMarginAnalysisEnabled,
        isFeatureEnabled,
        isTallyFifoEnforced,
        isAutoCreateTallyEnabled,
        areDimensionsRequired,

        // Default values
        getDefaultYield,
        getDefaultYieldPercentage,
        getDefaultWaste,
        getBFPrecision,
        getAdminEmail,
        isAutoCorrectEnabled,
        isConsumptionLogEnabled,

        // Status and validation
        getModuleStatus,
        hasOptionalModules,
        validateDependencies
    };
});
