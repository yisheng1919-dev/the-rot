import * as THREE from "three";
import { ROOMS, CORRIDORS, OBSTACLES, roomAt } from "../rooms.js";

const ROOM_ASSETS = {
  CONTROL_ROOM: "01_control_room",
  LOBBY: "02_lobby",
  MAP_ROOM: "03_map_room",
  STORAGE: "04_storage",
  CAFETERIA: "05_cafeteria",
  POWER_ROOM: "06_power_room",
  UPPER_ENGINE: "07_upper_engine",
  SECURITY: "08_security",
  WEAPONS: "09_weapons",
  MEDBAY: "10_medbay",
  O2_ROOM: "11_o2_room",
  LOWER_ENGINE: "12_lower_engine",
};

const OBSTACLE_COLORS = [0x263550, 0x4d3340, 0x31594f, 0x76512f];

export class GameScene3D {
  constructor(container, { scale = 24 } = {}) {
    this.container = container;
    this.selfId = null;
    this.players = [];
    this.viewerIsGhost = false;
    this.visibleRoomId = null;
    this.blackout = false;
    this.viewerIsCorrupted = false;
    this.focus = { x: 0, z: 0 };
    this.selfPos = null;
    this.scale = scale;
    this.round = 1;
    this.animState = new Map();
    this.textures = new Map();
    this.playerObjects = new Map();
    this.zoneObjects = [];
    this.obstacleObjects = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070f);
    this.camera = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.1, 200);
    this.camera.zoom = 1;
    this.targetZoom = 1;
    this.camera.position.set(0, 28, 18);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xb9d8ff, 0x151827, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(-8, 30, 10);
    keyLight.castShadow = true;
    this.scene.add(keyLight);
    this._buildMap();

    this._resize = this.resize.bind(this);
    window.addEventListener("resize", this._resize);
    this.resize();
    this._raf = requestAnimationFrame(this._tick.bind(this));
  }

  _loadTexture(url) {
    if (!this.textures.has(url)) {
      const texture = new THREE.TextureLoader().load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(url, texture);
    }
    return this.textures.get(url);
  }

  _makeBox(width, height, depth, color, y = height / 2) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.08 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _buildMap() {
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x11182b, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 80), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    for (const corridor of CORRIDORS) {
      const mesh = this._makeBox(corridor.w, 0.12, corridor.d, 0x18213b, 0);
      mesh.position.set(corridor.x + corridor.w / 2, 0, corridor.z + corridor.d / 2);
      this.scene.add(mesh);
    }

    for (const room of ROOMS) {
      const group = new THREE.Group();
      group.userData.roomId = room.id;
      group.position.set(room.x + room.w / 2, 0, room.z + room.d / 2);
      const texture = this._loadTexture(`/sprites/room/${ROOM_ASSETS[room.id]}.png`);
      const floorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(room.w, room.d),
        new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: 0.95 })
      );
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.y = 0.07;
      floorMesh.receiveShadow = true;
      group.add(floorMesh);

      const wallColor = new THREE.Color(room.color).multiplyScalar(0.48);
      const wallHeight = 0.45;
      const wallThickness = 0.28;
      const walls = [
        [room.w, wallHeight, wallThickness, 0, wallHeight / 2, -room.d / 2],
        [room.w, wallHeight, wallThickness, 0, wallHeight / 2, room.d / 2],
        [wallThickness, wallHeight, room.d, -room.w / 2, wallHeight / 2, 0],
        [wallThickness, wallHeight, room.d, room.w / 2, wallHeight / 2, 0],
      ];
      for (const [w, h, d, x, y, z] of walls) {
        const wall = this._makeBox(w, h, d, wallColor.getHex(), y);
        wall.position.set(x, y, z);
        wall.material.transparent = true;
        wall.material.opacity = 0.82;
        group.add(wall);
      }
      this.scene.add(group);
      this.zoneObjects.push(group);
    }

    for (const obstacle of OBSTACLES) {
      const height = obstacle.h || 1.2;
      const color = OBSTACLE_COLORS[obstacle.colorIndex || 0];
      const mesh = this._makeBox(obstacle.w, height, obstacle.d, color, height / 2);
      mesh.position.set(obstacle.x + obstacle.w / 2, height / 2, obstacle.z + obstacle.d / 2);
      mesh.userData.roomId = obstacle.roomId;
      this.scene.add(mesh);
      this.obstacleObjects.push(mesh);
    }
  }

  setSelfId(id) { this.selfId = id; }
  setBlackout(on, viewerIsCorrupted = false) {
    this.blackout = on;
    this.viewerIsCorrupted = viewerIsCorrupted;
    this.targetZoom = on && !viewerIsCorrupted ? 2.2 : 1;
  }
  setVisibleRoom(roomId) { this.visibleRoomId = roomId; }
  setRound(round) { this.round = round; }
  focusOn(x, z) { this.focus = { x, z }; }
  setSelfMotion(x, z, moving, facing) {
    this.selfPos = { x, z };
    if (!this.selfId) return;
    const previous = this.animState.get(this.selfId) || {};
    this.animState.set(this.selfId, { ...previous, moving, facing: facing || previous.facing || "front" });
  }

  updatePlayers(players, viewerIsGhost = false) {
    this.players = players;
    this.viewerIsGhost = viewerIsGhost;
    const activeIds = new Set(players.map((p) => p.playerId));
    for (const [id, object] of this.playerObjects) {
      if (!activeIds.has(id)) {
        this.scene.remove(object);
        this.playerObjects.delete(id);
      }
    }
    for (const player of players) this._updatePlayerObject(player);
  }

  _updatePlayerObject(player) {
    let object = this.playerObjects.get(player.playerId);
    if (!object) {
      object = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      object.userData.currentPose = "";
      this.scene.add(object);
      this.playerObjects.set(player.playerId, object);
    }
    const isSelf = player.playerId === this.selfId;
    const x = isSelf && this.selfPos ? this.selfPos.x : player.x;
    const z = isSelf && this.selfPos ? this.selfPos.z : player.z;
    const playerRoom = roomAt(x, z);
    object.visible = isSelf || !this.visibleRoomId || playerRoom?.id === this.visibleRoomId;
    object.position.set(x, 1.1, z);
    object.renderOrder = z;
    const state = this.animState.get(player.playerId) || { moving: false, facing: "front" };
    const pose = state.moving ? `walk_${((Math.floor(performance.now() / 90) % 5) + 1)}` : `dir_${state.facing || "front"}`;
    const color = player.color || "beige";
    const url = `/sprites/characters/${color}/${pose === "dir_left" ? "dir_right" : pose}.png`;
    if (object.userData.currentPose !== url) {
      object.material.map = this._loadTexture(url);
      object.material.needsUpdate = true;
      object.userData.currentPose = url;
    }
    object.material.opacity = player.connected === false ? 0.35 : this.viewerIsGhost && !isSelf ? 0.55 : 1;
    object.material.color.set(this.viewerIsGhost && !isSelf ? 0xb0b8ff : 0xffffff);
    object.scale.set(1.05, 1.55, 1);
    object.material.rotation = pose === "dir_left" ? Math.PI : 0;
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const viewHeight = 336 / this.scale;
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  _tick(now = performance.now()) {
    this._raf = requestAnimationFrame(this._tick.bind(this));
    this.camera.position.x += (this.focus.x - this.camera.position.x) * 0.16;
    this.camera.position.z += (this.focus.z + 18 - this.camera.position.z) * 0.16;
    this.camera.zoom += (this.targetZoom - this.camera.zoom) * 0.12;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
    for (const group of this.zoneObjects) group.visible = !this.visibleRoomId || group.userData.roomId === this.visibleRoomId;
    for (const mesh of this.obstacleObjects) mesh.visible = !this.visibleRoomId || mesh.userData.roomId === this.visibleRoomId;
    for (const player of this.players) this._updatePlayerObject(player);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._resize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }
}
