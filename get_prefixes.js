const fs = require('fs');

function parseCSVLine(text) {
    let result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') { cur += '"'; i++; }
                else { inQuotes = false; }
            } else { cur += char; }
        } else {
            if (char === '"') { inQuotes = true; }
            else if (char === ';') { result.push(cur); cur = ""; }
            else { cur += char; }
        }
    }
    result.push(cur);
    return result;
}

const text = fs.readFileSync('LIB_composants.csv', 'utf8');
const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
const headers = parseCSVLine(lines[0]).map(h => h.trim());
const prefixIdx = headers.indexOf("Reference designator Prefix");
const typeIdx = headers.indexOf("Part Type");
const descIdx = headers.indexOf("Description");
const nameIdx = headers.indexOf("Part Name");

const prefixes = {};

for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const prefix = (values[prefixIdx] || "").trim().toUpperCase();
    if (!prefixes[prefix]) {
        prefixes[prefix] = { count: 0, examples: new Set(), types: new Set() };
    }
    prefixes[prefix].count++;
    if (prefixes[prefix].examples.size < 3) {
        prefixes[prefix].examples.add(values[nameIdx]);
    }
    prefixes[prefix].types.add(values[typeIdx]);
}

for (const p in prefixes) {
    console.log(`Prefix: '${p}' | Count: ${prefixes[p].count} | Types: ${Array.from(prefixes[p].types).join(", ")} | Examples: ${Array.from(prefixes[p].examples).join(", ")}`);
}
