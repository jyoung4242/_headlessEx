// main.ts
import "./style.css";

import { UI } from "@peasy-lib/peasy-ui";
import { Engine, DisplayMode, Actor } from "excalibur";
import { model, template } from "./UI/UI";
import { ExcaliburHathoraClient, HathoraClientConfig } from "./Lib/HathoraPlugin";
import { LobbyVisibility, Region } from "@hathora/cloud-sdk-typescript/models/components";
import { NetworkedActor } from "./Actors/networkActor";
import { NPCActor } from "./Actors/npcActors";

await UI.create(document.body, model, template).attached;

//grab query string
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get("roomID");

const game = new Engine({
  width: 800, // the width of the canvas
  height: 600, // the height of the canvas
  canvasElementId: "cnv", // the DOM canvas element ID, if you are providing your own
  displayMode: DisplayMode.Fixed, // the display mode
  pixelArt: true,
});

await game.start();

const clientConfig: HathoraClientConfig = {
  appId: "app-6b60b294-789f-41a3-a67e-5f40baf27768",
  connectionDetails: {
    host: "localhost",
    port: 8000,
    transportType: "tcp",
  },
  updateCallbackJson: (data: any) => {
    let serverEntities = [...data.snapshot.state.players];

    for (let entity of serverEntities) {
      //@ts-ignore
      const entityFound = game.currentScene.entities.find(ent => ent.uuid === entity.id);

      if (entityFound) {
        //update entity
        if (entity.userId === "NPC") continue;
        if (entityFound.name == "label") continue;
        (entityFound as NetworkedActor).updatePosition(entity.position.x, entity.position.y);
      } else {
        //create entity
        let newEntity: Actor;
        if (entity.userId === "NPC") newEntity = new NPCActor(entity.position, entity.id);
        else newEntity = new NetworkedActor(entity.userId === hClient.userId, entity.userId, entity.id);

        console.log("new entity: ", newEntity);
        game.currentScene.add(newEntity);
      }
    }
  },
};

export const hClient = new ExcaliburHathoraClient(clientConfig);

await hClient.loginAnonymous();

console.log("user id: ", hClient.userId);

if (roomId) {
  //join room
  const roomInfo = await hClient.getLobbyInfo(roomId);
  await hClient.joinLobby(roomInfo);
} else {
  //create room
  const lobbyConfig = {
    visibility: LobbyVisibility.Local,
    region: Region.Chicago,
    roomConfig: {},
  };
  const roomObject = await hClient.createLobby(lobbyConfig);
  roomId = roomObject.roomId;
  const currentUrl = window.location.href;
  history.pushState(null, "", currentUrl + `?roomID=${roomId}`);
  console.log(window.location.href); // Updates the URL
  await hClient.joinLobby(roomObject);
}
