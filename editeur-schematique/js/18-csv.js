"use strict";

window.CSV_LIB = [];

function loadCSVFromString(text, filename) {
    const lines = csvLignes(text).filter(l => l.trim() !== "");
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
    
    // Tentative de chargement prioritaire via l'API serveur
    fetch('/api/lib/composants')
        .then(response => {
            if (!response.ok) throw new Error("API error " + response.status);
            return response.json();
        })
        .then(data => {
            if (data && Array.isArray(data.composants)) {
                window.CSV_LIB = data.composants;
                console.log("CSV_LIB chargé via API:", data.composants.length, "composants");
                schSymbolesPrecharger(data.composants);
                if (typeof refreshPanels === "function") refreshPanels();
            } else {
                throw new Error("Format API inattendu");
            }
        })
        .catch(() => {
            // Repli sur les fichiers statiques si mode hors-ligne
            const paths = CSV_LIB_REPLIS;
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
                    .catch(() => {
                        pathIndex++;
                        tryNextPath();
                    });
            }
            tryNextPath();
        });
}

loadCSVLib();
