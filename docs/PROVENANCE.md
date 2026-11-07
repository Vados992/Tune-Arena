# Provenance

- Owner / author: Vadym Tsinderhoz, GitHub Vados992.
- Export date: 2026-11-07.
- Canonical web source: existing Tune Arena Site, commit `a334fba75dd23d6a25f9fac3b247f566f3ac1c45`.
- Export preserves the current no-comments / like-dislike / camera / referrals feature set.
- This repository adds standalone authentication policy, local setup and independently buildable native client projects. It does not export deployment secrets or user databases, or change the hosted pilot's access policy.
- Platform clients are online applications displaying the shared self-owned web system. Source code is included; native store approval and signing are separate release work.

Primary implementation references:

- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/api/session
- https://www.electronjs.org/docs/latest/tutorial/code-signing
- https://www.electron.build/v26/docs/mac/
- https://developer.apple.com/documentation/webkit/wkuidelegate
- https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- https://developer.android.com/reference/android/webkit/WebChromeClient
- https://developer.android.com/build/releases/agp-8-13-0-release-notes
- https://docs.gradle.org/8.13/release-notes.html

Gradle Wrapper JAR downloaded from the official Gradle v8.13.0 source and verified against the official wrapper checksum: `81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f`.
