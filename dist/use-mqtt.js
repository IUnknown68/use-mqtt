'use strict';

var vueDemi = require('vue-demi');
var core = require('@vueuse/core');
var mqttLib = require('mqtt');

var ConnectionState = /* @__PURE__ */ ((ConnectionState2) => {
  ConnectionState2[ConnectionState2["Closed"] = 0] = "Closed";
  ConnectionState2[ConnectionState2["Connected"] = 1] = "Connected";
  ConnectionState2[ConnectionState2["Reconnecting"] = 2] = "Reconnecting";
  ConnectionState2[ConnectionState2["Disconnecting"] = 3] = "Disconnecting";
  return ConnectionState2;
})(ConnectionState || {});

class Subscription {
  constructor(mqtt, topic, options = {}) {
    this.topic = topic;
    this.refCount = 0;
    this.ref = vueDemi.ref(options.default);
    this.error = vueDemi.ref(null);
    this.update = this.update.bind(this);
    this.subscribe = this.subscribe.bind(this);
    this.unsubscribe = (force = false) => {
      --this.refCount;
      if (force || this.refCount < 1) {
        this.error.value = null;
        mqtt.removeSubscription(this.topic).catch((err) => {
          this.error.value = err;
        });
      }
    };
    if (typeof options.mapValue === "function") {
      this.mapValue = options.mapValue;
    } else {
      this.mapValue = this.mapValue.bind(this);
    }
    this.error.value = null;
    mqtt.addSubscription(this.topic, this).catch((err) => {
      this.error.value = err;
    });
  }
  mapValue(message, topic) {
    return message;
  }
  update(message, topic, globalMapValue) {
    this.ref.value = this.mapValue(globalMapValue(message, topic), topic);
  }
  subscribe() {
    ++this.refCount;
  }
  unsubscribe(force = false) {
  }
}

