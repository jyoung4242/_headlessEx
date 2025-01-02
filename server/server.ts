import { Application, RoomId, startServer, UserId, verifyJwt } from "@hathora/server-sdk";
import dotenv from "dotenv";
import { SnapshotInterpolation, Types } from "@geckos.io/snapshot-interpolation";
import { Scene } from "./HeadlessEx/Scene";
import { Engine, EngineOptions } from "./HeadlessEx/Engine";
import { ClientActor, NPCActor } from "./Actor/ClientActor";
import { CollisionGroup } from "./HeadlessEx/Collision/Group/CollisionGroup";
import { SceneActivationContext } from "./HeadlessEx/Interfaces/LifecycleEvents";
import { Random, Side } from "./HeadlessEx";

const snapshotInterpolation = new SnapshotInterpolation();
const playerSpeed = 4;

export const playerColliders = new CollisionGroup("players", 0b0001, 0b0010);
export const NPCColliders = new CollisionGroup("npcs", 0b0010, 0b0001);

dotenv.config();
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

// world state for each room
type WorldState = {
  players: ServerTransmitEntities[];
  gameEngine: Engine;
  roomId: RoomId;
  rng: Random;
};

type ServerTransmitEntities = Types.Entity & {
  networkId: string;
  position: Types.Quat;
};

const rooms: Record<RoomId, WorldState> = {};

class MainScene extends Scene {
  room: RoomId | undefined;
  constructor() {
    super();
  }

  public onActivate(context: SceneActivationContext<any>): void {
    if (!context.data) return;
    this.room = context.data.roomId;
  }

  setRoom(room: RoomId) {
    this.room = room;
  }

  public onPreUpdate(engine: Engine, elapsedMs: number): void {
    updateEntities(this.room);
    const roomState = rooms[this.room];
    const roomEntities = roomState.gameEngine.currentScene.entities;
    const snapshot = snapshotInterpolation.snapshot.create({
      players: roomEntities.map(player => ({
        userId: player.name,
        id: (player as ClientActor).uuid,
        position: {
          x: (player as ClientActor).pos.x,
          y: (player as ClientActor).pos.y,
          z: 0,
          w: 0,
        },
      })),
    });
    const update = {
      snapshot,
      roomId: this.room,
    };

    server.broadcastMessage(this.room, encoder.encode(JSON.stringify(update)) as unknown as ArrayBuffer);
  }
}

type PlayerState = {
  name: string;
  id: string;
  position: Types.Quat;
  directions: string[];
};

