# Run & Deploy AEGIS Web

## Run locally

1. **Open a terminal** and go to the project folder:
   ```bash
   cd /Users/alexander.armandblum/Documents/AEGIS/aegis-web
   ```

2. **Install dependencies** (if you haven’t already):
   ```bash
   npm install
   ```

3. **Optional — AI features:**  
   Copy the example env file and add your Groq API key:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and set:
   ```
   GROQ_API_KEY=your_actual_groq_key
   ```
   (Without this, Escalation Index and Map still work; only AI insight buttons will fail.)

4. **Start the dev server:**
   ```bash
   npm run dev
   ```

5. **Open in browser:**  
   Go to **http://localhost:3000**

---

## Deploy to your domain (aegis-hq.com)

### 1. Put the code on GitHub

1. Create a new repository on [github.com](https://github.com/new) (e.g. `aegis-web`).
2. In your terminal, from the `aegis-web` folder:
   ```bash
   cd /Users/alexander.armandblum/Documents/AEGIS/aegis-web
   git init
   git add .
   git commit -m "Initial AEGIS web app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/aegis-web.git
   git push -u origin main
   ```
   Replace `YOUR_USERNAME` with your GitHub username.

### 2. Deploy with Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (use “Continue with GitHub” if you like).
2. Click **Add New…** → **Project**.
3. **Import** your `aegis-web` repository.  
   - If you don’t see it, click “Adjust GitHub App Permissions” and grant Vercel access to the repo.
4. Leave **Root Directory** as `.` (or set it to `aegis-web` if you put the app in a subfolder of the repo).
5. Under **Environment Variables**, add:
   - Name: `GROQ_API_KEY`  
   - Value: your Groq API key  
   (Optional; only needed for AI features.)
6. Click **Deploy**.  
   Wait for the build to finish. You’ll get a URL like `aegis-web-xxx.vercel.app`.

### 3. Use your domain (aegis-hq.com)

1. In the Vercel dashboard, open your project.
2. Go to **Settings** → **Domains**.
3. Enter **aegis-hq.com** and click **Add**.
4. Vercel will show DNS records (usually a **CNAME** for `www` and an **A** record for the root).
5. In your domain registrar (where you bought aegis-hq.com):
   - Add the records Vercel shows (e.g. CNAME `www` → `cname.vercel-dns.com`, and the A record for the root if given).
6. Wait a few minutes (up to 48 hours in rare cases).  
   Vercel will issue an SSL certificate automatically.

### 4. Done

- **Production URL:** https://aegis-hq.com (and https://www.aegis-hq.com if you added `www`).
- **Future updates:** Push to `main` on GitHub; Vercel will redeploy automatically.
