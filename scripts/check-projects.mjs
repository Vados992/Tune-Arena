import {readFileSync,existsSync}from "node:fs";
import assert from "node:assert/strict";
const expected=JSON.parse(readFileSync("config/server.json")).appUrl;
for(const p of ["desktop/server.json","ios/TuneArena/ServerConfig.json","android/app/src/main/assets/server.json"])assert.equal(JSON.parse(readFileSync(p)).appUrl,expected,p);
for(const p of ["macos/electron-builder.cjs","windows/electron-builder.cjs","desktop/main.cjs","ios/TuneArena.xcodeproj/project.pbxproj","ios/TuneArena.xcodeproj/xcshareddata/xcschemes/TuneArena.xcscheme","ios/TuneArena/Info.plist","ios/TuneArena/Assets.xcassets/AppIcon.appiconset/Contents.json","android/gradlew","android/gradle/wrapper/gradle-wrapper.jar","android/app/src/main/AndroidManifest.xml","android/app/src/main/java/com/tsinderhoz/tunearena/MainActivity.java"])assert(existsSync(p),p);
const android=readFileSync("android/app/src/main/AndroidManifest.xml","utf8");assert(android.includes('android.permission.CAMERA'));assert(!android.includes('RECORD_AUDIO'));assert(android.includes('usesCleartextTraffic="false"'));
assert(readFileSync("desktop/main.cjs","utf8").includes('nodeIntegration:false'));
console.log("PASS: all four client project inputs exist, shared server configuration matches, Android has no microphone permission and Electron remote content has no Node integration.");
