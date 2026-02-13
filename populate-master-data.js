#!/usr/bin/env node
/**
 * Consule LumberSuite - Master Data Population Script
 * Creates sample master data records for testing
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                process.env[key.trim()] = valueParts.join('=').trim();
            }
        }
    });
}

// Configuration
const CONFIG = {
    accountId: process.env.NS_ACCOUNT_ID,
    consumerKey: process.env.NS_CONSUMER_KEY,
    consumerSecret: process.env.NS_CONSUMER_SECRET,
    tokenId: process.env.NS_TOKEN_ID,
    tokenSecret: process.env.NS_TOKEN_SECRET,
    realm: process.env.NS_REALM
};

/**
 * Generate OAuth 1.0a signature
 */
function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
    const sortedParams = Object.keys(params).sort().map(key =>
        `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
    ).join('&');

    const signatureBase = [
        method.toUpperCase(),
        encodeURIComponent(url),
        encodeURIComponent(sortedParams)
    ].join('&');

    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

    return crypto.createHmac('sha256', signingKey)
        .update(signatureBase)
        .digest('base64');
}

/**
 * Generate OAuth 1.0a Authorization header
 */
function generateAuthHeader(method, url) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const oauthParams = {
        oauth_consumer_key: CONFIG.consumerKey,
        oauth_token: CONFIG.tokenId,
        oauth_signature_method: 'HMAC-SHA256',
        oauth_timestamp: timestamp,
        oauth_nonce: nonce,
        oauth_version: '1.0'
    };

    const signature = generateOAuthSignature(
        method,
        url,
        oauthParams,
        CONFIG.consumerSecret,
        CONFIG.tokenSecret
    );

    oauthParams.oauth_signature = signature;

    const authHeader = 'OAuth realm="' + CONFIG.realm + '",' +
        Object.keys(oauthParams).map(key =>
            `${key}="${encodeURIComponent(oauthParams[key])}"`
        ).join(',');

    return authHeader;
}

/**
 * Make REST API request to NetSuite
 */
function makeRequest(method, url, body = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);

        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                'Authorization': generateAuthHeader(method, url),
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedData = {};
                try {
                    parsedData = data ? JSON.parse(data) : {};
                } catch (e) {
                    parsedData = { raw: data };
                }

                // Extract ID from Location header if present
                const location = res.headers['location'];
                if (location) {
                    const idMatch = location.match(/\/(\d+)$/);
                    if (idMatch) {
                        parsedData.id = idMatch[1];
                    }
                }

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ status: res.statusCode, data: parsedData, headers: res.headers });
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsedData)}`));
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

/**
 * Create a custom record
 */
