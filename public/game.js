import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

const socket=window.io();
const root=document.getElementById("scene");
const coarsePointer=matchMedia("(pointer: coarse)").matches||("ontouchstart" in window);
const isMobile=coarsePointer||innerWidth<760;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x111923);scene.fog=new THREE.FogExp2(0x121b23,.00062);
const camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.08,1750);scene.add(camera);
let renderScale=isMobile?Math.min(devicePixelRatio,.9):Math.min(devicePixelRatio,1.28);
const renderer=new THREE.WebGLRenderer({antialias:!isMobile,powerPreference:"high-performance",stencil:false,depth:true,preserveDrawingBuffer:false});
renderer.setPixelRatio(renderScale);renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=!isMobile;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.outputColorSpace=THREE.SRGBColorSpace;root.appendChild(renderer.domElement);
document.documentElement.classList.toggle("mobile",isMobile);
scene.add(new THREE.HemisphereLight(0xc6d2d8,0x3e3428,1.75));
const sun=new THREE.DirectionalLight(0xc7d1cf,2.65);sun.position.set(-170,230,112);sun.castShadow=!isMobile;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-100;sun.shadow.camera.right=100;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;sun.shadow.bias=-.00015;scene.add(sun);
const moon=new THREE.PointLight(0x7a7bb0,24,135);moon.position.set(35,16,-45);scene.add(moon);
function terrainHeight(x,z){return Math.sin(x*.0058)*2.25+Math.cos(z*.0064)*1.95+Math.sin((x+z)*.0039)*1.35+Math.cos((x-z)*.0095)*.52+Math.sin(x*.020+z*.017)*.18;}
function makeGroundTexture(){
 const c=document.createElement("canvas");c.width=c.height=512;const ctx=c.getContext("2d"),im=ctx.createImageData(512,512);
 for(let i=0;i<im.data.length;i+=4){const n=(Math.random()-.5)*25,base=69+n;im.data[i]=base*.93;im.data[i+1]=base*.98;im.data[i+2]=base;im.data[i+3]=255;}ctx.putImageData(im,0,0);
 for(let i=0;i<3800;i++){const x=Math.random()*512,y=Math.random()*512,r=.25+Math.random()*1.6;ctx.fillStyle=Math.random()>.5?'rgba(18,22,24,.30)':'rgba(190,184,164,.14)';ctx.beginPath();ctx.ellipse(x,y,r,r*.55,Math.random()*3,0,Math.PI*2);ctx.fill();}
 for(let i=0;i<120;i++){const x=Math.random()*512,y=Math.random()*512;ctx.strokeStyle='rgba(22,27,29,.20)';ctx.lineWidth=.5+Math.random();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(Math.random()-.5)*36,y+Math.random()*18);ctx.lineTo(x+(Math.random()-.5)*50,y+Math.random()*38);ctx.stroke();}
 const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(34,34);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),isMobile?2:8);return tex;
}
const groundTexture=makeGroundTexture();
const groundGeometry=new THREE.BufferGeometry();
const segments=isMobile?210:280,extent=1000,verts=[],uvs=[],indices=[];
for(let iz=0;iz<=segments;iz++){const z=-extent+2*extent*iz/segments;for(let ix=0;ix<=segments;ix++){const x=-extent+2*extent*ix/segments;verts.push(x,terrainHeight(x,z),z);uvs.push(ix/segments*34,iz/segments*34);}}
for(let iz=0;iz<segments;iz++)for(let ix=0;ix<segments;ix++){const a=iz*(segments+1)+ix,b=a+1,c=a+segments+1,d=c+1;indices.push(a,c,b,b,c,d);}
groundGeometry.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));groundGeometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));groundGeometry.setIndex(indices);groundGeometry.computeVertexNormals();
const groundMat=new THREE.MeshStandardMaterial({map:groundTexture,bumpMap:groundTexture,bumpScale:.16,color:0xffffff,roughness:.99,metalness:0});
const ground=new THREE.Mesh(groundGeometry,groundMat);ground.receiveShadow=!isMobile;ground.frustumCulled=true;scene.add(ground);
function rnd(n){const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);}
function makeMat(color,emissive=0,metalness=.1,roughness=.8){return new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:emissive?1.1:0,metalness,roughness});}
const rockMats=[makeMat(0x26343c,0, .25),makeMat(0x303047,0,.3),makeMat(0x1d3b3b,0x071b1b,.15)];
const crystalMat=makeMat(0x64f3d2,0x168c7c,.25,.22), alloyMat=makeMat(0xa9bfd1,0x142431,.8,.25), bioMat=makeMat(0xb6f17a,0x315f19,.1,.38), relicMat=makeMat(0xc29aff,0x5835a3,.55,.2), essenceMat=makeMat(0xffc36e,0x98531b,.3,.2);
const resourceMaterial=t=>t==="Кристалл"?crystalMat:t==="Сплав"?alloyMat:t==="Биомасса"?bioMat:t==="Реликт"?relicMat:essenceMat;