const game: Application = {
  async verifyToken(token, roomId): Promise<UserId | undefined> {
    const userId = verifyJwt(token, process.env.HATHORA_APP_SECRET!);
    if (userId === undefined) {
      console.error("Failed to verify token", token);
    }
    return userId;
  },
  async subscribeUser(roomId, userId): Promise<void> {
    //bail if user already exists
    const existingRoom = rooms[roomId];
    if (existingRoom && existingRoom.players.find(player => player.networkId === userId)) {
      return;
    }

    let room = rooms[roomId];
    console.log("new user: ", roomId, userId);

    if (!room) {
      // create a new room
      let eConfig: EngineOptions = {
        physics: true,
        fixedUpdateTimestep: 1000 / 60,
        scenes: {
          main: MainScene,
        },
      };

      rooms[roomId] = {
        gameEngine: new Engine(eConfig),
        rng: new Random(Date.now()),
        players: [],
        roomId,
      };

      //Create NPC entities in Excalibur
      let temp1 = new NPCActor(rooms[roomId].rng);
      let temp2 = new NPCActor(rooms[roomId].rng);
      let temp3 = new NPCActor(rooms[roomId].rng);

      let serverEntity1: ServerTransmitEntities = {
        id: temp1.uuid,
        networkId: "",
        position: {
          x: temp1.pos.x,
          y: temp1.pos.y,
          z: 0,
          w: 0,
        },
      };

      let serverEntity2: ServerTransmitEntities = {
        id: temp2.uuid,
        networkId: "",
        position: {
          x: temp2.pos.x,
          y: temp2.pos.y,
          z: 0,
          w: 0,
        },
      };

      let serverEntity3: ServerTransmitEntities = {
        id: temp3.uuid,
        networkId: "",
        position: {
          x: temp3.pos.x,
          y: temp3.pos.y,
          z: 0,
          w: 0,
        },
      };

      //add to room players
      rooms[roomId].players.push(serverEntity1);
      rooms[roomId].players.push(serverEntity2);
      rooms[roomId].players.push(serverEntity3);

      room = rooms[roomId];
      room.gameEngine.start();
      room.gameEngine.goToScene("main", { sceneActivationData: { roomId } });
      room.gameEngine.currentScene.add(temp1);
      room.gameEngine.currentScene.add(temp2);
      room.gameEngine.currentScene.add(temp3);
      room = rooms[roomId];
    }

    let tempNewPlayer = new ClientActor(userId, room.rng);
    let tempNewPlayerServerEntity: ServerTransmitEntities = {
      id: tempNewPlayer.uuid,
      networkId: userId,
      position: {
        x: tempNewPlayer.pos.x,
        y: tempNewPlayer.pos.y,
        z: 0,
        w: 0,
      },
    };
    rooms[roomId].players.push(tempNewPlayerServerEntity);
    rooms[roomId].gameEngine.currentScene.add(tempNewPlayer);
  },

  async unsubscribeUser(roomId, userId): Promise<void> {
    let room = rooms[roomId];
    if (room) {
      //find player and remove
      const indexPlayertoDelete = room.players.findIndex(player => player.networkId === userId);
      //kill Actor
      let playerEntity = room.gameEngine.currentScene.entities.find(entity => entity.name == userId);
      if (playerEntity) playerEntity.kill();
      room.players.splice(indexPlayertoDelete, 1);
    }
  },

  async onMessage(roomId, userId, data): Promise<void> {
    const msg = JSON.parse(decoder.decode(data));

    // add message to player event queue
    let room = rooms[roomId];
    let engine = room.gameEngine;

    //find player in engine
    let playerEntity = engine.currentScene.entities.find(entity => entity.name == userId);

    if (playerEntity) {
      if (msg.type == "keypress") {
        // if player direction isn't there
        if (!(playerEntity as ClientActor).directions.includes(msg.direction)) {
          (playerEntity as ClientActor).directions.push(msg.direction);
        }
      } else if (msg.type == "keyrelease") {
        //splice out direction if there
        if ((playerEntity as ClientActor).directions.includes(msg.direction)) {
          (playerEntity as ClientActor).directions.splice((playerEntity as ClientActor).directions.indexOf(msg.direction), 1);
        }
      }
    }
  },
};

// Start the server
const port = parseInt(process.env.PORT ?? "4000");
const server = await startServer(game, port);
console.log(`Server listening on port ${port}`);

const updateEntities = (room: RoomId) => {
  const roomState = rooms[room];
  const players = roomState.players;

  for (const player of players) {
    //get entity
    const playerEntity = roomState.gameEngine.currentScene.entities.find(entity => (entity as ClientActor).uuid == player.id);
    let pEnt = playerEntity as ClientActor;

    if (pEnt.directions.length > 0) {
      if (pEnt.directions.includes("up")) {
        if (pEnt.getIsColliding().isColliding && pEnt.getIsColliding().collisionDirection == Side.Top) return;
        pEnt.position.y -= playerSpeed;
      }
      if (pEnt.directions.includes("down")) {
        if (pEnt.getIsColliding().isColliding && pEnt.getIsColliding().collisionDirection == Side.Bottom) return;
        pEnt.position.y += playerSpeed;
      }
      if (pEnt.directions.includes("left")) {
        if (pEnt.getIsColliding().isColliding && pEnt.getIsColliding().collisionDirection == Side.Left) return;
        pEnt.position.x -= playerSpeed;
      }
      if (pEnt.directions.includes("right")) {
        if (pEnt.getIsColliding().isColliding && pEnt.getIsColliding().collisionDirection == Side.Right) return;
        pEnt.position.x += playerSpeed;
      }
    }
  }
};
