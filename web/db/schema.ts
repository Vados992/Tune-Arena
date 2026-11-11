import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, primaryKey, index, uniqueIndex, sqliteView } from "drizzle-orm/sqlite-core";

export const rounds = sqliteTable("rounds", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  kind: text("kind").notNull(),
  opens: integer("opens").notNull(),
  closes: integer("closes").notNull(),
  submissionCloses:integer("submission_closes"),
  title: text("title").notNull().default(""),
  notice: text("notice").notNull().default(""),
  prize: text("prize").notNull().default(""),
  announced: integer("announced").notNull().default(0),
}, t => [index("round_owner").on(t.owner,t.opens),index("round_closes").on(t.closes)]);

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => rounds.id),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  media: text("media").notNull(),
  created: integer("created").notNull(),
  hidden: integer("hidden").notNull().default(0),
  withdrawn:integer("withdrawn").notNull().default(0),
  supersededBy:text("superseded_by"),
  moderationState:text("moderation_state").notNull().default("approved"),
  moderationReason:text("moderation_reason").notNull().default(""),
}, t => [index("entry_round").on(t.roundId,t.created),index("entry_owner_round").on(t.roundId,t.owner,t.supersededBy)]);

export const votes = sqliteTable("votes", {
  entryId: text("entry_id").notNull().references(() => entries.id),
  voter: text("voter").notNull(),
  created: integer("created").notNull(),
  value: integer("value").notNull().default(1),
}, t => [primaryKey({columns:[t.entryId,t.voter]})]);

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  premiumUntil: integer("premium_until").notNull().default(0),
  frame: text("frame").notNull().default("plain"),
  gift: integer("gift").notNull().default(0),
  nickname: text("nickname"),
  nicknameKey: text("nickname_key"),
}, t => [uniqueIndex("profile_nickname_key").on(t.nicknameKey)]);

export const referralCodes = sqliteTable("referral_codes", {
  userId: text("user_id").primaryKey().references(() => profiles.id),
  code: text("code").notNull(),
}, t => [uniqueIndex("referral_code_unique").on(t.code)]);

export const referrals = sqliteTable("referrals", {
  invitee: text("invitee").primaryKey().references(() => profiles.id),
  inviter: text("inviter").notNull().references(() => profiles.id),
  joined: integer("joined").notNull(),
  qualified: integer("qualified").notNull().default(0),
  welcomeSeen: integer("welcome_seen").notNull().default(0),
}, t => [index("referral_inviter").on(t.inviter,t.qualified)]);

export const referralRewards = sqliteTable("referral_rewards", {
  inviter: text("inviter").primaryKey().references(() => profiles.id),
  batches: integer("batches").notNull().default(0),
  creditedBatches: integer("credited_batches").notNull().default(0),
  notifiedBatches: integer("notified_batches").notNull().default(0),
});

export const authChallenges = sqliteTable("auth_challenges", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  subject: text("subject").notNull(),
  browser: text("browser").notNull(),
  quota: text("quota").notNull(),
  secret: text("secret").notNull(),
  created: integer("created").notNull(),
  expires: integer("expires").notNull(),
}, t => [index("challenge_rate").on(t.kind,t.created)]);

export const identities = sqliteTable("identities", {
  provider: text("provider").notNull(),
  subject: text("subject").notNull(),
  userId: text("user_id").notNull(),
}, t => [primaryKey({columns:[t.provider,t.subject]})]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expires: integer("expires").notNull(),
});


export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => entries.id),
  author: text("author").notNull(),
  body: text("body").notNull(),
  created: integer("created").notNull(),
  hidden: integer("hidden").notNull().default(0),
}, t => [
  index("comment_entry_time").on(t.entryId,t.created),
  index("comment_author_time").on(t.author,t.created),
]);

export const adminEvents = sqliteTable("admin_events", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => rounds.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  created: integer("created").notNull(),
}, t => [index("admin_event_round_time").on(t.roundId,t.created)]);

