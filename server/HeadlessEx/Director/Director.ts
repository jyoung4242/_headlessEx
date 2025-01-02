import { Engine } from "../Engine";
import { Scene, SceneConstructor, isSceneConstructor } from "../Scene";
import { Logger } from "../Util/Log";
import { ActivateEvent, DeactivateEvent } from "../Events";
import { EventEmitter } from "../EventEmitter";

export interface DirectorNavigationEvent {
  sourceName: string;
  sourceScene: Scene;
  destinationName: string;
  destinationScene: Scene;
}

export type DirectorEvents = {
  navigationstart: DirectorNavigationEvent;
  navigation: DirectorNavigationEvent;
  navigationend: DirectorNavigationEvent;
};

export const DirectorEvents = {
  NavigationStart: "navigationstart",
  Navigation: "navigation",
  NavigationEnd: "navigationend",
};

export interface SceneWithOptions {
  /**
   * Scene associated with this route
   *
   * If a constructor is provided it will not be constructed until navigation is requested
   */
  scene: Scene | SceneConstructor;
}

export type WithRoot<TScenes> = TScenes | "root";

export type SceneMap<TKnownScenes extends string = any> = Record<TKnownScenes, Scene | SceneConstructor | SceneWithOptions>;

/**
 * Provide scene activation data and override any existing configured route transitions or loaders
 */
export interface GoToOptions<TActivationData = any> {
  /**
   * Optionally supply scene activation data passed to Scene.onActivate
   */
  sceneActivationData?: TActivationData;
}

/**
 * The Director is responsible for managing scenes and changing scenes in Excalibur.
 *
 * It deals with transitions, scene loaders, switching scenes
 *
 * This is used internally by Excalibur, generally not mean to
 * be instantiated end users directly.
 */
export class Director<TKnownScenes extends string = any> {
  public events = new EventEmitter<DirectorEvents>();
  private _logger = Logger.getInstance();
  private _deferredGoto?: string;
  private _initialized = false;

  /**
   * Current scene's name
   */
  currentSceneName: string;
  /**
   * Current scene playing in excalibur
   */
  currentScene: Scene;

  /**
   * All registered scenes in Excalibur
   */
  public readonly scenes: SceneMap<WithRoot<TKnownScenes>> = {} as SceneMap<WithRoot<TKnownScenes>>;

  /**
   * Holds all instantiated scenes
   */
  private _sceneToInstance = new Map<string, Scene>();

  startScene?: string;

  /**
   * The default {@apilink Scene} of the game, use {@apilink Engine.goToScene} to transition to different scenes.
   */
  public readonly rootScene: Scene;

  constructor(private _engine: Engine, scenes: SceneMap<TKnownScenes>) {
    this.rootScene = this.currentScene = new Scene();
    this.add("root", this.rootScene);
    this.currentScene = this.rootScene;
    this.currentSceneName = "root";
    for (const sceneKey in scenes) {
      const sceneOrOptions = scenes[sceneKey];
      this.add(sceneKey, sceneOrOptions);
      if (sceneKey === "root") {
        this.rootScene = this.getSceneInstance("root")!; // always a root scene
        this.currentScene = this.rootScene;
      }
    }
  }

  /**
   * Initialize the director's internal state
   */
  async onInitialize() {
    if (!this._initialized) {
      this._initialized = true;
      if (this._deferredGoto) {
        const deferredScene = this._deferredGoto;
        this._deferredGoto = undefined;
        await this.swapScene(deferredScene);
      } else {
        await this.swapScene("root");
      }
    }
  }

  get isInitialized() {
    return this._initialized;
  }

  /**
   * Configures the start scene, and optionally the transition & loader for the director
   *
   * Typically this is called at the beginning of the game to the start scene and transition and never again.
   * @param startScene
   * @param options
   */
  configureStart(startScene: WithRoot<TKnownScenes>) {
    this.startScene = startScene;
    // Fire and forget promise for the initial scene
    this.swapScene(this.startScene);
    this.currentSceneName = this.startScene;
  }

  getDeferredScene() {
    const maybeDeferred = this.getSceneDefinition(this._deferredGoto);
    if (this._deferredGoto && maybeDeferred) {
      return maybeDeferred;
    }
    return null;
  }

  /**
   * Returns a scene by name if it exists, might be the constructor and not the instance of a scene
   * @param name
   */
  getSceneDefinition(name?: string): Scene | SceneConstructor | undefined {
    const maybeScene = this.scenes[name as TKnownScenes];
    if (maybeScene instanceof Scene || isSceneConstructor(maybeScene)) {
      return maybeScene;
    } else if (maybeScene) {
      return maybeScene.scene;
    }
    return undefined;
  }

  /**
   * Returns the name of the registered scene, null if none can be found
   * @param scene
   */
  getSceneName(scene: Scene): string | null {
    for (const [name, maybeScene] of Object.entries(this.scenes)) {
      if (maybeScene instanceof Scene) {
        if (scene === maybeScene) {
          return name;
        }
      } else if (!isSceneConstructor(maybeScene)) {
        if (scene === maybeScene.scene) {
          return name;
        }
      }
    }

    for (const [name, maybeScene] of Object.entries(this.scenes)) {
      if (isSceneConstructor(maybeScene)) {
        if (scene.constructor === maybeScene) {
          return name;
        }
      } else if (!(maybeScene instanceof Scene)) {
        if (scene.constructor === maybeScene.scene) {
          return name;
        }
      }
    }
    return null;
  }

  /**
   * Returns the same Director, but asserts a scene DOES exist to the type system
   * @param name
   */
  assertAdded<TScene extends string>(name: TScene): Director<TKnownScenes | TScene> {
    return this as Director<TKnownScenes | TScene>;
  }

