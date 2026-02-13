/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module cls_tally_service
 *
 * Consule LumberSuite™ - Tally Sheet Service
 * Manages tally sheet operations including creation, allocation, and consumption
 *
 * Tally sheets track lumber inventory at the lot/bundle level, enabling:
 * - Vendor lot traceability
 * - FIFO consumption
 * - Moisture and grade tracking
 * - Bundle-level inventory management
 *
 * @copyright Consule LLC
 * @author Consule Development Team
 * @version 1.0.0
 */
define([
    'N/record',
    'N/search',
    'N/format',
    './cls_constants',
    './cls_settings_dao',
    './cls_bf_calculator'
], (record, search, format, Constants, SettingsDAO, BFCalculator) => {

    const RECORD_TYPES = Constants.RECORD_TYPES;
    const TALLY_FIELDS = Constants.TALLY_FIELDS;
    const TALLY_ALLOC_FIELDS = Constants.TALLY_ALLOC_FIELDS;
    const TALLY_STATUS = Constants.TALLY_STATUS;
    const TALLY_ALLOC_STATUS = Constants.TALLY_ALLOC_STATUS;

    /**
     * Check if tally module is enabled
     * @returns {boolean}
     */
    const isEnabled = () => {
        return SettingsDAO.isTallyEnabled();
    };

    /**
     * Create a new tally sheet record
     *
     * @param {Object} params - Tally sheet parameters
     * @param {number} params.itemId - Item internal ID
     * @param {number} params.vendorId - Vendor internal ID
     * @param {number} [params.itemReceiptId] - Item Receipt internal ID
     * @param {string} [params.vendorLot] - Vendor lot number
     * @param {string} [params.bundleId] - Bundle identifier
     * @param {number} [params.moisturePct] - Moisture percentage
     * @param {number} [params.gradeId] - Grade internal ID
     * @param {string} [params.origin] - Origin/source
     * @param {number} params.receivedBF - Received board feet
     * @param {Date} [params.receivedDate] - Receipt date
     * @param {number} params.locationId - Location internal ID
     * @param {number} params.subsidiaryId - Subsidiary internal ID
     * @param {number} [params.thickness] - Thickness in inches
     * @param {number} [params.width] - Width in inches
     * @param {number} [params.length] - Length in feet
     * @param {number} [params.pieces] - Number of pieces
     * @param {string} [params.notes] - Notes
     * @returns {Object} Result with tallyId and tallyNumber
     */
    const createTallySheet = (params) => {
        if (!isEnabled()) {
            return {
                success: false,
                error: 'Tally module is not enabled'
            };
        }

        try {
            const tallyRec = record.create({
                type: RECORD_TYPES.TALLY_SHEET,
                isDynamic: true
            });

            // Required fields
            tallyRec.setValue({ fieldId: TALLY_FIELDS.ITEM, value: params.itemId });
            tallyRec.setValue({ fieldId: TALLY_FIELDS.RECEIVED_BF, value: params.receivedBF });
            tallyRec.setValue({ fieldId: TALLY_FIELDS.REMAINING_BF, value: params.receivedBF });
            tallyRec.setValue({ fieldId: TALLY_FIELDS.LOCATION, value: params.locationId });
            tallyRec.setValue({ fieldId: TALLY_FIELDS.SUBSIDIARY, value: params.subsidiaryId });
            tallyRec.setValue({ fieldId: TALLY_FIELDS.STATUS, value: TALLY_STATUS.OPEN });

            // Optional fields
            if (params.vendorId) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.VENDOR, value: params.vendorId });
            }
            if (params.itemReceiptId) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.ITEM_RECEIPT, value: params.itemReceiptId });
            }
            if (params.vendorLot) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.VENDOR_LOT, value: params.vendorLot });
            }
            if (params.bundleId) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.BUNDLE_ID, value: params.bundleId });
            }
            if (params.moisturePct !== undefined) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.MOISTURE_PCT, value: params.moisturePct });
            }
            if (params.gradeId) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.GRADE, value: params.gradeId });
            }
            if (params.origin) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.ORIGIN, value: params.origin });
            }
            if (params.receivedDate) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.RECEIVED_DATE, value: params.receivedDate });
            } else {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.RECEIVED_DATE, value: new Date() });
            }
            if (params.thickness) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.THICKNESS, value: params.thickness });
            }
            if (params.width) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.WIDTH, value: params.width });
            }
            if (params.length) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.LENGTH, value: params.length });
            }
            if (params.pieces) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.PIECES, value: params.pieces });
            }
            if (params.notes) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.NOTES, value: params.notes });
            }

            const tallyId = tallyRec.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });

            // Get the auto-generated tally number
            const tallyNumber = search.lookupFields({
                type: RECORD_TYPES.TALLY_SHEET,
                id: tallyId,
                columns: [TALLY_FIELDS.TALLY_NUMBER]
            })[TALLY_FIELDS.TALLY_NUMBER];

            log.audit({
                title: 'CLS Tally Service',
                details: `Created tally sheet ${tallyNumber} (ID: ${tallyId})`
            });

            return {
                success: true,
                tallyId: tallyId,
                tallyNumber: tallyNumber
            };

        } catch (e) {
            log.error({
                title: 'CLS Tally Service - createTallySheet',
                details: e.message
            });
            return {
                success: false,
                error: e.message
            };
        }
    };

    /**
     * Find available tally sheets for an item/location
     * Returns tallies in FIFO order (oldest first)
     *
     * @param {Object} params - Search parameters
     * @param {number} params.itemId - Item internal ID
     * @param {number} params.locationId - Location internal ID
     * @param {number} [params.subsidiaryId] - Subsidiary internal ID
     * @param {number} [params.requiredBF] - Minimum BF needed
     * @param {number} [params.gradeId] - Specific grade required
     * @returns {Array} Available tally sheets
     */
    const findAvailableTallies = (params) => {
        if (!isEnabled()) {
            return [];
        }

        const { itemId, locationId, subsidiaryId, requiredBF, gradeId } = params;

        const filters = [
            [TALLY_FIELDS.ITEM, 'anyof', itemId],
            'AND',
            [TALLY_FIELDS.LOCATION, 'anyof', locationId],
            'AND',
            [TALLY_FIELDS.REMAINING_BF, 'greaterthan', 0],
            'AND',
            [TALLY_FIELDS.STATUS, 'anyof', [TALLY_STATUS.OPEN, TALLY_STATUS.ALLOCATED]]
        ];

        if (subsidiaryId) {
            filters.push('AND');
            filters.push([TALLY_FIELDS.SUBSIDIARY, 'anyof', subsidiaryId]);
        }

        if (gradeId) {
            filters.push('AND');
            filters.push([TALLY_FIELDS.GRADE, 'anyof', gradeId]);
        }

        const tallySearch = search.create({
            type: RECORD_TYPES.TALLY_SHEET,
            filters: filters,
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: TALLY_FIELDS.TALLY_NUMBER }),
                search.createColumn({ name: TALLY_FIELDS.REMAINING_BF }),
                search.createColumn({ name: TALLY_FIELDS.RECEIVED_BF }),
                search.createColumn({
                    name: TALLY_FIELDS.RECEIVED_DATE,
                    sort: search.Sort.ASC  // FIFO - oldest first
                }),
                search.createColumn({ name: TALLY_FIELDS.VENDOR_LOT }),
                search.createColumn({ name: TALLY_FIELDS.BUNDLE_ID }),
                search.createColumn({ name: TALLY_FIELDS.GRADE }),
                search.createColumn({ name: TALLY_FIELDS.MOISTURE_PCT })
            ]
        });

        const tallies = [];
        let accumulatedBF = 0;

        tallySearch.run().each((result) => {
            const remainingBF = parseFloat(result.getValue(TALLY_FIELDS.REMAINING_BF)) || 0;

            tallies.push({
                tallyId: result.id,
                tallyNumber: result.getValue(TALLY_FIELDS.TALLY_NUMBER),
                remainingBF: remainingBF,
                receivedBF: parseFloat(result.getValue(TALLY_FIELDS.RECEIVED_BF)) || 0,
                receivedDate: result.getValue(TALLY_FIELDS.RECEIVED_DATE),
                vendorLot: result.getValue(TALLY_FIELDS.VENDOR_LOT),
                bundleId: result.getValue(TALLY_FIELDS.BUNDLE_ID),
                grade: result.getText(TALLY_FIELDS.GRADE),
                gradeId: result.getValue(TALLY_FIELDS.GRADE),
                moisturePct: parseFloat(result.getValue(TALLY_FIELDS.MOISTURE_PCT)) || null
            });

            accumulatedBF += remainingBF;

            // If we have enough BF and FIFO is enforced, we can stop
            if (requiredBF && SettingsDAO.isTallyFifoEnforced() && accumulatedBF >= requiredBF) {
                return false;
            }

            return true;
        });

        return tallies;
    };

    /**
     * Get total available BF for an item/location
     *
     * @param {number} itemId - Item internal ID
     * @param {number} locationId - Location internal ID
     * @param {number} [subsidiaryId] - Subsidiary internal ID
     * @returns {number} Total available BF
     */
    const getAvailableBF = (itemId, locationId, subsidiaryId) => {
        const tallies = findAvailableTallies({ itemId, locationId, subsidiaryId });
        return tallies.reduce((sum, tally) => sum + tally.remainingBF, 0);
    };

    /**
     * Create allocation records for a work order
     * Allocates tally sheets to WO lines using FIFO
     *
     * @param {number} workOrderId - Work Order internal ID
     * @returns {Object} Allocation result
     */
    const createAllocationsForWorkOrder = (workOrderId) => {
        if (!isEnabled()) {
            return { success: true, allocations: [], message: 'Tally module disabled' };
        }

        try {
            const woRec = record.load({
                type: record.Type.WORK_ORDER,
                id: workOrderId
            });

            const locationId = woRec.getValue({ fieldId: 'location' });
            const subsidiaryId = woRec.getValue({ fieldId: 'subsidiary' });
            const lineCount = woRec.getLineCount({ sublistId: 'item' });

            const allocations = [];
            const errors = [];

            for (let i = 0; i < lineCount; i++) {
                const itemId = woRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });

                const requiredBF = parseFloat(woRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: Constants.LINE_FIELDS.CALCULATED_BF,
                    line: i
                })) || parseFloat(woRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    line: i
                })) || 0;

                if (requiredBF <= 0) continue;

                // Find available tallies
                const availableTallies = findAvailableTallies({
                    itemId,
                    locationId,
                    subsidiaryId,
                    requiredBF
                });

                let remainingBF = requiredBF;

                for (const tally of availableTallies) {
                    if (remainingBF <= 0) break;

                    const allocateBF = Math.min(tally.remainingBF, remainingBF);

                    // Create allocation record
                    const allocationResult = createAllocation({
                        tallyId: tally.tallyId,
                        workOrderId: workOrderId,
                        allocatedBF: allocateBF,
                        lineNumber: i
                    });

                    if (allocationResult.success) {
                        allocations.push({
                            allocationId: allocationResult.allocationId,
                            tallyId: tally.tallyId,
                            tallyNumber: tally.tallyNumber,
                            allocatedBF: allocateBF,
                            lineNumber: i
                        });
                        remainingBF -= allocateBF;
                    } else {
                        errors.push(allocationResult.error);
                    }
                }

                if (remainingBF > 0) {
                    errors.push(`Insufficient BF for item on line ${i + 1}. Short by ${BFCalculator.roundTo(remainingBF, 4)} BF`);
                }
            }

            return {
                success: errors.length === 0,
                allocations,
                errors,
                totalAllocated: allocations.reduce((sum, a) => sum + a.allocatedBF, 0)
            };

        } catch (e) {
            log.error({
                title: 'CLS Tally Service - createAllocationsForWorkOrder',
                details: e.message
            });
            return {
                success: false,
                allocations: [],
                errors: [e.message]
            };
        }
    };

    /**
     * Create a single tally allocation record
     *
     * @param {Object} params - Allocation parameters
     * @param {number} params.tallyId - Tally sheet internal ID
     * @param {number} params.workOrderId - Work Order internal ID
     * @param {number} params.allocatedBF - BF to allocate
     * @param {number} [params.lineNumber] - WO line number
     * @returns {Object} Result with allocationId
     */
    const createAllocation = (params) => {
        try {
            const allocRec = record.create({
                type: RECORD_TYPES.TALLY_ALLOCATION,
                isDynamic: true
            });

            allocRec.setValue({ fieldId: TALLY_ALLOC_FIELDS.TALLY_SHEET, value: params.tallyId });
            allocRec.setValue({ fieldId: TALLY_ALLOC_FIELDS.WORK_ORDER, value: params.workOrderId });
            allocRec.setValue({ fieldId: TALLY_ALLOC_FIELDS.ALLOCATED_BF, value: params.allocatedBF });
            allocRec.setValue({ fieldId: TALLY_ALLOC_FIELDS.ALLOCATION_DATE, value: new Date() });
            allocRec.setValue({ fieldId: TALLY_ALLOC_FIELDS.STATUS, value: TALLY_ALLOC_STATUS.ALLOCATED });

            if (params.lineNumber !== undefined) {
                allocRec.setValue({ fieldId: TALLY_ALLOC_FIELDS.LINE_NUMBER, value: params.lineNumber });
            }

            const allocationId = allocRec.save();

            // Update tally sheet status if needed
            updateTallyStatus(params.tallyId);

            return {
                success: true,
                allocationId
            };

        } catch (e) {
            return {
                success: false,
                error: e.message
            };
        }
    };

    /**
     * Mark allocations as consumed when work order is completed
     *
     * @param {number} workOrderId - Work Order internal ID
     * @returns {Object} Result
     */
    const markAllocationsConsumed = (workOrderId) => {
        if (!isEnabled()) {
            return { success: true, message: 'Tally module disabled' };
        }

        try {
            // Find all allocations for this work order
            const allocSearch = search.create({
                type: RECORD_TYPES.TALLY_ALLOCATION,
                filters: [
                    [TALLY_ALLOC_FIELDS.WORK_ORDER, 'anyof', workOrderId],
                    'AND',
                    [TALLY_ALLOC_FIELDS.STATUS, 'anyof', TALLY_ALLOC_STATUS.ALLOCATED]
                ],
                columns: [
                    'internalid',
                    TALLY_ALLOC_FIELDS.TALLY_SHEET,
                    TALLY_ALLOC_FIELDS.ALLOCATED_BF
                ]
            });

            const updates = [];

            allocSearch.run().each((result) => {
                const allocId = result.id;
                const tallyId = result.getValue(TALLY_ALLOC_FIELDS.TALLY_SHEET);
                const allocatedBF = parseFloat(result.getValue(TALLY_ALLOC_FIELDS.ALLOCATED_BF)) || 0;

                // Update allocation status
                record.submitFields({
                    type: RECORD_TYPES.TALLY_ALLOCATION,
                    id: allocId,
                    values: {
                        [TALLY_ALLOC_FIELDS.STATUS]: TALLY_ALLOC_STATUS.CONSUMED,
                        [TALLY_ALLOC_FIELDS.CONSUMED_BF]: allocatedBF,
                        [TALLY_ALLOC_FIELDS.CONSUMPTION_DATE]: new Date()
                    }
                });

                // Reduce remaining BF on tally
                reduceTallyBF(tallyId, allocatedBF);

                updates.push({
                    allocationId: allocId,
                    tallyId,
                    consumedBF: allocatedBF
                });

                return true;
            });

            return {
                success: true,
                updates,
                totalConsumed: updates.reduce((sum, u) => sum + u.consumedBF, 0)
            };

        } catch (e) {
            log.error({
                title: 'CLS Tally Service - markAllocationsConsumed',
                details: e.message
            });
            return {
                success: false,
                error: e.message
            };
        }
    };

    /**
     * Reduce remaining BF on a tally sheet
     *
     * @param {number} tallyId - Tally sheet internal ID
     * @param {number} consumedBF - BF consumed
     */
    const reduceTallyBF = (tallyId, consumedBF) => {
        try {
            const tallyRec = record.load({
                type: RECORD_TYPES.TALLY_SHEET,
                id: tallyId
            });

            const currentRemaining = parseFloat(tallyRec.getValue({ fieldId: TALLY_FIELDS.REMAINING_BF })) || 0;
            const newRemaining = Math.max(0, currentRemaining - consumedBF);

            tallyRec.setValue({ fieldId: TALLY_FIELDS.REMAINING_BF, value: newRemaining });

            // Update status if fully consumed
            if (newRemaining <= 0) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.STATUS, value: TALLY_STATUS.CONSUMED });
            }

            tallyRec.save();

        } catch (e) {
            log.error({
                title: 'CLS Tally Service - reduceTallyBF',
                details: `Tally ${tallyId}: ${e.message}`
            });
        }
    };

    /**
     * Update tally sheet status based on allocations
     *
     * @param {number} tallyId - Tally sheet internal ID
     */
    const updateTallyStatus = (tallyId) => {
        try {
            const tallyRec = record.load({
                type: RECORD_TYPES.TALLY_SHEET,
                id: tallyId
            });

            const currentStatus = tallyRec.getValue({ fieldId: TALLY_FIELDS.STATUS });
            const remainingBF = parseFloat(tallyRec.getValue({ fieldId: TALLY_FIELDS.REMAINING_BF })) || 0;

            // Check if there are any pending allocations
            const allocSearch = search.create({
                type: RECORD_TYPES.TALLY_ALLOCATION,
                filters: [
                    [TALLY_ALLOC_FIELDS.TALLY_SHEET, 'anyof', tallyId],
                    'AND',
                    [TALLY_ALLOC_FIELDS.STATUS, 'anyof', TALLY_ALLOC_STATUS.ALLOCATED]
                ],
                columns: [search.createColumn({ name: TALLY_ALLOC_FIELDS.ALLOCATED_BF, summary: search.Summary.SUM })]
            });

            let allocatedBF = 0;
            allocSearch.run().each((result) => {
                allocatedBF = parseFloat(result.getValue({
                    name: TALLY_ALLOC_FIELDS.ALLOCATED_BF,
                    summary: search.Summary.SUM
                })) || 0;
                return false;
            });

            let newStatus = currentStatus;

            if (remainingBF <= 0) {
                newStatus = TALLY_STATUS.CONSUMED;
            } else if (allocatedBF > 0) {
                newStatus = TALLY_STATUS.ALLOCATED;
            } else {
                newStatus = TALLY_STATUS.OPEN;
            }

            if (newStatus !== currentStatus) {
                tallyRec.setValue({ fieldId: TALLY_FIELDS.STATUS, value: newStatus });
                tallyRec.save();
            }

        } catch (e) {
            log.error({
                title: 'CLS Tally Service - updateTallyStatus',
                details: e.message
            });
        }
    };

    /**
     * Release allocations (cancel work order scenario)
     *
     * @param {number} workOrderId - Work Order internal ID
     * @returns {Object} Result
     */
    const releaseAllocations = (workOrderId) => {
        if (!isEnabled()) {
            return { success: true };
        }

        try {
            const allocSearch = search.create({
                type: RECORD_TYPES.TALLY_ALLOCATION,
                filters: [
                    [TALLY_ALLOC_FIELDS.WORK_ORDER, 'anyof', workOrderId],
                    'AND',
                    [TALLY_ALLOC_FIELDS.STATUS, 'anyof', TALLY_ALLOC_STATUS.ALLOCATED]
                ],
                columns: ['internalid', TALLY_ALLOC_FIELDS.TALLY_SHEET]
            });

            const released = [];

            allocSearch.run().each((result) => {
                const allocId = result.id;
                const tallyId = result.getValue(TALLY_ALLOC_FIELDS.TALLY_SHEET);

                record.submitFields({
                    type: RECORD_TYPES.TALLY_ALLOCATION,
                    id: allocId,
                    values: {
                        [TALLY_ALLOC_FIELDS.STATUS]: TALLY_ALLOC_STATUS.RELEASED
                    }
                });

                updateTallyStatus(tallyId);
                released.push(allocId);

                return true;
            });

            return {
                success: true,
                releasedCount: released.length
            };

        } catch (e) {
            return {
                success: false,
                error: e.message
            };
        }
    };

    /**
     * Get tally sheet details
     *
     * @param {number} tallyId - Tally sheet internal ID
     * @returns {Object} Tally details
     */
    const getTallyDetails = (tallyId) => {
        try {
            const tallyRec = record.load({
                type: RECORD_TYPES.TALLY_SHEET,
                id: tallyId
            });

            return {
                tallyId,
                tallyNumber: tallyRec.getValue({ fieldId: TALLY_FIELDS.TALLY_NUMBER }),
                itemId: tallyRec.getValue({ fieldId: TALLY_FIELDS.ITEM }),
                vendorId: tallyRec.getValue({ fieldId: TALLY_FIELDS.VENDOR }),
                vendorLot: tallyRec.getValue({ fieldId: TALLY_FIELDS.VENDOR_LOT }),
                bundleId: tallyRec.getValue({ fieldId: TALLY_FIELDS.BUNDLE_ID }),
                receivedBF: parseFloat(tallyRec.getValue({ fieldId: TALLY_FIELDS.RECEIVED_BF })) || 0,
                remainingBF: parseFloat(tallyRec.getValue({ fieldId: TALLY_FIELDS.REMAINING_BF })) || 0,
                receivedDate: tallyRec.getValue({ fieldId: TALLY_FIELDS.RECEIVED_DATE }),
                status: tallyRec.getValue({ fieldId: TALLY_FIELDS.STATUS }),
                locationId: tallyRec.getValue({ fieldId: TALLY_FIELDS.LOCATION }),
                subsidiaryId: tallyRec.getValue({ fieldId: TALLY_FIELDS.SUBSIDIARY }),
                gradeId: tallyRec.getValue({ fieldId: TALLY_FIELDS.GRADE }),
                moisturePct: parseFloat(tallyRec.getValue({ fieldId: TALLY_FIELDS.MOISTURE_PCT })) || null,
                thickness: parseFloat(tallyRec.getValue({ fieldId: TALLY_FIELDS.THICKNESS })) || null,
                width: parseFloat(tallyRec.getValue({ fieldId: TALLY_FIELDS.WIDTH })) || null,
                length: parseFloat(tallyRec.getValue({ fieldId: TALLY_FIELDS.LENGTH })) || null,
                pieces: parseInt(tallyRec.getValue({ fieldId: TALLY_FIELDS.PIECES }), 10) || null
            };

        } catch (e) {
            return null;
        }
    };

    /**
     * Record consumption from a tally sheet
     * Used when fulfilling orders or completing work orders
     *
     * @param {Object} params - Consumption parameters
     * @param {number} params.tallyId - Tally sheet internal ID
     * @param {number} params.consumedBF - BF consumed
     * @param {number} [params.transactionId] - Related transaction ID
     * @param {string} [params.transactionType] - Type of transaction
     * @returns {Object} Result with success status
     */
    const recordConsumption = (params) => {
        try {
            const { tallyId, consumedBF, transactionId, transactionType } = params;

            // Reduce the tally BF
            const reduceResult = reduceTallyBF(tallyId, consumedBF);
            if (!reduceResult.success) {
                return reduceResult;
            }

            // Update tally status
            updateTallyStatus(tallyId);

            return {
                success: true,
                tallyId,
                consumedBF,
                remainingBF: reduceResult.remainingBF
            };

        } catch (e) {
            log.error({
                title: 'CLS Tally Service - recordConsumption',
                details: e.message
            });
            return {
                success: false,
                error: e.message
            };
        }
    };

    /**
     * Reverse a consumption (for voided transactions)
     *
     * @param {Object} params - Reversal parameters
     * @param {number} params.tallyId - Tally sheet internal ID
     * @param {number} params.reverseBF - BF to add back
     * @returns {Object} Result with success status
     */
    const reverseConsumption = (params) => {
        try {
            const { tallyId, reverseBF } = params;

            // Load and update tally
            const tallyRec = record.load({
                type: RECORD_TYPES.TALLY_SHEET,
                id: tallyId,
                isDynamic: true
            });

            const currentRemaining = parseFloat(tallyRec.getValue({ fieldId: TALLY_FIELDS.REMAINING_BF })) || 0;
            const receivedBF = parseFloat(tallyRec.getValue({ fieldId: TALLY_FIELDS.RECEIVED_BF })) || 0;
            const newRemaining = Math.min(currentRemaining + reverseBF, receivedBF);

            tallyRec.setValue({ fieldId: TALLY_FIELDS.REMAINING_BF, value: newRemaining });
            tallyRec.save();

            // Update status
            updateTallyStatus(tallyId);

            return {
                success: true,
                tallyId,
                reversedBF: reverseBF,
                remainingBF: newRemaining
            };

        } catch (e) {
            log.error({
                title: 'CLS Tally Service - reverseConsumption',
                details: e.message
            });
            return {
                success: false,
                error: e.message
            };
        }
    };

    /**
     * Allocate tally sheets using FIFO (First In First Out)
     *
     * @param {Object} params - FIFO allocation parameters
     * @param {number} params.itemId - Item internal ID
     * @param {number} params.requiredBF - Required board feet
     * @param {number} params.locationId - Location internal ID
     * @param {number} params.subsidiaryId - Subsidiary internal ID
     * @param {number} [params.workOrderId] - Work Order to allocate to
     * @returns {Object} Result with allocations array
     */
    const allocateFIFO = (params) => {
        try {
            const { itemId, requiredBF, locationId, subsidiaryId, workOrderId } = params;

            // Find available tallies in FIFO order
            const availableTallies = findAvailableTallies({
                itemId,
                locationId,
                subsidiaryId
            });

            if (availableTallies.length === 0) {
                return {
                    success: false,
                    allocations: [],
                    error: 'No available tally sheets found'
                };
            }

            const allocations = [];
            let remainingBF = requiredBF;

            for (const tally of availableTallies) {
                if (remainingBF <= 0) break;

                const allocateBF = Math.min(tally.remainingBF, remainingBF);

                if (workOrderId) {
                    const allocResult = createAllocation({
                        tallyId: tally.id,
                        workOrderId,
                        allocatedBF: allocateBF
                    });

                    if (allocResult.success) {
                        allocations.push({
                            tallyId: tally.id,
                            allocatedBF: allocateBF,
                            allocationId: allocResult.allocationId
                        });
                        remainingBF -= allocateBF;
                    }
                } else {
                    allocations.push({
                        tallyId: tally.id,
                        availableBF: allocateBF
                    });
                    remainingBF -= allocateBF;
                }
            }

            return {
                success: remainingBF <= 0,
                allocations,
                totalAllocated: requiredBF - remainingBF,
                shortfall: remainingBF > 0 ? remainingBF : 0
            };

        } catch (e) {
            log.error({
                title: 'CLS Tally Service - allocateFIFO',
                details: e.message
            });
            return {
                success: false,
                allocations: [],
                error: e.message
            };
        }
    };

    return {
        // Module check
        isEnabled,

        // Tally CRUD
        createTallySheet,
        getTallyDetails,

        // Availability
        findAvailableTallies,
        getAvailableBF,

        // Allocation management
        createAllocationsForWorkOrder,
        createAllocation,
        markAllocationsConsumed,
        releaseAllocations,
        allocateFIFO,

        // Consumption
        recordConsumption,
        reverseConsumption,

        // Status management
        updateTallyStatus,
        reduceTallyBF,

        // Constants
        TALLY_STATUS,
        TALLY_ALLOC_STATUS
    };
});
