import { Actor, CollisionType, Color, Engine, Font, Label, Vector } from "excalibur";
import { hClient } from "../main";

export class NetworkedActor extends Actor {
  directions: string[] = [];
  uuid: string = "";
  constructor(private local: boolean = false, name: string, uuid: string) {
    let mycolor: Color = Color.White;
    if (local) mycolor = Color.Red;
    else mycolor = Color.Blue;

    super({
      name,
      color: mycolor,
      width: 24,
      height: 24,
    });

    this.uuid = uuid;

    const title = new Label({
      name: "label",
      text: `${name}`,
      font: new Font({
        family: "Arial",
        size: 14,
        color: Color.White,
      }),
      pos: new Vector(-36, -30),
    });

    this.addChild(title);
  }

  onInitialize(engine: Engine): void {
    if (this.local) {
      let tempdir = "";
      engine.input.keyboard.on("press", key => {
        switch (key.key) {
          case "ArrowUp":
            tempdir = "up";
            if (!this.directions.includes("up")) {
              this.directions.push("up");
            }
            break;
          case "ArrowDown":
            tempdir = "down";
            if (!this.directions.includes("down")) {
              this.directions.push("down");
            }
            break;
          case "ArrowLeft":
            tempdir = "left";
            if (!this.directions.includes("left")) {
              this.directions.push("left");
            }
            break;
          case "ArrowRight":
            tempdir = "right";
            if (!this.directions.includes("right")) {
              this.directions.push("right");
            }
            break;
        }

        hClient.sendJson({ type: "keypress", direction: tempdir });
      });

      engine.input.keyboard.on("release", key => {
        switch (key.key) {
          case "ArrowUp":
            tempdir = "up";
            if (this.directions.includes("up")) {
              this.directions.splice(this.directions.indexOf("up"), 1);
            }
            break;
          case "ArrowDown":
            tempdir = "down";
            if (this.directions.includes("down")) {
              this.directions.splice(this.directions.indexOf("down"), 1);
            }
            break;
          case "ArrowLeft":
            tempdir = "left";
            if (this.directions.includes("left")) {
              this.directions.splice(this.directions.indexOf("left"), 1);
            }
            break;
          case "ArrowRight":
            tempdir = "right";
            if (this.directions.includes("right")) {
              this.directions.splice(this.directions.indexOf("right"), 1);
            }
            break;
        }
        hClient.sendJson({ type: "keyrelease", direction: tempdir });
      });
    }
  }

  updatePosition(x: number, y: number) {
    this.pos.x = x;
    this.pos.y = y;
  }
}