// Huge 2 km world. Procedural rocks and scrub are instanced to avoid thousands of draw calls.
const obstacles=[];
const obstacleCell=42,obstacleBuckets=new Map();
function indexObstacle(o){const key=`${Math.floor(o.x/obstacleCell)},${Math.floor(o.z/obstacleCell)}`;if(!obstacleBuckets.has(key))obstacleBuckets.set(key,[]);obstacleBuckets.get(key).push(o);}
const decorRecords={rock:rockMats.map(()=>[]),spire:rockMats.map(()=>[])};
const decorDummy=new THREE.Object3D();
for(let i=0;i<1260;i++){
 const x=(rnd(i+2)-.5)*1910,z=(rnd(i+303)-.5)*1910,rad=.8+rnd(i+810)*4.6,h=1.4+rnd(i+90)*13.5;
 if(Math.hypot(x,z)<22)continue;
 const matIndex=Math.floor(rnd(i+7)*rockMats.length),spire=i%10===0;
 const o={x,z,r:Math.max(.9,rad*(spire?.76:.84))};obstacles.push(o);indexObstacle(o);
 decorRecords[spire?'spire':'rock'][matIndex].push({x,y:terrainHeight(x,z)+(spire?h*.43:rad*.28),z,rx:rnd(i+8)*1.2,ry:rnd(i+9)*Math.PI*2,rz:(rnd(i+10)-.5)*.7,sx:rad,sy:spire?h:rad*(.45+rnd(i+11)*.4),sz:rad});
}
function addInstances(geometry,records,material){if(!records.length)return;const mesh=new THREE.InstancedMesh(geometry,material,records.length);mesh.frustumCulled=true;mesh.castShadow=false;mesh.receiveShadow=!isMobile;for(let i=0;i<records.length;i++){const r=records[i];decorDummy.position.set(r.x,r.y,r.z);decorDummy.rotation.set(r.rx,r.ry,r.rz);decorDummy.scale.set(r.sx,r.sy,r.sz);decorDummy.updateMatrix();mesh.setMatrixAt(i,decorDummy.matrix);}mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);}
for(let i=0;i<rockMats.length;i++){addInstances(new THREE.DodecahedronGeometry(1,0),decorRecords.rock[i],rockMats[i]);addInstances(new THREE.ConeGeometry(1,1,5),decorRecords.spire[i],rockMats[i]);}
// A distant ring of basalt pylons gives navigation landmarks without per-object draw-call spam.
const pylonRecords=rockMats.map(()=>[]);
for(let i=0;i<185;i++){const x=(rnd(i+1100)-.5)*1850,z=(rnd(i+1300)-.5)*1850,h=3+rnd(i+1400)*16,mi=i%rockMats.length;if(Math.hypot(x,z)<25)continue;pylonRecords[mi].push({x,y:terrainHeight(x,z)+h/2,z,rx:0,ry:rnd(i+1500)*Math.PI,rz:(rnd(i+1600)-.5)*.22,sx:.5+rnd(i+1700)*.65,sy:h,sz:.5+rnd(i+1800)*.65});}
for(let i=0;i<rockMats.length;i++)addInstances(new THREE.CylinderGeometry(.7,.95,1,5),pylonRecords[i],rockMats[i]);
// Ruined structures are batched into instanced meshes; the world has landmarks without hundreds of draw calls.
const ruinBases=[],ruinRings=[],ruinPillars=rockMats.map(()=>[]),ruinSiteLights=[];
for(let site=0;site<22;site++){
 const a=site*Math.PI*2/22+.2,r=95+(site%5)*132,cx=Math.cos(a)*r,cz=Math.sin(a)*r,siteY=terrainHeight(cx,cz);
 ruinBases.push({x:cx,y:siteY+.15,z:cz,rx:0,ry:rnd(site+39)*.3,rz:0,sx:9,sy:.6,sz:9});
 ruinRings.push({x:cx,y:siteY+3.5,z:cz,rx:Math.PI/2,ry:0,rz:0,sx:1,sy:1,sz:1});
 for(let j=0;j<5;j++){const ang=j*Math.PI*2/5,hh=3+rnd(site*9+j)*8,px=cx+Math.cos(ang)*6,pz=cz+Math.sin(ang)*6,mi=(site+j)%rockMats.length;ruinPillars[mi].push({x:px,y:terrainHeight(px,pz)+hh/2,z:pz,rx:0,ry:ang,rz:0,sx:1.4,sy:hh,sz:1.4});}
 if(!isMobile&&site%4===0)ruinSiteLights.push({x:cx,y:siteY+5,z:cz});
}
addInstances(new THREE.CylinderGeometry(1,1.15,1,8),ruinBases,makeMat(0x263a48,0,.65,.5));
for(let i=0;i<rockMats.length;i++)addInstances(new THREE.BoxGeometry(1,1,1),ruinPillars[i],makeMat(0x3a4559,0,.45,.65));
const ringMesh=new THREE.InstancedMesh(new THREE.TorusGeometry(4,.16,6,24),new THREE.MeshBasicMaterial({color:0x9a76ff,transparent:true,opacity:.75}),ruinRings.length);
for(let i=0;i<ruinRings.length;i++){const r=ruinRings[i];decorDummy.position.set(r.x,r.y,r.z);decorDummy.rotation.set(r.rx,r.ry,r.rz);decorDummy.scale.set(1,1,1);decorDummy.updateMatrix();ringMesh.setMatrixAt(i,decorDummy.matrix);}ringMesh.instanceMatrix.needsUpdate=true;scene.add(ringMesh);
for(const p of ruinSiteLights){const light=new THREE.PointLight(0x8665ff,12,26);light.position.set(p.x,p.y,p.z);scene.add(light);}
// Stars in the upper sky.
// Low scrub, erosion stones and airborne grit break up the otherwise empty terrain.
const scrubGeometry=new THREE.ConeGeometry(.13,.58,4),scrubMaterial=makeMat(0x484a40,0,.02,1);
const scrubCount=isMobile?4200:10500;const scrub=new THREE.InstancedMesh(scrubGeometry,scrubMaterial,scrubCount),dummy=new THREE.Object3D();
for(let i=0;i<scrubCount;i++){const x=(rnd(i+5200)-.5)*1930,z=(rnd(i+7300)-.5)*1930;if(Math.hypot(x,z)<9){dummy.position.set(x,-100,z);dummy.updateMatrix();scrub.setMatrixAt(i,dummy.matrix);continue;}const h=.45+rnd(i+8200)*1.2;dummy.position.set(x,terrainHeight(x,z)+h*.38,z);dummy.scale.set(.5+rnd(i+9200)*.8,h,.5+rnd(i+10200)*.8);dummy.rotation.set((rnd(i+11200)-.5)*.15,rnd(i+12200)*Math.PI,0);dummy.updateMatrix();scrub.setMatrixAt(i,dummy.matrix);}scrub.instanceMatrix.needsUpdate=true;scene.add(scrub);
const stars=[];for(let i=0;i<2200;i++)stars.push((Math.random()-.5)*3000,Math.random()*330+20,(Math.random()-.5)*3000);
const sg=new THREE.BufferGeometry();sg.setAttribute("position",new THREE.Float32BufferAttribute(stars,3));scene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xc4d4de,size:.25,transparent:true,opacity:.66})));
const grit=[];for(let i=0;i<(isMobile?380:1100);i++){const x=(Math.random()-.5)*1900,z=(Math.random()-.5)*1900;grit.push(x,terrainHeight(x,z)+.6+Math.random()*3,z);}const gritGeo=new THREE.BufferGeometry();gritGeo.setAttribute("position",new THREE.Float32BufferAttribute(grit,3));scene.add(new THREE.Points(gritGeo,new THREE.PointsMaterial({color:0xc1bda9,size:.06,transparent:true,opacity:.22})));

const playerMeshes=new Map(),resourceMeshes=new Map(),enemyMeshes=new Map(),structureMeshes=new Map();const buildCell=20,buildBuckets=new Map();
let me=null,inventory={},resources=[],enemies=[],structures=[],players=[],mission={phase:"salvage",round:1,completed:0,wavesLeft:0,endsAt:0,relayHp:100,relayMaxHp:100,relay:null};
let yaw=0,pitch=0,locked=false,velocityY=0,onGround=true,lastSend=0,lastAttack=0,joined=false,stamina=100,staminaExhausted=false,aiming=false,velocityX=0,velocityZ=0,weaponRecoil=0,weaponFlashUntil=0,lastStep=0,lastRadar=0;
const keys=new Set();let touchMoveX=0,touchMoveY=0,fireHeld=false,aimTouch=false,runTouch=false;
const listener=new THREE.AudioListener();camera.add(listener);
let audioCtx=null,masterGain=null,soundOn=true;
function initAudio(){
 if(audioCtx){if(audioCtx.state==="suspended")audioCtx.resume().catch(()=>{});return;}audioCtx=listener.context;if(audioCtx.state==="suspended")audioCtx.resume().catch(()=>{});masterGain=audioCtx.createGain();masterGain.gain.value=.22;masterGain.connect(audioCtx.destination);
 // Ambient synth pad and sparse, soft pings are synthesized locally: no external audio files required.
 const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();
 osc.type="sine";osc.frequency.value=55;filter.type="lowpass";filter.frequency.value=180;gain.gain.value=.12;osc.connect(filter);filter.connect(gain);gain.connect(masterGain);osc.start();
 const osc2=audioCtx.createOscillator(),g2=audioCtx.createGain();osc2.type="triangle";osc2.frequency.value=82.4;g2.gain.value=.025;osc2.connect(g2);g2.connect(masterGain);osc2.start();
}
function tone(freq=440,duration=.12,wave="sine",volume=.2,slide=0){
 if(!soundOn)return;initAudio();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=wave;o.frequency.setValueAtTime(freq,audioCtx.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide),audioCtx.currentTime+duration);
 g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(masterGain);o.start();o.stop(audioCtx.currentTime+duration+.02);
}
function noise(duration=.12,volume=.12){
 if(!soundOn)return;initAudio();const len=Math.floor(audioCtx.sampleRate*duration),buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate),d=buf.getChannelData(0);
 for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
 const src=audioCtx.createBufferSource(),g=audioCtx.createGain();src.buffer=buf;g.gain.value=volume;src.connect(g);g.connect(masterGain);src.start();
}
function play(kind){if(kind==="collect"){tone(680,.09,"triangle",.18,360);setTimeout(()=>tone(1040,.12,"sine",.13,120),55)}else if(kind==="hit"){noise(.09,.15);tone(145,.12,"sawtooth",.15,-55)}else if(kind==="shot"){noise(.055,.19);tone(175,.095,"sawtooth",.12,-90);tone(820,.04,"square",.035,-320)}else if(kind==="hurt"){tone(180,.24,"sawtooth",.22,-100);noise(.12,.08)}else if(kind==="reload"){tone(420,.05,"square",.07,-140);setTimeout(()=>tone(620,.08,"triangle",.07,80),460);setTimeout(()=>tone(880,.09,"triangle",.06,100),900)}else if(kind==="build"){tone(320,.15,"triangle",.18,180);setTimeout(()=>tone(620,.22,"sine",.12,180),100)}else if(kind==="level"){tone(440,.2,"sine",.15,160);setTimeout(()=>tone(660,.24,"sine",.15,220),130);setTimeout(()=>tone(880,.3,"sine",.13,180),270)}else if(kind==="step"){noise(.045,.035)}}
document.getElementById("soundToggle").onclick=()=>{soundOn=!soundOn;document.getElementById("soundToggle").textContent="♫ Звук: "+(soundOn?"ВКЛ":"ВЫКЛ");if(soundOn){initAudio();masterGain.gain.setTargetAtTime(.22,audioCtx.currentTime,.04);tone(600,.1)}else if(masterGain&&audioCtx)masterGain.gain.setTargetAtTime(0,audioCtx.currentTime,.04);};
let weaponGroup=null,muzzleFlash=null;
function createWeaponView(){
 weaponGroup=new THREE.Group();
 const dark=makeMat(0x1b252b,0,.72,.38),rubber=makeMat(0x25282a,0,.02,.96),metal=makeMat(0x66716f,0,.82,.34),trim=makeMat(0x5aa89c,0x1b4d46,.38,.36);
 const box=(size,mat,pos)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.position.set(...pos);m.castShadow=false;m.receiveShadow=false;weaponGroup.add(m);return m;};
 const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.38,4,8),makeMat(0x454d50,0,.12,.9));arm.position.set(-.10,-.14,.08);arm.rotation.x=-.45;arm.rotation.z=-.18;weaponGroup.add(arm);
 box([.22,.16,.43],dark,[0,0,0]);box([.18,.075,.18],rubber,[0,-.105,.13]);box([.18,.12,.19],dark,[0,-.08,.24]);box([.12,.07,.21],metal,[0,.025,-.09]);
 const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.038,.047,.31,12),metal);barrel.rotation.x=-Math.PI/2;barrel.position.set(0,.01,-.31);weaponGroup.add(barrel);
 const coil=new THREE.Mesh(new THREE.TorusGeometry(.075,.014,6,16),trim);coil.position.set(0,.01,-.25);weaponGroup.add(coil);
 box([.11,.05,.13],trim,[0,.105,-.02]);box([.08,.035,.06],metal,[0,.145,-.04]);
 const sight=new THREE.Mesh(new THREE.BoxGeometry(.05,.04,.065),rubber);sight.position.set(0,.125,-.22);weaponGroup.add(sight);
 const mag=new THREE.Mesh(new THREE.BoxGeometry(.105,.115,.13),rubber);mag.position.set(0,-.13,-.02);mag.rotation.x=-.18;weaponGroup.add(mag);
 const sidePanel=new THREE.Mesh(new THREE.BoxGeometry(.045,.075,.18),trim);sidePanel.position.set(.115,.015,.045);weaponGroup.add(sidePanel);
 muzzleFlash=new THREE.Mesh(new THREE.SphereGeometry(.085,8,6),new THREE.MeshBasicMaterial({color:0xffd49a,transparent:true,opacity:0,depthTest:false,toneMapped:false}));muzzleFlash.position.set(0,.01,-.49);muzzleFlash.visible=false;weaponGroup.add(muzzleFlash);
 const flash2=new THREE.Mesh(new THREE.ConeGeometry(.055,.24,8),new THREE.MeshBasicMaterial({color:0xff874c,transparent:true,opacity:.8,depthTest:false,toneMapped:false}));flash2.rotation.x=-Math.PI/2;flash2.position.set(0,.01,-.58);muzzleFlash.userData.cone=flash2;weaponGroup.add(flash2);flash2.visible=false;
 weaponGroup.position.set(.37,-.34,-.67);camera.add(weaponGroup);
}
createWeaponView();

