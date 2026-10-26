const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const serverPath = path.join(__dirname, '..', 'server.js');
const originalLoad = Module._load;
let fakeIO;

class FakeSocket {
  constructor(id) {
    this.id = id; this.handlers = {}; this.received = []; this.connected = true;
    this.broadcast = { volatile: { emit: (event, data) => {
      for (const socket of fakeIO.sockets.sockets.values()) if (socket.id !== this.id) socket._receive(event, data);
    } } };
  }
  on(event, callback) { this.handlers[event] = callback; }
  emit(event, data) { this.received.push({ event, data }); }
  _receive(event, data) { this.received.push({ event, data }); }
  trigger(event, data) { const callback = this.handlers[event]; assert.ok(callback, `server handler registered for ${event}`); callback(data); }
  latest(event) { return this.received.filter(item => item.event === event).at(-1)?.data; }
}

class FakeSocketServer {
  constructor() {
    this.handlers = {}; this.events = []; this.sockets = { sockets: new Map() };
    this.volatile = { emit: (event, data) => this.emit(event, data) }; fakeIO = this;
  }
  on(event, callback) { this.handlers[event] = callback; }
  emit(event, data) { this.events.push({ event, data }); for (const s of this.sockets.sockets.values()) s._receive(event, data); }
  connect(socket) { this.sockets.sockets.set(socket.id, socket); this.handlers.connection(socket); }
}

