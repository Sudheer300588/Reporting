import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function slugifyForPath(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getMauticTempRoot() {
  // Keep all Mautic temp pages inside backend/modules/mautic/.temp_pages
  // so it stays next to the mautic module.
  // __dirname = backend/modules/mautic/utils
  // Go up one level -> backend/modules/mautic
  const target = path.join(__dirname, '..', '.temp_pages');
  // Ensure folder exists (canonical only).
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch {
    // ignore
  }
  // Best-effort: keep client folders name-keyed using _client.json.
  migrateClientDirsToNameKeyIfNeeded(target);
  return target;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readClientMetaId(dir) {
  try {
    const metaPath = path.join(dir, '_client.json');
    if (!fs.existsSync(metaPath)) return null;
    const raw = fs.readFileSync(metaPath, 'utf8');
    const parsed = safeJsonParse(raw);
    const id = parsed?.id;
    const asNum = Number(id);
    return Number.isFinite(asNum) ? asNum : id ?? null;
  } catch {
    return null;
  }
}

function readClientMetaName(dir) {
  try {
    const metaPath = path.join(dir, '_client.json');
    if (!fs.existsSync(metaPath)) return null;
    const raw = fs.readFileSync(metaPath, 'utf8');
    const parsed = safeJsonParse(raw);
    return parsed?.name ? String(parsed.name) : null;
  } catch {
    return null;
  }
}

function listDirs(parentDir) {
  try {
    if (!fs.existsSync(parentDir)) return [];
    return fs
      .readdirSync(parentDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function pickAvailableClientDirName(nsRoot, desiredBase, clientId) {
  const base = desiredBase || 'client';
  const existing = new Set(listDirs(nsRoot));

  // If base exists, allow it only if it already belongs to this client.
  if (existing.has(base)) {
    const id = readClientMetaId(path.join(nsRoot, base));
    if (id != null && String(id) === String(clientId)) {
      return base;
    }
  } else {
    return base;
  }

  // Find a numeric suffix that is free OR already mapped to this client.
  for (let i = 2; i <= 200; i++) {
    const candidate = `${base}-${i}`;
    if (!existing.has(candidate)) return candidate;
    const id = readClientMetaId(path.join(nsRoot, candidate));
    if (id != null && String(id) === String(clientId)) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
}

function ensureNamespaceRoot(namespace) {
  const nsRoot = path.join(getMauticTempRoot(), namespace);
  try {
    fs.mkdirSync(nsRoot, { recursive: true });
  } catch {
    // ignore
  }
  return nsRoot;
}

function findExistingClientDirName(nsRoot, client) {
  const clientId = client?.id;
  const entries = listDirs(nsRoot);

  for (const entry of entries) {
    const full = path.join(nsRoot, entry);
    const metaId = readClientMetaId(full);
    if (metaId != null && clientId != null && String(metaId) === String(clientId)) {
      return entry;
    }
  }

  // Legacy: numeric client id folder with no meta.
  if (clientId != null) {
    const legacy = String(clientId);
    if (entries.includes(legacy)) return legacy;
  }

  // Legacy: <id>-<slug(name)>
  if (clientId != null) {
    const prefix = `${String(clientId)}-`;
    const legacy = entries.find((d) => d.startsWith(prefix));
    if (legacy) return legacy;
  }

  return null;
}

function resolveAndMigrateClientDir(namespace, client) {
  const nsRoot = ensureNamespaceRoot(namespace);
  const clientId = client?.id ?? 'unknown';
  const desiredBase = slugifyForPath(client?.name) || 'client';
  const existingName = findExistingClientDirName(nsRoot, client);

  const desiredName = pickAvailableClientDirName(nsRoot, desiredBase, clientId);
  if (existingName && existingName !== desiredName) {
    try {
      const from = path.join(nsRoot, existingName);
      const to = path.join(nsRoot, desiredName);
      if (!fs.existsSync(to)) {
        fs.renameSync(from, to);
        return desiredName;
      }

      // If target exists, only keep it if it belongs to this client; otherwise find another.
      const targetId = readClientMetaId(to);
      if (targetId != null && String(targetId) === String(clientId)) {
        return desiredName;
      }

      const fallback = pickAvailableClientDirName(nsRoot, desiredBase, clientId);
      if (fallback !== existingName) {
        const to2 = path.join(nsRoot, fallback);
        if (!fs.existsSync(to2)) {
          fs.renameSync(from, to2);
          return fallback;
        }
      }
    } catch {
      // ignore
    }
  }

  return existingName || desiredName;
}

function migrateClientDirsToNameKeyIfNeeded(tempRoot) {
  try {
    if (!fs.existsSync(tempRoot)) return;

    const namespaces = ['mautic-email-reports', 'mautic-sms-stats'];
    for (const ns of namespaces) {
      const nsRoot = path.join(tempRoot, ns);
      if (!fs.existsSync(nsRoot)) continue;

      const dirs = listDirs(nsRoot);
      for (const dirName of dirs) {
        const full = path.join(nsRoot, dirName);
        const id = readClientMetaId(full);
        const name = readClientMetaName(full);
        if (id == null || !name) continue;

        const desiredBase = slugifyForPath(name) || 'client';
        const desiredName = pickAvailableClientDirName(nsRoot, desiredBase, id);
        if (desiredName && desiredName !== dirName) {
          const to = path.join(nsRoot, desiredName);
          if (!fs.existsSync(to)) {
            try {
              fs.renameSync(full, to);
            } catch {
              // ignore
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }
}

export function getClientKey(client, namespace = null) {
  // User requirement: temp folder must be keyed by client NAME (human readable), not just numeric id.
  // To preserve isolation and handle same-name clients, we resolve a unique dir name per namespace
  // and store client id in _client.json for safe migrations.
  if (namespace) {
    return resolveAndMigrateClientDir(namespace, client);
  }

  return slugifyForPath(client?.name) || 'client';
}

export function migrateClientTempDirIfNeeded(namespace, client) {
  try {
    // Kept for backward compatibility with existing call sites.
    // The new resolver handles all legacy forms and name-based migration.
    resolveAndMigrateClientDir(namespace, client);
  } catch {
    // Non-fatal; if migration fails, we still write to stableDir.
  }
}

export function writeClientMeta(namespace, client) {
  try {
    const clientKey = getClientKey(client, namespace);
    const nsDir = path.join(getMauticTempRoot(), namespace, clientKey);
    fs.mkdirSync(nsDir, { recursive: true });
    const metaPath = path.join(nsDir, '_client.json');
    const payload = {
      id: Number.isFinite(Number(client?.id)) ? Number(client.id) : client?.id,
      name: client?.name || null,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2));
  } catch {
    // ignore
  }
}

export function getEmailReportTempDir(client, yearMonth) {
  const key = getClientKey(client, 'mautic-email-reports');
  writeClientMeta('mautic-email-reports', client);
  return path.join(getMauticTempRoot(), 'mautic-email-reports', key, yearMonth);
}

export function getSmsStatsTempDir(client, yearMonth, mauticSmsId) {
  const key = getClientKey(client, 'mautic-sms-stats');
  writeClientMeta('mautic-sms-stats', client);
  const base = path.join(getMauticTempRoot(), 'mautic-sms-stats', key, yearMonth);
  return mauticSmsId ? path.join(base, `sms_${mauticSmsId}`) : base;
}

export function resolveEmailReportMonthDirCandidates(client, yearMonth, baseDirResolved) {
  const clientKey = getClientKey(client);
  return [path.join(baseDirResolved, 'mautic-email-reports', clientKey, yearMonth)];
}
