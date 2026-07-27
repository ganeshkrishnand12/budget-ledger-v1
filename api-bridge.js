(function () {
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxdmGGlPXgYjSZP0Za_Wnfy3tGpea5H99E_kpLC6MaSqq5J194FOLg1NnUxPZAf4dfuuQ/exec';

  var nativeFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/') !== 0) {
      return nativeFetch(input, init);
    }

    init = init || {};
    var method = (init.method || 'GET').toUpperCase();

    var parts = url.split('?');
    var path = parts[0];
    var query = {};
    if (parts[1]) {
      parts[1].split('&').forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }

    var token = null;
    var headers = init.headers || {};
    var authHeader = headers.Authorization || headers.authorization;
    if (authHeader && authHeader.indexOf('Bearer ') === 0) {
      token = authHeader.slice(7).trim();
    }

    var body = {};
    if (init.body) {
      try { body = JSON.parse(init.body); } catch (e) { body = {}; }
    }

    var envelope = { method: method, path: path, query: query, body: body, token: token };

    return nativeFetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(envelope)
    }).then(function (res) {
      return res.json();
    }).then(function (wrapper) {
      return new Response(JSON.stringify(wrapper.body), {
        status: wrapper.status,
        headers: { 'Content-Type': 'application/json' }
      });
    });
  };
})();