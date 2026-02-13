/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module cls_constants
 *
 * Consule LumberSuite™ - Constants Module
 * Central repository for all constant values, field IDs, and configuration
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([], () => {

    /**
     * Unit of Measure codes used throughout the system
     * All inventory is stored in BF (Board Feet)
     * These codes are used for display/selling UOM conversion
     */
    const UOM_CODES = {
        BOARD_FEET: 'BF',
        LINEAR_FEET: 'LF',
        SQUARE_FEET: 'SF',
        MBF: 'MBF',             // Thousand Board Feet
        MSF: 'MSF',             // Thousand Square Feet
        EACH: 'EACH',
        BUNDLE: 'BUNDLE'
    };

    /**
     * UOM display names for UI labels
     */
    const UOM_LABELS = {
        BF: 'Board Feet',
        LF: 'Linear Feet',
        SF: 'Square Feet',
        MBF: 'Thousand Board Feet',
        MSF: 'Thousand Square Feet',
        EACH: 'Each',
        BUNDLE: 'Bundle'
    };

    /**
     * Custom Record Type IDs
     */
    const RECORD_TYPES = {
        SETTINGS: 'customrecord_cls_settings',
        SPECIES: 'customrecord_cls_species',
        GRADE: 'customrecord_cls_grade',
        UOM_TYPE: 'customrecord_cls_uom_type',
        TALLY_SHEET: 'customrecord_cls_tally',
        TALLY_ALLOCATION: 'customrecord_cls_tally_alloc',
        YIELD_REGISTER: 'customrecord_cls_yield_reg',
        CONSUMPTION_LOG: 'customrecord_cls_consumption',
        REPACK_ORDER: 'customrecord_cls_repack',
        REPACK_OUTPUT: 'customrecord_cls_repack_out',
        WASTE_REASON: 'customrecord_cls_waste_rsn',
        // Assembly & Multi-output support
        BYPRODUCT: 'customrecord_cls_byproduct',
        PROCESS_TARGET: 'customrecord_cls_process_target'
    };

    /**
     * Custom List IDs
     */
    const LIST_TYPES = {
        PROCESS_TYPE: 'customlist_cls_process_type',
        BYPRODUCT_TYPE: 'customlist_cls_byproduct_type',
        DISPOSITION: 'customlist_cls_disposition',
        ASSEMBLY_TYPE: 'customlist_cls_assembly_type'
    };

    /**
     * Custom Item Field IDs
     */
    const ITEM_FIELDS = {
        IS_LUMBER: 'custitem_cls_is_lumber',
        SPECIES: 'custitem_cls_species',
        GRADE: 'custitem_cls_grade',
        NOMINAL_THICKNESS: 'custitem_cls_nominal_thickness',
        NOMINAL_WIDTH: 'custitem_cls_nominal_width',
        NOMINAL_LENGTH: 'custitem_cls_nominal_length',
        BASE_BF_COST: 'custitem_cls_base_bf_cost',
        ALLOW_DYNAMIC_DIMS: 'custitem_cls_allow_dynamic_dims',
        DEFAULT_YIELD_PCT: 'custitem_cls_default_yield_pct',
        DEFAULT_WASTE_PCT: 'custitem_cls_default_waste_pct',
        PIECES_PER_BUNDLE: 'custitem_cls_pieces_per_bundle'
    };

    /**
     * Transaction Body Field IDs
     */
    const BODY_FIELDS = {
        TOTAL_BF: 'custbody_cls_total_bf',
        CONVERSION_LOCKED: 'custbody_cls_conversion_locked',
        LINKED_TALLY: 'custbody_cls_linked_tally',
        TOTAL_THEORETICAL_BF: 'custbody_cls_total_theoretical_bf',
        TOTAL_WASTE_BF: 'custbody_cls_total_waste_bf',
        // Assembly & Multi-output fields
        PROCESS_TYPE: 'custbody_cls_process_type',
        ASSEMBLY_TYPE: 'custbody_cls_assembly_type',
        EXPECTED_BYPRODUCTS: 'custbody_cls_expected_byproducts',
        TARGET_YIELD: 'custbody_cls_target_yield'
    };

    /**
     * Transaction Column (Line) Field IDs
     */
    const LINE_FIELDS = {
        SELLING_UOM: 'custcol_cls_selling_uom',
        DISPLAY_QTY: 'custcol_cls_display_qty',
        DIM_THICKNESS: 'custcol_cls_dim_thickness',
        DIM_WIDTH: 'custcol_cls_dim_width',
        DIM_LENGTH: 'custcol_cls_dim_length',
        CALCULATED_BF: 'custcol_cls_calculated_bf',
        CONVERSION_FACTOR: 'custcol_cls_conversion_factor',
        BF_UNIT_COST: 'custcol_cls_bf_unit_cost',
        EXTENDED_BF_COST: 'custcol_cls_extended_bf_cost',
        GRADE_OVERRIDE: 'custcol_cls_grade_override',
        TALLY_ALLOCATION: 'custcol_cls_tally_allocation',
        THEORETICAL_BF: 'custcol_cls_theoretical_bf',
        ACTUAL_BF: 'custcol_cls_actual_bf',
        WASTE_BF: 'custcol_cls_waste_bf',
        YIELD_PCT: 'custcol_cls_yield_pct',
        WASTE_REASON: 'custcol_cls_waste_reason',
        MOISTURE_PCT: 'custcol_cls_moisture_pct',
        PIECES_COUNT: 'custcol_cls_pieces_count'
    };

    /**
     * CLS Settings Record Field IDs
     */
    const SETTINGS_FIELDS = {
        NAME: 'name',
        ENABLE_YIELD: 'custrecord_cls_enable_yield',
        ENABLE_WASTE: 'custrecord_cls_enable_waste',
        ENABLE_TALLY: 'custrecord_cls_enable_tally',
        ENABLE_REPACK: 'custrecord_cls_enable_repack',
        ENABLE_DYNAMIC_UOM: 'custrecord_cls_enable_dynamic_uom',
        ENABLE_GRADE: 'custrecord_cls_enable_grade',
        ENABLE_MOISTURE: 'custrecord_cls_enable_moisture',
        ALLOW_WO_OVERRIDE: 'custrecord_cls_allow_wo_override',
        ENABLE_ADV_REPORT: 'custrecord_cls_enable_adv_report',
        DEFAULT_YIELD: 'custrecord_cls_default_yield',
        DEFAULT_WASTE: 'custrecord_cls_default_waste',
        BF_PRECISION: 'custrecord_cls_bf_precision',
        ENFORCE_TALLY_FIFO: 'custrecord_cls_enforce_tally_fifo',
        AUTO_CREATE_TALLY: 'custrecord_cls_auto_create_tally',
        REQUIRE_DIMENSIONS: 'custrecord_cls_require_dimensions'
    };

    /**
     * CLS Species Record Field IDs
     */
    const SPECIES_FIELDS = {
        NAME: 'name',
        CODE: 'custrecord_cls_species_code',
        DENSITY_FACTOR: 'custrecord_cls_species_density',
        IS_HARDWOOD: 'custrecord_cls_species_hardwood',
        IS_INACTIVE: 'isinactive',
        DESCRIPTION: 'custrecord_cls_species_desc'
    };

    /**
     * CLS Grade Record Field IDs
     */
    const GRADE_FIELDS = {
        NAME: 'name',
        CODE: 'custrecord_cls_grade_code',
        PRICE_MODIFIER: 'custrecord_cls_grade_price_mod',
        SORT_ORDER: 'custrecord_cls_grade_sort',
        IS_INACTIVE: 'isinactive',
        DESCRIPTION: 'custrecord_cls_grade_desc'
    };

    /**
     * CLS Tally Sheet Record Field IDs
     */
    const TALLY_FIELDS = {
        TALLY_NUMBER: 'name',
        ITEM: 'custrecord_cls_tally_item',
        VENDOR: 'custrecord_cls_tally_vendor',
        ITEM_RECEIPT: 'custrecord_cls_tally_item_receipt',
        VENDOR_LOT: 'custrecord_cls_tally_vendor_lot',
        BUNDLE_ID: 'custrecord_cls_tally_bundle_id',
        MOISTURE_PCT: 'custrecord_cls_tally_moisture',
        GRADE: 'custrecord_cls_tally_grade',
        ORIGIN: 'custrecord_cls_tally_origin',
        RECEIVED_BF: 'custrecord_cls_tally_received_bf',
        REMAINING_BF: 'custrecord_cls_tally_remaining_bf',
        RECEIVED_DATE: 'custrecord_cls_tally_received_date',
        LOCATION: 'custrecord_cls_tally_location',
        SUBSIDIARY: 'custrecord_cls_tally_subsidiary',
        STATUS: 'custrecord_cls_tally_status',
        NOTES: 'custrecord_cls_tally_notes',
        THICKNESS: 'custrecord_cls_tally_thickness',
        WIDTH: 'custrecord_cls_tally_width',
        LENGTH: 'custrecord_cls_tally_length',
        PIECES: 'custrecord_cls_tally_pieces'
    };

    /**
     * CLS Tally Allocation Record Field IDs
     */
    const TALLY_ALLOC_FIELDS = {
        TALLY_SHEET: 'custrecord_cls_talloc_tally',
        WORK_ORDER: 'custrecord_cls_talloc_wo',
        ALLOCATED_BF: 'custrecord_cls_talloc_allocated_bf',
        CONSUMED_BF: 'custrecord_cls_talloc_consumed_bf',
        ALLOCATION_DATE: 'custrecord_cls_talloc_alloc_date',
        CONSUMPTION_DATE: 'custrecord_cls_talloc_consume_date',
        STATUS: 'custrecord_cls_talloc_status',
        LINE_NUMBER: 'custrecord_cls_talloc_line_num'
    };

    /**
     * CLS Yield Register Record Field IDs
     */
    const YIELD_FIELDS = {
        WORK_ORDER: 'custrecord_cls_yield_wo',
        WO_COMPLETION: 'custrecord_cls_yield_woc',
        ITEM: 'custrecord_cls_yield_item',
        THEORETICAL_BF: 'custrecord_cls_yield_theoretical',
        ACTUAL_BF: 'custrecord_cls_yield_actual',
        WASTE_BF: 'custrecord_cls_yield_waste',
        RECOVERY_PCT: 'custrecord_cls_yield_recovery',
        YIELD_PCT: 'custrecord_cls_yield_pct',
        WASTE_REASON: 'custrecord_cls_yield_waste_reason',
        OPERATOR: 'custrecord_cls_yield_operator',
        COMPLETION_DATE: 'custrecord_cls_yield_date',
        SUBSIDIARY: 'custrecord_cls_yield_subsidiary',
        LOCATION: 'custrecord_cls_yield_location',
        NOTES: 'custrecord_cls_yield_notes'
    };

    /**
     * CLS Consumption Log Record Field IDs
     */
    const CONSUMPTION_FIELDS = {
        SOURCE_TRANSACTION: 'custrecord_cls_cons_source_txn',
        SOURCE_TYPE: 'custrecord_cls_cons_source_type',
        SOURCE_LINE: 'custrecord_cls_cons_source_line',
        ITEM: 'custrecord_cls_cons_item',
        SELLING_UOM: 'custrecord_cls_cons_selling_uom',
        DISPLAY_QTY: 'custrecord_cls_cons_display_qty',
        CALCULATED_BF: 'custrecord_cls_cons_calculated_bf',
        CONVERSION_FACTOR: 'custrecord_cls_cons_conv_factor',
        DIM_THICKNESS: 'custrecord_cls_cons_thickness',
        DIM_WIDTH: 'custrecord_cls_cons_width',
        DIM_LENGTH: 'custrecord_cls_cons_length',
        TRANSACTION_DATE: 'custrecord_cls_cons_txn_date',
        CREATED_BY: 'custrecord_cls_cons_created_by',
        SUBSIDIARY: 'custrecord_cls_cons_subsidiary'
    };

    /**
     * CLS Repack Order Record Field IDs
     */
    const REPACK_FIELDS = {
        REPACK_NUMBER: 'name',
        STATUS: 'custrecord_cls_repack_status',
        SOURCE_ITEM: 'custrecord_cls_repack_source_item',
        SOURCE_BF: 'custrecord_cls_repack_source_bf',
        SOURCE_TALLY: 'custrecord_cls_repack_source_tally',
        LOCATION: 'custrecord_cls_repack_location',
        SUBSIDIARY: 'custrecord_cls_repack_subsidiary',
        COMPLETION_DATE: 'custrecord_cls_repack_complete_date',
        NOTES: 'custrecord_cls_repack_notes',
        YIELD_BF: 'custrecord_cls_repack_yield_bf',
        WASTE_BF: 'custrecord_cls_repack_waste_bf'
    };

    /**
     * CLS Repack Output Record Field IDs
     */
    const REPACK_OUTPUT_FIELDS = {
        REPACK_ORDER: 'custrecord_cls_repout_order',
        OUTPUT_ITEM: 'custrecord_cls_repout_item',
        OUTPUT_BF: 'custrecord_cls_repout_bf',
        OUTPUT_QTY: 'custrecord_cls_repout_qty',
        NEW_TALLY: 'custrecord_cls_repout_new_tally'
    };

    /**
     * CLS Waste Reason Record Field IDs
     */
    const WASTE_REASON_FIELDS = {
        NAME: 'name',
        CODE: 'custrecord_cls_wrsn_code',
        IS_RECOVERABLE: 'custrecord_cls_wrsn_recoverable',
        DEFAULT_RECOVERY_PCT: 'custrecord_cls_wrsn_recovery_pct',
        IS_INACTIVE: 'isinactive'
    };

    /**
     * CLS By-product Record Field IDs
     */
    const BYPRODUCT_FIELDS = {
        SOURCE_WO: 'custrecord_cls_byp_source_wo',
        SOURCE_ITEM: 'custrecord_cls_byp_source_item',
        OUTPUT_ITEM: 'custrecord_cls_byp_output_item',
        QUANTITY: 'custrecord_cls_byp_quantity',
        BOARD_FEET: 'custrecord_cls_byp_bf',
        TYPE: 'custrecord_cls_byp_type',
        DISPOSITION: 'custrecord_cls_byp_disposition',
        CREATED_TALLY: 'custrecord_cls_byp_tally',
        DATE: 'custrecord_cls_byp_date',
        LOCATION: 'custrecord_cls_byp_location',
        NOTES: 'custrecord_cls_byp_notes'
    };

    /**
     * CLS Process Target Record Field IDs
     */
    const PROCESS_TARGET_FIELDS = {
        PROCESS_TYPE: 'custrecord_cls_pt_process_type',
        SPECIES: 'custrecord_cls_pt_species',
        TARGET_YIELD: 'custrecord_cls_pt_target_yield',
        MIN_YIELD: 'custrecord_cls_pt_min_yield',
        KERF_LOSS: 'custrecord_cls_pt_kerf_loss',
        SHRINKAGE: 'custrecord_cls_pt_shrinkage',
        DEFECT_RATE: 'custrecord_cls_pt_defect_rate',
        NOTES: 'custrecord_cls_pt_notes'
    };

    /**
     * Process Type Values (from customlist_cls_process_type)
     */
    const PROCESS_TYPES = {
        SURFACING: 'val_surface',
        RIPPING: 'val_rip',
        CROSSCUTTING: 'val_crosscut',
        RESAWING: 'val_resaw',
        GLUEUP: 'val_glueup',
        MOULDING: 'val_moulding',
        KILN_DRYING: 'val_drying',
        TREATMENT: 'val_treatment'
    };

    /**
     * Assembly Type Values (from customlist_cls_assembly_type)
     */
    const ASSEMBLY_TYPES = {
        ROUGH_TO_FINISHED: 'val_rough_finish',
        CUTTING: 'val_cutting',
        GLUEUP_PANEL: 'val_glueup',
        DIMENSION_STOCK: 'val_dimension',
        REMANUFACTURE: 'val_remanufacture',
        TREATMENT_DRYING: 'val_treatment'
    };

    /**
     * By-product Type Values (from customlist_cls_byproduct_type)
     */
    const BYPRODUCT_TYPES = {
        SHORTS: 'val_shorts',
        EDGINGS: 'val_edgings',
        CHIPS: 'val_chips',
        SAWDUST: 'val_sawdust',
        SHAVINGS: 'val_shavings',
        BARK: 'val_bark',
        OFFCUTS: 'val_offcuts',
        DOWNGRADE: 'val_downgrade'
    };

    /**
     * Disposition Values (from customlist_cls_disposition)
     */
    const DISPOSITION_TYPES = {
        INVENTORY: 'val_inventory',
        SELL: 'val_sell',
        REPROCESS: 'val_reprocess',
        FUEL: 'val_fuel',
        MULCH: 'val_mulch',
        DISPOSE: 'val_dispose'
    };

    /**
     * Tally Sheet Status Values
     */
    const TALLY_STATUS = {
        OPEN: '1',
        ALLOCATED: '2',
        CONSUMED: '3',
        CLOSED: '4'
    };

    /**
     * Tally Status Labels
     */
    const TALLY_STATUS_LABELS = {
        '1': 'Open',
        '2': 'Allocated',
        '3': 'Consumed',
        '4': 'Closed'
    };

    /**
     * Tally Allocation Status Values
     */
    const TALLY_ALLOC_STATUS = {
        ALLOCATED: '1',
        CONSUMED: '2',
        RELEASED: '3'
    };

    /**
     * Repack Order Status Values
     */
    const REPACK_STATUS = {
        PENDING: '1',
        IN_PROGRESS: '2',
        COMPLETE: '3',
        CANCELLED: '4'
    };

    /**
     * Repack Status Labels
     */
    const REPACK_STATUS_LABELS = {
        '1': 'Pending',
        '2': 'In Progress',
        '3': 'Complete',
        '4': 'Cancelled'
    };

    /**
     * Transaction Source Types for Consumption Log
     */
    const SOURCE_TYPES = {
        ESTIMATE: 'EST',
        SALES_ORDER: 'SO',
        WORK_ORDER: 'WO',
        ITEM_FULFILLMENT: 'IF',
        INVOICE: 'INV'
    };

    /**
     * Script IDs
     */
    const SCRIPTS = {
        // User Events
        SETTINGS_UE: 'customscript_cls_settings_ue',
        ESTIMATE_UE: 'customscript_cls_estimate_ue',
        SALESORDER_UE: 'customscript_cls_salesorder_ue',
        WORKORDER_UE: 'customscript_cls_workorder_ue',
        WO_COMPLETION_UE: 'customscript_cls_woc_ue',
        ITEM_FULFILLMENT_UE: 'customscript_cls_if_ue',
        ITEM_RECEIPT_UE: 'customscript_cls_ir_ue',
        TALLY_UE: 'customscript_cls_tally_ue',
        YIELD_UE: 'customscript_cls_yield_ue',
        REPACK_UE: 'customscript_cls_repack_ue',

        // Client Scripts
        SETTINGS_CS: 'customscript_cls_settings_cs',
        ESTIMATE_CS: 'customscript_cls_estimate_cs',
        SALESORDER_CS: 'customscript_cls_salesorder_cs',
        WORKORDER_CS: 'customscript_cls_workorder_cs',
        WO_COMPLETION_CS: 'customscript_cls_woc_cs',
        TALLY_CS: 'customscript_cls_tally_cs',
        REPACK_CS: 'customscript_cls_repack_cs',

        // Map/Reduce
        WO_CONSUMPTION_MR: 'customscript_cls_wo_consumption_mr',
        REPACK_PROCESSOR_MR: 'customscript_cls_repack_mr',
        BF_AGING_MR: 'customscript_cls_bf_aging_mr',

        // Suitelets
        SETTINGS_SL: 'customscript_cls_settings_sl',
        TALLY_SEARCH_SL: 'customscript_cls_tally_search_sl',
        YIELD_REPORT_SL: 'customscript_cls_yield_report_sl',
        REPACK_SL: 'customscript_cls_repack_sl',
        MARGIN_ANALYSIS_SL: 'customscript_cls_margin_sl'
    };

    /**
     * Deployment IDs
     */
    const DEPLOYMENTS = {
        SETTINGS_UE: 'customdeploy_cls_settings_ue',
        ESTIMATE_UE: 'customdeploy_cls_estimate_ue',
        SALESORDER_UE: 'customdeploy_cls_salesorder_ue',
        WORKORDER_UE: 'customdeploy_cls_workorder_ue'
    };

    /**
     * Saved Search IDs
     */
    const SAVED_SEARCHES = {
        BF_CONSUMPTION: 'customsearch_cls_bf_consumption',
        YIELD_ANALYSIS: 'customsearch_cls_yield_analysis',
        WASTE_SUMMARY: 'customsearch_cls_waste_summary',
        TALLY_AGING: 'customsearch_cls_tally_aging',
        CONVERSION_AUDIT: 'customsearch_cls_conversion_audit',
        MARGIN_BY_UOM: 'customsearch_cls_margin_by_uom',
        SPECIES_USAGE: 'customsearch_cls_species_usage',
        AVAILABLE_TALLIES: 'customsearch_cls_available_tallies'
    };

    /**
     * Cache Configuration
     */
    const CACHE_CONFIG = {
        SETTINGS_CACHE_NAME: 'CLS_SETTINGS_CACHE',
        SETTINGS_CACHE_KEY: 'settings',
        SETTINGS_CACHE_TTL: 300,  // 5 minutes
        SPECIES_CACHE_NAME: 'CLS_SPECIES_CACHE',
        GRADE_CACHE_NAME: 'CLS_GRADE_CACHE',
        UOM_CACHE_NAME: 'CLS_UOM_CACHE'
    };

    /**
     * Default Values
     */
    const DEFAULTS = {
        YIELD_PCT: 95,
        WASTE_PCT: 5,
        BF_PRECISION: 4,
        THICKNESS: 1,      // 1 inch
        WIDTH: 12,         // 12 inches
        LENGTH: 8          // 8 feet
    };

    /**
     * Error Messages
     */
    const ERRORS = {
        MISSING_DIMENSIONS: 'Dimensions (thickness, width, length) are required for BF calculation.',
        INVALID_UOM: 'Invalid or unsupported Unit of Measure code.',
        SETTINGS_NOT_FOUND: 'LumberSuite Settings record not found. Please contact administrator.',
        SETTINGS_EXISTS: 'CLS Settings record already exists. Only one settings record is allowed.',
        INSUFFICIENT_TALLY: 'Insufficient BF available in tally sheets for allocation.',
        ITEM_NOT_LUMBER: 'Selected item is not configured as a lumber item.',
        INVALID_YIELD: 'Yield percentage must be between 0 and 100.',
        INVALID_WASTE: 'Waste percentage must be between 0 and 100.',
        CONVERSION_FAILED: 'UOM conversion failed. Please verify dimensions.',
        TALLY_LOCKED: 'Tally sheet is locked and cannot be modified.',
        REPACK_COMPLETE: 'Repack order is already completed and cannot be modified.'
    };

    /**
     * Success Messages
     */
    const MESSAGES = {
        SETTINGS_SAVED: 'LumberSuite settings saved successfully.',
        CONVERSION_COMPLETE: 'BF conversion calculated successfully.',
        TALLY_CREATED: 'Tally sheet created successfully.',
        ALLOCATION_COMPLETE: 'Tally allocation completed successfully.',
        YIELD_RECORDED: 'Yield register entry recorded.',
        REPACK_COMPLETE: 'Repack order completed successfully.'
    };

    /**
     * Numeric precision for different value types
     */
    const PRECISION = {
        BF: 4,              // Board feet - 4 decimal places
        PERCENTAGE: 2,      // Percentages - 2 decimal places
        CURRENCY: 2,        // Currency values - 2 decimal places
        FACTOR: 6,          // Conversion factors - 6 decimal places
        DIMENSION: 3        // Dimensions - 3 decimal places
    };

    // Combine all field IDs for convenience
    const FIELD_IDS = {
        ...ITEM_FIELDS,
        ...BODY_FIELDS,
        ...LINE_FIELDS
    };

    return {
        // UOM
        UOM_CODES,
        UOM_LABELS,

        // Record Types
        RECORD_TYPES,
        LIST_TYPES,

        // Field Groups
        ITEM_FIELDS,
        BODY_FIELDS,
        LINE_FIELDS,
        FIELD_IDS,
        SETTINGS_FIELDS,
        SPECIES_FIELDS,
        GRADE_FIELDS,
        TALLY_FIELDS,
        TALLY_ALLOC_FIELDS,
        YIELD_FIELDS,
        CONSUMPTION_FIELDS,
        REPACK_FIELDS,
        REPACK_OUTPUT_FIELDS,
        WASTE_REASON_FIELDS,
        BYPRODUCT_FIELDS,
        PROCESS_TARGET_FIELDS,

        // Status Values
        TALLY_STATUS,
        TALLY_STATUS_LABELS,
        TALLY_ALLOC_STATUS,
        REPACK_STATUS,
        REPACK_STATUS_LABELS,
        SOURCE_TYPES,

        // Assembly & Multi-output Types
        PROCESS_TYPES,
        ASSEMBLY_TYPES,
        BYPRODUCT_TYPES,
        DISPOSITION_TYPES,

        // Script & Deployment IDs
        SCRIPTS,
        DEPLOYMENTS,
        SAVED_SEARCHES,

        // Configuration
        CACHE_CONFIG,
        DEFAULTS,
        PRECISION,

        // Messages
        ERRORS,
        MESSAGES
    };
});
