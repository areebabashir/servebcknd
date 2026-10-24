import "dotenv/config";
import { google } from "googleapis";

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
);
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: "v3", auth: oauth2 });

const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
console.log("root folder id:", root);

try {
  const folder = await drive.files.get({
    fileId: root,
    fields: "id,name,owners,webViewLink",
    supportsAllDrives: true,
  });
  console.log("root folder OK:", folder.data.name, folder.data.webViewLink);
} catch (e) {
  console.error("Cannot read root folder:", e.errors?.[0]?.message || e.message);
}

try {
  const listed = await drive.files.list({
    q: "name contains 'SH_marriage' and trashed=false",
    fields: "files(id,name,parents,webViewLink,createdTime)",
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  console.log("found pdfs:", JSON.stringify(listed.data.files, null, 2));
} catch (e) {
  console.error("List failed:", e.errors?.[0]?.message || e.message);
}

try {
  const kids = await drive.files.list({
    q: `'${root}' in parents and trashed=false`,
    fields: "files(id,name,mimeType)",
    pageSize: 20,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  console.log("children of root:", JSON.stringify(kids.data.files, null, 2));
} catch (e) {
  console.error("Children list failed:", e.errors?.[0]?.message || e.message);
}
