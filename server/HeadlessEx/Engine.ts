import { EX_VERSION } from "./";
import { EventEmitter, EventKey, Handler, Subscription } from "./EventEmitter";
import { Flags } from "./Flags";
import { CanUpdate, CanInitialize } from "./Interfaces/LifecycleEvents";
import { Actor } from "./Actor";
import { Timer } from "./Timer";
import { GameStartEvent, GameStopEvent, PreUpdateEvent, PostUpdateEvent, InitializeEvent } from "./Events";
import { Logger } from "./Util/Log";
import { Scene, SceneConstructor, isSceneConstructor } from "./Scene";
import { Entity } from "./EntityComponentSystem/Entity";
import { Clock, IntervalClock } from "./Util/Clock";
import { GoToOptions, SceneMap, Director, SceneWithOptions, WithRoot } from "./Director/Director";
import { getDefaultPhysicsConfig, PhysicsConfig } from "./Collision/PhysicsConfig";
import { DeepRequired } from "./Util/Required";
import { Context, createContext, useContext } from "./Context";
import { mergeDeep } from "./Util/Util";

export type EngineEvents = {
  initialize: InitializeEvent<Engine>;
  start: GameStartEvent;
  stop: GameStopEvent;
  preupdate: PreUpdateEvent<Engine>;
  postupdate: PostUpdateEvent<Engine>;
};

export const EngineEvents = {
  Initialize: "initialize",
  Start: "start",
  Stop: "stop",
  PreUpdate: "preupdate",
  PostUpdate: "postupdate",
} as const;

/**
 * Enum representing the different mousewheel event bubble prevention
 */
export enum ScrollPreventionMode {
  /**
   * Do not prevent any page scrolling
   */
  None,
  /**
   * Prevent page scroll if mouse is over the game canvas
   */
  Canvas,
  /**
   * Prevent all page scrolling via mouse wheel
   */
  All,
}

/**
 * Defines the available options to configure the Excalibur engine at constructor time.
 */
export interface EngineOptions<TKnownScenes extends string = any> {
  /**
   * Suppress boot up console message, which contains the "powered by Excalibur message"
   */
  suppressConsoleBootMessage?: boolean;

  /**
   * Optionally configure a fixed update timestep in milliseconds, this can be desirable if you need the physics simulation to be very stable. When
   * set the update step and physics will use the same elapsed time for each tick even if the graphical framerate drops. In order for the
   * simulation to be correct, excalibur will run multiple updates in a row (at the configured update elapsed) to catch up, for example
   * there could be X updates and 1 draw each clock step.
   *
   * **NOTE:** This does come at a potential perf cost because each catch-up update will need to be run if the fixed rate is greater than
   * the current instantaneous framerate, or perf gain if the fixed rate is less than the current framerate.
   *
   * By default is unset and updates will use the current instantaneous framerate with 1 update and 1 draw each clock step.
   *
   * **WARN:** `fixedUpdateTimestep` takes precedence over `fixedUpdateFps` use whichever is most convenient.
   */
  fixedUpdateTimestep?: number;

  /**
   * Optionally configure a fixed update fps, this can be desirable if you need the physics simulation to be very stable. When set
   * the update step and physics will use the same elapsed time for each tick even if the graphical framerate drops. In order for the
   * simulation to be correct, excalibur will run multiple updates in a row (at the configured update elapsed) to catch up, for example
   * there could be X updates and 1 draw each clock step.
   *
   * **NOTE:** This does come at a potential perf cost because each catch-up update will need to be run if the fixed rate is greater than
   * the current instantaneous framerate, or perf gain if the fixed rate is less than the current framerate.
   *
   * By default is unset and updates will use the current instantaneous framerate with 1 update and 1 draw each clock step.
   *
   * **WARN:** `fixedUpdateTimestep` takes precedence over `fixedUpdateFps` use whichever is most convenient.
   */
  fixedUpdateFps?: number;

  /**
   * Optionally configure the physics simulation in excalibur
   *
   * If false, Excalibur will not produce a physics simulation.
   *
   * Default is configured to use {@apilink SolverStrategy.Arcade} physics simulation
   */
  physics?: boolean | PhysicsConfig;

  /**
   * Optionally specify scenes with their transitions and loaders to excalibur's scene {@apilink Director}
   *
   * Scene transitions can can overridden dynamically by the `Scene` or by the call to `.goToScene`
   */
  scenes?: SceneMap<TKnownScenes>;
}

