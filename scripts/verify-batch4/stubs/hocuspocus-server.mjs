/**
 * Stand-in for `@hocuspocus/server` in the batch 4 harness.
 *
 * The real `Server` binds a port on `listen()`. This one only records the option
 * object so `onAuthenticate` / `onTokenSync` can be driven directly.
 */
export class Server {
  constructor(options) {
    globalThis.__collabOptions = options;
    this.hocuspocus = { closeConnections() {} };
  }

  listen() {
    return Promise.resolve();
  }
}

export default Server;
