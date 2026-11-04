// Backend Monster Attack (Cloudflare). Binding KV: DB. Variabel: ADMIN_KEY, GOOGLE_CLIENT_ID (opsional), FACEBOOK_APP_ID (opsional)
const J = (o, c = 200) => new Response(JSON.stringify(o), { status: c, headers: { "Content-Type": "application/json" } });
const hex = a => [...a].map(b => b.toString(16).padStart(2, "0")).join("");
const enc = s => new TextEncoder().encode(s);
const sha = async s => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc(s))));
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const mkh = async (pw, salt) => { const k = await crypto.subtle.importKey("raw", enc(pw), "PBKDF2", false, ["deriveBits"]); return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc(salt), iterations: 10000 }, k, 256))); };
const mkpw = async pw => { const s = rnd(8); return { s, h: await mkh(pw, s) }; };
const NAME = /^[\p{L}\p{N}_\-. ]{1,12}$/u;
const at = (b, o, a) => a.every((v, i) => b[o + i] === v);
const sniff = b => at(b,0,[0x89,0x50,0x4e,0x47]) ? "png" : at(b,0,[0xff,0xd8]) ? "jpg" : at(b,0,[0x47,0x49,0x46]) ? "gif"
  : (at(b,0,[0x52,0x49,0x46,0x46]) && at(b,8,[0x57,0x45,0x42,0x50])) ? "webp" : ["ftyp","moov","mdat","free","wide","skip","junk","pnot"].includes(String.fromCharCode(...b.slice(4,8))) ? "mp4" : at(b,0,[0x1a,0x45,0xdf,0xa3]) ? "webm" : null;
const CT = { png:"image/png", jpg:"image/jpeg", gif:"image/gif", webp:"image/webp", mp4:"video/mp4", webm:"video/webm" };
const pub = s => ({ id:s.id, kind:s.kind||"skin", name:s.name, file:s.file ? "/skins/"+s.file : "", type:s.type, rotate:s.rotate, bg:s.bg, size:s.size, price:s.price||0, fire:s.fire, aura:s.aura, cond:s.cond, howto:s.howto });
const HEX = /^#[0-9a-f]{6}$/i, cl = (v, a, b, d) => { if (v === "" || v == null) return d; v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const cleanMeta = b => { const c = b.cond || {}, f = b.fire || {}, a = b.aura || {}, col = (v, d) => HEX.test(v) ? v : d; return {
  kind: b.kind === "aura" ? "aura" : "skin", name: String(b.name || "Skin").slice(0, 20), price: Math.floor(cl(b.price, 0, 1e6, 0)),
  rotate: [0,90,180,270].includes(+b.rotate) ? +b.rotate : 0, bg: ["auto","none","black","white","green"].includes(b.bg) ? b.bg : "auto", size: cl(b.size, 24, 220, 64),
  cond: { type: ["free","coin","score","kills","bosses","playtime","games","badges"].includes(c.type) ? c.type : "free", value: Math.max(0, Math.floor(+c.value || 0)) },
  howto: String(b.howto || "").slice(0, 200),
  fire: { color: col(f.color, ""), rocketColor: col(f.rocketColor, "#ff6a00"), bulletSpeed: cl(f.bulletSpeed, 3, 30, 12), rocketSpeed: cl(f.rocketSpeed, 2, 30, 9),
    weapons: (Array.isArray(f.weapons) ? f.weapons : []).slice(0, 12).map(x => ({ type: x.type === "rocket" ? "rocket" : "bullet", x: cl(x.x, -90, 90, 0), y: cl(x.y, -70, 70, 0), angle: cl(x.angle, -80, 80, 0) })) },
  aura: { mode: a.mode === "media" ? "media" : "preset", preset: ["glow","ring","orbit","sparkle","flame","spiral","star"].includes(a.preset) ? a.preset : "glow",
    color: col(a.color, "#00fbff"), color2: col(a.color2, col(a.color, "#ff00ff")), size: cl(a.size, 10, 200, 50), speed: cl(a.speed, 0.1, 10, 1), count: Math.floor(cl(a.count, 1, 40, 8)),
    opacity: cl(a.opacity, 0.05, 1, 0.8), blend: a.blend === "normal" ? "normal" : "glow", spin: cl(a.spin, -720, 720, 0), pulse: cl(a.pulse, 0, 0.6, 0.1) } }; };
