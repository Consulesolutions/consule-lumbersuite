#!/usr/bin/env node
/**
 * Consule LumberSuite - NetSuite Deployment Script
 * Uploads SuiteScript files to NetSuite File Cabinet using REST API with TBA
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
    realm: process.env.NS_REALM,
    basePath: '/SuiteScripts/ConsuleLumberSuite'
};

// Source directory
const SRC_DIR = path.join(__dirname, 'src', 'FileCabinet', 'SuiteScripts', 'ConsuleLumberSuite');

// Directories to deploy
const DEPLOY_DIRS = ['lib', 'control', 'sales', 'workorder', 'tally', 'yield', 'repack', 'reporting'];

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
                'Accept': 'application/json',
                'Prefer': 'respond-async, wait=10'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
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

                    resolve({ status: res.statusCode, data: parsedData, headers: res.headers });
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
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
 * Find folder by path using SuiteQL
 */
async function findFolderByPath(folderPath) {
    const accountId = CONFIG.accountId.toLowerCase().replace('_', '-');
    const url = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;

    // Parse path to get parent and name
    const parts = folderPath.split('/').filter(p => p);
    const folderName = parts[parts.length - 1];

    const query = `SELECT id, name FROM mediaitemfolder WHERE name = '${folderName}'`;

    try {
        const result = await makeRequest('POST', url, { q: query });
        if (result.data && result.data.items && result.data.items.length > 0) {
            return result.data.items[0].id;
        }
        return null;
    } catch (error) {
        console.log(`  Could not find folder: ${error.message}`);
        return null;
    }
}

/**
 * Create folder in File Cabinet
 */
async function createFolder(folderName, parentId = null) {
    const accountId = CONFIG.accountId.toLowerCase().replace('_', '-');
    const url = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/record/v1/folder`;

    const body = {
        name: folderName
    };

    if (parentId) {
        body.parent = { id: String(parentId) };
    }

    try {
        const result = await makeRequest('POST', url, body);
        if (result.data && result.data.id) {
            return result.data.id;
        }
        return null;
    } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('DUPLICATE') || error.message.includes('UNIQUE')) {
            return await findFolderByPath(folderName);
        }
        return null;
    }
}

/**
 * Ensure folder path exists and return leaf folder ID
 */
async function ensureFolderPath(folderPath) {
    const parts = folderPath.split('/').filter(p => p);
    let parentId = null;

    // First, try to find the leaf folder
    const existingId = await findFolderByPath(folderPath);
    if (existingId) {
        return existingId;
    }

    // Create folders one by one
    for (const part of parts) {
        const folderId = await createFolder(part, parentId);
        if (folderId) {
            parentId = folderId;
        }
    }

    return parentId;
}

/**
 * Upload a file to NetSuite File Cabinet
 */
async function uploadFile(localPath, folderId) {
    const accountId = CONFIG.accountId.toLowerCase().replace('_', '-');
    const url = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/record/v1/file`;

    const content = fs.readFileSync(localPath);
    const base64Content = content.toString('base64');
    const fileName = path.basename(localPath);

    const body = {
        name: fileName,
        content: base64Content,
        folder: { id: String(folderId) }
    };

    try {
        await makeRequest('POST', url, body);
        console.log(`  ✓ ${fileName}`);
        return true;
    } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('DUPLICATE')) {
            // File exists - try to update it
            console.log(`  ↻ ${fileName} (updating)`);
            return await updateFile(localPath, folderId, fileName);
        }
        console.error(`  ✗ ${fileName}: ${error.message}`);
        return false;
    }
}

/**
 * Update existing file
 */
