# useMqtt

Reactive mqtt-Client and -Subscriptions using [`MQTT.js`](https://github.com/mqttjs/MQTT.js/).

**Note:** This is currenlty hardly more than a draft, use at your own risc and read the code to figure out what to do how.

## Install

```bash
npm i @seiberspace/use-mqtt

# OR:
yarn add @seiberspace/use-mqtt
```

## Usage

```js
import { useMqtt, useSubscription } from '@seiberspace/use-mqtt';

// One time somewhere in your app:
useMqtt().create('wss://test.mosquitto.org:8081', {
  mapValue: (val) => val.toString(),
});

const { value } = useSubscription(topic, { default: '-' });
```

## Example

```vue
<script>
import {
  defineComponent,
} from 'vue';

import {
  useMqtt,
  useSubscription,
} from '@seiberspace/use-mqtt';

//------------------------------------------------------------------------------
export default defineComponent({
  name: 'MqttValue',

  setup(props) {
    const {
      connected,
      error,
      create,
    } = useMqtt();
    const { value } = useSubscription('testtopic');

    create('wss://test.mosquitto.org:8081', {
      mapValue: (val) => val.toString(),
    });

    return {
      connected,
      value,
      error,
    };
  },
});
</script>

<template>
  <div>
    <div>Connected: {{connected}}</div>
    <div>Value: {{val}}</div>
    <div v-if="!!error">Error: {{error}}</div>
  </div>
</template>
```

Subscriptions are reference counted, `useSubscription()` hooks into the component's
lifecycle. When the last reference is released, the client unsubscribes from
that topic.

You can call `useMqtt()` as often as you like, it will always return the same
instance. You can `open()` and `close()` the connection, and watch `state` for
changes. Additionally there is an `error` which is set to the connection error, if any.

`useMqtt()` offers two convenience-computeds, `connected` and `busy`. `busy` is
set to true while connecting or disconnecting.

`create()` is reentry-save (although ignoring changed parameters), and never fails.
It reports errors via the `error` ref.

If you actually do need multiple MQTT-instances, you can do that: Check `types.ts`,
you will figure it out.

## TODO

A lot: Better typing, tests, full support of `subscribe()`-options and probably much more.
