# Tune Arena · Turbo Vote

Installable web application for community-voted tuning contests. Project author: Vadym Tsinderhoz.

## Try a contest

1. Start a 60-second test round. Administrators can also start a contest. Demo rounds contain three labelled photographs of real tuned vehicles. The source and license for each image are linked on the site. Organizer-created rounds begin empty.
2. Choose a nickname on first sign-in. Vote for an example or submit an image with a short description. One account can select one like or dislike per entry, switch it, or remove it. Authors cannot react to their own entries. Only hearts determine People’s Choice; dislikes are displayed separately and do not qualify referral activity. Overall standings use hearts + Motors × 5.
3. Wait for voting to close. The server returns the winner in the arena and in `/winners` only at or after the cutoff. It ignores early and late votes. A tie goes to the first accepted entry, and zero votes means no winner.
4. In Garage, activate the one-time three-day Premium trial and open the welcome gift. Choose from six frames. Flame Spec unlocks with the welcome gift. Frames and badges are cosmetic; an active Premium membership also provides exactly one Motor per round, worth five overall points.

## Tuning club referrals

Garage provides an opaque personal referral link, copy and Telegram share actions, the current three-friend progress bar, total invitations, qualified friends and earned Premium days. Every three newly qualified friends add 30 days to the later of now and the current expiry. A new participant arriving through an invitation gets three trial days automatically. A server-side notification is acknowledged separately from the grant; closing it never grants more days.

The `ref` parameter is carried into the first state request and an HttpOnly, Secure, SameSite=Lax cookie for 30 days. ChatGPT sign-in retains the original return URL; email and Telegram login retain the browser cookie. A participant can enroll only when their profile is first created. Existing profiles, self-referrals, alternate invitation URLs and repeated requests cannot claim another welcome gift. Email/Telegram integration setup and the host's visitor access policy still apply; public browsing is controlled by the host audience policy; submitting and voting still require sign-in.

A friend must choose a nickname and either submit one real image entry to an organizer's community contest, or have ten retained votes on different real entries in community contests after joining. Test rounds, gallery samples, hidden entries, self-votes and votes on the inviter's entries are excluded. A qualification records completed activity; it is not revoked by later vote removal or moderation. Counters cannot be supplied by the client. Transactional D1 batches record the cumulative three-friend groups and credited groups together with the Premium extension so retries or simultaneous refreshes cannot double-credit them.

This is activity gating, not proof of unique humans. Separate authenticated fake accounts or coordinated real uploads require additional abuse controls before a public incentive programme. The welcome bonus is three days of Premium, including its one-Motor-per-round allowance.

A weekly round can be reached through its URL by an authorized visitor. A short round belongs to the account that creates it. The application supports public browsing and authenticated participation. The displayed 100 USDT is an illustrative prize. Wallet collection, transfers and paid checkout are inactive.

## Photos and reactions

The entry form offers a browser camera, a gallery picker, and a native phone-camera capture input. Camera access starts only after a click, requests video without audio, and releases tracks when closed, after selecting a photo, or on unmount. The native capture input provides an alternative when browser camera access is unavailable. Actual device permissions and camera support still require verification on the target phone.

A selected image stays on the device until the user submits the entry form. It is decoded, resized to at most 2048 pixels on its longest side, and encoded as JPEG, with a maximum prepared size of 4 MiB. Re-encoding does not preserve the source file's metadata. A preview can be removed or replaced. This does not authenticate when or where a photograph was taken. An unreadable image produces a validation error.

Comments are disabled throughout the application. Posts have no comment controls or forms; the former comment endpoints return 404 for reads and writes. The administrator interface and APIs do not expose comment data or statistics. Historical stored records are left untouched. Dislikes are recorded in the same unique account/entry row as likes, and administration shows the negative counts and audit actions.

## Race control

