CREATE TABLE sponsors (
 id text PRIMARY KEY, name text NOT NULL, category text NOT NULL, logo text NOT NULL DEFAULT '', website text NOT NULL DEFAULT '', created integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE campaigns (
 id text PRIMARY KEY, sponsor_id text NOT NULL REFERENCES sponsors(id), round_id text REFERENCES rounds(id), period text NOT NULL CHECK(period IN ('week','month')),
 title text NOT NULL, starts integer NOT NULL, ends integer NOT NULL CHECK(ends>starts), state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','confirmed','active','closed','paused')),
 link text NOT NULL DEFAULT '', promo text NOT NULL DEFAULT '', prize text NOT NULL DEFAULT '', prize_state text NOT NULL DEFAULT 'unconfirmed',
 prize_reference text NOT NULL DEFAULT '', fee_minor integer NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'eur', confirmed integer NOT NULL DEFAULT 0,
 created integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE sponsor_posts (
 id text PRIMARY KEY,campaign_id text NOT NULL REFERENCES campaigns(id),title text NOT NULL,body text NOT NULL,image text NOT NULL DEFAULT '',video text NOT NULL DEFAULT '',published integer NOT NULL DEFAULT 0,created integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE sponsor_events (
 campaign_id text NOT NULL REFERENCES campaigns(id),event_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('impression','click','promo')),created integer NOT NULL,
 PRIMARY KEY(campaign_id,event_id,kind)
);
--> statement-breakpoint
CREATE TABLE partner_leads (
 id text PRIMARY KEY,owner text NOT NULL,brand text NOT NULL,category text NOT NULL,offer text NOT NULL,contact text NOT NULL,state text NOT NULL DEFAULT 'new',created integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE products (
 id text PRIMARY KEY,name text NOT NULL,kind text NOT NULL CHECK(kind IN ('premium','priority','slot','retry','pin','merch')),
 description text NOT NULL DEFAULT '',image text NOT NULL DEFAULT '',variant text NOT NULL DEFAULT '',amount integer NOT NULL CHECK(amount>=0),currency text NOT NULL DEFAULT 'eur',
 stock integer NOT NULL DEFAULT -1 CHECK(stock>=-1),duration integer NOT NULL DEFAULT 2592000 CHECK(duration BETWEEN 60 AND 31536000),active integer NOT NULL DEFAULT 0,
 shipping_minor integer NOT NULL DEFAULT 0 CHECK(shipping_minor>=0),terms text NOT NULL DEFAULT '',created integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE commerce_orders (
 id text PRIMARY KEY,owner text NOT NULL,request_key text NOT NULL,product_id text NOT NULL REFERENCES products(id),name text NOT NULL,kind text NOT NULL,
 amount integer NOT NULL,currency text NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10),duration integer NOT NULL,
 round_id text REFERENCES rounds(id),entry_id text REFERENCES entries(id),state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paid','shipped','completed','cancelled','expired','refund_pending','refunded','disputed')),
 payment_method text NOT NULL,provider_session text UNIQUE,payment_intent text NOT NULL DEFAULT '',external_reference text NOT NULL DEFAULT '',
 tracking text NOT NULL DEFAULT '',refund_reason text NOT NULL DEFAULT '',created integer NOT NULL,expires integer NOT NULL,paid_at integer NOT NULL DEFAULT 0,
 UNIQUE(owner,request_key)
);
--> statement-breakpoint
CREATE TABLE commerce_entitlements (
 order_id text PRIMARY KEY REFERENCES commerce_orders(id),owner text NOT NULL,kind text NOT NULL,round_id text REFERENCES rounds(id),entry_id text REFERENCES entries(id),
 starts integer NOT NULL,ends integer NOT NULL,consumed integer NOT NULL DEFAULT 0,revoked integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE payment_events (id text PRIMARY KEY,kind text NOT NULL,created integer NOT NULL);
--> statement-breakpoint
CREATE TABLE commerce_audit (id text PRIMARY KEY,actor text NOT NULL,action text NOT NULL,target text NOT NULL,reference text NOT NULL DEFAULT '',created integer NOT NULL);
--> statement-breakpoint
CREATE TABLE trophies (
 code text PRIMARY KEY,round_id text NOT NULL REFERENCES rounds(id),entry_id text NOT NULL REFERENCES entries(id),owner text NOT NULL,category text NOT NULL,
 issued integer NOT NULL,revoked integer NOT NULL DEFAULT 0,reason text NOT NULL DEFAULT '',wallet text NOT NULL DEFAULT '',tx_hash text NOT NULL DEFAULT '',token_id text NOT NULL DEFAULT '',
 UNIQUE(round_id,category)
);
--> statement-breakpoint
ALTER TABLE entries ADD moderation_state text NOT NULL DEFAULT 'approved';
--> statement-breakpoint
ALTER TABLE entries ADD moderation_reason text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TRIGGER reserve_commerce_order BEFORE INSERT ON commerce_orders BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM products p WHERE p.id=NEW.product_id AND p.active=1 AND (p.stock=-1 OR p.stock>=NEW.quantity)) THEN RAISE(ABORT,'unavailable_product') END;
 END;
--> statement-breakpoint
CREATE TRIGGER deduct_commerce_stock AFTER INSERT ON commerce_orders BEGIN
 UPDATE products SET stock=stock-NEW.quantity WHERE id=NEW.product_id AND stock>=0;
 END;
--> statement-breakpoint
CREATE TRIGGER release_commerce_stock AFTER UPDATE OF state ON commerce_orders
 WHEN (OLD.state='pending' AND NEW.state IN ('cancelled','expired')) OR (OLD.state IN ('paid','refund_pending','disputed') AND NEW.state='refunded' AND OLD.kind<>'merch') BEGIN
 UPDATE products SET stock=stock+NEW.quantity WHERE id=NEW.product_id AND stock>=0;
 END;
--> statement-breakpoint
CREATE TRIGGER fulfill_commerce_order AFTER UPDATE OF state ON commerce_orders WHEN OLD.state='pending' AND NEW.state='paid' BEGIN
 INSERT INTO commerce_entitlements(order_id,owner,kind,round_id,entry_id,starts,ends)
 SELECT NEW.id,NEW.owner,NEW.kind,NEW.round_id,NEW.entry_id,CASE WHEN NEW.kind='premium' THEN max((SELECT premium_until FROM profiles WHERE id=NEW.owner),unixepoch()) ELSE unixepoch() END,CASE WHEN NEW.kind='premium' THEN max((SELECT premium_until FROM profiles WHERE id=NEW.owner),unixepoch()) ELSE unixepoch() END+NEW.duration WHERE NEW.kind<>'merch';
 UPDATE profiles SET premium_until=max(premium_until,unixepoch())+NEW.duration,frame=CASE WHEN frame='plain' THEN 'neon' ELSE frame END WHERE id=NEW.owner AND NEW.kind='premium';
 END;
--> statement-breakpoint
CREATE TRIGGER revoke_commerce_order AFTER UPDATE OF state ON commerce_orders WHEN NEW.state IN ('refund_pending','refunded','disputed') BEGIN
 UPDATE commerce_entitlements SET revoked=1 WHERE order_id=NEW.id;
 UPDATE profiles SET premium_until=max(unixepoch(),premium_until-coalesce((SELECT min(NEW.duration,max(0,ends-max(unixepoch(),starts))) FROM commerce_entitlements WHERE order_id=NEW.id),0)) WHERE id=NEW.owner AND NEW.kind='premium' AND OLD.state NOT IN ('refund_pending','refunded','disputed');
 END;
--> statement-breakpoint
CREATE TABLE commerce_settings (key text PRIMARY KEY,value text NOT NULL);
--> statement-breakpoint
CREATE TABLE order_shipping (order_id text PRIMARY KEY REFERENCES commerce_orders(id),address text NOT NULL);
