import { InitializeEvent, ActivateEvent, DeactivateEvent, PreUpdateEvent, PostUpdateEvent } from "./Events";
import { Logger } from "./Util/Log";
import { Timer } from "./Timer";
import { Engine } from "./Engine";
import { Actor } from "./Actor";
import { CanInitialize, CanActivate, CanDeactivate, CanUpdate, SceneActivationContext } from "./Interfaces/LifecycleEvents";
import * as Util from "./Util/Util";
import { Trigger } from "./Trigger";
import { SystemType } from "./EntityComponentSystem/System";
import { World } from "./EntityComponentSystem/World";
import { MotionSystem } from "./Collision/MotionSystem";
import { CollisionSystem } from "./Collision/CollisionSystem";
import { Entity } from "./EntityComponentSystem/Entity";
import { ActionsSystem } from "./Actions/ActionsSystem";
import { PhysicsWorld } from "./Collision/PhysicsWorld";
import { EventEmitter, EventKey, Handler, Subscription } from "./EventEmitter";
import { getDefaultPhysicsConfig } from "./Collision/PhysicsConfig";

export type SceneEvents = {
  initialize: InitializeEvent<Scene>;
  activate: ActivateEvent;
  deactivate: DeactivateEvent;
  preupdate: PreUpdateEvent;
  postupdate: PostUpdateEvent;
};

export const SceneEvents = {
  Initialize: "initialize",
  Activate: "activate",
  Deactivate: "deactivate",
  PreUpdate: "preupdate",
  PostUpdate: "postupdate",
  PreDraw: "predraw",
  PostDraw: "postdraw",
  PreDebugDraw: "predebugdraw",
  PostDebugDraw: "postdebugdraw",
  PreLoad: "preload",
};

export type SceneConstructor = new (...args: any[]) => Scene;
/**
 *
 */
export function isSceneConstructor(x: any): x is SceneConstructor {
  return !!x?.prototype && !!x?.prototype?.constructor?.name;
}

/**
 * {@apilink Actor | `Actors`} are composed together into groupings called Scenes in
 * Excalibur. The metaphor models the same idea behind real world
 * actors in a scene. Only actors in scenes will be updated and drawn.
 *
 * Typical usages of a scene include: levels, menus, loading screens, etc.
 */
export class Scene<TActivationData = unknown> implements CanInitialize, CanActivate<TActivationData>, CanDeactivate, CanUpdate {
  private _logger: Logger = Logger.getInstance();
  public events = new EventEmitter<SceneEvents>();

  /**
   * The ECS world for the scene
   */
  public world: World = new World(this);

  /**
   * The Excalibur physics world for the scene. Used to interact
   * with colliders included in the scene.
   *
   * Can be used to perform scene ray casts, track colliders, broadphase, and narrowphase.
   */
  public physics = new PhysicsWorld(getDefaultPhysicsConfig());

  /**
   * The actors in the current scene
   */
  public get actors(): readonly Actor[] {
    return this.world.entityManager.entities.filter((e: Entity<any>) => {
      return e instanceof Actor;
    }) as Actor[];
  }

  /**
   * The entities in the current scene
   */
  public get entities(): readonly Entity[] {
    return this.world.entityManager.entities;
  }

  /**
   * The triggers in the current scene
   */
  public get triggers(): readonly Trigger[] {
    return this.world.entityManager.entities.filter((e: Entity<any>) => {
      return e instanceof Trigger;
    }) as Trigger[];
  }

  /**
   * Access to the Excalibur engine
   */
  public engine: Engine;

  private _isInitialized: boolean = false;
  private _timers: Timer[] = [];
  public get timers(): readonly Timer[] {
    return this._timers;
  }
  private _cancelQueue: Timer[] = [];

  constructor() {
    // Initialize systems

    // Update
    this.world.add(ActionsSystem);
    this.world.add(new MotionSystem(this.world, this.physics));
    this.world.add(new CollisionSystem(this.world, this.physics));
  }

