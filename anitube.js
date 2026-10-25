// Lampa plugin "AniTube" for the TV. Lampa loads it from GitHub Pages (lampa-plugins repository) or from our
// helper (browser-helper/helper.js, http://127.0.0.1:8765); the helper on the TV does the requests a
// page cannot (AniTube's episode list, MOON's stream). Source: Claude Space PC/LG-TV.
// Built like Lampa's online plugins (online_mod by nb557, the BwaRC "Онлайн" plugin): a card
// button opens an "AniTube" screen with the poster, a Filter (title/season found on anitube.in.ua,
// voice-over) and the list of episodes; an episode plays in Lampa's own player with the voice-over's
// episodes as its playlist. The choice is remembered per title. Only MOON is offered: our helper reads
// each episode's signed HLS stream out of MOON's page (/moon/hls.m3u8 serves its master). ASHDI fails
// on this TV's 2018 certificates and FENIX does not start here. ES5 for Chromium 53.
(function () {
  'use strict';
  if (window.claudespaceAnitube) return;
  window.claudespaceAnitube = true;

  var SITE = 'https://anitube.in.ua';
  var HELPER = 'http://127.0.0.1:8765';
  var PLAYABLE = /^https:\/\/moonanime\.art\/iframe\/[A-Za-z0-9_-]+$/;
  var CHOICE_KEY = 'cs_anitube_choice';

  // Messages go to the helper's log on the TV: Lampa itself cannot be inspected from the PC.
  function log(text) {
    try { var x = new XMLHttpRequest(); x.open('POST', HELPER + '/log'); x.send('[anitube] ' + text); } catch (e) {}
  }

  function request(url, done, post) {
    var x = new XMLHttpRequest();
    x.open(post ? 'POST' : 'GET', url);
    if (post) x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    x.timeout = 20000;
    x.onload = function () { done(x.status === 200 ? null : 'HTTP ' + x.status, x.responseText); };
    x.onerror = function () { done('мережа недоступна (чи запущено «Наш браузер»?)'); };
    x.ontimeout = function () { done('сайт не відповідає'); };
    x.send(post || null);
  }
  function html(text) { return new DOMParser().parseFromString(text, 'text/html'); }

  // Titles found by AniTube's own search: [{title, url}].
  function search(query, done) {
    request(SITE + '/index.php?do=search', function (error, text) {
      if (error) return done(error);
      var seen = {}, out = [];
      [].forEach.call(html(text).querySelectorAll('a[href]'), function (a) {
        var href = a.getAttribute('href'), name = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/^https?:\/\/anitube\.in\.ua\/\d+-[^\/]+\.html$/.test(href) || !name || /^Перегляд/.test(name) || seen[href]) return;
        seen[href] = true;
        out.push({title: name, url: href});
      });
      done(null, out);
    }, 'do=search&subaction=search&story=' + encodeURIComponent(query));
  }

  // Voice-overs with a MOON player on a title page: [{title, episodes: [{title, file}]}], dubbed first.
  function sources(pageUrl, done) {
    request(pageUrl, function (error, page) {
      if (error) return done(error);
      var hash = /dle_login_hash\s*=\s*'([0-9a-f]+)'/.exec(page), id = /\/(\d+)-/.exec(pageUrl);
      if (!id) return done('не знайдено номер сторінки');
      // Through our helper: the site answers this request only with its own Referer.
      request(HELPER + '/anitube/playlists?news_id=' + id[1] + '&user_hash=' + (hash ? hash[1] : ''), function (error, text) {
        if (error) return done(error);
        var data;
        try { data = JSON.parse(text); } catch (e) { return done('незрозуміла відповідь сайту'); }
        if (!data.success || !data.response) return done('на сторінці немає плеєра');
        var doc = html(data.response), names = {}, groups = {}, order = [];
        [].forEach.call(doc.querySelectorAll('li[data-id]'), function (li) {
          var key = li.getAttribute('data-id'), file = li.getAttribute('data-file'), text = (li.textContent || '').trim();
          if (!file) { names[key] = text; return; }
          if (!groups[key]) { groups[key] = []; order.push(key); }
          groups[key].push({title: text, file: file});
        });
        var list = order.filter(function (key) { return PLAYABLE.test(groups[key][0].file); }).map(function (key) {
          var parts = [], path = key.split('_');
          for (var i = 2; i <= path.length; i++) { var name = names[path.slice(0, i).join('_')]; if (name) parts.push(name.replace(/^ПЛ[ЕЄ]+Р\s+/i, '')); }
          // The player name (always MOON here) says nothing to the viewer.
          if (/MOON$/i.test(parts[parts.length - 1])) parts.pop();
          var subs = /СУБТИТР/i.test(parts.join(' '));
          parts = parts.filter(function (p) { return !/^(ОЗВУЧЕННЯ|СУБТИТРИ)$/i.test(p); });
          return {title: parts.join(' · ') + (subs ? ' (субтитри)' : ''), episodes: groups[key], subs: subs};
        });
        list.sort(function (a, b) { return a.subs - b.subs; });
        done(null, list);
      });
    });
  }

  // Our helper runs only once "Наш браузер" has been opened since the TV was switched on. Lampa may not
  // call the helper's service, but it can open our browser, which starts the helper and at once hands
  // the screen back to Lampa (browser/app.js, returnTo).
  function ping(done) {
    var x = new XMLHttpRequest();
    x.open('GET', HELPER + '/ping');
    x.timeout = 1500;
    x.onload = function () { done(x.status === 204); };
    x.onerror = x.ontimeout = function () { done(false); };
    x.send();
  }
  function openOurBrowser() {
    try {
      var bridge = new PalmServiceBridge();
      window.claudespaceLaunchBridge = bridge;
      bridge.onservicecallback = function (reply) { log('open our browser: ' + String(reply).slice(0, 160)); };
      bridge.call('luna://com.webos.applicationManager/launch', JSON.stringify({id: 'com.claudespace.tvbrowser', params: {returnTo: 'lampa.tv'}}));
    } catch (error) { log('open our browser failed: ' + error); }
  }
  function wakeHelper(done) {
    ping(function (up) {
      if (up) return done(true);
      openOurBrowser();
      var tries = 0;
      (function wait() {
        setTimeout(function () { ping(function (ok) { if (ok) return done(true); if (++tries < 25) wait(); else done(false); }); }, 1000);
      }());
    });
  }

  function component(object) {
    var _this = this;
    var scroll = new Lampa.Scroll({mask: true, over: true});
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var movie = object.movie || {};
    var titles = [], voices = [], titleIndex = 0, voiceIndex = 0, last = null;
    var saved = (Lampa.Storage.get(CHOICE_KEY, '{}') || {})[movie.id] || {};

    function remember() {
      var all = Lampa.Storage.get(CHOICE_KEY, '{}') || {};
      all[movie.id] = {title: titles[titleIndex] && titles[titleIndex].url, voice: voices[voiceIndex] && voices[voiceIndex].title};
      Lampa.Storage.set(CHOICE_KEY, all);
    }

    this.create = function () {
      this.activity.loader(true);
      filter.onBack = function () { _this.start(); };
      filter.onSelect = function (type, a, b) {
        if (type !== 'filter') return;
        if (a.stype === 'title') { titleIndex = b.index; voiceIndex = 0; saved.voice = ''; _this.loadSources(); }
        if (a.stype === 'voice') { voiceIndex = b.index; remember(); _this.draw(); }
        setTimeout(function () { if ($('body').hasClass('selectbox--open')) Lampa.Select.close(); }, 10);
      };
      filter.render().find('.filter--sort, .filter--search').remove();
      files.appendHead(filter.render());
      files.appendFiles(scroll.render());
      wakeHelper(function (up) {
        if (up) _this.find(); else _this.empty('Не вдалося запустити помічника. Відкрийте «Наш браузер», потім поверніться сюди.');
      });
      return this.render();
    };

    // AniTube search by the original title first, then the local one.
    this.find = function () {
      var queries = [movie.original_title, movie.original_name, movie.title, movie.name].filter(function (q, i, all) { return q && all.indexOf(q) === i; });
      (function next(i) {
        if (i >= queries.length) return _this.empty('На AniTube нічого не знайдено');
        search(queries[i], function (error, list) {
          if (error) return _this.empty('AniTube: ' + error);
          if (!list.length) return next(i + 1);
          titles = list;
          titleIndex = 0;
          titles.forEach(function (t, n) { if (t.url === saved.title) titleIndex = n; });
          _this.loadSources();
        });
      }(0));
    };

    this.loadSources = function () {
      this.reset();
      this.activity.loader(true);
      sources(titles[titleIndex].url, function (error, list) {
        voices = list || [];
        voiceIndex = 0;
        voices.forEach(function (v, n) { if (v.title === saved.voice) voiceIndex = n; });
        _this.buildFilter();
        if (error) return _this.empty('AniTube: ' + error);
        if (!voices.length) return _this.empty('Тут немає плеєра MOON, а інші плеєри AniTube на цьому ТВ не працюють');
        remember();
        _this.draw();
      });
    };

    this.buildFilter = function () {
      function group(title, stype, list, current) {
        return {title: title, subtitle: list[current] ? list[current].title : '', stype: stype,
          items: list.map(function (x, i) { return {title: x.title, selected: i === current, index: i}; })};
      }
      var select = [group('Тайтл на AniTube', 'title', titles, titleIndex)];
      if (voices.length) select.push(group('Озвучка', 'voice', voices, voiceIndex));
      filter.set('filter', select);
      var chosen = [];
      if (voices[voiceIndex]) chosen.push('Озвучка: ' + voices[voiceIndex].title);
      if (titles.length > 1) chosen.push(titles[titleIndex].title);
      filter.chosen('filter', chosen);
    };

    this.draw = function () {
      this.reset();
      this.buildFilter();
      var voice = voices[voiceIndex];
      voice.episodes.forEach(function (episode, index) {
        var item = Lampa.Template.get('cs_anitube_item', {title: episode.title, info: voice.title});
        item.on('hover:enter', function () { _this.play(index); });
        item.on('hover:focus', function (e) { last = e.target; scroll.update($(e.target), true); });
        scroll.append(item);
      });
      this.loading(false);
    };

    // Lampa's own player, the voice-over as its playlist. hls_type 'hlsjs': Lampa loads the stream with
    // hls.js in its page, since MOON's CDN answers only a real browser (the TV's own HLS player gets 403).
    this.play = function (index) {
      var voice = voices[voiceIndex], name = movie.title || movie.name || '';
      var playlist = voice.episodes.map(function (e) {
        return {title: name + ' · ' + e.title + ' · ' + voice.title, url: HELPER + '/moon/hls.m3u8?url=' + encodeURIComponent(e.file), hls_type: 'hlsjs'};
      });
      log('play ' + playlist[index].title + ' ' + voice.episodes[index].file);
      Lampa.Player.play(playlist[index]);
      Lampa.Player.playlist(playlist);
      Lampa.Player.callback(function () { Lampa.Controller.toggle('content'); });
    };

    this.reset = function () {
      last = null;
      scroll.render().find('.empty').remove();
      scroll.clear();
      scroll.reset();
    };
    this.empty = function (message) {
      var empty = Lampa.Template.get('list_empty');
      if (message) empty.find('.empty__descr').text(message);
      scroll.append(empty);
      log(message);
      this.loading(false);
    };
    this.loading = function (status) {
      if (status) this.activity.loader(true);
      else {
        this.activity.loader(false);
        if (Lampa.Activity.active().activity === this.activity && this.inActivity()) this.activity.toggle();
      }
    };
    this.inActivity = function () {
      var body = $('body');
      return !(body.hasClass('settings--open') || body.hasClass('menu--open') || body.hasClass('keyboard-input--visible') ||
        body.hasClass('selectbox--open') || body.hasClass('search--open') || $('div.modal').length);
    };
    this.start = function () {
      if (Lampa.Activity.active().activity !== this.activity) return;
      Lampa.Background.immediately(Lampa.Utils.cardImgBackground(movie));
      Lampa.Controller.add('content', {
        toggle: function () {
          Lampa.Controller.collectionSet(scroll.render(), files.render());
          Lampa.Controller.collectionFocus(last || false, scroll.render());
        },
        up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); },
        down: function () { Navigator.move('down'); },
        right: function () { if (Navigator.canmove('right')) Navigator.move('right'); else filter.show('Фільтр', 'filter'); },
        left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
        back: this.back
      });
      if (this.inActivity()) Lampa.Controller.toggle('content');
    };
    this.back = function () { Lampa.Activity.backward(); };
    this.render = function () { return files.render(); };
    this.pause = function () {};
    this.stop = function () {};
    this.destroy = function () { files.destroy(); scroll.destroy(); };
  }

  var BUTTON = '<div class="full-start__button selector view--cs-anitube">' +
    '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><span>AniTube</span></div>';
  function addButton(e) {
    if (e.type !== 'complite') return;
    try {
      var render = e.object.activity.render(), movie = e.data.movie;
      if (render.find('.view--cs-anitube').length) return;
      var button = $(BUTTON);
      button.on('hover:enter', function () {
        Lampa.Activity.push({url: '', title: 'AniTube', component: 'cs_anitube', movie: movie, page: 1});
      });
      // Second in the row (other plugins add their buttons in varying order), easy to find.
      var row = render.find('.full-start-new__buttons, .full-start__buttons').first(), first = row.children('.selector').first();
      if (first.length) first.after(button); else row.append(button);
    } catch (error) { log('button ' + error); }
  }
  // For checks from the PC in our own browser (the same engine and network rules as Lampa).
  window.claudespaceAnitubeApi = {search: search, sources: sources};
  function init() {
    // The episode row of online plugins (online_mod's template).
    Lampa.Template.add('cs_anitube_item', '<div class="online selector"><div class="online__body">' +
      '<div style="position:absolute;left:0;top:-0.3em;width:2.4em;height:2.4em"><svg style="height:2.4em;width:2.4em" viewBox="0 0 128 128" fill="none">' +
      '<circle cx="64" cy="64" r="56" stroke="white" stroke-width="16"/><path d="M90.5 64.3827L50 87.7654L50 41L90.5 64.3827Z" fill="white"/></svg></div>' +
      '<div class="online__title" style="padding-left:2.1em">{title}</div><div class="online__quality" style="padding-left:3.4em">{info}</div></div></div>');
    Lampa.Component.add('cs_anitube', component);
    Lampa.Listener.follow('full', addButton);
    log('loaded');
  }
  if (window.appready) init();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
}());
