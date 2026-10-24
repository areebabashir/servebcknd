import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { Readable } from "stream";



const folderCache = new Map();

function isDriveEnabled() {
  return String(process.env.GOOGLE_DRIVE_ENABLED || "").toLowerCase() === "true";
}

function authMode() {
  const mode = String(process.env.GOOGLE_DRIVE_AUTH_MODE || "oauth").toLowerCase();
  return mode === "service_account" ? "service_account" : "oauth";
}

function loadServiceAccount() {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_INLINE;
  if (inline) return JSON.parse(inline);
  const filePath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (filePath) {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    if (fs.existsSync(resolved)) {
      return JSON.parse(fs.readFileSync(resolved, "utf8"));
    }
  }
  const relative = path.resolve(process.cwd(), "google-service-account.json");
  if (fs.existsSync(relative)) {
    return JSON.parse(fs.readFileSync(relative, "utf8"));
  }
  return null;
}

let driveClient = null;

async function getDrive() {
  if (driveClient) return driveClient;

  if (authMode() === "oauth") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "OAuth mode needs GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN. Run: node scripts/google-drive-auth.js",
      );
    }
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    driveClient = google.drive({ version: "v3", auth: oauth2 });
    return driveClient;
  }

  const creds = loadServiceAccount();
  if (!creds) throw new Error("Google service account credentials not found.");
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: String(creds.private_key || "").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

function sanitizeFolderName(name) {
  const cleaned = String(name || "Untitled")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned || "Untitled";
}

const TYPE_FOLDER_LABELS = {
  health: "Health Cases",
  marriage: "Marriage Cases",
  fee: "Fee Cases",
  ration: "Ration Cases",
  monthly_report: "Monthly Reports",
  ration_file: "Ration Case Files",
  drive: "Drive Files",
  stat: "Stat Files",
  reference: "Reference Files",
};

const FINANCE_TYPE_FOLDER_LABELS = {
  monthly_donation: "Monthly Donations",
  case: "Case Files",
};

async function ensureChildFolder(drive, parentId, name) {
  const safe = sanitizeFolderName(name);
  const cacheKey = `${parentId}::${safe}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

  const q = [
    `name='${safe.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`,
  ].join(" and ");

  const listed = await drive.files.list({
    q,
    fields: "files(id, name)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
    pageSize: 5,
  });

  let folderId = listed.data.files?.[0]?.id;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: {
        name: safe,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      },
      fields: "id, name",
      supportsAllDrives: true,
    });
    folderId = created.data.id;
  }

  folderCache.set(cacheKey, folderId);
  return folderId;
}

async function ensureFolderPath(segments) {
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootId) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID is not set.");

  const drive = await getDrive();
  let current = rootId;
  const pathParts = [];
  for (const seg of segments) {
    current = await ensureChildFolder(drive, current, seg);
    pathParts.push(sanitizeFolderName(seg));
  }
  return { folderId: current, path: pathParts.join(" / ") };
}

/**
 * Upload a buffer to Drive under documentation hierarchy.
 */
export async function uploadDocumentationToDrive({
  buffer,
  mimeType,
  originalName,
  docType,
  chapterName,
  caseNumber,
  beneficiaryName,
  attachmentKey,
}) {
  if (!isDriveEnabled()) {
    console.warn("[Google Drive] Skipped — GOOGLE_DRIVE_ENABLED is not true");
    return null;
  }

  try {
    if (!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
      throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID is empty.");
    }

    const typeLabel = TYPE_FOLDER_LABELS[docType] || docType || "Other";
    const chapter = chapterName || "Unassigned Chapter";
    const caseFolder =
      [caseNumber, beneficiaryName].filter(Boolean).join(" — ") ||
      originalName ||
      "Untitled Case";
    const fieldFolder = attachmentKey || "attachments";

    const { folderId, path: drivePath } = await ensureFolderPath([
      "Documentation",
      chapter,
      typeLabel,
      caseFolder,
      fieldFolder,
    ]);

    const drive = await getDrive();
    const stream = Readable.from(buffer);

    const created = await drive.files.create({
      requestBody: {
        name: sanitizeFolderName(originalName || `upload-${Date.now()}`),
        parents: [folderId],
      },
      media: {
        mimeType: mimeType || "application/octet-stream",
        body: stream,
      },
      fields: "id, name, webViewLink, webContentLink",
      supportsAllDrives: true,
    });

    if (String(process.env.GOOGLE_DRIVE_PUBLIC_LINKS || "").toLowerCase() === "true") {
      try {
        await drive.permissions.create({
          fileId: created.data.id,
          requestBody: { role: "reader", type: "anyone" },
          supportsAllDrives: true,
        });
      } catch {
        // ignore
      }
    }

    const meta = await drive.files.get({
      fileId: created.data.id,
      fields: "id, webViewLink, webContentLink",
      supportsAllDrives: true,
    });

    console.log(`[Google Drive] Uploaded: ${drivePath} / ${created.data.name}`);
    return {
      driveFileId: meta.data.id,
      driveWebViewLink: meta.data.webViewLink || "",
      drivePath: `${drivePath} / ${created.data.name}`,
    };
  } catch (err) {
    const details =
      err?.errors?.[0]?.message || err?.response?.data?.error?.message || err.message;
    console.error("[Google Drive] Upload failed:", details);
    return null;
  }
}

