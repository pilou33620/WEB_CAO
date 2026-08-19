"use strict";

window.CSV_LIB = [];

// Helper pour parser la ligne CSV (avec séparateur point-virgule)
function parseCSVLine(text) {
    let result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                cur += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ';') {
                result.push(cur);
                cur = "";
            } else {
                cur += char;
            }
        }
    }
    result.push(cur);
    return result;
}

function loadCSVFromString(text, filename) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
    if (lines.length === 0) return;
    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        let entry = {};
        for (let j = 0; j < headers.length; j++) {
            entry[headers[j]] = values[j] ? values[j].trim() : "";
        }
        data.push(entry);
    }
    window.CSV_LIB = data;
    console.log("CSV_LIB chargé:", data.length, "composants depuis", filename);
    if (typeof refreshPanels === "function") refreshPanels();
}

function initManualCsvLoader() {
    let input = document.getElementById("csvIn");
    if (!input) {
        input = document.createElement("input");
        input.type = "file";
        input.id = "csvIn";
        input.accept = ".csv";
        input.style.display = "none";
        document.body.appendChild(input);
        
        input.onchange = e => {
            const f = e.target.files[0];
            e.target.value = "";
            if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
                loadCSVFromString(rd.result, f.name);
            };
            rd.readAsText(f);
        };
    }
}

function loadCSVLib() {
    initManualCsvLoader();
    
    const paths = [
        '../LIB_composants.csv',
        '../../LIB_composants.csv',
        '/LIB_composants.csv'
    ];
    let pathIndex = 0;
    function tryNextPath() {
        if (pathIndex >= paths.length) {
            console.warn("Impossible de charger LIB_composants.csv via HTTP (bloqué par CORS en mode fichier local ?).");
            if (typeof refreshPanels === "function") refreshPanels();
            return;
        }
        fetch(paths[pathIndex])
            .then(response => {
                if (!response.ok) throw new Error("HTTP error " + response.status);
                return response.text();
            })
            .then(text => loadCSVFromString(text, paths[pathIndex]))
            .catch(err => {
                pathIndex++;
                tryNextPath();
            });
    }
    tryNextPath();
}

loadCSVLib();