Set `TUNE_ADMIN_EMAIL` as a runtime secret for the verified site owner. The separate `/admin` page and administration APIs require the matching authenticated account. It publishes new rounds and notices, lists projects and vote totals, shows new vote changes and application activity, moderates entries, and posts an announcement for the automatically published result. Hiding an entry after the cutoff is blocked so the final ranking stays stable.

## Storage and authentication

D1 holds accounts, entries, rounds, votes and cosmetic entitlements. R2 holds image uploads. The hosted application uses ChatGPT sign-in for authenticated participation; a public audience allows anonymous browsing. Two optional application login integrations are included and disabled until configured:

- Email link: set `APP_ORIGIN`, `RESEND_API_KEY` and `EMAIL_FROM` with a verified sending domain. The one-time link is bound to the initiating browser and expires in 15 minutes.
- Telegram OIDC: set `APP_ORIGIN`, `TELEGRAM_CLIENT_ID` and `TELEGRAM_CLIENT_SECRET`. Register the origin and `/api/auth/telegram/callback` in BotFather. Keep the default RS256 algorithm. The flow checks state, PKCE, signature, issuer, audience and expiry.

Configure secrets as runtime variables. No external credentials belong in the source tree.

## Validation

- `python3 tests/contest_rules.py` runs the production vote, entry and leaderboard SQL against SQLite.
- `node tests/arena_flow.mjs` exercises the production HTTP handlers with fixture identities and a controllable database clock, including referral enrollment, cookie retention, threshold exclusions, welcome expiration, reward stacking, concurrent retries and notification acknowledgement. These tests use SQLite and do not establish behavior under real public traffic or unique-human verification.
- `npm exec tsc -- --noEmit` checks TypeScript.
- `npm run build` builds the application.
- Apply the tracked Drizzle migration to the D1 database. Use the Sites runtime to supply the `DB` and `BUCKET` bindings.

Country hints select one of Portuguese, Spanish, Russian, Ukrainian, French and English. When the country is unmapped, the browser language and then English are used. The language selector overrides automatic selection on that device. Participant posts remain in their original language.

## Install on a device

Open `/install` for iPhone/iPad, Android, Windows and Mac instructions, browser installation and a downloadable Android **test** APK. A same-origin web app manifest declares standalone display and 192/512-pixel icons. On iPhone use Safari → Share → Add to Home Screen; desktop Chrome/Edge and Android Chrome can offer browser installation. Browser and OS support varies.

The service worker precaches only `/offline.html` and public icons. Account pages, API responses, votes, uploads, admin pages and auth links are never cached or queued. Contests require internet. Four dedicated tests cover manifest icons and the worker's privacy boundary.

The downloadable APK is debug-signed and build/lint checked; it is not a signed Google Play production release. No App Store, Google Play, DMG or EXE publication is claimed by the PWA release.

### iPhone install-button correction

On iOS, JavaScript cannot open the browser's installation confirmation. The previous fallback silently scrolled to the device cards. The corrected button says how to install on iPhone and opens a native HTML dialog with Safari Share → Add to Home Screen steps, instructions for links opened inside other apps, and a copyable installation URL. On iPhone/iPad the Android APK card is hidden. Mac-style iPadOS user agents are resolved again on the client using touch capability. Supported Chromium browsers retain their real install prompt.

Seven PWA tests cover the offline boundary, iOS/embedded/iPad detection and manual/prompt decisions. Dialog and clipboard feedback were checked in Chrome; physical iPhone installation is not claimed as verified.

## Charged Garage — 8 November 2026

Active Premium adds avatar frames, a neon/carbon post outline, a badge and colored nickname. Every Premium account can spend one Motor per round (including when Premium starts mid-round). A Motor is independent of ordinary reactions, is worth 5 overall points, cannot be transferred or refunded, and never votes for its author. Renewing Premium does not reset the allowance. Expiration removes cosmetics and prevents unused Motor spending; accepted Motors remain counted. A primary key `(round_id,voter)` enforces the limit atomically, including concurrent requests. Hidden entries and out-of-window votes are excluded. Motor actions are audited.

