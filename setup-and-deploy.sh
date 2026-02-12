#!/bin/bash
# Consule LumberSuite - SuiteCloud Setup and Deploy Script

# Set Java 17 path
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     Consule LumberSuite - SuiteCloud Setup & Deploy        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check Java version
echo "Checking Java version..."
java -version
echo ""

# Change to src directory
cd "$(dirname "$0")/src"

echo "Step 1: Setting up NetSuite account authentication"
echo "   A browser will open for you to log in to NetSuite."
echo "   After logging in, return here."
echo ""
read -p "Press Enter to continue..."

# Run account setup
suitecloud account:setup

echo ""
echo "Step 2: Deploying project to NetSuite..."
echo ""

# Deploy the project
suitecloud project:deploy

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                   Deployment Complete!                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
