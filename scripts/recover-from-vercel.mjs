#!/usr/bin/env node
/**
 * Recover source code from a Vercel deployment using the Vercel API.
 *
 * Prerequisites:
 * 1. Create a token at https://vercel.com/account/tokens
 * 2. Set VERCEL_TOKEN in your environment: export VERCEL_TOKEN="your_token"
 *
 * Usage:
 *   node scripts/recover-from-vercel.mjs <deployment-url-or-id> [destination]
 *
 * Examples:
 *   node scripts/recover-from-vercel.mjs aegis-avw2e66m4-alex-armand-blumbergs-projects.vercel.app
 *   node scripts/recover-from-vercel.mjs dpl_xxx ./recovered-source
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const DEPLOYMENT = process.argv[2];
const DEST = process.argv[3] || "./recovered-source";

const api = (path, options = {}) =>
  fetch(`https://api.vercel.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      ...options.headers,
    },
  });

async function getDeploymentId(domainOrId) {
  if (domainOrId.startsWith("dpl_")) return domainOrId;
  const res = await api(`/v13/deployments/${encodeURIComponent(domainOrId)}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get deployment: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.id;
}

async function getFileTree(deploymentId) {
  const res = await api(`/v6/deployments/${deploymentId}/files`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("FILE_TREE_NOT_FOUND");
    }
    const err = await res.text();
    throw new Error(`Failed to get file tree: ${res.status} ${err}`);
  }
  return res.json();
}

async function downloadFile(deploymentId, fileUid) {
  const res = await api(
    `/v7/deployments/${deploymentId}/files/${fileUid}`,
    { responseType: "buffer" }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to download file ${fileUid}: ${res.status} ${err}`);
  }
  const json = await res.json();
  return Buffer.from(json.data, "base64");
}

function flattenTree(node, prefix = "") {
  const name = prefix ? `${prefix}/${node.name}` : node.name;
  if (node.type === "file") {
    return [{ type: "file", name, uid: node.uid }];
  }
  if (node.type === "directory" && node.children) {
    return node.children.flatMap((c) => flattenTree(c, name));
  }
  return [];
}

async function main() {
  if (!VERCEL_TOKEN) {
    console.error("Error: VERCEL_TOKEN is required.");
    console.error("Create a token at https://vercel.com/account/tokens");
    console.error("Then run: export VERCEL_TOKEN=\"your_token\"");
    process.exit(1);
  }
  if (!DEPLOYMENT) {
    console.error("Usage: node scripts/recover-from-vercel.mjs <deployment-url-or-id> [destination]");
    console.error("Example: node scripts/recover-from-vercel.mjs aegis-avw2e66m4-alex-armand-blumbergs-projects.vercel.app");
    process.exit(1);
  }

  console.log("Resolving deployment...");
  const deploymentId = await getDeploymentId(DEPLOYMENT);
  console.log("Deployment ID:", deploymentId);

  let tree;
  try {
    tree = await getFileTree(deploymentId);
  } catch (e) {
    if (e.message === "FILE_TREE_NOT_FOUND") {
      console.error("");
      console.error("The Vercel API does not expose a file tree for this deployment.");
      console.error("This often happens for deployments created from Git.");
      console.error("");
      console.error("Use manual recovery instead: open the Source tab for this deployment");
      console.error("in the Vercel dashboard and copy each file into your local project.");
      console.error("See RECOVER_CHECKLIST.md for a step-by-step checklist.");
      process.exit(1);
    }
    throw e;
  }

  const files = tree.flatMap((node) => flattenTree(node));
  const fileEntries = files.filter((f) => f.type === "file");

  if (fileEntries.length === 0) {
    console.error("No files found in deployment.");
    process.exit(1);
  }

  const fs = await import("fs");
  const path = await import("path");

  if (!fs.existsSync(DEST)) {
    fs.mkdirSync(DEST, { recursive: true });
  }

  console.log(`Downloading ${fileEntries.length} files to ${DEST}...`);
  for (const file of fileEntries) {
    const destPath = path.join(DEST, file.name);
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    try {
      const buf = await downloadFile(deploymentId, file.uid);
      fs.writeFileSync(destPath, buf);
      console.log("  ", file.name);
    } catch (e) {
      console.error("  FAILED", file.name, e.message);
    }
  }

  console.log("");
  console.log("Done. Review the files in", DEST);
  console.log("Then copy them over your project and run: git add . && git commit -m 'Restore from deployment' && git push");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
