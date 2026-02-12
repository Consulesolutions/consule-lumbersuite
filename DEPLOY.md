# Consule LumberSuite - NetSuite Deployment Guide

## Quick Start

```bash
npm install
npm run deploy
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run deploy` | Deploy all files to NetSuite |
| `npm run deploy:lib` | Deploy only lib/ folder |
| `npm run deploy:control` | Deploy only control/ folder |
| `npm run deploy:sales` | Deploy only sales/ folder |
| `npm run deploy:workorder` | Deploy only workorder/ folder |
| `npm run deploy:tally` | Deploy only tally/ folder |
| `npm run deploy:yield` | Deploy only yield/ folder |
| `npm run deploy:repack` | Deploy only repack/ folder |
| `npm run deploy:reporting` | Deploy only reporting/ folder |

## Configuration

Credentials are stored in `.env` file:

```
NS_ACCOUNT_ID=YOUR_ACCOUNT_ID
NS_REALM=YOUR_ACCOUNT_ID
NS_CONSUMER_KEY=your_consumer_key
NS_CONSUMER_SECRET=your_consumer_secret
NS_TOKEN_ID=your_token_id
NS_TOKEN_SECRET=your_token_secret
```

## Setting Up NetSuite Credentials

### 1. Create an Integration Record

1. Go to **Setup > Integration > Manage Integrations > New**
2. Name: `LumberSuite Deploy`
3. Check **Token-Based Authentication**
4. Save and copy:
   - Consumer Key → `NS_CONSUMER_KEY`
   - Consumer Secret → `NS_CONSUMER_SECRET`

### 2. Create an Access Token

1. Go to **Setup > Users/Roles > Access Tokens > New**
2. Select the Application (Integration) you just created
3. Select your User and Role
4. Save and copy:
   - Token ID → `NS_TOKEN_ID`
   - Token Secret → `NS_TOKEN_SECRET`

## Project Structure

```
consule_lumbersuite/
├── src/FileCabinet/SuiteScripts/ConsuleLumberSuite/
│   ├── control/     - Control Center scripts
│   ├── lib/         - Shared libraries
│   ├── repack/      - Repack functionality
│   ├── reporting/   - Reports & dashboards
│   ├── sales/       - Sales order scripts
│   ├── tally/       - Tally & reconciliation
│   ├── workorder/   - Work order scripts
│   └── yield/       - Yield analysis
├── .env             - Credentials (not in git)
├── deploy.js        - Deployment script
└── package.json
```

## Troubleshooting

### "Could not connect to NetSuite"
- Verify credentials in `.env`
- Ensure TBA is enabled in NetSuite
- Check role has REST Web Services permission

### Files not updating
- The script handles both new files and updates
- Check NetSuite File Cabinet for the uploaded files
