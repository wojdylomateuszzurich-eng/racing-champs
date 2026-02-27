import { useState, useEffect, useRef, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════════════════════
   ROAD RACER
   P1 = LEGO City — modular buildings, baddie chases
   P2 = Horse Racing Track — hurdles, mud, rivals, carrots
══════════════════════════════════════════════════════════════════════════════ */

const CW = 480, CH = 700;
const ROAD_LEFT = 72, ROAD_RIGHT = 408;
const ROAD_W = ROAD_RIGHT - ROAD_LEFT;
const NUM_LANES = 4;
const LANE_W = ROAD_W / NUM_LANES;
const GAME_SECS = 45;
const SCROLL_BASE = 4.5;
const LS_KEY = "roadracer_lb_v3";
const FF = "'Fredoka One','Comic Sans MS','Chalkboard SE',cursive";

const DIFF = {
  easy:   { label:"🌟 Easy",   col:"#22bb44", scroll:0.70, spawn:1.6, coinW:0.45, obstW:0.30 },
  medium: { label:"⚡ Medium", col:"#FF9500", scroll:1.00, spawn:1.0, coinW:0.32, obstW:0.50 },
  hard:   { label:"🔥 Hard",   col:"#FF3B30", scroll:1.35, spawn:0.6, coinW:0.22, obstW:0.65 },
};

const C = {
  p1:"#E3000B", p2:"#007AFF",
  road:"#3D3D3D", sidewalk:"#AAAAAA",
  turf:"#4db34d", dirt:"#8B6914",
  sky:"#4FC3F7", legoYellow:"#FFCC00",
  gold:"#FFD700", boost:"#00E5FF",
};

// ── LEGO building palette ─────────────────────────────────────────────────────
const LEGO_BLDG = [
  { wall:"#E3000B", accent:"#AA0000", roof:"#FFCC00", trim:"#fff",    name:"Bakery"      },
  { wall:"#006CB7", accent:"#004A80", roof:"#E3000B", trim:"#fff",    name:"Apartment"   },
  { wall:"#FFCC00", accent:"#CC9900", roof:"#006CB7", trim:"#E3000B", name:"Corner Shop" },
  { wall:"#00852B", accent:"#005918", roof:"#FFCC00", trim:"#fff",    name:"Library"     },
  { wall:"#FF6E00", accent:"#CC4400", roof:"#E3000B", trim:"#fff",    name:"Fire Station"},
  { wall:"#EEEECC", accent:"#AAAAAA", roof:"#006CB7", trim:"#E3000B", name:"Hotel"       },
  { wall:"#9B59B6", accent:"#6C3483", roof:"#FFCC00", trim:"#fff",    name:"Toy Store"   },
  { wall:"#1B4F72", accent:"#0E2F44", roof:"#E3000B", trim:"#FFCC00", name:"Police"      },
];

// ─── Leaderboard ──────────────────────────────────────────────────────────────
function loadBoard() { try { return JSON.parse(localStorage.getItem(LS_KEY)||"[]"); } catch { return []; } }
function saveBoard(b) { localStorage.setItem(LS_KEY, JSON.stringify(b)); }
function addScore(name, coins, diff, isHorse) {
  const b = loadBoard();
  b.push({ name:name||"Anon", coins, diff, horse:isHorse, date:new Date().toLocaleDateString() });
  b.sort((a,b)=>b.coins-a.coins);
  const top=b.slice(0,10); saveBoard(top); return top;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function laneX(l) { return ROAD_LEFT + l*LANE_W + LANE_W/2; }
function dk(hex,amt) {
  const n=parseInt(hex.replace("#",""),16);
  return `rgb(${Math.max(0,(n>>16)-amt)},${Math.max(0,((n>>8)&255)-amt)},${Math.max(0,(n&255)-amt)})`;
}
function lk(hex,amt) { // lighten
  const n=parseInt(hex.replace("#",""),16);
  return `rgb(${Math.min(255,(n>>16)+amt)},${Math.min(255,((n>>8)&255)+amt)},${Math.min(255,(n&255)+amt)})`;
}
// Deterministic hash for building slot
function bldgIdx(slot) { return ((slot*2654435761)>>>0) % LEGO_BLDG.length; }

// ─── P1 object factories ──────────────────────────────────────────────────────
const TC = ["#E3000B","#006CB7","#FFCC00","#00852B","#FF6E00","#9B59B6","#1abc9c"];
function mkLegoTraffic(spd) {
  return { type:"traffic", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-70,
    w:34, h:58, speed:spd*(0.5+Math.random()*0.8),
    color:TC[Math.floor(Math.random()*TC.length)], id:Math.random() };
}
function mkCoin(spd) {
  return { type:"coin", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-20,
    r:13, speed:spd*0.45, id:Math.random(), wobble:Math.random()*Math.PI*2 };
}
function mkOil(spd) {
  return { type:"oil", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-35,
    w:52, h:30, speed:spd*0.45, id:Math.random() };
}
function mkCones(spd) {
  const sl=Math.floor(Math.random()*(NUM_LANES-1));
  return [
    { type:"cone", x:laneX(sl),   y:-35, w:22, h:36, speed:spd*0.45, id:Math.random() },
    { type:"cone", x:laneX(sl+1), y:-35, w:22, h:36, speed:spd*0.45, id:Math.random()+1 },
  ];
}
function mkBoost(spd) {
  return { type:"boost", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-22, r:18, speed:spd*0.45, id:Math.random() };
}
// Baddie: spawns from BELOW and chases upward toward player
function mkBaddie() {
  const lane = Math.floor(Math.random()*NUM_LANES);
  return { type:"baddie", x:laneX(lane), y:CH+80, w:36, h:62,
    chasing:true, gainRate:3.5+Math.random()*1.5, id:Math.random(),
    sirenPhase:Math.random()*Math.PI*2 };
}

// ─── P2 horse factories ───────────────────────────────────────────────────────
function mkHurdle(spd) {
  return { type:"hurdle", gap:Math.floor(Math.random()*NUM_LANES), y:-30, h:28, speed:spd*0.45, id:Math.random() };
}
function mkMud(spd) {
  return { type:"mud", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-35, w:58, h:34, speed:spd*0.45, id:Math.random() };
}
function mkRivalHorse(spd) {
  const hColors=["#8B0000","#2F4F4F","#4B0082","#006400","#8B4513"];
  return { type:"rival", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-80,
    w:38, h:70, speed:spd*(0.5+Math.random()*0.7),
    color:hColors[Math.floor(Math.random()*hColors.length)], id:Math.random() };
}
function mkHayBales(spd) {
  const sl=Math.floor(Math.random()*(NUM_LANES-1));
  return [
    { type:"hay", x:laneX(sl),   y:-32, w:30, h:28, speed:spd*0.45, id:Math.random() },
    { type:"hay", x:laneX(sl+1), y:-32, w:30, h:28, speed:spd*0.45, id:Math.random()+1 },
  ];
}
function mkCarrot(spd) {
  return { type:"carrot", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-22, r:16, speed:spd*0.45, id:Math.random() };
}
function mkHorseCoin(spd) {
  return { type:"coin", x:laneX(Math.floor(Math.random()*NUM_LANES)), y:-20,
    r:13, speed:spd*0.45, id:Math.random(), wobble:Math.random()*Math.PI*2 };
}

// ══════════════════════════════════════════════════════════════════════════════
//  DRAW — LEGO CITY BACKGROUND (P1)
// ══════════════════════════════════════════════════════════════════════════════

// Draw a single LEGO stud
function drawStud(ctx, x, y, r=4) {
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,0.25)";
  ctx.beginPath(); ctx.arc(x-r*0.3,y-r*0.3,r*0.4,0,Math.PI*2); ctx.fill();
}

// Draw one LEGO modular building front
function drawLegoBuilding(ctx, x, y, w, h, slot) {
  const b = LEGO_BLDG[bldgIdx(slot)];

  // ── Main wall ──
  ctx.fillStyle = b.wall;
  ctx.fillRect(x, y, w, h);

  // ── Brick texture (horizontal lines every 8px) ──
  ctx.strokeStyle = "rgba(0,0,0,0.13)"; ctx.lineWidth=1;
  for (let ly=y+8; ly<y+h; ly+=8) {
    ctx.beginPath(); ctx.moveTo(x,ly); ctx.lineTo(x+w,ly); ctx.stroke();
  }
  // Vertical brick offsets alternating
  for (let ly=y+4; ly<y+h; ly+=16) {
    ctx.beginPath(); ctx.moveTo(x+w/2,ly); ctx.lineTo(x+w/2,ly+8); ctx.stroke();
  }

  // ── Roof band ──
  const roofH = 10;
  ctx.fillStyle = b.roof;
  ctx.fillRect(x, y, w, roofH);
  // Studs on roof (top 10px band)
  ctx.fillStyle = dk(b.roof, 20);
  const studSpacing = w / 4;
  for (let sx=x+studSpacing/2; sx<x+w; sx+=studSpacing) {
    drawStud(ctx, sx, y+roofH/2, 3.5);
  }

  // ── Floors ── (3 floors fitting in h)
  const floorH = (h - roofH - 18) / 3; // 18px = ground floor extra
  for (let fl=0; fl<3; fl++) {
    const fy = y + roofH + fl*floorH;
    // Two windows per floor
    const winW=Math.floor(w*0.28), winH=Math.floor(floorH*0.55);
    const winY=fy+Math.floor(floorH*0.2);
    [[x+4,winY],[x+w-4-winW,winY]].forEach(([wx,wy])=>{
      // Window frame
      ctx.fillStyle=b.accent;
      ctx.fillRect(wx-2,wy-2,winW+4,winH+4);
      // Glass
      ctx.fillStyle="#A8D8F0";
      ctx.fillRect(wx,wy,winW,winH);
      // Reflection
      ctx.fillStyle="rgba(255,255,255,0.45)";
      ctx.fillRect(wx+2,wy+2,winW/2-2,winH/2-2);
      // Sill
      ctx.fillStyle=b.trim;
      ctx.fillRect(wx-2,wy+winH+2,winW+4,3);
    });
  }

  // ── Ground floor: door / shop front ──
  const gfY = y + roofH + 3*floorH;
  ctx.fillStyle = b.accent;
  ctx.fillRect(x, gfY, w, h-(gfY-y));
  // Door or shopfront
  const doorW = Math.floor(w*0.38), doorH = Math.floor((h-(gfY-y))*0.75);
  const doorX = x + Math.floor((w-doorW)/2);
  const doorY = y+h-doorH;
  ctx.fillStyle="#2C1810";
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle="#A8D8F0";
  ctx.fillRect(doorX+2, doorY+2, doorW-4, doorH-2);
  // Door handle
  ctx.fillStyle="#FFCC00";
  ctx.beginPath(); ctx.arc(doorX+doorW-5, doorY+doorH/2, 2.5, 0, Math.PI*2); ctx.fill();
  // Sign / awning
  const awnH=7;
  ctx.fillStyle = b.roof;
  ctx.fillRect(x, gfY, w, awnH);
  // Building name (tiny)
  ctx.fillStyle="#fff"; ctx.font=`bold ${Math.min(7,w/5)}px Arial`;
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText(b.name, x+w/2, gfY+awnH/2);

  // ── Outline (LEGO plate border) ──
  ctx.strokeStyle="rgba(0,0,0,0.35)"; ctx.lineWidth=1.5;
  ctx.strokeRect(x+0.75, y+0.75, w-1.5, h-1.5);
}

// Streetlamp (LEGO style)
function drawLegoLamp(ctx, x, y) {
  ctx.fillStyle="#3D3D3D";
  ctx.fillRect(x-2, y, 4, 38); // pole
  ctx.fillStyle="#FFCC00";
  ctx.beginPath(); ctx.roundRect(x-10, y-8, 20, 10, 3); ctx.fill();
  ctx.fillStyle="rgba(255,220,100,0.6)";
  ctx.beginPath(); ctx.arc(x, y-3, 9, 0, Math.PI*2); ctx.fill();
}

// LEGO-style sidewalk tile grid
function drawSidewalk(ctx, x, y, w, h, offset) {
  ctx.fillStyle="#CCCCCC";
  ctx.fillRect(x,y,w,h);
  // tile lines
  ctx.strokeStyle="rgba(0,0,0,0.12)"; ctx.lineWidth=1;
  const tileSize=16;
  for (let tx=x; tx<x+w; tx+=tileSize) {
    ctx.beginPath(); ctx.moveTo(tx,y); ctx.lineTo(tx,y+h); ctx.stroke();
  }
  for (let ty=(y+offset%tileSize)-tileSize; ty<y+h; ty+=tileSize) {
    ctx.beginPath(); ctx.moveTo(x,ty); ctx.lineTo(x+w,ty); ctx.stroke();
  }
}

function drawLegoCity(ctx, offset) {
  // ── Sky (LEGO bright blue) ──
  const skyG = ctx.createLinearGradient(0,0,0,80);
  skyG.addColorStop(0,"#1976D2"); skyG.addColorStop(1,"#4FC3F7");
  ctx.fillStyle=skyG; ctx.fillRect(0,0,CW,80);

  // LEGO-style clouds (flat, blocky)
  drawLegoCloud(ctx,40,28); drawLegoCloud(ctx,200,20); drawLegoCloud(ctx,390,35);

  // ── Sidewalks ──
  drawSidewalk(ctx, 0,         80, ROAD_LEFT,       CH-80, offset);
  drawSidewalk(ctx, ROAD_RIGHT,80, CW-ROAD_RIGHT,   CH-80, offset);

  // ── Buildings (scrolling) ──
  const BLDG_H = 148;
  const numSlots = Math.ceil(CH/BLDG_H)+2;
  const startSlot = Math.floor(offset/BLDG_H);
  const slotOff = offset % BLDG_H;
  const BLDG_W = ROAD_LEFT - 4; // 68px
  for (let i=0; i<numSlots; i++) {
    const slot = startSlot + i;
    const by = 80 + i*BLDG_H - slotOff;
    drawLegoBuilding(ctx, 1,          by, BLDG_W, BLDG_H-4, slot);
    drawLegoBuilding(ctx, ROAD_RIGHT+3, by, BLDG_W, BLDG_H-4, slot+5);
  }

  // ── Streetlamps (alternating sides, scrolling) ──
  const LAMP_SPACING = 160;
  for (let ly=(80+offset%LAMP_SPACING)-LAMP_SPACING; ly<CH+LAMP_SPACING; ly+=LAMP_SPACING) {
    drawLegoLamp(ctx, ROAD_LEFT-8,  ly);
    drawLegoLamp(ctx, ROAD_RIGHT+8, ly+LAMP_SPACING/2);
  }

  // ── Road surface ──
  ctx.fillStyle="#3D3D3D";
  ctx.fillRect(ROAD_LEFT,0,ROAD_W,CH);

  // Road texture (subtle)
  ctx.strokeStyle="rgba(255,255,255,0.04)"; ctx.lineWidth=1;
  for (let ty=(offset%30)-30; ty<CH; ty+=30) {
    ctx.beginPath(); ctx.moveTo(ROAD_LEFT,ty); ctx.lineTo(ROAD_RIGHT,ty); ctx.stroke();
  }

  // Road edge lines (thick white LEGO style)
  ctx.fillStyle="#fff";
  ctx.fillRect(ROAD_LEFT,0,6,CH); ctx.fillRect(ROAD_RIGHT-6,0,6,CH);

  // Yellow center dashes (LEGO yellow)
  const dashH=44, gapH=26, dashTot=dashH+gapH;
  ctx.fillStyle="#FFCC00";
  for (let lane=1;lane<NUM_LANES;lane++) {
    const lx=ROAD_LEFT+lane*LANE_W;
    for (let ty=(offset%dashTot)-dashTot; ty<CH+dashTot; ty+=dashTot)
      ctx.fillRect(lx-2,ty,4,dashH);
  }

  // Crosswalk stripes (every ~300px of road offset)
  const cwOff = offset % 300;
  const cwY = -cwOff + 300;
  if (cwY > -40 && cwY < CH+40) {
    ctx.fillStyle="rgba(255,255,255,0.85)";
    for (let stripe=0; stripe<8; stripe++)
      ctx.fillRect(ROAD_LEFT+6+stripe*(ROAD_W-12)/8, cwY-8, (ROAD_W-12)/8-3, 16);
  }
}

function drawLegoCloud(ctx, x, y) {
  // Blocky LEGO cloud
  ctx.fillStyle="rgba(255,255,255,0.92)";
  [[0,0,22,14],[20,-4,28,18],[-14,-2,20,14],[16,10,26,12],[-4,10,24,12]].forEach(([ox,oy,w,h])=>{
    ctx.fillRect(x+ox,y+oy,w,h);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  DRAW — HORSE TRACK (P2)  — unchanged from before
// ══════════════════════════════════════════════════════════════════════════════
function drawHorseTrack(ctx, offset) {
  const skyG=ctx.createLinearGradient(0,0,0,CH*0.2);
  skyG.addColorStop(0,"#5ba8d4"); skyG.addColorStop(1,"#87CEEB");
  ctx.fillStyle=skyG; ctx.fillRect(0,0,CW,CH*0.2);
  drawCloud(ctx,60,30); drawCloud(ctx,260,20); drawCloud(ctx,420,40);
  ctx.fillStyle="rgba(80,40,20,0.35)"; ctx.fillRect(0,CH*0.2,CW,30);
  for (let cx=10;cx<CW;cx+=14) {
    ctx.fillStyle=`hsl(${(cx*13)%360},50%,55%)`;
    ctx.beginPath(); ctx.arc(cx, CH*0.2+8+Math.sin(cx*0.7)*3, 5, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle=C.turf; ctx.fillRect(0,CH*0.2,CW,CH);
  for (let y=(offset%80)-80;y<CH;y+=80) {
    ctx.fillStyle="rgba(0,0,0,0.04)"; ctx.fillRect(ROAD_LEFT,y,ROAD_W,40);
  }
  const dirtG=ctx.createLinearGradient(ROAD_LEFT,0,ROAD_RIGHT,0);
  dirtG.addColorStop(0,"#7a5510"); dirtG.addColorStop(0.5,"#9b6a18"); dirtG.addColorStop(1,"#7a5510");
  ctx.fillStyle=dirtG; ctx.fillRect(ROAD_LEFT,0,ROAD_W,CH);
  ctx.strokeStyle="rgba(0,0,0,0.08)"; ctx.lineWidth=1;
  for (let y=(offset%20)-20;y<CH;y+=20) {
    ctx.beginPath(); ctx.moveTo(ROAD_LEFT,y); ctx.lineTo(ROAD_RIGHT,y); ctx.stroke();
  }
  drawFence(ctx,ROAD_LEFT-14,offset); drawFence(ctx,ROAD_RIGHT+4,offset);
  ctx.fillStyle="rgba(255,255,255,0.6)";
  ctx.fillRect(ROAD_LEFT,0,5,CH); ctx.fillRect(ROAD_RIGHT-5,0,5,CH);
  ctx.strokeStyle="rgba(255,255,255,0.12)"; ctx.lineWidth=1; ctx.setLineDash([20,30]);
  for (let lane=1;lane<NUM_LANES;lane++) {
    const lx=ROAD_LEFT+lane*LANE_W;
    ctx.beginPath(); ctx.moveTo(lx,0); ctx.lineTo(lx,CH); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (let i=0;i<6;i++) {
    drawFlower(ctx,20+i*7,200+i*80); drawFlower(ctx,445+i*4,240+i*75);
  }
}
function drawFence(ctx,x,offset) {
  ctx.fillStyle="#f0ede0"; ctx.fillRect(x,0,10,CH);
  for (let y=(offset%80)-80;y<CH+80;y+=80) { ctx.fillStyle="#c8c4b0"; ctx.fillRect(x-2,y,14,8); }
}
function drawCloud(ctx,x,y) {
  ctx.fillStyle="rgba(255,255,255,0.88)";
  [[-18,0,18],[0,0,22],[18,0,18],[-10,-10,14],[10,-10,14]].forEach(([ox,oy,r])=>{
    ctx.beginPath(); ctx.arc(x+ox,y+oy,r,0,Math.PI*2); ctx.fill();
  });
}
function drawFlower(ctx,x,y) {
  [[0,-6],[4,-4],[6,0],[4,4],[0,6],[-4,4],[-6,0],[-4,-4]].forEach(([px,py])=>{
    ctx.fillStyle="#FFD700"; ctx.beginPath(); ctx.arc(x+px,y+py,3,0,Math.PI*2); ctx.fill();
  });
  ctx.fillStyle="#FF6B35"; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
}

// ══════════════════════════════════════════════════════════════════════════════
//  DRAW — LEGO PLAYER CAR (P1)
// ══════════════════════════════════════════════════════════════════════════════
function drawLegoPlayerCar(ctx, x, y, spin) {
  ctx.save(); ctx.translate(x,y); if(spin) ctx.rotate(spin);

  // Shadow
  ctx.fillStyle="rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(2,8,18,10,0,0,Math.PI*2); ctx.fill();

  // ── BODY (very boxy LEGO shape) ──
  const col="#E3000B";
  ctx.fillStyle=col;
  ctx.beginPath(); ctx.roundRect(-18,-32,36,60,3); ctx.fill();

  // Body shading (darker bottom half)
  ctx.fillStyle=dk(col,25);
  ctx.beginPath(); ctx.roundRect(-18,10,36,18,3); ctx.fill();

  // Front hood studs (LEGO stud row on bonnet)
  ctx.fillStyle=dk(col,15);
  ctx.fillRect(-16,-32,32,12); // hood plate
  ctx.fillStyle=lk(col,20);
  for (let sx=-12; sx<=12; sx+=8) {
    ctx.beginPath(); ctx.arc(sx,-27,3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.3)";
    ctx.beginPath(); ctx.arc(sx-1,-28,1.2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=lk(col,20);
  }

  // ── CABIN ──
  ctx.fillStyle="#FFCC00"; // bright yellow cabin
  ctx.beginPath(); ctx.roundRect(-13,-24,26,28,3); ctx.fill();
  // Cabin shading
  ctx.fillStyle=dk("#FFCC00",18);
  ctx.fillRect(-13,4,26,5);

  // Windscreen (front)
  ctx.fillStyle="#B8E6FF";
  ctx.beginPath(); ctx.roundRect(-10,-22,20,14,2); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,0.5)";
  ctx.beginPath(); ctx.roundRect(-9,-21,9,6,1); ctx.fill();

  // Rear window
  ctx.fillStyle="#B8E6FF";
  ctx.beginPath(); ctx.roundRect(-8,8,16,10,2); ctx.fill();

  // ── HEADLIGHTS (square, very LEGO) ──
  ctx.fillStyle="#FFF176";
  ctx.fillRect(-17,-32,8,5); ctx.fillRect(9,-32,8,5);
  ctx.fillStyle="rgba(255,255,200,0.8)";
  ctx.beginPath(); ctx.arc(-13,-32,5,Math.PI,2*Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc(13,-32,5,Math.PI,2*Math.PI); ctx.fill();

  // ── TAIL LIGHTS ──
  ctx.fillStyle="#FF1111";
  ctx.fillRect(-17,27,8,4); ctx.fillRect(9,27,8,4);

  // ── WHEELS (LEGO wheels: thick, black, round) ──
  const wheels=[[-22,-18],[ 12,-18],[-22,12],[ 12,12]];
  wheels.forEach(([wx,wy])=>{
    ctx.fillStyle="#1B1B1B";
    ctx.beginPath(); ctx.roundRect(wx,wy,10,18,4); ctx.fill();
    // Hubcap
    ctx.fillStyle="#888";
    ctx.beginPath(); ctx.arc(wx+5,wy+9,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#CCC";
    ctx.beginPath(); ctx.arc(wx+5,wy+9,1.8,0,Math.PI*2); ctx.fill();
  });

  // ── Roof studs (2×2 on roof plate) ──
  ctx.fillStyle="#CC0000";
  ctx.fillRect(-10,-28,20,6); // roof plate
  ctx.fillStyle=lk("#E3000B",30);
  [[-6,-25],[0,-25],[6,-25]].forEach(([sx,sy])=>{
    ctx.beginPath(); ctx.arc(sx,sy,3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.arc(sx-1,sy-1,1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=lk("#E3000B",30);
  });

  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════
//  DRAW — LEGO TRAFFIC CAR
// ══════════════════════════════════════════════════════════════════════════════
function drawLegoTraffic(ctx, o) {
  ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(Math.PI); // facing down

  ctx.fillStyle="rgba(0,0,0,0.18)";
  ctx.beginPath(); ctx.ellipse(1,5,16,9,0,0,Math.PI*2); ctx.fill();

  // Body
  ctx.fillStyle=o.color;
  ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.fill();
  ctx.fillStyle=dk(o.color,20);
  ctx.fillRect(-o.w/2, o.h/4, o.w, o.h/4);

  // Cabin
  ctx.fillStyle="#FFCC00";
  ctx.beginPath(); ctx.roundRect(-o.w/2+3,-o.h/4,o.w-6,o.h*0.45,3); ctx.fill();
  ctx.fillStyle="#B8E6FF";
  ctx.beginPath(); ctx.roundRect(-o.w/2+5,-o.h/4+2,o.w-10,o.h*0.28,2); ctx.fill();

  // Headlights
  ctx.fillStyle="#FFF176";
  ctx.fillRect(-o.w/2+1, o.h/2-6, 7, 4); ctx.fillRect(o.w/2-8, o.h/2-6, 7, 4);

  // Wheels
  [[-o.w/2-3,-o.h/2+3],[ o.w/2-5,-o.h/2+3],
   [-o.w/2-3, o.h/4-2],[ o.w/2-5, o.h/4-2]].forEach(([wx,wy])=>{
    ctx.fillStyle="#1B1B1B"; ctx.beginPath(); ctx.roundRect(wx,wy,8,16,3); ctx.fill();
    ctx.fillStyle="#666"; ctx.beginPath(); ctx.arc(wx+4,wy+8,3,0,Math.PI*2); ctx.fill();
  });

  // Studs on bonnet
  ctx.fillStyle=lk(o.color,25);
  [-6,0,6].forEach(sx=>{
    ctx.beginPath(); ctx.arc(sx,-o.h/2+5,3,0,Math.PI*2); ctx.fill();
  });

  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════
//  DRAW — BADDIE CAR (chases from below)
// ══════════════════════════════════════════════════════════════════════════════
function drawBaddie(ctx, o, t) {
  ctx.save(); ctx.translate(o.x,o.y);
  // Baddie faces UP (toward player) — no rotation needed

  const siren = Math.sin(t*12 + o.sirenPhase);
  const sirenCol = siren>0 ? "#FF2200" : "#FF8800";

  // Shadow
  ctx.fillStyle="rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(2,10,18,10,0,0,Math.PI*2); ctx.fill();

  // ── LEGO black body ──
  ctx.fillStyle="#1B1B1B";
  ctx.beginPath(); ctx.roundRect(-18,-31,36,62,3); ctx.fill();
  // Dark gray mid-section
  ctx.fillStyle="#2D2D2D";
  ctx.beginPath(); ctx.roundRect(-18,12,36,18,3); ctx.fill();

  // ── Menacing grille (front, which is top since facing player) ──
  ctx.fillStyle="#111";
  ctx.fillRect(-14,-31,28,11);
  // Angry eyes (headlights)
  ctx.fillStyle=sirenCol;
  ctx.beginPath(); ctx.roundRect(-14,-31,11,8,2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(3,-31,11,8,2); ctx.fill();
  // Pupil slash (angry eyebrow effect)
  ctx.strokeStyle="#000"; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(-13,-31); ctx.lineTo(-4,-25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(13,-31); ctx.lineTo(4,-25); ctx.stroke();
  // Grille teeth
  ctx.fillStyle="#333";
  for (let gx=-12; gx<13; gx+=5) {
    ctx.fillRect(gx,-22,3,5);
  }

  // ── Villain cabin ──
  ctx.fillStyle="#222";
  ctx.beginPath(); ctx.roundRect(-13,-20,26,28,3); ctx.fill();
  // Tinted windows (dark purple tint — villain vibes)
  ctx.fillStyle="rgba(60,0,80,0.85)";
  ctx.beginPath(); ctx.roundRect(-11,-18,22,14,2); ctx.fill();
  ctx.fillStyle="rgba(100,0,140,0.5)";
  ctx.beginPath(); ctx.roundRect(-10,-17,10,6,1); ctx.fill();
  ctx.fillStyle="rgba(60,0,80,0.85)";
  ctx.beginPath(); ctx.roundRect(-9,10,18,9,2); ctx.fill();

  // ── Siren light bar on roof ──
  ctx.fillStyle="#222";
  ctx.beginPath(); ctx.roundRect(-14,-30,28,7,3); ctx.fill();
  ctx.fillStyle=siren>0?"#FF2200":"rgba(100,0,0,0.4)";
  ctx.beginPath(); ctx.roundRect(-13,-29,12,5,2); ctx.fill();
  ctx.fillStyle=siren<0?"#FF8800":"rgba(100,50,0,0.4)";
  ctx.beginPath(); ctx.roundRect(1,-29,12,5,2); ctx.fill();
  // Siren glow
  if (Math.abs(siren)>0.5) {
    ctx.save(); ctx.globalAlpha=Math.abs(siren)*0.4;
    ctx.fillStyle=sirenCol;
    ctx.beginPath(); ctx.arc(o.x>CW/2?-8:8,-27,18,0,Math.PI*2);
    ctx.fill(); ctx.restore();
  }

  // ── Tail (at bottom, pointing away from player) ──
  ctx.fillStyle="#FF1111";
  ctx.fillRect(-14,30,10,4); ctx.fillRect(4,30,10,4);

  // ── WHEELS ──
  [[-22,-18],[12,-18],[-22,12],[12,12]].forEach(([wx,wy])=>{
    ctx.fillStyle="#111";
    ctx.beginPath(); ctx.roundRect(wx,wy,10,18,4); ctx.fill();
    ctx.fillStyle="#444";
    ctx.beginPath(); ctx.arc(wx+5,wy+9,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#222";
    ctx.beginPath(); ctx.arc(wx+5,wy+9,2,0,Math.PI*2); ctx.fill();
  });

  // ── Spoiler ──
  ctx.fillStyle="#333";
  ctx.beginPath(); ctx.roundRect(-16,29,32,5,2); ctx.fill();
  ctx.fillStyle="#444";
  ctx.fillRect(-12,24,4,7); ctx.fillRect(8,24,4,7);

  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════
//  DRAW — HORSE (P2 player)
// ══════════════════════════════════════════════════════════════════════════════
function drawHorse(ctx, x, y, spin, t) {
  ctx.save(); ctx.translate(x,y); if(spin) ctx.rotate(spin);
  const gallop=Math.sin((t||0)*12)*0.3;
  ctx.fillStyle="rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(2,28,18,9,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#c8863a"; ctx.beginPath(); ctx.ellipse(0,0,18,26,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#dfa055"; ctx.beginPath(); ctx.ellipse(0,4,11,16,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#c8863a";
  ctx.beginPath(); ctx.moveTo(-8,-18); ctx.quadraticCurveTo(-14,-34,-6,-44);
  ctx.quadraticCurveTo(4,-34,6,-18); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#b87530"; ctx.beginPath(); ctx.ellipse(-8,-50,10,13,-0.3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#d4956e"; ctx.beginPath(); ctx.ellipse(-10,-42,6,4,-0.3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#8b4513"; ctx.beginPath(); ctx.ellipse(-13,-41,2,1.5,0.2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(-4,-53,3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(-3,-54,1,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#c8863a";
  ctx.beginPath(); ctx.moveTo(-1,-60); ctx.lineTo(4,-68); ctx.lineTo(7,-60); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#e8a070";
  ctx.beginPath(); ctx.moveTo(1,-61); ctx.lineTo(4,-66); ctx.lineTo(6,-61); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="#5c2e00"; ctx.lineWidth=6; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(-2,-62); ctx.quadraticCurveTo(-12,-55,-10,-44);
  ctx.quadraticCurveTo(-8,-38,-14,-30); ctx.quadraticCurveTo(-10,-24,-12,-18); ctx.stroke();
  for (let i=0;i<5;i++) {
    ctx.fillStyle="#5c2e00"; ctx.beginPath(); ctx.ellipse(-9-i*1.5,-58+i*9,4,3,-0.5,0,Math.PI*2); ctx.fill();
  }
  ctx.strokeStyle="#5c2e00"; ctx.lineWidth=5; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(10,14); ctx.quadraticCurveTo(26+gallop*8,22,22,38);
  ctx.quadraticCurveTo(18,48,14+gallop*4,52); ctx.stroke();
  ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(10,14); ctx.quadraticCurveTo(30+gallop*10,26,26,42);
  ctx.quadraticCurveTo(22,52,18+gallop*6,58); ctx.stroke();
  function leg(bx,by,swing,front){
    const a=front?swing:-swing;
    ctx.save(); ctx.translate(bx,by);
    ctx.strokeStyle="#a06428"; ctx.lineWidth=7; ctx.lineCap="round";
    const kx=Math.sin(a)*14,ky=14;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(kx,ky); ctx.stroke();
    const fx=kx+Math.sin(a*0.5)*8,fy=ky+14;
    ctx.beginPath(); ctx.moveTo(kx,ky); ctx.lineTo(fx,fy); ctx.stroke();
    ctx.fillStyle="#333"; ctx.beginPath(); ctx.ellipse(fx,fy+3,5,3,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  leg(-10,14,gallop,true); leg(6,14,gallop,true);
  leg(-10,4,-gallop*0.8,false); leg(6,4,-gallop*0.8,false);
  ctx.fillStyle="#007AFF"; ctx.beginPath(); ctx.ellipse(-4,-26,9,11,-0.15,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FFDAB9"; ctx.beginPath(); ctx.arc(-6,-36,7,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#007AFF"; ctx.beginPath(); ctx.arc(-6,-39,7,Math.PI,2*Math.PI); ctx.fill();
  ctx.fillStyle="#0055cc"; ctx.fillRect(-13,-40,14,3);
  ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(-4,-36,1.5,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="#FFDAB9"; ctx.lineWidth=2.5; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(-1,-28); ctx.lineTo(6,-22+gallop*8); ctx.stroke();
  ctx.strokeStyle="#8b4513"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(6,-22+gallop*8); ctx.lineTo(10,-10+gallop*12); ctx.stroke();
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════
//  DRAW — SHARED OBSTACLE TYPES
// ══════════════════════════════════════════════════════════════════════════════
function drawCoin(ctx,o,t) {
  const p=1+Math.sin(t*3+o.wobble)*0.09;
  ctx.save(); ctx.translate(o.x,o.y); ctx.scale(p,p);
  const g=ctx.createRadialGradient(0,0,0,0,0,o.r*2.2);
  g.addColorStop(0,"rgba(255,215,0,0.55)"); g.addColorStop(1,"rgba(255,215,0,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,o.r*2.2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FFD700"; ctx.beginPath(); ctx.arc(0,0,o.r,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FFA500"; ctx.beginPath(); ctx.arc(0,0,o.r-3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FFD700"; ctx.font=`bold ${o.r}px Arial`;
  ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("★",0,1);
  ctx.restore();
}
function drawOil(ctx,o) {
  ctx.save(); ctx.translate(o.x,o.y);
  ctx.fillStyle="rgba(25,25,25,0.88)";
  ctx.beginPath(); ctx.ellipse(0,0,o.w/2,o.h/2,0,0,Math.PI*2); ctx.fill();
  const g=ctx.createRadialGradient(-o.w/6,-o.h/6,1,0,0,o.w/2);
  g.addColorStop(0,"rgba(255,50,50,0.35)"); g.addColorStop(0.33,"rgba(50,255,50,0.25)");
  g.addColorStop(0.66,"rgba(50,50,255,0.25)"); g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(0,0,o.w/2,o.h/2,0,0,Math.PI*2); ctx.fill();
  ctx.font="18px Arial"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("🛢️",0,0);
  ctx.restore();
}
function drawCone(ctx,o) {
  ctx.save(); ctx.translate(o.x,o.y);
  ctx.fillStyle="#555"; ctx.fillRect(-o.w/2,o.h/4,o.w,o.h/4);
  ctx.fillStyle="#FF6B00";
  ctx.beginPath(); ctx.moveTo(0,-o.h/2); ctx.lineTo(o.w/2,o.h/4); ctx.lineTo(-o.w/2,o.h/4); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#fff";
  ctx.beginPath(); ctx.moveTo(-o.w/4,-o.h/8); ctx.lineTo(o.w/4,-o.h/8);
  ctx.lineTo(o.w/3,o.h/8); ctx.lineTo(-o.w/3,o.h/8); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawBoost(ctx,o,t) {
  ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(t*2);
  const g=ctx.createRadialGradient(0,0,0,0,0,o.r*1.5);
  g.addColorStop(0,"rgba(0,229,255,0.65)"); g.addColorStop(1,"rgba(0,229,255,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,o.r*1.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#00E5FF"; ctx.strokeStyle="#fff"; ctx.lineWidth=2.5;
  ctx.beginPath();
  ctx.moveTo(5,-14); ctx.lineTo(-3,0); ctx.lineTo(4,0); ctx.lineTo(-5,14);
  ctx.lineTo(3,2); ctx.lineTo(-4,2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawHurdle(ctx,o) {
  for (let lane=0;lane<NUM_LANES;lane++) {
    if (lane===o.gap) continue;
    const x1=ROAD_LEFT+lane*LANE_W+4, x2=x1+LANE_W-8, yc=o.y;
    ctx.fillStyle="#d4c484"; ctx.fillRect(x1,yc-o.h/2,14,o.h); ctx.fillRect(x2-14,yc-o.h/2,14,o.h);
    ctx.fillStyle="#fff8dc"; ctx.fillRect(x1,yc-o.h/2,x2-x1,16);
    ctx.fillStyle="#e8d878"; ctx.fillRect(x1,yc-o.h/2+5,x2-x1,4);
    ctx.fillStyle="#fff8dc"; ctx.fillRect(x1+4,yc+2,x2-x1-8,12);
  }
  const gx=ROAD_LEFT+o.gap*LANE_W+LANE_W/2;
  const g2=ctx.createRadialGradient(gx,o.y,0,gx,o.y,LANE_W/2);
  g2.addColorStop(0,"rgba(100,255,100,0.22)"); g2.addColorStop(1,"rgba(100,255,100,0)");
  ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(gx,o.y,LANE_W/2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(100,255,100,0.7)"; ctx.font="bold 16px Arial";
  ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("▼",gx,o.y);
}
function drawMud(ctx,o) {
  ctx.save(); ctx.translate(o.x,o.y);
  ctx.fillStyle="rgba(90,55,15,0.85)";
  ctx.beginPath(); ctx.ellipse(0,0,o.w/2,o.h/2,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(60,35,8,0.7)";
  [[-12,0,10,6],[10,-5,8,5],[0,8,12,7],[-8,-8,7,4]].forEach(([mx,my,mw,mh])=>{
    ctx.beginPath(); ctx.ellipse(mx,my,mw/2,mh/2,0.5,0,Math.PI*2); ctx.fill();
  });
  ctx.font="16px Arial"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("💧",0,0);
  ctx.restore();
}
function drawRivalHorse(ctx,o,t) {
  ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(Math.PI); ctx.scale(0.7,0.7);
  const g2=Math.sin((t||0)*14)*0.25;
  ctx.fillStyle="rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(0,25,16,8,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=o.color; ctx.beginPath(); ctx.ellipse(0,0,18,24,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=dk(o.color,20);
  ctx.beginPath(); ctx.moveTo(-7,-16); ctx.quadraticCurveTo(-12,-30,-5,-40);
  ctx.quadraticCurveTo(4,-30,5,-16); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-7,-47,9,11,-0.3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(-3,-50,2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(-3,-50,1,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#cc2200"; ctx.beginPath(); ctx.ellipse(-3,-24,8,10,-0.1,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FFDAB9"; ctx.beginPath(); ctx.arc(-5,-33,6,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#cc2200"; ctx.beginPath(); ctx.arc(-5,-36,6,Math.PI,2*Math.PI); ctx.fill();
  function rleg(bx,by,swing,front){
    const a=front?swing:-swing; ctx.save(); ctx.translate(bx,by);
    ctx.strokeStyle=dk(o.color,30); ctx.lineWidth=6; ctx.lineCap="round";
    const kx=Math.sin(a)*12,ky=12;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(kx,ky); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(kx,ky); ctx.lineTo(kx+Math.sin(a*0.5)*7,ky+12); ctx.stroke();
    ctx.restore();
  }
  rleg(-9,12,g2,true); rleg(5,12,g2,true); rleg(-9,4,-g2*0.8,false); rleg(5,4,-g2*0.8,false);
  ctx.restore();
}
function drawHay(ctx,o) {
  ctx.save(); ctx.translate(o.x,o.y);
  ctx.fillStyle="#D4A017"; ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,5); ctx.fill();
  ctx.strokeStyle="#B8860B"; ctx.lineWidth=1.5;
  for (let hy=-o.h/2+4;hy<o.h/2;hy+=5) { ctx.beginPath(); ctx.moveTo(-o.w/2+3,hy); ctx.lineTo(o.w/2-3,hy); ctx.stroke(); }
  ctx.strokeStyle="#8B6914"; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(-o.w/2,0); ctx.lineTo(o.w/2,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-o.h/2); ctx.lineTo(0,o.h/2); ctx.stroke();
  ctx.restore();
}
function drawCarrot(ctx,o,t) {
  ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(Math.sin(t*3)*0.15);
  const g=ctx.createRadialGradient(0,0,0,0,0,o.r*1.8);
  g.addColorStop(0,"rgba(255,140,0,0.55)"); g.addColorStop(1,"rgba(255,140,0,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,o.r*1.8,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FF8C00";
  ctx.beginPath(); ctx.moveTo(0,-o.r+2); ctx.lineTo(o.r*0.7,o.r*0.5); ctx.lineTo(-o.r*0.7,o.r*0.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#FF6600";
  ctx.beginPath(); ctx.moveTo(0,o.r*0.5); ctx.lineTo(o.r*0.3,o.r*0.2); ctx.lineTo(-o.r*0.3,o.r*0.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#228B22";
  for (let i=-1;i<=1;i++) {
    ctx.save(); ctx.translate(i*4,-o.r+2); ctx.rotate(i*0.4);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(5,-10,0,-16); ctx.quadraticCurveTo(-5,-10,0,0); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════
//  HUD
// ══════════════════════════════════════════════════════════════════════════════
function drawHUD(ctx, pName, pColor, timeLeft, coins, speed, boosted, oiled, diffLabel, diffCol, isHorse, chased) {
  // Panel
  ctx.fillStyle="rgba(8,8,28,0.92)";
  ctx.fillRect(0,0,CW,62);
  ctx.strokeStyle=pColor; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(0,62); ctx.lineTo(CW,62); ctx.stroke();

  // Player label
  const icon=isHorse?"🐴":"🚗";
  ctx.fillStyle=pColor; ctx.font=`bold 15px ${FF}`;
  ctx.textAlign="left"; ctx.textBaseline="middle";
  ctx.fillText(`${icon} ${pName}`, 14, 18);

  // Diff badge
  ctx.fillStyle=diffCol; ctx.font=`bold 10px ${FF}`;
  ctx.fillText(diffLabel, 14, 50);

  // Star count
  ctx.fillStyle=C.gold; ctx.font=`bold 22px ${FF}`;
  ctx.textAlign="center"; ctx.fillText(`★ ${coins}`, CW/2, 20);

  // Timer
  const urgent=timeLeft<10;
  ctx.fillStyle=urgent?"#FF3B30":"#fff";
  ctx.font=`bold ${urgent?19:16}px ${FF}`; ctx.textAlign="right";
  ctx.fillText(`⏱ ${timeLeft.toFixed(1)}s`, CW-14, 18);

  // Speed bar
  const bx=14,by=38,bw=CW-28,bh=11;
  ctx.fillStyle="rgba(255,255,255,0.1)";
  ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,5); ctx.fill();
  const pct=Math.min(1,Math.abs(speed)/11);
  const barCol=boosted?(isHorse?"#FF8C00":"#00E5FF"):oiled?(isHorse?"#8B6914":"#cc6600"):"#30ee60";
  ctx.fillStyle=barCol; ctx.beginPath(); ctx.roundRect(bx,by,bw*pct,bh,5); ctx.fill();

  if (boosted) { ctx.fillStyle=isHorse?"#FF8C00":"#00E5FF"; ctx.font="bold 10px sans-serif"; ctx.textAlign="right"; ctx.fillText(isHorse?"🥕 CARROT BOOST":"⚡ BOOST",CW-14,54); }
  if (oiled)   { ctx.fillStyle=isHorse?"#8B6914":"#FF6B00"; ctx.font="bold 10px sans-serif"; ctx.textAlign="right"; ctx.fillText(isHorse?"💧 MUDDY":"🛢 SLIPPING",CW-14,54); }

  // ── BADDIE CHASE WARNING ──
  if (chased>0) {
    const flash=Math.sin(chased*18)>0;
    if (flash) {
      ctx.save();
      ctx.fillStyle="rgba(200,0,0,0.18)";
      ctx.fillRect(0,62,CW,CH-62);
      ctx.restore();
    }
    ctx.fillStyle=flash?"#FF2200":"#FF6600";
    ctx.font=`bold 14px ${FF}`;
    ctx.textAlign="center";
    ctx.fillText("🚨 BADDIES ON YOUR TAIL! FLOOR IT! 🚨", CW/2, 54);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GAME STATE
// ══════════════════════════════════════════════════════════════════════════════
function mkState(playerNum, name, difficulty) {
  return {
    playerNum, name, difficulty,
    color: playerNum===1?C.p1:C.p2,
    isHorse: playerNum===2,
    x:ROAD_LEFT+ROAD_W/2, y:CH-110,
    speed:SCROLL_BASE*DIFF[difficulty].scroll,
    spinAngle:0, oilTimer:0, boostTimer:0, mudTimer:0,
    coins:0, objects:[], stripeOffset:0,
    startTime:Date.now(), spawnTimer:0, distance:0,
    alive:true, flashTimer:0, flashColor:"", popups:[],
    // P1 baddie chase state
    baddieCooldown: 6 + Math.random()*4,
    chaseTimer:0,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  REACT COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function RoadRacer() {
  const canvasRef=useRef(null);
  const stateRef=useRef(null);
  const keysRef=useRef({});
  const rafRef=useRef(null);

  const [phase,    setPhase]    =useState("names");
  const [p1Name,   setP1Name]   =useState("");
  const [p2Name,   setP2Name]   =useState("");
  const [diff,     setDiff]     =useState("medium");
  const [p1Coins,  setP1Coins]  =useState(0);
  const [p2Coins,  setP2Coins]  =useState(0);
  const [liveCoins,setLiveCoins]=useState(0);
  const [liveTime, setLiveTime] =useState(GAME_SECS);
  const [board,    setBoard]    =useState([]);
  const [canvasSize,setCanvasSize]=useState({w:CW,h:CH});

  // Full-screen
  useEffect(()=>{
    function resize(){
      const s=Math.min(window.innerWidth/CW, window.innerHeight/CH);
      setCanvasSize({w:CW*s,h:CH*s});
    }
    resize(); window.addEventListener("resize",resize);
    return()=>window.removeEventListener("resize",resize);
  },[]);

  // Keys
  useEffect(()=>{
    const dn=e=>{ keysRef.current[e.code]=true; if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault(); };
    const up=e=>{ keysRef.current[e.code]=false; };
    window.addEventListener("keydown",dn); window.addEventListener("keyup",up);
    return()=>{ window.removeEventListener("keydown",dn); window.removeEventListener("keyup",up); };
  },[]);

  useEffect(()=>{ setBoard(loadBoard()); },[]);

  const startRace=useCallback((playerNum)=>{
    const name=playerNum===1?(p1Name.trim()||"Player 1"):(p2Name.trim()||"Player 2");
    stateRef.current=mkState(playerNum,name,diff);
    setLiveCoins(0); setLiveTime(GAME_SECS); setPhase("racing");
  },[p1Name,p2Name,diff]);

  // ── GAME LOOP ────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current;
    const ctx=canvas.getContext("2d");
    let last=0;

    const loop=ts=>{
      rafRef.current=requestAnimationFrame(loop);
      const dt=Math.min((ts-last)/1000,0.05); last=ts;
      const t=ts/1000;
      const s=stateRef.current;
      const isHorse=s?s.isHorse:false;

      // Background
      if(isHorse)  drawHorseTrack(ctx,s?s.stripeOffset:0);
      else         drawLegoCity(ctx,s?s.stripeOffset:0);

      if(!s||!s.alive){
        drawLegoPlayerCar(ctx,ROAD_LEFT+ROAD_W/2,CH-110,0);
        return;
      }

      const k=keysRef.current;
      const oiled=s.oilTimer>0||s.mudTimer>0;
      const boosted=s.boostTimer>0;
      const dcfg=DIFF[s.difficulty];

      // Physics
      const baseSpd=SCROLL_BASE*dcfg.scroll;
      const tgtSpd=k["ArrowUp"]?(boosted?14*dcfg.scroll:9*dcfg.scroll):k["ArrowDown"]?2:baseSpd+s.distance/3500;
      s.speed+=(tgtSpd-s.speed)*0.08;
      s.speed=Math.max(1.5,Math.min(boosted?14*dcfg.scroll:10*dcfg.scroll,s.speed));

      const drift=oiled?(Math.random()-0.5)*4:0;
      const str=oiled?6.5:5.5;
      if(k["ArrowLeft"])  s.x-=str+drift;
      if(k["ArrowRight"]) s.x+=str+drift;
      s.x=Math.max(ROAD_LEFT+22,Math.min(ROAD_RIGHT-22,s.x));

      if(oiled) s.spinAngle+=0.2; else s.spinAngle*=0.82;
      if(s.oilTimer >0)  s.oilTimer  =Math.max(0,s.oilTimer -dt);
      if(s.mudTimer >0)  s.mudTimer  =Math.max(0,s.mudTimer -dt);
      if(s.boostTimer>0) s.boostTimer=Math.max(0,s.boostTimer-dt);
      if(s.flashTimer>0) s.flashTimer=Math.max(0,s.flashTimer-dt);
      if(s.chaseTimer>0) s.chaseTimer=Math.max(0,s.chaseTimer-dt);

      s.stripeOffset+=s.speed;
      s.distance+=s.speed;

      // ── P1 baddie cooldown & spawn ──
      if(!isHorse){
        s.baddieCooldown-=dt;
        if(s.baddieCooldown<=0){
          // Spawn 1 or 2 baddies
          const count=Math.random()<0.35?2:1;
          for(let bi=0;bi<count;bi++) s.objects.push(mkBaddie());
          s.chaseTimer=6;
          s.baddieCooldown=8+Math.random()*7;
        }
      }

      // Timer
      s.timeLeft=Math.max(0,GAME_SECS-(Date.now()-s.startTime)/1000);
      if(s.timeLeft<=0){
        s.alive=false;
        const{coins,playerNum,name,isHorse:ih,difficulty:dif}=s;
        stateRef.current=null;
        const updated=addScore(name,coins,dif,ih);
        setBoard(updated);
        if(playerNum===1){ setP1Coins(coins); setPhase("done1"); }
        else              { setP2Coins(coins); setPhase("results"); }
        return;
      }
      setLiveCoins(s.coins); setLiveTime(s.timeLeft);

      // ── Spawn regular objects ──
      s.spawnTimer-=dt;
      if(s.spawnTimer<=0){
        const diff2=1+s.distance/4000;
        s.spawnTimer=Math.max(0.28,(1.0*dcfg.spawn)-diff2*0.07);
        const r=Math.random();
        const cW=dcfg.coinW, oW=dcfg.obstW;

        if(isHorse){
          if      (r<cW)             s.objects.push(mkHorseCoin(s.speed));
          else if (r<cW+0.08)        s.objects.push(mkHorseCoin(s.speed),mkHorseCoin(s.speed));
          else if (r<cW+0.08+oW*0.28) s.objects.push(mkHurdle(s.speed));
          else if (r<cW+0.08+oW*0.52) s.objects.push(mkRivalHorse(s.speed));
          else if (r<cW+0.08+oW*0.70) s.objects.push(mkMud(s.speed));
          else if (r<cW+0.08+oW*0.88) s.objects.push(...mkHayBales(s.speed));
          else                         s.objects.push(mkCarrot(s.speed));
        } else {
          if      (r<cW)             s.objects.push(mkCoin(s.speed));
          else if (r<cW+0.08)        s.objects.push(mkCoin(s.speed),mkCoin(s.speed));
          else if (r<cW+0.08+oW*0.32) s.objects.push(mkLegoTraffic(s.speed));
          else if (r<cW+0.08+oW*0.58) s.objects.push(mkOil(s.speed));
          else if (r<cW+0.08+oW*0.82) s.objects.push(...mkCones(s.speed));
          else                         s.objects.push(mkBoost(s.speed));
        }
      }

      // ── Update & draw objects ──
      const alive=[];
      for(const o of s.objects){
        // Baddies move UPWARD (chasing from below)
        if(o.chasing){
          o.y-=o.gainRate;
          // Steer toward player
          o.x+=(s.x-o.x)*0.022;
          o.x=Math.max(ROAD_LEFT+22,Math.min(ROAD_RIGHT-22,o.x));
          if(o.y<-130) continue; // escaped off top
        } else {
          o.y+=o.speed+s.speed*0.7;
          if(o.y>CH+90) continue;
        }

        const hx=Math.abs(s.x-o.x), hy=Math.abs(s.y-o.y);

        if(o.type==="coin"){
          if(Math.hypot(s.x-o.x,s.y-o.y)<o.r+15){
            s.coins++;
            s.popups.push({text:"+1 ★",x:o.x,y:o.y,life:1,col:C.gold}); continue;
          }
          drawCoin(ctx,o,t);

        } else if(o.type==="traffic"){
          if(hx<o.w/2+14 && hy<o.h/2+16){
            s.flashTimer=0.45; s.flashColor="#FF3B30";
            s.coins=Math.max(0,s.coins-2);
            s.popups.push({text:"-2 ★ CRASH",x:o.x,y:o.y,life:1.2,col:"#FF3B30"}); continue;
          }
          drawLegoTraffic(ctx,o);

        } else if(o.type==="oil"){
          if(hx<o.w/2+12 && hy<o.h/2+12){
            s.oilTimer=2.8; s.flashTimer=0.3; s.flashColor="#8B4513";
            s.popups.push({text:"🛢 Slipping",x:o.x,y:o.y,life:1.2,col:"#FF6B00"}); continue;
          }
          drawOil(ctx,o);

        } else if(o.type==="cone"){
          if(hx<o.w/2+13 && hy<o.h/2+15){
            s.flashTimer=0.3; s.flashColor="#FF6B00";
            s.coins=Math.max(0,s.coins-1);
            s.popups.push({text:"-1 ★ CONES",x:o.x,y:o.y,life:1,col:"#FF6B00"}); continue;
          }
          drawCone(ctx,o);

        } else if(o.type==="boost"){
          if(Math.hypot(s.x-o.x,s.y-o.y)<o.r+15){
            s.boostTimer=3.2;
            s.popups.push({text:"⚡ BOOST",x:o.x,y:o.y,life:1.2,col:"#00E5FF"}); continue;
          }
          drawBoost(ctx,o,t);

        } else if(o.type==="baddie"){
          // Caught by baddie!
          if(Math.hypot(s.x-o.x,s.y-o.y)<28){
            s.flashTimer=0.7; s.flashColor="#FF0000";
            s.coins=Math.max(0,s.coins-3);
            s.chaseTimer=0;
            s.popups.push({text:"🚨 -3 ★ BUSTED!",x:o.x,y:s.y-20,life:2,col:"#FF2200"}); continue;
          }
          drawBaddie(ctx,o,t);

        } else if(o.type==="hurdle"){
          const playerLane=Math.floor((s.x-ROAD_LEFT)/LANE_W);
          if(Math.abs(s.y-o.y)<o.h/2+20 && playerLane!==o.gap){
            s.flashTimer=0.45; s.flashColor="#fff";
            s.coins=Math.max(0,s.coins-2);
            s.popups.push({text:"-2 ★ HURDLE",x:s.x,y:o.y,life:1.4,col:"#fff"}); continue;
          }
          drawHurdle(ctx,o);

        } else if(o.type==="mud"){
          if(hx<o.w/2+12 && hy<o.h/2+12){
            s.mudTimer=3.0; s.flashTimer=0.3; s.flashColor="#5a3000";
            s.popups.push({text:"💧 Muddy hooves",x:o.x,y:o.y,life:1.3,col:"#8B6914"}); continue;
          }
          drawMud(ctx,o);

        } else if(o.type==="rival"){
          if(hx<o.w/2+14 && hy<o.h/2+18){
            s.flashTimer=0.5; s.flashColor="#8B0000";
            s.coins=Math.max(0,s.coins-2);
            s.popups.push({text:"-2 ★ RIVAL CLASH",x:o.x,y:o.y,life:1.3,col:"#cc2200"}); continue;
          }
          drawRivalHorse(ctx,o,t);

        } else if(o.type==="hay"){
          if(hx<o.w/2+12 && hy<o.h/2+14){
            s.flashTimer=0.3; s.flashColor="#D4A017";
            s.coins=Math.max(0,s.coins-1);
            s.popups.push({text:"-1 ★ HAY BALE",x:o.x,y:o.y,life:1,col:"#D4A017"}); continue;
          }
          drawHay(ctx,o);

        } else if(o.type==="carrot"){
          if(Math.hypot(s.x-o.x,s.y-o.y)<o.r+16){
            s.boostTimer=3.5;
            s.popups.push({text:"🥕 Carrot Boost",x:o.x,y:o.y,life:1.3,col:"#FF8C00"}); continue;
          }
          drawCarrot(ctx,o,t);
        }

        alive.push(o);
      }
      s.objects=alive;

      // Popups
      s.popups=s.popups.filter(p=>p.life>0);
      for(const p of s.popups){
        ctx.save(); ctx.globalAlpha=Math.min(1,p.life*2);
        ctx.fillStyle=p.col; ctx.font=`bold 17px ${FF}`;
        ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(p.text,p.x,p.y);
        ctx.restore(); p.y-=1.8; p.life-=dt*1.3;
      }

      // Draw player
      if(isHorse) drawHorse(ctx,s.x,s.y,s.spinAngle,t);
      else        drawLegoPlayerCar(ctx,s.x,s.y,s.spinAngle);

      // Screen flash
      if(s.flashTimer>0){
        ctx.save(); ctx.globalAlpha=s.flashTimer*0.6;
        ctx.fillStyle=s.flashColor; ctx.fillRect(0,62,CW,CH-62); ctx.restore();
      }

      drawHUD(ctx,s.name,s.color,s.timeLeft,s.coins,s.speed,boosted,oiled,
              DIFF[s.difficulty].label,DIFF[s.difficulty].col,isHorse,s.chaseTimer);
    };

    rafRef.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(rafRef.current);
  },[]);

  // ── UI ───────────────────────────────────────────────────────────────────────
  const n1=p1Name.trim()||"Player 1", n2=p2Name.trim()||"Player 2";
  const winner=p1Coins>p2Coins?1:p2Coins>p1Coins?2:0;
  const canvasStyle={display:"block",width:canvasSize.w,height:canvasSize.h,imageRendering:"pixelated"};

  return (
    <div style={S.root}>
      <canvas ref={canvasRef} width={CW} height={CH} style={canvasStyle}/>

      {/* Name + Difficulty */}
      {phase==="names" && (
        <FullOverlay>
          <Modal wide>
            <div style={{fontSize:48,marginBottom:4}}>🧱🚗⭐🐴</div>
            <h1 style={{color:C.gold,margin:"0 0 4px",fontSize:28,fontFamily:FF}}>Road Racer</h1>
            <p style={{color:"#bbb",fontSize:12,margin:"0 0 14px",fontFamily:FF}}>Collect ★ stars in {GAME_SECS}s · Most stars wins!</p>

            <div style={S.nameRow}>
              <div style={S.nameBlock}>
                <label style={{...S.label,color:C.p1}}>🚗 Player 1 — LEGO City</label>
                <input style={S.input} placeholder="Name…" maxLength={14} value={p1Name}
                  onChange={e=>setP1Name(e.target.value)} onKeyDown={e=>e.stopPropagation()}/>
              </div>
              <div style={S.nameBlock}>
                <label style={{...S.label,color:C.p2}}>🐴 Player 2 — Horse Track</label>
                <input style={S.input} placeholder="Name…" maxLength={14} value={p2Name}
                  onChange={e=>setP2Name(e.target.value)} onKeyDown={e=>e.stopPropagation()}/>
              </div>
            </div>

            <p style={{color:"#aaa",fontSize:12,margin:"0 0 8px",fontFamily:FF}}>Difficulty:</p>
            <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:14}}>
              {Object.entries(DIFF).map(([k,d])=>(
                <button key={k} onClick={()=>setDiff(k)} style={{
                  background:diff===k?d.col:"rgba(255,255,255,0.07)",
                  color:diff===k?"#fff":"#aaa",
                  border:`2px solid ${diff===k?d.col:"rgba(255,255,255,0.15)"}`,
                  borderRadius:10,padding:"8px 14px",fontSize:13,cursor:"pointer",
                  fontFamily:FF,fontWeight:"bold",
                  boxShadow:diff===k?`0 4px 16px ${d.col}66`:"none",
                  transform:diff===k?"scale(1.08)":"scale(1)",transition:"all .15s",
                }}>{d.label}</button>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              <div style={S.howBox}>
                <div style={{color:C.p1,fontWeight:"bold",fontSize:12,fontFamily:FF,marginBottom:5}}>🧱 Player 1 — LEGO City</div>
                <HowTo icon="⬆️⬇️" text="Speed up / brake"/>
                <HowTo icon="⬅️➡️" text="Steer lanes"/>
                <HowTo icon="★"    text="Collect stars +1" col={C.gold}/>
                <HowTo icon="⚡"   text="Boost pickup" col="#00E5FF"/>
                <HowTo icon="🧱"   text="Dodge LEGO traffic -2★" col="#FF3B30"/>
                <HowTo icon="🛢️"  text="Avoid oil slick -slip" col="#FF6B00"/>
                <HowTo icon="🚨"   text="OUTRUN the baddies! -3★" col="#FF2200"/>
              </div>
              <div style={S.howBox}>
                <div style={{color:C.p2,fontWeight:"bold",fontSize:12,fontFamily:FF,marginBottom:5}}>🐴 Player 2 — Horse Track</div>
                <HowTo icon="⬆️⬇️" text="Gallop / slow down"/>
                <HowTo icon="⬅️➡️" text="Change lanes"/>
                <HowTo icon="★"    text="Collect stars +1" col={C.gold}/>
                <HowTo icon="🥕"   text="Grab carrot boost" col="#FF8C00"/>
                <HowTo icon="🏇"   text="Dodge rival horse -2★" col="#cc2200"/>
                <HowTo icon="💧"   text="Avoid mud puddles" col="#8B6914"/>
                <HowTo icon="🌾"   text="Find hurdle gap!" col="#fff8dc"/>
              </div>
            </div>

            <BtnRow>
              <Btn color="#22bb44" onClick={()=>startRace(1)}>🚗 {n1} — Go!</Btn>
              <Btn color="#555" onClick={()=>{ setBoard(loadBoard()); setPhase("board"); }}>🏆 Scores</Btn>
            </BtnRow>
          </Modal>
        </FullOverlay>
      )}

      {/* P1 done */}
      {phase==="done1" && (
        <FullOverlay><Modal>
          <div style={{fontSize:56}}>🎉</div>
          <h2 style={{color:C.p1,margin:"8px 0 2px",fontSize:26,fontFamily:FF}}>{n1} finished!</h2>
          <p style={{color:C.gold,fontSize:42,margin:"4px 0",fontWeight:"bold",fontFamily:FF}}>★ {p1Coins}</p>
          <p style={{color:"#bbb",fontSize:13,margin:"0 0 6px",fontFamily:FF}}>Difficulty: <span style={{color:DIFF[diff].col}}>{DIFF[diff].label}</span></p>
          <p style={{color:"#bbb",fontSize:14,margin:"0 0 18px",fontFamily:FF}}>Can {n2} beat that on the horse track?</p>
          <Btn color={C.p2} onClick={()=>startRace(2)}>🐴 {n2} — Your Turn!</Btn>
        </Modal></FullOverlay>
      )}

      {/* Results */}
      {phase==="results" && (
        <FullOverlay><Modal wide>
          <div style={{fontSize:52}}>{winner===0?"🤝":"🏆"}</div>
          <h2 style={{color:C.gold,margin:"6px 0 4px",fontSize:24,fontFamily:FF}}>
            {winner===0?"It's a Tie! 🤯":`${winner===1?n1:n2} Wins! 🎊`}
          </h2>
          <p style={{color:DIFF[diff].col,fontSize:13,margin:"0 0 12px",fontFamily:FF}}>{DIFF[diff].label}</p>
          <div style={S.scoreCards}>
            <ScoreCard name={n1} coins={p1Coins} color={C.p1} won={winner===1} icon="🚗"/>
            <ScoreCard name={n2} coins={p2Coins} color={C.p2} won={winner===2} icon="🐴"/>
          </div>
          {winner!==0&&<p style={{color:"#777",fontSize:12,margin:"4px 0 10px",fontFamily:FF}}>Difference: {Math.abs(p1Coins-p2Coins)} star{Math.abs(p1Coins-p2Coins)!==1?"s":""}</p>}
          <h3 style={{color:C.gold,margin:"10px 0 6px",fontSize:15,fontFamily:FF}}>🏆 Top 10</h3>
          <MiniBoard board={board} highlight={[n1,n2]}/>
          <BtnRow>
            <Btn color="#22bb44" onClick={()=>{ setP1Coins(0); setP2Coins(0); setPhase("names"); }}>🔄 Play Again</Btn>
            <Btn color="#555" onClick={()=>setPhase("board")}>📋 Full Board</Btn>
          </BtnRow>
        </Modal></FullOverlay>
      )}

      {/* Leaderboard */}
      {phase==="board" && (
        <FullOverlay><Modal wide>
          <h2 style={{color:C.gold,margin:"0 0 14px",fontSize:24,fontFamily:FF}}>🏆 Top 10 Leaderboard</h2>
          <FullBoard board={board}/>
          <BtnRow>
            <Btn color="#22bb44" onClick={()=>setPhase("names")}>🏎️ Play</Btn>
            <Btn color="#cc2222" onClick={()=>{ if(window.confirm("Clear leaderboard?")){ saveBoard([]); setBoard([]); } }}>🗑️ Clear</Btn>
          </BtnRow>
        </Modal></FullOverlay>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function FullOverlay({children}){return <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(4,4,20,0.88)",backdropFilter:"blur(4px)"}}>{children}</div>;}
function Modal({children,wide}){return <div style={{background:"linear-gradient(160deg,#0d0d28,#181840)",borderRadius:22,padding:"24px 28px",textAlign:"center",border:"2.5px solid #FFD700",boxShadow:"0 20px 60px rgba(0,0,0,0.9)",width:wide?"min(96vw,560px)":"min(92vw,400px)",maxHeight:"92vh",overflowY:"auto",fontFamily:FF}}>{children}</div>;}
function Btn({children,color,onClick}){return <button onClick={onClick} style={{background:color,color:"#fff",border:"none",padding:"11px 22px",borderRadius:11,fontSize:14,fontWeight:"bold",cursor:"pointer",boxShadow:`0 4px 16px ${color}88`,fontFamily:FF}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>{children}</button>;}
function BtnRow({children}){return <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:12,flexWrap:"wrap"}}>{children}</div>;}
function HowTo({icon,text,col="#ccc"}){return <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:col,marginBottom:3}}><span style={{fontSize:14}}>{icon}</span>{text}</div>;}
function ScoreCard({name,coins,color,won,icon="🚗"}){
  return(
    <div style={{flex:1,background:won?"rgba(255,215,0,0.1)":"rgba(255,255,255,0.05)",border:`2px solid ${won?C.gold:color}`,borderRadius:12,padding:"10px 8px",position:"relative"}}>
      {won&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",fontSize:20}}>🏆</div>}
      <div style={{color,fontSize:13,fontWeight:"bold",fontFamily:FF,marginTop:won?8:0}}>{icon} {name}</div>
      <div style={{color:C.gold,fontSize:28,fontWeight:"bold",fontFamily:FF}}>★ {coins}</div>
    </div>
  );
}
function MiniBoard({board,highlight}){
  if(!board.length) return <p style={{color:"#555",fontSize:12}}>No scores yet!</p>;
  return(
    <div style={{width:"100%",maxHeight:150,overflowY:"auto",marginBottom:4}}>
      {board.map((e,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",borderRadius:7,marginBottom:2,background:i===0?"rgba(255,215,0,0.15)":highlight.includes(e.name)?"rgba(0,229,255,0.1)":"rgba(255,255,255,0.04)",border:highlight.includes(e.name)?"1px solid rgba(0,229,255,0.4)":"1px solid transparent"}}>
          <span style={{color:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#888",fontSize:12,fontFamily:FF}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
          <span style={{color:"#ddd",fontSize:12,flex:1,textAlign:"left",marginLeft:8,fontFamily:FF}}>{e.horse?"🐴":"🚗"} {e.name}</span>
          <span style={{color:DIFF[e.diff]?.col||"#aaa",fontSize:10,marginRight:6,fontFamily:FF}}>{DIFF[e.diff]?.label||""}</span>
          <span style={{color:C.gold,fontWeight:"bold",fontSize:13,fontFamily:FF}}>★ {e.coins}</span>
        </div>
      ))}
    </div>
  );
}
function FullBoard({board}){
  if(!board.length) return <p style={{color:"#555",fontSize:13,fontFamily:FF,margin:"20px 0"}}>No scores yet — play first!</p>;
  return(
    <div style={{width:"100%"}}>
      <div style={{display:"grid",gridTemplateColumns:"36px 1fr 60px 70px 70px",gap:4,padding:"0 4px 8px",borderBottom:"1px solid rgba(255,215,0,0.2)"}}>
        {["#","Name","Mode","Diff","Stars"].map(h=><span key={h} style={{color:C.gold,fontSize:11,fontWeight:"bold",fontFamily:FF,textAlign:"center"}}>{h}</span>)}
      </div>
      {board.map((e,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:"36px 1fr 60px 70px 70px",gap:4,padding:"7px 4px",borderRadius:9,marginTop:3,background:i===0?"rgba(255,215,0,0.12)":i===1?"rgba(192,192,192,0.07)":i===2?"rgba(205,127,50,0.07)":"rgba(255,255,255,0.04)"}}>
          <span style={{color:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#666",textAlign:"center",fontSize:14,fontFamily:FF}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</span>
          <span style={{color:"#eee",fontSize:13,fontFamily:FF,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name}</span>
          <span style={{color:"#aaa",fontSize:12,textAlign:"center",fontFamily:FF}}>{e.horse?"🐴":"🚗"}</span>
          <span style={{color:DIFF[e.diff]?.col||"#aaa",fontSize:11,textAlign:"center",fontFamily:FF}}>{DIFF[e.diff]?.label||"—"}</span>
          <span style={{color:C.gold,fontWeight:"bold",fontSize:14,textAlign:"center",fontFamily:FF}}>★ {e.coins}</span>
        </div>
      ))}
    </div>
  );
}

const S={
  root:{width:"100vw",height:"100vh",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"#050510"},
  nameRow:{display:"flex",gap:14,marginBottom:12,flexWrap:"wrap",justifyContent:"center"},
  nameBlock:{display:"flex",flexDirection:"column",gap:4,minWidth:148},
  label:{fontSize:11,fontWeight:"bold",textAlign:"left",fontFamily:FF},
  input:{padding:"8px 12px",borderRadius:9,border:"2px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:14,fontFamily:FF,outline:"none"},
  howBox:{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px",textAlign:"left"},
  scoreCards:{display:"flex",gap:10,margin:"0 0 6px",justifyContent:"center"},
};
