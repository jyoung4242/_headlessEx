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
  collisionData = {
    isColliding: false,
    collisionDirection: Side.None as Side,
    other: null as Actor | null,
  };

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
    this.collisionData.isColliding = true;
    this.collisionData.collisionDirection = side;
    this.collisionData.other = other.owner as Actor;
    let otherActor = other.owner as Actor;
    let overlap: number = 0;
    switch (side) {
      case Side.None:
        break;
      case Side.Top:
        overlap = otherActor.pos.y + otherActor.height - this.pos.y;
        this.pos = new Vector(this.position.x, this.position.y + overlap);
        this.position.y += overlap;
        break;
      case Side.Bottom:
        overlap = otherActor.pos.y - (this.pos.y + this.height);
        this.pos = new Vector(this.position.x, this.position.y + overlap);
        this.position.y += overlap;
        break;
      case Side.Left:
        overlap = otherActor.pos.x + otherActor.width - this.pos.x;
        this.pos = new Vector(this.position.x + overlap, this.position.y);
        this.position.x += overlap;
        break;
      case Side.Right:
        overlap = otherActor.pos.x - (this.pos.x + this.width);
        this.pos = new Vector(this.position.x + overlap, this.position.y);
        this.position.x += overlap;
        break;
    }
  }

  public onCollisionEnd(self: Collider, other: Collider, side: Side, contact: CollisionContact): void {
    this.collisionData.isColliding = false;
    this.collisionData.collisionDirection = Side.None;
    this.collisionData.other = null;
  }

  getIsColliding() {
    return this.collisionData;
  }

  public onPreUpdate(engine: Engine, elapsedMs: number): void {
    this.pos = new Vector(this.position.x, this.position.y);
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
    super({
      name: "NPC",
      x: startingX,
      y: startingY,
      width: 24,
      height: 24,
      collisionType: CollisionType.Fixed,
      collisionGroup: NPCColliders,
    });

    this.position = { x: startingX, y: startingY, z: 0, w: 0 };
  }
}
