import dns from "dns";
import mongoose from "mongoose";

// Windows/Node often fails mongodb+srv SRV lookups (querySrv ECONNREFUSED).
// Prefer public DNS for any remaining SRV resolution.
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  /* ignore */
}

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not defined in .env");

  const maxAttempts = 5;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
      });
      console.log(`MongoDB connected: ${mongoose.connection.host}`);
      mongoose.connection.on("error", (err) => {
        console.error("MongoDB error:", err);
      });
      return;
    } catch (err) {
      lastErr = err;
      console.error(
        `MongoDB connect attempt ${attempt}/${maxAttempts} failed:`,
        err?.message || err,
      );
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }

  throw lastErr;
}
