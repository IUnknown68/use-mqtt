import {
  Ref,
  ref,
  shallowRef,
  shallowReactive,
  shallowReadonly,
  watch,
  unref,
  onMounted,
  onBeforeUnmount,
  getCurrentInstance,
} from 'vue';
import { reactify } from '@vueuse/core';

import mqttLib, {
  MqttClient,
  Packet,
  IClientOptions,
  IClientSubscribeOptions,
  IClientPublishOptions,
  ISubscriptionGrant,
} from 'mqtt';

import {
  ConnectionState,
  ISubscription,
  MqttClientRef,
  ConnectionStateRef,
  IMqttApi,
  IMqttCreateParams,
  ISubscriptionCreateParams,
  ISubscriptionApi,
  ISubscriptionManager,
} from './types';

import Subscription from './Subscription';

//------------------------------------------------------------------------------
const isConnected = reactify((state: ConnectionState) =>
  (state === ConnectionState.Connected));

//------------------------------------------------------------------------------
const isBusy = reactify((state: ConnectionState) =>
  (state > ConnectionState.Connected));

//------------------------------------------------------------------------------
const getSubscription = reactify(
  (mqtt: ReactiveMqtt, topic: string, options: Partial<ISubscriptionCreateParams>) =>
    mqtt.subscriptions.get(topic) || new Subscription(mqtt, topic, options)
);

//------------------------------------------------------------------------------
const getSubscriptionValue = reactify((subscription: ISubscription) =>
  (subscription.ref.value));

//------------------------------------------------------------------------------
const getSubscriptionError = reactify((subscription: ISubscription) =>
  (subscription.error.value));

//------------------------------------------------------------------------------
class ReactiveMqtt implements ISubscriptionManager {
  id: string;
  subscriptions: Map<string, ISubscription>;
  client: MqttClientRef;
  state: ConnectionStateRef;
  hook: IMqttApi;

  constructor(id: string) {
    this.id = id;
    this.subscriptions = new Map();

    this.client = shallowRef(null);
    this.state = ref(ConnectionState.Closed);

    this.create = this.create.bind(this);
    this.open = this.open.bind(this);
    this.close = this.close.bind(this);

    this.publish = this.publish.bind(this);
    this.subscribe = this.subscribe.bind(this);

    this.hook = {
      // Error is writable!
      error: ref(null),
      client: shallowReadonly(this.client),
      state: shallowReadonly(this.state),

      connected: isConnected(this.state),
      busy: isBusy(this.state),

      create: this.create,
      open: this.open,
      close: this.close,

      publish: this.publish,
      subscribe: this.subscribe,
    };
  }

  //----------------------------------------------------------------------------
  getHook(): IMqttApi {
    return {
      ...this.hook,
    };
  }

  //----------------------------------------------------------------------------
  create(url: string, options: Partial<IMqttCreateParams> = {}) : void {
    (new Promise((resolve, reject) => {
      const handleError = (err: Error) => {
        this.state.value = ConnectionState.Closed;
        reject(err);
      }

      try {
        if (this.client.value) {
          return;
        }
        this.hook.error.value = null;

        const {
          mapValue = (v) => v,
        } = options;

        this.client.value = mqttLib.connect(url, {
          ...(options.mqtt || {}),
          manualConnect: true,
        });

        this.client.value.on('connect', () => {
          this.hook.error.value = null;
          this.state.value = ConnectionState.Connected;
          for (const subscription of this.subscriptions.values()) {
            this.client.value!.subscribeAsync(subscription.topic).catch((err) => {
              subscription.error.value = err as Error;
            });
          }
          resolve(this.hook);
        });

        this.client.value.on('reconnect', () => {
          this.hook.error.value = null;
          this.state.value = ConnectionState.Reconnecting;
        });

        this.client.value.on('disconnect', (packet) => {
          this.state.value = ConnectionState.Disconnecting;
          const err = new Error('Disconnected');
          reject(err);
        });

        this.client.value.on('close', () => {
          this.state.value = ConnectionState.Closed;
          reject(new Error('Closed'));
        });

        this.client.value.on('offline', () => {
          this.state.value = ConnectionState.Closed;
          reject(new Error('Offline'));
        });

        this.client.value.on('message', async (topic, message) => {
          try {
            const subscription = this.subscriptions.get(topic);
            if (subscription) {
              await subscription.update(message, topic, mapValue);
            } else {
              await this.client.value!.unsubscribeAsync(topic);
            }
          } catch (err) {
            // TODO: Don't report in production mode.
            console.warn(`Unsubscribe failed: ${(err as Error).message}`);
          }
        });

        this.client.value.on('error', handleError);

        if (!options.mqtt?.manualConnect) {
          this.client.value.reconnect();
        }
      } catch (err) {
        handleError(err as Error);
      }
    })).catch((err) => {
      this.hook.error.value = err;
    });
  }