/**
 * The Excalibur Engine
 *
 * The {@apilink Engine} is the main driver for a game. It is responsible for
 * starting/stopping the game, maintaining state, transmitting events,
 * loading resources, and managing the scene.
 */
export class Engine<TKnownScenes extends string = any> implements CanInitialize, CanUpdate {
  static Context: Context<Engine | null> = createContext<Engine | null>();
  static useEngine(): Engine {
    const value = useContext(Engine.Context);

    if (!value) {
      throw new Error("Cannot inject engine with `useEngine()`, `useEngine()` was called outside of Engine lifecycle scope.");
    }

    return value;
  }
  static InstanceCount = 0;

  /**
   * Anything run under scope can use `useEngine()` to inject the current engine
   * @param cb
   */
  scope = <TReturn>(cb: () => TReturn) => Engine.Context.scope(this, cb);

  /**
   * Current Excalibur version string
   *
   * Useful for plugins or other tools that need to know what features are available
   */
  public readonly version = EX_VERSION;

  /**
   * Listen to and emit events on the Engine
   */
  public events = new EventEmitter<EngineEvents>();

  /**
   * Scene director, manages all scenes, scene transitions, and loaders in excalibur
   */
  public director: Director<TKnownScenes>;

  /**
   * Direct access to the physics configuration for excalibur
   */
  public physics: DeepRequired<PhysicsConfig>;

  /**
   * Optionally configure a fixed update fps, this can be desirable if you need the physics simulation to be very stable. When set
   * the update step and physics will use the same elapsed time for each tick even if the graphical framerate drops. In order for the
   * simulation to be correct, excalibur will run multiple updates in a row (at the configured update elapsed) to catch up, for example
   * there could be X updates and 1 draw each clock step.
   *
   * **NOTE:** This does come at a potential perf cost because each catch-up update will need to be run if the fixed rate is greater than
   * the current instantaneous framerate, or perf gain if the fixed rate is less than the current framerate.
   *
   * By default is unset and updates will use the current instantaneous framerate with 1 update and 1 draw each clock step.
   *
   * **WARN:** `fixedUpdateTimestep` takes precedence over `fixedUpdateFps` use whichever is most convenient.
   */
  public readonly fixedUpdateFps?: number;

  /**
   * Optionally configure a fixed update timestep in milliseconds, this can be desirable if you need the physics simulation to be very stable. When
   * set the update step and physics will use the same elapsed time for each tick even if the graphical framerate drops. In order for the
   * simulation to be correct, excalibur will run multiple updates in a row (at the configured update elapsed) to catch up, for example
   * there could be X updates and 1 draw each clock step.
   *
   * **NOTE:** This does come at a potential perf cost because each catch-up update will need to be run if the fixed rate is greater than
   * the current instantaneous framerate, or perf gain if the fixed rate is less than the current framerate.
   *
   * By default is unset and updates will use the current instantaneous framerate with 1 update and 1 draw each clock step.
   *
   * **WARN:** `fixedUpdateTimestep` takes precedence over `fixedUpdateFps` use whichever is most convenient.
   */
  public readonly fixedUpdateTimestep?: number;

  /**
   * Direct access to the excalibur clock
   */
  public clock: Clock;

  /**
   * The current {@apilink Scene} being drawn and updated on screen
   */
  public get currentScene(): Scene {
    return this.director.currentScene;
  }

  /**
   * The current {@apilink Scene} being drawn and updated on screen
   */
  public get currentSceneName(): string {
    return this.director.currentSceneName;
  }

  /**
   * The default {@apilink Scene} of the game, use {@apilink Engine.goToScene} to transition to different scenes.
   */
  public get rootScene(): Scene {
    return this.director.rootScene;
  }

  /**
   * Contains all the scenes currently registered with Excalibur
   */
  public get scenes(): { [key: string]: Scene | SceneConstructor | SceneWithOptions } {
    return this.director.scenes;
  }
  /**
   * The action to take when a fatal exception is thrown
   */
  public onFatalException = (e: any) => {
    Logger.getInstance().fatal(e, e.stack);
  };

  private _logger: Logger;

  private _timescale: number = 1.0;

  private _isInitialized: boolean = false;

  public emit<TEventName extends EventKey<EngineEvents>>(eventName: TEventName, event: EngineEvents[TEventName]): void;
  public emit(eventName: string, event?: any): void;
  public emit<TEventName extends EventKey<EngineEvents> | string>(eventName: TEventName, event?: any): void {
    this.events.emit(eventName, event);
  }