  public emit<TEventName extends EventKey<SceneEvents>>(eventName: TEventName, event: SceneEvents[TEventName]): void;
  public emit(eventName: string, event?: any): void;
  public emit<TEventName extends EventKey<SceneEvents> | string>(eventName: TEventName, event?: any): void {
    this.events.emit(eventName, event);
  }

  public on<TEventName extends EventKey<SceneEvents>>(eventName: TEventName, handler: Handler<SceneEvents[TEventName]>): Subscription;
  public on(eventName: string, handler: Handler<unknown>): Subscription;
  public on<TEventName extends EventKey<SceneEvents> | string>(eventName: TEventName, handler: Handler<any>): Subscription {
    return this.events.on(eventName, handler);
  }

  public once<TEventName extends EventKey<SceneEvents>>(
    eventName: TEventName,
    handler: Handler<SceneEvents[TEventName]>
  ): Subscription;
  public once(eventName: string, handler: Handler<unknown>): Subscription;
  public once<TEventName extends EventKey<SceneEvents> | string>(eventName: TEventName, handler: Handler<any>): Subscription {
    return this.events.once(eventName, handler);
  }

  public off<TEventName extends EventKey<SceneEvents>>(eventName: TEventName, handler: Handler<SceneEvents[TEventName]>): void;
  public off(eventName: string, handler: Handler<unknown>): void;
  public off(eventName: string): void;
  public off<TEventName extends EventKey<SceneEvents> | string>(eventName: TEventName, handler?: Handler<any>): void {
    this.events.off(eventName, handler);
  }

  /**
   * This is called before the first update of the {@apilink Scene}. Initializes scene members like the camera. This method is meant to be
   * overridden. This is where initialization of child actors should take place.
   */
  public onInitialize(engine: Engine): void {
    // will be overridden
  }

  /**
   * This is called when the scene is made active and started. It is meant to be overridden,
   * this is where you should setup any DOM UI or event handlers needed for the scene.
   */
  public onActivate(context: SceneActivationContext<TActivationData>): void {
    // will be overridden
  }

  /**
   * This is called when the scene is made transitioned away from and stopped. It is meant to be overridden,
   * this is where you should cleanup any DOM UI or event handlers needed for the scene.
   */
  public onDeactivate(context: SceneActivationContext): void {
    // will be overridden
  }

  /**
   * Safe to override onPreUpdate lifecycle event handler. Synonymous with `.on('preupdate', (evt) =>{...})`
   *
   * `onPreUpdate` is called directly before a scene is updated.
   * @param engine reference to the engine
   * @param elapsed  Number of milliseconds elapsed since the last draw.
   */
  public onPreUpdate(engine: Engine, elapsed: number): void {
    // will be overridden
  }

  /**
   * Safe to override onPostUpdate lifecycle event handler. Synonymous with `.on('preupdate', (evt) =>{...})`
   *
   * `onPostUpdate` is called directly after a scene is updated.
   * @param engine reference to the engine
   * @param elapsed  Number of milliseconds elapsed since the last draw.
   */
  public onPostUpdate(engine: Engine, elapsed: number): void {
    // will be overridden
  }

  /**
   * Initializes actors in the scene
   */
  private _initializeChildren() {
    for (const child of this.entities) {
      child._initialize(this.engine);
    }
  }

  /**
   * Gets whether or not the {@apilink Scene} has been initialized
   */
  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * It is not recommended that internal excalibur methods be overridden, do so at your own risk.
   *
   * Initializes the scene before the first update, meant to be called by engine not by users of
   * Excalibur
   * @internal
   */
  public async _initialize(engine: Engine) {
    if (!this.isInitialized) {
      try {
        this.engine = engine;
        // PhysicsWorld config is watched so things will automagically update
        this.physics.config = this.engine.physics;

        this.world.systemManager.initialize();

        // This order is important! we want to be sure any custom init that add actors
        // fire before the actor init
        await this.onInitialize(engine);
        this._initializeChildren();

        this._logger.debug("Scene.onInitialize", this, engine);
        this.events.emit("initialize", new InitializeEvent(engine, this));
      } catch (e) {
        this._logger.error(`Error during scene initialization for scene ${engine.director?.getSceneName(this)}!`);
        throw e;
      }
      this._isInitialized = true;
    }
  }

