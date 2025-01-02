/**
 * The current Excalibur version string
 * @description `process.env.__EX_VERSION` gets replaced by Webpack on build
 */
export const EX_VERSION = process.env.__EX_VERSION;

// This file is used as the bundle entry point and exports everything
// that will be exposed as the `ex` global variable.
export * from "./Flags";
export * from "./Id";
export * from "./Engine";
export * from "./Actor";
export * from "./Math/index";
export * from "./EventEmitter";
export * from "./Events/MediaEvents";
export * from "./Events";
export * from "./Scene";

export * from "./Timer";

export * from "./Actions/index";
export * from "./Collision/Index";

export * from "./Interfaces/Index";
export * from "./Resources/Index";

export * from "./EntityComponentSystem/index";

export * from "./Director/index";

export * from "./Color";

// ex.Events namespace
import * as events from "./Events";
export { events as Events };

// ex.Util namespaces
import * as util from "./Util/Index";
export { util as Util };

export * from "./Util/Decorators";

export * from "./Util/Observable";
export * from "./Util/Log";
export * from "./Util/Pool";
export * from "./Util/Clock";

export * from "./Util/StateMachine";
export * from "./Util/Future";
export * from "./Util/Semaphore";
export * from "./Util/Coroutine";
export * from "./Util/Assert";
//export * from "./Trigger";