  public on<TEventName extends EventKey<EngineEvents>>(
    eventName: TEventName,
    handler: Handler<EngineEvents[TEventName]>
  ): Subscription;
  public on(eventName: string, handler: Handler<unknown>): Subscription;
  public on<TEventName extends EventKey<EngineEvents> | string>(eventName: TEventName, handler: Handler<any>): Subscription {
    return this.events.on(eventName, handler);
  }

  public once<TEventName extends EventKey<EngineEvents>>(
    eventName: TEventName,
    handler: Handler<EngineEvents[TEventName]>
  ): Subscription;
  public once(eventName: string, handler: Handler<unknown>): Subscription;
  public once<TEventName extends EventKey<EngineEvents> | string>(eventName: TEventName, handler: Handler<any>): Subscription {
    return this.events.once(eventName, handler);
  }

  public off<TEventName extends EventKey<EngineEvents>>(eventName: TEventName, handler: Handler<EngineEvents[TEventName]>): void;
  public off(eventName: string, handler: Handler<unknown>): void;
  public off(eventName: string): void;
  public off<TEventName extends EventKey<EngineEvents> | string>(eventName: TEventName, handler?: Handler<any>): void {
    this.events.off(eventName, handler);
  }

  /**
   * Default {@apilink EngineOptions}
   */
  private static _DEFAULT_ENGINE_OPTIONS: EngineOptions = {
    suppressConsoleBootMessage: null,
  };

  constructor(options?: EngineOptions<TKnownScenes>) {
    options = { ...Engine._DEFAULT_ENGINE_OPTIONS, ...options };

    Flags.freeze();

    // Use native console API for color fun
    // eslint-disable-next-line no-console
    if (console.log && !options.suppressConsoleBootMessage) {
      // eslint-disable-next-line no-console
      console.log(
        `%cPowered by Excalibur.js (v${EX_VERSION})`,
        "background: #176BAA; color: white; border-radius: 5px; padding: 15px; font-size: 1.5em; line-height: 80px;"
      );
      // eslint-disable-next-line no-console
      console.log(
        "\n\
      /| ________________\n\
O|===|* >________________>\n\
      \\|"
      );
      // eslint-disable-next-line no-console
      console.log("Visit", "http://excaliburjs.com", "for more information");
    }

    this._logger = Logger.getInstance();

    this._logger.debug("Building engine...");

    this.fixedUpdateTimestep = options.fixedUpdateTimestep ?? this.fixedUpdateTimestep;
    this.fixedUpdateFps = options.fixedUpdateFps ?? this.fixedUpdateFps;
    this.fixedUpdateTimestep = this.fixedUpdateTimestep || 1000 / this.fixedUpdateFps;

    this.clock = new IntervalClock({
      intervalMS: this.fixedUpdateTimestep,
      tick: this._mainloop.bind(this),
      onFatalException: e => this.onFatalException(e),
    });

    if (typeof options.physics === "boolean") {
      this.physics = {
        ...getDefaultPhysicsConfig(),
        enabled: options.physics,
      };
    } else {
      this.physics = {
        ...getDefaultPhysicsConfig(),
      };
      mergeDeep(this.physics, options.physics);
    }
    this.director = new Director(this, options.scenes);

    this._initialize(options);

    Engine.InstanceCount++;
  }

  private _disposed = false;
  /**
   * Attempts to completely clean up excalibur resources, including removing the canvas from the dom.
   *
   * To start again you will need to new up an Engine.
   */
  public dispose() {
    if (!this._disposed) {
      this._disposed = true;
      this.stop();

      Engine.InstanceCount--;
    }
  }

  public isDisposed() {
    return this._disposed;
  }

  /**
   * Gets the current engine timescale factor (default is 1.0 which is 1:1 time)
   */
  public get timescale() {
    return this._timescale;
  }

  /**
   * Sets the current engine timescale factor. Useful for creating slow-motion effects or fast-forward effects
   * when using time-based movement.
   */
  public set timescale(value: number) {
    if (value < 0) {
      Logger.getInstance().warnOnce("engine.timescale to a value less than 0 are ignored");
      return;
    }

    this._timescale = value;
  }

