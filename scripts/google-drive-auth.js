import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import http from "http";
import { URL } from "url";

/**
 * One-time helper: get a Google Drive OAuth refresh token.
 *
 * Prerequisites in Google Cloud Console:
 * 1. Enable Google Drive API
 * 2. Create OAuth client (Desktop app) → copy Client ID + Client Secret
 * 3. Put them in .env:
 *      GOOGLE_OAUTH_CLIENT_ID=...
 *      GOOGLE_OAUTH_CLIENT_SECRET=...
 * 4. Run:  node scripts/google-drive-auth.js
 * 5. Browser opens → sign in with the Google account that owns the Drive folder
 * 6. Paste the printed refresh token into .env as GOOGLE_OAUTH_REFRESH_TOKEN
 */

import "dotenv/config";

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT = "http://localhost:53682/oauth2callback";
const SCOPES = ["https://www.googleapis.com/auth/drive"];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("\n1) Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n2) Sign in with the Google account that owns your Drive folder.\n");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404);
      res.end();
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("Missing code");
      return;
    }
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h2>Success!</h2><p>You can close this tab and return to the terminal.</p>");

    console.log("\nAdd this to backend/.env:\n");
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token || "(no refresh token — revoke app access and retry)"}`);
    console.log("\nAlso set:");
    console.log("GOOGLE_DRIVE_AUTH_MODE=oauth");
    console.log("GOOGLE_DRIVE_ENABLED=true\n");

    server.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end(String(err.message));
    process.exit(1);
  }
});

server.listen(53682, () => {
  console.log("Waiting for Google OAuth callback on http://localhost:53682 …\n");
  // Try to open browser on Windows
  import("child_process").then(({ exec }) => {
    exec(`start "" "${authUrl}"`);
  });
});
