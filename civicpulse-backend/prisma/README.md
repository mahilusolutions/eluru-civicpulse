# Prisma schemas (one DB, two Postgres schemas)

| File | Postgres schema | Purpose |
|------|-----------------|---------|
| `schema/base.prisma` | — | Generator, datasource, shared enums |
| `schema/public.prisma` | `public` | App tables (booths, wards, issues, team, …) |
| `schema/voterdb.prisma` | `voterdb` | OCR extraction (`extracted_documents`, `extracted_pages`, `electors`, `roll_files`) |

## Local setup

1. Copy `.env.example` → `.env` and set `DATABASE_URL`
2. Ensure schemas exist (or let `db push` create tables after schema create):

```bash
psql "$DATABASE_URL" -f sql/000_create_schemas.sql
npm run db:generate
npm run db:push
npm run dev
```

Tunnel to VPS Postgres if needed:

```bash
ssh -L 5432:127.0.0.1:5432 root@YOUR_VPS_IP
```
