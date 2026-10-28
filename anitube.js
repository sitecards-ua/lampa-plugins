// Lampa plugin "Аніме UA" for the TV (file name anitube.js kept: Lampa already has its address). Lampa loads
// it from GitHub Pages (lampa-plugins repository) or from our helper (browser-helper/helper.js,
// http://127.0.0.1:8765); the helper on the TV does the requests a page cannot (those that need a site's
// Referer, MOON's stream). Source: Claude Space PC/LG-TV.
// Built like Lampa's online plugins (online_mod by nb557, the BwaRC "Онлайн" plugin): a card button opens a
// screen with the poster, "Джерело" (the site: AniTube, AnimeON, AnimeLib, YummyAnime, YummyAni, UAFlix, Eneyida, BambooUA, Unimay), a Filter
// (title/season found there, voice-over), a search for one's own query and the list of episodes; an
// episode plays in Lampa's own player with the voice-over's episodes as its playlist. The choice is
// remembered per title. A site's result is taken only when its name and year match the card (names
// include TMDB's English and alternative titles); the viewer's own search lists results to pick from.
// Players: MOON (AniTube, AnimeON) — our helper reads each episode's signed HLS stream out of MOON's page;
// Kodik (AnimeLib, YummyAnime, YummyAni) — its HLS links are read as online_mod does; ZetVideo (UAFlix), HDVB (Eneyida), BambooUA, Unimay — plain HLS. ASHDI fails on this TV's 2018
// certificates and FENIX does not start here. A new site is one more entry in SOURCES. ES5 for Chromium 53.
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

  function request(url, done, post, language) {
    var x = new XMLHttpRequest();
    x.open(post ? 'POST' : 'GET', url);
    if (post) x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    if (language) x.setRequestHeader('Accept-Language', language);
    x.timeout = 20000;
    x.onload = function () { done(x.status === 200 ? null : 'HTTP ' + x.status, x.responseText); };
    x.onerror = function () { done('мережа недоступна (чи запущено «Наш браузер»?)'); };
    x.ontimeout = function () { done('сайт не відповідає'); };
    x.send(post || null);
  }
  function getJson(url, done, language) {
    request(url, function (error, text) {
      if (error) return done(error);
      var data;
      try { data = JSON.parse(text); } catch (e) { return done('незрозуміла відповідь сайту'); }
      done(null, data);
    }, null, language);
  }
  function html(text) { return new DOMParser().parseFromString(text, 'text/html'); }
  function seasonOf(title) { var m = /(\d+)\s*сезон/i.exec(title || ''); return m ? +m[1] : 1; }
  function moonPage(url) { var m = MOON.exec(url || ''); return m ? 'https://moonanime.art/iframe/' + m[1] : ''; }
  function moonStream(page) { return page ? HELPER + '/moon/hls.m3u8?url=' + encodeURIComponent(page) : ''; }
  // MOON's HLS master (served by our helper) → done(error, best variant, {"1080p": url, …}) for Lampa's
  // player: it starts at the best quality instead of hls.js's guess, and offers the others.
  function moonVariants(page, done) {
    var master = moonStream(page);
    if (!master) return done('серія без плеєра MOON');
    request(master, function (error, text) {
      if (error) return done(error);
      var lines = String(text).split(/\r?\n/), qualities = {}, best = 0, url = '';
      lines.forEach(function (line, i) {
        var m = /^#EXT-X-STREAM-INF:.*RESOLUTION=\d+x(\d+)/.exec(line), next = lines[i + 1];
        if (!m || !/^https?:\/\//.test(next || '')) return;
        qualities[qualityName(+m[1])] = next;
        if (+m[1] > best) { best = +m[1]; url = next; }
      });
      done(null, url || master, url ? qualities : null);
    });
  }
  function bySubs(a, b) { return a.subs - b.subs; }
  function attr(el, name) { return el.getAttribute(name) || ''; }

  // Kodik (the player of AnimeLib and YummyAnime), the way online_mod reads it: the episode's page carries
  // urlParams and vInfo, the player script names the POST address (atob), the answer lists HLS links per
  // quality, each ROT18 + base64. Its CDN allows any origin, so Lampa plays the link itself.
  var KODIK = 'https://kodikplayer.com', kodikInfo = '';
  function kodikUrl(link) { return /^\/\//.test(link) ? 'https:' + link : link; }
  function kodikDecode(s) {
    if (/^(https?:)?\/\//.test(s)) return s;
    try { return atob(s.replace(/[a-zA-Z]/g, function (x) { return String.fromCharCode((x <= 'Z' ? 90 : 122) >= (x = x.charCodeAt(0) + 18) ? x : x - 26); })); } catch (e) { return ''; }
  }
  function kodikStream(link, done) {
    request(kodikUrl(link), function (error, page) {
      if (error) return done(error);
      page = page.replace(/\n/g, '');
      var params = /\burlParams = '([^']+)'/.exec(page), type = /\b(?:videoInfo|vInfo)\.type = '([^']+)'/.exec(page),
        hash = /\b(?:videoInfo|vInfo)\.hash = '([^']+)'/.exec(page), id = /\b(?:videoInfo|vInfo)\.id = '([^']+)'/.exec(page),
        script = /<script [^>]*\bsrc="(\/assets\/js\/app\.player_single[^"]+)"/.exec(page), p;
      try { p = JSON.parse(params[1]); } catch (e) { return done('Kodik: незнайома сторінка плеєра'); }
      if (!type || !hash || !id || !script) return done('Kodik: незнайома сторінка плеєра');
      var body = ['d=' + p.d, 'd_sign=' + p.d_sign, 'pd=' + p.pd, 'pd_sign=' + p.pd_sign, 'ref=' + p.ref, 'ref_sign=' + p.ref_sign,
        'bad_user=true', 'cdn_is_working=true', 'type=' + type[1], 'hash=' + hash[1], 'id=' + id[1], 'info=%7B%7D'].join('&');
      function links() {
        request(KODIK + kodikInfo, function (error, text) {
          var json, best = 0, qualities = {};
          try { json = JSON.parse(text); } catch (e) {}
          if (error || !json || !json.links) return done(error || 'Kodik не дав відео');
          Object.keys(json.links).forEach(function (q) {
            var src = json.links[q][0] && kodikDecode(json.links[q][0].src);
            if (!src) return;
            qualities[qualityName(+q)] = kodikUrl(src);
            if (+q > best) best = +q;
          });
          var url = best && qualities[qualityName(best)];
          done(url ? null : 'Kodik не дав відео', url, qualities);
        }, body);
      }
      if (kodikInfo) return links();
      request(KODIK + script[1], function (error, js) {
        var m = !error && /\$\.ajax\({type: *"POST", *url: *atob\("([^"]+)"\)/.exec(js.replace(/\n/g, ''));
        try { kodikInfo = m ? atob(m[1]) : ''; } catch (e) { kodikInfo = ''; }
        if (!/^\//.test(kodikInfo)) { kodikInfo = ''; return done('Kodik: незнайомий плеєр'); }
        links();
      });
    });
  }
  // A Kodik serial or film page: its voice-overs (each its own serial/film page) and the episodes of
  // the one shown.
  function kodikPage(link, done) {
    request(kodikUrl(link), function (error, text) {
      if (error) return done(error);
      var doc = html(text), voices = [], episodes = [];
      [].forEach.call(doc.querySelectorAll('option[data-media-id]'), function (o) {
        var type = attr(o, 'data-media-type') || 'serial';
        voices.push({title: attr(o, 'data-title') + (attr(o, 'data-translation-type') === 'subtitles' ? ' (субтитри)' : ''),
          subs: attr(o, 'data-translation-type') === 'subtitles', link: KODIK + '/' + type + '/' + attr(o, 'data-media-id') + '/' + attr(o, 'data-media-hash') + '/720p'});
      });
      var seen = {};
      [].forEach.call(doc.querySelectorAll('option[data-id][data-hash]'), function (o) {
        // The page lists the episodes twice (two layouts).
        if (seen[attr(o, 'data-id')]) return;
        seen[attr(o, 'data-id')] = true;
        var n = +o.getAttribute('value') || episodes.length + 1;
        episodes.push({title: n + ' серія', number: n, link: KODIK + '/seria/' + attr(o, 'data-id') + '/' + attr(o, 'data-hash') + '/720p'});
      });
      done(null, voices, episodes);
    });
  }

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
    queries: function (n) { return [n.uk, n.original]; },
    stream: function (episode, done) { moonVariants(moonPage(episode.page), done); }
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
    queries: function (n) { return [n.uk, n.en, n.original]; },
    stream: function (episode, done) {
      getJson(ANIMEON.api + '/player/' + episode.id + '/episode', function (error, data) {
        if (error) return done(error);
        moonVariants(moonPage(data && data.videoUrl), done);
      });
    }
  };

  // Kodik voice-overs: episodes come from each voice-over's own Kodik page; a film is its page itself.
  function kodikVoices(voices, episodes) {
    return voices.map(function (v) {
      return {title: v.title, subs: v.subs, load: function (ready) {
        kodikPage(v.link, function (error, more, list) {
          if (error) return ready(error);
          ready(null, list.length ? list : [{title: '1 серія', number: 1, link: v.link}]);
        });
      }};
    }).sort(bySubs);
  }

  // yummyanime.tv (Russian titles): a DLE site; the title page's player slot "Kodik" comes from its
  // controller.php as a Kodik serial page with all voice-overs.
  var YUMMY = {
    name: 'yummy', title: 'YummyAnime', site: 'https://yummyanime.tv',
    search: function (query, done) {
      request(YUMMY.site + '/index.php?do=search', function (error, text) {
        if (error) return done(error);
        var out = [];
        [].forEach.call(html(text).querySelectorAll('.movie-item'), function (item) {
          var a = item.querySelector('a.movie-item__link[href]'), t = item.querySelector('.movie-item__title'), y = item.querySelector('.movie-item__meta');
          if (!a || !t) return;
          var title = (t.textContent || '').trim();
          out.push({title: title, year: +((/(\d{4})/.exec(y ? y.textContent : '') || [0, 0])[1]), season: seasonOf(title), id: YUMMY.site + a.getAttribute('href').replace(/^https?:\/\/[^\/]+/, '')});
        });
        done(null, out);
      }, 'do=search&subaction=search&story=' + encodeURIComponent(query));
    },
    voices: function (item, done) {
      request(item.id, function (error, page) {
        var id = !error && /data-player-anime-id="(\d+)"/.exec(page);
        if (error || !id) return done(error || 'на сторінці немає плеєра');
        (function slot(n) {
          if (n > 3) return done('на сторінці немає плеєра Kodik');
          // Through our helper: the site answers this request only with its own Referer.
          getJson(HELPER + '/yummy/player?id=' + id[1] + '&slot=' + n, function (error, out) {
            var src = out && out.data && out.data.src;
            if (error || !src || !/kodik/.test(src)) return slot(n + 1);
            kodikPage(src, function (error, voices, episodes) {
              if (error) return done(error);
              done(null, voices.length ? kodikVoices(voices, episodes) : [{title: 'Kodik', subs: false, episodes: episodes}]);
            });
          });
        }(0));
      });
    },
    queries: function (n) { return [n.ru, n.en, n.romaji]; },
    stream: function (episode, done) { kodikStream(episode.link, done); }
  };

  // animelib.org (Russian site): its JSON API through our helper (it wants the site's Referer); every
  // episode lists a Kodik player per voice-over team.
  var ANIMELIB = {
    name: 'animelib', title: 'AnimeLib', api: HELPER + '/animelib/api',
    search: function (query, done) {
      getJson(ANIMELIB.api + '/anime?q=' + encodeURIComponent(query), function (error, data) {
        if (error) return done(error);
        done(null, ((data && data.data) || []).map(function (a) {
          return {title: a.rus_name || a.name, original: a.name, alt: [a.eng_name], year: +((/(\d{4})/.exec(a.releaseDateString || '') || [0, 0])[1]),
            season: seasonOf(a.rus_name), id: a.slug_url};
        }));
      });
    },
    voices: function (item, done) {
      getJson(ANIMELIB.api + '/episodes?anime_id=' + item.id, function (error, data) {
        var list = (data && data.data) || [];
        if (error || !list.length) return done(error || 'серій ще немає');
        var episodes = list.map(function (e) { return {title: (e.number || '') + ' серія', number: +e.number || 0, name: e.name, id: e.id}; });
        getJson(ANIMELIB.api + '/episodes/' + list[0].id, function (error, first) {
          if (error) return done(error);
          var seen = {}, voices = [];
          (((first && first.data) || {}).players || []).forEach(function (p) {
            var team = p.team && p.team.name;
            if (p.player !== 'Kodik' || !team || seen[team]) return;
            seen[team] = true;
            var subs = /субтитр/i.test(p.translation_type && p.translation_type.label);
            voices.push({title: team + (subs ? ' (субтитри)' : ''), team: team, subs: subs, episodes: episodes.map(function (e) {
              return {title: e.title, number: e.number, id: e.id, team: team};
            })});
          });
          done(null, voices.sort(bySubs));
        });
      });
    },
    queries: function (n) { return [n.en, n.romaji, n.ru]; },
    stream: function (episode, done) {
      getJson(ANIMELIB.api + '/episodes/' + episode.id, function (error, data) {
        if (error) return done(error);
        var player = (((data && data.data) || {}).players || []).filter(function (p) { return p.player === 'Kodik' && p.team && p.team.name === episode.team && p.src; })[0];
        if (!player) return done('у цієї серії немає озвучки ' + episode.team);
        kodikStream(player.src, done);
      });
    }
  };
  // YummyAni (yummyani.me, Russian): the site's public API api.yani.tv lists every episode of every
  // voice-over with its player; the Kodik ones are taken.
  var YANI = {
    name: 'yani', title: 'YummyAni', api: 'https://api.yani.tv',
    // The API names titles in the asking browser's language; the TV asks for Ukrainian, which gives the
    // site's own Ukrainian names, unlike TMDB's — Russian ones match TMDB's Russian alternative title.
    search: function (query, done) {
      getJson(YANI.api + '/search?q=' + encodeURIComponent(query) + '&limit=20', function (error, data) {
        if (error) return done(error);
        done(null, ((data && data.response) || []).map(function (a) {
          return {title: a.title, year: a.year || 0, season: seasonOf(a.title), id: a.anime_id};
        }));
      }, 'ru');
    },
    voices: function (item, done) {
      getJson(YANI.api + '/anime/' + item.id + '/videos', function (error, data) {
        if (error) return done(error);
        var groups = {}, order = [];
        ((data && data.response) || []).forEach(function (v) {
          if (!v.data || !/kodik/i.test(v.data.player || '') || !v.iframe_url) return;
          var dub = v.data.dubbing || 'Kodik', subs = /^Субтитр/i.test(dub), number = +v.number || 0;
          var title = dub.replace(/^(Озвучка|Субтитры)\s+/i, '') + (subs ? ' (субтитри)' : '');
          if (!groups[title]) { groups[title] = {title: title, subs: subs, episodes: [], seen: {}}; order.push(title); }
          if (groups[title].seen[number]) return;
          groups[title].seen[number] = true;
          groups[title].episodes.push({title: number + ' серія', number: number, link: v.iframe_url});
        });
        done(null, order.map(function (t) {
          var g = groups[t];
          g.episodes.sort(function (a, b) { return a.number - b.number; });
          return {title: g.title, subs: g.subs, episodes: g.episodes};
        }).sort(bySubs));
      });
    },
    queries: function (n) { return [n.ru, n.en, n.romaji]; },
    stream: function (episode, done) { kodikStream(episode.link, done); }
  };
  // UAFlix (uafix.net, Ukrainian films and series): a DLE site; a title holds all its seasons, each
  // episode is its own page with one player — ZetVideo (plain HLS, any origin) or ASHDI (fails here).
  // ZetVideo's page names the stream only with UAFlix's Referer, so our helper fetches it.
  var UAFLIX = {
    name: 'uaflix', title: 'UAFlix', site: 'https://uafix.net',
    search: function (query, done) {
      request(UAFLIX.site + '/index.php?do=search', function (error, text) {
        if (error) return done(error);
        var out = [];
        [].forEach.call(html(text).querySelectorAll('a.sres-wrap[href]'), function (a) {
          var h = a.querySelector('h2'), href = a.getAttribute('href');
          if (!h || !/^https:\/\/uafix\.net\/(films|serials|anime|cartoons|dorama)\//.test(href)) return;
          // "Українська / Original / English"; the search page shows no year.
          var names = (h.textContent || '').split(' / ').map(function (s) { return s.trim(); });
          out.push({title: names[0], original: names[1], alt: names.slice(2), year: 0, season: 1, id: href});
        });
        done(null, out);
      }, 'do=search&subaction=search&story=' + encodeURIComponent(query));
    },
    // Seasons stand for voice-overs here: each season's episodes come from one of its episode pages,
    // which lists the whole season (the season page shows only the latest 20).
    voices: function (item, done) {
      request(item.id, function (error, page) {
        if (error) return done(error);
        var doc = html(page), seasons = [];
        [].forEach.call(doc.querySelectorAll('.all-sez a[href*="/sezon-"]'), function (a) {
          var n = +(/sezon-(\d+)/.exec(a.getAttribute('href')) || [0, 0])[1];
          if (n) seasons.push({title: 'Сезон ' + n, season: n, subs: false, load: function (ready) { UAFLIX.season(item.id, n, ready); }});
        });
        if (seasons.length) return done(null, seasons);
        done(null, [{title: 'UAFlix', subs: false, episodes: [{title: '1 серія', number: 1, page: item.id}]}]);
      });
    },
    season: function (title, n, ready) {
      var path = title.replace(/^https:\/\/[^\/]+/, '').replace(/\/$/, ''), mark = '/season-' + (n < 10 ? '0' : '') + n + '-episode-';
      function episodes(text) {
        var seen = {}, list = [];
        [].forEach.call(html(text).querySelectorAll('a[href*="' + path + mark + '"]'), function (a) {
          var number = +(/-episode-(\d+)/.exec(a.getAttribute('href')) || [0, 0])[1];
          if (!number || seen[number]) return;
          seen[number] = true;
          list.push({title: number + ' серія', number: number, page: UAFLIX.site + path + mark + (number < 10 ? '0' : '') + number + '/'});
        });
        return list.sort(function (a, b) { return a.number - b.number; });
      }
      request(UAFLIX.site + path + '/sezon-' + n + '/', function (error, text) {
        if (error) return ready(error);
        var some = episodes(text);
        if (!some.length) return ready(null, []);
        request(some[0].page, function (error, text) {
          var all = error ? [] : episodes(text);
          ready(null, all.length > some.length ? all : some);
        });
      });
    },
    queries: function (n) { return [n.uk, n.en, n.original]; },
    stream: function (episode, done) {
      request(episode.page, function (error, page) {
        if (error) return done(error);
        var zet = /<iframe[^>]+src="https:\/\/zetvideo\.net\/vod\/(\d+)/.exec(page);
        if (!zet) return done(/ashdi\./.test(page) ? 'ця серія на UAFlix лише в плеєрі ASHDI, він на цьому ТВ не працює' : 'на сторінці немає плеєра');
        request(HELPER + '/zetvideo/vod/' + zet[1], function (error, text) {
          var file = !error && /file:"(https:\/\/zetvideo\.net\/[^"]+\.m3u8)"/.exec(text);
          if (!file) return done(error || 'ZetVideo не дав відео');
          hlsVariants(file[1], done);
        });
      });
    }
  };

  // A plain HLS address (any origin may read it) → done(error, best variant, {"1080p": url, …}); a stream
  // without variants is played as it is.
  function hlsVariants(master, done) {
    request(master, function (error, text) {
      if (error) return done(error);
      var lines = String(text).split(/\r?\n/), qualities = {}, best = 0, url = '';
      lines.forEach(function (line, i) {
        var m = /^#EXT-X-STREAM-INF:.*RESOLUTION=\d+x(\d+)/.exec(line), next = lines[i + 1];
        if (!m || !/^https?:\/\//.test(next || '')) return;
        qualities[qualityName(+m[1])] = next;
        if (+m[1] > best) { best = +m[1]; url = next; }
      });
      done(null, url || master, url ? qualities : null);
    });
  }
  // A Playerjs playlist (the "file" of HDVB's and BambooUA's players): a film's address, voice-overs
  // with their file, voice-overs with episodes, or seasons → voice-overs → episodes. Gives voice-overs,
  // each with its season when the playlist has seasons (as UAFlix's are).
  function playerjsVoices(file, name) {
    function number(title, n) { return +(/(\d+)/.exec(title || '') || [0, n])[1]; }
    function episodes(list) {
      return (list || []).filter(function (e) { return e.file; }).map(function (e, i) { return {title: number(e.title, i + 1) + ' серія', number: number(e.title, i + 1), file: e.file}; });
    }
    function voice(title, eps, season) {
      var subs = /субтитр/i.test(title);
      return {title: title + (subs && !/субтитр/i.test(title) ? ' (субтитри)' : ''), subs: subs, season: season, episodes: eps};
    }
    if (typeof file === 'string' && !/^\s*\[/.test(file)) return [voice(name, [{title: '1 серія', number: 1, file: file}])];
    var list;
    try { list = typeof file === 'string' ? JSON.parse(file) : file; } catch (e) { return []; }
    if (!list || !list.length) return [];
    var out = [];
    if (list[0].folder && list[0].folder[0] && list[0].folder[0].folder) {
      list.forEach(function (s, i) {
        var season = number(s.title, i + 1);
        (s.folder || []).forEach(function (v) { out.push(voice((list.length > 1 ? 'Сезон ' + season + ' · ' : '') + v.title, episodes(v.folder), season)); });
      });
    } else if (list[0].folder) {
      list.forEach(function (v) { out.push(voice(v.title || name, episodes(v.folder))); });
    } else {
      list.forEach(function (v) { if (v.file) out.push(voice(v.title || name, [{title: '1 серія', number: 1, file: v.file}])); });
    }
    return out.filter(function (v) { return v.episodes.length; }).sort(bySubs);
  }

  // Eneyida (eneyida.tv, Ukrainian films and series): a DLE site whose player is HDVB (hdvbua.pro) — its
  // page holds the whole Playerjs playlist, and the streams are plain HLS that any origin may read.
  var ENEYIDA = {
    name: 'eneyida', title: 'Eneyida', site: 'https://eneyida.tv',
    search: function (query, done) {
      request(ENEYIDA.site + '/index.php?do=search', function (error, text) {
        if (error) return done(error);
        var out = [];
        [].forEach.call(html(text).querySelectorAll('article.short'), function (item) {
          var a = item.querySelector('a.short_title[href]'), sub = item.querySelector('.short_subtitle');
          if (!a || !/^https:\/\/eneyida\.tv\/\d+-[^\/]+\.html$/.test(a.getAttribute('href'))) return;
          // "2022 • From"
          var parts = (sub ? sub.textContent : '').split('•'), title = (a.textContent || '').trim();
          out.push({title: title, original: (parts[1] || '').trim(), year: +((/(\d{4})/.exec(parts[0] || '') || [0, 0])[1]), season: 1, id: a.getAttribute('href')});
        });
        done(null, out);
      }, 'do=search&subaction=search&story=' + encodeURIComponent(query));
    },
    voices: function (item, done) {
      request(item.id, function (error, page) {
        var embed = !error && /<iframe[^>]+src="(https:\/\/hdvbua\.pro\/embed\/[^"]+)"/.exec(page);
        if (error || !embed) return done(error || 'на сторінці немає плеєра HDVB');
        request(embed[1].replace(/&amp;/g, '&'), function (error, player) {
          if (error) return done(error);
          var file = /\bfile:\s*'(\[[\s\S]*?\])'/.exec(player) || /\bfile:\s*"([^"]+)"/.exec(player);
          if (!file) return done('HDVB не дав відео');
          done(null, playerjsVoices(file[1], 'Eneyida'));
        });
      });
    },
    queries: function (n) { return [n.uk, n.en, n.original]; },
    stream: function (episode, done) { hlsVariants(episode.file, done); }
  };

  // BambooUA (bambooua.com: anime, dorama, Asian films, mostly subtitled): a DLE site; the title page
  // holds its Playerjs playlist (voice-over or subtitles → episodes) with plain HLS streams.
  var BAMBOO = {
    name: 'bamboo', title: 'BambooUA', site: 'https://bambooua.com',
    search: function (query, done) {
      request(BAMBOO.site + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query), function (error, text) {
        if (error) return done(error);
        var out = [], seen = {};
        [].forEach.call(html(text).querySelectorAll('.cat-item'), function (item) {
          var a = item.querySelector('a.link-title[href]'), h = item.querySelector('.title h2'), href = a && a.getAttribute('href');
          var slug = /^https:\/\/bambooua\.com\/(?:anime|cinema|dorama|lakorn|tv-show|lgbtq)\/\d+-([a-z0-9-]+)\.html$/.exec(href || '');
          if (!slug || !h || seen[href]) return;
          seen[href] = true;
          // The address carries the English name ("the-summer-hikaru-died"); the search page shows no year.
          out.push({title: (h.textContent || '').trim(), alt: [slug[1].replace(/-/g, ' ')], year: 0, season: 1, id: href});
        });
        done(null, out);
      });
    },
    voices: function (item, done) {
      request(item.id, function (error, page) {
        var list = !error && /\bplaylist\s*=\s*(\[.*\]);/.exec(page);
        if (error || !list) return done(error || 'на сторінці немає плеєра');
        done(null, playerjsVoices(list[1], 'BambooUA'));
      });
    },
    queries: function (n) { return [n.uk, n.en, n.romaji]; },
    stream: function (episode, done) { hlsVariants(episode.file, done); }
  };
  // Unimay (unimay.media, a Ukrainian anime dubbing studio): its open JSON API lists each release's
  // episodes with HLS streams per quality (any origin may read them); premium-only episodes have none.
  var UNIMAY = {
    name: 'unimay', title: 'Unimay', api: 'https://api.unimay.media/v1',
    search: function (query, done) {
      getJson(UNIMAY.api + '/release/search?title=' + encodeURIComponent(query) + '&page=0&size=20', function (error, data) {
        if (error) return done(error);
        done(null, ((data && data.content) || []).map(function (r) {
          var n = r.names || {};
          return {title: n.ukr || n.eng, original: n.romaji, alt: [n.eng], year: r.year || 0, season: seasonOf(n.ukr), id: r.code};
        }));
      });
    },
    voices: function (item, done) {
      getJson(UNIMAY.api + '/release?code=' + encodeURIComponent(item.id), function (error, data) {
        if (error) return done(error);
        var episodes = ((data && data.playlist) || []).filter(function (e) { return e.hls && e.hls.qualities; }).map(function (e) {
          return {title: e.number + ' серія', number: e.number, qualities: e.hls.qualities};
        });
        done(null, episodes.length ? [{title: 'Unimay', subs: false, episodes: episodes}] : []);
      });
    },
    queries: function (n) { return [n.uk, n.en, n.romaji]; },
    stream: function (episode, done) {
      var names = {fhd: '1080p', hd: '720p', sd: '480p'}, qualities = {}, url = '';
      ['sd', 'hd', 'fhd'].forEach(function (k) { if (episode.qualities[k]) { qualities[names[k]] = episode.qualities[k]; url = episode.qualities[k]; } });
      done(url ? null : 'Unimay не дав відео', url, qualities);
    }
  };
  var SOURCES = [ANITUBE, ANIMEON, ANIMELIB, YUMMY, YANI, UAFLIX, ENEYIDA, BAMBOO, UNIMAY];

  // Sites search descriptions too, so a result counts only when one of its names matches the card's and its
  // year fits: a film within a year, a series from its first year on (later seasons come later).
  function plain(name) {
    return String(name || '').toLowerCase().replace(/[ʼ’'`]/g, '').replace(/\(?\s*\d+\s*сезон\s*\)?|(^|\s)сезон\s*\d+|\(\s*фільм\s*\)/g, ' ')
      .replace(/[^0-9a-zа-яіїєґё]+/g, ' ').trim();
  }
  // Equal names, or one continuing the other ("Магічна битва" — "Магічна битва 0"). A one-word name may
  // be continued only by a season, part or film mark: "From" is not "From Old Country Bumpkin…".
  var SEQUEL = /^(\d+|[ivx]+|сезон|season|частина|часть|part|фільм|фильм|film|movie|the movie|tv|ova|ona|special|спешл)( |$)/;
  function sameName(a, b) {
    a = plain(a); b = plain(b);
    if (!a || !b) return false;
    if (a === b) return true;
    var short = a.length < b.length ? a : b, long = short === a ? b : a;
    if (long.indexOf(short + ' ') !== 0) return false;
    return short.indexOf(' ') > 0 || SEQUEL.test(long.slice(short.length + 1));
  }
  function matches(result, movie, names) {
    names = names || [movie.title, movie.name, movie.original_title, movie.original_name];
    var same = [result.title, result.original].concat(result.alt || []).some(function (r) { return names.some(function (n) { return sameName(r, n); }); });
    var year = +String(movie.release_date || movie.first_air_date || '').slice(0, 4);
    if (!same || !year || !result.year) return same;
    return movie.name ? result.year >= year - 1 : Math.abs(result.year - year) <= 1;
  }

  // The best quality a voice-over has, read from its first episode's stream (the qualities a source gives).
  function qualityName(height) {
    return height >= 2000 ? '4K' : height >= 1000 ? '1080p' : height >= 700 ? '720p' : height >= 470 ? '480p' : height ? height + 'p' : '';
  }
  function qualityRank(label) { return label === '4K' ? 2160 : parseInt(label, 10) || 0; }
  function qualityOf(src, episode, done) {
    src.stream(episode, function (error, url, qualities) {
      var best = '';
      Object.keys(qualities || {}).forEach(function (q) { if (qualityRank(q) > qualityRank(best)) best = q; });
      done(error ? '' : best);
    });
  }

  // The card's names for searching and matching: its Ukrainian and original ones, plus from TMDB the
  // English one and the alternative titles (Russian ones for the Russian sites, romaji for AnimeLib).
  var namesCache = {};
  function cardNames(movie, done) {
    var key = (movie.name ? 'tv' : 'movie') + movie.id;
    if (namesCache[key]) return done(namesCache[key]);
    var n = {uk: movie.title || movie.name, original: movie.original_title || movie.original_name, en: '', ru: '', romaji: '', all: []};
    function finish() {
      n.all = [n.uk, n.original, n.en, n.ru, n.romaji].concat(n.alts || []).filter(function (t, i, a) { return t && a.indexOf(t) === i; });
      done(namesCache[key] = n);
    }
    if (!movie.id || movie.source && movie.source !== 'tmdb') return finish();
    var url = Lampa.TMDB.api((movie.name ? 'tv/' : 'movie/') + movie.id + '?api_key=' + Lampa.TMDB.key() + '&language=en-US&append_to_response=alternative_titles');
    new Lampa.Reguest().silent(url, function (json) {
      var alts = json && json.alternative_titles ? json.alternative_titles.results || json.alternative_titles.titles || [] : [];
      n.en = json && (json.name || json.title) || '';
      alts.forEach(function (a) {
        if (a.iso_3166_1 === 'RU' && !n.ru) n.ru = a.title;
        if (a.iso_3166_1 === 'JP' && /^[\x00-\x7f]+$/.test(a.title) && !n.romaji) n.romaji = a.title;
      });
      n.alts = alts.map(function (a) { return a.title; }).slice(0, 30);
      finish();
    }, finish);
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
  // The TV unloads Lampa while our browser is in front, so coming back starts Lampa anew on its home
  // screen: the card is kept here and reopened by init() (with this screen) when that happens.
  var RESUME_KEY = 'cs_anitube_resume';
  function wakeHelper(movie, done) {
    ping(function (up) {
      if (up) return done(true);
      Lampa.Storage.set(RESUME_KEY, {movie: movie, at: Date.now()});
      openOurBrowser();
      var tries = 0;
      (function wait() {
        setTimeout(function () {
          ping(function (ok) {
            if (ok) { Lampa.Storage.set(RESUME_KEY, {}); return done(true); }
            if (++tries < 25) wait(); else done(false);
          });
        }, 1000);
      }());
    });
  }
  function resume() {
    var saved = Lampa.Storage.get(RESUME_KEY, '{}') || {};
    if (!saved.movie || !(Date.now() - saved.at < 120000)) return;
    Lampa.Storage.set(RESUME_KEY, {});
    var movie = saved.movie;
    log('resume ' + (movie.title || movie.name));
    Lampa.Activity.push({url: '', component: 'full', id: movie.id, method: movie.name ? 'tv' : 'movie', card: movie, source: movie.source || 'tmdb'});
    setTimeout(function () { Lampa.Activity.push({url: '', title: 'Аніме UA', component: 'cs_anitube', movie: movie, page: 1}); }, 1500);
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
      wakeHelper(movie, function (up) {
        if (up) _this.begin(); else _this.empty('Не вдалося запустити помічника. Відкрийте «Наш браузер», потім поверніться сюди.');
      });
      return this.render();
    };

    // The site chosen for this card before, or else the first site where the title surely is. Results
    // that do not match the card are offered only for the viewer's own search: on a card of a film that
    // is not anime they would be other titles altogether.
    this.begin = function () {
      var chosen = SOURCES.filter(function (s) { return s.name === saved.source; })[0];
      var order = chosen ? [chosen].concat(SOURCES.filter(function (s) { return s !== chosen; })) : SOURCES;
      (function next(i) {
        if (i >= order.length) {
          source = order[0];
          _this.buildFilter();
          return _this.empty('Немає «' + name + '» ні на ' + SOURCES.map(function (s) { return s.title; }).join(', ') +
            '. Якщо на сайті воно під іншою назвою — «Пошук» (лупа вгорі).');
        }
        _this.collect(order[i], null, function (all, sure) {
          if (sure.length) { source = order[i]; return _this.useTitles(sure); }
          next(i + 1);
        });
      }(0));
    };

    // A site's results for the card's names (local first: the sites name titles in Ukrainian), or for
    // the viewer's own query; done(all, sure), sure = those matching the card.
    this.collect = function (src, query, done) {
      cardNames(movie, function (n) {
        var queries = (query ? [query] : src.queries(n)).filter(function (q, i, all) { return q && all.indexOf(q) === i; });
        var seen = {}, all = [], failed = '';
        (function next(i) {
          if (i >= queries.length) {
            log(src.name + ' "' + queries.join('" "') + '": ' + all.length + ' results' + (failed ? ', ' + failed : ''));
            all.forEach(function (t, i) {
              t.order = i;
              t.exact = [t.title, t.original].concat(t.alt || []).some(function (r) { return r && n.all.some(function (x) { return plain(r) === plain(x); }); });
            });
            return done(all, query ? [] : all.filter(function (t) { return matches(t, movie, n.all); }), failed);
          }
          src.search(queries[i], function (error, list) {
            if (error) failed = error;
            (list || []).forEach(function (t) { if (!seen[t.id]) { seen[t.id] = true; all.push(t); } });
            next(i + 1);
          });
        }(0));
      });
    };

    this.look = function (src, query) {
      source = src;
      this.reset();
      this.buildFilter();
      this.activity.loader(true);
      this.collect(src, query, function (all, sure, failed) {
        if (sure.length) return _this.useTitles(sure);
        if (query && all.length === 1) return _this.useTitles(all, 0);
        if (query && all.length) return _this.similars(all);
        _this.empty(failed ? src.title + ': ' + failed : 'На ' + src.title + ' немає «' + (query || name) + '». Спробуйте інше джерело або «Пошук».');
      });
    };

    this.useTitles = function (list, index) {
      // Seasons in order; within one, the title named exactly like the card before spin-offs.
      titles = list.slice().sort(function (a, b) { return a.season - b.season || (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || a.order - b.order; });
      // A picked result stays picked; otherwise the one chosen before for this card, or the first season.
      titleIndex = index === undefined ? 0 : titles.indexOf(list[index]);
      if (index === undefined) titles.forEach(function (t, n) { if (String(t.id) === saved.title) titleIndex = n; });
      log(source.name + ' title ' + titles[titleIndex].title);
      this.loadVoices();
    };

    // No sure match: the site's results to pick from, like online_mod's "similars".
    this.similars = function (list) {
      this.reset();
      scroll.append($('<div class="cs-anitube-note">Знайдено на ' + source.title + ' — оберіть:</div>'));
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
    // UAFlix keeps all seasons under one title and offers them as voice-overs, each with its season.
    function season() {
      if (voices[voiceIndex] && voices[voiceIndex].season) return voices[voiceIndex].season;
      return titles[titleIndex] ? titles[titleIndex].season || 1 : 1;
    }
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
        return voice.load(function (error, list) {
          if (error) return _this.empty(source.title + ': ' + error);
          voice.episodes = list;
          if (voices[voiceIndex] === voice) _this.draw();
        });
      }
      if (!voice.episodes.length) return this.empty('У цієї озвучки ще немає серій');
      // A film is one "episode" (AnimeON numbers it 0): call it by the card's name.
      if (!movie.name && voice.episodes.length === 1) voice.episodes[0].title = name;
      var still = movie.backdrop_path ? Lampa.TMDB.image('t/p/w300' + movie.backdrop_path) : '';
      episodesInfo(function (info) {
        if (voices[voiceIndex] !== voice) return;
        voice.episodes.forEach(function (episode, index) {
          var e = info[episode.number - 1] || {};
          var date = e.air_date ? e.air_date.split('-').reverse().join('.') : '';
          var item = Lampa.Template.get('cs_anitube_item', {
            title: episode.title, name: e.name && !/^(серія|епізод|episode)\s*\d+$/i.test(e.name) ? e.name : '',
            info: voice.title, time: [e.runtime ? e.runtime + ' хв' : '', date].filter(Boolean).join(' · '), quality: voice.quality || ''
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
        if (voice.quality === undefined) {
          voice.quality = '';
          qualityOf(source, voice.episodes[0], function (label) {
            voice.quality = label;
            if (voices[voiceIndex] === voice) scroll.render().find('.cs-anitube__quality').text(label);
          });
        }
      });
    };

    // Lampa's own player, the voice-over as its playlist; each episode's stream is looked up when it is
    // played (online_mod does the same with url as a function). hls_type 'hlsjs': Lampa loads the stream
    // with hls.js in its page, since MOON's CDN answers only a real browser (the TV's own player gets 403).
    this.play = function (index) {
      var voice = voices[voiceIndex], src = source;
      // The best quality first; the others go to Lampa's quality menu.
      function stream(episode, call) {
        src.stream(episode, function (error, url, qualities) {
          if (error || !url) log('no stream: ' + (error || 'no url'));
          call(url || '', error, qualities);
        });
      }
      var playlist = voice.episodes.map(function (episode) {
        var cell = {title: [name, episode.title === name ? '' : episode.title, voice.title].filter(Boolean).join(' · '), hls_type: 'hlsjs'};
        // Lampa keeps the watch progress under the same key online plugins use, and the rows show it.
        try { cell.timeline = Lampa.Timeline.view(hash(episode.number)); } catch (error) {}
        cell.url = function (call) { stream(episode, function (url, error, qualities) { cell.url = url; if (qualities) cell.quality = qualities; call(); }); };
        return cell;
      });
      stream(voice.episodes[index], function (url, error, qualities) {
        if (!url) return Lampa.Noty.show('Не вдалося отримати відео цієї серії' + (error ? ': ' + error : ''));
        playlist[index].url = url;
        if (qualities) playlist[index].quality = qualities;
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
        if (Lampa.Activity.active().activity === this.activity && this.inActivity()) this.activity.toggle();      }
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
  window.claudespaceAnitubeApi = {sources: SOURCES, matches: matches, cardNames: cardNames};
  function init() {
    // The episode row of online plugins ("prestige" look: still, title, episode name, progress).
    Lampa.Template.add('cs_anitube_item', '<div class="cs-anitube selector">' +
      '<div class="cs-anitube__img"><img alt=""></div>' +
      '<div class="cs-anitube__body"><div class="cs-anitube__head"><div class="cs-anitube__title">{title}</div>' +
      '<div class="cs-anitube__time">{time}</div></div><div class="cs-anitube__name">{name}</div>' +
      '<div class="cs-anitube__timeline"></div><div class="cs-anitube__footer"><div class="cs-anitube__info">{info}</div>' +
      '<div class="cs-anitube__quality">{quality}</div></div></div></div>');
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
      '.cs-anitube__timeline{margin:.8em 0}.cs-anitube__info{opacity:.7}' +
      '.cs-anitube__footer{display:flex;justify-content:space-between;align-items:center;margin-top:auto}' +
      '.cs-anitube__quality{padding:.1em .5em;border:.1em solid rgba(255,255,255,.6);border-radius:.3em;font-size:.9em}' +
      '.cs-anitube__quality:empty{display:none}' +
      '.cs-anitube-note{opacity:.7;margin:0 0 1.2em;font-size:1.2em}' +
      '</style>');
    Lampa.Component.add('cs_anitube', component);
    Lampa.Listener.follow('full', addButton);
    log('loaded');
    resume();
  }
  if (window.appready) init();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
}());
