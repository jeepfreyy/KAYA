export function requestLocalAI(type, metadata, { signal, chromeApi = globalThis.chrome } = {}) {
  return new Promise((resolve, reject) => {
    const fail = (code) => Object.assign(new Error(code), { code });
    if (signal?.aborted) { reject(fail('CANCELLED')); return; }
    if (!chromeApi?.runtime?.connect) { reject(fail('READER_UNAVAILABLE')); return; }
    let port;
    try { port = chromeApi.runtime.connect({ name: 'kaya-analysis' }); }
    catch { reject(fail('CONNECTION_LOST')); return; }
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat); clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      port.disconnect();
      if (error) reject(error); else resolve(result);
    };
    const cancel = () => finish(fail('CANCELLED'));
    // Only while a request is running; closing the panel aborts inference.
    const heartbeat = setInterval(() => {
      try { port.postMessage({ type: 'ping' }); } catch { finish(fail('CONNECTION_LOST')); }
    }, 15000);
    const timeout = setTimeout(() => finish(fail('TIMEOUT')), 125000);
    signal?.addEventListener('abort', cancel, { once: true });
    port.onMessage.addListener((message) => {
      if (message.type === 'result') finish(null, message.result);
      if (message.type === 'error') finish(fail(message.code));
    });
    port.onDisconnect.addListener(() => {
      void chromeApi.runtime.lastError;
      finish(fail('CONNECTION_LOST'));
    });
    try { port.postMessage({ type, metadata }); } catch { finish(fail('CONNECTION_LOST')); }
  });
}
