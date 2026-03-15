# Recover Source from Vercel Deployment

This guide helps you restore your local source code to match the working deployment (CkfZTktAS).

---

## Option A: Programmatic Recovery (Try First)

If the deployment was built with the Vercel CLI or has an exposed file tree, you can download source automatically:

1. **Create a Vercel token** at [vercel.com/account/tokens](https://vercel.com/account/tokens).

2. **Run the recovery script:**

   ```bash
   export VERCEL_TOKEN="your_token_here"
   npm run recover-from-vercel -- aegis-avw2e66m4-alex-armand-blumbergs-projects.vercel.app ./recovered-source
   ```

3. **Review** the downloaded files in `./recovered-source`.

4. **Replace your project files:**

   ```bash
   # Backup current project (optional)
   cp -r src src.backup
   cp -r public public.backup

   # Copy recovered files over
   cp -r recovered-source/* .
   ```

5. **Verify and deploy:**

   ```bash
   npm install
   npm run dev
   # Compare with the live deployment, then:
   git add .
   git commit -m "Restore source from deployment CkfZTktAS"
   git push origin main
   ```

If you see **"File tree not found"**, the Vercel API does not expose source for this deployment (common for Git-based deployments). Use Option B instead.

---

## Option B: Manual Recovery

Use the [RECOVER_CHECKLIST.md](RECOVER_CHECKLIST.md) and copy each file from the Vercel Source tab:

1. Open: [Deployment Source](https://vercel.com/alex-armand-blumbergs-projects/aegis-web/CkfZTktASb5H1Q7Asycu3wtrw9WD/source)
2. For each file: click it → select all (Cmd+A) → copy (Cmd+C) → paste into the matching local file → save (Cmd+S)
3. Follow the checklist to ensure you don't miss any files