function makeLabel(text,color="#eafcff"){
 const c=document.createElement("canvas");c.width=256;c.height=64;const x=c.getContext("2d");
 x.fillStyle="rgba(3,10,18,.78)";x.beginPath();x.roundRect(12,6,232,52,13);x.fill();x.strokeStyle="rgba(115,245,215,.45)";x.stroke();
 x.font="600 22px Inter,sans-serif";x.textAlign="center";x.fillStyle=color;x.fillText(String(text).slice(0,20),128,39);
 const tex=new THREE.CanvasTexture(c),s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));s.scale.set(2.6,.65,1);return s;
}
function makeOtherPlayer(p){
 const g=new THREE.Group(),mat=makeMat(p.color||0x65f0d2,0,.15,.52),joint=makeMat(0x171f29,0,.25,.55),visorMat=makeMat(0x8dffef,0x16786e,.2,.2);
 const addBone=(a,b,r=.055,material=mat)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av),bone=new THREE.Mesh(new THREE.CylinderGeometry(r*.78,r,d.length(),6),material);bone.position.copy(av.add(bv).multiplyScalar(.5));bone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());g.add(bone);return bone;};
 const ball=(x,y,z,r,material=joint)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(r,7,6),material);m.position.set(x,y,z);g.add(m);return m;};
 // Bright, readable stick-soldier silhouette with visible joints and a tiny energy rifle.
 const head=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),mat);head.position.set(0,1.66,0);g.add(head);
 const visor=new THREE.Mesh(new THREE.BoxGeometry(.25,.055,.04),visorMat);visor.position.set(0,1.67,-.16);g.add(visor);
 addBone([0,1.43,0],[0,.72,0],.075);ball(0,1.4,0,.09);
 addBone([0,1.34,0],[-.36,.97,-.015],.052);addBone([-0.36,.97,-.015],[-.43,.70,-.10],.045);ball(-.36,.97,-.015,.065);
 addBone([0,1.34,0],[.30,1.05,-.02],.052);addBone([.30,1.05,-.02],[.40,.92,-.27],.045);ball(.30,1.05,-.02,.065);
 addBone([-.025,.72,0],[-.16,.38,.015],.06);addBone([-.16,.38,.015],[-.18,.08,-.025],.052);
 addBone([.025,.72,0],[.16,.39,.015],.06);addBone([.16,.39,.015],[.19,.08,-.025],.052);
 const gun=new THREE.Mesh(new THREE.BoxGeometry(.065,.065,.32),makeMat(0x29343b,0,.6,.35));gun.position.set(.39,.94,-.38);g.add(gun);
 const label=makeLabel(p.name);label.position.y=2.18;g.add(label);g.userData.entityId=p.id;g.userData.hp=p.hp;g.position.set(p.x,terrainHeight(p.x,p.z),p.z);scene.add(g);return g;
}
function makeResource(r){
 const mat=resourceMaterial(r.type),geo=r.type==="Кристалл"?new THREE.OctahedronGeometry(.65,1):r.type==="Сплав"?new THREE.DodecahedronGeometry(.55,1):r.type==="Реликт"?new THREE.TorusKnotGeometry(.38,.14,48,8):new THREE.IcosahedronGeometry(.58,1);
 const g=new THREE.Group(),m=new THREE.Mesh(geo,mat);m.castShadow=true;g.add(m);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.78,.022,6,32),new THREE.MeshBasicMaterial({color:r.type==="Реликт"?0xb99aff:r.type==="Эссенция"?0xffc36e:0x73f5d7,transparent:true,opacity:.75}));ring.rotation.x=Math.PI/2;ring.position.y=-.45;g.add(ring);
 const baseY=terrainHeight(r.x,r.z)+.72;g.position.set(r.x,baseY,r.z);g.userData={resource:r,baseY,entityId:r.id};scene.add(g);return g;
}
function makeEnemy(e){
 const g=new THREE.Group(),guardian=!!e.elite||e.kind==="Страж руин"||e.kind==="Осквернитель";
 const shellMat=makeMat(guardian?0x45414e:0x484447,guardian?0x3c1c30:0x35161e,.2,.82),skinMat=makeMat(guardian?0x5c4c53:0x66564d,0,.05,.92);
 const torso=new THREE.Mesh(new THREE.CapsuleGeometry(guardian?.42:.30,guardian?.72:.52,4,8),shellMat);torso.position.set(0,guardian?1.05:.76,-.02);torso.scale.set(1.05,1.05,1.28);torso.castShadow=true;g.add(torso);
 const head=new THREE.Mesh(new THREE.DodecahedronGeometry(guardian?.43:.30,1),skinMat);head.position.set(0,guardian?1.45:1.05,-.36);head.scale.set(1,.78,1.2);head.castShadow=true;g.add(head);
 const eyeMat=makeMat(guardian?0xffad65:0xff7b70,guardian?0xf05b27:0xb8202c,.15,.35);
 for(const side of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(guardian?.09:.065,10,8),eyeMat);eye.position.set(side*(guardian?.2:.145),guardian?1.49:1.08,-.62);g.add(eye);const horn=new THREE.Mesh(new THREE.ConeGeometry(.095,.42,5),skinMat);horn.position.set(side*(guardian?.33:.23),guardian?1.72:1.29,-.23);horn.rotation.z=-side*.45;horn.rotation.x=-.22;g.add(horn);}
 for(let side of [-1,1])for(let front of [-1,1]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(guardian?.13:.095,guardian?.42:.32,3,5),skinMat);leg.position.set(side*(guardian?.32:.23),guardian?.43:.32,front*.23);leg.rotation.z=side*.25;leg.rotation.x=front*.18;leg.castShadow=true;g.add(leg);}
 if(guardian){const plate=new THREE.Mesh(new THREE.DodecahedronGeometry(.47,0),makeMat(0x32343f,0,.48,.62));plate.position.set(0,1.23,.18);plate.scale.set(1.1,.6,.65);g.add(plate);}
 const label=makeLabel(e.kind,guardian?"#ffc49c":"#ffb2a7");label.position.y=guardian?2.45:1.95;g.add(label);
 const barBack=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.10),new THREE.MeshBasicMaterial({color:0x17161a,side:THREE.DoubleSide}));barBack.position.y=guardian?2.13:1.67;g.add(barBack);
 const bar=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.065),new THREE.MeshBasicMaterial({color:guardian?0xffa65e:0xec625d,side:THREE.DoubleSide}));bar.position.set(0,guardian?2.14:1.68,-.005);g.add(bar);g.userData.hpbar=bar;g.userData.hpbarBase=bar.scale.x;
 g.userData.entityId=e.id;g.position.set(e.x,terrainHeight(e.x,e.z),e.z);scene.add(g);return g;
}
function makeStructure(s){
 const g=new THREE.Group(),type=s.type||"relay";
 if(type==="wall"){
  const base=new THREE.Mesh(new THREE.BoxGeometry(3.2,2.1,.48),makeMat(0x475763,0,.72,.6));base.position.y=1.05;base.castShadow=!isMobile;g.add(base);
  for(let i=0;i<5;i++){const strip=new THREE.Mesh(new THREE.BoxGeometry(.12,2.18,.51),alloyMat);strip.position.set(-1.28+i*.64,1.08,0);g.add(strip);}
  const label=makeLabel("УКРЕПЛЕНИЕ","#d9ecff");label.position.y=2.45;g.add(label);
 }else if(type==="turret"){
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.85,1.1,.5,8),alloyMat);base.position.y=.25;g.add(base);
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.0,.85,.85),makeMat(0x28363d,0,.7,.4));body.position.y=.85;g.add(body);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.11,.14,1.15,8),crystalMat);barrel.rotation.x=Math.PI/2;barrel.position.set(0,1.0,-.72);g.add(barrel);
  const eye=new THREE.Mesh(new THREE.SphereGeometry(.18,8,8),new THREE.MeshBasicMaterial({color:0xffb36b}));eye.position.set(0,1.25,-.44);g.add(eye);
  const label=makeLabel("АВТОТУРЕЛЬ","#ffc18b");label.position.y=1.8;g.add(label);
 }else if(type==="house"){
  const frame=makeMat(0x35434a,0,.72,.52),panel=makeMat(0x58656a,0,.48,.78),dark=makeMat(0x18272d,0,.35,.8),windowMat=makeMat(0x81f1df,0x278b81,.3,.24),roofMat=makeMat(0x28373e,0,.58,.58);
  const box=(w,h,d,x,y,z,material,ry=0,rz=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.rotation.y=ry;m.rotation.z=rz;m.castShadow=!isMobile;m.receiveShadow=!isMobile;g.add(m);return m;};
  // Raised floor, reinforced walls, an open doorway and a pitched modular roof.
  box(5.7,.22,4.55,0,.12,0,frame);box(5.56,2.65,.22,0,1.48,-2.12,panel);
  box(.22,2.65,4.15,-2.72,1.48,0,panel);box(.22,2.65,4.15,2.72,1.48,0,panel);
  box(2.12,2.62,.22,-1.65,1.46,2.12,panel);box(2.12,2.62,.22,1.65,1.46,2.12,panel);box(1.12,.48,.24,0,2.55,2.12,frame);
  // Door inner edge, reflective window strips and interior lamp.
  box(.07,2.22,.06,-.61,1.28,2.0,alloyMat);box(.07,2.22,.06,.61,1.28,2.0,alloyMat);
  box(.72,.58,.035,-1.82,1.7,-2.245,windowMat);box(.72,.58,.035,1.82,1.7,-2.245,windowMat);
  box(.035,.62,.04,-1.82,1.7,-2.27,alloyMat);box(.035,.62,.04,1.82,1.7,-2.27,alloyMat);
  box(3.25,.22,5.0,-1.37,3.0,0,roofMat,0,.34);box(3.25,.22,5.0,1.37,3.0,0,roofMat,0,-.34);
  for(let z=-1.6;z<=1.61;z+=1.6){box(5.3,.12,.13,0,2.72,z,frame);}
  const lamp=new THREE.Mesh(new THREE.BoxGeometry(.5,.07,.18),new THREE.MeshBasicMaterial({color:0xffdca0}));lamp.position.set(0,2.55,0);g.add(lamp);
  const label=makeLabel("УБЕЖИЩЕ · "+s.owner,"#d4fff4");label.position.y=3.75;g.add(label);
 }else{
  const base=new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.5,.4,6),makeMat(0x354756,0,.65,.3));base.position.y=.2;base.castShadow=!isMobile;g.add(base);
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(.8,1),crystalMat);core.position.y=1.35;g.add(core);
  for(let i=0;i<3;i++){const p=new THREE.Mesh(new THREE.BoxGeometry(.14,1.5,.14),alloyMat);p.position.set(Math.cos(i*2.094)*.9,.9,Math.sin(i*2.094)*.9);g.add(p);}
  const label=makeLabel("МАЯК · "+s.owner,"#9df9e4");label.position.y=2.5;g.add(label);const hpBack=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.12),new THREE.MeshBasicMaterial({color:0x12171a,side:THREE.DoubleSide}));hpBack.position.y=2.88;g.add(hpBack);const hpBar=new THREE.Mesh(new THREE.PlaneGeometry(1.72,.07),new THREE.MeshBasicMaterial({color:0x73f5d7,side:THREE.DoubleSide}));hpBar.position.set(0,2.89,-.01);g.add(hpBar);g.userData.hpbar=hpBar;g.userData.hpBack=hpBack;
 }
 g.userData.entityId=s.id;g.userData.structureType=type;g.userData.hp=s.hp;g.position.set(s.x,terrainHeight(s.x,s.z),s.z);g.rotation.y=Number.isFinite(s.yaw)?s.yaw:0;scene.add(g);return g;
}
function isNearMe(entity,radius=290){const x=me?.x??0,z=me?.z??0;return Math.hypot(entity.x-x,entity.z-z)<=radius;}
function removeMesh(map,id){const m=map.get(id);if(m){scene.remove(m);map.delete(id);}}
function syncPlayers(list){
 players=list||[];const ids=new Set(players.map(p=>p.id));
 for(const [id,m] of playerMeshes)if(!ids.has(id))removeMesh(playerMeshes,id);
 for(const p of players){if(me&&p.id===me.id)continue;if(isNearMe(p,290)){if(!playerMeshes.has(p.id))playerMeshes.set(p.id,makeOtherPlayer(p));const m=playerMeshes.get(p.id);m.visible=!p.dead;m.userData.tx=p.x;m.userData.tz=p.z;m.userData.ty=terrainHeight(p.x,p.z);m.userData.yaw=p.yaw;m.userData.hp=p.hp;m.userData.maxHp=p.maxHp;}else removeMesh(playerMeshes,p.id);}
 document.getElementById("online").textContent=players.length;
 const el=document.getElementById("playerList");if(!el)return;el.innerHTML="";
 if(!players.length){el.textContent="Ожидание исследователей…";return;}
 players.slice(0,8).forEach(p=>{const row=document.createElement("div");row.className="person";const dot=document.createElement("i");dot.style.background=p.color;const name=document.createElement("span");name.textContent=p.name;const tag=document.createElement("small");tag.textContent=p.id===me?.id?`ВЫ · ${p.kills||0}K`:`${p.kills||0}K / ${p.deaths||0}D`;row.append(dot,name,tag);el.append(row);});
}
function syncResources(list){
 resources=list||[];const ids=new Set(resources.map(r=>r.id));
 for(const id of resourceMeshes.keys())if(!ids.has(id))removeMesh(resourceMeshes,id);
 for(const r of resources){if(isNearMe(r,isMobile?165:225)){if(!resourceMeshes.has(r.id))resourceMeshes.set(r.id,makeResource(r));}else removeMesh(resourceMeshes,r.id);}
}
function syncEnemies(list){
 enemies=list||[];const ids=new Set(enemies.map(e=>e.id));
 for(const id of enemyMeshes.keys())if(!ids.has(id))removeMesh(enemyMeshes,id);
 for(const e of enemies){if(isNearMe(e,isMobile?175:235)){if(!enemyMeshes.has(e.id))enemyMeshes.set(e.id,makeEnemy(e));const m=enemyMeshes.get(e.id);m.userData.tx=e.x;m.userData.tz=e.z;m.userData.ty=terrainHeight(e.x,e.z);m.userData.hp=e.hp;m.userData.maxHp=e.maxHp;if(m.userData.hpbar)m.userData.hpbar.scale.x=Math.max(.01,e.hp/e.maxHp);m.userData.elite=!!e.elite;}else removeMesh(enemyMeshes,e.id);}
}
function rebuildBuildBuckets(){buildBuckets.clear();for(const s of structures){const key=`${Math.floor(s.x/buildCell)},${Math.floor(s.z/buildCell)}`;if(!buildBuckets.has(key))buildBuckets.set(key,[]);buildBuckets.get(key).push(s);}}
function syncStructures(list){
 structures=list||[];rebuildBuildBuckets();const ids=new Set(structures.map(s=>s.id));for(const id of structureMeshes.keys())if(!ids.has(id))removeMesh(structureMeshes,id);
 for(const s of structures){if(isNearMe(s,360)){const old=structureMeshes.get(s.id);if(!old)structureMeshes.set(s.id,makeStructure(s));else{old.userData.hp=s.hp;if(old.userData.structureType!==(s.type||"relay")){removeMesh(structureMeshes,s.id);structureMeshes.set(s.id,makeStructure(s));}}}else removeMesh(structureMeshes,s.id);}
 if(mission.relayId)updateRelayMesh(mission.relayHp,mission.relayMaxHp);
}
function refreshNearbyEntities(){syncResources(resources);syncEnemies(enemies);syncPlayers(players);syncStructures(structures);}
function updateInv(v){inventory=v||inventory;document.getElementById("crystal").textContent=inventory["Кристалл"]||0;document.getElementById("alloy").textContent=inventory["Сплав"]||0;document.getElementById("bio").textContent=inventory["Биомасса"]||0;document.getElementById("relic").textContent=inventory["Реликт"]||0;document.getElementById("essence").textContent=inventory["Эссенция"]||0;updateContractText();}
function updateAmmo(d={}){if(!me)return;me.ammo=d.ammo??me.ammo??18;me.reserve=d.reserve??me.reserve??72;me.reloading=d.reloading??me.reloading??false;document.getElementById("ammoText").textContent=`${me.ammo} / ${me.reserve}`;document.getElementById("reloadText").textContent=me.reloading?"ЗАРЯДКА…":"R — ПЕРЕЗАРЯДКА";}
function updateContractText(){const c=document.getElementById("contractDesc");if(mission.phase==="salvage")c.textContent=`Нужно: кристаллы ${inventory["Кристалл"]||0}/3 · сплав ${inventory["Сплав"]||0}/2. Собери материалы и нажми B, чтобы развернуть маяк.`;}
function updateRelayMesh(hp,maxHp){const m=mission.relayId&&structureMeshes.get(mission.relayId);if(m&&m.userData.hpbar){const ratio=Math.max(0,Math.min(1,hp/Math.max(1,maxHp)));m.userData.hpbar.scale.x=ratio;m.userData.hpbar.material.color.set(ratio<.3?0xff615b:ratio<.6?0xf5b85b:0x73f5d7);}}
function setMission(next){if(!next)return;const previousPhase=mission.phase;mission={...mission,...next};const no=String(mission.round||1).padStart(2,"0");document.getElementById("contractNo").textContent=no;const tag=document.getElementById("phaseTag"),title=document.getElementById("contractTitle"),desc=document.getElementById("contractDesc"),status=document.getElementById("missionStatus"),timer=document.getElementById("missionTimer"),bar=document.getElementById("relayBar"),hpText=document.getElementById("relayHpText");
 if(mission.phase==="defend"){tag.textContent="ОБОРОНА МАЯКА";title.textContent="Удержи передатчик";desc.textContent="Не отходи далеко: отбивай атаки и чини маяк клавишей F за 2 сплава. Каждая следующая волна становится опаснее.";status.textContent=`ВОЛНЫ · ${5-(mission.wavesLeft||0)}/5`;const left=Math.max(0,Math.ceil((mission.endsAt-Date.now())/1000));timer.textContent=`${left} сек`;bar.style.width=`${Math.max(0,mission.relayHp/Math.max(1,mission.relayMaxHp)*100)}%`;hpText.textContent=`${Math.max(0,Math.ceil(mission.relayHp))} / ${mission.relayMaxHp}`;updateRelayMesh(mission.relayHp,mission.relayMaxHp);}
 else if(mission.phase==="complete"){tag.textContent="КОНТРАКТ ВЫПОЛНЕН";title.textContent="Сигнал стабилизирован";desc.textContent="Команда получила награду. Новый контракт скоро появится — запасись материалами и ячейками.";status.textContent=`ВЫПОЛНЕНО · ${mission.completed||1}`;timer.textContent="✓";bar.style.width="100%";hpText.textContent="МАЯК УЦЕЛЕЛ";if(previousPhase!=="complete")play("level");}
 else if(mission.phase==="failed"){tag.textContent="КОНТРАКТ ПРОВАЛЕН";title.textContent="Маяк потерян";desc.textContent="Угроза уничтожила передатчик. Собери материалы для следующей попытки.";status.textContent="ПРОВАЛ";timer.textContent="×";bar.style.width="0%";hpText.textContent="0";if(previousPhase!=="failed")play("hurt");}
 else {tag.textContent="СБОР МАТЕРИАЛОВ";title.textContent=`Контракт ${no}: активируй ретранслятор`;status.textContent="ПОДГОТОВКА";timer.textContent=`${mission.completed||0} успешно`;bar.style.width="100%";hpText.textContent="—";updateContractText();}}

