const fs = require("fs");

const r = JSON.parse(fs.readFileSync("./azure-response.json", "utf8"));
const f = r.documents[0].fields;

// Quitamos coordenadas y textos pesados para que ocupe poco
const limpiar = (obj) =>
    JSON.parse(
        JSON.stringify(obj, (key, value) =>
            ["boundingRegions", "spans", "polygon", "content", "confidence"].includes(key)
                ? undefined
                : value
        )
    );

const salida = {
    TaxDetails: limpiar(f.TaxDetails),
    Totales: limpiar({
        SubTotal: f.SubTotal,
        TotalTax: f.TotalTax,
        InvoiceTotal: f.InvoiceTotal,
    }),
    // Solo las 3 primeras líneas de productos
    Items: limpiar((f.Items?.valueArray || []).slice(0, 3)),
};

fs.writeFileSync("./resumen.json", JSON.stringify(salida, null, 2));
console.log("Listo: resumen.json");

// Texto de la zona del desglose de IVA
const texto = r.content;
const pos = texto.search(/desglose|base\s*imponible|B\.?\s*imponible/i);
fs.writeFileSync(
    "./desglose.txt",
    texto.slice(Math.max(0, pos - 200), pos + 800)
);
console.log("Listo: desglose.txt");