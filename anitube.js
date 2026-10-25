// Lampa plugin "Аніме UA" for the TV (file name anitube.js kept: Lampa already has its address). Lampa loads
// it from GitHub Pages (lampa-plugins repository) or from our helper (browser-helper/helper.js,
// http://127.0.0.1:8765); the helper on the TV does the requests a page cannot (AniTube's episode list,
// MOON's stream). Source: Claude Space PC/LG-TV.
// Built like Lampa's online plugins (online_mod by nb557, the BwaRC "Онлайн" plugin): a card button opens a
// screen with the poster, "Джерело" (the site: AniTube, AnimeON), a Filter (title/season found there,
// voice-over), a search for one's own query and the list of episodes; an episode plays in Lampa's own player
// with the voice-over's episodes as its playlist. The choice is remembered per title. A site's result is
// taken only when its name and year match the card; otherwise the results are listed to pick from. Only
// MOON is offered: our helper reads each episode's signed HLS stream out of MOON's page (/moon/hls.m3u8
// serves its master). ASHDI fails on this TV's 2018 certificates and FENIX does not start here.
// A new site is one more entry in SOURCES. ES5 for Chromium 53.
(function () {
  'use strict';
  if (window.claudespaceAnitube) return;
  window.claudespaceAnitube = true;

  var HELPER = 'http://127.0.0.1:8765';
  var MOON = /^https:\/\/moonanime\.art\/iframe\/([A-Za-z0-9_-]+)/;
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
  function getJson(url, done) {
    request(url, function (error, text) {
      if (error) return done(error);
      var data;
      try { data = JSON.parse(text); } catch (e) { return done('незрозуміла відповідь сайту'); }
      done(null, data);
    });
  }
  function html(text) { return new DOMParser().parseFromString(text, 'text/html'); }
  function seasonOf(title) { var m = /(\d+)\s*сезон/i.exec(title || ''); return m ? +m[1] : 1; }
  function moonPage(url) { var m = MOON.exec(url || ''); return m ? 'https://moonanime.art/iframe/' + m[1] : ''; }
  function bySubs(a, b) { return a.subs - b.subs; }

  // Sites. Each one: search(query, done) → [{title, original, year, season, id}];
  // voices(item, done) → [{title, subs, episodes: [{title, number, poster}] or load(done) giving them}];
  // page(episode, done) → the episode's MOON player page.
  var ANITUBE = {
    name: 'anitube', title: 'AniTube', site: 'https://anitube.in.ua',
    // Each search result is a .story block.
    search: function (query, done) {
      request(ANITUBE.site + '/index.php?do=search', function (error, text) {
        if (error) return done(error);
        var out = [];
        [].forEach.call(html(text).querySelectorAll('.story'), function (story) {
          var a = story.querySelector('h2 a[href]'), year = story.querySelector('a[href*="/xfsearch/year/"]');
          if (!a || !/^https?:\/\/anitube\.in\.ua\/\d+-[^\/]+\.html$/.test(a.getAttribute('href'))) return;
          var title = (a.textContent || '').replace(/\s+/g, ' ').trim();
          out.push({title: title, year: year ? +year.textContent : 0, season: seasonOf(title), id: a.getAttribute('href')});
        });
        done(null, out);
      }, 'do=search&subaction=search&story=' + encodeURIComponent(query));
    },
    voices: function (item, done) {
      request(item.id, function (error, page) {
        if (error) return done(error);
        var hash = /dle_login_hash\s*=\s*'([0-9a-f]+)'/.exec(page), id = /\/(\d+)-/.exec(item.id);
        if (!id) return done('не знайдено номер сторінки');
        // Through our helper: the site answers this request only with its own Referer.
        getJson(HELPER + '/anitube/playlists?news_id=' + id[1] + '&user_hash=' + (hash ? hash[1] : ''), function (error, data) {
          if (error) return done(error);
          if (!data.success || !data.response) return done('на сторінці немає плеєра');
          var doc = html(data.response), names = {}, groups = {}, order = [];
          [].forEach.call(doc.querySelectorAll('li[data-id]'), function (li) {
            var key = li.getAttribute('data-id'), file = li.getAttribute('data-file'), text = (li.textContent || '').trim();
            if (!file) { names[key] = text; return; }
            if (!groups[key]) { groups[key] = []; order.push(key); }
            groups[key].push({title: text, number: +(/\d+/.exec(text) || [groups[key].length + 1])[0], page: file});
          });
          var list = order.filter(function (key) { return moonPage(groups[key][0].page); }).map(function (key) {
            var parts = [], path = key.split('_');
            for (var i = 2; i <= path.length; i++) { var name = names[path.slice(0, i).join('_')]; if (name) parts.push(name.replace(/^ПЛ[ЕЄ]+Р\s+/i, '')); }
            // The player name (always MOON here) says nothing to the viewer.
            if (/MOON$/i.test(parts[parts.length - 1])) parts.pop();
            var subs = /СУБТИТР/i.test(parts.join(' '));
            parts = parts.filter(function (p) { return !/^(ОЗВУЧЕННЯ|СУБТИТРИ)$/i.test(p); });
            return {title: parts.join(' · ') + (subs ? ' (субтитри)' : ''), episodes: groups[key], subs: subs};
          });
          done(null, list.sort(bySubs));
        });
      });
    },
    page: function (episode, done) { done(null, moonPage(episode.page)); }
  };

  // animeon.club: a JSON API (the site's own), with the English name and the season of each title.
  var ANIMEON = {
    name: 'animeon', title: 'AnimeON', api: 'https://animeon.club/api',
    search: function (query, done) {
      getJson(ANIMEON.api + '/anime/search?text=' + encodeURIComponent(query), function (error, data) {
        if (error) return done(error);
        done(null, ((data && data.result) || []).map(function (a) {
          return {title: a.titleUa || a.titleEn, original: a.titleEn, year: parseInt(a.releaseDate, 10) || 0, season: a.season || seasonOf(a.titleUa), id: a.id};
        }));
      });
    },
    voices: function (item, done) {
      getJson(ANIMEON.api + '/player/' + item.id + '/translations', function (error, data) {
        if (error) return done(error);
        var list = [];
        ((data && data.translations) || []).forEach(function (t) {
          var tr = t.translation || {};
          (t.player || []).forEach(function (p) {
            if (!/^moon$/i.test(p.name)) return;
            var subs = !!tr.isSub || /субтитр/i.test(tr.name);
            list.push({title: tr.name + (subs && !/субтитр/i.test(tr.name) ? ' (субтитри)' : ''), subs: subs, load: function (ready) {
              getJson(ANIMEON.api + '/player/' + item.id + '/episodes?take=1000&skip=-1&playerId=' + p.id + '&translationId=' + tr.id + '&includeAlternative=true', function (error, data) {
                if (error) return ready(error);
                ready(null, ((data && data.episodes) || []).map(function (e) {
                  return {title: e.episode + ' серія', number: e.episode, poster: e.poster, id: e.id};
                }));
              });
            }});
          });
        });
        done(null, list.sort(bySubs));
      });
    },
    page: function (episode, done) {
      getJson(ANIMEON.api + '/player/' + episode.id + '/episode', function (error, data) {
        if (error) return done(error);
        var page = moonPage(data && data.videoUrl);
        done(page ? null : 'серія без плеєра MOON', page);
      });
    }
  };
  var SOURCES = [ANITUBE, ANIMEON];

  // Sites search descriptions too, so a result counts only when one of its names matches the card's and its
  // year fits: a film within a year, a series from its first year on (later seasons come later).
  function plain(name) {
    return String(name || '').toLowerCase().replace(/[ʼ’'`]/g, '').replace(/\(?\s*\d+\s*сезон\s*\)?|(^|\s)сезон\s*\d+|\(\s*фільм\s*\)/g, ' ')
      .replace(/[^0-9a-zа-яіїєґё]+/g, ' ').trim();
  }
  function sameName(a, b) {
    a = plain(a); b = plain(b);
    return !!a && !!b && (a === b || a.indexOf(b + ' ') === 0 || b.indexOf(a + ' ') === 0);
  }
  function matches(result, movie) {
    var names = [movie.title, movie.name, movie.original_title, movie.original_name];
    var same = [result.title, result.original].some(function (r) { return names.some(function (n) { return sameName(r, n); }); });
    var year = +String(movie.release_date || movie.first_air_date || '').slice(0, 4);
    if (!same || !year || !result.year) return same;
    return movie.name ? result.year >= year - 1 : Math.abs(result.year - year) <= 1;
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
    var name = movie.title || movie.name || '';
    var source = ANITUBE, titles = [], voices = [], titleIndex = 0, voiceIndex = 0, last = null, tmdb = {};
    var saved = (Lampa.Storage.get(CHOICE_KEY, '{}') || {})[movie.id] || {};

    function remember() {
      var all = Lampa.Storage.get(CHOICE_KEY, '{}') || {};
      saved = all[movie.id] = {source: source.name, title: titles[titleIndex] && String(titles[titleIndex].id), voice: voices[voiceIndex] && voices[voiceIndex].title};
      Lampa.Storage.set(CHOICE_KEY, all);
    }

    this.create = function () {
      this.activity.loader(true);
      filter.onBack = function () { _this.start(); };
      filter.onSearch = function (value) { _this.look(source, value); };
      filter.onSelect = function (type, a, b) {
        if (type === 'sort') { saved = {}; _this.look(SOURCES.filter(function (s) { return s.name === a.source; })[0] || source); }
        if (type === 'filter') {
          if (a.stype === 'title') { titleIndex = b.index; voiceIndex = 0; saved.voice = ''; _this.loadVoices(); }
          if (a.stype === 'voice') { voiceIndex = b.index; remember(); _this.draw(); }
        }
        setTimeout(function () { if ($('body').hasClass('selectbox--open')) Lampa.Select.close(); }, 10);
      };
      filter.render().find('.filter--sort span').text('Джерело');
      files.appendHead(filter.render());
      files.appendFiles(scroll.render());
      this.buildFilter();
      wakeHelper(function (up) {
        if (up) _this.begin(); else _this.empty('Не вдалося запустити помічника. Відкрийте «Наш браузер», потім поверніться сюди.');
      });
      return this.render();
    };

    // The site chosen for this card before, or else the first site where the title surely is.
    this.begin = function () {
      var chosen = SOURCES.filter(function (s) { return s.name === saved.source; })[0];
      if (chosen) return this.look(chosen);
      var loose = null;
      (function next(i) {
        if (i >= SOURCES.length) {
          if (loose) { source = loose.source; _this.buildFilter(); return _this.similars(loose.all); }
          source = SOURCES[0];
          _this.buildFilter();
          return _this.empty('Немає «' + name + '» ні на ' + SOURCES.map(function (s) { return s.title; }).join(', ') +
            '. Спробуйте «Пошук» з іншою назвою.');
        }
        _this.collect(SOURCES[i], null, function (all, sure) {
          if (sure.length) { source = SOURCES[i]; return _this.useTitles(sure, 0); }
          if (!loose && all.length) loose = {source: SOURCES[i], all: all};
          next(i + 1);
        });
      }(0));
    };

    // A site's results for the card's names (local first: the sites name titles in Ukrainian), or for
    // the viewer's own query; done(all, sure), sure = those matching the card.
    this.collect = function (src, query, done) {
      var queries = query ? [query] : [movie.title, movie.name, movie.original_title, movie.original_name]
        .filter(function (q, i, all) { return q && all.indexOf(q) === i; });
      var seen = {}, all = [], failed = '';
      (function next(i) {
        if (i >= queries.length) {
          log(src.name + ' "' + queries.join('" "') + '": ' + all.length + ' results' + (failed ? ', ' + failed : ''));
          return done(all, query ? [] : all.filter(function (t) { return matches(t, movie); }), failed);
        }
        src.search(queries[i], function (error, list) {
          if (error) failed = error;
          (list || []).forEach(function (t) { if (!seen[t.id]) { seen[t.id] = true; all.push(t); } });
          next(i + 1);
        });
      }(0));
    };

    this.look = function (src, query) {
      source = src;
      this.reset();
      this.buildFilter();
      this.activity.loader(true);
      this.collect(src, query, function (all, sure, failed) {
        if (sure.length) return _this.useTitles(sure, 0);
        if (query && all.length === 1) return _this.useTitles(all, 0);
        if (all.length) return _this.similars(all);
        _this.empty(failed ? src.title + ': ' + failed : 'На ' + src.title + ' немає «' + (query || name) + '». Спробуйте інше джерело або «Пошук».');
      });
    };

    this.useTitles = function (list, index) {
      titles = list.slice().sort(function (a, b) { return a.season - b.season; });
      titleIndex = titles.indexOf(list[index]);
      titles.forEach(function (t, n) { if (String(t.id) === saved.title) titleIndex = n; });
      log('ui: title ' + titles[titleIndex].title);
      this.loadVoices();
    };

    // No sure match: the site's results to pick from, like online_mod's "similars".
    this.similars = function (list) {
      this.reset();
      scroll.append($('<div class="cs-anitube-note">Точного збігу на ' + source.title + ' немає — оберіть зі знайденого:</div>'));
      list.forEach(function (t, index) {
        var item = Lampa.Template.get('cs_anitube_folder', {title: t.title, year: t.year || '', info: t.original && t.original !== t.title ? t.original : ''});
        item.on('hover:enter', function () { _this.useTitles(list, index); });
        item.on('hover:focus', function (ev) { last = ev.target; scroll.update($(ev.target), true); });
        scroll.append(item);
      });
      this.loading(false);
    };

    this.loadVoices = function () {
      this.reset();
      this.activity.loader(true);
      source.voices(titles[titleIndex], function (error, list) {
        voices = list || [];
        voiceIndex = 0;
        voices.forEach(function (v, n) { if (v.title === saved.voice) voiceIndex = n; });
        _this.buildFilter();
        if (error) return _this.empty(source.title + ': ' + error);
        if (!voices.length) return _this.empty('Тут немає плеєра MOON, а інші плеєри на цьому ТВ не працюють');
        remember();
        _this.draw();
      });
    };

    this.buildFilter = function () {
      filter.set('sort', SOURCES.map(function (s) { return {title: s.title, source: s.name, selected: s === source}; }));
      filter.chosen('sort', [source.title]);
      function group(title, stype, list, current) {
        return {title: title, subtitle: list[current] ? list[current].title : '', stype: stype,
          items: list.map(function (x, i) { return {title: x.title, selected: i === current, index: i}; })};
      }
      var select = [];
      if (titles.length) select.push(group('Тайтл на ' + source.title, 'title', titles, titleIndex));
      if (voices.length) select.push(group('Озвучка', 'voice', voices, voiceIndex));
      filter.set('filter', select);
      var chosen = [];
      if (voices[voiceIndex]) chosen.push('Озвучка: ' + voices[voiceIndex].title);
      if (titles.length > 1) chosen.push(titles[titleIndex].title);
      filter.chosen('filter', chosen);
    };

    // TMDB season of the chosen title, for episode stills and names like online plugins.
    function season() { return titles[titleIndex] ? titles[titleIndex].season || 1 : 1; }
    function episodesInfo(done) {
      var s = season();
      if (!movie.name || !movie.id) return done([]);
      if (tmdb[s]) return done(tmdb[s]);
      var url = Lampa.TMDB.api('tv/' + movie.id + '/season/' + s + '?api_key=' + Lampa.TMDB.key() + '&language=uk');
      new Lampa.Reguest().silent(url, function (json) { tmdb[s] = (json && json.episodes) || []; done(tmdb[s]); },
        function () { tmdb[s] = []; done([]); });
    }
    function hash(number) {
      var s = season();
      return Lampa.Utils.hash([s, s > 10 ? ':' : '', number, movie.original_title || movie.original_name].join(''));
    }

    this.draw = function () {
      this.reset();
      this.buildFilter();
      var voice = voices[voiceIndex];
      if (!voice.episodes) {
        this.activity.loader(true);
        log('ui: loading episodes of ' + voice.title);
        return voice.load(function (error, list) {
          if (error) return _this.empty(source.title + ': ' + error);
          voice.episodes = list;
          if (voices[voiceIndex] === voice) _this.draw();
        });
      }
      if (!voice.episodes.length) return this.empty('У цієї озвучки ще немає серій');
      var still = movie.backdrop_path ? Lampa.TMDB.image('t/p/w300' + movie.backdrop_path) : '';
      episodesInfo(function (info) {
        if (voices[voiceIndex] !== voice) return;
        voice.episodes.forEach(function (episode, index) {
          var e = info[episode.number - 1] || {};
          var date = e.air_date ? e.air_date.split('-').reverse().join('.') : '';
          var item = Lampa.Template.get('cs_anitube_item', {
            title: episode.title, name: e.name && !/^(серія|епізод|episode)\s*\d+$/i.test(e.name) ? e.name : '',
            info: voice.title, time: [e.runtime ? e.runtime + ' хв' : '', date].filter(Boolean).join(' · ')
          });
          var img = item.find('img')[0], src = e.still_path ? Lampa.TMDB.image('t/p/w300' + e.still_path) : episode.poster || still;
          if (src) {
            img.onload = function () { item.addClass('cs-anitube--loaded'); };
            img.onerror = function () { if (img.src !== still && still) img.src = still; };
            img.src = src;
          }
          try { item.find('.cs-anitube__timeline').append(Lampa.Timeline.render(Lampa.Timeline.view(hash(episode.number)))); } catch (error) {}
          item.on('hover:enter', function () { _this.play(index); });
          item.on('hover:focus', function (ev) { last = ev.target; scroll.update($(ev.target), true); });
          scroll.append(item);
        });
        _this.loading(false);
      });
    };

    // Lampa's own player, the voice-over as its playlist; each episode's stream is looked up when it is
    // played (online_mod does the same with url as a function). hls_type 'hlsjs': Lampa loads the stream
    // with hls.js in its page, since MOON's CDN answers only a real browser (the TV's own player gets 403).
    this.play = function (index) {
      var voice = voices[voiceIndex], src = source;
      function stream(episode, call) {
        src.page(episode, function (error, page) {
          if (error || !page) log('no stream: ' + (error || 'no page'));
          call(page ? HELPER + '/moon/hls.m3u8?url=' + encodeURIComponent(page) : '');
        });
      }
      var playlist = voice.episodes.map(function (episode) {
        var cell = {title: name + ' · ' + episode.title + ' · ' + voice.title, hls_type: 'hlsjs'};
        // Lampa keeps the watch progress under the same key online plugins use, and the rows show it.
        try { cell.timeline = Lampa.Timeline.view(hash(episode.number)); } catch (error) {}
        cell.url = function (call) { stream(episode, function (url) { cell.url = url; call(); }); };
        return cell;
      });
      stream(voice.episodes[index], function (url) {
        if (!url) return Lampa.Noty.show('Не вдалося отримати відео цієї серії');
        playlist[index].url = url;
        log('play ' + src.name + ' ' + playlist[index].title + ' ' + url);
        Lampa.Player.play(playlist[index]);
        Lampa.Player.playlist(playlist);
        Lampa.Player.callback(function () { Lampa.Controller.toggle('content'); });
      });
    };

    this.reset = function () {
      last = null;
      scroll.render().find('.empty').remove();
      scroll.clear();
      scroll.reset();
    };
    this.empty = function (message) {
      this.reset();
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
        log('ui: loading off, still loading ' + $('.activity--load').length + ', body ' + document.body.className);
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
    '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><span>Аніме UA</span></div>';
  function addButton(e) {
    if (e.type !== 'complite') return;
    try {
      var render = e.object.activity.render(), movie = e.data.movie;
      if (render.find('.view--cs-anitube').length) return;
      var button = $(BUTTON);
      button.on('hover:enter', function () {
        Lampa.Activity.push({url: '', title: 'Аніме UA', component: 'cs_anitube', movie: movie, page: 1});
      });
      // Second in the row (other plugins add their buttons in varying order), easy to find.
      var row = render.find('.full-start-new__buttons, .full-start__buttons').first(), first = row.children('.selector').first();
      if (first.length) first.after(button); else row.append(button);
    } catch (error) { log('button ' + error); }
  }
  // For checks from the PC in our own browser (the same engine and network rules as Lampa).
  window.claudespaceAnitubeApi = {sources: SOURCES, matches: matches};
  function init() {
    // The episode row of online plugins ("prestige" look: still, title, episode name, progress).
    Lampa.Template.add('cs_anitube_item', '<div class="cs-anitube selector">' +
      '<div class="cs-anitube__img"><img alt=""></div>' +
      '<div class="cs-anitube__body"><div class="cs-anitube__head"><div class="cs-anitube__title">{title}</div>' +
      '<div class="cs-anitube__time">{time}</div></div><div class="cs-anitube__name">{name}</div>' +
      '<div class="cs-anitube__timeline"></div><div class="cs-anitube__info">{info}</div></div></div>');
    Lampa.Template.add('cs_anitube_folder', '<div class="cs-anitube selector">' +
      '<div class="cs-anitube__body"><div class="cs-anitube__head"><div class="cs-anitube__title">{title}</div>' +
      '<div class="cs-anitube__time">{year}</div></div><div class="cs-anitube__name">{info}</div></div></div>');
    $('head').append('<style>' +
      '.cs-anitube{position:relative;display:flex;background:rgba(0,0,0,.3);border-radius:.3em;margin-bottom:1.5em}' +
      '.cs-anitube.focus::after{content:"";position:absolute;top:-.5em;left:-.5em;right:-.5em;bottom:-.5em;border:.3em solid #fff;border-radius:.7em}' +
      '.cs-anitube__img{position:relative;width:13em;min-height:7.3em;flex-shrink:0;background:rgba(0,0,0,.3);border-radius:.3em;overflow:hidden}' +
      '.cs-anitube__img img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}' +
      '.cs-anitube--loaded .cs-anitube__img img{opacity:1}' +
      '.cs-anitube__body{flex-grow:1;padding:1.2em;display:flex;flex-direction:column;min-width:0}' +
      '.cs-anitube__head{display:flex;justify-content:space-between;align-items:center}' +
      '.cs-anitube__title{font-size:1.7em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
      '.cs-anitube__time{padding-left:2em;opacity:.7;white-space:nowrap}' +
      '.cs-anitube__name{opacity:.7;margin-top:.3em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
      '.cs-anitube__timeline{margin:.8em 0}.cs-anitube__info{opacity:.7;margin-top:auto}' +
      '.cs-anitube-note{opacity:.7;margin:0 0 1.2em;font-size:1.2em}' +
      '</style>');
    Lampa.Component.add('cs_anitube', component);
    Lampa.Listener.follow('full', addButton);
    log('loaded');
  }
  if (window.appready) init();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
}());
