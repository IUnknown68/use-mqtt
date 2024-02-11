import {
  ISubscriptionCreateParams,
} from './types';

import ReactiveMqtt from './ReactiveMqtt';

export const DEFAULT_CLIENT_ID = '';

const clientInstances = new Map<string, ReactiveMqtt>();

//------------------------------------------------------------------------------
export function useMqtt(id = DEFAULT_CLIENT_ID) {
  return getMqtt(id, true).getHook();
}

//------------------------------------------------------------------------------
export function useSubscription(topic: string, options: Partial<ISubscriptionCreateParams> = {}) {
  return getMqtt(options.client || DEFAULT_CLIENT_ID, true)
    .subscribe(topic, options);
}

//------------------------------------------------------------------------------
function getMqtt(id = DEFAULT_CLIENT_ID, create = false) : ReactiveMqtt {
  let mqtt = clientInstances.get(id);
  if (!mqtt && create) {
    mqtt = new ReactiveMqtt(id);
    clientInstances.set(id, mqtt);
  }
  return mqtt!;
}

export const test = DEFAULT_CLIENT_ID;