const fakeExpress = () => ({ use() {} });
fakeExpress.static = () => () => {};
const fakeHttp = { createServer: () => ({ listen: (_port, callback) => callback?.() }) };
const fakeFs = new Proxy(fs, { get(target, property) {
  if (property === 'existsSync') return file => String(file).endsWith('world-save.json') ? false : target.existsSync(file);
  if (property === 'writeFileSync') return (file, ...args) => String(file).endsWith('world-save.json') ? undefined : target.writeFileSync(file, ...args);
  return target[property];
} });
Module._load = function(request, parent, isMain) {
  if (request === 'express') return fakeExpress;
  if (request === 'http') return fakeHttp;
  if (request === 'socket.io') return { Server: FakeSocketServer };
  if (request === 'fs') return fakeFs;
  return originalLoad.call(this, request, parent, isMain);
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  process.env.AFTERZERO_TEST = '1';
  require(serverPath);
  const api = require.cache[serverPath].exports.__test;
  assert.ok(api, 'test-only state hook');

  const a = new FakeSocket('qa-a'), b = new FakeSocket('qa-b');
  fakeIO.connect(a); fakeIO.connect(b);
  a.trigger('player:join', { name: 'QA Alpha' });
  b.trigger('player:join', { name: 'QA Beta' });
  assert.equal(a.latest('player:you').name, 'QA Alpha');
  assert.equal(b.latest('player:you').name, 'QA Beta');
  assert.equal(api.players.size, 2);

  // Teleport-sized changes are rejected, while a normal forward step is relayed to peers.
  const player = api.players.get('qa-a');
  player.x = 0; player.z = 0; player.yaw = Math.PI; player.lastMoveAt = Date.now();
  const beforeReject = player.x;
  a.trigger('player:move', { x: 100, z: 0, yaw: Math.PI });
  assert.equal(player.x, beforeReject, 'oversized movement rejected');
  await wait(70);
  a.trigger('player:move', { x: 1, z: 0, yaw: Math.PI });
  assert.equal(player.x, 1, 'normal move accepted');
  assert.ok(b.received.some(x => x.event === 'player:moved' && x.data.id === 'qa-a'), 'movement broadcast to other player');

  // Death returns the affected player to a new spawn coordinate so client prediction can resync.
  player.hp = 1; player.x = 1; player.z = 0;
  const killer = { id: 'qa-killer', x: 1, z: 0, hp: 50, maxHp: 50, kind: 'QA attacker', elite: false, seed: 0, spawnX: 1, spawnZ: 0, attackAt: 0 };
  api.enemies.set(killer.id, killer);
  await wait(140);
  assert.ok(a.received.some(x => x.event === 'player:respawn' && Number.isFinite(x.data.x) && Number.isFinite(x.data.z)), 'respawn event contains new coordinates');
  api.enemies.delete(killer.id);

  // Server-confirmed combat consumes a cell and updates enemy health.
  player.x = 1; player.z = 0; player.yaw = Math.PI; player.ammo = 18;
  const enemy = { id: 'qa-target', x: 1, z: -3, hp: 100, maxHp: 100, kind: 'QA target', elite: false, seed: 0, attackAt: 0 };
  api.enemies.set(enemy.id, enemy);
  a.trigger('player:attack', { id: enemy.id });
  assert.equal(enemy.hp, 72, 'server applied weapon damage to target in front');
  assert.equal(player.ammo, 17, 'shot consumed one cell');

  // PvP is server-authoritative: a player in front takes damage, and lethal hits count a kill.
  await wait(400);
  const victim = api.players.get('qa-b');
  player.dead = false; player.hp = player.maxHp; player.x = 1; player.z = 0; player.yaw = Math.PI; player.ammo = 18;
  victim.x = 1; victim.z = -3; victim.hp = 30; victim.dead = false; victim.respawnAt = 0;
  a.trigger('player:attack', { id: victim.id, targetType: 'player' });
  assert.equal(victim.dead, true, 'lethal PvP hit puts the victim into delayed respawn');
  assert.equal(player.kills, 1, 'PvP kill is tracked for the attacker');
  assert.ok(fakeIO.events.some(x => x.event === 'pvp:kill' && x.data.killer === player.id), 'PvP kill is broadcast to all clients');
  victim.dead = false; victim.hp = victim.maxHp; victim.respawnAt = 0;

  // Reload is asynchronous and bounded by reserve ammo.
  player.ammo = 0; player.reserve = 20; player.reloading = false; player.reloadAt = 0;
  a.trigger('player:reload');
  assert.equal(player.reloading, true, 'reload entered pending state');
  await wait(1250);
  assert.equal(player.ammo, 18, 'magazine refilled');
  assert.equal(player.reserve, 2, 'reserve reduced by transferred ammo');

  // Resource collection validates proximity and updates inventory.
  player.x = 5; player.z = 5;
  const ore = { id: 'qa-ore', x: 5, z: 5, type: 'Кристалл', amount: 3 };
  api.resources.set(ore.id, ore);
  a.trigger('resource:collect', { id: ore.id });
  assert.equal(player.inventory['Кристалл'], 3, 'collected resource added to inventory');
  assert.equal(api.resources.has(ore.id), false, 'collected resource removed globally');

  // Building starts the shared relay-defence contract.
  player.x = 0; player.z = 0; player.inventory['Кристалл'] = 3; player.inventory['Сплав'] = 4;
  a.trigger('structure:build', { x: 3, z: 0 });
  assert.equal(api.mission.phase, 'defend', 'relay starts defence phase');
  assert.equal(player.inventory['Кристалл'], 0, 'build consumes crystals');
  assert.equal(player.inventory['Сплав'], 2, 'build consumes alloy');
  const relayId = api.mission.relayId;
  assert.ok(api.structures.has(relayId), 'active relay exists');

  // Walls and turrets are independent buildables in the sandbox mode.
  await wait(300);
  player.inventory['Сплав'] = 4; player.inventory['Биомасса'] = 1;
  a.trigger('structure:build', { x: 3, z: 4, type: 'wall', yaw: 0 });
  assert.ok([...api.structures.values()].some(s => s.type === 'wall'), 'building a wall creates a persistent structure');

  // The server must reject movement through a wall, even if a client bypasses its local collision checks.
  player.x = 3; player.z = 2; player.lastMoveAt = Date.now() - 220;
  await wait(45);
  a.trigger('player:move', { x: 3, z: 3.5, yaw: Math.PI });
  assert.equal(player.z, 2, 'server collision rejects walking through the wall');

  // A turret is a separate buildable and consumes the correct materials.
  player.x = 0; player.z = 0; player.lastMoveAt = Date.now() - 220;
  player.inventory['Сплав'] = 5; player.inventory['Кристалл'] = 2;
  await wait(300);
  a.trigger('structure:build', { x: 0, z: 5, type: 'turret', yaw: 0 });
  assert.ok([...api.structures.values()].some(s => s.type === 'turret'), 'building a turret creates a persistent structure');
  assert.equal(player.inventory['Сплав'], 0, 'turret consumes alloy');
  assert.equal(player.inventory['Кристалл'], 0, 'turret consumes crystals');

  // Overlapping structures are rejected server-side and do not consume materials.
  player.inventory['Сплав'] = 5; player.inventory['Биомасса'] = 3;
  const structureCount = api.structures.size;
  await wait(300);
  a.trigger('structure:build', { x: 3.5, z: 4, type: 'wall', yaw: 0 });
  assert.equal(api.structures.size, structureCount, 'server rejects overlapping wall placement');
  assert.equal(player.inventory['Сплав'], 5, 'rejected placement does not consume alloy');

  // A walk-in shelter is a distinct, durable buildable; the doorway is left open but solid walls block movement.
  player.inventory['Сплав'] = 6; player.inventory['Биомасса'] = 3;
  await wait(300);
  a.trigger('structure:build', { x: -4, z: 0, type: 'house', yaw: 0 });
  const house = [...api.structures.values()].find(s => s.type === 'house');
  assert.ok(house, 'building a shelter creates a persistent structure');
  assert.equal(house.maxHp, 520, 'shelter has reinforced durability');
  assert.equal(player.inventory['Сплав'], 0, 'shelter consumes alloy');
  player.x = -4; player.z = 0; player.lastMoveAt = Date.now() - 220;
  await wait(45);
  a.trigger('player:move', { x: -7, z: 0, yaw: Math.PI });
  assert.equal(player.x, -4, 'server collision blocks walking through shelter side walls');

  // Make a wave due immediately and verify the server adds attackers to the shared world.
  const enemyCount = api.enemies.size;
  api.mission.nextWaveAt = Date.now() - 1;
  await wait(180);
  assert.ok(api.enemies.size > enemyCount, 'defence wave spawned enemies');
  assert.equal(api.mission.wavesLeft, 4, 'wave counter decremented');

  // Repair consumes metal and raises relay health; successful contracts can cycle.
  player.x = api.structures.get(relayId).x; player.z = api.structures.get(relayId).z;
  player.inventory['Сплав'] = 2; api.mission.relayHp = 70;
  a.trigger('player:repair');
  assert.equal(api.mission.relayHp, 108, 'repair restored relay health');
  assert.equal(player.inventory['Сплав'], 0, 'repair consumed alloy');
  api.mission.relayHp = 108; api.mission.endsAt = Date.now() - 1;
  await wait(180);
  assert.equal(api.mission.phase, 'complete', 'surviving relay completes contract');
  const oldRound = api.mission.round; api.mission.resetAt = Date.now() - 1;
  await wait(180);
  assert.equal(api.mission.phase, 'salvage', 'contract resets for another run');
  assert.equal(api.mission.round, oldRound + 1, 'next contract grows in round number');

  console.log('PASS: join, movement validation, multiplayer broadcast, PvE/PvP combat, respawn, ammo/reload, resource pickup, relay/wall/turret/house build, wall and house collision, overlap rejection, defence wave, repair, win and repeatable contract.');
  process.exit(0);
}
main().catch(error => { console.error(error); process.exit(1); });