async function createRecord(recordType, data) {
    const accountId = CONFIG.accountId.toLowerCase().replace('_', '-');
    const url = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/record/v1/${recordType}`;

    try {
        const result = await makeRequest('POST', url, data);
        return { success: true, id: result.data.id };
    } catch (error) {
        if (error.message.includes('DUPLICATE') || error.message.includes('already exists')) {
            return { success: true, id: null, message: 'Already exists' };
        }
        return { success: false, error: error.message };
    }
}

/**
 * Master Data Definitions
 */

// Lumber Grades
const GRADES = [
    { name: 'FAS', custrecord_cls_grade_code: 'FAS', custrecord_cls_grade_price_mod: 1.0, custrecord_cls_grade_sort: 1, custrecord_cls_grade_desc: 'First and Seconds - highest grade' },
    { name: 'F1F', custrecord_cls_grade_code: 'F1F', custrecord_cls_grade_price_mod: 0.95, custrecord_cls_grade_sort: 2, custrecord_cls_grade_desc: 'FAS One Face' },
    { name: 'Select', custrecord_cls_grade_code: 'SEL', custrecord_cls_grade_price_mod: 0.90, custrecord_cls_grade_sort: 3, custrecord_cls_grade_desc: 'Select grade' },
    { name: '#1 Common', custrecord_cls_grade_code: '1C', custrecord_cls_grade_price_mod: 0.75, custrecord_cls_grade_sort: 4, custrecord_cls_grade_desc: 'Number 1 Common' },
    { name: '#2 Common', custrecord_cls_grade_code: '2C', custrecord_cls_grade_price_mod: 0.55, custrecord_cls_grade_sort: 5, custrecord_cls_grade_desc: 'Number 2 Common' },
    { name: '#3 Common', custrecord_cls_grade_code: '3C', custrecord_cls_grade_price_mod: 0.35, custrecord_cls_grade_sort: 6, custrecord_cls_grade_desc: 'Number 3 Common - utility grade' }
];

// UOM Types
const UOM_TYPES = [
    { name: 'Board Feet', custrecord_cls_uom_code: 'BF', custrecord_cls_uom_base_factor: 1.0, custrecord_cls_uom_requires_dims: false },
    { name: 'Linear Feet', custrecord_cls_uom_code: 'LF', custrecord_cls_uom_base_factor: 0, custrecord_cls_uom_requires_dims: true },
    { name: 'Square Feet', custrecord_cls_uom_code: 'SF', custrecord_cls_uom_base_factor: 0, custrecord_cls_uom_requires_dims: true },
    { name: 'Thousand Board Feet', custrecord_cls_uom_code: 'MBF', custrecord_cls_uom_base_factor: 1000.0, custrecord_cls_uom_requires_dims: false },
    { name: 'Each', custrecord_cls_uom_code: 'EACH', custrecord_cls_uom_base_factor: 0, custrecord_cls_uom_requires_dims: true },
    { name: 'Bundle', custrecord_cls_uom_code: 'BUNDLE', custrecord_cls_uom_base_factor: 0, custrecord_cls_uom_requires_dims: true }
];

// Waste Reasons
const WASTE_REASONS = [
    { name: 'Knots', custrecord_cls_wrsn_code: 'KNOTS', custrecord_cls_wrsn_recoverable: false, custrecord_cls_wrsn_recovery_pct: 0 },
    { name: 'Splits/Checks', custrecord_cls_wrsn_code: 'SPLIT', custrecord_cls_wrsn_recoverable: false, custrecord_cls_wrsn_recovery_pct: 0 },
    { name: 'Warp/Bow', custrecord_cls_wrsn_code: 'WARP', custrecord_cls_wrsn_recoverable: true, custrecord_cls_wrsn_recovery_pct: 50 },
    { name: 'Stain/Discolor', custrecord_cls_wrsn_code: 'STAIN', custrecord_cls_wrsn_recoverable: true, custrecord_cls_wrsn_recovery_pct: 75 },
    { name: 'Decay/Rot', custrecord_cls_wrsn_code: 'DECAY', custrecord_cls_wrsn_recoverable: false, custrecord_cls_wrsn_recovery_pct: 0 },
    { name: 'Insect Damage', custrecord_cls_wrsn_code: 'INSECT', custrecord_cls_wrsn_recoverable: false, custrecord_cls_wrsn_recovery_pct: 0 },
    { name: 'Saw Kerf', custrecord_cls_wrsn_code: 'KERF', custrecord_cls_wrsn_recoverable: false, custrecord_cls_wrsn_recovery_pct: 0 },
    { name: 'End Trim', custrecord_cls_wrsn_code: 'TRIM', custrecord_cls_wrsn_recoverable: true, custrecord_cls_wrsn_recovery_pct: 30 },
    { name: 'Operator Error', custrecord_cls_wrsn_code: 'OPERR', custrecord_cls_wrsn_recoverable: true, custrecord_cls_wrsn_recovery_pct: 25 },
    { name: 'Machine Malfunction', custrecord_cls_wrsn_code: 'MACH', custrecord_cls_wrsn_recoverable: true, custrecord_cls_wrsn_recovery_pct: 40 }
];

// Process Targets (yield targets by process type)
// Note: Process type values reference the custom list values
const PROCESS_TARGETS = [
    { name: 'Surfacing Standard', custrecord_cls_pt_target_yield: 92, custrecord_cls_pt_min_yield: 88, custrecord_cls_pt_kerf_loss: 3, custrecord_cls_pt_shrinkage: 2, custrecord_cls_pt_defect_rate: 3, custrecord_cls_pt_notes: 'Standard S2S/S4S surfacing targets' },
    { name: 'Ripping Standard', custrecord_cls_pt_target_yield: 88, custrecord_cls_pt_min_yield: 82, custrecord_cls_pt_kerf_loss: 5, custrecord_cls_pt_shrinkage: 1, custrecord_cls_pt_defect_rate: 6, custrecord_cls_pt_notes: 'Standard ripping/edging targets' },
    { name: 'Crosscutting Standard', custrecord_cls_pt_target_yield: 90, custrecord_cls_pt_min_yield: 85, custrecord_cls_pt_kerf_loss: 4, custrecord_cls_pt_shrinkage: 1, custrecord_cls_pt_defect_rate: 5, custrecord_cls_pt_notes: 'Standard crosscut/chop targets' },
    { name: 'Resawing Standard', custrecord_cls_pt_target_yield: 85, custrecord_cls_pt_min_yield: 78, custrecord_cls_pt_kerf_loss: 8, custrecord_cls_pt_shrinkage: 2, custrecord_cls_pt_defect_rate: 5, custrecord_cls_pt_notes: 'Standard resaw targets' },
    { name: 'Glue-up Standard', custrecord_cls_pt_target_yield: 95, custrecord_cls_pt_min_yield: 92, custrecord_cls_pt_kerf_loss: 1, custrecord_cls_pt_shrinkage: 1, custrecord_cls_pt_defect_rate: 3, custrecord_cls_pt_notes: 'Standard glue-up/panel targets' },
    { name: 'Moulding Standard', custrecord_cls_pt_target_yield: 82, custrecord_cls_pt_min_yield: 75, custrecord_cls_pt_kerf_loss: 10, custrecord_cls_pt_shrinkage: 2, custrecord_cls_pt_defect_rate: 6, custrecord_cls_pt_notes: 'Standard moulding/shaping targets' },
    { name: 'Kiln Drying', custrecord_cls_pt_target_yield: 94, custrecord_cls_pt_min_yield: 90, custrecord_cls_pt_kerf_loss: 0, custrecord_cls_pt_shrinkage: 5, custrecord_cls_pt_defect_rate: 1, custrecord_cls_pt_notes: 'Kiln drying shrinkage targets' }
];

// CLS Settings (singleton configuration record)
const CLS_SETTINGS = {
    name: 'LumberSuite Settings',
    custrecord_cls_enable_yield: true,
    custrecord_cls_enable_waste: true,
    custrecord_cls_enable_tally: true,
    custrecord_cls_enable_repack: true,
    custrecord_cls_enable_dynamic_uom: true,
    custrecord_cls_enable_grade: true,
    custrecord_cls_enable_moisture: true,
    custrecord_cls_allow_wo_override: true,
    custrecord_cls_enable_adv_report: true,
    custrecord_cls_default_yield: 85,
    custrecord_cls_default_waste: 10,
    custrecord_cls_bf_precision: 4,
    custrecord_cls_enforce_tally_fifo: true,
    custrecord_cls_auto_create_tally: false,
    custrecord_cls_require_dimensions: false
};

/**
 * Main function to populate all master data
 */
async function populateMasterData() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     Consule LumberSuite - Master Data Population           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\nAccount: ${CONFIG.accountId}`);

    if (!CONFIG.consumerKey || !CONFIG.tokenId) {
        console.log('\n⚠️  Missing credentials in .env file!');
        return;
    }

    // Create CLS Settings (singleton)
    console.log('\n📋 Creating CLS Settings...');
    const settingsResult = await createRecord('customrecord_cls_settings', CLS_SETTINGS);
    if (settingsResult.success) {
        console.log(`  ✓ LumberSuite Settings ${settingsResult.id ? `(ID: ${settingsResult.id})` : '(exists)'}`);
    } else {
        console.log(`  ✗ LumberSuite Settings: ${settingsResult.error}`);
    }

    // Create Grades
    console.log('\n📋 Creating Grades...');
    for (const grade of GRADES) {
        const result = await createRecord('customrecord_cls_grade', grade);
        if (result.success) {
            console.log(`  ✓ ${grade.name} ${result.id ? `(ID: ${result.id})` : '(exists)'}`);
        } else {
            console.log(`  ✗ ${grade.name}: ${result.error}`);
        }
    }

    // Create UOM Types
    console.log('\n📋 Creating UOM Types...');
    for (const uom of UOM_TYPES) {
        const result = await createRecord('customrecord_cls_uom_type', uom);
        if (result.success) {
            console.log(`  ✓ ${uom.name} ${result.id ? `(ID: ${result.id})` : '(exists)'}`);
        } else {
            console.log(`  ✗ ${uom.name}: ${result.error}`);
        }
    }

    // Create Waste Reasons
    console.log('\n📋 Creating Waste Reasons...');
    for (const reason of WASTE_REASONS) {
        const result = await createRecord('customrecord_cls_waste_rsn', reason);
        if (result.success) {
            console.log(`  ✓ ${reason.name} ${result.id ? `(ID: ${result.id})` : '(exists)'}`);
        } else {
            console.log(`  ✗ ${reason.name}: ${result.error}`);
        }
    }

    // Create Process Targets
    console.log('\n📋 Creating Process Targets...');
    for (const target of PROCESS_TARGETS) {
        const result = await createRecord('customrecord_cls_process_target', target);
        if (result.success) {
            console.log(`  ✓ ${target.name} ${result.id ? `(ID: ${result.id})` : '(exists)'}`);
        } else {
            console.log(`  ✗ ${target.name}: ${result.error}`);
        }
    }

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('✓ Master data population complete!');
    console.log('\nNext steps:');
    console.log('1. Go to NetSuite and verify the records were created');
    console.log('2. Link Process Targets to Process Types via the custom list');
    console.log('3. Create test items with lumber fields configured');
    console.log('4. Create a test work order to verify the scripts work');
}

// Run
populateMasterData().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
