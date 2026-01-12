#!/bin/bash

# OctoProxy Gatekeeper Fix Script
# This script removes the quarantine attribute from OctoProxy.app

APP_NAME="OctoProxy.app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if running from DMG or Applications folder
if [[ -d "$SCRIPT_DIR/$APP_NAME" ]]; then
    APP_PATH="$SCRIPT_DIR/$APP_NAME"
elif [[ -d "/Applications/$APP_NAME" ]]; then
    APP_PATH="/Applications/$APP_NAME"
else
    osascript -e 'display dialog "Cannot find OctoProxy.app. Please install it first." buttons {"OK"} default button "OK" with icon stop with title "OctoProxy Fix"'
    exit 1
fi

echo "Fixing Gatekeeper for: $APP_PATH"

# Remove quarantine attribute
xattr -cr "$APP_PATH" 2>/dev/null

if [[ $? -eq 0 ]]; then
    osascript -e 'display dialog "OctoProxy has been fixed successfully!\n\nYou can now open the app normally." buttons {"OK"} default button "OK" with icon note with title "OctoProxy Fix"'

    # Ask if user wants to open the app now
    RESPONSE=$(osascript -e 'button returned of (display dialog "Would you like to open OctoProxy now?" buttons {"No", "Yes"} default button "Yes" with title "OctoProxy Fix")')

    if [[ "$RESPONSE" == "Yes" ]]; then
        open "$APP_PATH"
    fi
else
    osascript -e 'display dialog "Failed to fix OctoProxy. Please try running this command in Terminal:\n\nxattr -cr /Applications/OctoProxy.app" buttons {"OK"} default button "OK" with icon stop with title "OctoProxy Fix"'
    exit 1
fi