function updateStats(s){
 if(!me)return;me.hp=s.hp??me.hp;me.maxHp=s.maxHp??me.maxHp;me.level=s.level??me.level;me.xp=s.xp??me.xp;updateAmmo(s);
 document.getElementById("level").textContent=me.level;document.getElementById("hpText").textContent=`${me.hp} / ${me.maxHp}`;document.getElementById("hpBar").style.width=(me.hp/me.maxHp*100)+"%";
 document.getElementById("xpText").textContent=me.xp+" XP";document.getElementById("xpBar").style.width=(Math.min(100,me.xp/(me.level*60)*100))+"%";
}
function notice(text){const el=document.getElementById("notice");el.textContent=text;el.classList.add("show");clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.classList.remove("show"),2200);}
function feed(text){const el=document.getElementById("feed"),line=document.createElement("div");line.className="feedline";line.textContent=text;el.prepend(line);while(el.children.length>7)el.lastChild.remove();}
socket.on("connect",()=>{document.getElementById("conn").textContent="СЕТЬ АКТИВНА";});
socket.on("disconnect",()=>{document.getElementById("conn").textContent="СВЯЗЬ ПОТЕРЯНА";notice("Связь потеряна — переподключение…");});
socket.on("world:init",w=>{syncPlayers(w.players);syncResources(w.resources);syncEnemies(w.enemies);syncStructures(w.structures);setMission(w.mission);});
socket.on("world:update",w=>{syncPlayers(w.players);syncResources(w.resources);syncEnemies(w.enemies);syncStructures(w.structures);setMission(w.mission);});
socket.on("player:you",p=>{me=p;inventory=p.inventory||{};yaw=(p.yaw??Math.PI)-Math.PI;document.getElementById("pname").textContent=p.name;updateInv(inventory);updateStats(p);updateAmmo(p);});
socket.on("player:moved",p=>{const known=players.find(x=>x.id===p.id);if(known)Object.assign(known,p);const m=playerMeshes.get(p.id);if(m){m.userData.tx=p.x;m.userData.tz=p.z;m.userData.ty=terrainHeight(p.x,p.z);m.userData.yaw=p.yaw;}});
socket.on("player:left",id=>{const m=playerMeshes.get(id);if(m)scene.remove(m);playerMeshes.delete(id);});
socket.on("inventory:update",updateInv);socket.on("player:stats",updateStats);socket.on("weapon:update",updateAmmo);socket.on("notice",notice);socket.on("notice:global",d=>notice(d.text));socket.on("feed",d=>feed(d.text));socket.on("mission:update",setMission);
socket.on("player:damage",d=>{play("hurt");const el=document.getElementById("damageVignette");el.classList.add("show");setTimeout(()=>el.classList.remove("show"),220);if(d?.by)notice(`Попадание: ${d.by}`);});
socket.on("player:health",d=>{const p=players.find(x=>x.id===d.id);if(p){p.hp=d.hp;p.maxHp=d.maxHp;}const m=playerMeshes.get(d.id);if(m){m.userData.hp=d.hp;m.userData.maxHp=d.maxHp;}});
socket.on("pvp:kill",d=>{if(d.victim===me?.id)notice("Тебя устранили. Возрождение через 3 секунды.");else if(d.killer===me?.id)notice(`Ты победил ${d.victimName}!`);});
socket.on("player:respawn",p=>{if(!me)return;me.x=p.x;me.z=p.z;me.hp=p.hp??me.maxHp;me.y=0;velocityX=velocityZ=velocityY=0;onGround=true;updateStats({hp:me.hp,maxHp:me.maxHp});notice("Точка высадки восстановлена.");});
socket.on("combat:hit",d=>{const h=document.getElementById("hitmarker");h.classList.remove("show");void h.offsetWidth;h.classList.add("show");if(d.killed)play("level");});
socket.on("relay:health",d=>{mission.relayHp=d.hp;mission.relayMaxHp=d.maxHp;updateRelayMesh(d.hp,d.maxHp);const ratio=Math.max(0,Math.min(1,d.hp/Math.max(1,d.maxHp)));document.getElementById("relayBar").style.width=`${ratio*100}%`;document.getElementById("relayHpText").textContent=`${d.hp} / ${d.maxHp}`;});
socket.on("enemy:spawn",e=>{if(enemies.some(x=>x.id===e.id))return;enemies.push(e);if(isNearMe(e,isMobile?150:215))enemyMeshes.set(e.id,makeEnemy(e));});
socket.on("structure:removed",id=>{const m=structureMeshes.get(id);if(m){scene.remove(m);structureMeshes.delete(id);}structures=structures.filter(s=>s.id!==id);rebuildBuildBuckets();});
socket.on("resource:removed",id=>{const m=resourceMeshes.get(id);if(m){scene.remove(m);resourceMeshes.delete(id);}resources=resources.filter(r=>r.id!==id);play("collect");});
socket.on("resource:added",r=>{resources.push(r);if(isNearMe(r,isMobile?165:225))resourceMeshes.set(r.id,makeResource(r));});
socket.on("structure:added",s=>{structures.push(s);rebuildBuildBuckets();if(isNearMe(s,360))structureMeshes.set(s.id,makeStructure(s));play("build");});
socket.on("enemy:hit",d=>{const m=enemyMeshes.get(d.id);if(m){m.userData.hp=d.hp;if(m.userData.hpbar)m.userData.hpbar.scale.x=Math.max(.01,d.hp/d.maxHp);if(d.by===me?.id)play("hit");}});
socket.on("enemy:dead",id=>{const m=enemyMeshes.get(id);if(m){scene.remove(m);enemyMeshes.delete(id);}enemies=enemies.filter(e=>e.id!==id);});
socket.on("enemies:state",list=>{for(const e of list){const data=enemies.find(x=>x.id===e.id);if(data){data.x=e.x;data.z=e.z;data.hp=e.hp;}const m=enemyMeshes.get(e.id);if(m){m.userData.tx=e.x;m.userData.tz=e.z;m.userData.ty=terrainHeight(e.x,e.z);m.userData.hp=e.hp;if(m.userData.hpbar)m.userData.hpbar.scale.x=Math.max(.01,e.hp/e.maxHp);}}});

