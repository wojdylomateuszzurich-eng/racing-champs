import { useState, useEffect, useRef, useCallback } from "react";

// ─── Canvas Dimensions ───────────────────────────────────────────────────────
const W = 720, H = 480;
const ROAD_W = 76;

// ─── Track: closed polyline (counter-clockwise) ──────────────────────────────
const TRACK = [
  [365, 455],  // 0  Start/Finish (bottom-centre)
  [175, 448],  // 1
  [80,  385],  // 2
  [65,  270],  // 3  ← checkpoint 1
  [80,  140],  // 4
  [195,  62],  // 5
  [365,  48],  // 6  ← checkpoint 2
  [530,  62],  // 7
  [640, 140],  // 8
  [655, 270],  // 9  ← checkpoint 3
  [640, 385],  // 10
  [545, 448],  // 11
  [365, 455],  // 12 (closes loop back to 0)
];

const CP_INDICES = [3, 6, 9];  // waypoint indices that act as checkpoints
const CP_RADIUS  = ROAD_W / 2 + 14;
const FINISH_RADIUS = ROAD_W / 2 + 12;

// ─── Physics constants ────────────────────────────────────────────────────────
const ACCEL    = 0.14;
const BRAKE    = 0.22;
const FRICTION = 0.955;
const MAX_SPD  = 4.6;
const TURN_K   = 0.052;

