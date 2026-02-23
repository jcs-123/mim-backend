require("dotenv").config();
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

// ================= CONFIG =================
const DATABASE_URI = process.env.DATABASE;
const DB_NAME = process.env.DB_NAME || "mim";
const BACKUP_DIR = process.env.BACKUP_DIR || "C:/backups/MIM";
const BACKUP_HOUR = parseInt(process.env.BACKUP_HOUR || 2);
const BACKUP_MINUTE = parseInt(process.env.BACKUP_MINUTE || 0);
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || 7);

const MONGODUMP_PATH =
  `"C:\\Program Files\\MongoDB\\Tools\\100\\bin\\mongodump.exe"`;

// Ensure backup root exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ================= BACKUP FUNCTION =================
async function backupDatabase() {
  try {
    if (!DATABASE_URI) {
      throw new Error("DATABASE URI missing in .env");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFolder = path.join(BACKUP_DIR, `${timestamp}_${DB_NAME}`);
    const dumpFolder = path.join(backupFolder, "dump");
    const jsonFolder = path.join(backupFolder, "json");

    fs.mkdirSync(dumpFolder, { recursive: true });
    fs.mkdirSync(jsonFolder, { recursive: true });

    console.log("🚀 Starting MIM backup:", new Date().toLocaleString());

    // ---------- 1️⃣ Mongo Dump ----------
    const dumpCmd = `${MONGODUMP_PATH} --uri="${DATABASE_URI}" --db="${DB_NAME}" --out="${dumpFolder}"`;

    await new Promise((resolve, reject) => {
      exec(dumpCmd, (err, stdout, stderr) => {
        if (err) {
          console.error("❌ mongodump error:", stderr);
          return reject(err);
        }
        console.log("✅ mongodump completed");
        resolve();
      });
    });

    // ---------- 2️⃣ JSON EXPORT ----------
    console.log("📄 Exporting collections as JSON...");

    const client = new MongoClient(DATABASE_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    const collections = await db.listCollections().toArray();

    for (let coll of collections) {
      const data = await db.collection(coll.name).find({}).toArray();
      const filePath = path.join(jsonFolder, `${coll.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`📄 JSON exported: ${coll.name}`);
    }

    await client.close();

    console.log("✅ Backup completed successfully");
    console.log("📂 Stored at:", backupFolder);

    cleanOldBackups();

  } catch (err) {
    console.error("❌ Backup failed:", err.message);
  }
}

// ================= AUTO DELETE OLD BACKUPS =================
function cleanOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);

    files.forEach((file) => {
      const fullPath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(fullPath);

      const ageDays =
        (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);

      if (ageDays > RETENTION_DAYS) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log("🧹 Deleted old backup:", file);
      }
    });
  } catch (err) {
    console.error("❌ Cleanup error:", err.message);
  }
}

// ================= SCHEDULER =================
function scheduleBackup() {
  const now = new Date();
  let nextRun = new Date();

  nextRun.setHours(BACKUP_HOUR, BACKUP_MINUTE, 0, 0);

  if (now > nextRun) nextRun.setDate(nextRun.getDate() + 1);

  const timeout = nextRun - now;

  console.log("🕒 Next backup scheduled at:", nextRun.toLocaleString());

  setTimeout(async () => {
    await backupDatabase();
    scheduleBackup();
  }, timeout);
}

// ================= START =================
scheduleBackup();
backupDatabase();