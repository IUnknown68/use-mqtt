import type {
  Ref,
} from 'vue';

import type {
  MqttClient,
  Packet,
  IClientOptions,
  IClientSubscribeOptions,
  IClientPublishOptions,
  ISubscriptionGrant,
} from 'mqtt';

/**
 * Interface exposed by useMqtt().
 */
export interface IMqttApi {
  client: MqttClientRef,
  error: ErrorRef,
  state: ConnectionStateRef,

  connected: Ref<boolean>,
  busy: Ref<boolean>,

  create: (url: string, options: Partial<IMqttCreateParams> | undefined) => void,
  open: () => void,
  close: () => void,

  publish: (
    topic: string,
    message: string,
    options: IClientPublishOptions | undefined,
  ) => Promise<Packet | undefined>,

  subscribe: (
    topic: string,
    options: Partial<ISubscriptionCreateParams> | undefined
  ) => ISubscriptionApi,
}

//------------------------------------------------------------------------------
export interface IMqttCreateParams {
  mqtt: IClientOptions,
  mapValue: MapValueFn,
}

/**
 * Interface exposed by useSubscription().
 */
export interface ISubscriptionApi {
  value: Ref<unknown>,
  error: ErrorRef,
  subscribe: () => void,
  unsubscribe: () => void,
}

//------------------------------------------------------------------------------
export interface ISubscriptionCreateParams {
  client: string,
  mapValue: (message: unknown, topic: string) => unknown,
  default: unknown,
}

/**
 * State of the underlying mqtt-connection.
 */
export enum ConnectionState {
  Closed = 0,
  Connected = 1,
  // states > Connected indicate busy states:
  Reconnecting = 2,
  Disconnecting = 3,
}

//------------------------------------------------------------------------------
export interface ISubscription {
  ref: Ref<unknown>,
  topic: string,
  error: ErrorRef,
  update: (message: unknown, topic: string, mapGlobal: MapValueFn) => void,
  subscribe: () => void,
  unsubscribe: (force?: boolean) => void,
}

//------------------------------------------------------------------------------
export interface ISubscriptionManager {
  addSubscription: (topic: string, subscription: ISubscription) => Promise<void>,
  removeSubscription: (topic: string) => Promise<void>,
}

//------------------------------------------------------------------------------
export type MqttClientRef = Ref<MqttClient | null>;
export type ErrorRef = Ref<Error | null>;
export type ConnectionStateRef = Ref<ConnectionState>;

//------------------------------------------------------------------------------
export type MapValueFn = (message: unknown, topic: string) => unknown;
