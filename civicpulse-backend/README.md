# CivicPulse Backend

Express API + Prisma + PostgreSQL for CivicPulse (Eluru).

## Schemas

- `public` — app tables (booths, issues, outreach, …)
- `voterdb` — OCR extraction (`extracted_documents`, `electors`, `roll_files`)

## Production

Deploy from repo root:

```bash
bash deploy/deploy.sh
```

API is served behind nginx at `/api/`. OCR extract UI is at `/ocr/`.

## Local

```bash
cp .env.example .env   # set DATABASE_URL
npm install
npm run db:generate
npm run db:push
npm start
```

API: `http://localhost:4000/api`
