#!/bin/sh
set -eu
: "${TUNE_APPLE_TEAM_ID:?Set the Apple Developer team ID}"
xcodebuild -project ios/TuneArena.xcodeproj -scheme TuneArena -configuration Release -destination 'generic/platform=iOS' -archivePath outputs/TuneArena.xcarchive DEVELOPMENT_TEAM="$TUNE_APPLE_TEAM_ID" -allowProvisioningUpdates archive
printf '%s\n' 'Archive built. Export using Xcode Organizer or xcodebuild -exportArchive with your ExportOptions.plist.'