const DAY = 864e5, WIB = 7 * 36e5;
const week = () => { const d = Math.floor((Date.now() + WIB) / DAY), w = Math.floor((d + 3) / 7); return { id: w, end: (w * 7 - 3) * DAY - WIB + 7 * DAY }; }; // reset Senin 00:00 WIB
const hits = new Map(), limited = ip => { const m = "" + Math.floor(Date.now() / 60000), k = ip + "|" + m; for (const x of hits.keys()) if (!x.endsWith("|" + m)) hits.delete(x); hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) > 30; };
export default {
  async fetch(request, env) {
    const u = new URL(request.url), p = u.pathname, m = request.method, K = env.DB, ip = request.headers.get("cf-connecting-ip") || "";
    if (!p.startsWith("/api/") && !p.startsWith("/skins/")) return env.ASSETS.fetch(request);
    if (!K) return J({ error: "KV_DB_belum_di_bind" }, 500);
    const list = async () => (await K.get("skins", "json")) || [], bj = () => request.json().catch(() => ({}));
    const claim = async (name, id) => { const k = "n:" + name.toLowerCase(); if (await K.get(k)) return false; await K.put(k, id); return true; };
    const create = async (name, prov, ext, pw) => { const id = rnd(8), a = { id, name, prov, ext: ext || "", ths: [] }; if (pw) a.pw = await mkpw(pw); if (!(await claim(name, id))) return null; if (ext) await K.put("x:" + prov + ":" + ext, id); return a; };
    const session = async a => { const t = rnd(16); a.ths = [...(a.ths || []).slice(-7), await sha(t)]; await K.put("a:" + a.id, JSON.stringify(a)); return { id: a.id, name: a.name, token: t, prov: a.prov }; };
    const who = async b => { if (!b.id || !b.token) return null; const a = await K.get("a:" + String(b.id).slice(0, 32), "json"); return a && a.ths.includes(await sha(String(b.token))) ? a : null; };
    const oauth = async (prov, ext, nm) => { const id = await K.get("x:" + prov + ":" + ext); let a = id && await K.get("a:" + id, "json");
      if (!a) { const base = String(nm).replace(/[^\p{L}\p{N}_\-. ]/gu, "").trim().slice(0, 8) || "Pilot"; for (let i = 0; i < 8 && !a; i++) a = await create(i ? base + Math.floor(10 + Math.random() * 90) : base, prov, ext); if (!a) return J({ error: "gagal" }, 500); }
      return J(await session(a)); };
    try {
      if (p.startsWith("/skins/")) {
        const r = await K.getWithMetadata("f:" + decodeURIComponent(p.slice(7)), "arrayBuffer");
        if (!r.value) return new Response("404", { status: 404 });
        return new Response(r.value, { headers: { "Content-Type": r.metadata.ct, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
      }
      if (p === "/api/config") return J({ google: env.GOOGLE_CLIENT_ID || "", facebook: env.FACEBOOK_APP_ID || "" });
      if (p === "/api/skins") return J({ skins: (await list()).map(pub) });
      if (p === "/api/leaderboard") {
        const wk = week(), wb = (await K.get("wb:" + wk.id, "json")) || {}, me = u.searchParams.get("id"),
          all = Object.entries(wb).map(([id, e]) => ({ id, name: e.name, score: e.score, kills: e.kills })).filter(x => x.score > 0 || x.kills > 0).sort((a, b) => b.score - a.score || b.kills - a.kills), i = all.findIndex(x => x.id === me);
        return J({ top: all.slice(0, 20).map(x => ({ name: x.name, score: x.score, kills: x.kills })), me: i >= 0 ? { rank: i + 1, score: all[i].score, kills: all[i].kills } : null, resetAt: wk.end });
      }
      if (m === "POST" && p === "/api/auth") {
        if (limited(ip)) return J({ error: "terlalu_cepat" }, 429);
        const b = await bj(), name = String(b.name || "").trim(), pw = String(b.password || "");
        if (b.mode === "guest") {
          if (name && !NAME.test(name)) return J({ error: "nama_tidak_valid" }, 400);
          let a = null;
          if (name) { a = await create(name, "guest"); if (!a) return J({ error: "nama_dipakai" }, 409); }
          else for (let i = 0; i < 6 && !a; i++) a = await create("Tamu" + (1000 + Math.floor(Math.random() * 9000)), "guest");
          return a ? J(await session(a)) : J({ error: "gagal" }, 500);
        }
        if (b.mode === "register") {
          if (!NAME.test(name)) return J({ error: "nama_tidak_valid" }, 400);
          if (pw.length < 4 || pw.length > 64) return J({ error: "sandi_pendek" }, 400);
          const a = await create(name, "pass", "", pw); return a ? J(await session(a)) : J({ error: "nama_dipakai" }, 409);
        }
        if (b.mode === "login") {
          const id = await K.get("n:" + name.toLowerCase()), a = id && await K.get("a:" + id, "json");
          if (!a || !a.pw || (await mkh(pw, a.pw.s)) !== a.pw.h) return J({ error: "akun_tidak_ada" }, 401);
          return J(await session(a));
        }
        if (b.mode === "google") {
          if (!env.GOOGLE_CLIENT_ID) return J({ error: "google_belum_aktif" }, 400);
          const t = await (await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(String(b.cred || "")))).json();
          if (t.aud !== env.GOOGLE_CLIENT_ID || !t.sub) return J({ error: "token_tidak_valid" }, 401);
          return oauth("google", t.sub, t.given_name || t.name || "Pilot");
        }
        if (b.mode === "facebook") {
          if (!env.FACEBOOK_APP_ID) return J({ error: "facebook_belum_aktif" }, 400);
          const tk = encodeURIComponent(String(b.cred || "")), me = await (await fetch("https://graph.facebook.com/me?fields=id,name&access_token=" + tk)).json(), ap = await (await fetch("https://graph.facebook.com/app?access_token=" + tk)).json();
          if (!me.id || String(ap.id) !== String(env.FACEBOOK_APP_ID)) return J({ error: "token_tidak_valid" }, 401);
          return oauth("facebook", me.id, String(me.name || "Pilot").split(" ")[0]);
        }
        return J({ error: "mode_salah" }, 400);
      }
      if (m === "POST" && ["/api/score", "/api/rename", "/api/setpw", "/api/logout", "/api/pget", "/api/pput"].includes(p)) {
        const b = await bj(), a = await who(b);
        if (!a) return J({ error: "sesi_tidak_valid" }, 401);
        if (p === "/api/score") {
          const s = Math.floor(+b.score) || 0, k = Math.floor(+b.kills) || 0;
          if (s < 0 || s > 5e6 || k < 0 || k > 5000) return J({ error: "skor_tidak_valid" }, 400);
          const key = "wb:" + week().id, wb = (await K.get(key, "json")) || {}, e = wb[a.id] || { name: a.name, score: 0, kills: 0 }, rid = String(b.rid || "").slice(0, 40);
          if (rid && e.rid === rid) return J({ ok: true });
          e.name = a.name; e.score = Math.max(e.score, s); e.kills += k; e.rid = rid; wb[a.id] = e;
          const ids = Object.keys(wb); if (ids.length > 2000) ids.sort((x, y) => wb[y].score - wb[x].score).slice(1500).forEach(x => delete wb[x]);
          await K.put(key, JSON.stringify(wb), { expirationTtl: 1814400 }); return J({ ok: true });
        }
        if (p === "/api/rename") {
          const nn = String(b.name || "").trim(); if (!NAME.test(nn)) return J({ error: "nama_tidak_valid" }, 400);
          const same = nn.toLowerCase() === a.name.toLowerCase();
          if (!same) { if (!(await claim(nn, a.id))) return J({ error: "nama_dipakai" }, 409); await K.delete("n:" + a.name.toLowerCase()); }
          a.name = nn; await K.put("a:" + a.id, JSON.stringify(a));
          const key = "wb:" + week().id, wb = await K.get(key, "json"); if (wb && wb[a.id]) { wb[a.id].name = nn; await K.put(key, JSON.stringify(wb), { expirationTtl: 1814400 }); }
          return J({ ok: true, name: nn });
        }
        if (p === "/api/setpw") { const pw = String(b.password || ""); if (pw.length < 4 || pw.length > 64) return J({ error: "sandi_pendek" }, 400); a.pw = await mkpw(pw); await K.put("a:" + a.id, JSON.stringify(a)); return J({ ok: true }); }
        if (p === "/api/logout") { const h = await sha(String(b.token)); a.ths = a.ths.filter(x => x !== h); await K.put("a:" + a.id, JSON.stringify(a)); return J({ ok: true }); }
        if (p === "/api/pget") return J({ data: await K.get("d:" + a.id, "json") });
        const s = JSON.stringify(b.data || {}); if (s.length > 30000) return J({ error: "terlalu_besar" }, 400);
        await K.put("d:" + a.id, s); return J({ ok: true });
      }
      if (p.startsWith("/api/admin")) {
        if (!env.ADMIN_KEY || (await sha(request.headers.get("x-admin-key") || "")) !== (await sha(env.ADMIN_KEY))) return J({ error: "kunci_salah" }, 401);
        if (m === "GET" && p === "/api/admin/skins") return J({ skins: (await list()).map(pub) });
        if ((m === "POST" && p === "/api/admin/skins") || (m === "PUT" && p.startsWith("/api/admin/skins/"))) {
          const buf = await request.arrayBuffer(), l = await list(), fields = cleanMeta(JSON.parse(decodeURIComponent(request.headers.get("x-meta") || "{}")));
          const needFile = fields.kind === "skin" || fields.aura.mode === "media";
          let s = m === "PUT" ? l.find(x => x.id === p.split("/").pop()) : null, ext = null;
          if (m === "PUT" && !s) return J({ error: "tidak_ada" }, 404);
          if (buf.byteLength) {
            ext = sniff(new Uint8Array(buf, 0, Math.min(12, buf.byteLength)));
            if (!ext) return J({ error: "file_tidak_dikenali:" + [...new Uint8Array(buf, 0, Math.min(12, buf.byteLength))].map(x => x.toString(16).padStart(2, "0")).join(" ") }, 400);
          } else if (needFile && !(s && s.file)) return J({ error: "file_wajib" }, 400);
          if (!s) { s = { id: rnd(5), file: "" }; l.push(s); }
          if (ext) { const old = s.file; s.file = s.id + "-" + rnd(3) + "." + ext; s.type = (ext === "mp4" || ext === "webm") ? "video" : "image"; await K.put("f:" + s.file, buf, { metadata: { ct: CT[ext] } }); if (old) await K.delete("f:" + old); }
          if (!needFile && s.file) { await K.delete("f:" + s.file); s.file = ""; }
          Object.assign(s, fields); await K.put("skins", JSON.stringify(l));
          return J({ ok: true });
        }
        if (m === "DELETE" && p.startsWith("/api/admin/skins/")) {
          const id = p.split("/").pop(), l = await list(), s = l.find(x => x.id === id);
          if (s) { if (s.file) await K.delete("f:" + s.file); await K.put("skins", JSON.stringify(l.filter(x => x !== s))); }
          return J({ ok: true });
        }
      }
      return J({ error: "tidak_ada" }, 404);
    } catch (e) { return J({ error: "bad_request" }, 400); }
  }
};
