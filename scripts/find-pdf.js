import "dotenv/config";
import { google } from "googleapis";

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
);
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: "v3", auth: oauth2 });

async function pathOf(fileId) {
  const parts = [];
  let id = fileId;
  for (let i = 0; i < 10; i++) {
    const f = await drive.files.get({
      fileId: id,
      fields: "id,name,parents,webViewLink",
      supportsAllDrives: true,
    });
    parts.unshift(f.data.name);
    if (!f.data.parents?.length) break;
    id = f.data.parents[0];
  }
  return parts.join(" / ");
}

const pdf = await drive.files.get({
  fileId: "1I2lvHvmYt-zxrWRut9AZ4kQbUrqrNhF3",
  fields: "id,name,parents,webViewLink",
  supportsAllDrives: true,
});
console.log("PDF:", pdf.data.name);
console.log("Link:", pdf.data.webViewLink);
console.log("Path:", await pathOf(pdf.data.id));

const docsFolder = "1g-721ZEhYW6Ka-FBm-xujXh7uTqVeRWU";
const folder = await drive.files.get({
  fileId: docsFolder,
  fields: "id,name,webViewLink",
  supportsAllDrives: true,
});
console.log("Documentation folder:", folder.data.webViewLink);
