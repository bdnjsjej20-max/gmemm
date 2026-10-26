const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, pingInterval: 25000, pingTimeout: 20000 });
const PORT = process.env.PORT || 3000;
const SAVE_FILE = path.join(__dirname, "world-save.json");
app.use(express.static(path.join(__dirname, "public")));

const LIMIT = 1000;
const MAG_SIZE = 18;
const players = new Map(), resources = new Map(), structures = new Map(), enemies = new Map();
const cooldowns = new Map();
const colors = ["#65f0d2", "#a78bfa", "#f59e0b", "#fb7185", "#60a5fa", "#bef264"];
const types = ["Кристалл", "Сплав", "Биомасса", "Реликт"];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function collidesStructure(x, z) {
  for (const s of structures.values()) {
    const dx = x - s.x, dz = z - s.z, type = s.type || "relay";
    if (type === "wall") {
      const yaw = Number.isFinite(s.yaw) ? s.yaw : 0;
      const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      if (Math.abs(lx) < 1.86 && Math.abs(lz) < 0.78) return true;
    } else if (type === "house") {
      const yaw = Number.isFinite(s.yaw) ? s.yaw : 0;
      const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const sideWall = Math.abs(lx) > 2.35 && Math.abs(lx) < 3.15 && Math.abs(lz) < 2.35;
      const backWall = lz < -1.55 && lz > -2.42 && Math.abs(lx) < 3.05;
      const frontWall = lz > 1.55 && lz < 2.42 && Math.abs(lx) > 0.72 && Math.abs(lx) < 3.05;
      if (sideWall || backWall || frontWall) return true;
    } else if (Math.hypot(dx, dz) < (type === "turret" ? 1.25 : 1.65)) return true;
  }
  return false;
}
function structurePlacementBlocked(x, z, type, yaw) {
  for (const s of structures.values()) {
    const dx = x - s.x, dz = z - s.z, other = s.type || "relay";
    if (type === "house") {
      const a = Number.isFinite(yaw) ? yaw : 0;
      const lx = dx * Math.cos(a) - dz * Math.sin(a);
      const lz = dx * Math.sin(a) + dz * Math.cos(a);
      if (Math.abs(lx) < 4.1 && Math.abs(lz) < 3.15) return true;
    } else if (other === "house") {
      const a = Number.isFinite(s.yaw) ? s.yaw : 0;
      const lx = dx * Math.cos(a) - dz * Math.sin(a);
      const lz = dx * Math.sin(a) + dz * Math.cos(a);
      if (Math.abs(lx) < 3.7 && Math.abs(lz) < 2.85) return true;
    } else if (type === "wall") {
      const a = Number.isFinite(yaw) ? yaw : 0;
      const lx = dx * Math.cos(a) - dz * Math.sin(a);
      const lz = dx * Math.sin(a) + dz * Math.cos(a);
      const halfDepth = other === "wall" ? 1.05 : other === "turret" ? 1.6 : 1.85;
      if (Math.abs(lx) < 2.25 && Math.abs(lz) < halfDepth) return true;
    } else if (other === "wall") {
      const a = Number.isFinite(s.yaw) ? s.yaw : 0;
      const lx = dx * Math.cos(a) - dz * Math.sin(a);
      const lz = dx * Math.sin(a) + dz * Math.cos(a);
      if (Math.abs(lx) < (type === "turret" ? 1.65 : 1.9) && Math.abs(lz) < 1.05) return true;
    } else if (Math.hypot(dx, dz) < (type === "turret" ? 1.35 : 1.7) + (other === "turret" ? 1.35 : 1.7)) {
      return true;
    }
  }
  return false;
}
const safeName = v => String(v || "Путник").replace(/[<>]/g, "").trim().slice(0, 18) || "Путник";
const pub = p => ({ id: p.id, name: p.name, x: p.x, z: p.z, yaw: p.yaw, color: p.color, hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp, ammo: p.ammo, reserve: p.reserve, reloading: !!p.reloading, kills: p.kills || 0, deaths: p.deaths || 0, dead: !!p.dead });
function notify(s, msg) { s.emit("notice", msg); }
function cd(id, key, ms) { const k = id + ":" + key, n = Date.now(), last = cooldowns.get(k) || 0; if (n - last < ms) return false; cooldowns.set(k, n); return true; }
function resource(id, x, z, type, amount) { resources.set(id, { id, x, z, type, amount }); }

