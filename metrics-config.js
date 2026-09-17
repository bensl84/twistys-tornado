// Public, non-secret settings. Collection is available only in the local preview.
// An approved pilot release must set its reviewed HTTPS endpoint here.
window.TWISTY_METRICS_CONFIG = {
  endpoint: location.hostname === '127.0.0.1' || location.hostname === 'localhost'
    ? 'http://127.0.0.1:8787/v1/events' : '',
  noticeVersion: 'pilot-1'
};