const isConnected = core.reactify((state) => state === ConnectionState.Connected);
const isBusy = core.reactify((state) => state > ConnectionState.Connected);
const getSubscription = core.reactify(
  (mqtt, topic, options) => mqtt.subscriptions.get(topic) || new Subscription(mqtt, topic, options)
);
const getSubscriptionValue = core.reactify((subscription) => subscription.ref.value);
const getSubscriptionError = core.reactify((subscription) => subscription.error.value);
class ReactiveMqtt {
  constructor(id) {
    this.id = id;
    this.subscriptions = /* @__PURE__ */ new Map();
    this.client = vueDemi.shallowRef(null);
    this.state = vueDemi.ref(ConnectionState.Closed);
    this.create = this.create.bind(this);
    this.open = this.open.bind(this);
    this.close = this.close.bind(this);
    this.publish = this.publish.bind(this);
    this.subscribe = this.subscribe.bind(this);
    this.hook = {
      // Error is writable!
      error: vueDemi.ref(null),
      client: vueDemi.shallowReadonly(this.client),
      state: vueDemi.shallowReadonly(this.state),
      connected: isConnected(this.state),
      busy: isBusy(this.state),
      create: this.create,
      open: this.open,
      close: this.close,
      publish: this.publish,
      subscribe: this.subscribe
    };
  }
  //----------------------------------------------------------------------------
  getHook() {
    return {
      ...this.hook
    };
  }
  //----------------------------------------------------------------------------
  create(url, options = {}) {
    new Promise((resolve, reject) => {
      const handleError = (err) => {
        this.state.value = ConnectionState.Closed;
        reject(err);
      };
      try {
        if (this.client.value) {
          return;
        }
        this.hook.error.value = null;
        const {
          mapValue = (v) => v
        } = options;
        this.client.value = mqttLib.connect(url, {
          ...options.mqtt || {},
          manualConnect: true
        });
        this.client.value.on("connect", () => {
          this.hook.error.value = null;
          this.state.value = ConnectionState.Connected;
          for (const subscription of this.subscriptions.values()) {
            this.client.value.subscribeAsync(subscription.topic).catch((err) => {
              subscription.error.value = err;
            });
          }
          resolve(this.hook);
        });
        this.client.value.on("reconnect", () => {
          this.hook.error.value = null;
          this.state.value = ConnectionState.Reconnecting;
        });
        this.client.value.on("disconnect", (packet) => {
          this.state.value = ConnectionState.Disconnecting;
          const err = new Error("Disconnected");
          reject(err);
        });
        this.client.value.on("close", () => {
          this.state.value = ConnectionState.Closed;
          reject(new Error("Closed"));
        });
        this.client.value.on("offline", () => {
          this.state.value = ConnectionState.Closed;
          reject(new Error("Offline"));
        });
        this.client.value.on("message", async (topic, message) => {
          try {
            const subscription = this.subscriptions.get(topic);
            if (subscription) {
              await subscription.update(message, topic, mapValue);
            } else {
              await this.client.value.unsubscribeAsync(topic);
            }
          } catch (err) {
            console.warn(`Unsubscribe failed: ${err.message}`);
          }
        });
        this.client.value.on("error", handleError);
        if (!options.mqtt?.manualConnect) {
          this.client.value.reconnect();
        }
      } catch (err) {
        handleError(err);
      }
    }).catch((err) => {
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
  publish(topic, message, options) {
    if (this.client.value && this.state.value === ConnectionState.Connected) {
      return this.client.value.publishAsync(topic, message, options);
    }
    return Promise.reject(new Error("Not connected"));
  }
  //----------------------------------------------------------------------------
  subscribe(topic, options = {}) {
    const subscriptionRecordRef = getSubscription(this, topic, options);
    vueDemi.watch(subscriptionRecordRef, (newValue, oldValue) => {
      if (oldValue) {
        oldValue.unsubscribe();
      }
      if (newValue) {
        newValue.subscribe();
      }
    });
    if (vueDemi.getCurrentInstance()) {
      vueDemi.onMounted(subscriptionRecordRef.value.subscribe);
      vueDemi.onBeforeUnmount(subscriptionRecordRef.value.unsubscribe);
    } else {
      subscriptionRecordRef.value.subscribe();
    }
    return {
      value: getSubscriptionValue(subscriptionRecordRef),
      error: getSubscriptionError(subscriptionRecordRef),
      subscribe: () => subscriptionRecordRef.value.subscribe(),
      unsubscribe: () => subscriptionRecordRef.value.unsubscribe()
    };
  }
  //----------------------------------------------------------------------------
  async addSubscription(topic, subscription) {
    this.subscriptions.set(topic, subscription);
    if (this.hook.connected.value && this.client.value) {
      await this.client.value.subscribeAsync(topic);
    }
  }
  //----------------------------------------------------------------------------
  async removeSubscription(topic) {
    this.subscriptions.delete(topic);
    if (this.hook.connected.value && this.client.value) {
      await this.client.value.unsubscribeAsync(topic);
    }
  }
}

const DEFAULT_CLIENT_ID = "";
const clientInstances = /* @__PURE__ */ new Map();
function useMqtt(id = DEFAULT_CLIENT_ID) {
  return getMqtt(id, true).getHook();
}
function useSubscription(topic, options = {}) {
  return getMqtt(options.client || DEFAULT_CLIENT_ID, true).subscribe(topic, options);
}
function getMqtt(id = DEFAULT_CLIENT_ID, create = false) {
  let mqtt = clientInstances.get(id);
  if (!mqtt && create) {
    mqtt = new ReactiveMqtt(id);
    clientInstances.set(id, mqtt);
  }
  return mqtt;
}
const test = DEFAULT_CLIENT_ID;

exports.ConnectionState = ConnectionState;
exports.DEFAULT_CLIENT_ID = DEFAULT_CLIENT_ID;
exports.test = test;
exports.useMqtt = useMqtt;
exports.useSubscription = useSubscription;
//# sourceMappingURL=use-mqtt.js.map
