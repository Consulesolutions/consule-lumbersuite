# Consule LumberSuite™ - Configuration & Demo Guide

## Table of Contents
1. [Overview](#overview)
2. [Initial Setup](#initial-setup)
3. [Configuration](#configuration)
4. [Setting Up Master Data](#setting-up-master-data)
5. [Configuring Items](#configuring-items)
6. [Demo Scenarios](#demo-scenarios)
7. [Feature Walkthroughs](#feature-walkthroughs)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Consule LumberSuite™ is a comprehensive NetSuite customization for the lumber industry that provides:

- **Board Feet (BF) Calculations** - Automatic conversion between various units of measure
- **Dynamic UOM Support** - Sell in Linear Feet, Square Feet, MBF while tracking inventory in Board Feet
- **Tally Management** - Track lumber inventory by bundle/lot with FIFO allocation
- **Yield Tracking** - Monitor manufacturing yield and waste on work orders
- **Repack Processing** - Convert lumber from one dimension to another
- **Advanced Reporting** - Yield analysis, waste tracking, margin reports

### Key Concepts

| Term | Definition |
|------|------------|
| **Board Feet (BF)** | Standard lumber measurement: (Thickness × Width × Length) / 144 |
| **MBF** | Thousand Board Feet (1 MBF = 1,000 BF) |
| **Tally Sheet** | Record tracking a specific bundle/lot of lumber received |
| **Yield %** | Actual output ÷ Theoretical input × 100 |

---

## Initial Setup

### Step 1: Create CLS Settings Record

This is **required** before using any LumberSuite features.

1. Navigate to: **Lists > Custom > CLS Settings > New**
2. Configure the following options:

| Field | Recommended Value | Description |
|-------|-------------------|-------------|
| Name | `Default Settings` | Settings record identifier |
| Enable Yield Tracking | ☑ Checked | Track yield on work orders |
| Enable Waste Tracking | ☑ Checked | Track waste reasons |
| Enable Tally Management | ☑ Checked | Use tally sheets for inventory |
| Enable Repack Processing | ☐ Unchecked | Enable if doing repack operations |
| Enable Dynamic UOM | ☑ Checked | Allow multiple selling UOMs |
| Enable Grade Tracking | ☑ Checked | Track lumber grades |
| Enable Moisture Tracking | ☐ Unchecked | Track moisture content |
| Default Yield % | 95% | Expected yield percentage |
| Default Waste % | 5% | Expected waste percentage |
| BF Precision | 4 | Decimal places for BF values |
| Enforce Tally FIFO | ☑ Checked | Allocate oldest tally first |
| Require Dimensions | ☑ Checked | Require dimensions on transactions |

3. Click **Save**

> ⚠️ **Important**: Only ONE settings record should exist. The system uses the first active settings record.

---

## Configuration

### Step 2: Set Up Species (Optional but Recommended)

Species are used to categorize lumber and can include density factors for weight calculations.

1. Navigate to: **Lists > Custom > CLS Species > New**
2. Create species records:

| Name | Species Code | Is Hardwood | Density Factor |
|------|--------------|-------------|----------------|
| Douglas Fir | DF | ☐ No | 0.48 |
| White Oak | WO | ☑ Yes | 0.68 |
| Red Oak | RO | ☑ Yes | 0.63 |
| Pine (Southern Yellow) | SYP | ☐ No | 0.52 |
| Maple (Hard) | HM | ☑ Yes | 0.63 |
| Cherry | CH | ☑ Yes | 0.50 |
| Walnut | WN | ☑ Yes | 0.55 |
| Cedar (Western Red) | WRC | ☐ No | 0.32 |

### Step 3: Set Up Grades

Grades affect pricing and quality classification.

1. Navigate to: **Lists > Custom > CLS Grade > New**
2. Create grade records:

| Name | Grade Code | Price Modifier | Sort Order |
|------|------------|----------------|------------|
| FAS (First and Seconds) | FAS | 100% | 1 |
| Select | SEL | 90% | 2 |
| #1 Common | 1C | 75% | 3 |
| #2 Common | 2C | 60% | 4 |
| #3 Common | 3C | 45% | 5 |
| Utility | UTL | 30% | 6 |

### Step 4: Set Up Waste Reasons

Waste reasons help categorize and analyze production waste.

1. Navigate to: **Lists > Custom > CLS Waste Reason > New**
2. Create waste reason records:

| Name | Reason Code | Is Recoverable | Default Recovery % |
|------|-------------|----------------|-------------------|
| Sawdust | SAW | ☐ No | 0% |
| End Trim | TRIM | ☑ Yes | 50% |
| Defect Cutout | DEF | ☐ No | 0% |
| Wane/Bark | WANE | ☐ No | 0% |
| Breakage | BRK | ☐ No | 0% |
| Resaw Loss | RESAW | ☐ No | 0% |
| Moisture Loss | MOIST | ☐ No | 0% |

---

## Configuring Items

### Step 5: Configure Lumber Items

For each inventory item that is lumber:

1. Navigate to: **Lists > Accounting > Items**
2. Edit or create an Inventory Item
3. Go to the **Custom** subtab (or LumberSuite tab if configured)
4. Set the following fields:

| Field | Description | Example |
|-------|-------------|---------|
| **Is Lumber Item** | ☑ Check this to enable BF calculations | ☑ Checked |
| **Species** | Select the wood species | Douglas Fir |
| **Grade** | Default grade for this item | #1 Common |
| **Nominal Thickness (in)** | Thickness in inches | 2 |
| **Nominal Width (in)** | Width in inches | 6 |
| **Nominal Length (ft)** | Length in feet | 8 |
| **Base BF Cost** | Cost per board foot | $2.50 |
| **Allow Dynamic Dimensions** | Allow dimension override on transactions | ☑ Checked |
| **Default Yield %** | Expected yield for this item | 95% |
| **Default Waste %** | Expected waste for this item | 5% |
| **Pieces Per Bundle** | Standard bundle quantity | 50 |

### Example Lumber Items to Create

| Item Name | Thickness | Width | Length | Nominal BF/Piece |
|-----------|-----------|-------|--------|------------------|
| 2x4x8 Douglas Fir | 2" | 4" | 8' | 5.33 BF |
| 2x6x10 Douglas Fir | 2" | 6" | 10' | 10.00 BF |
| 1x6x8 Pine | 1" | 6" | 8' | 4.00 BF |
| 4/4 Red Oak Random | 1" | 6" | 8' | 4.00 BF |
| 8/4 Walnut | 2" | 8" | 10' | 13.33 BF |

> **BF Calculation**: (Thickness × Width × Length) / 12
>
> Example: 2x6x10 = (2 × 6 × 10) / 12 = 10 BF

---

## Demo Scenarios

### Demo 1: Basic Sales Order with BF Calculation

**Objective**: Create a sales order and see automatic BF calculations

1. **Create a new Sales Order**
   - Customers > Enter Sales Orders

2. **Add a lumber item to the line**
   - Select Item: `2x6x10 Douglas Fir`
   - Quantity: 100 pieces

3. **Observe the custom columns populate**:
   - Selling UOM: BF (or select LF, SF, etc.)
   - Calculated BF: 1,000 BF (100 pieces × 10 BF each)
   - Dimensions auto-populated from item

4. **Try Dynamic Dimensions**:
   - Change Length to 12 feet
   - Watch Calculated BF update to 1,200 BF

5. **Check Transaction Total**:
   - Total BF field on body shows sum of all lines

---

### Demo 2: Selling in Different UOMs

**Objective**: Sell lumber in Linear Feet while tracking BF

1. **Create a new Estimate**

2. **Add line item**:
   - Item: `1x6x8 Pine`
   - Selling UOM: Select `LF - Linear Feet`
   - Display Qty: 500 LF

3. **System calculates**:
   - Conversion Factor: 0.5 BF per LF (for 1x6)
   - Calculated BF: 250 BF
   - Pricing based on BF cost × Calculated BF

4. **Try Square Feet**:
   - Change Selling UOM to `SF - Square Feet`
   - Display Qty: 500 SF
   - System recalculates BF based on thickness

---

### Demo 3: Tally Sheet Management

**Objective**: Receive lumber and track by bundle

1. **Create Item Receipt** (receive lumber from vendor)
   - Purchase Orders > Receive

2. **Create Tally Sheet**:
   - Lists > Custom > CLS Tally Sheet > New
   - Fill in:
     - Item: `2x4x8 Douglas Fir`
     - Vendor: Select vendor
     - Item Receipt: Link to receipt
     - Bundle ID: `BDL-2024-001`
     - Received BF: 5,000 BF
     - Received Date: Today
     - Location: Main Warehouse
     - Grade: #1 Common
     - Status: Open

3. **View Tally**:
   - Remaining BF shows available inventory
   - Status tracks allocation state

---

### Demo 4: Work Order with Yield Tracking

**Objective**: Process lumber and track yield/waste

1. **Create Work Order**:
   - Transactions > Manufacturing > Create Work Orders
   - Assembly Item: Finished lumber product
   - Quantity: 100

2. **Add Components**:
   - Component items show Theoretical BF
   - Link to Tally Allocation if enabled

3. **Complete Work Order**:
   - Transactions > Manufacturing > Work Order Completion
   - Enter Actual BF produced
   - System calculates:
     - Yield % = Actual / Theoretical × 100
     - Waste BF = Theoretical - Actual
   - Select Waste Reason

4. **View Yield Register**:
   - Lists > Custom > CLS Yield Register
   - See historical yield data
   - Analyze by item, operator, date

---

### Demo 5: Tally Allocation to Work Order

**Objective**: Allocate specific tally to production

1. **Open Tally Allocation Suitelet**:
   - Access via custom menu or Control Center

2. **Select Work Order**:
   - Choose work order requiring lumber

3. **View Available Tallies**:
   - System shows tallies with available BF
   - Sorted by FIFO if enabled

4. **Allocate**:
   - Select tally sheet(s)
   - Enter BF to allocate
   - System creates allocation record

5. **Verify**:
   - Tally Remaining BF decreases
   - Tally Status changes to "Allocated"
   - Work Order shows linked allocation

---

### Demo 6: Repack Processing (If Enabled)

**Objective**: Convert lumber from one size to another

1. **Create Repack Order**:
   - Lists > Custom > CLS Repack Order > New
   - Source Item: `4/4 Random Width Oak`
   - Source BF: 1,000 BF
   - Source Tally: Select tally to consume

2. **Define Outputs**:
   - Add Repack Output lines
   - Output Item: `1x4x8 Oak S4S`
   - Output BF: 850 BF
   - Output Qty: 212 pieces

3. **Process Repack**:
   - Change Status to "In Progress"
   - Complete and record actual outputs
   - System calculates:
     - Yield BF: 850 BF
     - Waste BF: 150 BF (15% waste)

4. **Result**:
   - Source tally consumed
   - New tally created for output
   - Inventory adjusted

---

## Feature Walkthroughs

### Control Center

Access the LumberSuite Control Center for a dashboard view:

1. Navigate to the Control Center Suitelet (via menu or direct URL)
2. Features available:
   - Quick settings access
   - Active tally summary
   - Recent yield statistics
   - Pending allocations
   - System health status

### Yield Analysis Report

1. Access Yield Analysis Suitelet
2. Set filters:
   - Date Range
   - Item/Item Group
   - Location
   - Operator
3. View analytics:
   - Average yield %
   - Waste breakdown by reason
   - Trends over time
   - Comparison to targets

### Report Dashboard

1. Access Report Dashboard Suitelet
2. Available reports:
   - BF Consumption Report
   - Tally Aging Report
   - Yield Summary
   - Waste Analysis
   - Margin by UOM
   - Species Usage

---

## Troubleshooting

### Common Issues

#### Scripts Not Triggering

**Symptom**: BF not calculating on transactions

**Solutions**:
1. Verify CLS Settings record exists and is active
2. Check item has "Is Lumber Item" checked
3. Verify script deployments are active:
   - Customization > Scripting > Script Deployments
   - Filter by "CLS" prefix
   - Ensure Status = Released

#### Incorrect BF Calculations

**Symptom**: BF values seem wrong

**Check**:
1. Item dimensions are correct (Thickness in inches, Width in inches, Length in feet)
2. Selling UOM conversion is appropriate
3. Formula: `BF = (Thickness × Width × Length) / 12`

#### Tally Not Available for Allocation

**Symptom**: Tally doesn't appear in allocation list

**Check**:
1. Tally Status = "Open"
2. Remaining BF > 0
3. Location matches (if location filtering enabled)
4. Item matches work order component

#### Permission Errors

**Symptom**: User cannot access LumberSuite features

**Solution**:
1. Ensure user role has permissions to:
   - Custom Records (CLS_*)
   - SuiteScript execution
   - Relevant transaction types
2. Check script deployment "Execute As Role" settings

### Getting Support

For issues not covered here:

1. Check script logs: Customization > Scripting > Script Execution Logs
2. Review error details in the log
3. Contact Consule support with:
   - Error message
   - Steps to reproduce
   - Script log excerpt

---

## Appendix

### UOM Conversion Reference

| From UOM | To BF Formula | Example |
|----------|---------------|---------|
| Pieces | (T × W × L) / 12 × Qty | 100 pcs of 2x4x8 = 533.33 BF |
| Linear Feet | (T × W) / 12 × LF | 500 LF of 1x6 = 250 BF |
| Square Feet | T / 12 × SF | 500 SF of 1" = 41.67 BF |
| MBF | × 1,000 | 5 MBF = 5,000 BF |
| Bundle | Pieces/Bundle × BF/Piece | 50 pcs × 10 BF = 500 BF |

### Standard Lumber Dimensions

| Nominal | Actual |
|---------|--------|
| 1" | 3/4" (0.75") |
| 2" | 1-1/2" (1.5") |
| 4" | 3-1/2" (3.5") |
| 6" | 5-1/2" (5.5") |
| 8" | 7-1/4" (7.25") |
| 10" | 9-1/4" (9.25") |
| 12" | 11-1/4" (11.25") |

> Note: LumberSuite uses nominal dimensions by default. Configure settings for actual dimensions if needed.

### Custom Record Reference

| Record Type | Script ID | Purpose |
|-------------|-----------|---------|
| CLS Settings | customrecord_cls_settings | System configuration |
| CLS Species | customrecord_cls_species | Wood species |
| CLS Grade | customrecord_cls_grade | Lumber grades |
| CLS Tally Sheet | customrecord_cls_tally | Inventory tracking |
| CLS Tally Allocation | customrecord_cls_tally_alloc | WO allocation |
| CLS Yield Register | customrecord_cls_yield_reg | Yield history |
| CLS Consumption Log | customrecord_cls_consumption | BF consumption audit |
| CLS Repack Order | customrecord_cls_repack | Repack operations |
| CLS Repack Output | customrecord_cls_repack_out | Repack results |
| CLS Waste Reason | customrecord_cls_waste_rsn | Waste categories |

---

*Document Version: 1.0*
*Last Updated: February 2026*
*© Consule LLC - LumberSuite™*
