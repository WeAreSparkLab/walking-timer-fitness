# Database tests (local, no Supabase needed)

Runs the real schema plus the Walk Together v2 migration in PGlite (Postgres in Node)
and checks row-level security and host controls as different users.

```
npm i --no-save @electric-sql/pglite@0.2.17
cat supabase/proposed/walk_together_v2_part_a.sql supabase/proposed/walk_together_v2_part_b.sql > /tmp/wt.sql
node supabase/tests/walk_together_security.test.mjs supabase/migrations/20261014_consolidated_schema.sql /tmp/wt.sql
node supabase/tests/walk_together_part_a_compat.test.mjs supabase/migrations/20261014_consolidated_schema.sql supabase/proposed/walk_together_v2_part_a.sql
```