  //----------------------------------------------------------------------------
  open() {
    if (this.client.value && this.state.value === ConnectionState.Closed) {
      this.client.value.reconnect();
    }
  }

  //----------------------------------------------------------------------------
  close() {
    if (this.client.value && this.state.value === ConnectionState.Connected) {
      this.client.value.end();
    }
  }

  //----------------------------------------------------------------------------
  publish(
    topic: string,
    message: string,
    options: IClientPublishOptions | undefined,
  ) : Promise<Packet | undefined> {
    if (this.client.value && this.state.value === ConnectionState.Connected) {
      return this.client.value.publishAsync(topic, message, options);
    }
    return Promise.reject(new Error('Not connected'));
  }

  //----------------------------------------------------------------------------
  subscribe(
    topic: string | Ref<string>,
    options: Partial<ISubscriptionCreateParams> | undefined  = {}
  ) : ISubscriptionApi {
    /*
    const topic: string = unref(topicMaybeRef);
    const subscription = (this.subscriptions.get(topic) || new Subscription(this, topic, options));

    if (getCurrentInstance()) {
      onMounted(subscription.subscribe);
      onBeforeUnmount(subscription.unsubscribe);
    } else {
      // Increment refcount when not in a setup().
      // Requires an explicit unsubscribe(), but for now that's what I consider
      // the most desired behavior. A subscription might dangle, but you can be
      // sure it will stay valid even if you forgot to call subscribe().
      subscription.subscribe();
    }

    return subscription.getHook();
    */

    const subscriptionRecordRef = getSubscription(this, topic, options);

    watch(subscriptionRecordRef, (newValue, oldValue) => {
      if (oldValue) {
        oldValue.unsubscribe();
      }
      if (newValue) {
        newValue.subscribe();
      }
    });

    if (getCurrentInstance()) {
      onMounted(subscriptionRecordRef.value.subscribe);
      onBeforeUnmount(subscriptionRecordRef.value.unsubscribe);
    } else {
      // Increment refcount when not in a setup().
      // Requires an explicit unsubscribe(), but for now that's what I consider
      // the most desired behavior. A subscription might dangle, but you can be
      // sure it will stay valid even if you forgot to call subscribe().
      subscriptionRecordRef.value.subscribe();
    }

    // These will always refer to subscriptionRecordRef, no matter where
    // that actually points to. So the hook is fully reactive.
    return {
      value: getSubscriptionValue(subscriptionRecordRef),
      error: getSubscriptionError(subscriptionRecordRef),
      subscribe: () => subscriptionRecordRef.value.subscribe(),
      unsubscribe: () => subscriptionRecordRef.value.unsubscribe(),
    };
  }

  //----------------------------------------------------------------------------
  async addSubscription(topic: string, subscription: ISubscription) {
    this.subscriptions.set(topic, subscription);
    if (this.hook.connected.value && this.client.value) {
      await this.client.value.subscribeAsync(topic);
    }
  }

  //----------------------------------------------------------------------------
  async removeSubscription(topic: string) {
    this.subscriptions.delete(topic);
    if (this.hook.connected.value && this.client.value) {
      await this.client.value.unsubscribeAsync(topic);
    }
  }
}

export default ReactiveMqtt;
