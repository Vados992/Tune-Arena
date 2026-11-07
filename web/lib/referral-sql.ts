// Every group below runs in one D1 batch transaction. changes() belongs to
// the immediately preceding statement, never to a client-supplied counter.
export const registerReferral = `
  INSERT OR IGNORE INTO referrals(invitee,inviter,joined)
  SELECT ?,c.user_id,unixepoch() FROM referral_codes c
  WHERE changes()>0 AND c.code=? AND c.user_id<>?`;

export const welcomePremium = `
  UPDATE profiles SET premium_until=max(premium_until,unixepoch())+259200,
    frame=CASE WHEN frame='plain' THEN 'neon' ELSE frame END
  WHERE id=? AND changes()>0`;

export const qualifyReferrals = `
  UPDATE referrals SET qualified=unixepoch()
  WHERE qualified=0 AND (invitee=? OR inviter=?)
    AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=invitee AND p.nickname IS NOT NULL)
    AND (EXISTS(
      SELECT 1 FROM entries e JOIN rounds r ON r.id=e.round_id
      WHERE e.owner=referrals.invitee AND e.hidden=0 AND r.kind='weekly'
        AND e.media LIKE 'entries/%' AND e.created>=referrals.joined
        AND e.created>=r.opens AND e.created<r.closes
    ) OR (
      SELECT count(*) FROM votes v JOIN entries e ON e.id=v.entry_id
        JOIN rounds r ON r.id=e.round_id
      WHERE v.voter=referrals.invitee AND v.value=1 AND e.hidden=0 AND r.kind='weekly'
        AND e.media LIKE 'entries/%' AND e.owner<>referrals.invitee
        AND e.owner<>referrals.inviter AND v.created>=referrals.joined
        AND v.created>=r.opens AND v.created<r.closes
    )>=10)`;

export const calculateRewards = `
  UPDATE referral_rewards SET batches=(
    SELECT count(*)/3 FROM referrals WHERE inviter=referral_rewards.inviter AND qualified>0
  ) WHERE inviter=? AND batches<(
    SELECT count(*)/3 FROM referrals WHERE inviter=referral_rewards.inviter AND qualified>0
  )`;

export const creditRewards = `
  UPDATE profiles SET premium_until=max(premium_until,unixepoch())+2592000*(
    SELECT batches-credited_batches FROM referral_rewards WHERE inviter=profiles.id
  ),frame=CASE WHEN frame='plain' THEN 'neon' ELSE frame END
  WHERE id=? AND EXISTS(SELECT 1 FROM referral_rewards
    WHERE inviter=profiles.id AND batches>credited_batches)`;

export const settleRewards = `
  UPDATE referral_rewards SET credited_batches=batches WHERE inviter=?`;
