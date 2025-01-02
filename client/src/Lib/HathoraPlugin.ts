/**********************************************************************************
The HathoraPlugin.ts module provides a set of interfaces and classes related to 
integration with the Hathora platform. It allows developers to easily connect 
their game to the Hathora server and interact with the platform's features such 
as lobbies, matchmaking, and player management.

Interfaces

HathoraClientConfig: This interface defines the configuration options for the 
Hathora client. It includes the appId of the game, the connectionDetails for 
establishing a connection with the server, and an updateCallback function that 
will be called whenever there is an update from the server.

Connection Details: This interface defines the details required to establish a 
connection with the server. It includes the host, port, and protocol of the 
server.

export declare type ConnectionDetails = {
    host: string;
    port: number;
    transportType: "tcp" | "tls" | "udp";
};

HathoraLobbyConfig: This interface defines the configuration options for creating
 a lobby. It includes the region where the lobby will be hosted, the visibility of
 the lobby, and other optional parameters.

Classes

ExcaliburHathoraClient: This class extends the HathoraConnection class from the 
Hathora client SDK and provides additional functionality specific to the Excalibur
game engine. It includes methods for creating and managing lobbies, joining and 
leaving lobbies, and handling player events.

Overall, HathoraPlugin.ts simplifies the integration of Hathora features into an 
Excalibur game by providing a convenient API for creating and managing lobbies, 
handling player events, and interacting with the Hathora server.

Client Process:
1. Create a new ExcaliburHathoraClient instance with the necessary configuration options.
2. Use the Authentication methods to authenticate the player.
3. Use the Lobby methods to find lobbies, create lobbies, join lobbies, and leave lobbies.
4. Use the client to send and receive data from the server.

*/

import { HathoraCloud } from "@hathora/cloud-sdk-typescript";
import { HathoraConnection, ConnectionDetails, HathoraClient } from "@hathora/client-sdk";
import {
  Region,
  LobbyVisibility,
  PlayerTokenObject,
  LobbyV3,
  ConnectionInfoV2,
  ExposedPort,
} from "@hathora/cloud-sdk-typescript/models/components";

export interface HathoraClientConfig {
  appId: string;
  connectionDetails: ConnectionDetails;
  updateCallback?: (data: any) => void;
  updateCallbackString?: (data: string) => void;
  updateCallbackJson?: (data: any) => void;
}

export interface HathoraLobbyConfig {
  region: Region;
  visibility: LobbyVisibility;
  roomConfig?: any;
}

export enum HathoraConnectionStatus {
  loggedOut,
  loggedIn,
  Connected,
}

export class ExcaliburHathoraClient {
  private _hathoraSDK: HathoraCloud;
  private _userid: string | null = null;
  private _appId: string;
  private _lobbyService;
  private _roomService;
  private _authService;
  private _loginResponse: PlayerTokenObject | null = null;
  private _publicLobbies: LobbyV3[] = [];
  private _privateLobbies: LobbyV3[] = [];
  private _connectionInfo: ConnectionInfoV2 | null = null;
  private _connection: HathoraConnection | null = null;
  private _roomId: string | null = null;
  private _connectionDetails: ConnectionDetails;
  private _updateCallback: ((data: any) => void) | undefined = undefined;
  private _updateCallbackString: ((data: string) => void) | undefined = undefined;
  private _updateCallbackJson: ((data: any) => void) | undefined = undefined;
  private _connectionStatus: HathoraConnectionStatus = HathoraConnectionStatus.loggedOut;

  constructor(clientConfig: HathoraClientConfig) {
    this._hathoraSDK = new HathoraCloud({
      appId: clientConfig.appId,
    });
    this._appId = clientConfig.appId;
    this._lobbyService = this._hathoraSDK.lobbiesV3;
    this._roomService = this._hathoraSDK.roomsV2;
    this._authService = this._hathoraSDK.authV1;
    this._connectionDetails = clientConfig.connectionDetails;
    if (clientConfig.updateCallback) this._updateCallback = clientConfig.updateCallback;
    if (clientConfig.updateCallbackString) this._updateCallbackString = clientConfig.updateCallbackString;
    if (clientConfig.updateCallbackJson) this._updateCallbackJson = clientConfig.updateCallbackJson;
  }

  //#region Authentication
  /************************
  Authentication Methods
  ************************/

  async loginAnonymous() {
    this._loginResponse = await this._authService.loginAnonymous();
    if (this._loginResponse.token) this._connectionStatus = HathoraConnectionStatus.loggedIn;
    this._userid = HathoraClient.getUserFromToken(this._loginResponse.token).id;
    return this._loginResponse;
  }

  async loginGoogle(googleId: string) {
    this._loginResponse = await this._authService.loginGoogle({ idToken: googleId });
    if (this._loginResponse.token) this._connectionStatus = HathoraConnectionStatus.loggedIn;
    this._userid = HathoraClient.getUserFromToken(this._loginResponse.token).id;
    return this._loginResponse;
  }

