(function() {
  var script = document.currentScript;
  var widgetId = script.getAttribute('data-widget-id');
  var host = script.src.replace(/\/embed\/widget\.js.*/, '');
  if (!widgetId) { console.error('GenBotChat: data-widget-id required'); return; }

  var iframe = document.createElement('iframe');
  iframe.src = host + '/embed/chat.html?widgetId=' + widgetId;
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:0;height:0;border:none;z-index:2147483647;overflow:hidden;';
  iframe.setAttribute('allow', 'microphone');
  document.body.appendChild(iframe);

  window.addEventListener('message', function(e) {
    if (e.source !== iframe.contentWindow) return;
    var d = e.data;
    if (d.type === 'gbc-resize') {
      iframe.style.width = d.width;
      iframe.style.height = d.height;
    }
  });
})();