async function updateFile(localPath, folderId, fileName) {
    const accountId = CONFIG.accountId.toLowerCase().replace('_', '-');

    // Find the file first
    const queryUrl = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;
    const query = `SELECT id FROM file WHERE name = '${fileName}' AND folder = ${folderId}`;

    try {
        const result = await makeRequest('POST', queryUrl, { q: query });
        if (result.data && result.data.items && result.data.items.length > 0) {
            const fileId = result.data.items[0].id;
            const content = fs.readFileSync(localPath);
            const base64Content = content.toString('base64');

            const updateUrl = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/record/v1/file/${fileId}`;
            await makeRequest('PATCH', updateUrl, { content: base64Content });
            console.log(`  ✓ ${fileName} (updated)`);
            return true;
        }
    } catch (error) {
        console.error(`  ✗ ${fileName}: Could not update - ${error.message}`);
    }
    return false;
}

/**
 * Upload all files in a directory
 */
async function uploadDirectory(dirName, folderIds) {
    const dirPath = path.join(SRC_DIR, dirName);

    if (!fs.existsSync(dirPath)) {
        console.log(`Directory not found: ${dirPath}`);
        return { success: 0, failed: 0 };
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
    const remotePath = `SuiteScripts/ConsuleLumberSuite/${dirName}`;

    console.log(`\n📁 ${dirName}/ (${files.length} files)`);

    let folderId = folderIds[dirName];
    if (!folderId) {
        folderId = await ensureFolderPath(remotePath);
        if (folderId) {
            folderIds[dirName] = folderId;
        } else {
            console.log(`  ✗ Could not create folder`);
            return { success: 0, failed: files.length };
        }
    }

    let success = 0, failed = 0;
    for (const file of files) {
        const localPath = path.join(dirPath, file);
        const result = await uploadFile(localPath, folderId);
        if (result) success++; else failed++;
    }

    return { success, failed };
}

/**
 * Test connection to NetSuite
 */
async function testConnection() {
    const accountId = CONFIG.accountId.toLowerCase().replace('_', '-');
    const url = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;

    try {
        await makeRequest('POST', url, { q: 'SELECT id FROM folder WHERE ROWNUM = 1' });
        return true;
    } catch (error) {
        console.log(`  Error: ${error.message}`);
        return false;
    }
}

/**
 * Upload all directories
 */
async function uploadAll() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       Consule LumberSuite - NetSuite Deployment            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\nAccount: ${CONFIG.accountId}`);
    console.log(`Target:  ${CONFIG.basePath}`);

    // Check config
    if (!CONFIG.consumerKey || !CONFIG.consumerSecret || !CONFIG.tokenId || !CONFIG.tokenSecret) {
        console.log('\n⚠️  Missing credentials in .env file!');
        return;
    }

    // Test connection
    console.log('\nTesting connection...');
    const connected = await testConnection();
    if (!connected) {
        console.log('✗ Could not connect to NetSuite. Check your credentials.');
        return;
    }
    console.log('✓ Connected to NetSuite');

    // Track folder IDs to avoid recreating
    const folderIds = {};

    let totalSuccess = 0, totalFailed = 0;

    for (const dir of DEPLOY_DIRS) {
        const result = await uploadDirectory(dir, folderIds);
        totalSuccess += result.success;
        totalFailed += result.failed;
    }

    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`✓ Deployment complete: ${totalSuccess} uploaded, ${totalFailed} failed`);
}

/**
 * Main entry point
 */
async function main() {
    const args = process.argv.slice(2);

    if (!CONFIG.accountId) {
        console.log('Error: Missing .env file or NS_ACCOUNT_ID');
        process.exit(1);
    }

    if (args.length === 0) {
        await uploadAll();
    } else {
        const dirName = args[0];
        if (DEPLOY_DIRS.includes(dirName)) {
            console.log(`\nDeploying ${dirName} to ${CONFIG.accountId}...`);

            if (!CONFIG.consumerKey || !CONFIG.consumerSecret) {
                console.log('\n⚠️  Missing credentials!');
                return;
            }

            const folderIds = {};
            await uploadDirectory(dirName, folderIds);
            console.log('\n✓ Done!');
        } else {
            console.log(`Unknown directory: ${dirName}`);
            console.log(`Available: ${DEPLOY_DIRS.join(', ')}`);
        }
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