const raycaster=new THREE.Raycaster();raycaster.far=80;const center=new THREE.Vector2(0,0);
function nearestResource(){if(!me)return null;let best=null,bd=4.5;for(const r of resources){const d=Math.hypot(me.x-r.x,me.z-r.z);if(d<bd){bd=d;best=r;}}return best;}
function collect(){if(me&&me.hp<=0)return;const r=nearestResource();if(!r){notice("Нет ресурсов рядом. Ищи обломки и светящиеся минералы на сканере.");return;}socket.emit("resource:collect",{id:r.id});}
function fireWeapon(){if(!me||me.hp<=0||performance.now()-lastAttack<365||me.dead)return;lastAttack=performance.now();weaponRecoil=Math.min(.22,weaponRecoil+.16);weaponFlashUntil=performance.now()+55;play("shot");
 raycaster.setFromCamera(center,camera);const roots=[...enemyMeshes.values(),...playerMeshes.values()];const hits=raycaster.intersectObjects(roots,true);let target=null,targetType="enemy";
 for(const hit of hits){let rootObj=hit.object;while(rootObj.parent&&rootObj.parent!==scene)rootObj=rootObj.parent;const id=rootObj.userData.entityId;if(enemyMeshes.has(id)){target=id;targetType="enemy";break;}if(playerMeshes.has(id)&&id!==me.id){target=id;targetType="player";break;}}
 if(!target){let best=80,heading=yaw+Math.PI;for(const p of players){if(p.id===me.id||p.dead)continue;const dx=p.x-me.x,dz=p.z-me.z,d=Math.hypot(dx,dz);if(d>best)continue;const a=Math.atan2(dx,dz),diff=Math.abs(Math.atan2(Math.sin(a-heading),Math.cos(a-heading)));if(diff<.10){best=d;target=p.id;targetType="player";}}}
 if(!target){let best=80,heading=yaw+Math.PI;for(const e of enemies){const dx=e.x-me.x,dz=e.z-me.z,d=Math.hypot(dx,dz);if(d>best)continue;const a=Math.atan2(dx,dz),diff=Math.abs(Math.atan2(Math.sin(a-heading),Math.cos(a-heading)));if(diff<.10){best=d;target=e.id;targetType="enemy";}}}
 socket.emit("player:attack",{id:target,targetType});
}
function reload(){socket.emit("player:reload");play("reload");}
function heal(){socket.emit("player:heal");}
function repair(){socket.emit("player:repair");}
function build(type="relay"){if(!me||me.hp<=0)return;const px=me.x-Math.sin(yaw)*4,pz=me.z-Math.cos(yaw)*4;const x=Math.round(px/2)*2,z=Math.round(pz/2)*2;if(blockedAt(x,z)){notice("Здесь пересекается постройка или скала.");return;}socket.emit("structure:build",{x,z,type,yaw});}
document.getElementById("collect").onclick=collect;document.getElementById("attack").onclick=fireWeapon;document.getElementById("reload").onclick=reload;document.getElementById("heal").onclick=heal;document.getElementById("repair").onclick=repair;document.getElementById("build").onclick=()=>build("relay");document.getElementById("buildWall").onclick=()=>build("wall");document.getElementById("buildTurret").onclick=()=>build("turret");document.getElementById("buildHouse").onclick=()=>build("house");
document.getElementById("enter").onclick=()=>{
 if(!socket.connected){notice("Сервер пока недоступен.");return;}
 initAudio();enterImmersive();const name=document.getElementById("nameInput").value.trim()||"Путник";
 socket.emit("player:join",{name});joined=true;document.getElementById("start").style.display="none";document.getElementById("touchControls")?.classList.add("enabled");if(!isMobile)renderer.domElement.requestPointerLock?.();
};
document.getElementById("nameInput").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("enter").click();});
renderer.domElement.addEventListener("click",()=>{if(joined&&!locked)renderer.domElement.requestPointerLock?.();});
document.addEventListener("pointerlockchange",()=>{locked=document.pointerLockElement===renderer.domElement;if(!locked)aiming=false;});
document.addEventListener("mousemove",e=>{if(!locked)return;yaw-=e.movementX*.0022;pitch-=e.movementY*.002;pitch=Math.max(-1.25,Math.min(1.25,pitch));});
document.addEventListener("keydown",e=>{
 if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target?.isContentEditable)return;
 const k=e.key.toLowerCase();keys.add(k);
 if([" ","arrowup","arrowdown"].includes(k))e.preventDefault();
 if(e.repeat)return;
 if(k==="e")collect();if(k==="h")heal();if(k==="b")build("relay");if(k==="t")build("wall");if(k==="g")build("turret");if(k==="v")build("house");if(k==="r")reload();if(k==="f")repair();
});
document.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
document.addEventListener("mousedown",e=>{if(e.button===0&&joined&&locked&&e.target===renderer.domElement)fireWeapon();if(e.button===2&&joined&&locked&&e.target===renderer.domElement)aiming=true;});document.addEventListener("mouseup",e=>{if(e.button===2)aiming=false;});
document.addEventListener("contextmenu",e=>e.preventDefault());