  /**
   * Returns the same Director, but asserts a scene DOES NOT exist to the type system
   * @param name
   */
  assertRemoved<TScene extends string>(name: TScene): Director<Exclude<TKnownScenes, TScene>> {
    return this as Director<Exclude<TKnownScenes, TScene>>;
  }

  /**
   * Adds additional Scenes to the game!
   * @param name
   * @param sceneOrRoute
   */
  add<TScene extends string>(
    name: TScene,
    sceneOrRoute: Scene | SceneConstructor | SceneWithOptions
  ): Director<TKnownScenes | TScene> {
    if (this.scenes[name as unknown as TKnownScenes]) {
      this._logger.warn("Scene", name, "already exists overwriting");
    }
    this.scenes[name as unknown as TKnownScenes] = sceneOrRoute;
    return this.assertAdded(name);
  }

  remove(scene: Scene): void;
  remove(sceneCtor: SceneConstructor): void;
  remove(name: WithRoot<TKnownScenes>): void;
  remove(nameOrScene: TKnownScenes | Scene | SceneConstructor | string) {
    if (nameOrScene instanceof Scene || isSceneConstructor(nameOrScene)) {
      const sceneOrCtor = nameOrScene;
      // remove scene
      for (const key in this.scenes) {
        if (this.scenes.hasOwnProperty(key)) {
          const potentialSceneOrOptions = this.scenes[key as TKnownScenes];
          let scene: Scene | SceneConstructor;
          if (potentialSceneOrOptions instanceof Scene || isSceneConstructor(potentialSceneOrOptions)) {
            scene = potentialSceneOrOptions;
          } else {
            scene = potentialSceneOrOptions.scene;
          }

          if (scene === sceneOrCtor) {
            if (key === this.currentSceneName) {
              throw new Error(`Cannot remove a currently active scene: ${key}`);
            }

            this._sceneToInstance.delete(key);

            delete this.scenes[key as TKnownScenes];
          }
        }
      }
    }
    if (typeof nameOrScene === "string") {
      if (nameOrScene === this.currentSceneName) {
        throw new Error(`Cannot remove a currently active scene: ${nameOrScene}`);
      }

      // remove scene
      this._sceneToInstance.delete(nameOrScene);

      delete this.scenes[nameOrScene as TKnownScenes];
    }
  }

  /**
   * Go to a specific scene, and optionally override loaders and transitions
   * @param destinationScene
   * @param options
   */
  async goToScene(destinationScene: TKnownScenes | string, options?: GoToOptions) {
    const maybeDest = this.getSceneInstance(destinationScene);
    if (!maybeDest) {
      this._logger.warn(`Scene ${destinationScene} does not exist! Check the name, are you sure you added it?`);
      return;
    }
    const sourceScene = this.currentSceneName;

    options = {
      // Engine configuration then dynamic scene transitions

      // Goto options
      ...options,
    };

    const { sceneActivationData } = options;

    this._emitEvent("navigationstart", sourceScene, destinationScene);

    // Swap to the new scene
    // Runs scene lifecycle init and activate
    await this.swapScene(destinationScene, sceneActivationData);
    this._emitEvent("navigation", sourceScene, destinationScene);
    this._emitEvent("navigationend", sourceScene, destinationScene);
  }

  /**
   * Retrieves a scene instance by key if it's registered.
   *
   * This will call any constructors that were given as a definition
   * @param scene
   */
  getSceneInstance(scene: string): Scene | undefined {
    const sceneDefinition = this.getSceneDefinition(scene);
    if (!sceneDefinition) {
      return undefined;
    }
    if (this._sceneToInstance.has(scene)) {
      return this._sceneToInstance.get(scene) as Scene;
    }
    if (sceneDefinition instanceof Scene) {
      this._sceneToInstance.set(scene, sceneDefinition);
      return sceneDefinition;
    }
    const newScene = new sceneDefinition();
    this._sceneToInstance.set(scene, newScene);
    return newScene;
  }

  /**
   * Swaps the current and destination scene after performing required lifecycle events
   * @param destinationScene
   * @param data
   */
  async swapScene<TData = undefined>(destinationScene: string, data?: TData): Promise<void> {
    const engine = this._engine;
    // if not yet initialized defer goToScene
    if (!this.isInitialized) {
      this._deferredGoto = destinationScene;
      return;
    }

    const maybeDest = this.getSceneInstance(destinationScene);

    if (maybeDest) {
      const previousScene = this.currentScene;
      const nextScene = maybeDest;

      this._logger.debug("Going to scene:", destinationScene);
      // only deactivate when initialized
      if (this.currentScene.isInitialized) {
        const context = { engine, previousScene, nextScene };
        await this.currentScene._deactivate(context);
        this.currentScene.events.emit("deactivate", new DeactivateEvent(context, this.currentScene));
      }

      // set current scene to new one
      this.currentScene = nextScene;
      this.currentSceneName = destinationScene;

      // initialize the current scene if has not been already
      await this.currentScene._initialize(engine);

      const context = { engine, previousScene, nextScene, data };
      await this.currentScene._activate(context);
      this.currentScene.events.emit("activate", new ActivateEvent(context, this.currentScene));
    } else {
      this._logger.error("Scene", destinationScene, "does not exist!");
    }
  }

  private _emitEvent(eventName: keyof DirectorEvents, sourceScene: string, destinationScene: string) {
    const source = this.getSceneDefinition(sourceScene)!;
    const dest = this.getSceneDefinition(destinationScene)!;
    this.events.emit(eventName, {
      sourceScene: source,
      sourceName: sourceScene,
      destinationScene: dest,
      destinationName: destinationScene,
    } as DirectorNavigationEvent);
  }
}
