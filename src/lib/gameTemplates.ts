import type { GameEngine } from '../types/platform';

export interface GameTemplate {
  id: string;
  engine: GameEngine;
  label: string;
  description: string;
  html: string;
}

export const GAME_TEMPLATES: GameTemplate[] = [
  {
    id: 'canvas-arena',
    engine: 'html5',
    label: 'HTML5 Canvas 2D — Arena de Presentes',
    description: 'Canvas responsivo com partículas e placar conectado ao SDK window.MinhaLiveGames.',
    html: `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Arena Interativa — Minha Live Games</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; font-family: system-ui, sans-serif; color: #f8fafc; }
    canvas { display: block; width: 100%; height: 100%; }
    #hud {
      position: fixed; top: 16px; left: 16px; right: 16px;
      display: flex; justify-content: space-between; align-items: center;
      pointer-events: none;
    }
    .panel {
      background: rgba(11, 13, 20, 0.82); border: 1px solid rgba(139, 92, 246, 0.35);
      border-radius: 10px; padding: 10px 14px;
    }
    .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; }
    .value { font-size: 22px; font-weight: 700; color: #22d3ee; font-variant-numeric: tabular-nums; }
    #feed { font-size: 13px; color: #e2e8f0; max-width: 340px; text-align: right; }
  </style>
</head>
<body>
  <canvas id="stage"></canvas>
  <div id="hud">
    <div class="panel">
      <div class="label">Pontuação da Live</div>
      <div class="value" id="score">0</div>
    </div>
    <div class="panel" id="feed">Aguardando eventos da transmissão...</div>
  </div>
  <script>
    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const feedEl = document.getElementById('feed');

    let score = 0;
    let paused = false;
    const particles = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    function spawnBurst(x, y, color, count, label) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 2 + Math.random() * 5;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          r: 5 + Math.random() * 6,
          color,
          life: 1,
          label: i === 0 ? label : ''
        });
      }
    }

    function addPoints(pts, reason) {
      score += pts;
      scoreEl.textContent = String(score);
      feedEl.textContent = reason;
      if (window.MinhaLiveGames) {
        window.MinhaLiveGames.emitScore(score);
      }
    }

    if (window.MinhaLiveGames) {
      window.MinhaLiveGames.onEvent(function(ev) {
        const cx = canvas.width * (0.25 + Math.random() * 0.5);
        const cy = canvas.height * (0.3 + Math.random() * 0.4);
        if (ev.type === 'gift' || ev.type === 'gift_count') {
          const cnt = ev.giftCount || 1;
          spawnBurst(cx, cy, '#a855f7', Math.min(36, 12 + cnt * 2), '@' + ev.senderUsername + ' enviou ' + (ev.giftName || 'Presente'));
          addPoints(25 * cnt, '@' + ev.senderUsername + ' enviou ' + cnt + 'x ' + (ev.giftName || 'Presente'));
        } else if (ev.type === 'like') {
          spawnBurst(cx, cy, '#06b6d4', 10, 'Curtida!');
          addPoints(5 * (ev.likeCount || 1), '@' + ev.senderUsername + ' curtiu a live');
        } else if (ev.type === 'comment' || ev.type === 'keyword') {
          spawnBurst(cx, cy, '#3b82f6', 12, ev.commentText || 'Comentário');
          addPoints(10, '@' + ev.senderUsername + ': ' + (ev.commentText || ''));
        } else {
          spawnBurst(cx, cy, '#22d3ee', 14, '@' + ev.senderUsername);
          addPoints(15, '@' + ev.senderUsername + ' interagiu (' + ev.type + ')');
        }
      });

      window.MinhaLiveGames.onCommand(function(cmd) {
        spawnBurst(canvas.width / 2, canvas.height / 2, '#f472b6', 28, 'Ação: ' + cmd.command);
        feedEl.textContent = 'Regra executada: ' + cmd.command;
        if (cmd.actionType === 'add_score') {
          addPoints(100, 'Bônus de regra: ' + cmd.command);
        }
      });

      window.MinhaLiveGames.onControl(function(msg) {
        if (msg.type === 'MLG:PAUSE') paused = true;
        if (msg.type === 'MLG:START') paused = false;
        if (msg.type === 'MLG:RESTART') {
          score = 0;
          particles.length = 0;
          scoreEl.textContent = '0';
          feedEl.textContent = 'Jogo reiniciado.';
          paused = false;
        }
      });
    }

    function loop() {
      if (!paused) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.08;
          p.life -= 0.015;
          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          if (p.label) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.fillText(p.label, p.x + 12, p.y);
          }
        }
        ctx.globalAlpha = 1;
      }
      requestAnimationFrame(loop);
    }
    loop();
  </script>
</body>
</html>`,
  },
  {
    id: 'phaser-arena',
    engine: 'phaser',
    label: 'Phaser 3 — Chuva de Energia',
    description: 'Cena Phaser 3 com física Arcade e resposta automática a eventos LIVE.',
    html: `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Phaser 3 Live Arena</title>
  <script src="/vendor/phaser.min.js"></script>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #07080d; }
  </style>
</head>
<body>
  <script>
    let activeScene = null;
    let totalScore = 0;

    class LiveArenaScene extends Phaser.Scene {
      constructor() { super('LiveArena'); }
      create() {
        activeScene = this;
        this.orbs = this.physics.add.group();
        this.scoreText = this.add.text(20, 20, 'Pontos Phaser: 0', {
          fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#22d3ee', fontStyle: 'bold'
        });
        this.statusText = this.add.text(20, 52, 'Envie eventos simulados ou da live para gerar orbes', {
          fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#94a3b8'
        });
      }
      spawnOrb(label, colorHex) {
        const w = this.scale.width;
        const x = Phaser.Math.Between(60, Math.max(80, w - 60));
        const circle = this.add.circle(x, 40, 18, colorHex, 0.9);
        this.physics.add.existing(circle);
        circle.body.setBounce(0.75);
        circle.body.setCollideWorldBounds(true);
        circle.body.setVelocity(Phaser.Math.Between(-160, 160), Phaser.Math.Between(40, 160));
        totalScore += 20;
        this.scoreText.setText('Pontos Phaser: ' + totalScore);
        this.statusText.setText(label);
        if (window.MinhaLiveGames) window.MinhaLiveGames.emitScore(totalScore);
        this.time.delayedCall(5000, () => circle.destroy());
      }
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      transparent: true,
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 360 } } },
      scene: [LiveArenaScene]
    });

    window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));

    if (window.MinhaLiveGames) {
      window.MinhaLiveGames.onEvent((ev) => {
        if (!activeScene) return;
        const color = ev.type === 'gift' ? 0xa855f7 : ev.type === 'like' ? 0x06b6d4 : 0x3b82f6;
        activeScene.spawnOrb('@' + ev.senderUsername + ' (' + ev.type + ')', color);
      });
      window.MinhaLiveGames.onCommand((cmd) => {
        if (!activeScene) return;
        for (let i = 0; i < 4; i++) activeScene.spawnOrb('Regra: ' + cmd.command, 0x22d3ee);
      });
      window.MinhaLiveGames.onControl((msg) => {
        if (msg.type === 'MLG:PAUSE') game.scene.pause('LiveArena');
        if (msg.type === 'MLG:START') game.scene.resume('LiveArena');
        if (msg.type === 'MLG:RESTART') {
          totalScore = 0;
          game.scene.getScene('LiveArena').scene.restart();
        }
      });
    }
  </script>
</body>
</html>`,
  },
  {
    id: 'threejs-stage',
    engine: 'threejs',
    label: 'Three.js 3D — Palco Geométrico Reativo',
    description: 'Cena WebGL 3D com detecção automática de software WebGL e reação em tempo real a presentes.',
    html: `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Three.js Live Stage</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #07080d; color: #f8fafc; font-family: system-ui, sans-serif; }
    #info { position: fixed; top: 16px; left: 16px; background: rgba(11,13,20,0.85); border: 1px solid rgba(59,130,246,0.35); border-radius: 8px; padding: 10px 14px; font-size: 13px; }
  </style>
</head>
<body>
  <div id="info">Palco 3D Three.js ativo · Aguardando eventos</div>
  <script type="module">
    import * as THREE from '/vendor/three.module.js';

    const info = document.getElementById('info');
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07080d);
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 2.2, 5.5);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: !isSoftwareGl, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0x38bdf8, 0x1e1b4b, 1.2);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xa855f7, 2.2);
    dir.position.set(3, 6, 4);
    scene.add(dir);

    const totem = new THREE.Group();
    const baseMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.3, 0.35, 32),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.25 })
    );
    const coreMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85, 0),
      new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x4c1d95, metalness: 0.4, roughness: 0.2 })
    );
    coreMesh.position.y = 1.2;
    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.06, 16, 48),
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x0891b2, metalness: 0.8, roughness: 0.15 })
    );
    ringMesh.position.y = 1.2;
    ringMesh.rotation.x = Math.PI / 3;
    totem.add(baseMesh, coreMesh, ringMesh);
    scene.add(totem);

    let spinBoost = 0;
    let paused = false;
    let score = 0;
    const clock = new THREE.Clock();

    function pulseBoost(label) {
      spinBoost = 6.0;
      score += 50;
      info.textContent = label + ' · Pontos: ' + score;
      if (window.MinhaLiveGames) window.MinhaLiveGames.emitScore(score);
    }

    if (window.MinhaLiveGames) {
      window.MinhaLiveGames.onEvent((ev) => pulseBoost('@' + ev.senderUsername + ' (' + ev.type + ')'));
      window.MinhaLiveGames.onCommand((cmd) => pulseBoost('Regra: ' + cmd.command));
      window.MinhaLiveGames.onControl((msg) => {
        if (msg.type === 'MLG:PAUSE') paused = true;
        if (msg.type === 'MLG:START') paused = false;
        if (msg.type === 'MLG:RESTART') { score = 0; spinBoost = 0; paused = false; info.textContent = 'Palco 3D reiniciado'; }
      });
    }

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function afterDraw(cb) {
      const gl = renderer.getContext();
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) setTimeout(poll, 5);
        else { gl.deleteSync(sync); setTimeout(cb, 80); }
      };
      setTimeout(poll, 5);
    }

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!paused) {
        spinBoost = Math.max(0, spinBoost - dt * 3);
        const speed = 0.8 + spinBoost;
        coreMesh.rotation.y += dt * speed;
        ringMesh.rotation.z -= dt * speed * 0.7;
      }
      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else requestAnimationFrame(tick);
    }
    tick();
  </script>
</body>
</html>`,
  },
];