Two independent results: People’s Choice uses hearts only and grants exactly one calendar month of Premium in weekly rounds. Overall uses hearts + Motors × 5 and grants the persistent Round Champion title. The same build may win both. Ties in each category use the earliest accepted entry (database insertion order breaks equal timestamps). No positive score means no winner in that category. Dislikes subtract no points. Test rounds grant neither Premium nor an honorary title.

Migration 0005 enables active and new rounds, preserving historical closed rounds without retroactive rewards. A unique round award ledger and its database trigger atomically credit the heart winner once when results are first requested after the cutoff. Existing Premium is extended from the later of now and expiry; calendar month arithmetic clamps to the destination month’s last day and preserves time of day. Concurrent refreshes cannot duplicate the grant. Winners, both standings, the Motor balance, champion titles and administrator audit/counts are exposed in their respective screens. Paid subscription billing remains unconnected; existing trial and referral grants remain available.

Validation: production-route integration tests exercise concurrent competing Motor requests, retries, expiry, per-round reset, self/hidden/cutoff restrictions, distinct winners, Motor-only winners, calendar-month extension and clamping, repeated settlement, stored champion titles, admin announcements and test-round reward exclusion. Existing reaction, referral, SQL and PWA regression suites remain in `npm test`.

## Premium build replacement

Regular users have one fixed submission per round. Active Premium unlocks replacement and withdrawal of their own current build before the entry cutoff. Weekly rounds default to Friday, 20:00 Europe/Lisbon (including daylight-saving time), capped at voting close for short rounds. An organizer can override this when creating the round. Tests use their voting cutoff. Existing rounds initialize the entry cutoff from their opening date on first access. Voting stays open after entries lock.

Replacement requires a valid new image and confirmation that the score resets. It atomically retires the old post, creates a fresh post ID, clears old hearts and dislikes, and writes an audit event. Old Motor points stop counting, while the unique per-round Motor spend remains consumed. Stale requests cannot vote for the new photo through the old ID. Retired posts and media are excluded from public responses; administrators retain historical revisions for moderation. Hidden entries cannot bypass moderation through replacement.

Withdrawal unpublishes the current post. Premium members may replace it before the cutoff; losing Premium does not free the regular one-submission slot. Database-clock checks protect both upload and replacement, even if the deadline passes during the image upload. Failed transactions preserve the old post and remove the staged image. Concurrent replacements create only one current post.

Validation includes production API integration tests for permissions, ownership, moderation, consent, invalid photos, reaction reset, no Motor refund, stale requests, concurrent replacements, forced transaction rollback, withdrawal/re-entry, Premium expiry, an upload crossing the entry cutoff, staged-media cleanup, continued voting, final winners and administrator audit. Unit tests cover Lisbon calendar conversion, daylight-saving changes and invalid deadlines.

## Commerce, sponsors and trophies

Implemented partner campaigns and labelled native placements, a catalogue and transactionally reserved stock, invoice verification and optional Stripe Checkout/webhooks, VIP entitlements, moderated paid retries, promotional slots/pins, fulfilment/refund tracking and verified trophies with an optional ERC-721 mint workflow. See [current Russian architecture and activation guide](docs/COMMERCIAL_IMPLEMENTATION_RU.md). External seller details, real products/prices, payment credentials, shipping operations, partner agreements and an NFT deployment must be supplied by the operator. All new commercial pages are currently in Russian; the existing six-language arena is preserved.

## Advertising vacancy and UI regression checks

The two workshop parts cards are replaced by a localized advertising vacancy with an actionable administration inquiry link. `npm test` now also runs rendered React interaction tests across arena, Premium, advertising, commercial administration, moderation, winners and installation-help controls. See [UI validation scope](docs/UI_VALIDATION_2026-11-08_RU.md) for verified actions and external-device/payment limits.