// Mobile / Telegram controls. The scene is always viewport-sized; fullscreen is requested after the user's join gesture.
const tg=window.Telegram?.WebApp;
function enterImmersive(){
 try{tg?.ready?.();tg?.expand?.();if(tg?.requestFullscreen){const req=tg.requestFullscreen();req?.catch?.(()=>{});}else if(!document.fullscreenElement){document.documentElement.requestFullscreen?.().catch(()=>{});}}catch(e){}
 try{if(isMobile&&tg?.lockOrientation)tg.lockOrientation();else if(isMobile&&screen.orientation?.lock)screen.orientation.lock("landscape").catch(()=>{});}catch(e){}
}
if(tg){try{tg.ready?.();tg.expand?.();tg.setHeaderColor?.("#050a11");tg.setBackgroundColor?.("#050a11");const autoFs=tg.requestFullscreen?.();autoFs?.catch?.(()=>{});tg.onEvent?.("viewportChanged",syncViewport);tg.onEvent?.("fullscreenChanged",syncViewport);tg.onEvent?.("safeAreaChanged",syncViewport);}catch(e){}}
const joystick=document.getElementById("joystick"),stick=document.getElementById("stick"),lookZone=document.getElementById("lookZone");let joyId=null,joyRect=null,lookId=null,lastLookX=0,lastLookY=0;
function updateJoystick(e){if(!joystick||!stick)return;const rect=joystick.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=rect.width*.34,len=Math.hypot(dx,dy)||1,k=Math.min(1,max/len);touchMoveX=(dx*k)/max;touchMoveY=(dy*k)/max;stick.style.transform=`translate(${dx*k}px,${dy*k}px)`;}
if(joystick){joystick.addEventListener("pointerdown",e=>{e.preventDefault();joyId=e.pointerId;joystick.setPointerCapture(e.pointerId);updateJoystick(e);});joystick.addEventListener("pointermove",e=>{if(e.pointerId===joyId){e.preventDefault();updateJoystick(e);}});const endJoy=e=>{if(e.pointerId!==joyId)return;joyId=null;touchMoveX=touchMoveY=0;stick.style.transform="translate(0,0)";};joystick.addEventListener("pointerup",endJoy);joystick.addEventListener("pointercancel",endJoy);}
if(lookZone){lookZone.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse")return;lookId=e.pointerId;lastLookX=e.clientX;lastLookY=e.clientY;lookZone.setPointerCapture(e.pointerId);e.preventDefault();});lookZone.addEventListener("pointermove",e=>{if(e.pointerId!==lookId)return;const dx=e.clientX-lastLookX,dy=e.clientY-lastLookY;lastLookX=e.clientX;lastLookY=e.clientY;yaw-=dx*.0062;pitch=Math.max(-1.22,Math.min(1.22,pitch-dy*.0058));e.preventDefault();});const endLook=e=>{if(e.pointerId===lookId)lookId=null;};lookZone.addEventListener("pointerup",endLook);lookZone.addEventListener("pointercancel",endLook);}
function bindHoldButton(id,start,end){const el=document.getElementById(id);if(!el)return;el.addEventListener("pointerdown",e=>{e.preventDefault();el.setPointerCapture?.(e.pointerId);start(e);});for(const event of ["pointerup","pointercancel","lostpointercapture"]){el.addEventListener(event,e=>{e.preventDefault();end(e);});}}
bindHoldButton("touchFire",()=>{fireHeld=true;fireWeapon();},()=>{fireHeld=false;});
document.getElementById("touchAim")?.addEventListener("click",e=>{e.preventDefault();aimTouch=!aimTouch;document.getElementById("touchAim").classList.toggle("active",aimTouch);});
bindHoldButton("touchJump",()=>{if(onGround){velocityY=6.6;onGround=false;}},()=>{});
document.getElementById("touchCollect")?.addEventListener("click",collect);document.getElementById("touchReload")?.addEventListener("click",reload);document.getElementById("touchHeal")?.addEventListener("click",heal);document.getElementById("touchBuild")?.addEventListener("click",()=>build("wall"));document.getElementById("touchTurret")?.addEventListener("click",()=>build("turret"));document.getElementById("touchRelay")?.addEventListener("click",()=>build("relay"));document.getElementById("touchHouse")?.addEventListener("click",()=>build("house"));document.getElementById("touchRepair")?.addEventListener("click",repair);document.getElementById("touchRun")?.addEventListener("click",e=>{runTouch=!runTouch;e.currentTarget.classList.toggle("primary",runTouch);notice(runTouch?"Спринт включён":"Спринт выключен");});
// Disable browser zoom/scroll gestures over the actual game and keep touch gestures inside the controls.
document.addEventListener("gesturestart",e=>e.preventDefault(),{passive:false});document.addEventListener("touchmove",e=>{if(isMobile)e.preventDefault();},{passive:false});

function blockedAt(x,z){
 const bx=Math.floor(x/obstacleCell),bz=Math.floor(z/obstacleCell);
 for(let gx=bx-1;gx<=bx+1;gx++)for(let gz=bz-1;gz<=bz+1;gz++)for(const o of (obstacleBuckets.get(`${gx},${gz}`)||[])){const dx=x-o.x,dz=z-o.z,rr=o.r+.48;if(dx*dx+dz*dz<rr*rr)return true;}
 const sx=Math.floor(x/buildCell),sz=Math.floor(z/buildCell);
 for(let gx=sx-1;gx<=sx+1;gx++)for(let gz=sz-1;gz<=sz+1;gz++)for(const b of (buildBuckets.get(`${gx},${gz}`)||[])){
  const dx=x-b.x,dz=z-b.z,type=b.type||"relay";
  if(type==="wall"){const a=Number.isFinite(b.yaw)?b.yaw:0,lx=dx*Math.cos(a)-dz*Math.sin(a),lz=dx*Math.sin(a)+dz*Math.cos(a);if(Math.abs(lx)<1.86&&Math.abs(lz)<.78)return true;}
  else if(type==="house"){const a=Number.isFinite(b.yaw)?b.yaw:0,lx=dx*Math.cos(a)-dz*Math.sin(a),lz=dx*Math.sin(a)+dz*Math.cos(a);const side=Math.abs(lx)>2.35&&Math.abs(lx)<3.15&&Math.abs(lz)<2.35;const back=lz< -1.55&&lz> -2.42&&Math.abs(lx)<3.05;const front=lz>1.55&&lz<2.42&&Math.abs(lx)>.72&&Math.abs(lx)<3.05;if(side||back||front)return true;}
  else if(Math.hypot(dx,dz)<(type==="turret"?1.25:1.65))return true;
 }
 return false;
}
function drawRadar(){const canvas=document.getElementById("radar");if(!canvas||!me)return;const c=canvas.getContext("2d"),w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,R=101,range=58,scale=R/range;c.clearRect(0,0,w,h);c.save();c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);c.clip();c.fillStyle="rgba(5,13,19,.88)";c.fillRect(0,0,w,h);c.strokeStyle="rgba(139,185,194,.22)";c.lineWidth=1;for(const r of [34,67,100]){c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke();}c.beginPath();c.moveTo(cx-R,cy);c.lineTo(cx+R,cy);c.moveTo(cx,cy-R);c.lineTo(cx,cy+R);c.stroke();
 const plot=(x,z,color,size=3)=>{const dx=x-me.x,dz=z-me.z,sx=dx*Math.cos(yaw)-dz*Math.sin(yaw),sy=dx*Math.sin(yaw)+dz*Math.cos(yaw),px=cx+sx*scale,py=cy+sy*scale;if(Math.hypot(px-cx,py-cy)>R-3)return;c.fillStyle=color;c.beginPath();c.arc(px,py,size,0,Math.PI*2);c.fill();};
 for(const r of resources)plot(r.x,r.z,r.type==="Реликт"?"#b6a2ff":r.type==="Эссенция"?"#ffbf74":"#73f5d7",r.type==="Реликт"?3.3:2.4);
 for(const e of enemies)plot(e.x,e.z,e.elite?"#ffb05d":"#ff667c",e.elite?4.3:3.2);
 for(const p of players)if(p.id!==me.id)plot(p.x,p.z,"#82baff",3.4);
 for(const s of structures)plot(s.x,s.z,"#e0d58b",4);
 if(mission.relay)plot(mission.relay.x,mission.relay.z,"#ffe18b",5.4);
 c.translate(cx,cy);c.fillStyle="#e8fff8";c.beginPath();c.moveTo(0,-8);c.lineTo(5.5,6);c.lineTo(0,3);c.lineTo(-5.5,6);c.closePath();c.fill();c.restore();}
