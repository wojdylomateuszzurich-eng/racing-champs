import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════
   ROAD RACER  –  full-screen, player names, persistent leaderboard
═══════════════════════════════════════════════════════════════════ */

// ─── Internal canvas resolution (we CSS-scale this to fill screen) ────────────
const CW = 480, CH = 700;

const ROAD_LEFT  = 70;
const ROAD_RIGHT = 410;
const ROAD_W     = ROAD_RIGHT - ROAD_LEFT;
const NUM_LANES  = 4;
const LANE_W     = ROAD_W / NUM_LANES;
const GAME_SECS  = 45;
const SCROLL_BASE = 4.5;
const LS_KEY     = "roadracer_leaderboard_v1";

const C = {
  p1:"#FF3B30", p2:"#007AFF",
  road:"#3a3a3a", roadEdge:"#1a1a1a",
  grass:"#3aab3a", sky:"#87CEEB",
  gold:"#FFD700", boost:"#00E5FF",
};

// ─── Leaderboard helpers ──────────────────────────────────────────────────────
function loadBoard() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveBoard(board) {
  localStorage.setItem(LS_KEY, JSON.stringify(board));
}
function addScore(name, coins) {
  const board = loadBoard();
  board.push({ name: name || "Anonymous", coins, date: new Date().toLocaleDateString() });
  board.sort((a, b) => b.coins - a.coins);
  const top10 = board.slice(0, 10);
  saveBoard(top10);
  return top10;
}

// ─── Lane helpers ─────────────────────────────────────────────────────────────
function laneX(lane) { return ROAD_LEFT + lane * LANE_W + LANE_W / 2; }

// ─── Object factories ──────────────────────────────────────────────────────────
const TRAFFIC_COLORS = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c","#e67e22"];

function mkTraffic(spd) {
  return { type:"traffic", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-70,
    w:36, h:60, speed:spd*(0.6+Math.random()*0.8),
    color:TRAFFIC_COLORS[Math.floor(Math.random()*TRAFFIC_COLORS.length)], id:Math.random() };
}
function mkCoin(spd) {
  return { type:"coin", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-20,
    r:13, speed:spd*0.5, id:Math.random(), wobble:Math.random()*Math.PI*2 };
}
function mkOil(spd) {
  return { type:"oil", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-35,
    w:54, h:32, speed:spd*0.5, id:Math.random() };
}
function mkCones(spd) {
  const sl = Math.floor(Math.random()*(NUM_LANES-1));
  return [
    { type:"cone", x:laneX(sl),   y:-35, w:22, h:36, speed:spd*0.5, id:Math.random() },
    { type:"cone", x:laneX(sl+1), y:-35, w:22, h:36, speed:spd*0.5, id:Math.random()+1 },
  ];
}
function mkBoost(spd) {
  return { type:"boost", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-20,
    r:18, speed:spd*0.5, id:Math.random() };
}

// ─── Darken colour ────────────────────────────────────────────────────────────
function dk(hex, amt) {
  const n = parseInt(hex.replace("#",""),16);
  return `rgb(${Math.max(0,(n>>16)-amt)},${Math.max(0,((n>>8)&255)-amt)},${Math.max(0,(n&255)-amt)})`;
}

// ─── Canvas draw helpers ──────────────────────────────────────────────────────
function drawRoad(ctx, offset) {
  // sky
  ctx.fillStyle = C.sky;
  ctx.fillRect(0, 0, CW, CH*0.15);
  // grass
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, CH*0.15, CW, CH);
  // road body
  ctx.fillStyle = C.road;
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, CH);
  // kerb stripes (red/white) on edges
  for (let y = (offset % 60) - 60; y < CH; y += 60) {
    const c1 = Math.floor(y / 30) % 2 === 0 ? "#cc0000" : "#fff";
    ctx.fillStyle = c1;
    ctx.fillRect(ROAD_LEFT - 10, y, 10, 30);
    ctx.fillRect(ROAD_RIGHT,     y, 10, 30);
  }
  // road edges
  ctx.fillStyle = "#fff";
  ctx.fillRect(ROAD_LEFT,     0, 4, CH);
  ctx.fillRect(ROAD_RIGHT-4,  0, 4, CH);
  // dashed lane dividers
  const dH = 40, gH = 30, tot = dH + gH;
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  for (let lane = 1; lane < NUM_LANES; lane++) {
    const lx = ROAD_LEFT + lane * LANE_W;
    for (let y = (offset % tot) - tot; y < CH + tot; y += tot)
      ctx.fillRect(lx - 2, y, 4, dH);
  }
  // horizon fade
  const g = ctx.createLinearGradient(0,0,0,CH*0.22);
  g.addColorStop(0,"rgba(135,206,235,0.95)"); g.addColorStop(1,"rgba(135,206,235,0)");
  ctx.fillStyle = g; ctx.fillRect(0,0,CW,CH*0.22);
  // side trees (static; looks fine since road scrolls)
  drawTree(ctx, 22,  90); drawTree(ctx, 432,130);
  drawTree(ctx, 18, 290); drawTree(ctx, 438,310);
  drawTree(ctx, 25, 520); drawTree(ctx, 438,530);
}