  async loginNickName(nickName: string) {
    this._loginResponse = await this._authService.loginNickname({ nickname: nickName });
    if (this._loginResponse.token) this._connectionStatus = HathoraConnectionStatus.loggedIn;
    this._userid = HathoraClient.getUserFromToken(this._loginResponse.token).id;
    return this._loginResponse;
  }

  logout() {
    this._loginResponse = null;
    this._connectionStatus = HathoraConnectionStatus.loggedOut;
    this._userid = "";
  }

  //#endregion Authentication

  //#region Lobby
  /************************
  Lobby Methods
  ************************/
  async createLobby(lobbyConfig: HathoraLobbyConfig): Promise<LobbyV3> {
    if (this._connectionStatus != HathoraConnectionStatus.loggedIn) throw new Error("No user logged in");
    if (this._loginResponse === null) throw new Error("No user logged in");

    let roomConfig;
    lobbyConfig.roomConfig ? (roomConfig = lobbyConfig.roomConfig) : (roomConfig = {});

    let lobbyResult = await this._lobbyService.createLobby(
      {
        playerAuth: this._loginResponse?.token as string,
      },
      {
        region: lobbyConfig.region,
        visibility: lobbyConfig.visibility,
        roomConfig: JSON.stringify(roomConfig),
      },
      this._appId
    );

    if (lobbyConfig.visibility === LobbyVisibility.Private || lobbyConfig.visibility === LobbyVisibility.Local) {
      this._privateLobbies.push(lobbyResult);
    }

    return lobbyResult;
  }

  async fetchPublicLobbies(): Promise<LobbyV3[]> {
    if (this._connectionStatus != HathoraConnectionStatus.loggedIn) throw new Error("No user logged in");
    if (this._loginResponse === null) throw new Error("No user logged in");

    this._publicLobbies = await this._lobbyService.listActivePublicLobbies(this._appId);
    return this._publicLobbies;
  }

  async fetchPrivateLocalLobbies() {
    if (this._connectionStatus != HathoraConnectionStatus.loggedIn) throw new Error("No user logged in");
    if (this._loginResponse === null) throw new Error("No user logged in");

    return this._privateLobbies;
  }

  async getLobbyInfo(roomId: string): Promise<LobbyV3> {
    if (this._connectionStatus != HathoraConnectionStatus.loggedIn) throw new Error("No user logged in");
    if (this._loginResponse === null) throw new Error("No user logged in");

    return await this._lobbyService.getLobbyInfoByRoomId(roomId, this._appId);
  }

  async joinLobby(room: LobbyV3) {
    if (this._connectionStatus != HathoraConnectionStatus.loggedIn) throw new Error("No user logged in");
    if (this._loginResponse === null) throw new Error("No user logged in");

    let connectionInfo;
    if (room.visibility == LobbyVisibility.Local) {
      connectionInfo = this._connectionDetails;
      await delay(500);
    } else {
      let ConnectionDetails = await this._roomService.getConnectionInfo(room.roomId, this._appId);
      //await this.roomClient.getConnectionInfo(
      connectionInfo = ConnectionDetails.exposedPort;
    }

    if (connectionInfo) {
      this._roomId = room.roomId;
      this._connection = new HathoraConnection(this._roomId, connectionInfo as ExposedPort as ConnectionDetails);
      await this._connection.connect(this._loginResponse.token);
      if (this._updateCallback)
        this._connection.onMessage((event: ArrayBuffer) => {
          this._updateCallback!(event);
        });
      if (this._updateCallbackString)
        this._connection.onMessageString((event: string) => {
          this._updateCallbackString!(event);
        });
      if (this._updateCallbackJson)
        this._connection.onMessageJson((event: any) => {
          this._updateCallbackJson!(event);
        });
      this._connection.onClose((e: any) => {
        this._connection = null;
        this._roomId = null;
        this._connectionInfo = null;
      });
    }
  }

  async leaveLobby() {
    if (this._connectionStatus != HathoraConnectionStatus.Connected) throw new Error("User not connected to room");

    if (this._loginResponse === null) throw new Error("No user logged in");

    if (!this._connectionInfo?.roomId) return;
    if (!this._roomId) return;
    if (this._connectionInfo?.roomId) {
      this._connection?.disconnect();
      this._roomId = null;
    }
  }

  //#endregion Lobby

  //#region SendingData
  /************************
  Sending Data
  ************************/
  send(data: any) {
    if (!this._connection) return;
    if (!this._roomId) return;
    this._connection?.write(data);
  }

  sendString(data: string) {
    if (!this._connection) return;
    if (!this._roomId) return;
    this._connection?.writeString(data);
  }

  sendJson(data: any) {
    if (!this._connection) return;
    if (!this._roomId) return;
    this._connection?.writeJson(data);
  }

  //#endregion SendingData

  //#region settersgetters

  get roomId(): string | null {
    return this._roomId;
  }

  get userId(): string | null {
    return this._userid;
  }

  get connectionStatus(): HathoraConnectionStatus {
    return this._connectionStatus;
  }
  //#endregion settersgetters
}

//async delay function
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