export const voteEvents = sqliteTable("vote_events", {
  id: integer("id").primaryKey({autoIncrement:true}),
  roundId: text("round_id").notNull().references(() => rounds.id),
  entryId: text("entry_id").notNull().references(() => entries.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  created: integer("created").notNull(),
}, t => [
  index("vote_event_round_time").on(t.roundId,t.created),
  index("vote_event_time").on(t.created),
]);

export const roundOutcomes = sqliteView("round_outcomes", {
  roundId: text("round_id").notNull(),
  winnerId: text("winner_id"),
}).as(sql`
  SELECT r.id AS round_id, (
    SELECT e.id FROM entries e JOIN votes v ON v.entry_id=e.id
    WHERE e.round_id=r.id AND e.hidden=0 AND e.withdrawn=0 AND (r.kind='test' OR e.media NOT LIKE 'sample:%') AND v.value=1 AND v.created>=r.opens AND v.created<r.closes
    GROUP BY e.id ORDER BY count(*) DESC,e.created ASC,e.rowid ASC LIMIT 1
  ) AS winner_id FROM rounds r WHERE r.closes<=unixepoch()
`);

export const motors = sqliteTable("motors", {
 roundId:text("round_id").notNull().references(()=>rounds.id),
 voter:text("voter").notNull().references(()=>profiles.id),
 entryId:text("entry_id").notNull().references(()=>entries.id),
 created:integer("created").notNull(),
},t=>[primaryKey({columns:[t.roundId,t.voter]}),index("motor_entry").on(t.entryId)]);
export const chargedRounds = sqliteTable("charged_rounds", {
 roundId:text("round_id").primaryKey().references(()=>rounds.id),
});
export const roundAwards = sqliteTable("round_awards", {
 roundId:text("round_id").primaryKey().references(()=>rounds.id),
 popularEntry:text("popular_entry").references(()=>entries.id),
 overallEntry:text("overall_entry").references(()=>entries.id),
 created:integer("created").notNull(),
});

export const overallOutcomes=sqliteView("overall_outcomes",{roundId:text("round_id").notNull(),winnerId:text("winner_id")}).as(sql`
WITH scored AS (
 SELECT e.id,e.round_id,e.created,e.rowid AS ordinal,
 (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes)
 +5*(SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes) AS score
 FROM entries e JOIN rounds r ON r.id=e.round_id
 WHERE e.hidden=0 AND e.withdrawn=0 AND (r.kind='test' OR e.media NOT LIKE 'sample:%')
), ranked AS (
 SELECT round_id,id,row_number() OVER(PARTITION BY round_id ORDER BY score DESC,created ASC,ordinal ASC) AS position
 FROM scored WHERE score>0
)
SELECT r.id AS round_id,w.id AS winner_id FROM rounds r
LEFT JOIN ranked w ON w.round_id=r.id AND w.position=1
WHERE r.closes<=unixepoch()`);

export const sponsors=sqliteTable("sponsors",{
 id:text("id").primaryKey(),
 name:text("name").notNull(),
 category:text("category").notNull(),
 logo:text("logo").notNull().default(""),
 website:text("website").notNull().default(""),
 created:integer("created").notNull()
});

export const campaigns=sqliteTable("campaigns",{
 id:text("id").primaryKey(),
 sponsorId:text("sponsor_id").notNull().references(()=>sponsors.id),
 roundId:text("round_id").references(()=>rounds.id),
 period:text("period").notNull(),
 title:text("title").notNull(),
 starts:integer("starts").notNull(),
 ends:integer("ends").notNull(),
 state:text("state").notNull().default("draft"),
 link:text("link").notNull().default(""),
 promo:text("promo").notNull().default(""),
 prize:text("prize").notNull().default(""),
 prizeState:text("prize_state").notNull().default("unconfirmed"),
 prizeReference:text("prize_reference").notNull().default(""),
 feeMinor:integer("fee_minor").notNull().default(0),
 currency:text("currency").notNull().default("eur"),
 confirmed:integer("confirmed").notNull().default(0),
 created:integer("created").notNull()
});

export const sponsorPosts=sqliteTable("sponsor_posts",{
 id:text("id").primaryKey(),
 campaignId:text("campaign_id").notNull().references(()=>campaigns.id),
 title:text("title").notNull(),
 body:text("body").notNull(),
 image:text("image").notNull().default(""),
 video:text("video").notNull().default(""),
 published:integer("published").notNull().default(0),
 created:integer("created").notNull()
});

export const sponsorEvents=sqliteTable("sponsor_events",{
 campaignId:text("campaign_id").notNull().references(()=>campaigns.id),
 eventId:text("event_id").notNull(),
 kind:text("kind").notNull(),
 created:integer("created").notNull()
},t=>[primaryKey({columns:[t.campaignId,t.eventId,t.kind]})]);

export const partnerLeads=sqliteTable("partner_leads",{
 id:text("id").primaryKey(),
 owner:text("owner").notNull(),
 brand:text("brand").notNull(),
 category:text("category").notNull(),
 offer:text("offer").notNull(),
 contact:text("contact").notNull(),
 state:text("state").notNull().default("new"),
 created:integer("created").notNull()
});

export const products=sqliteTable("products",{
 id:text("id").primaryKey(),
 name:text("name").notNull(),
 kind:text("kind").notNull(),
 description:text("description").notNull().default(""),
 image:text("image").notNull().default(""),
 variant:text("variant").notNull().default(""),
 amount:integer("amount").notNull(),
 currency:text("currency").notNull().default("eur"),
 stock:integer("stock").notNull().default(-1),
 duration:integer("duration").notNull().default(2592000),
 active:integer("active").notNull().default(0),
 shippingMinor:integer("shipping_minor").notNull().default(0),
 terms:text("terms").notNull().default(""),
 created:integer("created").notNull()
});

export const commerceOrders=sqliteTable("commerce_orders",{
 id:text("id").primaryKey(),
 owner:text("owner").notNull(),
 requestKey:text("request_key").notNull(),
 productId:text("product_id").notNull().references(()=>products.id),
 name:text("name").notNull(),
 kind:text("kind").notNull(),
 amount:integer("amount").notNull(),
 currency:text("currency").notNull(),
 quantity:integer("quantity").notNull(),
 duration:integer("duration").notNull(),
 roundId:text("round_id").references(()=>rounds.id),
 entryId:text("entry_id").references(()=>entries.id),
 state:text("state").notNull().default("pending"),
 paymentMethod:text("payment_method").notNull(),
 providerSession:text("provider_session"),
 paymentIntent:text("payment_intent").notNull().default(""),
 externalReference:text("external_reference").notNull().default(""),
 tracking:text("tracking").notNull().default(""),
 refundReason:text("refund_reason").notNull().default(""),
 created:integer("created").notNull(),
 expires:integer("expires").notNull(),
 paidAt:integer("paid_at").notNull().default(0)
},t=>[uniqueIndex("commerce_orders_owner_request_key").on(t.owner,t.requestKey),uniqueIndex("commerce_orders_provider_session").on(t.providerSession)]);

export const commerceEntitlements=sqliteTable("commerce_entitlements",{
 orderId:text("order_id").primaryKey().references(()=>commerceOrders.id),
 owner:text("owner").notNull(),
 kind:text("kind").notNull(),
 roundId:text("round_id").references(()=>rounds.id),
 entryId:text("entry_id").references(()=>entries.id),
 starts:integer("starts").notNull(),
 ends:integer("ends").notNull(),
 consumed:integer("consumed").notNull().default(0),
 revoked:integer("revoked").notNull().default(0)
});

export const paymentEvents=sqliteTable("payment_events",{
 id:text("id").primaryKey(),
 kind:text("kind").notNull(),
 created:integer("created").notNull()
});

export const commerceAudit=sqliteTable("commerce_audit",{
 id:text("id").primaryKey(),
 actor:text("actor").notNull(),
 action:text("action").notNull(),
 target:text("target").notNull(),
 reference:text("reference").notNull().default(""),
 created:integer("created").notNull()
});

export const trophies=sqliteTable("trophies",{
 code:text("code").primaryKey(),
 roundId:text("round_id").notNull().references(()=>rounds.id),
 entryId:text("entry_id").notNull().references(()=>entries.id),
 owner:text("owner").notNull(),
 category:text("category").notNull(),
 issued:integer("issued").notNull(),
 revoked:integer("revoked").notNull().default(0),
 reason:text("reason").notNull().default(""),
 wallet:text("wallet").notNull().default(""),
 txHash:text("tx_hash").notNull().default(""),
 tokenId:text("token_id").notNull().default("")
},t=>[uniqueIndex("trophies_round_id_category").on(t.roundId,t.category)]);

export const commerceSettings=sqliteTable("commerce_settings",{
 key:text("key").primaryKey(),
 value:text("value").notNull()
});

export const orderShipping=sqliteTable("order_shipping",{
 orderId:text("order_id").primaryKey().references(()=>commerceOrders.id),
 address:text("address").notNull()
});

export const avatars = sqliteTable("avatars", {owner:text("owner").primaryKey(),id:text("id").notNull().unique(),updated:integer("updated").notNull()});

export const organizers = sqliteTable("organizers", {
  userId:text("user_id").primaryKey().references(()=>profiles.id),
  canCreate:integer("can_create").notNull().default(0),
  grantedBy:text("granted_by").notNull(),
  created:integer("created").notNull(),
});
export const roundOrganizers = sqliteTable("round_organizers", {
  roundId:text("round_id").notNull().references(()=>rounds.id),
  userId:text("user_id").notNull().references(()=>organizers.userId),
  grantedBy:text("granted_by").notNull(),
  created:integer("created").notNull(),
}, t=>[primaryKey({columns:[t.roundId,t.userId]}),index("round_organizer_user").on(t.userId,t.roundId)]);
export const staffEvents = sqliteTable("staff_events", {
  id:text("id").primaryKey(),
  actor:text("actor").notNull(),
  action:text("action").notNull(),
  subject:text("subject").notNull(),
  roundId:text("round_id").references(()=>rounds.id),
  created:integer("created").notNull(),
}, t=>[index("staff_event_time").on(t.created)]);

// No credentials or public profile remain; this marker revokes stale sessions.
export const deletedAccounts=sqliteTable("deleted_accounts",{
 userId:text("user_id").primaryKey(),
 created:integer("created").notNull(),
});
export const mediaDeletionJobs=sqliteTable("media_deletion_jobs",{
 key:text("key").primaryKey(),
});
