import { Actor, Color, Vector } from "excalibur";

export class NPCActor extends Actor {
  directions: string[] = [];
  speed = 0;
  uuid: string = "";
  constructor(position: { x: number; y: number; z: number; w: number }, uuid: string) {
    super({
      name: "NPC",
      pos: new Vector(position.x, position.y),
      width: 24,
      height: 24,
      color: Color.Black,
    });

    this.uuid = uuid;
  }
}