// Shared, repeatable contract. One relay starts a co-op holdout; the team must keep it alive.
let mission = { phase: "salvage", round: 1, completed: 0, relayId: null, relayHp: 100, relayMaxHp: 100, startedAt: 0, endsAt: 0, nextWaveAt: 0, wavesLeft: 0, resetAt: 0 };
function publicMission() {
  const relay = mission.relayId ? structures.get(mission.relayId) : null;
  return {
    phase: mission.phase, round: mission.round, completed: mission.completed,
    relayId: mission.relayId, relayHp: mission.relayHp, relayMaxHp: mission.relayMaxHp,
    endsAt: mission.endsAt, wavesLeft: mission.wavesLeft,
    relay: relay ? { id: relay.id, x: relay.x, z: relay.z } : null
  };
}
function snapshot() {
  return { players: [...players.values()].map(pub), resources: [...resources.values()], structures: [...structures.values()], enemies: [...enemies.values()].map(e => ({ id: e.id, x: e.x, z: e.z, hp: e.hp, maxHp: e.maxHp, kind: e.kind, elite: !!e.elite })), mission: publicMission() };
}
function broadcastMission() { io.emit("mission:update", publicMission()); }
function stats(p) { const s = io.sockets.sockets.get(p.id); if (s) s.emit("player:stats", { hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp, ammo: p.ammo, reserve: p.reserve, reloading: !!p.reloading }); }
function weapon(p) { const s = io.sockets.sockets.get(p.id); if (s) s.emit("weapon:update", { ammo: p.ammo, reserve: p.reserve, reloading: !!p.reloading }); }
function awardXp(p, amount) {
  p.xp += amount;
  let levels = 0;
  while (p.xp >= p.level * 60) { p.xp -= p.level * 60; p.level++; p.maxHp += 10; p.hp = p.maxHp; levels++; }
  stats(p);
  if (levels) io.emit("feed", { text: `${p.name} достиг уровня ${p.level}. Максимальное здоровье увеличено.` });
}
function seedWorld() {
  for (let i = 0; i < 1450; i++) {
    const a = Math.random() * Math.PI * 2, r = 16 + Math.sqrt(Math.random()) * 930;
    resource("ore-" + i, +(Math.cos(a) * r).toFixed(2), +(Math.sin(a) * r).toFixed(2), types[i % types.length], 1 + (i % 4 === 0 ? 1 : 0));
  }
  for (let i = 0; i < 115; i++) {
    const a = Math.random() * Math.PI * 2, r = 38 + Math.sqrt(Math.random()) * 820;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const elite = i % 7 === 0;
    enemies.set("mob-" + i, { id: "mob-" + i, x, z, hp: elite ? 115 : 48, maxHp: elite ? 115 : 48, kind: elite ? "Страж руин" : (i % 3 === 0 ? "Пустотный охотник" : "Скальный падальщик"), seed: Math.random() * 10, spawnX: x, spawnZ: z, attackAt: 0, elite });
  }
}
function saveWorld() {
  const data = { version: 4, resources: [...resources.values()], structures: [...structures.values()] };
  try { fs.writeFileSync(SAVE_FILE, JSON.stringify(data)); } catch (e) { console.error("Save failed:", e.message); }
}
function loadWorld() {
  try {
    if (!fs.existsSync(SAVE_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
    if (data.version !== 4) return false;
    if (Array.isArray(data.resources)) { resources.clear(); for (const r of data.resources) if (r && r.id && Number.isFinite(r.x) && Number.isFinite(r.z)) resources.set(r.id, r); }
    if (Array.isArray(data.structures)) { structures.clear(); for (const item of data.structures) if (item && item.id && Number.isFinite(item.x) && Number.isFinite(item.z)) structures.set(item.id, item); }
    return true;
  } catch (e) { console.error("Could not load save:", e.message); return false; }
}
function spawnEnemy(x, z, opts = {}) {
  const id = "mob-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  const elite = !!opts.elite;
  const hp = (elite ? 100 : 42) + Math.max(0, mission.round - 1) * (elite ? 18 : 8);
  x = clamp(x, -LIMIT + 8, LIMIT - 8); z = clamp(z, -LIMIT + 8, LIMIT - 8);
  const e = { id, x, z, hp, maxHp: hp, kind: elite ? "Осквернитель" : "Рейдер сигнала", seed: Math.random() * 10, spawnX: x, spawnZ: z, attackAt: 0, elite, homeRelayId: opts.homeRelayId || null };
  enemies.set(id, e);
  io.emit("enemy:spawn", { id: e.id, x: e.x, z: e.z, hp: e.hp, maxHp: e.maxHp, kind: e.kind, elite: e.elite });
  return e;
}
function beginDefense(s, p) {
  mission.phase = "defend"; mission.relayId = s.id; mission.relayHp = 160; mission.relayMaxHp = 160;
  mission.startedAt = Date.now(); mission.endsAt = mission.startedAt + 48000; mission.nextWaveAt = mission.startedAt + 4000; mission.wavesLeft = 5; mission.resetAt = 0;
  io.emit("feed", { text: `Контракт ${mission.round}: маяк ${p.name} активирован. Враждебные сигнатуры идут на сигнал!` });
  io.emit("notice:global", { text: "ЗАЩИТИ МАЯК · продержись 48 секунд" });
  broadcastMission(); saveWorld();
}
function finishMission(success) {
  const relay = mission.relayId ? structures.get(mission.relayId) : null;
  const at = relay ? { x: relay.x, z: relay.z } : null;
  if (success) {
    mission.phase = "complete"; mission.completed++;
    io.emit("feed", { text: `Контракт выполнен. Секторный сигнал стабилизирован (${mission.completed} всего).` });
    if (at) {
      for (const p of players.values()) {
        if (dist(p, at) <= 42) {
          p.inventory["Реликт"] = (p.inventory["Реликт"] || 0) + 1;
          const s = io.sockets.sockets.get(p.id); if (s) s.emit("inventory:update", p.inventory);
          awardXp(p, 90 + mission.round * 15);
        }
      }
    }
    mission.resetAt = Date.now() + 9000;
  } else {
    mission.phase = "failed"; io.emit("feed", { text: "Маяк уничтожен. Контракт провален — подготовься к новой попытке." });
    if (relay) { structures.delete(relay.id); io.emit("structure:removed", relay.id); saveWorld(); }
    mission.resetAt = Date.now() + 7000;
  }
  mission.relayId = success ? mission.relayId : null;
  broadcastMission();
}
seedWorld();
loadWorld();

io.on("connection", socket => {
  socket.emit("world:init", snapshot());
  socket.on("player:join", data => {
    if (players.has(socket.id)) return;
    const p = { id: socket.id, name: safeName(data?.name), x: (Math.random() - .5) * 12, z: (Math.random() - .5) * 12, yaw: Math.PI, color: colors[Math.floor(Math.random() * colors.length)], hp: 100, maxHp: 100, level: 1, xp: 0, ammo: MAG_SIZE, reserve: 72, reloading: false, reloadAt: 0, inventory: { "Кристалл": 0, "Сплав": 0, "Биомасса": 0, "Реликт": 0, "Эссенция": 0 }, lastMove: 0, lastMoveAt: Date.now(), kills: 0, deaths: 0, dead: false, respawnAt: 0 };
    players.set(socket.id, p);
    socket.emit("player:you", { ...pub(p), inventory: p.inventory });
    io.emit("world:update", snapshot());
    io.emit("feed", { text: `${p.name} высадился в секторе.` });
  });
  socket.on("player:move", d => {
    const p = players.get(socket.id), now = Date.now();
    if (!p || p.dead || !d || ![d.x, d.z, d.yaw].every(Number.isFinite) || !cd(socket.id, "move", 35)) return;
    const elapsed = clamp((now - (p.lastMoveAt || now)) / 1000, 0, .25);
    const allowed = elapsed * 17 + 1.1;
    if (Math.hypot(d.x - p.x, d.z - p.z) > allowed) return;
    const nextX = clamp(d.x, -LIMIT, LIMIT), nextZ = clamp(d.z, -LIMIT, LIMIT);
    if (collidesStructure(nextX, nextZ)) { notify(socket, "Постройка блокирует проход."); return; }
    p.x = nextX; p.z = nextZ; p.yaw = d.yaw; p.lastMoveAt = now; p.lastMove = now;
    socket.broadcast.volatile.emit("player:moved", pub(p));
  });
  socket.on("resource:collect", d => {
    const p = players.get(socket.id), r = d && resources.get(String(d.id));
    if (!p || !r || !cd(socket.id, "collect", 230)) return;
    if (dist(p, r) > 4.3) { notify(socket, "Подойди ближе к объекту."); return; }
    resources.delete(r.id); p.inventory[r.type] = (p.inventory[r.type] || 0) + r.amount;
    awardXp(p, 8); socket.emit("inventory:update", p.inventory);
    io.emit("resource:removed", r.id); io.emit("feed", { text: `${p.name} собрал: ${r.type} ×${r.amount}.` });
    saveWorld();
  });
  socket.on("player:attack", d => {
    const p = players.get(socket.id); if (!p || p.dead || !cd(socket.id, "attack", 360)) return;
    const now = Date.now();
    if (p.reloading || now < p.reloadAt) { notify(socket, "Идёт перезарядка."); return; }
    if (p.ammo <= 0) { notify(socket, "Энергоблок пуст. Нажми R для перезарядки."); weapon(p); return; }
    p.ammo--; weapon(p);
    const targetType = d && (d.targetType || d.type) === "player" ? "player" : "enemy";
    if (targetType === "player") {
      const target = d && players.get(String(d.id));
      if (!target || target.id === p.id || target.dead || dist(p, target) > 80) return;
      const angle = Math.atan2(target.x - p.x, target.z - p.z);
      const delta = Math.atan2(Math.sin(angle - p.yaw), Math.cos(angle - p.yaw));
      if (Math.abs(delta) > .16) return;
      const damage = 36 + (p.level - 1) * 2;
      target.hp = Math.max(0, target.hp - damage);
      const victimSocket = io.sockets.sockets.get(target.id);
      if (victimSocket) { victimSocket.emit("player:damage", { amount: damage, by: p.name }); stats(target); }
      io.emit("player:health", { id: target.id, hp: target.hp, maxHp: target.maxHp });
      socket.emit("combat:hit", { killed: target.hp <= 0, player: true });
      io.emit("feed", { text: `${p.name} попал в ${target.name} (${target.hp}/${target.maxHp} HP).` });
      if (target.hp <= 0) {
        target.dead = true; target.deaths = (target.deaths || 0) + 1; target.respawnAt = now + 2600;
        p.kills = (p.kills || 0) + 1; awardXp(p, 35); stats(target); stats(p);
        io.emit("pvp:kill", { killer: p.id, victim: target.id, killerName: p.name, victimName: target.name });
        io.emit("feed", { text: `${p.name} победил ${target.name} в PvP. Возрождение через 3 секунды.` });
        io.emit("world:update", snapshot());
      }
      return;
    }
    const e = d && d.id ? enemies.get(String(d.id)) : null;
    if (!e) return;
    if (dist(p, e) > 80) { notify(socket, "Цель вне дальности импульсника."); return; }
    const angle = Math.atan2(e.x - p.x, e.z - p.z);
    const delta = Math.atan2(Math.sin(angle - p.yaw), Math.cos(angle - p.yaw));
    if (Math.abs(delta) > .16) { notify(socket, "Доворачивай прицел к цели."); return; }
    const damage = 28 + (p.level - 1) * 3;
    e.hp -= damage;
    io.emit("enemy:hit", { id: e.id, hp: Math.max(0, e.hp), maxHp: e.maxHp, by: p.id });
    socket.emit("combat:hit", { killed: e.hp <= 0, player: false });
    if (e.hp <= 0) {
      enemies.delete(e.id);
      const drop = { id: "drop-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), x: e.x, z: e.z, type: "Эссенция", amount: e.elite ? 3 : 1 };
      resources.set(drop.id, drop); p.reserve = Math.min(120, p.reserve + (e.elite ? 10 : 5)); weapon(p);
      awardXp(p, e.elite ? 45 : 28);
      io.emit("enemy:dead", e.id); io.emit("resource:added", drop);
      io.emit("feed", { text: `${p.name} нейтрализовал угрозу. Энергоячейки пополнены.` });
    }
  });
  socket.on("player:reload", () => {
    const p = players.get(socket.id), now = Date.now(); if (!p || !cd(socket.id, "reload", 700)) return;
    if (p.reloading || p.ammo >= MAG_SIZE) { notify(socket, "Энергоблок уже заряжен."); return; }
    if (p.reserve <= 0) { notify(socket, "Нет запасных ячеек. Уничтожай врагов — они пополняют запас."); return; }
    p.reloading = true; p.reloadAt = now + 1150; weapon(p); notify(socket, "Перезарядка…");
  });
  socket.on("player:heal", () => {
    const p = players.get(socket.id); if (!p || p.dead || !cd(socket.id, "heal", 900)) return;
    if ((p.inventory["Биомасса"] || 0) < 2) { notify(socket, "Нужно 2 биомассы для стимулятора."); return; }
    if (p.hp >= p.maxHp) { notify(socket, "Здоровье уже полное."); return; }
    p.inventory["Биомасса"] -= 2; p.hp = Math.min(p.maxHp, p.hp + 42);
    socket.emit("inventory:update", p.inventory); stats(p); notify(socket, "Стимулятор введён: +42 здоровья.");
  });
  socket.on("player:repair", () => {
    const p = players.get(socket.id); if (!p || p.dead || !cd(socket.id, "repair", 800)) return;
    const relay = mission.relayId && structures.get(mission.relayId);
    if (mission.phase !== "defend" || !relay) { notify(socket, "Сейчас нет активного маяка для ремонта."); return; }
    if (dist(p, relay) > 7) { notify(socket, "Подойди к маяку ближе, чтобы ремонтировать."); return; }
    if ((p.inventory["Сплав"] || 0) < 2) { notify(socket, "Для ремонта нужны 2 единицы сплава."); return; }
    if (mission.relayHp >= mission.relayMaxHp) { notify(socket, "Маяк не повреждён."); return; }
    p.inventory["Сплав"] -= 2; mission.relayHp = Math.min(mission.relayMaxHp, mission.relayHp + 38);
    socket.emit("inventory:update", p.inventory); io.emit("relay:health", { hp: mission.relayHp, maxHp: mission.relayMaxHp });
    io.emit("feed", { text: `${p.name} отремонтировал маяк (+38).` }); broadcastMission();
  });
  socket.on("structure:build", d => {
    const p = players.get(socket.id); if (!p || p.dead || !d || ![d.x, d.z].every(Number.isFinite) || !cd(socket.id, "build", 260)) return;
    const type = ["wall", "turret", "relay", "house"].includes(d.type) ? d.type : "relay";
    const place = { x: clamp(d.x, -LIMIT + 5, LIMIT - 5), z: clamp(d.z, -LIMIT + 5, LIMIT - 5) };
    if (dist(p, place) > 8) { notify(socket, "Строй рядом с собой."); return; }
    const buildYaw = Number.isFinite(d.yaw) ? d.yaw : p.yaw;
    if (structurePlacementBlocked(place.x, place.z, type, buildYaw)) { notify(socket, "Постройка пересекается с другой конструкцией."); return; }
    if (structures.size >= 650) { notify(socket, "Лимит построек сектора достигнут."); return; }
    const costs = type === "wall" ? { "Сплав": 2, "Биомасса": 1 } : type === "turret" ? { "Сплав": 5, "Кристалл": 2 } : type === "house" ? { "Сплав": 6, "Биомасса": 3 } : { "Кристалл": 3, "Сплав": 2 };
    if (type === "relay" && mission.phase !== "salvage") { notify(socket, "Контракт уже активен — сначала заверши оборону."); return; }
    for (const [mat, amount] of Object.entries(costs)) if ((p.inventory[mat] || 0) < amount) { notify(socket, `Не хватает ресурса: ${mat} ×${amount}.`); return; }
    for (const [mat, amount] of Object.entries(costs)) p.inventory[mat] -= amount;
    const hp = type === "wall" ? 240 : type === "turret" ? 180 : type === "house" ? 520 : 160;
    const structure = { id: type + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7), type, x: Math.round(place.x * 2) / 2, z: Math.round(place.z * 2) / 2, yaw: buildYaw, owner: p.name, hp, maxHp: hp, lastShotAt: 0 };
    structures.set(structure.id, structure); socket.emit("inventory:update", p.inventory); io.emit("structure:added", structure);
    if (type === "relay") {
      io.emit("feed", { text: `${p.name} установил ретранслятор. Начинается передача сигнала.` }); beginDefense(structure, p);
    } else {
      io.emit("feed", { text: type === "wall" ? `${p.name} построил укрепление.` : type === "turret" ? `${p.name} установил автоматическую турель.` : `${p.name} построил убежище.` }); saveWorld();
    }
  });
  socket.on("disconnect", () => {
    const p = players.get(socket.id); if (p) io.emit("feed", { text: `${p.name} покинул сектор.` });
    players.delete(socket.id); for (const k of cooldowns.keys()) if (k.startsWith(socket.id + ":")) cooldowns.delete(k);
    io.emit("player:left", socket.id); io.emit("world:update", snapshot());
  });
});

// Server-side enemy AI, relay defense waves, reloads, and mission transitions.
let lastEnemyBroadcast = 0;
setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) {
    if (p.dead && now >= p.respawnAt) {
      p.dead = false; p.hp = p.maxHp; p.x = (Math.random() - .5) * 20; p.z = (Math.random() - .5) * 20; p.yaw = Math.PI; p.lastMoveAt = now; p.lastMove = now;
      const ps = io.sockets.sockets.get(p.id); if (ps) { ps.emit("player:respawn", { x: p.x, z: p.z, hp: p.hp }); stats(p); ps.emit("notice", "Возрождение завершено."); }
      io.emit("world:update", snapshot());
    }
    if (!p.dead && p.reloading && now >= p.reloadAt) {
      const need = MAG_SIZE - p.ammo, amount = Math.min(need, p.reserve);
      p.ammo += amount; p.reserve -= amount; p.reloading = false; p.reloadAt = 0; weapon(p);
    }
  }
  if (mission.phase === "defend") {
    if (mission.wavesLeft > 0 && now >= mission.nextWaveAt) {
      const relay = structures.get(mission.relayId);
      if (relay) {
        const waveNo = 6 - mission.wavesLeft, count = 2 + Math.min(3, mission.round) + (waveNo >= 4 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 8;
          spawnEnemy(relay.x + Math.cos(a) * r, relay.z + Math.sin(a) * r, { homeRelayId: relay.id, elite: (i === count - 1 && (waveNo % 2 === 0 || mission.round > 1)) });
        }
        io.emit("feed", { text: `Волна ${waveNo}/5: враги идут к маяку!` });
      }
      mission.wavesLeft--; mission.nextWaveAt = mission.wavesLeft > 0 ? now + 8500 : 0;
      io.emit("world:update", snapshot()); broadcastMission();
    }
    if (mission.relayHp <= 0) finishMission(false);
    else if (now >= mission.endsAt) finishMission(true);
  } else if ((mission.phase === "complete" || mission.phase === "failed") && now >= mission.resetAt) {
    if (mission.phase === "complete") mission.round++;
    mission.phase = "salvage"; mission.relayId = null; mission.relayHp = mission.relayMaxHp = 100;
    mission.startedAt = mission.endsAt = mission.nextWaveAt = mission.resetAt = 0; mission.wavesLeft = 0;
    io.emit("feed", { text: `Новый контракт ${mission.round}: соберите материалы и активируйте следующий маяк.` });
    broadcastMission(); io.emit("world:update", snapshot());
  }

  for (const s of structures.values()) {
    if (s.type !== "turret" || now - (s.lastShotAt || 0) < 720) continue;
    let target = null, best = 34;
    for (const e of enemies.values()) { const d = dist(s, e); if (d < best) { best = d; target = e; } }
    if (target) {
      s.lastShotAt = now; target.hp -= 12;
      io.emit("enemy:hit", { id: target.id, hp: Math.max(0, target.hp), maxHp: target.maxHp, by: "turret" });
      if (target.hp <= 0) {
        enemies.delete(target.id);
        const drop = { id: "drop-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), x: target.x, z: target.z, type: "Эссенция", amount: target.elite ? 3 : 1 };
        resources.set(drop.id, drop); io.emit("enemy:dead", target.id); io.emit("resource:added", drop);
      }
    }
  }

  for (const e of enemies.values()) {
    let target = null, best = e.homeRelayId && e.homeRelayId === mission.relayId && mission.phase === "defend" ? 11 : 18;
    for (const p of players.values()) { if (p.dead) continue; const d = dist(e, p); if (d < best) { best = d; target = p; } }
    const relay = e.homeRelayId && e.homeRelayId === mission.relayId && mission.phase === "defend" ? structures.get(e.homeRelayId) : null;
    if (relay && !target) {
      const d = dist(e, relay);
      if (d > 2.7) { const dx = relay.x - e.x, dz = relay.z - e.z, len = Math.hypot(dx, dz) || 1; e.x += dx / len * .13; e.z += dz / len * .13; }
      else if (now - e.attackAt > 1150) {
        mission.relayHp = Math.max(0, mission.relayHp - (e.elite ? 13 : 7)); e.attackAt = now;
        io.emit("relay:health", { hp: mission.relayHp, maxHp: mission.relayMaxHp });
      }
    } else if (target && best > 2.15) {
      const dx = target.x - e.x, dz = target.z - e.z, len = Math.hypot(dx, dz) || 1;
      e.x += dx / len * (e.elite ? .14 : .115); e.z += dz / len * (e.elite ? .14 : .115);
    } else if (target && best <= 2.15 && now - e.attackAt > (e.elite ? 1050 : 1350)) {
      target.hp = Math.max(0, target.hp - (e.elite ? 15 : 8)); e.attackAt = now;
      const s = io.sockets.sockets.get(target.id);
      if (s) { s.emit("player:damage", { amount: e.elite ? 15 : 8 }); stats(target); }
      io.emit("feed", { text: `${e.kind} ранил ${target.name}.` });
      if (target.hp === 0 && !target.dead) {
        // PvE remains forgiving: mobs knock you out and send you back to the drop zone immediately.
        target.deaths = (target.deaths || 0) + 1; target.hp = target.maxHp; target.x = (Math.random() - .5) * 20; target.z = (Math.random() - .5) * 20; target.lastMoveAt = Date.now();
        if (s) { s.emit("player:respawn", { x: target.x, z: target.z, hp: target.hp }); stats(target); s.emit("notice", "Ты потерял сознание и вернулся к точке высадки."); }
        io.emit("world:update", snapshot());
      }
    }
  }
  if (now - lastEnemyBroadcast >= 180) { io.volatile.emit("enemies:state", [...enemies.values()].map(e => ({ id: e.id, x: e.x, z: e.z, hp: e.hp, maxHp: e.maxHp }))); lastEnemyBroadcast = now; }
}, 100);
setInterval(() => { broadcastMission(); }, 1000);
setInterval(saveWorld, 15000);
server.listen(PORT, () => console.log(`AFTERZERO v0.4 running at http://localhost:${PORT}`));
if (process.env.AFTERZERO_TEST === "1") {
  // Private test hook; enabled only by the dependency-free smoke-test harness.
  module.exports.__test = { io, players, resources, structures, enemies, mission, snapshot };
}
