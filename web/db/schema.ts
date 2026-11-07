import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, primaryKey, index, uniqueIndex, sqliteView } from "drizzle-orm/sqlite-core";

export const rounds = sqliteTable("rounds", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  kind: text("kind").notNull(),
  opens: integer("opens").notNull(),
  closes: integer("closes").notNull(),
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
}, t => [index("entry_round").on(t.roundId,t.created)]);

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
    WHERE e.round_id=r.id AND e.hidden=0 AND v.value=1 AND v.created>=r.opens AND v.created<r.closes
    GROUP BY e.id ORDER BY count(*) DESC,e.created ASC,e.rowid ASC LIMIT 1
  ) AS winner_id FROM rounds r WHERE r.closes<=unixepoch()
`);
