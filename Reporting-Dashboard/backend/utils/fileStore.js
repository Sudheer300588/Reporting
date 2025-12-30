import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeFilename(name) {
  // Keep extension, sanitize base name
  const ext = path.extname(name) || '';
  const base = path.basename(name, ext)
    .toLowerCase()
    .replace(/[^a-z0-9-_\.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base}${ext}`;
}

export async function saveFileToFrontendAssets(fileBuffer, originalName, opts = {}) {
  // fileBuffer: Buffer
  // originalName: original filename
  // opts.prefix: optional prefix
  const baseAssetsDir = path.resolve(__dirname, '..', '..', 'frontend', 'public', 'assets');
  const subfolder = opts.subfolder ? String(opts.subfolder).replace(/[^a-z0-9-_]/gi, '-') : '';
  const assetsDir = subfolder ? path.join(baseAssetsDir, subfolder) : baseAssetsDir;
  ensureDir(assetsDir);

  const ext = path.extname(originalName) || '';
  const prefix = opts.prefix ? `${opts.prefix.replace(/[^a-z0-9-_]/gi, '')}_` : '';
  let finalName;
  if (opts.filename) {
    // use provided filename (sanitize)
    const providedBase = path.basename(opts.filename, path.extname(opts.filename));
    const safeProvided = providedBase.toLowerCase().replace(/[^a-z0-9-_\.]/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
    const providedExt = path.extname(opts.filename) || ext || '';
    finalName = `${safeProvided}${providedExt}`;
  } else {
    const safeName = sanitizeFilename(originalName);
    const timestamp = Date.now();
    finalName = `${prefix}${timestamp}_${safeName}`;
  }
  const finalPath = path.join(assetsDir, finalName);

  try {
    // If overwrite requested and file exists, remove it first
    if (opts.overwrite) {
      try {
        if (fs.existsSync(finalPath)) {
          console.log('[fileStore] Overwrite enabled - removing existing file at', finalPath);
          await fs.promises.unlink(finalPath);
        }
      } catch (e) {
        console.warn('[fileStore] Failed to remove existing file before overwrite', e);
      }
    }

    console.log('[fileStore] Writing file to', finalPath);
    await fs.promises.writeFile(finalPath, fileBuffer);
    console.log('[fileStore] File written:', finalName);

    // Optionally create a stable alias (symlink or copy) pointing to the written file
    if (opts.createAlias && opts.aliasName) {
      try {
        // prepare alias filename (sanitize and ensure extension)
        const aliasExt = path.extname(opts.aliasName) || ext || '';
        const aliasBase = path.basename(opts.aliasName, path.extname(opts.aliasName))
          .toLowerCase()
          .replace(/[^a-z0-9-_\.]/g, '-')
          .replace(/-+/g, '-')
          .replace(/(^-|-$)/g, '');
        const aliasName = `${aliasBase}${aliasExt}`;
        const aliasPath = path.join(assetsDir, aliasName);

        // If alias equals final file, nothing to do
        if (aliasName === finalName) {
          console.log('[fileStore] Alias name equals final file name; skipping alias creation');
          return `/assets/${opts.subfolder ? `${opts.subfolder}/${finalName}` : finalName}`;
        }

        // Remove existing alias if present
        if (fs.existsSync(aliasPath)) {
          try {
            await fs.promises.unlink(aliasPath);
            console.log('[fileStore] Removed existing alias at', aliasPath);
          } catch (e) {
            console.warn('[fileStore] Failed to remove existing alias', e);
          }
        }

        // Create a relative symlink from alias -> final file
        const relativeTarget = path.relative(path.dirname(aliasPath), finalPath) || finalName;
        try {
          await fs.promises.symlink(relativeTarget, aliasPath);
          console.log('[fileStore] Created symlink alias', aliasPath, '->', relativeTarget);
        } catch (symlinkErr) {
          console.warn('[fileStore] Symlink failed, falling back to copy:', symlinkErr.message || symlinkErr);
          // Fallback: copy file to alias location
          await fs.promises.copyFile(finalPath, aliasPath);
          console.log('[fileStore] Copied file to alias path', aliasPath);
        }

        return `/assets/${opts.subfolder ? `${opts.subfolder}/${aliasName}` : aliasName}`;
      } catch (aliasErr) {
        console.warn('[fileStore] Failed to create alias, returning actual file path', aliasErr);
        return `/assets/${opts.subfolder ? `${opts.subfolder}/${finalName}` : finalName}`;
      }
    }

    // Return path relative to public (served at /assets/<file>)
    return `/assets/${opts.subfolder ? `${opts.subfolder}/${finalName}` : finalName}`;
  } catch (err) {
    console.error('[fileStore] Error writing file', finalPath, err);
    throw err;
  }
}