  /**
   * Adds a {@apilink Timer} to the {@apilink currentScene}.
   * @param timer  The timer to add to the {@apilink currentScene}.
   */
  public addTimer(timer: Timer): Timer {
    return this.currentScene.addTimer(timer);
  }

  /**
   * Removes a {@apilink Timer} from the {@apilink currentScene}.
   * @param timer  The timer to remove to the {@apilink currentScene}.
   */
  public removeTimer(timer: Timer): Timer {
    return this.currentScene.removeTimer(timer);
  }

  /**
   * Adds a {@apilink Scene} to the engine, think of scenes in Excalibur as you
   * would levels or menus.
   * @param key  The name of the scene, must be unique
   * @param scene The scene to add to the engine
   */
  public addScene<TScene extends string>(
    key: TScene,
    scene: Scene | SceneConstructor | SceneWithOptions
  ): Engine<TKnownScenes | TScene> {
    this.director.add(key, scene);
    return this as Engine<TKnownScenes | TScene>;
  }

  /**
   * Removes a {@apilink Scene} instance from the engine
   * @param scene  The scene to remove
   */
  public removeScene(scene: Scene | SceneConstructor): void;
  /**
   * Removes a scene from the engine by key
   * @param key  The scene key to remove
   */
  public removeScene(key: string): void;
  /**
   * @internal
   */
  public removeScene(entity: any): void {
    this.director.remove(entity);
  }

  /**
   * Adds a {@apilink Scene} to the engine, think of scenes in Excalibur as you
   * would levels or menus.
   * @param sceneKey  The key of the scene, must be unique
   * @param scene     The scene to add to the engine
   */
  public add(sceneKey: string, scene: Scene | SceneConstructor | SceneWithOptions): void;
  /**
   * Adds a {@apilink Timer} to the {@apilink currentScene}.
   * @param timer  The timer to add to the {@apilink currentScene}.
   */
  public add(timer: Timer): void;
  /**
   * Adds a {@apilink TileMap} to the {@apilink currentScene}, once this is done the TileMap
   * will be drawn and updated.
   */
  public add(actor: Actor): void;

  public add(entity: Entity): void;

  public add(entity: any): void {
    if (arguments.length === 2) {
      this.director.add(<string>arguments[0], <Scene | SceneConstructor | SceneWithOptions>arguments[1]);
      return;
    }
    const maybeDeferred = this.director.getDeferredScene();
    if (maybeDeferred instanceof Scene) {
      maybeDeferred.add(entity);
    } else {
      this.currentScene.add(entity);
    }
  }

  /**
   * Removes a scene instance from the engine
   * @param scene  The scene to remove
   */
  public remove(scene: Scene | SceneConstructor): void;
  /**
   * Removes a scene from the engine by key
   * @param sceneKey  The scene to remove
   */
  public remove(sceneKey: string): void;
  /**
   * Removes a {@apilink Timer} from the {@apilink currentScene}.
   * @param timer  The timer to remove to the {@apilink currentScene}.
   */
  public remove(timer: Timer): void;
  /**
   * Removes a {@apilink TileMap} from the {@apilink currentScene}, it will no longer be drawn or updated.
   */
  public remove(actor: Actor): void;
  /**
   * Removes a {@apilink ScreenElement} to the scene, it will no longer be drawn or updated
   * @param screenElement  The ScreenElement to remove from the {@apilink currentScene}
   */
  public remove(entity: any): void {
    if (entity instanceof Entity) {
      this.currentScene.remove(entity);
    }

    if (entity instanceof Scene || isSceneConstructor(entity)) {
      this.removeScene(entity);
    }

    if (typeof entity === "string") {
      this.removeScene(entity);
    }
  }

  /**
   * Changes the current scene with optionally supplied:
   * * Activation data
   * * Transitions
   * * Loaders
   *
   * Example:
   * ```typescript
   * game.goToScene('myScene', {
   *   sceneActivationData: {any: 'thing at all'},
   *   destinationIn: new FadeInOut({duration: 1000, direction: 'in'}),
   *   sourceOut: new FadeInOut({duration: 1000, direction: 'out'}),
   *   loader: MyLoader
   * });
   * ```
   *
   * Scenes are defined in the Engine constructor
   * ```typescript
   * const engine = new ex.Engine({
      scenes: {...}
    });
   * ```
   * Or by adding dynamically
   *
   * ```typescript
   * engine.addScene('myScene', new ex.Scene());
   * ```
   * @param destinationScene
   * @param options
   */
  public async goToScene<TData = undefined>(destinationScene: WithRoot<TKnownScenes>, options?: GoToOptions<TData>): Promise<void> {
    await this.scope(async () => {
      await this.director.goToScene(destinationScene, options);
    });
  }

