import { Types } from "@geckos.io/snapshot-interpolation";
import { Actor, ActorArgs } from "../HeadlessEx/Actor";
import { Random } from "../HeadlessEx/Math/Random";
import { Vector } from "../HeadlessEx/Math/vector";
import { UUID } from "../UUID";
import { CollisionType } from "../HeadlessEx/Collision/CollisionType";
import { NPCColliders, playerColliders } from "../server";
import { Collider, CollisionContact, Shape } from "../HeadlessEx/Collision/Index";
import { Side } from "../HeadlessEx/Collision/Side";
import { Engine } from "../HeadlessEx/Engine";

export class ClientActor extends Actor {
  isColliding: boolean = false;
  collisionDirection: string = "";

  npcs: any[] = [];

  directions: string[] = [];
  speed: number = 4;
  position: Types.Quat;
  uuid: string = UUID.generateUUID();
  constructor(name: string, rng: Random) {
    let startingX = rng.integer(0, 800);
    let startingY = rng.integer(0, 600);

    const colBody = Shape.Box(24, 24);
    //@ts-ignore
    let config: ActorArgs = {
      name,
      x: startingX,
      y: startingY,
      width: 24,
      height: 24,
      collider: colBody,
      collisionType: CollisionType.Passive,
      collisionGroup: playerColliders,
    };

    super(config);
    console.log(this);
    this.position = { x: startingX, y: startingY, z: 0, w: 0 };
  }

  public onInitialize(engine: Engine): void {
    let ents = engine.currentScene.entities;

    for (let ent of ents) {
      if (ent.name === "NPC") {
        this.npcs.push(ent);
      }
    }
  }

  public onCollisionStart(self: Collider, other: Collider, side: Side, contact: CollisionContact): void {
    console.log("on Collision start", side);
    this.isColliding = true;
    this.collisionDirection = side;
  }

  public onCollisionEnd(self: Collider, other: Collider, side: Side, contact: CollisionContact): void {
    this.isColliding = false;
    this.collisionDirection = "";
  }

  public onPreUpdate(engine: Engine, elapsedMs: number): void {
    if (this.isColliding) {
      console.log("COLLIDING", this.collisionDirection);
    }
    this.pos = new Vector(this.position.x, this.position.y);

    /*  console.clear();
    console.log({
      player: { x: this.pos.x, y: this.pos.y },
      npcs: { ...this.npcs.map(npc => ({ x: npc.pos.x, y: npc.pos.y })) },
    }); */
  }
}

export class NPCActor extends Actor {
  npcs: any[] = [];
  isColliding: boolean = false;
  collisionDirection: string = "";
  directions: string[] = [];
  speed = 0;
  uuid: string = UUID.generateUUID();
  position: Types.Quat;
  constructor(rng: Random) {
    let startingX = rng.integer(0, 800);
    let startingY = rng.integer(0, 600);

    const colBody = Shape.Box(24, 24);
    //@ts-ignore
    super({
      name: "NPC",
      x: startingX,
      y: startingY,
      width: 24,
      height: 24,
      collisionType: CollisionType.Fixed,
      collisionGroup: NPCColliders,
      collider: colBody,
    });

    this.position = { x: startingX, y: startingY, z: 0, w: 0 };
  }
}
