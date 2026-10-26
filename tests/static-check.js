const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'public', 'game.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));

const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
const referenced = new Set([...client.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map(m => m[1]));
assert.deepEqual([...referenced].filter(id => !ids.has(id), 'Every getElementById target exists in HTML'), []);
assert.match(client, /\(-Math\.sin\(yaw\)\*f\+Math\.cos\(yaw\)\*side\)/, 'forward/side movement uses camera-space axes');
assert.match(client, /yaw\+Math\.PI/, 'client converts camera yaw to server bearing');
assert.match(server, /Math\.atan2\(e\.x - p\.x, e\.z - p\.z\)/, 'server validates bearing using same coordinate convention');
assert.match(html, /id="radar"/, 'tactical radar canvas exists');
assert.match(html, /id="ammoText"/, 'ammo HUD exists');
assert.match(server, /mission\.phase = "defend"/, 'relay enters defense phase');
assert.match(server, /mission\.phase = "complete"/, 'relay can complete a contract');
assert.doesNotMatch(client, /new THREE\.GridHelper/, 'debug grid removed from world');
assert.match(html, /telegram-web-app\.js/, 'Telegram WebApp SDK loaded');
assert.match(html, /id="joystick"/, 'touch movement joystick exists');
assert.match(html, /id="lookZone"/, 'touch camera zone exists');
assert.match(html, /id="touchFire"/, 'touch fire button exists');
assert.match(html, /id="touchHouse"/, 'touch shelter build button exists');
assert.match(client, /type==="house"/, 'client has shelter model and collision');
assert.match(server, /type === "house"/, 'server has shelter collision/build costs');
assert.match(client, /requestFullscreen/, 'fullscreen is requested where supported');
assert.match(client, /new THREE\.InstancedMesh/, 'scenery uses instancing to reduce draw calls');
assert.match(client, /buildBuckets/, 'build collision queries use spatial buckets');
assert.match(server, /targetType === "player"/, 'PvP targeting is server handled');
assert.match(server, /type === "turret"/, 'automated turrets are supported');
assert.equal(manifest.display, 'fullscreen', 'PWA manifest requests fullscreen display');
assert.equal(manifest.orientation, 'landscape', 'PWA manifest prefers landscape orientation');

// Verify the input-vector convention numerically: W follows the camera, D strafes right.
function movement(yaw, f, side) {
  const len = Math.hypot(f, side) || 1;
  return { x: (-Math.sin(yaw) * f + Math.cos(yaw) * side) / len, z: (-Math.cos(yaw) * f - Math.sin(yaw) * side) / len };
}
const forward = movement(0, 1, 0), strafeRight = movement(0, 0, 1), rotatedForward = movement(Math.PI / 2, 1, 0);
assert.ok(forward.z < -.99 && Math.abs(forward.x) < .01, 'W at yaw 0 moves toward camera forward (-Z)');
assert.ok(strafeRight.x > .99 && Math.abs(strafeRight.z) < .01, 'D at yaw 0 moves right (+X)');
assert.ok(rotatedForward.x < -.99 && Math.abs(rotatedForward.z) < .01, 'W follows camera after turning 90 degrees');

console.log(`PASS: ${referenced.size} DOM hooks, camera/server bearing contract, phone controls, Telegram/fullscreen metadata, instanced scenery, PvP/build wiring and mission HUD.`);