/**
 * Upload or update a buffer under Finance / {chapter} / {type} / {month folder} / {key}.
 * Pass existingDriveFileId to overwrite the same Drive file (continuous update).
 */
export async function uploadFinanceToDrive({
  buffer,
  mimeType,
  originalName,
  financeType,
  chapterName,
  month,
  teamName,
  attachmentKey,
  existingDriveFileId,
}) {
  if (!isDriveEnabled()) {
    console.warn("[Google Drive] Skipped — GOOGLE_DRIVE_ENABLED is not true");
    return null;
  }

  try {
    if (!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
      throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID is empty.");
    }

    const drive = await getDrive();
    const fileName = sanitizeFolderName(originalName || `finance-${Date.now()}`);

    if (existingDriveFileId) {
      const stream = Readable.from(buffer);
      await drive.files.update({
        fileId: existingDriveFileId,
        requestBody: { name: fileName },
        media: {
          mimeType: mimeType || "application/octet-stream",
          body: stream,
        },
        fields: "id, name, webViewLink, webContentLink",
        supportsAllDrives: true,
      });

      const meta = await drive.files.get({
        fileId: existingDriveFileId,
        fields: "id, webViewLink, webContentLink",
        supportsAllDrives: true,
      });

      console.log(`[Google Drive] Updated finance file: ${fileName}`);
      return {
        driveFileId: meta.data.id,
        driveWebViewLink: meta.data.webViewLink || "",
        drivePath: fileName,
        updated: true,
      };
    }

    const typeLabel =
      FINANCE_TYPE_FOLDER_LABELS[financeType] || financeType || "Other";
    const chapter = chapterName || "Unassigned Chapter";
    const monthFolder =
      [month, teamName].filter(Boolean).join(" — ") || originalName || "Untitled";
    const fieldFolder = attachmentKey || "attachments";

    const { folderId, path: drivePath } = await ensureFolderPath([
      "Finance",
      chapter,
      typeLabel,
      monthFolder,
      fieldFolder,
    ]);

    const stream = Readable.from(buffer);
    const created = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: mimeType || "application/octet-stream",
        body: stream,
      },
      fields: "id, name, webViewLink, webContentLink",
      supportsAllDrives: true,
    });

    if (String(process.env.GOOGLE_DRIVE_PUBLIC_LINKS || "").toLowerCase() === "true") {
      try {
        await drive.permissions.create({
          fileId: created.data.id,
          requestBody: { role: "reader", type: "anyone" },
          supportsAllDrives: true,
        });
      } catch {
        // ignore
      }
    }

    const meta = await drive.files.get({
      fileId: created.data.id,
      fields: "id, webViewLink, webContentLink",
      supportsAllDrives: true,
    });

    console.log(`[Google Drive] Uploaded finance: ${drivePath} / ${created.data.name}`);
    return {
      driveFileId: meta.data.id,
      driveWebViewLink: meta.data.webViewLink || "",
      drivePath: `${drivePath} / ${created.data.name}`,
      updated: false,
    };
  } catch (err) {
    const details =
      err?.errors?.[0]?.message || err?.response?.data?.error?.message || err.message;
    console.error("[Google Drive] Finance upload failed:", details);
    return null;
  }
}

export function googleDriveConfigured() {
  if (!isDriveEnabled() || !process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) return false;
  if (authMode() === "oauth") {
    return Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID &&
        process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
        process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    );
  }
  return Boolean(loadServiceAccount());
}
