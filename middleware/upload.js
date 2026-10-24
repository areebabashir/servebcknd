import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { Readable } from "stream";
import path from "path";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function isAllowedUpload(file) {
  const mime = String(file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (/^image\/(jpeg|jpg|png|webp|gif)$/.test(mime)) return true;
  if (/^video\/(mp4|mov|avi|quicktime)$/.test(mime)) return true;
  if (mime === "application/pdf" || ext === ".pdf") return true;
  // Browsers sometimes send PDFs as octet-stream
  if (mime === "application/octet-stream" && (ext === ".pdf" || ext === ".xlsx" || ext === ".xls"))
    return true;
  if (!mime && ext === ".pdf") return true;
  // Excel exports for finance Drive sync
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    ext === ".xlsx" ||
    ext === ".xls"
  ) {
    return true;
  }
  return false;
}

const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB (PDFs with images)
  fileFilter(_req, file, cb) {
    if (isAllowedUpload(file)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype || "unknown"} (${file.originalname})`));
  },
});

export async function uploadToCloudinary(file, folder = "serve-humanity") {
  const isPdf =
    String(file.mimetype || "").includes("pdf") ||
    String(file.originalname || "").toLowerCase().endsWith(".pdf");

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: isPdf ? "raw" : "auto",
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      },
    );
    Readable.from(file.buffer).pipe(stream);
  });
}
