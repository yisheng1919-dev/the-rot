import * as THREE from "three";
import { ROOMS } from "../rooms.js";

function makeLabelSprite(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const scale = 4;
  canvas.width = 256 * scale;
  canvas.height = 64 * scale;
  ctx.scale(scale, scale);
  ctx.font = "bold 22px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(10,14,28,0.55)";
  ctx.fillRect(0, 10, 256, 44);
  ctx.fillStyle = "#cfe9ff";
  ctx.fillText(text, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4.2, 1.05, 1);
  return sprite;
}

function makeCharacter({ color, ghost = false }) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.1,
    transparent: ghost,
    opacity: ghost ? 0.45 : 1,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 8), bodyMat);
  body.position.y = 0.75;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), bodyMat);
  head.position.y = 1.42;
  head.castShadow = true;
  group.add(head);

  // Simple visor / face plate for a "cute but mysterious" low-poly look.
  const visorMat = new THREE.MeshStandardMaterial({
    color: ghost ? 0x2a3560 : 0x0d1220,
    roughness: 0.2,
    metalness: 0.3,
    transparent: ghost,
    opacity: ghost ? 0.5 : 1,
  });
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.06), visorMat);
  visor.position.set(0, 1.44, 0.28);
  group.add(visor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: ghost ? 0.25 : 0.55, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  return group;
}

export class GameScene3D {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070f);
    this.scene.fog = new THREE.Fog(0x05070f, 30, 68);

    this.camera = new THREE.PerspectiveCamera(42, this.width / this.height, 0.1, 200);
    this.cameraOffset = new THREE.Vector3(0, 17, 11);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this._buildLighting();
    this._buildRooms();

    this.playerMeshes = new Map(); // playerId -> THREE.Group
    this.selfId = null;

    this._raf = null;
    this._tick = this._tick.bind(this);
    this._tick();

    this._resizeHandler = () => this.resize();
    window.addEventListener("resize", this._resizeHandler);
  }

  _buildLighting() {
    const hemi = new THREE.HemisphereLight(0x8fa8ff, 0x0a0d1a, 0.55);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xbcd4ff, 0.9);
    this.keyLight.position.set(10, 22, 6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.keyLight);

    this.emergencyLight = new THREE.PointLight(0xff4d5e, 0, 40, 2);
    this.emergencyLight.position.set(0, 6, 0);
    this.scene.add(this.emergencyLight);
  }

  _buildRooms() {
    this.floorGroup = new THREE.Group();
    for (const room of ROOMS) {
      const geo = new THREE.BoxGeometry(room.w, 0.4, room.d);
      const mat = new THREE.MeshStandardMaterial({ color: room.color, roughness: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(room.x + room.w / 2, -0.2, room.z + room.d / 2);
      mesh.receiveShadow = true;
      this.floorGroup.add(mesh);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x35e6d0, transparent: true, opacity: 0.25 })
      );
      edges.position.copy(mesh.position);
      this.floorGroup.add(edges);

      const label = makeLabelSprite(room.label);
      label.position.set(room.x + room.w / 2, 0.05, room.z + room.d / 2);
      label.rotation.x = -Math.PI / 2;
      this.floorGroup.add(label);
    }
    this.scene.add(this.floorGroup);

    // Neutral connective ground so gaps between rooms aren't a void.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x090c16, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.25;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  setSelfId(id) {
    this.selfId = id;
  }

  setBlackout(on) {
    this.emergencyLight.intensity = on ? 2.2 : 0;
    this.keyLight.intensity = on ? 0.12 : 0.9;
    this.scene.fog.near = on ? 6 : 30;
    this.scene.fog.far = on ? 16 : 68;
    this.scene.background = new THREE.Color(on ? 0x03040a : 0x05070f);
  }

  /**
   * players: [{ playerId, x, z, connected, isGhostView }]
   * isGhostView: true if the *viewer* is a ghost (renders others w/ ghost tint)
   */
  updatePlayers(players, viewerIsGhost) {
    const seen = new Set();
    for (const p of players) {
      seen.add(p.playerId);
      let mesh = this.playerMeshes.get(p.playerId);
      const isSelf = p.playerId === this.selfId;
      const color = isSelf ? 0x35e6d0 : viewerIsGhost ? 0x9b6bff : 0xdfe6ff;
      if (!mesh) {
        mesh = makeCharacter({ color, ghost: viewerIsGhost && !isSelf });
        this.scene.add(mesh);
        this.playerMeshes.set(p.playerId, mesh);
      }
      mesh.position.x += (p.x - mesh.position.x) * 0.35;
      mesh.position.z += (p.z - mesh.position.z) * 0.35;
      mesh.visible = p.connected !== false;
    }
    for (const [id, mesh] of this.playerMeshes.entries()) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.playerMeshes.delete(id);
      }
    }
  }

  focusOn(x, z) {
    this._focus = { x, z };
  }

  _tick() {
    this._raf = requestAnimationFrame(this._tick);
    const focus = this._focus || { x: 0, z: 0 };
    const targetPos = new THREE.Vector3(focus.x, 0, focus.z).add(this.cameraOffset);
    this.camera.position.lerp(targetPos, 0.12);
    this.camera.lookAt(focus.x, 0, focus.z);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._resizeHandler);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