  /**
   * It is not recommended that internal excalibur methods be overridden, do so at your own risk.
   *
   * Activates the scene with the base behavior, then calls the overridable `onActivate` implementation.
   * @internal
   */
  public async _activate(context: SceneActivationContext<TActivationData>) {
    try {
      this._logger.debug("Scene.onActivate", this);
      await this.onActivate(context);
    } catch (e) {
      this._logger.error(`Error during scene activation for scene ${this.engine?.director?.getSceneName(this)}!`);
      throw e;
    }
  }

  /**
   * It is not recommended that internal excalibur methods be overridden, do so at your own risk.
   *
   * Deactivates the scene with the base behavior, then calls the overridable `onDeactivate` implementation.
   * @internal
   */
  public async _deactivate(context: SceneActivationContext<never>) {
    this._logger.debug("Scene.onDeactivate", this);
    await this.onDeactivate(context);
  }

  /**
   * It is not recommended that internal excalibur methods be overridden, do so at your own risk.
   *
   * Internal _preupdate handler for {@apilink onPreUpdate} lifecycle event
   * @internal
   */
  public _preupdate(engine: Engine, elapsed: number): void {
    this.emit("preupdate", new PreUpdateEvent(engine, elapsed, this));
    this.onPreUpdate(engine, elapsed);
  }

  /**
   *  It is not recommended that internal excalibur methods be overridden, do so at your own risk.
   *
   * Internal _preupdate handler for {@apilink onPostUpdate} lifecycle event
   * @internal
   */
  public _postupdate(engine: Engine, elapsed: number): void {
    this.emit("postupdate", new PostUpdateEvent(engine, elapsed, this));
    this.onPostUpdate(engine, elapsed);
  }

  /**
   * Updates all the actors and timers in the scene. Called by the {@apilink Engine}.
   * @param engine  Reference to the current Engine
   * @param elapsed   The number of milliseconds since the last update
   */
  public update(engine: Engine, elapsed: number) {
    if (!this.isInitialized) {
      this._logger.warnOnce(`Scene update called before initialize for scene ${engine.director?.getSceneName(this)}!`);
      return;
    }
    this._preupdate(engine, elapsed);

    // TODO differed entity removal for timers
    let i: number, len: number;
    // Remove timers in the cancel queue before updating them
    for (i = 0, len = this._cancelQueue.length; i < len; i++) {
      this.removeTimer(this._cancelQueue[i]);
    }
    this._cancelQueue.length = 0;

    // Cycle through timers updating timers
    for (const timer of this._timers) {
      timer.update(elapsed);
    }

    this.world.update(SystemType.Update, elapsed);

    this._collectActorStats(engine);

    this._postupdate(engine, elapsed);
  }

  /**
   * Checks whether an actor is contained in this scene or not
   */
  public contains(actor: Actor): boolean {
    return this.actors.indexOf(actor) > -1;
  }

  /**
   * Adds a {@apilink Timer} to the current {@apilink Scene}.
   * @param timer  The timer to add to the current {@apilink Scene}.
   */
  public add(timer: Timer): void;

  /**
   * Adds a {@apilink Trigger} to the {@apilink Scene}, once this is done the {@apilink Trigger} will listen for interactions with other actors.
   * @param trigger
   */
  public add(trigger: Trigger): void;

  /**
   * Adds an actor to the scene, once this is done the {@apilink Actor} will be drawn and updated.
   * @param actor  The actor to add to the current scene
   */
  public add(actor: Actor): void;

  /**
   * Adds an {@apilink Entity} to the scene, once this is done the {@apilink Actor} will be drawn and updated.
   * @param entity The entity to add to the current scene
   */
  public add(entity: Entity): void;

  public add(entity: any): void {
    this.emit("entityadded", { target: entity } as any);
    if (entity instanceof Timer) {
      if (!Util.contains(this._timers, entity)) {
        this.addTimer(entity);
      }
      return;
    }
    this.world.add(entity);
    entity.scene = this;
  }