  /**
   * Initializes the internal canvas, rendering context, display mode, and native event listeners
   */
  private _initialize(options?: EngineOptions) {}

  public onInitialize(engine: Engine) {
    // Override me
  }

  /**
   * Gets whether the actor is Initialized
   */
  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  private async _overrideInitialize(engine: Engine) {
    if (!this.isInitialized) {
      await this.director.onInitialize();
      await this.onInitialize(engine);
      this.events.emit("initialize", new InitializeEvent(engine, this));
      this._isInitialized = true;
    }
  }

  /**
   * Updates the entire state of the game
   * @param elapsed  Number of milliseconds elapsed since the last update.
   */
  private _update(elapsed: number) {
    // Publish preupdate events
    this.clock.__runScheduledCbs("preupdate");
    this._preupdate(elapsed);

    // process engine level events
    this.currentScene.update(this, elapsed);

    // Publish update event
    this.clock.__runScheduledCbs("postupdate");
    this._postupdate(elapsed);
  }

  /**
   * @internal
   */
  public _preupdate(elapsed: number) {
    this.emit("preupdate", new PreUpdateEvent(this, elapsed, this));
    this.onPreUpdate(this, elapsed);
  }

  /**
   * Safe to override method
   * @param engine The reference to the current game engine
   * @param elapsed  The time elapsed since the last update in milliseconds
   */
  public onPreUpdate(engine: Engine, elapsed: number) {
    // Override me
  }

  /**
   * @internal
   */
  public _postupdate(elapsed: number) {
    this.emit("postupdate", new PostUpdateEvent(this, elapsed, this));
    this.onPostUpdate(this, elapsed);
  }

  /**
   * Safe to override method
   * @param engine The reference to the current game engine
   * @param elapsed  The time elapsed since the last update in milliseconds
   */
  public onPostUpdate(engine: Engine, elapsed: number) {
    // Override me
  }

  public async start(): Promise<void> {
    await this.scope(async () => {
      // Start the excalibur clock which drives the mainloop
      this._logger.debug("Starting game clock...");
      this.clock.start();
      this._logger.debug("Game clock started");

      // Initialize before ready
      await this._overrideInitialize(this);
      this.emit("start", new GameStartEvent(this));
    });
  }

  /**
   * Returns the current frames elapsed milliseconds
   */
  public currentFrameElapsedMs = 0;

  /**
   * Returns the current frame lag when in fixed update mode
   */
  public currentFrameLagMs = 0;

  private _lagMs = 0;
  private _mainloop(elapsed: number) {
    this.scope(() => {
      const elapsedMs = elapsed * this.timescale;
      this.currentFrameElapsedMs = elapsedMs;
      const fixedTimestepMs = this.fixedUpdateTimestep;
      if (this.fixedUpdateTimestep) {
        this._lagMs += elapsedMs;
        while (this._lagMs >= fixedTimestepMs) {
          this._update(fixedTimestepMs);
          this._lagMs -= fixedTimestepMs;
        }
      } else {
        this._update(elapsedMs);
      }
      this.currentFrameLagMs = this._lagMs;
    });
  }

  /**
   * Stops Excalibur's main loop, useful for pausing the game.
   */
  public stop() {
    if (this.clock.isRunning()) {
      this.emit("stop", new GameStopEvent(this));
      this.clock.stop();
      this._logger.debug("Game stopped");
    }
  }

  /**
   * Returns the Engine's running status, Useful for checking whether engine is running or paused.
   */
  public isRunning() {
    return this.clock.isRunning();
  }

  private _screenShotRequests: { preserveHiDPIResolution: boolean; resolve: (image: HTMLImageElement) => void }[] = [];
  /**
   * Takes a screen shot of the current viewport and returns it as an
   * HTML Image Element.
   * @param preserveHiDPIResolution in the case of HiDPI return the full scaled backing image, by default false
   */
  public screenshot(preserveHiDPIResolution = false): Promise<HTMLImageElement> {
    const screenShotPromise = new Promise<HTMLImageElement>(resolve => {
      this._screenShotRequests.push({ preserveHiDPIResolution, resolve });
    });
    return screenShotPromise;
  }
}
