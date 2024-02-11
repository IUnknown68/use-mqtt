import {
  Ref,
  ref,
} from 'vue';
import { reactify } from '@vueuse/core';

import {
  ISubscriptionCreateParams,
  MapValueFn,
  ISubscription,
  ISubscriptionManager,
  ErrorRef,
} from './types';

//------------------------------------------------------------------------------
class Subscription implements ISubscription {
  topic: string;
  refCount: number;
  ref: Ref<unknown>;
  error: ErrorRef;

  constructor(mqtt: ISubscriptionManager, topic: string, options: Partial<ISubscriptionCreateParams> = {}) {
    this.topic = topic;
    this.refCount = 0;
    this.ref = ref(options.default);
    this.error = ref(null);
    this.update = this.update.bind(this);
    this.subscribe = this.subscribe.bind(this);

    this.unsubscribe = (force = false) => {
      --this.refCount;
      if (force || (this.refCount < 1)) {
        this.error.value = null;
        mqtt.removeSubscription(this.topic).catch((err) => {
          this.error.value = err as Error;
        });
      }
    };

    if (typeof options.mapValue === 'function') {
      this.mapValue = options.mapValue;
    } else {
      this.mapValue = this.mapValue.bind(this);
    }

    this.error.value = null;
    mqtt.addSubscription(this.topic, this).catch((err) => {
      this.error.value = err as Error;
    });
  }

  mapValue(message: unknown, topic: string) {
    return message;
  }

  update(message: unknown, topic: string, globalMapValue: MapValueFn) {
    this.ref.value = this.mapValue(globalMapValue(message, topic), topic);
  }

  subscribe() {
    ++this.refCount;
  }

  unsubscribe(force = false) {
    // Will be bound with mqtt
  }
}

export default Subscription;
