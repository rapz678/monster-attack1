// Backend Monster Attack untuk Netlify: leaderboard + skin (data di Netlify Blobs)
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
export const config = { path: ["/api/*", "/skins/*"] };
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const NAME = /^[\p{L}\p{N}_\-. ]{1,12}$/u;
const J = (o, c = 200) => new Response(JSON.stringify(o), { status: c, headers: { "Content-Type": "application/json" } });
const sniff = b => b.slice(0,4).equals(Buffer.from([0x89,0x50,0x4e,0x47])) ? "png" : (b[0]==0xff&&b[1]==0xd8) ? "jpg" : b.slice(0,3).toString()=="GIF" ? "gif"
  : (b.slice(0,4).toString()=="RIFF"&&b.slice(8,12).toString()=="WEBP") ? "webp" : b.slice(4,8).toString()=="ftyp" ? "mp4" : b.slice(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) ? "webm" : null;
const CT = { png:"image/png", jpg:"image/jpeg", gif:"image/gif", webp:"image/webp", mp4:"video/mp4", webm:"video/webm" };
const pub = s => ({ id:s.id, name:s.name, file:"/skins/"+s.file, type:s.type, rotate:s.rotate, cond:s.cond, howto:s.howto });
export default async (req) => {
  const u = new URL(req.url), p = u.pathname, m = req.method;
  const P = getStore("players"), S = getStore("skins"), F = getStore("skinfiles");
  const list = async () => (await S.get("list", { type: "json" })) || [];
  try {
    if (p.startsWith("/skins/")) {
      const r = await F.getWithMetadata(decodeURIComponent(p.slice(7)), { type: "arrayBuffer" });
      if (!r) return new Response("404", { status: 404 });
      return new Response(r.data, { headers: { "Content-Type": r.metadata.ct, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
    }
    if (p === "/api/leaderboard") {
      const { blobs } = await P.list();
      const all = (await Promise.all(blobs.map(b => P.get(b.key, { type: "json" })))).filter(x => x && x.score > 0).sort((a, b) => b.score - a.score);
      const n = (u.searchParams.get("name") || "").toLowerCase(), i = all.findIndex(x => x.name.toLowerCase() === n);
      return J({ top: all.slice(0, 20).map(x => ({ name: x.name, score: x.score })), me: i >= 0 ? { rank: i + 1, score: all[i].score } : null });
    }
    if (p === "/api/skins") return J({ skins: (await list()).map(pub) });
    if (m === "POST" && (p === "/api/register" || p === "/api/score")) {
      const b = await req.json(), name = String(b.name || "").trim();
      if (!NAME.test(name)) return J({ error: "nama_tidak_valid" }, 400);
      const key = encodeURIComponent(name.toLowerCase()), pl = await P.get(key, { type: "json" });
      if (p === "/api/register") {
        if (pl) return J({ error: "nama_dipakai" }, 409);
        const token = crypto.randomBytes(16).toString("hex");
        await P.setJSON(key, { name, th: sha(token), score: 0 });
        return J({ token });
      }
      if (!pl) return J({ error: "belum_terdaftar" }, 404);
      if (sha(String(b.token)) !== pl.th) return J({ error: "token_salah" }, 403);
      const s = Math.floor(Number(b.score));
      if (!(s >= 0 && s <= 5e6)) return J({ error: "skor_tidak_valid" }, 400);
      if (s > pl.score) { pl.score = s; await P.setJSON(key, pl); }
      return J({ ok: true });
    }
    if (p.startsWith("/api/admin")) {
      const A = process.env.ADMIN_KEY;
      if (!A || !crypto.timingSafeEqual(Buffer.from(sha(req.headers.get("x-admin-key") || "")), Buffer.from(sha(A)))) return J({ error: "kunci_salah" }, 401);
      if (m === "GET" && p === "/api/admin/skins") return J({ skins: (await list()).map(pub) });
      if (m === "POST" && p === "/api/admin/skins") {
        const b = await req.json(), buf = Buffer.from(String(b.data || ""), "base64"), ext = sniff(buf), c = b.cond || {};
        if (!ext) return J({ error: "file_harus_png_jpg_webp_gif_mp4_webm" }, 400);
        const id = crypto.randomBytes(5).toString("hex"), file = id + "." + ext;
        await F.set(file, buf, { metadata: { ct: CT[ext] } });
        const l = await list();
        l.push({ id, name: String(b.name || "Skin").slice(0, 20), file, type: (ext === "mp4" || ext === "webm") ? "video" : "image", rotate: [0,90,180,270].includes(+b.rotate) ? +b.rotate : 0,
          cond: { type: ["free","score","kills","bosses","playtime","games","badges"].includes(c.type) ? c.type : "free", value: Math.max(0, Math.floor(+c.value || 0)) }, howto: String(b.howto || "").slice(0, 200) });
        await S.setJSON("list", l);
        return J({ ok: true });
      }
      if (m === "DELETE" && p.startsWith("/api/admin/skins/")) {
        const id = p.split("/").pop(), l = await list(), s = l.find(x => x.id === id);
        if (s) { await F.delete(s.file); await S.setJSON("list", l.filter(x => x !== s)); }
        return J({ ok: true });
      }
    }
    return J({ error: "tidak_ada" }, 404);
  } catch (e) { return J({ error: "bad_request" }, 400); }
};
