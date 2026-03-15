# Vercel Source Recovery Checklist

Use this checklist when manually copying files from the Vercel Source tab.

**Deployment URL:** [aegis-web - CkfZTktAS](https://vercel.com/alex-armand-blumbergs-projects/aegis-web/CkfZTktASb5H1Q7Asycu3wtrw9WD/source)

---

## Step 1: Root Files

In the Vercel Source tab, for each file: click it → Cmd+A → Cmd+C → paste into local file → Cmd+S.

- [ ] `.env.example`
- [ ] `DEPLOY.md`
- [ ] `README.md`
- [ ] `eslint.config.mjs`
- [ ] `middleware.ts` (if present)
- [ ] `next-env.d.ts` (if present)
- [ ] `next.config.ts`
- [ ] `package-lock.json`
- [ ] `package.json`
- [ ] `postcss.config.mjs`
- [ ] `tsconfig.json`
- [ ] `.gitignore`

---

## Step 2: `public/`

- [ ] `landing-bg.mp4` (binary – may need to keep local or re-download)
- [ ] `landing.mp4` (binary)
- [ ] `aegis-logo.png` (binary)
- [ ] `globe.svg`
- [ ] `file.svg`
- [ ] `window.svg`
- [ ] `vercel.svg`
- [ ] `next.svg`
- [ ] (any other files you see)

---

## Step 3: `scripts/` (if present)

- [ ] (list each file as you find it)

---

## Step 4: `src/app/`

- [ ] `layout.tsx`
- [ ] `page.tsx`
- [ ] `globals.css`
- [ ] `favicon.ico` (binary)
- [ ] `map/page.tsx`
- [ ] `escalation/page.tsx`
- [ ] (any other pages)

---

## Step 5: `src/app/api/`

- [ ] `ai/route.ts`
- [ ] `escalation/route.ts`
- [ ] `map/route.ts`
- [ ] `news/route.ts`

---

## Step 6: `src/components/`

- [ ] `AnimatedStat.tsx`
- [ ] `Reveal.tsx`
- [ ] (any other components)

---

## Step 7: `src/lib/`

- [ ] `escalation.ts`

---

## Step 8: `src/` (root-level files)

- [ ] `ukraine_sample.csv` (if present)

---

## Step 9: Verify

```bash
npm install
npm run dev
```

Open http://localhost:3000 and compare with the deployment. Fix any missing files.

---

## Step 10: Commit and Push

```bash
git add .
git commit -m "Restore source from deployment CkfZTktAS"
git push origin main
```
