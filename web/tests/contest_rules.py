"""Exercise the same SQL statements used by the Worker against SQLite."""
import pathlib
import re
import sqlite3
import unittest

root = pathlib.Path(__file__).resolve().parents[1]
statements = dict(re.findall(r"export const (\w+) = `([\s\S]*?)`;", (root / "lib/round-sql.ts").read_text()))
migration = "\n".join(p.read_text() for p in sorted((root / "drizzle").glob("*.sql")))


class ContestRules(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.addCleanup(self.conn.close)
        self.time = 100
        self.conn.create_function("unixepoch", 0, lambda: self.time)
        self.conn.executescript(migration)
        self.conn.executemany("INSERT INTO rounds(id,owner,kind,opens,closes) VALUES(?,?,?,?,?)", [
            ("weekly", "organizer", "weekly", 100, 200),
            ("test", "organizer", "test", 100, 200),
        ])
        self.conn.executemany("INSERT INTO entries(id,round_id,owner,name,description,media,created) VALUES(?,?,?,?,?,?,?)", [
            ("a", "weekly", "author-a", "A", "original", "sample:a", 105),
            ("b", "weekly", "author-b", "B", "original", "sample:b", 105),
            ("t", "test", "author-t", "T", "original", "sample:t", 106),
        ])

    def put(self, entry, user, contest="weekly"):
        return self.conn.execute(statements["insertVote"], (user, entry, contest, user, user)).rowcount

    def remove(self, entry, user, contest="weekly"):
        return self.conn.execute(statements["removeVote"], (entry, user, contest, user)).rowcount

    def submit(self, id, user, contest="weekly"):
        args = (id, user, "Name", "Brief", "entries/" + id, contest, user, user)
        return self.conn.execute(statements["insertEntry"], args).rowcount

    def ranking(self, contest="weekly", user="viewer"):
        return [(r[0], r[6]) for r in self.conn.execute(statements["leaderboard"], (user, user, contest, user))]

    def test_one_like_per_account_and_per_entry(self):
        self.assertEqual(self.put("a", "viewer"), 1)
        self.assertEqual(self.put("a", "viewer"), 0)
        self.assertEqual(self.put("b", "viewer"), 1)
        self.assertEqual(self.remove("b", "viewer"), 1)
        self.assertEqual(self.remove("b", "viewer"), 0)
        self.assertEqual(self.ranking(), [("a", 1), ("b", 0)])

    def test_pre_open_at_cutoff_and_post_cutoff(self):
        self.time = 99
        self.assertEqual(self.put("a", "viewer"), 0)
        self.assertEqual(self.submit("c", "viewer"), 0)
        self.time = 199
        self.assertEqual(self.put("a", "viewer"), 1)
        self.assertEqual(self.put("b", "second"), 1)
        self.assertEqual(self.put("b", "third"), 1)
        self.time = 200
        self.assertEqual(self.put("a", "third"), 0)
        self.assertEqual(self.remove("b", "second"), 0)
        self.assertEqual(self.submit("c", "viewer"), 0)
        self.time = 500
        self.assertEqual(self.ranking(), [("b", 2), ("a", 1)])

    def test_tie_prefers_earlier_database_insert_and_ignores_premium(self):
        self.assertEqual(self.put("b", "viewer"), 1)
        self.assertEqual(self.put("a", "viewer"), 1)
        self.conn.execute("INSERT INTO profiles(id,premium_until,frame,gift) VALUES('author-b',1000,'flame',1)")
        self.time = 200
        self.assertEqual(self.ranking(), [("a", 1), ("b", 1)])

    def test_own_vote_and_foreign_round_are_rejected(self):
        self.assertEqual(self.put("a", "author-a"), 0)
        self.assertEqual(self.put("b", "viewer", "test"), 0)
        self.assertEqual(self.put("t", "viewer", "test"), 0)
        self.assertEqual(self.put("t", "organizer", "test"), 1)
        self.assertEqual(self.ranking("test"), [])

    def test_one_entry_per_round(self):
        self.assertEqual(self.submit("c", "viewer"), 1)
        self.assertEqual(self.submit("d", "viewer"), 0)
        self.assertEqual(self.submit("e", "viewer", "test"), 0)
        self.assertEqual(self.submit("f", "organizer", "test"), 1)

    def test_hidden_entry_neither_accepts_votes_nor_ranks(self):
        self.assertEqual(self.put("a", "first"), 1)
        self.conn.execute("UPDATE entries SET hidden=1 WHERE id='a'")
        self.assertEqual(self.put("a", "second"), 0)
        self.assertEqual(self.remove("a", "first"), 0)
        self.assertEqual(self.ranking(), [("b", 0)])
        self.conn.execute("UPDATE entries SET hidden=0 WHERE id='a'")
        self.assertEqual(self.ranking(), [("a", 1), ("b", 0)])

    def test_leaderboard_reports_only_reactions(self):
        self.conn.execute("INSERT INTO votes(entry_id,voter,created,value) VALUES('a','other',125,-1)")
        cursor = self.conn.execute(statements["leaderboard"], ("viewer", "viewer", "weekly", "viewer"))
        names = [column[0] for column in cursor.description]
        rows = [dict(zip(names, row)) for row in cursor]
        self.assertNotIn("comments", names)
        self.assertEqual(next(row for row in rows if row["id"] == "a")["dislikes"], 1)

    def test_discard_rows_outside_the_voting_window(self):
        self.conn.execute("INSERT INTO votes(entry_id,voter,created) VALUES('a','early',99),('b','late',200)")
        self.assertEqual(self.ranking(), [("a", 0), ("b", 0)])

    def test_existing_likes_survive_schema_upgrade(self):
        old = sqlite3.connect(":memory:")
        self.addCleanup(old.close)
        old.create_function("unixepoch", 0, lambda: 250)
        paths = sorted((root / "drizzle").glob("*.sql"))
        for path in paths[:-1]:
            old.executescript(path.read_text())
        old.execute("INSERT INTO rounds(id,owner,kind,opens,closes) VALUES('old','owner','weekly',100,200)")
        old.execute("INSERT INTO entries(id,round_id,owner,name,description,media,created) VALUES('old-entry','old','author','Old build','Existing','entries/old',101)")
        old.execute("INSERT INTO votes(entry_id,voter,created) VALUES('old-entry','voter',150)")
        old.executescript(paths[-1].read_text())
        self.assertEqual(old.execute("SELECT value FROM votes").fetchone()[0], 1)
        self.assertEqual(old.execute("SELECT winner_id FROM round_outcomes WHERE round_id='old'").fetchone()[0], "old-entry")


if __name__ == "__main__":
    unittest.main(verbosity=2)
