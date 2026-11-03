// Backend Monster Attack untuk Cloudflare Pages (data di KV dengan nama binding "DB")
const J = (o, c = 200) => new Response(JSON.stringify(o), { status: c, headers: { "Content-Type": "application/json" } });
const hex = a => [...a].map(b => b.toString(16).padStart(2, "0")).join("");
const sha = async s => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const NAME = /^[\p{L}\p{N}_\-. ]{1,12}$/u;
const at = (b, o, a) => a.every((v, i) => b[o + i] === v);
const sniff = b => at(b,0,[0x89,0x50,0x4e,0x47]) ? "png" : at(b,0,[0xff,0xd8]) ? "jpg" : at(b,0,[0x47,0x49,0x46]) ? "gif"
  : (at(b,0,[0x52,0x49,0x46,0x46]) && at(b,8,[0x57,0x45,0x42,0x50])) ? "webp" : ["ftyp","moov","mdat","free","wide","skip","junk","pnot"].includes(String.fromCharCode(...b.slice(4,8))) ? "mp4" : at(b,0,[0x1a,0x45,0xdf,0xa3]) ? "webm" : null;
const CT = { png:"image/png", jpg:"image/jpeg", gif:"image/gif", webp:"image/webp", mp4:"video/mp4", webm:"video/webm" };
const pub = s => ({ id:s.id, name:s.name, file:"/skins/"+s.file, type:s.type, rotate:s.rotate, bg:s.bg, size:s.size, fire:s.fire, cond:s.cond, howto:s.howto });
const HEX = /^#[0-9a-f]{6}$/i, cl = (v, a, b, d) => { if (v === "" || v == null) return d; v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const cleanMeta = b => { const c = b.cond || {}, f = b.fire || {}; return {
  name: String(b.name || "Skin").slice(0, 20), rotate: [0,90,180,270].includes(+b.rotate) ? +b.rotate : 0,
  bg: ["auto","none","black","white","green"].includes(b.bg) ? b.bg : "auto", size: cl(b.size, 24, 220, 64),
  cond: { type: ["free","score","kills","bosses","playtime","games","badges"].includes(c.type) ? c.type : "free", value: Math.max(0, Math.floor(+c.value || 0)) },
  howto: String(b.howto || "").slice(0, 200),
  fire: { color: HEX.test(f.color) ? f.color : "", rocketColor: HEX.test(f.rocketColor) ? f.rocketColor : "#ff6a00", bulletSpeed: cl(f.bulletSpeed, 3, 30, 12), rocketSpeed: cl(f.rocketSpeed, 2, 30, 9),
    weapons: (Array.isArray(f.weapons) ? f.weapons : []).slice(0, 12).map(x => ({ type: x.type === "rocket" ? "rocket" : "bullet", x: cl(x.x, -90, 90, 0), y: cl(x.y, -70, 70, 0), angle: cl(x.angle, -80, 80, 0) })) } }; };
export default {
  async fetch(request, env) {
    const u = new URL(request.url), p = u.pathname, m = request.method, K = env.DB;
    if (!p.startsWith("/api/") && !p.startsWith("/skins/")) return env.ASSETS.fetch(request);
    if (!K) return J({ error: "KV_DB_belum_di_bind" }, 500);
    const list = async () => (await K.get("skins", "json")) || [];
    try {
      if (p.startsWith("/skins/")) {
        const r = await K.getWithMetadata("f:" + decodeURIComponent(p.slice(7)), "arrayBuffer");
        if (!r.value) return new Response("404", { status: 404 });
        return new Response(r.value, { headers: { "Content-Type": r.metadata.ct, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
      }
      if (p === "/api/leaderboard") {
        const all = (await K.get("board", "json")) || [], n = (u.searchParams.get("name") || "").toLowerCase(), i = all.findIndex(x => x.name.toLowerCase() === n);
        return J({ top: all.slice(0, 20), me: i >= 0 ? { rank: i + 1, score: all[i].score } : null });
      }
      if (p === "/api/skins") return J({ skins: (await list()).map(pub) });
      if (m === "POST" && (p === "/api/register" || p === "/api/score")) {
        const b = await request.json(), name = String(b.name || "").trim();
        if (!NAME.test(name)) return J({ error: "nama_tidak_valid" }, 400);
        const key = "p:" + encodeURIComponent(name.toLowerCase()), pl = await K.get(key, "json");
        if (p === "/api/register") {
          if (pl) return J({ error: "nama_dipakai" }, 409);
          const token = rnd(16);
          await K.put(key, JSON.stringify({ name, th: await sha(token), score: 0 }));
          return J({ token });
        }
        if (!pl) return J({ error: "belum_terdaftar" }, 404);
        if ((await sha(String(b.token))) !== pl.th) return J({ error: "token_salah" }, 403);
        const s = Math.floor(Number(b.score));
        if (!(s >= 0 && s <= 5e6)) return J({ error: "skor_tidak_valid" }, 400);
        if (s > pl.score) {
          pl.score = s; await K.put(key, JSON.stringify(pl));
          let board = ((await K.get("board", "json")) || []).filter(x => x.name.toLowerCase() !== name.toLowerCase());
          board.push({ name: pl.name, score: s }); board.sort((a, c) => c.score - a.score);
          await K.put("board", JSON.stringify(board.slice(0, 1000)));
        }
        return J({ ok: true });
      }
      if (p.startsWith("/api/admin")) {
        if (!env.ADMIN_KEY || (await sha(request.headers.get("x-admin-key") || "")) !== (await sha(env.ADMIN_KEY))) return J({ error: "kunci_salah" }, 401);
        if (m === "GET" && p === "/api/admin/skins") return J({ skins: (await list()).map(pub) });
        if ((m === "POST" && p === "/api/admin/skins") || (m === "PUT" && p.startsWith("/api/admin/skins/"))) {
          const buf = await request.arrayBuffer(), l = await list(), meta = JSON.parse(decodeURIComponent(request.headers.get("x-meta") || "{}"));
          let s = m === "PUT" ? l.find(x => x.id === p.split("/").pop()) : null, ext = null;
          if (m === "PUT" && !s) return J({ error: "tidak_ada" }, 404);
          if (buf.byteLength || !s) {
            ext = sniff(new Uint8Array(buf, 0, Math.min(12, buf.byteLength)));
            if (!ext) return J({ error: "file_tidak_dikenali:" + [...new Uint8Array(buf, 0, Math.min(12, buf.byteLength))].map(x => x.toString(16).padStart(2, "0")).join(" ") }, 400);
          }
          if (!s) { s = { id: rnd(5) }; l.push(s); }
          if (ext) { const old = s.file; s.file = s.id + "-" + rnd(3) + "." + ext; s.type = (ext === "mp4" || ext === "webm") ? "video" : "image"; await K.put("f:" + s.file, buf, { metadata: { ct: CT[ext] } }); if (old) await K.delete("f:" + old); }
          Object.assign(s, cleanMeta(meta)); await K.put("skins", JSON.stringify(l));
          return J({ ok: true });
        }
        if (m === "DELETE" && p.startsWith("/api/admin/skins/")) {
          const id = p.split("/").pop(), l = await list(), s = l.find(x => x.id === id);
          if (s) { await K.delete("f:" + s.file); await K.put("skins", JSON.stringify(l.filter(x => x !== s))); }
          return J({ ok: true });
        }
      }
      return J({ error: "tidak_ada" }, 404);
    } catch (e) { return J({ error: "bad_request" }, 400); }
  }
};
