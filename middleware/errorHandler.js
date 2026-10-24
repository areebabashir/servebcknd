import multer from "multer";

export function notFound(req, res, next) {
  const err = new Error(`Not Found: ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
}

export function errorHandler(err, req, res, _next) {
  console.error("[API Error]", req.method, req.originalUrl, err.message || err);

  const statusCode = err.statusCode || err.status || 500;

  // Multer errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File too large. Max size is 50 MB.",
    });
  }
  if (err instanceof multer.MulterError || err.name === "MulterError") {
    return res.status(400).json({ success: false, message: err.message });
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(", ") });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] ?? "field";
    return res.status(409).json({ success: false, message: `${field} already exists.` });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ success: false, message: "Invalid token." });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ success: false, message: "Token expired." });
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}