function drawTree(ctx, x, y) {
  ctx.fillStyle="#5a3010"; ctx.fillRect(x-4,y,8,24);
  ctx.fillStyle="#2d7a2d"; ctx.beginPath(); ctx.arc(x,y-2,19,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#3d9e3d"; ctx.beginPath(); ctx.arc(x-3,y-8,14,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#55cc55"; ctx.beginPath(); ctx.arc(x+2,y-13,10,0,Math.PI*2); ctx.fill();
}

function drawPlayerCar(ctx, x, y, color, spin) {
  ctx.save(); ctx.translate(x,y); if (spin) ctx.rotate(spin);
  ctx.fillStyle="rgba(0,0,0,0.2)";
  ctx.beginPath(); ctx.ellipse(3,6,17,11,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=color; ctx.beginPath(); ctx.roundRect(-17,-30,34,56,6); ctx.fill();
  ctx.fillStyle=dk(color,35); ctx.fillRect(-17,22,34,5);
  ctx.fillStyle=dk(color,18); ctx.beginPath(); ctx.roundRect(-12,-22,24,32,5); ctx.fill();
  ctx.fillStyle="rgba(160,230,255,0.92)"; ctx.beginPath(); ctx.roundRect(-10,-24,20,15,3); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,0.45)"; ctx.beginPath(); ctx.roundRect(-9,-23,9,7,2); ctx.fill();
  ctx.fillStyle="rgba(160,230,255,0.75)"; ctx.beginPath(); ctx.roundRect(-8,12,16,11,2); ctx.fill();
  ctx.fillStyle="#ffffa0";
  ctx.beginPath(); ctx.roundRect(-14,-30,8,4,1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(6,-30,8,4,1); ctx.fill();
  ctx.fillStyle="#ff4444";
  ctx.beginPath(); ctx.roundRect(-14,26,7,4,1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(7,26,7,4,1); ctx.fill();
  ctx.fillStyle="#111";
  [[-22,-22,10,17],[12,-22,10,17],[-22,8,10,17],[12,8,10,17]].forEach(([wx,wy,ww,wh])=>{
    ctx.beginPath(); ctx.roundRect(wx,wy,ww,wh,2); ctx.fill();
    ctx.fillStyle="#555"; ctx.beginPath(); ctx.arc(wx+ww/2,wy+wh/2,3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111";
  });
  ctx.restore();
}

function drawHorse(ctx, x, y, spin, t) {
  ctx.save(); ctx.translate(x, y); if (spin) ctx.rotate(spin);
  const gallop = Math.sin((t||0)*12)*0.3;

  // Shadow
  ctx.fillStyle="rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(2,28,18,9,0,0,Math.PI*2); ctx.fill();

  // Body
  ctx.fillStyle="#c8863a";
  ctx.beginPath(); ctx.ellipse(0,0,18,26,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#dfa055";
  ctx.beginPath(); ctx.ellipse(0,4,11,16,0,0,Math.PI*2); ctx.fill();

  // Neck
  ctx.fillStyle="#c8863a";
  ctx.beginPath();
  ctx.moveTo(-8,-18); ctx.quadraticCurveTo(-14,-34,-6,-44);
  ctx.quadraticCurveTo(4,-34,6,-18); ctx.closePath(); ctx.fill();

  // Head
  ctx.fillStyle="#b87530";
  ctx.beginPath(); ctx.ellipse(-8,-50,10,13,-0.3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#d4956e";
  ctx.beginPath(); ctx.ellipse(-10,-42,6,4,-0.3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#8b4513";
  ctx.beginPath(); ctx.ellipse(-13,-41,2,1.5,0.2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#111";
  ctx.beginPath(); ctx.arc(-4,-53,3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#fff";
  ctx.beginPath(); ctx.arc(-3,-54,1,0,Math.PI*2); ctx.fill();

  // Ear
  ctx.fillStyle="#c8863a";
  ctx.beginPath(); ctx.moveTo(-1,-60); ctx.lineTo(4,-68); ctx.lineTo(7,-60); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#e8a070";
  ctx.beginPath(); ctx.moveTo(1,-61); ctx.lineTo(4,-66); ctx.lineTo(6,-61); ctx.closePath(); ctx.fill();

  // Mane
  ctx.strokeStyle="#5c2e00"; ctx.lineWidth=6; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(-2,-62); ctx.quadraticCurveTo(-12,-55,-10,-44);
  ctx.quadraticCurveTo(-8,-38,-14,-30); ctx.quadraticCurveTo(-10,-24,-12,-18);
  ctx.stroke();
  for (let i=0;i<5;i++){
    ctx.fillStyle="#5c2e00";
    ctx.beginPath(); ctx.ellipse(-9-i*1.5,-58+i*9,4,3,-0.5,0,Math.PI*2); ctx.fill();
  }

  // Tail
  ctx.strokeStyle="#5c2e00"; ctx.lineWidth=5; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(10,14); ctx.quadraticCurveTo(26+gallop*8,22,22,38);
  ctx.quadraticCurveTo(18,48,14+gallop*4,52); ctx.stroke();
  ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(10,14); ctx.quadraticCurveTo(30+gallop*10,26,26,42);
  ctx.quadraticCurveTo(22,52,18+gallop*6,58); ctx.stroke();

  // Legs with gallop
  const lc="#a06428";
  function leg(bx,by,swing,front){
    const a=front?swing:-swing;
    ctx.save(); ctx.translate(bx,by);
    ctx.strokeStyle=lc; ctx.lineWidth=7; ctx.lineCap="round";
    const kx=Math.sin(a)*14, ky=14;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(kx,ky); ctx.stroke();
    const fx=kx+Math.sin(a*0.5)*8, fy=ky+14;
    ctx.beginPath(); ctx.moveTo(kx,ky); ctx.lineTo(fx,fy); ctx.stroke();
    ctx.fillStyle="#333";
    ctx.beginPath(); ctx.ellipse(fx,fy+3,5,3,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  leg(-10,14, gallop,      true);
  leg(  6,14, gallop,      true);
  leg(-10, 4,-gallop*0.8, false);
  leg(  6, 4,-gallop*0.8, false);

  // Jockey
  ctx.fillStyle="#007AFF";
  ctx.beginPath(); ctx.ellipse(-4,-26,9,11,-0.15,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FFDAB9";
  ctx.beginPath(); ctx.arc(-6,-36,7,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#007AFF";
  ctx.beginPath(); ctx.arc(-6,-39,7,Math.PI,2*Math.PI); ctx.fill();
  ctx.fillStyle="#0055cc"; ctx.fillRect(-13,-40,14,3);
  ctx.fillStyle="#111";
  ctx.beginPath(); ctx.arc(-4,-36,1.5,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="#FFDAB9"; ctx.lineWidth=2.5; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(-1,-28); ctx.lineTo(6,-22+gallop*8); ctx.stroke();
  ctx.strokeStyle="#8b4513"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(6,-22+gallop*8); ctx.lineTo(10,-10+gallop*12); ctx.stroke();

  ctx.restore();
}

function drawTraffic(ctx, o) {
  ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(Math.PI);
  ctx.fillStyle="rgba(0,0,0,0.18)";
  ctx.beginPath(); ctx.ellipse(2,4,o.w/2-2,9,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=o.color; ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,5); ctx.fill();
  ctx.fillStyle=dk(o.color,20); ctx.beginPath(); ctx.roundRect(-o.w/2+3,-o.h/2+5,o.w-6,o.h*0.55,4); ctx.fill();
  ctx.fillStyle="rgba(160,230,255,0.85)"; ctx.beginPath(); ctx.roundRect(-o.w/2+4,-o.h/2+6,o.w-8,13,2); ctx.fill();
  ctx.fillStyle="#ffffa0";
  ctx.beginPath(); ctx.roundRect(-o.w/2+2,o.h/2-7,7,4,1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(o.w/2-9,o.h/2-7,7,4,1); ctx.fill();
  ctx.fillStyle="#111";
  [[-o.w/2-4,-o.h/2+2,8,13],[o.w/2-4,-o.h/2+2,8,13],
   [-o.w/2-4,o.h/2-15,8,13],[o.w/2-4,o.h/2-15,8,13]].forEach(([wx,wy,ww,wh])=>{
    ctx.beginPath(); ctx.roundRect(wx,wy,ww,wh,2); ctx.fill();
  });
  ctx.restore();
}

function drawCoin(ctx, o, t) {
  const p = 1 + Math.sin(t*3+o.wobble)*0.09;
  ctx.save(); ctx.translate(o.x,o.y); ctx.scale(p,p);
  const g = ctx.createRadialGradient(0,0,0,0,0,o.r*2.2);
  g.addColorStop(0,"rgba(255,215,0,0.55)"); g.addColorStop(1,"rgba(255,215,0,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,o.r*2.2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FFD700"; ctx.beginPath(); ctx.arc(0,0,o.r,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FFA500"; ctx.beginPath(); ctx.arc(0,0,o.r-3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FFD700"; ctx.font=`bold ${o.r}px Arial`;
  ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("★",0,1);
  ctx.restore();
}

function drawOil(ctx, o) {
  ctx.save(); ctx.translate(o.x,o.y);
  ctx.fillStyle="rgba(25,25,25,0.88)";
  ctx.beginPath(); ctx.ellipse(0,0,o.w/2,o.h/2,0,0,Math.PI*2); ctx.fill();
  const g = ctx.createRadialGradient(-o.w/6,-o.h/6,1,0,0,o.w/2);
  g.addColorStop(0,"rgba(255,50,50,0.35)"); g.addColorStop(0.33,"rgba(50,255,50,0.25)");
  g.addColorStop(0.66,"rgba(50,50,255,0.25)"); g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(0,0,o.w/2,o.h/2,0,0,Math.PI*2); ctx.fill();
  ctx.font="18px Arial"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("🛢️",0,0);
  ctx.restore();
}

function drawCone(ctx, o) {
  ctx.save(); ctx.translate(o.x,o.y);
  ctx.fillStyle="#555"; ctx.fillRect(-o.w/2,o.h/4,o.w,o.h/4);
  ctx.fillStyle="#FF6B00";
  ctx.beginPath(); ctx.moveTo(0,-o.h/2); ctx.lineTo(o.w/2,o.h/4); ctx.lineTo(-o.w/2,o.h/4); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#fff";
  ctx.beginPath(); ctx.moveTo(-o.w/4,-o.h/8); ctx.lineTo(o.w/4,-o.h/8);
  ctx.lineTo(o.w/3,o.h/8); ctx.lineTo(-o.w/3,o.h/8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBoost(ctx, o, t) {
  ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(t*2);
  const g = ctx.createRadialGradient(0,0,0,0,0,o.r*1.5);
  g.addColorStop(0,"rgba(0,229,255,0.65)"); g.addColorStop(1,"rgba(0,229,255,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,o.r*1.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#00E5FF"; ctx.strokeStyle="#fff"; ctx.lineWidth=2.5;
  ctx.beginPath();
  ctx.moveTo(5,-14); ctx.lineTo(-3,0); ctx.lineTo(4,0); ctx.lineTo(-5,14);
  ctx.lineTo(3,2); ctx.lineTo(-4,2); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawHUD(ctx, pName, pColor, timeLeft, coins, speed, boosted, oiled) {
  // top bar
  ctx.fillStyle="rgba(8,8,28,0.88)";
  ctx.fillRect(0,0,CW,58);
  ctx.strokeStyle=pColor; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(0,58); ctx.lineTo(CW,58); ctx.stroke();

  // player name + car icon
  ctx.fillStyle=pColor; ctx.font="bold 16px 'Fredoka One','Comic Sans MS',cursive";
  ctx.textAlign="left"; ctx.textBaseline="middle";
  ctx.fillText(`${pColor === C.p2 ? "🐴" : "🚗"} ${pName}`, 14, 20);

  // star count  
  ctx.fillStyle=C.gold; ctx.font="bold 22px 'Fredoka One','Comic Sans MS',cursive";
  ctx.textAlign="center"; ctx.fillText(`★ ${coins}`, CW/2, 22);

  // timer
  const urgent = timeLeft < 10;
  ctx.fillStyle = urgent ? "#FF3B30" : "#fff";
  ctx.font=`bold ${urgent?19:16}px 'Fredoka One','Comic Sans MS',cursive`;
  ctx.textAlign="right";
  ctx.fillText(`⏱ ${timeLeft.toFixed(1)}s`, CW-14, 20);

  // speed bar
  const bx=14, by=42, bw=CW-28, bh=11;
  ctx.fillStyle="rgba(255,255,255,0.1)";
  ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,5); ctx.fill();
  const pct = Math.min(1, Math.abs(speed)/11);
  ctx.fillStyle = boosted?"#00E5FF": oiled?"#cc6600":"#30ee60";
  ctx.beginPath(); ctx.roundRect(bx,by,bw*pct,bh,5); ctx.fill();

  if (boosted) { ctx.fillStyle="#00E5FF"; ctx.font="bold 10px sans-serif"; ctx.textAlign="left"; ctx.fillText("⚡ BOOST",bx,57); }
  if (oiled)   { ctx.fillStyle="#FF6B00"; ctx.font="bold 10px sans-serif"; ctx.textAlign="left"; ctx.fillText("🛢 SLIPPING",bx,57); }
}

// ─── Game state ───────────────────────────────────────────────────────────────
function mkState(playerNum, name) {
  return {
    playerNum, name, color: playerNum===1 ? C.p1 : C.p2,
    x: ROAD_LEFT + ROAD_W/2, y: CH - 110,
    speed: SCROLL_BASE, spinAngle:0,
    oilTimer:0, boostTimer:0,
    coins:0, objects:[], stripeOffset:0,
    startTime: Date.now(), spawnTimer:0, distance:0,
    alive:true, flashTimer:0, flashColor:"", popups:[],
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   REACT COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function RoadRacer() {
  const canvasRef  = useRef(null);
  const stateRef   = useRef(null);
  const keysRef    = useRef({});
  const rafRef     = useRef(null);
  const scaleRef   = useRef(1);

  // UI state
  const [phase, setPhase]   = useState("names");  // names | racing | done1 | results | board
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [p1Coins, setP1Coins] = useState(0);
  const [p2Coins, setP2Coins] = useState(0);
  const [liveCoins, setLiveCoins] = useState(0);
  const [liveTime,  setLiveTime]  = useState(GAME_SECS);
  const [board, setBoard]   = useState([]);
  const [canvasSize, setCanvasSize] = useState({ w: CW, h: CH });

  // ── Full-screen resize handler ──────────────────────────────────────────────
  useEffect(() => {
    function resize() {
      const scaleX = window.innerWidth  / CW;
      const scaleY = window.innerHeight / CH;
      const scale  = Math.min(scaleX, scaleY);
      scaleRef.current = scale;
      setCanvasSize({ w: CW * scale, h: CH * scale });
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Key listeners ───────────────────────────────────────────────────────────
  useEffect(() => {
    const dn = e => {
      keysRef.current[e.code] = true;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault();
    };
    const up = e => { keysRef.current[e.code] = false; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown",dn); window.removeEventListener("keyup",up); };
  }, []);

  // ── Load board on mount ─────────────────────────────────────────────────────
  useEffect(() => { setBoard(loadBoard()); }, []);

  // ── Start race ──────────────────────────────────────────────────────────────
  const startRace = useCallback((playerNum) => {
    const name = playerNum===1 ? (p1Name.trim()||"Player 1") : (p2Name.trim()||"Player 2");
    stateRef.current = mkState(playerNum, name);
    setLiveCoins(0); setLiveTime(GAME_SECS);
    setPhase("racing");
  }, [p1Name, p2Name]);

  // ── Game loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    let last = 0;

    const loop = ts => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min((ts-last)/1000, 0.05); last = ts;
      const t  = ts/1000;
      const s  = stateRef.current;

      drawRoad(ctx, s ? s.stripeOffset : 0);

      if (!s || !s.alive) {
        drawPlayerCar(ctx, ROAD_LEFT+ROAD_W/2, CH-110, C.p1, 0);
        return;
      }


      const k = keysRef.current;
      const oiled   = s.oilTimer  > 0;
      const boosted = s.boostTimer > 0;

      // Physics
      const tgtSpd = k["ArrowUp"]   ? (boosted?14:9)
                   : k["ArrowDown"]  ? 2
                   : SCROLL_BASE + s.distance/3000;
      s.speed += (tgtSpd - s.speed) * 0.08;
      s.speed  = Math.max(1.5, Math.min(boosted?14:10, s.speed));

      const drift = oiled ? (Math.random()-0.5)*4 : 0;
      const str   = oiled ? 6.5 : 5.5;
      if (k["ArrowLeft"])  s.x -= str + drift;
      if (k["ArrowRight"]) s.x += str + drift;
      s.x = Math.max(ROAD_LEFT+22, Math.min(ROAD_RIGHT-22, s.x));

      if (oiled) s.spinAngle += 0.2; else s.spinAngle *= 0.82;

      if (s.oilTimer   > 0) s.oilTimer   = Math.max(0, s.oilTimer   - dt);
      if (s.boostTimer > 0) s.boostTimer = Math.max(0, s.boostTimer - dt);
      if (s.flashTimer > 0) s.flashTimer = Math.max(0, s.flashTimer - dt);

      s.stripeOffset += s.speed;
      s.distance     += s.speed;

      // Time
      s.timeLeft = Math.max(0, GAME_SECS - (Date.now()-s.startTime)/1000);
      if (s.timeLeft <= 0) {
        s.alive = false;
        const { coins, playerNum, name } = s;
        stateRef.current = null;
        // Save score
        const updated = addScore(name, coins);
        setBoard(updated);
        if (playerNum === 1) {
          setP1Coins(coins);
          setPhase("done1");
        } else {
          setP2Coins(coins);
          setPhase("results");
        }
        return;
      }
      setLiveCoins(s.coins);
      setLiveTime(s.timeLeft);

      // Spawn
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0) {
        const diff = 1 + s.distance/4000;
        s.spawnTimer = Math.max(0.32, 1.1 - diff*0.09);
        const r = Math.random();
        if      (r < 0.30) s.objects.push(mkCoin(s.speed));
        else if (r < 0.50) s.objects.push(mkTraffic(s.speed));
        else if (r < 0.63) s.objects.push(mkOil(s.speed));
        else if (r < 0.79) s.objects.push(...mkCones(s.speed));
        else if (r < 0.89) s.objects.push(mkBoost(s.speed));
        else               s.objects.push(mkCoin(s.speed), mkCoin(s.speed));
      }

      // Update objects
      const alive = [];
      for (const o of s.objects) {
        o.y += o.speed + s.speed*0.7;
        if (o.y > CH+90) continue;
        const hit_x = Math.abs(s.x-o.x);
        const hit_y = Math.abs(s.y-o.y);

        if (o.type==="coin") {
          if (Math.hypot(s.x-o.x,s.y-o.y) < o.r+15) {
            s.coins++;
            s.popups.push({text:"+1 ★",x:o.x,y:o.y,life:1,col:C.gold}); continue;
          }
          drawCoin(ctx,o,t);
        } else if (o.type==="traffic") {
          if (hit_x < o.w/2+15 && hit_y < o.h/2+18) {
            s.flashTimer=0.45; s.flashColor="#FF3B30";
            s.coins = Math.max(0, s.coins-2);
            s.popups.push({text:"-2 ★",x:o.x,y:o.y,life:1,col:"#FF3B30"}); continue;
          }
          drawTraffic(ctx,o);
        } else if (o.type==="oil") {
          if (hit_x < o.w/2+12 && hit_y < o.h/2+12) {
            s.oilTimer=2.8; s.flashTimer=0.3; s.flashColor="#8B4513";
            s.popups.push({text:"🛢 Slipping!",x:o.x,y:o.y,life:1.3,col:"#FF6B00"}); continue;
          }
          drawOil(ctx,o);
        } else if (o.type==="cone") {
          if (hit_x < o.w/2+13 && hit_y < o.h/2+15) {
            s.flashTimer=0.3; s.flashColor="#FF6B00";
            s.coins = Math.max(0, s.coins-1);
            s.popups.push({text:"-1 ★",x:o.x,y:o.y,life:1,col:"#FF6B00"}); continue;
          }
          drawCone(ctx,o);
        } else if (o.type==="boost") {
          if (Math.hypot(s.x-o.x,s.y-o.y) < o.r+15) {
            s.boostTimer=3.2;
            s.popups.push({text:"⚡ BOOST!",x:o.x,y:o.y,life:1.3,col:"#00E5FF"}); continue;
          }
          drawBoost(ctx,o,t);
        }
        alive.push(o);
      }
      s.objects = alive;

      // Popups
      s.popups = s.popups.filter(p=>p.life>0);
      for (const p of s.popups) {
        ctx.save(); ctx.globalAlpha=Math.min(1,p.life*2);
        ctx.fillStyle=p.col; ctx.font="bold 20px 'Fredoka One','Comic Sans MS',cursive";
        ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(p.text,p.x,p.y);
        ctx.restore(); p.y-=1.8; p.life-=dt*1.3;
      }

      if (s.playerNum === 2) {
        drawHorse(ctx, s.x, s.y, s.spinAngle, t);
      } else {
        drawPlayerCar(ctx, s.x, s.y, s.color, s.spinAngle);
      }

      if (s.flashTimer>0) {
        ctx.save(); ctx.globalAlpha=s.flashTimer*0.65;
        ctx.fillStyle=s.flashColor; ctx.fillRect(0,58,CW,CH-58); ctx.restore();
      }

      drawHUD(ctx, s.name, s.color, s.timeLeft, s.coins, s.speed, boosted, oiled);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const currentP2Name = p2Name.trim() || "Player 2";
  const currentP1Name = p1Name.trim() || "Player 1";
  const winner = p1Coins > p2Coins ? 1 : p2Coins > p1Coins ? 2 : 0;

  // Canvas style: scales to fill window while keeping aspect ratio
  const canvasStyle = {
    display:"block",
    width:  canvasSize.w,
    height: canvasSize.h,
    imageRendering:"pixelated",
  };

  return (
    <div style={S.root}>
      {/* Always-present canvas */}
      <canvas ref={canvasRef} width={CW} height={CH} style={canvasStyle} />

      {/* ── Name Entry ── */}
      {phase==="names" && (
        <FullOverlay>
          <Modal>
            <div style={{fontSize:54,marginBottom:4}}>🚗⭐🐴</div>
            <h1 style={{color:C.gold,margin:"0 0 4px",fontSize:30,fontFamily:FF}}>Road Racer!</h1>
            <p style={{color:"#bbb",fontSize:13,margin:"0 0 18px",fontFamily:FF}}>
              Collect ★ stars in {GAME_SECS} seconds. Highest score wins!
            </p>

            <div style={S.nameRow}>
              <div style={S.nameBlock}>
                <label style={{...S.label,color:C.p1}}>🚗 Player 1 Name</label>
                <input
                  style={S.input}
                  placeholder="Enter name…"
                  maxLength={14}
                  value={p1Name}
                  onChange={e=>setP1Name(e.target.value)}
                  onKeyDown={e=>e.stopPropagation()}
                />
              </div>
              <div style={S.nameBlock}>
                <label style={{...S.label,color:C.p2}}>🐴 Player 2 Name</label>
                <input
                  style={S.input}
                  placeholder="Enter name…"
                  maxLength={14}
                  value={p2Name}
                  onChange={e=>setP2Name(e.target.value)}
                  onKeyDown={e=>e.stopPropagation()}
                />
              </div>
            </div>

            <div style={S.howToGrid}>
              <HowTo icon="⬆️⬇️" text="Speed up / slow down" />
              <HowTo icon="⬅️➡️" text="Steer between lanes" />
              <HowTo icon="★"    text="Collect stars  +1" col={C.gold} />
              <HowTo icon="⚡"   text="Grab boost pickups!" col="#00E5FF" />
              <HowTo icon="🚗"   text="Dodge traffic  -2★" col="#FF3B30" />
              <HowTo icon="🛢️"  text="Avoid oil slicks" col="#FF6B00" />
              <HowTo icon="🚧"   text="Dodge cones  -1★" col="#FF6B00" />
              <HowTo icon="🏆"   text="Most stars wins!" col={C.gold} />
            </div>

            <BtnRow>
              <Btn color="#22bb44" onClick={()=>startRace(1)}>
                🚗 {p1Name.trim()||"Player 1"} — Let's Go!
              </Btn>
              <Btn color="#555" onClick={()=>{ setBoard(loadBoard()); setPhase("board"); }}>
                🏆 Leaderboard
              </Btn>
            </BtnRow>
          </Modal>
        </FullOverlay>
      )}

      {/* ── Player 1 done ── */}
      {phase==="done1" && (
        <FullOverlay>
          <Modal>
            <div style={{fontSize:56}}>🎉</div>
            <h2 style={{color:C.p1,margin:"8px 0 2px",fontSize:26,fontFamily:FF}}>
              {currentP1Name} finished!
            </h2>
            <p style={{color:C.gold,fontSize:42,margin:"4px 0",fontWeight:"bold",fontFamily:FF}}>
              ★ {p1Coins}
            </p>
            <p style={{color:"#bbb",fontSize:14,margin:"0 0 20px",fontFamily:FF}}>
              Can {currentP2Name} beat that?
            </p>
            <Btn color={C.p2} onClick={()=>startRace(2)}>
              🐴 {currentP2Name} — Your Turn!
            </Btn>
          </Modal>
        </FullOverlay>
      )}

      {/* ── Results ── */}
      {phase==="results" && (
        <FullOverlay>
          <Modal wide>
            <div style={{fontSize:52}}>{winner===0?"🤝":"🏆"}</div>
            <h2 style={{color:C.gold,margin:"6px 0 14px",fontSize:26,fontFamily:FF}}>
              {winner===0 ? "It's a Tie! 🤯"
                : `${winner===1?currentP1Name:currentP2Name} Wins! 🎊`}
            </h2>

            {/* Score cards */}
            <div style={S.scoreCards}>
              <ScoreCard name={currentP1Name} coins={p1Coins} color={C.p1} won={winner===1} icon="🚗" />
              <ScoreCard name={currentP2Name} coins={p2Coins} color={C.p2} won={winner===2} icon="🐴" />
            </div>
            {winner!==0 &&
              <p style={{color:"#777",fontSize:12,margin:"4px 0 12px",fontFamily:FF}}>
                Difference: {Math.abs(p1Coins-p2Coins)} star{Math.abs(p1Coins-p2Coins)!==1?"s":""}
              </p>
            }

            {/* Mini leaderboard */}
            <h3 style={{color:C.gold,margin:"10px 0 6px",fontSize:16,fontFamily:FF}}>🏆 Top 10</h3>
            <MiniBoard board={board} highlight={[currentP1Name,currentP2Name]} />

            <BtnRow>
              <Btn color="#22bb44" onClick={()=>{
                setP1Coins(0); setP2Coins(0);
                setPhase("names");
              }}>🔄 Play Again</Btn>
              <Btn color="#555" onClick={()=>setPhase("board")}>📋 Full Board</Btn>
            </BtnRow>
          </Modal>
        </FullOverlay>
      )}

      {/* ── Full leaderboard ── */}
      {phase==="board" && (
        <FullOverlay>
          <Modal wide>
            <h2 style={{color:C.gold,margin:"0 0 14px",fontSize:26,fontFamily:FF}}>
              🏆 Top 10 Leaderboard
            </h2>
            <FullBoard board={board} />
            <BtnRow>
              <Btn color="#22bb44" onClick={()=>setPhase("names")}>🏎️ Play</Btn>
              <Btn color="#cc2222" onClick={()=>{
                if (window.confirm("Clear the entire leaderboard?")) {
                  saveBoard([]);
                  setBoard([]);
                }
              }}>🗑️ Clear</Btn>
            </BtnRow>
          </Modal>
        </FullOverlay>
      )}
    </div>
  );
}

/* ── Font shorthand ──────────────────────────────────────────────────────────── */
const FF = "'Fredoka One','Comic Sans MS','Chalkboard SE',cursive";

/* ── Sub-components ─────────────────────────────────────────────────────────── */
function FullOverlay({children}) {
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:50,
      display:"flex",alignItems:"center",justifyContent:"center",
      background:"rgba(4,4,20,0.88)",
      backdropFilter:"blur(4px)",
    }}>{children}</div>
  );
}

function Modal({children,wide}) {
  return (
    <div style={{
      background:"linear-gradient(160deg,#0d0d28,#181840)",
      borderRadius:22,padding:"28px 32px",textAlign:"center",
      border:"2.5px solid #FFD700",
      boxShadow:"0 20px 60px rgba(0,0,0,0.9), 0 0 40px rgba(255,215,0,0.12)",
      width: wide ? "min(94vw,520px)" : "min(92vw,400px)",
      maxHeight:"92vh",overflowY:"auto",
      fontFamily:FF,
    }}>{children}</div>
  );
}

function Btn({children,color,onClick}) {
  return (
    <button onClick={onClick} style={{
      background:color,color:"#fff",border:"none",
      padding:"12px 24px",borderRadius:11,fontSize:15,
      fontWeight:"bold",cursor:"pointer",
      boxShadow:`0 4px 18px ${color}88`,
      fontFamily:FF,
      transition:"transform .1s",
    }}
    onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"}
    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
    >{children}</button>
  );
}

function BtnRow({children}) {
  return <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:14,flexWrap:"wrap"}}>{children}</div>;
}

function HowTo({icon,text,col="#ccc"}) {
  return (
    <div style={{
      display:"flex",alignItems:"center",gap:8,
      background:"rgba(255,255,255,0.06)",borderRadius:8,
      padding:"6px 10px",fontSize:12,color:col,
    }}>
      <span style={{fontSize:16}}>{icon}</span>{text}
    </div>
  );
}

function ScoreCard({name,coins,color,won,icon="🚗"}) {
  return (
    <div style={{
      flex:1,background:won?"rgba(255,215,0,0.1)":"rgba(255,255,255,0.05)",
      border:`2px solid ${won?C.gold:color}`,borderRadius:12,
      padding:"12px 10px",position:"relative",
    }}>
      {won && <div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",fontSize:22}}>🏆</div>}
      <div style={{color,fontSize:15,fontWeight:"bold",fontFamily:FF,marginTop:won?8:0}}>{icon} {name}</div>
      <div style={{color:C.gold,fontSize:30,fontWeight:"bold",fontFamily:FF}}>★ {coins}</div>
    </div>
  );
}

function MiniBoard({board,highlight}) {
  if (!board.length) return <p style={{color:"#555",fontSize:13}}>No scores yet!</p>;
  return (
    <div style={{width:"100%",maxHeight:160,overflowY:"auto",marginBottom:4}}>
      {board.map((e,i)=>{
        const isHighlight = highlight.includes(e.name);
        return (
          <div key={i} style={{
            display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"5px 10px",borderRadius:8,marginBottom:3,
            background: i===0 ? "rgba(255,215,0,0.15)" : isHighlight ? "rgba(0,229,255,0.1)" : "rgba(255,255,255,0.04)",
            border: isHighlight ? "1px solid rgba(0,229,255,0.4)" : "1px solid transparent",
          }}>
            <span style={{color: i===0?"#FFD700": i===1?"#C0C0C0": i===2?"#CD7F32":"#888", fontSize:13, fontFamily:FF}}>
              {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
            </span>
            <span style={{color:"#ddd",fontSize:13,flex:1,textAlign:"left",marginLeft:10,fontFamily:FF}}>{e.name}</span>
            <span style={{color:C.gold,fontWeight:"bold",fontSize:14,fontFamily:FF}}>★ {e.coins}</span>
          </div>
        );
      })}
    </div>
  );
}

function FullBoard({board}) {
  if (!board.length) return (
    <p style={{color:"#555",fontSize:14,fontFamily:FF,margin:"20px 0"}}>
      No scores yet — play a game first!
    </p>
  );
  return (
    <div style={{width:"100%"}}>
      <div style={{display:"grid",gridTemplateColumns:"40px 1fr 80px 90px",
        gap:4,padding:"0 6px 8px",borderBottom:"1px solid rgba(255,215,0,0.2)"}}>
        {["Rank","Name","Stars","Date"].map(h=>(
          <span key={h} style={{color:"#FFD700",fontSize:12,fontWeight:"bold",fontFamily:FF,textAlign:h==="Stars"||h==="Rank"?"center":"left"}}>{h}</span>
        ))}
      </div>
      {board.map((e,i)=>(
        <div key={i} style={{
          display:"grid",gridTemplateColumns:"40px 1fr 80px 90px",gap:4,
          padding:"8px 6px",borderRadius:9,marginTop:4,
          background: i===0?"rgba(255,215,0,0.14)": i===1?"rgba(192,192,192,0.08)": i===2?"rgba(205,127,50,0.08)":"rgba(255,255,255,0.04)",
          border:`1px solid ${i<3?"rgba(255,215,0,0.2)":"transparent"}`,
        }}>
          <span style={{color: i===0?"#FFD700": i===1?"#C0C0C0": i===2?"#CD7F32":"#666",
            textAlign:"center",fontSize:16,fontFamily:FF}}>
            {i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`}
          </span>
          <span style={{color:"#eee",fontSize:14,fontFamily:FF,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name}</span>
          <span style={{color:C.gold,fontWeight:"bold",fontSize:15,textAlign:"center",fontFamily:FF}}>★ {e.coins}</span>
          <span style={{color:"#666",fontSize:11,textAlign:"right",fontFamily:FF,alignSelf:"center"}}>{e.date}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────────── */
const S = {
  root:{
    width:"100vw",height:"100vh",overflow:"hidden",
    display:"flex",alignItems:"center",justifyContent:"center",
    background:"#050510",
  },
  nameRow:{ display:"flex",gap:16,marginBottom:14,flexWrap:"wrap",justifyContent:"center" },
  nameBlock:{ display:"flex",flexDirection:"column",gap:5,minWidth:150 },
  label:{ fontSize:13,fontWeight:"bold",textAlign:"left",fontFamily:FF },
  input:{
    padding:"9px 13px",borderRadius:9,border:"2px solid rgba(255,255,255,0.2)",
    background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:15,
    fontFamily:FF,outline:"none",
    transition:"border-color .2s",
  },
  howToGrid:{
    display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,
    margin:"0 0 16px",textAlign:"left",
  },
  scoreCards:{ display:"flex",gap:12,margin:"0 0 6px",justifyContent:"center" },
};
