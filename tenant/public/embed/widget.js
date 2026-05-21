(function() {
  var script = document.currentScript;
  var widgetId = script && script.getAttribute('data-widget-id');
  var host = script ? script.src.replace(/\/embed\/widget\.js.*/, '') : '';
  if (!widgetId) { console.error('GenBotChat: data-widget-id required'); return; }

  var existing = document.querySelector('[data-gbc-widget-root="' + widgetId + '"]');
  if (existing) existing.remove();

  var config = {};
  var parentOrigin = window.location.origin || '';
  var chatWidth = 380;
  var chatHeight = 520;
  var buttonSize = 56;
  var buttonGap = 16;
  var root = document.createElement('div');
  root.setAttribute('data-gbc-widget-root', widgetId);
  root.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';

  var button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Open chat');
  button.style.cssText = [
    'width:56px',
    'height:56px',
    'border:0',
    'border-radius:50%',
    'padding:0',
    'cursor:pointer',
    'overflow:hidden',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:#3B82F6',
    'box-shadow:0 4px 12px rgba(0,0,0,.25)',
    'transition:transform .2s',
  ].join(';') + ';';
  button.onmouseenter = function() { button.style.transform = 'scale(1.08)'; };
  button.onmouseleave = function() { button.style.transform = 'scale(1)'; };

  function renderDefaultIcon() {
    button.innerHTML = '<svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
  }

  renderDefaultIcon();

  var iframe = null;
  var configFrame = null;

  function fullUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return host + path;
  }

  function applyButtonConfig() {
    applyPosition();
    button.style.background = config.color || '#3B82F6';
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,.25)';
    button.style.borderRadius = '50%';
    if (config.shape === 'rounded') button.style.borderRadius = '14px';
    if (config.shape === 'square') button.style.borderRadius = '8px';

    var iconUrl = fullUrl(config.buttonIconUrl || config.logoUrl);
    if (iconUrl) {
      button.innerHTML = '';
      var img = document.createElement('img');
      img.src = iconUrl;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;';
      img.onerror = function() {
        button.style.background = config.color || '#3B82F6';
        renderDefaultIcon();
      };
      button.appendChild(img);
      button.style.background = 'transparent';
    }
    if (iframe) iframe.style.cssText = framePositionStyles();
  }

  function windowBackground() {
    var theme = config.theme || 'light';
    if (theme === 'dark') return '#1e1e2e';
    if (theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return '#1e1e2e';
    return '#ffffff';
  }

  function windowRadius() {
    var radius = Number(config.windowRadius);
    return Number.isFinite(radius) ? radius : 16;
  }

  function applyPosition() {
    var pos = config.position || 'bottom-right';
    root.style.left = 'auto';
    root.style.right = 'auto';
    root.style.top = 'auto';
    root.style.bottom = 'auto';
    if (pos.indexOf('left') !== -1) root.style.left = '20px';
    else root.style.right = '20px';
    if (pos.indexOf('top') !== -1) root.style.top = '20px';
    else root.style.bottom = '20px';
  }

  function framePositionStyles() {
    var pos = config.position || 'bottom-right';
    var styles = [
      'position:fixed',
      'width:' + chatWidth + 'px',
      'height:' + chatHeight + 'px',
      'max-width:calc(100vw - 32px)',
      'max-height:calc(100vh - ' + (buttonSize + buttonGap + 40) + 'px)',
      'border:0',
      'overflow:hidden',
      'background:' + windowBackground(),
      'border-radius:' + windowRadius() + 'px',
      'box-shadow:0 8px 32px rgba(0,0,0,.18)',
      'z-index:2147483647',
    ];
    styles.push(pos.indexOf('left') !== -1 ? 'left:20px' : 'right:20px');
    styles.push(pos.indexOf('top') !== -1 ? 'top:' + (20 + buttonSize + buttonGap) + 'px' : 'bottom:' + (20 + buttonSize + buttonGap) + 'px');
    return styles.join(';') + ';';
  }

  function closeChat() {
    if (iframe) {
      iframe.remove();
      iframe = null;
    }
  }

  function openChat() {
    if (iframe) { closeChat(); return; }
    iframe = document.createElement('iframe');
    iframe.src = host + '/embed/chat.html?widgetId=' + encodeURIComponent(widgetId) + '&mode=window&parentOrigin=' + encodeURIComponent(parentOrigin) + '&_=' + Date.now();
    iframe.setAttribute('allow', 'microphone');
    iframe.setAttribute('allowtransparency', 'true');
    iframe.style.cssText = framePositionStyles();
    root.appendChild(iframe);
  }

  function loadConfig() {
    if (configFrame) configFrame.remove();
    configFrame = document.createElement('iframe');
    configFrame.src = host + '/embed/chat.html?widgetId=' + encodeURIComponent(widgetId) + '&mode=config&parentOrigin=' + encodeURIComponent(parentOrigin) + '&_=' + Date.now();
    configFrame.setAttribute('aria-hidden', 'true');
    configFrame.setAttribute('tabindex', '-1');
    configFrame.style.cssText = 'position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none;overflow:hidden;';
    root.appendChild(configFrame);
  }

  button.addEventListener('click', openChat);
  root.appendChild(button);
  document.body.appendChild(root);

  window.addEventListener('message', function(e) {
    var d = e.data || {};
    if (d.widgetId && d.widgetId !== widgetId) return;

    if (configFrame && e.source === configFrame.contentWindow && d.type === 'gbc-config') {
      config = d.config || {};
      applyButtonConfig();
      configFrame.remove();
      configFrame = null;
      return;
    }

    if (!iframe || e.source !== iframe.contentWindow) return;
    if (d.type === 'gbc-close') closeChat();
  });

  applyButtonConfig();
  loadConfig();
})();
