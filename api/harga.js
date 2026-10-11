// Vercel Serverless Function: GET /api/harga → harga LM Antam hari ini, dibaca langsung dari logammulia.com.
// Browser tidak bisa membaca situs Antam (CORS), jadi website memanggil file ini di server Vercel.
const URL_HARGA = "https://www.logammulia.com/id/harga-emas-hari-ini";
const URL_BUYBACK = "https://www.logammulia.com/id/sell/gold";
const KEPING = [0.5, 1, 2, 3, 5, 10, 25, 50, 100];
const RP = "(\\d{1,3}(?:[.,]\\d{3}){2,3})";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "id-ID,id;q=0.9", Accept: "text/html" } });
  if (!r.ok) throw new Error(`${url} membalas HTTP ${r.status}`);
  return r.text();
}
const toText = h => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const num = s => +s.replace(/[^\d]/g, "");

function readJual(sect) {
  const out = {};
  for (const g of KEPING) {
    const lab = g === 0.5 ? "0[.,]5" : `${g}(?:[.,]0)?`;
    const m = sect.match(new RegExp("(?:^|\\s)" + lab + "\\s*(?:gr|gram)\\b[^\\d]{0,60}?" + RP, "i"));
    if (m) out["j" + String(g).replace(".", "_")] = num(m[1]);
  }
  return out;
}

function parse(textHarga, textBuyback) {
  let best = readJual(textHarga);
  // "Emas Batangan" also appears in menus; keep the occurrence that yields the most prices
  for (const m of textHarga.matchAll(/Emas Batangan(?!\s*(Gift|Batik|Imlek|Selamat))/gi)) {
    const j = readJual(textHarga.slice(m.index, m.index + 6000));
    if (Object.keys(j).length >= Object.keys(best).length) best = j;
  }
  const re = new RegExp("(?:buyback|harga beli kembali|pembelian kembali)[^\\d]{0,120}?" + RP, "i");
  const b = textBuyback.match(re) || textHarga.match(re);
  return { ...best, buyback_gr: b ? num(b[1]) : null };
}

function check(p) {
  const bb = p.buyback_gr || 0, j1 = p.j1 || 0;
  if (!(bb > 500000 && bb < 20000000)) return `buyback tidak terbaca (${bb})`;
  if (!(j1 > bb && j1 < bb * 1.2)) return `harga 1 gr tidak wajar (${j1})`;
  let prev = 0;
  for (const g of KEPING) {
    const v = p["j" + String(g).replace(".", "_")];
    if (!v) continue;
    if (v <= prev || v / g > j1 * 1.15 || v / g < bb) return `harga keping ${g} gr tidak wajar (${v})`;
    prev = v;
  }
  return "";
}

module.exports = async (req, res) => {
  try {
    const [h, b] = await Promise.all([get(URL_HARGA), get(URL_BUYBACK).catch(() => "")]);
    const p = parse(toText(h), toText(b));
    const why = check(p);
    if (why) return res.status(502).json({ ok: false, error: why });
    p.tanggal = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    p.sumber = "antam";
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=43200"); // Vercel caches 30 min, so Antam is hit rarely
    return res.status(200).json({ ok: true, price: p });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
};
module.exports.parse = parse;
module.exports.check = check;
