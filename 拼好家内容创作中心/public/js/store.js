const listeners = new Map();

export const store = {
  accounts: [],
  loading: false,

  set(key, value) {
    this[key] = value;
    this.emit(`${key}:updated`, value);
  },

  on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
    return () => listeners.get(event)?.delete(callback);
  },

  emit(event, value) {
    listeners.get(event)?.forEach((callback) => callback(value));
  }
};
