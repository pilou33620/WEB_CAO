// Verifie que formaterMarkdown (commun/ia-assistant.js) n'injecte pas de HTML du modele.
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "ia-assistant.js"), "utf8").replace(/\r/g, "");
const extraire = n => { const i = src.indexOf("function " + n + "("); return src.slice(i, src.indexOf("\n  }\n", i) + 4); };
const c = { btoa: s => Buffer.from(s, "binary").toString("base64"), unescape, encodeURIComponent, console };
vm.createContext(c);
vm.runInContext(extraire("echapperHtml") + extraire("encoderBase64Utf8") + extraire("formaterMarkdown"), c);

// une ligne qui porte un bloc de code passait telle quelle a innerHTML
let h = c.formaterMarkdown("x %%CODEBLOCK_9%% <img src=x onerror=alert(1)>");
assert.ok(!h.includes("<img"), "ligne a bloc non echappee : " + h);
h = c.formaterMarkdown("avant ```js\nlet a = \"$'\";\n``` <img src=x onerror=1>");
assert.ok(!h.includes("<img"), "texte autour du bloc non echappe : " + h);
assert.ok(h.includes("ia-code-block") && h.includes("$&#39;"), "bloc de code perdu ou altere : " + h);
h = c.formaterMarkdown("**gras** <script>alert(1)</script>");
assert.ok(h.includes("<b>gras</b>") && !h.includes("<script"), "paragraphe : " + h);
console.log("ok");
