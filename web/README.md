# Tune Arena · Turbo Vote

Private pilot for community-voted tuning contests. Project author: Vadym Tsinderhoz.

## Try a contest

1. Start a 60-second test round. Administrators can also start a contest. Demo rounds contain three labelled photographs of real tuned vehicles. The source and license for each image are linked on the site. Organizer-created rounds begin empty.
2. Choose a nickname on first sign-in. Vote for an example or submit an image with a short description. One account can select one like or dislike per entry, switch it, or remove it. Authors cannot react to their own entries. Only likes determine the winner; dislikes are displayed separately and do not qualify referral activity.
3. Wait for voting to close. The server returns the winner in the arena and in `/winners` only at or after the cutoff. It ignores early and late votes. A tie goes to the first accepted entry, and zero votes means no winner.
4. In Garage, activate the one-time three-day Premium trial and open the welcome gift. Choose from six frames. Flame Spec unlocks with the welcome gift. Frames and badges have no impact on votes. Existing Premium expiry dates are preserved.

## Tuning club referrals

Garage provides an opaque personal referral link, copy and Telegram share actions, the current three-friend progress bar, total invitations, qualified friends and earned Premium days. Every three newly qualified friends add 30 days to the later of now and the current expiry. A new participant arriving through an invitation gets three trial days automatically. A server-side notification is acknowledged separately from the grant; closing it never grants more days.

The `ref` parameter is carried into the first state request and an HttpOnly, Secure, SameSite=Lax cookie for 30 days. ChatGPT sign-in retains the original return URL; email and Telegram login retain the browser cookie. A participant can enroll only when their profile is first created. Existing profiles, self-referrals, alternate invitation URLs and repeated requests cannot claim another welcome gift. Email/Telegram integration setup and the host's visitor access policy still apply; this release does not open the owner-private pilot to new visitors.

A friend must choose a nickname and either submit one real image entry to an organizer's community contest, or have ten retained votes on different real entries in community contests after joining. Test rounds, gallery samples, hidden entries, self-votes and votes on the inviter's entries are excluded. A qualification records completed activity; it is not revoked by later vote removal or moderation. Counters cannot be supplied by the client. Transactional D1 batches record the cumulative three-friend groups and credited groups together with the Premium extension so retries or simultaneous refreshes cannot double-credit them.

This is activity gating, not proof of unique humans. Separate authenticated fake accounts or coordinated real uploads require additional abuse controls before a public incentive programme. The welcome bonus is three days of cosmetic Premium; no weighted super-like was introduced.

A weekly round can be reached through its URL by an authorized visitor. A short round belongs to the account that creates it. The hosted pilot is owner-private. The displayed 100 USDT is an illustrative prize. Wallet collection, transfers and paid checkout are inactive.

## Photos and reactions

The entry form offers a browser camera, a gallery picker, and a native phone-camera capture input. Camera access starts only after a click, requests video without audio, and releases tracks when closed, after selecting a photo, or on unmount. The native capture input provides an alternative when browser camera access is unavailable. Actual device permissions and camera support still require verification on the target phone.

A selected image stays on the device until the user submits the entry form. It is decoded, resized to at most 2048 pixels on its longest side, and encoded as JPEG, with a maximum prepared size of 4 MiB. Re-encoding does not preserve the source file's metadata. A preview can be removed or replaced. This does not authenticate when or where a photograph was taken. An unreadable image produces a validation error.

Comments are disabled throughout the application. Posts have no comment controls or forms; the former comment endpoints return 404 for reads and writes. The administrator interface and APIs do not expose comment data or statistics. Historical stored records are left untouched. Dislikes are recorded in the same unique account/entry row as likes, and administration shows the negative counts and audit actions.

## Race control

Set `TUNE_ADMIN_EMAIL` as a runtime secret for the verified site owner. The separate `/admin` page and administration APIs require the matching authenticated account. It publishes new rounds and notices, lists projects and vote totals, shows new vote changes and application activity, moderates entries, and posts an announcement for the automatically published result. Hiding an entry after the cutoff is blocked so the final ranking stays stable.

## Storage and authentication

D1 holds accounts, entries, rounds, votes and cosmetic entitlements. R2 holds image uploads. The deployed preview uses the platform sign-in gate. Two optional application login integrations are included and disabled until configured:

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