// ─── Color palette ────────────────────────────────────────────────────────────
const P1_COLOR = "#FF3B30";
const P2_COLOR = "#007AFF";

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function isOnRoad(x, y) {
  for (let i = 0; i < TRACK.length - 1; i++) {
    const [ax, ay] = TRACK[i], [bx, by] = TRACK[i + 1];
    if (distToSeg(x, y, ax, ay, bx, by) < ROAD_W / 2) return true;
  }
  return false;
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function drawTrack(ctx) {
  // 1. Grass background with texture dots
  ctx.fillStyle = "#3aab3a";
  ctx.fillRect(0, 0, W, H);

  // Subtle grass texture
  const grassDots = [
    [100,60],[200,80],[450,70],[600,55],[660,180],[660,400],
    [540,430],[200,430],[60,400],[60,150],[300,260],[430,260],
    [365,160],[220,330],[510,330],[150,200],[580,200],
  ];
  ctx.fillStyle = "rgba(40,140,40,0.5)";
  grassDots.forEach(([x,y]) => {
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
  });

  // 2. Road border (dark outer edge)
  ctx.save();
  ctx.beginPath();
  TRACK.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.strokeStyle = "#888";
  ctx.lineWidth = ROAD_W + 10;
  ctx.lineJoin = "round";
  ctx.lineCap  = "round";
  ctx.stroke();

  // 3. Road fill
  ctx.beginPath();
  TRACK.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.strokeStyle = "#4a4a4a";
  ctx.lineWidth = ROAD_W;
  ctx.stroke();

  // 4. Road kerb / white edge lines
  ctx.beginPath();
  TRACK.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = ROAD_W - 8;
  ctx.stroke();

  // 5. Road inner fill (covers white, leaving edge stripe)
  ctx.beginPath();
  TRACK.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.strokeStyle = "#555";
  ctx.lineWidth = ROAD_W - 18;
  ctx.stroke();

  // 6. Centre dashed yellow line
  ctx.setLineDash([20, 18]);
  ctx.beginPath();
  TRACK.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.strokeStyle = "rgba(255,220,50,0.45)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 7. Start / finish checkered flag line
  const [sx, sy] = TRACK[0];
  const [nx, ny] = TRACK[1];
  const ang = Math.atan2(ny - sy, nx - sx) + Math.PI / 2;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ang);
  const SQ = 7, COLS = 5, ROWS = 6;
  for (let r = -ROWS / 2; r < ROWS / 2; r++) {
    for (let c = -COLS / 2; c < COLS / 2; c++) {
      ctx.fillStyle = (Math.floor(r + c)) % 2 === 0 ? "#fff" : "#000";
      ctx.fillRect(c * SQ, r * SQ, SQ, SQ);
    }
  }
  ctx.restore();

  // 8. Decorative trees (only off-road positions)
  const trees = [
    [365, 260], [220, 200], [510, 200], [365, 150],
    [160, 320], [570, 320], [260, 100], [470, 100],
  ];
  trees.forEach(([tx, ty]) => {
    if (isOnRoad(tx, ty)) return;
    // Shadow
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath(); ctx.ellipse(tx + 4, ty + 8, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
    // Trunk
    ctx.fillStyle = "#6b3f1e";
    ctx.fillRect(tx - 3, ty, 6, 10);
    // Canopy layers
    ctx.fillStyle = "#2d7a2d";
    ctx.beginPath(); ctx.arc(tx, ty, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3d9e3d";
    ctx.beginPath(); ctx.arc(tx - 3, ty - 5, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4ec44e";
    ctx.beginPath(); ctx.arc(tx + 2, ty - 8, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

function drawCar(ctx, x, y, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);

  // Drop shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(3, 4, 11, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-11, -17, 22, 34, 5);
  ctx.fill();

  // Spoiler
  ctx.fillStyle = darken(color, 30);
  ctx.fillRect(-11, 14, 22, 4);

  // Roof
  ctx.fillStyle = darken(color, 20);
  ctx.beginPath();
  ctx.roundRect(-7, -11, 14, 20, 4);
  ctx.fill();

  // Windshield
  ctx.fillStyle = "rgba(160,225,255,0.92)";
  ctx.beginPath();
  ctx.roundRect(-6, -15, 12, 10, 3);
  ctx.fill();
  // Windshield glare
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.roundRect(-5, -14, 5, 4, 2);
  ctx.fill();

  // Rear window
  ctx.fillStyle = "rgba(160,225,255,0.75)";
  ctx.beginPath();
  ctx.roundRect(-5, 8, 10, 7, 2);
  ctx.fill();

  // Headlights
  ctx.fillStyle = "#ffffa0";
  ctx.beginPath(); ctx.roundRect(-9, -18, 5, 3, 1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(4,  -18, 5, 3, 1); ctx.fill();

  // Tail lights
  ctx.fillStyle = "#ff4444";
  ctx.beginPath(); ctx.roundRect(-9, 17, 4, 3, 1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(5,  17, 4, 3, 1); ctx.fill();

  // Wheels (4 corners)
  ctx.fillStyle = "#1a1a1a";
  const wheels = [[-15,-13,7,12],[ 8,-13,7,12],[-15, 5,7,12],[ 8, 5,7,12]];
  wheels.forEach(([wx, wy, ww, wh]) => {
    ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, 2); ctx.fill();
    ctx.fillStyle = "#444";
    ctx.beginPath(); ctx.arc(wx + ww/2, wy + wh/2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#1a1a1a";
  });

  ctx.restore();
}

function darken(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `rgb(${r},${g},${b})`;
}

function drawCheckpoints(ctx, cpIdx) {
  CP_INDICES.forEach((wpIdx, i) => {
    const [cx, cy] = TRACK[wpIdx];
    const done = i < cpIdx;
    ctx.save();
    // Pulsing ring
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = done ? "rgba(50,220,80,0.55)" : "rgba(255,200,30,0.45)";
    ctx.fill();
    ctx.strokeStyle = done ? "#30ee60" : "#ffcc00";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Number
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px 'Comic Sans MS', cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(done ? "✓" : `${i + 1}`, cx, cy);
    ctx.restore();
  });
}

function drawHUD(ctx, playerNum, elapsed, cpsDone, speed, offTrack) {
  const color = playerNum === 1 ? P1_COLOR : P2_COLOR;
  const label = playerNum === 1 ? "🚗 Player 1" : "🚙 Player 2";

  ctx.save();
  ctx.fillStyle = "rgba(10,10,30,0.72)";
  ctx.beginPath();
  ctx.roundRect(10, 10, 196, 85, 12);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(10, 10, 196, 85, 12);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = "bold 15px 'Comic Sans MS', cursive";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(label, 22, 20);

  ctx.fillStyle = "#fff";
  ctx.font = "14px 'Comic Sans MS', cursive";
  ctx.fillText(`⏱️  ${elapsed.toFixed(1)}s`, 22, 42);
  ctx.fillText(`🏁  ${cpsDone}/${CP_INDICES.length} checkpoints`, 22, 62);

  // Speed bar
  const barW = 172, barH = 8, barX = 22, barY = 82;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 4); ctx.fill();
  const spd = Math.abs(speed) / MAX_SPD;
  ctx.fillStyle = offTrack ? "#FF6B00" : "#30ee60";
  ctx.beginPath(); ctx.roundRect(barX, barY, barW * spd, barH, 4); ctx.fill();

  ctx.restore();
}

// ─── Car factory ──────────────────────────────────────────────────────────────
function makeCar(color) {
  const startAngle = Math.atan2(TRACK[1][1] - TRACK[0][1], TRACK[1][0] - TRACK[0][0]);
  return {
    x: TRACK[0][0] + 22,
    y: TRACK[0][1],
    angle: startAngle,
    speed: 0,
    color,
    offTrack: false,
    cpIdx: 0,
    finished: false,
    startTime: Date.now(),
  };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RacingChamps() {
  const canvasRef   = useRef(null);
  const gameRef     = useRef(null);   // { car, playerNum }
  const keysRef     = useRef({});
  const rafRef      = useRef(null);

  const [ui, setUi] = useState({
    phase: "intro",   // intro | racing | done1 | results
    p1Time: null,
    p2Time: null,
    elapsed: 0,
    cpsDone: 0,
    countdown: null,
  });

  // Key listeners
  useEffect(() => {
    const dn = (e) => {
      keysRef.current[e.code] = true;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))
        e.preventDefault();
    };
    const up = (e) => { keysRef.current[e.code] = false; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  // Start a player's race
  const startRace = useCallback((playerNum) => {
    const color = playerNum === 1 ? P1_COLOR : P2_COLOR;
    gameRef.current = { car: makeCar(color), playerNum };
    setUi(u => ({ ...u, phase: "racing", elapsed: 0, cpsDone: 0, countdown: null }));
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let lastElapsedUpdate = 0;

    const loop = (ts) => {
      rafRef.current = requestAnimationFrame(loop);

      // ── Draw static track ───────────────────────────────────────────────────
      drawTrack(ctx);

      const g = gameRef.current;

      if (g) {
        const { car, playerNum } = g;

        // ── Physics update ────────────────────────────────────────────────────
        if (!car.finished) {
          const k = keysRef.current;
          const turnFactor = Math.min(1, Math.abs(car.speed) / MAX_SPD * 1.8 + 0.25);

          if (k["ArrowLeft"])  car.angle -= TURN_K * turnFactor;
          if (k["ArrowRight"]) car.angle += TURN_K * turnFactor;

          const offRoadMax = MAX_SPD * 0.45;
          if (k["ArrowUp"])
            car.speed = Math.min(car.speed + ACCEL, car.offTrack ? offRoadMax : MAX_SPD);
          else if (k["ArrowDown"])
            car.speed = Math.max(car.speed - BRAKE, -MAX_SPD * 0.35);
          else
            car.speed *= FRICTION;

          if (Math.abs(car.speed) < 0.02) car.speed = 0;

          car.offTrack = !isOnRoad(car.x, car.y);
          if (car.offTrack) car.speed *= 0.87;

          car.x = Math.max(8, Math.min(W - 8, car.x + Math.cos(car.angle) * car.speed));
          car.y = Math.max(8, Math.min(H - 8, car.y + Math.sin(car.angle) * car.speed));

          // ── Checkpoint detection ────────────────────────────────────────────
          if (car.cpIdx < CP_INDICES.length) {
            const [cx, cy] = TRACK[CP_INDICES[car.cpIdx]];
            if (Math.hypot(car.x - cx, car.y - cy) < CP_RADIUS) {
              car.cpIdx++;
              setUi(u => ({ ...u, cpsDone: car.cpIdx }));
            }
          }

          // ── Finish detection ────────────────────────────────────────────────
          if (car.cpIdx >= CP_INDICES.length) {
            const [fx, fy] = TRACK[0];
            if (Math.hypot(car.x - fx, car.y - fy) < FINISH_RADIUS) {
              car.finished = true;
              const t = (Date.now() - car.startTime) / 1000;
              if (playerNum === 1) {
                setUi(u => ({ ...u, phase: "done1", p1Time: t }));
              } else {
                setUi(u => ({ ...u, phase: "results", p2Time: t }));
              }
            }
          }

          // ── Update timer display every 100ms ───────────────────────────────
          if (ts - lastElapsedUpdate > 100) {
            lastElapsedUpdate = ts;
            setUi(u => ({ ...u, elapsed: (Date.now() - car.startTime) / 1000 }));
          }
        }

        // ── Draw checkpoints ──────────────────────────────────────────────────
        drawCheckpoints(ctx, car.cpIdx);

        // ── Draw car ──────────────────────────────────────────────────────────
        drawCar(ctx, car.x, car.y, car.angle, car.color);

        // ── Off-track warning ─────────────────────────────────────────────────
        if (car.offTrack && !car.finished) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,100,0,0.55)";
          ctx.lineWidth = 8;
          ctx.strokeRect(0, 0, W, H);
          ctx.fillStyle = "rgba(255,100,0,0.18)";
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#FF6B00";
          ctx.font = "bold 22px 'Comic Sans MS', cursive";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText("🌿 Off road! Slow down!", W / 2, 12);
          ctx.restore();
        }

        // ── HUD ───────────────────────────────────────────────────────────────
        if (!car.finished) {
          const elapsed = (Date.now() - car.startTime) / 1000;
          drawHUD(ctx, playerNum, elapsed, car.cpIdx, car.speed, car.offTrack);
        }

        // ── Direction arrow at start (first few seconds) ──────────────────────
        const elapsed = (Date.now() - car.startTime) / 1000;
        if (elapsed < 4 && !car.finished) {
          const [ax, ay] = TRACK[0];
          const [bx, by] = TRACK[1];
          const arrowAng = Math.atan2(by - ay, bx - ax);
          ctx.save();
          ctx.translate(ax + Math.cos(arrowAng) * 55, ay + Math.sin(arrowAng) * 55);
          ctx.rotate(arrowAng);
          ctx.globalAlpha = Math.max(0, 1 - elapsed / 4);
          ctx.fillStyle = "#FFD700";
          ctx.font = "bold 28px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("➤", 0, 0);
          ctx.restore();
        }
      } else {
        // No game active — show just the track
        drawCheckpoints(ctx, 0);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Results helpers ────────────────────────────────────────────────────────
  const fmt = (t) => (t !== null ? `${t.toFixed(2)}s` : "—");
  const getWinner = () => {
    if (ui.p1Time === null || ui.p2Time === null) return null;
    if (ui.p1Time < ui.p2Time) return 1;
    if (ui.p2Time < ui.p1Time) return 2;
    return 0;
  };
  const winner = getWinner();

  return (
    <div style={styles.root}>
      {/* Title */}
      <div style={styles.titleRow}>
        <span style={styles.titleEmoji}>🏎️</span>
        <h1 style={styles.title}>Racing Champs!</h1>
        <span style={styles.titleEmoji}>🏆</span>
      </div>

      {/* Canvas wrapper */}
      <div style={styles.canvasWrapper}>
        <canvas ref={canvasRef} width={W} height={H} style={styles.canvas} />

        {/* ── Intro overlay ────────────────────────────────────────────────── */}
        {ui.phase === "intro" && (
          <Overlay>
            <Panel>
              <div style={{ fontSize: 56, lineHeight: 1 }}>🏎️🏁🚙</div>
              <h2 style={{ color: "#FFD700", margin: "10px 0 6px", fontSize: 28 }}>Racing Champs!</h2>
              <p style={{ color: "#ddd", margin: "0 0 6px", fontSize: 15 }}>
                Two players race around the track one at a time!
              </p>
              <div style={styles.controlsBox}>
                <div style={styles.controlRow}><span style={styles.key}>⬆️</span><span>Go faster</span></div>
                <div style={styles.controlRow}><span style={styles.key}>⬇️</span><span>Slow down / reverse</span></div>
                <div style={styles.controlRow}><span style={styles.key}>⬅️ ➡️</span><span>Steer left & right</span></div>
              </div>
              <p style={{ color: "#bbb", margin: "10px 0 18px", fontSize: 14 }}>
                🏁 Hit checkpoints <b style={{ color: "#FFD700" }}>1 → 2 → 3</b>, then cross the finish line!
              </p>
              <button onClick={() => startRace(1)} style={btnStyle(P1_COLOR)}>
                🚗 Player 1 — Let's Go!
              </button>
            </Panel>
          </Overlay>
        )}

        {/* ── Player 1 finished overlay ─────────────────────────────────────── */}
        {ui.phase === "done1" && (
          <Overlay>
            <Panel>
              <div style={{ fontSize: 52 }}>🎉</div>
              <h2 style={{ color: P1_COLOR, margin: "8px 0 4px", fontSize: 26 }}>Player 1 Finished!</h2>
              <p style={{ color: "#FFD700", fontSize: 30, margin: "4px 0 8px", fontWeight: "bold" }}>
                ⏱️ {fmt(ui.p1Time)}
              </p>
              <p style={{ color: "#ddd", margin: "0 0 20px", fontSize: 15 }}>
                Amazing race! Now it's Player 2's turn!
              </p>
              <button onClick={() => startRace(2)} style={btnStyle(P2_COLOR)}>
                🚙 Player 2 — Your Turn!
              </button>
            </Panel>
          </Overlay>
        )}

        {/* ── Results overlay ───────────────────────────────────────────────── */}
        {ui.phase === "results" && (
          <Overlay>
            <Panel>
              <div style={{ fontSize: 52 }}>
                {winner === 0 ? "🤝" : "🏆"}
              </div>
              <h2 style={{ color: "#FFD700", margin: "8px 0 4px", fontSize: 26 }}>
                {winner === 0
                  ? "It's a Tie! 🤯"
                  : `Player ${winner} Wins! 🎊`}
              </h2>
              <div style={styles.resultsTimes}>
                <div style={styles.resultRow}>
                  <span style={{ color: P1_COLOR, fontSize: 20 }}>🚗 Player 1</span>
                  <span style={{ color: "#fff", fontSize: 22, fontWeight: "bold" }}>{fmt(ui.p1Time)}</span>
                  {winner === 1 && <span style={{ fontSize: 20 }}>⭐</span>}
                </div>
                <div style={styles.resultRow}>
                  <span style={{ color: P2_COLOR, fontSize: 20 }}>🚙 Player 2</span>
                  <span style={{ color: "#fff", fontSize: 22, fontWeight: "bold" }}>{fmt(ui.p2Time)}</span>
                  {winner === 2 && <span style={{ fontSize: 20 }}>⭐</span>}
                </div>
              </div>
              {winner !== 0 && ui.p1Time !== null && ui.p2Time !== null && (
                <p style={{ color: "#aaa", fontSize: 14, margin: "4px 0 16px" }}>
                  Difference: {Math.abs(ui.p1Time - ui.p2Time).toFixed(2)}s
                </p>
              )}
              <button
                onClick={() => {
                  gameRef.current = null;
                  setUi({ phase: "intro", p1Time: null, p2Time: null, elapsed: 0, cpsDone: 0, countdown: null });
                }}
                style={btnStyle("#22bb44")}
              >
                🔄 Play Again!
              </button>
            </Panel>
          </Overlay>
        )}
      </div>

      {/* Controls legend */}
      <div style={styles.legend}>
        <LegendKey icon="⬆️" label="Accelerate" />
        <Sep />
        <LegendKey icon="⬇️" label="Brake" />
        <Sep />
        <LegendKey icon="⬅️➡️" label="Steer" />
        <Sep />
        <span style={{ color: "#888" }}>Stay on the road! 🌿</span>
      </div>
    </div>
  );
}

// ── Small sub-components ──────────────────────────────────────────────────────
function Overlay({ children }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.72)", borderRadius: 14, zIndex: 20,
    }}>
      {children}
    </div>
  );
}

function Panel({ children }) {
  return (
    <div style={{
      background: "linear-gradient(160deg, #0f0f2a, #1a1a3e)",
      borderRadius: 18, padding: "28px 36px", textAlign: "center",
      border: "2px solid #FFD700", boxShadow: "0 12px 48px rgba(0,0,0,0.8)",
      maxWidth: 380, fontFamily: "'Comic Sans MS', 'Chalkboard SE', cursive",
    }}>
      {children}
    </div>
  );
}

function LegendKey({ icon, label }) {
  return (
    <span style={{ color: "#bbb", fontSize: 13 }}>
      <span style={{ marginRight: 4 }}>{icon}</span>{label}
    </span>
  );
}

function Sep() {
  return <span style={{ color: "#444", margin: "0 10px" }}>|</span>;
}

function btnStyle(bg) {
  return {
    background: bg, color: "#fff", border: "none",
    padding: "13px 32px", borderRadius: 10, fontSize: 17,
    fontWeight: "bold", cursor: "pointer",
    boxShadow: `0 4px 16px ${bg}88`,
    fontFamily: "'Comic Sans MS', 'Chalkboard SE', cursive",
    transition: "transform 0.1s",
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  root: {
    display: "flex", flexDirection: "column", alignItems: "center",
    minHeight: "100vh", background: "linear-gradient(160deg, #0d0d1f 0%, #131330 60%, #1a1020 100%)",
    padding: "18px 16px", fontFamily: "'Comic Sans MS', 'Chalkboard SE', cursive",
    userSelect: "none",
  },
  titleRow: {
    display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
  },
  titleEmoji: { fontSize: 36 },
  title: {
    color: "#FFD700", margin: 0, fontSize: 34,
    textShadow: "0 3px 12px rgba(255,215,0,0.4), 0 1px 0 rgba(0,0,0,0.6)",
    letterSpacing: 1,
  },
  canvasWrapper: {
    position: "relative",
    boxShadow: "0 0 32px rgba(255,215,0,0.22), 0 8px 32px rgba(0,0,0,0.6)",
    borderRadius: 14,
    overflow: "hidden",
  },
  canvas: {
    display: "block",
    border: "3px solid #FFD700",
    borderRadius: 14,
  },
  legend: {
    marginTop: 12, display: "flex", alignItems: "center",
    gap: 0, flexWrap: "wrap", justifyContent: "center",
  },
  controlsBox: {
    background: "rgba(255,255,255,0.06)", borderRadius: 10,
    padding: "10px 16px", margin: "10px auto", display: "inline-block",
    textAlign: "left",
  },
  controlRow: {
    display: "flex", alignItems: "center", gap: 10,
    color: "#ddd", fontSize: 14, marginBottom: 4,
  },
  key: {
    background: "rgba(255,255,255,0.12)", borderRadius: 6,
    padding: "2px 7px", fontSize: 16, minWidth: 40, textAlign: "center",
  },
  resultsTimes: {
    margin: "14px 0 6px", display: "flex", flexDirection: "column", gap: 10,
  },
  resultRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 16, background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "8px 14px",
  },
};
