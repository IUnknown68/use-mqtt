import { Ref } from 'vue';
import { IClientPublishOptions, Packet, IClientOptions, MqttClient } from 'mqtt';

/**
 * Interface exposed by useMqtt().
 */
interface IMqttApi {
    client: MqttClientRef;
    error: ErrorRef;
    state: ConnectionStateRef;
    connected: Ref<boolean>;
    busy: Ref<boolean>;
    create: (url: string, options: Partial<IMqttCreateParams> | undefined) => void;
    open: () => void;
    close: () => void;
    publish: (topic: string, message: string, options: IClientPublishOptions | undefined) => Promise<Packet | undefined>;
    subscribe: (topic: string, options: Partial<ISubscriptionCreateParams> | undefined) => ISubscriptionApi;
}
interface IMqttCreateParams {
    mqtt: IClientOptions;
    mapValue: MapValueFn;
}
/**
 * Interface exposed by useSubscription().
 */
interface ISubscriptionApi {
    value: Ref<unknown>;
    error: ErrorRef;
    subscribe: () => void;
    unsubscribe: () => void;
}
interface ISubscriptionCreateParams {
    client: string;
    mapValue: (message: unknown, topic: string) => unknown;
    default: unknown;
}
/**
 * State of the underlying mqtt-connection.
 */
declare enum ConnectionState {
    Closed = 0,
    Connected = 1,
    Reconnecting = 2,
    Disconnecting = 3
}
interface ISubscription {
    ref: Ref<unknown>;
    topic: string;
    error: ErrorRef;
    update: (message: unknown, topic: string, mapGlobal: MapValueFn) => void;
    subscribe: () => void;
    unsubscribe: (force?: boolean) => void;
}
interface ISubscriptionManager {
    addSubscription: (topic: string, subscription: ISubscription) => Promise<void>;
    removeSubscription: (topic: string) => Promise<void>;
}
type MqttClientRef = Ref<MqttClient | null>;
type ErrorRef = Ref<Error | null>;
type ConnectionStateRef = Ref<ConnectionState>;
type MapValueFn = (message: unknown, topic: string) => unknown;

declare const DEFAULT_CLIENT_ID = "";
declare function useMqtt(id?: string): IMqttApi;
declare function useSubscription(topic: string, options?: Partial<ISubscriptionCreateParams>): ISubscriptionApi;
declare const test = "";

export { ConnectionState, type ConnectionStateRef, DEFAULT_CLIENT_ID, type ErrorRef, type IMqttApi, type IMqttCreateParams, type ISubscription, type ISubscriptionApi, type ISubscriptionCreateParams, type ISubscriptionManager, type MapValueFn, type MqttClientRef, test, useMqtt, useSubscription };
