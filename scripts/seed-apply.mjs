import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const seedsDir = path.resolve(REPO_ROOT, "server/data/seeds");
const usersSeedFile = path.resolve(seedsDir, "users.seed.csv");
const appStorageSeedFile = path.resolve(seedsDir, "app_storage.seed.json");

const dataDir = path.resolve(REPO_ROOT, "server/data");
const usersCsvFile = path.resolve(dataDir, "users.csv");
const appStorageFile = path.resolve(dataDir, "app_storage.json");

const primeMode = process.argv.includes("--prime");

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTextOrEmpty(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function isUsersCsvEmpty(csvText) {
  if (!csvText || !csvText.trim()) return true;
  const rows = csvText.split(/\r?\n/).filter(Boolean);
  return rows.length <= 1;
}

function printValidationSummary(usersSeedCsv, appSeedObj) {
  const rows = usersSeedCsv.split(/\r?\n/).filter(Boolean);
  const athleteCount = Math.max(0, rows.length - 1);
  const keys = Object.keys(appSeedObj || {});
  console.log("Seed validation OK.");
  console.log(`- users.seed.csv: ${athleteCount} atletas`);
  console.log(`- app_storage.seed.json: ${keys.length} keys`);
}

async function primeUsers(usersSeedCsv) {
  const current = await readTextOrEmpty(usersCsvFile);
  if (!isUsersCsvEmpty(current)) {
    console.log("users.csv ya contiene datos; se mantiene sin cambios.");
    return;
  }
  await fs.mkdir(path.dirname(usersCsvFile), { recursive: true });
  await fs.writeFile(usersCsvFile, usersSeedCsv, "utf8");
  console.log("users.csv inicializado con users.seed.csv.");
}

async function primeAppStorage(appSeedObj) {
  const currentText = await readTextOrEmpty(appStorageFile);
  const currentObj = parseJson(currentText, {});

  const isEmptyCurrent =
    !currentText.trim() ||
    (currentObj && typeof currentObj === "object" && Object.keys(currentObj).length === 0);

  if (isEmptyCurrent) {
    await fs.mkdir(path.dirname(appStorageFile), { recursive: true });
    await fs.writeFile(appStorageFile, `${JSON.stringify(appSeedObj, null, 2)}\n`, "utf8");
    console.log("app_storage.json inicializado con app_storage.seed.json.");
    return;
  }

  let changed = false;
  const merged = { ...currentObj };
  for (const [key, value] of Object.entries(appSeedObj)) {
    if (!Object.prototype.hasOwnProperty.call(merged, key)) {
      merged[key] = value;
      changed = true;
    }
  }

  if (!changed) {
    console.log("app_storage.json ya contiene todas las keys seed.");
    return;
  }

  await fs.writeFile(appStorageFile, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log("app_storage.json mergeado con keys seed faltantes.");
}

async function main() {
  if (!(await fileExists(usersSeedFile))) {
    throw new Error(`No existe ${usersSeedFile}. Ejecuta primero: npm run sync:pesas`);
  }
  if (!(await fileExists(appStorageSeedFile))) {
    throw new Error(`No existe ${appStorageSeedFile}. Ejecuta primero: npm run sync:pesas`);
  }

  const usersSeedCsv = await fs.readFile(usersSeedFile, "utf8");
  const appStorageSeedText = await fs.readFile(appStorageSeedFile, "utf8");
  const appStorageSeedObj = parseJson(appStorageSeedText, null);

  if (!usersSeedCsv.trim()) {
    throw new Error("users.seed.csv esta vacio");
  }
  if (!appStorageSeedObj || typeof appStorageSeedObj !== "object") {
    throw new Error("app_storage.seed.json no es JSON valido");
  }
  if (!("tf_week" in appStorageSeedObj) || !("tf_routines" in appStorageSeedObj)) {
    throw new Error("app_storage.seed.json no contiene tf_week/tf_routines");
  }

  printValidationSummary(usersSeedCsv, appStorageSeedObj);

  if (!primeMode) {
    console.log("Modo validacion completado. Usa --prime para preparar server/data.");
    return;
  }

  await primeUsers(usersSeedCsv);
  await primeAppStorage(appStorageSeedObj);
  console.log("Seed apply completado.");
}

main().catch((err) => {
  console.error("seed:apply fallo:", err.message || err);
  process.exit(1);
});
