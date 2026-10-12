// Vercel Serverless Function: GET /api/harga → harga ANTAM per keping (jual & buyback) dari galeri24.co.id.
// Browser tidak bisa membaca situs lain (CORS), jadi website memanggil file ini di server Vercel.
const URL = "https://galeri24.co.id/harga-emas";
const KEPING = [0.5, 1, 2, 3, 5, 10, 25, 50, 100];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const toText = h => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const num = s => +s.replace(/[^\d]/g, "");
const key = g => String(g).replace(".", "_");

// Galeri 24 text: "Harga ANTAM Berat Harga Jual Harga Buyback 0.5 Rp1.367.000 Rp1.180.000 1 Rp2.631.000 ... Diperbarui ..."
function parse(text) {
  const start = text.search(/Harga ANTAM\s+Berat/i); // exact section, not "ANTAM MULIA RETRO" / "ANTAM NON PEGADAIAN"
  if (start < 0) return null;
  const rest = text.slice(start + 11);
  const end = rest.search(/Diperbarui|Harga (?!Jual|Buyback)[A-Z]/i);
  const sect = end > 0 ? rest.slice(0, end) : rest.slice(0, 4000);
  const p = {};
  for (const g of KEPING) {
    const lab = g === 0.5 ? "0[.,]5" : String(g);
    const m = sect.match(new RegExp("(?:^|\\s)" + lab + "\\s+Rp\\s?([\\d.,]+)\\s+Rp\\s?([\\d.,]+)"));
    if (m) { p["j" + key(g)] = num(m[1]); p["b" + key(g)] = num(m[2]); }
  }
  p.buyback_gr = p.b1 || null;
  return p;
}

function check(p) {
  if (!p) return "tabel ANTAM tidak ditemukan di halaman Galeri 24";
  const bb = p.buyback_gr || 0, j1 = p.j1 || 0;
  if (!(bb > 500000 && bb < 20000000)) return `buyback 1 gr tidak terbaca (${bb})`;
  if (!(j1 > bb && j1 < bb * 1.2)) return `harga 1 gr tidak wajar (${j1})`;
  let prev = 0;
  for (const g of KEPING) {
    const v = p["j" + key(g)], b = p["b" + key(g)];
    if (!v) continue;
    if (v <= prev || !(b < v) || v / g > j1 * 1.15 || v / g < bb * 0.9) return `harga keping ${g} gr tidak wajar (${v} / ${b})`;
    prev = v;
  }
  return "";
}

module.exports = async (req, res) => {
  try {
    const r = await fetch(URL, { headers: { "User-Agent": UA, "Accept-Language": "id-ID,id;q=0.9", Accept: "text/html" } });
    if (!r.ok) throw new Error(`Galeri 24 membalas HTTP ${r.status}`);
    const p = parse(toText(await r.text()));
    const why = check(p);
    if (why) return res.status(502).json({ ok: false, error: why });
    p.tanggal = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    p.sumber = "galeri24";
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=43200"); // Vercel caches 30 min
    return res.status(200).json({ ok: true, price: p });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
};
module.exports.parse = parse;
module.exports.check = check;