let prev=performance.now(),stepClock=0,renderNext=0,fpsBucketStart=performance.now(),fpsFrames=0,fpsAvg=60,lastEntityRefresh=0;
function animate(now){
 requestAnimationFrame(animate);const frameLimit=isMobile?34:60;if(now<renderNext)return;renderNext=now+1000/frameLimit;const dt=Math.min(.04,(now-prev)/1000);prev=now;fpsFrames++;
 if(now-fpsBucketStart>2200){fpsAvg=fpsFrames*1000/(now-fpsBucketStart);fpsFrames=0;fpsBucketStart=now;if(fpsAvg<(isMobile?27:38)&&renderScale>(isMobile?.62:.82)){renderScale=Math.max(isMobile?.62:.82,renderScale-.1);renderer.setPixelRatio(renderScale);renderer.setSize(innerWidth,innerHeight,false);}else if(fpsAvg>(isMobile?48:56)&&renderScale<(isMobile?.95:1.28)){renderScale=Math.min(isMobile?.95:1.28,renderScale+.05);renderer.setPixelRatio(renderScale);renderer.setSize(innerWidth,innerHeight,false);}}
 if(now-lastEntityRefresh>850){refreshNearbyEntities();lastEntityRefresh=now;}
 if(me&&joined&&me.hp>0){
  const f=THREE.MathUtils.clamp((keys.has("w")||keys.has("arrowup")?1:0)-(keys.has("s")||keys.has("arrowdown")?1:0)-touchMoveY,-1,1);
  const side=THREE.MathUtils.clamp((keys.has("d")||keys.has("arrowright")?1:0)-(keys.has("a")||keys.has("arrowleft")?1:0)+touchMoveX,-1,1);
  const moving=!!(f||side),wantsRun=(keys.has("shift")||runTouch)&&moving&&stamina>1&&!aiming&&!aimTouch&&!staminaExhausted;
  if(wantsRun){stamina=Math.max(0,stamina-26*dt);if(stamina<=0)staminaExhausted=true;}else{stamina=Math.min(100,stamina+18*dt);if(stamina>=24)staminaExhausted=false;}
  document.getElementById("staminaText").textContent=Math.round(stamina)+"%";document.getElementById("staminaBar").style.width=stamina+"%";
  const len=Math.hypot(f,side)||1,dx=(-Math.sin(yaw)*f+Math.cos(yaw)*side)/len,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*side)/len;
  const speed=wantsRun?10.8:(aiming||aimTouch)?4.25:6.25,targetVX=dx*speed,targetVZ=dz*speed;
  velocityX=THREE.MathUtils.damp(velocityX,targetVX,moving?13:10,dt);velocityZ=THREE.MathUtils.damp(velocityZ,targetVZ,moving?13:10,dt);
  const nx=THREE.MathUtils.clamp(me.x+velocityX*dt,-985,985),nz=THREE.MathUtils.clamp(me.z+velocityZ*dt,-985,985);
  if(!blockedAt(nx,me.z))me.x=nx;else velocityX=0;if(!blockedAt(me.x,nz))me.z=nz;else velocityZ=0;
  if(keys.has(" ")&&onGround){velocityY=6.6;onGround=false;play("step");}velocityY-=18.5*dt;me.y=(me.y||0)+velocityY*dt;if(me.y<=0){me.y=0;velocityY=0;onGround=true;}
  const groundY=terrainHeight(me.x,me.z),walkingBob=moving?Math.sin(now*(wantsRun?0.019:0.014))*(wantsRun?.055:.028):0;
  camera.position.set(me.x,groundY+1.67+me.y+walkingBob,me.z);camera.rotation.order="YXZ";camera.rotation.y=yaw;camera.rotation.x=pitch;camera.rotation.z=moving?Math.sin(now*.006)*.002:0;
  const targetFov=(aiming||aimTouch)?58:wantsRun?82:76;camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,9,dt);camera.updateProjectionMatrix();
  if(moving&&now-stepClock>(wantsRun?250:410)){play("step");stepClock=now;}
  if(now-lastSend>60){const serverYaw=((yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);socket.emit("player:move",{x:me.x,z:me.z,yaw:serverYaw});lastSend=now;}
  if(now-lastRadar>220){drawRadar();lastRadar=now;}
 }
 for(const m of playerMeshes.values()){if(m.userData.tx!==undefined){m.position.x=THREE.MathUtils.damp(m.position.x,m.userData.tx,10,dt);m.position.z=THREE.MathUtils.damp(m.position.z,m.userData.tz,10,dt);m.position.y=THREE.MathUtils.damp(m.position.y,m.userData.ty??terrainHeight(m.position.x,m.position.z),10,dt);if(m.userData.yaw!==undefined)m.rotation.y=m.userData.yaw-Math.PI;}}
 for(const m of resourceMeshes.values()){m.rotation.y+=dt*.22;m.position.y=m.userData.baseY+Math.sin(now*.0012+m.position.x)*.035;}
 for(const m of enemyMeshes.values()){if(m.userData.tx!==undefined){m.position.x=THREE.MathUtils.damp(m.position.x,m.userData.tx,5,dt);m.position.z=THREE.MathUtils.damp(m.position.z,m.userData.tz,5,dt);m.position.y=THREE.MathUtils.damp(m.position.y,m.userData.ty??terrainHeight(m.position.x,m.position.z),8,dt);}if(me){const facing=Math.atan2(me.x-m.position.x,me.z-m.position.z)+Math.PI;m.rotation.y=THREE.MathUtils.damp(m.rotation.y,facing,5,dt);} }
 for(const m of structureMeshes.values())if(m.children[1])m.children[1].rotation.y+=dt*.3;
 if(weaponGroup){weaponRecoil=Math.max(0,weaponRecoil-dt*.85);const sway=(me&&joined&&keys.size)?Math.sin(now*.008)*.008:0;weaponGroup.position.x=(aiming?.24:.37)+sway;weaponGroup.position.y=(aiming?-.3:-.34)-weaponRecoil+(me&&joined&&stamina<100?Math.sin(now*.013)*.004:0);weaponGroup.position.z=(aiming?-.56:-.67)+weaponRecoil*.75;weaponGroup.rotation.x=-weaponRecoil*.6;weaponGroup.rotation.y=sway*.4;if(muzzleFlash){muzzleFlash.visible=now<weaponFlashUntil;if(muzzleFlash.visible){muzzleFlash.material.opacity=.7+Math.random()*.3;if(muzzleFlash.userData.cone)muzzleFlash.userData.cone.visible=true;}else if(muzzleFlash.userData.cone)muzzleFlash.userData.cone.visible=false;}}
 const cross=document.getElementById("crosshair");cross.style.transform=`translate(-50%,-50%) scale(${aiming?.72:(me&&joined&&stamina<100&&keys.size?1.2:1)})`;if(fireHeld&&joined&&now-lastAttack>370)fireWeapon();
 if(mission.phase==="defend"){const left=Math.max(0,Math.ceil((mission.endsAt-Date.now())/1000));document.getElementById("missionTimer").textContent=`${left} сек`; }
 renderer.render(scene,camera);
}
requestAnimationFrame(animate);
function syncViewport(){const tgViewport=window.Telegram?.WebApp;const w=window.visualViewport?.width||window.innerWidth,h=tgViewport?.viewportStableHeight||tgViewport?.viewportHeight||window.visualViewport?.height||window.innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);document.documentElement.style.setProperty("--vvh",`${h}px`);}
window.addEventListener("resize",syncViewport);window.visualViewport?.addEventListener("resize",syncViewport);window.addEventListener("orientationchange",()=>setTimeout(syncViewport,200));