  /**
   * Removes a {@apilink Timer} from it's current scene
   * and adds it to this scene.
   *
   * Useful if you want to have an object be present in only 1 scene at a time.
   * @param timer The Timer to transfer to the current scene
   */
  public transfer(timer: Timer): void;

  /**
   * Removes a {@apilink TileMap} from it's current scene
   * and adds it to this scene.
   *
   * Useful if you want to have an object be present in only 1 scene at a time.
   * @param tileMap The TileMap to transfer to the current scene
   */

  public transfer(trigger: Trigger): void;

  /**
   * Removes an {@apilink Actor} from it's current scene
   * and adds it to this scene.
   *
   * Useful if you want to have an object be present in only 1 scene at a time.
   * @param actor The Actor to transfer to the current scene
   */
  public transfer(actor: Actor): void;

  /**
   * Removes an {@apilink Entity} from it's current scene
   * and adds it to this scene.
   *
   * Useful if you want to have an object be present in only 1 scene at a time.
   * @param entity The Entity to transfer to the current scene
   */
  public transfer(entity: Entity): void;

  /**
   * Removes an {@apilink Entity} (Actor, TileMap, Trigger, etc) or {@apilink Timer} from it's current scene
   * and adds it to this scene.
   *
   * Useful if you want to have an object be present in only 1 scene at a time.
   * @param entity
   */
  public transfer(entity: any): void {
    let scene: Scene;
    if (entity instanceof Entity && entity.scene && entity.scene !== this) {
      scene = entity.scene;
      entity.scene.world.remove(entity, false);
    }
    if (entity instanceof Timer && entity.scene) {
      scene = entity.scene;
      entity.scene.removeTimer(entity);
    }

    scene?.emit("entityremoved", { target: entity } as any);
    this.add(entity);
  }

  /**
   * Removes a {@apilink Timer} from the current scene, it will no longer be updated.
   * @param timer  The timer to remove to the current scene.
   */
  public remove(timer: Timer): void;

  /**
   * Removes an actor from the scene, it will no longer be drawn or updated.
   * @param actor  The actor to remove from the current scene.
   */
  public remove(actor: Actor): void;

  public remove(entity: Entity): void;

  public remove(entity: any): void {
    this.emit("entityremoved", { target: entity } as any);
    if (entity instanceof Entity) {
      if (entity.isActive) {
        entity.kill();
      }
      this.world.remove(entity);
    }
    if (entity instanceof Timer) {
      this.removeTimer(entity);
    }
  }

  /**
   * Removes all entities and timers from the scene, optionally indicate whether deferred should or shouldn't be used.
   *
   * By default entities use deferred removal
   * @param deferred
   */
  public clear(deferred: boolean = true): void {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      this.world.remove(this.entities[i], deferred);
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.removeTimer(this.timers[i]);
    }
  }

  /**
   * Adds a {@apilink Timer} to the scene
   * @param timer  The timer to add
   */
  public addTimer(timer: Timer): Timer {
    this._timers.push(timer);
    timer.scene = this;
    return timer;
  }

  /**
   * Removes a {@apilink Timer} from the scene.
   * @warning Can be dangerous, use {@apilink cancelTimer} instead
   * @param timer  The timer to remove
   */
  public removeTimer(timer: Timer): Timer {
    const i = this._timers.indexOf(timer);
    if (i !== -1) {
      this._timers.splice(i, 1);
    }
    return timer;
  }

  /**
   * Cancels a {@apilink Timer}, removing it from the scene nicely
   * @param timer  The timer to cancel
   */
  public cancelTimer(timer: Timer): Timer {
    this._cancelQueue.push(timer);
    return timer;
  }

  /**
   * Tests whether a {@apilink Timer} is active in the scene
   */
  public isTimerActive(timer: Timer): boolean {
    return this._timers.indexOf(timer) > -1 && !timer.complete;
  }

  public isCurrentScene(): boolean {
    if (this.engine) {
      return this.engine.currentScene === this;
    }
    return false;
  }

  private _collectActorStats(engine: Engine) {}
}
