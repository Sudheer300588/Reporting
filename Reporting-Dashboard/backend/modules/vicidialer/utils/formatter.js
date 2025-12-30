export function parsePipeData(raw) {
    if (!raw || typeof raw !== "string") return null;

    const text = raw.trim();

    // Auto-detect delimiter
    let delimiter = "|";
    if (text.includes(",") && !text.includes("|")) {
        delimiter = ",";
    }

    const lines = text.split("\n").filter(Boolean);

    if (lines.length === 0) return null;

    const headers = lines[0].split(delimiter).map(h => h.trim());

    // Single row (header + data)
    if (lines.length === 2) {
        const values = lines[1].split(delimiter);
        const obj = {};
        headers.forEach((h, i) => obj[h] = (values[i] || "").trim());
        return obj;
    }

    // Multiple rows
    const rows = lines.slice(1);
    return rows.map(line => {
        const values = line.split(delimiter);
        const obj = {};
        headers.forEach((h, i) => obj[h] = (values[i] || "").trim());
        return obj;
    });
}
