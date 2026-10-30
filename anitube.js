// Lampa plugin "Кіно UA" (formerly "Аніме UA") for the TV (file name anitube.js kept: Lampa already has its address). Lampa loads
// it from GitHub Pages (lampa-plugins repository) or from our helper (browser-helper/helper.js,
// http://127.0.0.1:8765); the helper on the TV does the requests a page cannot (those that need a site's
// Referer, MOON's stream). Source: Claude Space PC/LG-TV.
// Built like Lampa's online plugins (online_mod by nb557, the BwaRC "Онлайн" plugin): a card button opens a
// screen with the poster, "Джерело" (the site: AniTube, AnimeON, Mikai, AnimeLib, YummyAnime, YummyAni, UAFlix, Eneyida, UASerials, Serialno, BambooUA, Unimay), a Filter
// (title/season found there, voice-over), a search for one's own query and the list of episodes; an
// episode plays in Lampa's own player with the voice-over's episodes as its playlist. The choice is
// remembered per title. A site's result is taken only when its name and year match the card (names
// include TMDB's English and alternative titles); the viewer's own search lists results to pick from.
// Players: MOON (AniTube, AnimeON) — our helper reads each episode's signed HLS stream out of MOON's page;
// Kodik (AnimeLib, YummyAnime, YummyAni) — its HLS links are read as online_mod does; ZetVideo (UAFlix), HDVB (Eneyida, UASerials), BambooUA, Unimay — plain HLS; Tortuga (Serialno, Mikai) — its own script reads the playlist. ASHDI fails on this TV's 2018
// certificates and FENIX does not start here. A new site is one more entry in SOURCES. ES5 for Chromium 53.
(function () {
  'use strict';
  if (window.claudespaceAnitube) return;
  window.claudespaceAnitube = true;

  var HELPER = 'http://127.0.0.1:8765';
  // AniTube links MOON's pages on moonanime.net since October 2026; the same page is on moonanime.art, the
  // address our helper takes.
  var MOON = /^https:\/\/moonanime\.(?:art|net)\/iframe\/([A-Za-z0-9_-]+)/;
  var CHOICE_KEY = 'cs_anitube_choice';
  // A plain box, not an SVG: Lampa's styles stretch an SVG over the whole menu row.
  var UA_FLAG = '<span style="display:inline-block;width:1.2em;height:.8em;margin-left:.5em;vertical-align:middle;border-radius:.1em;' +
    'background:linear-gradient(#0057b7 50%,#ffd700 50%)"></span>';

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
  // A season mark at the end of any of a title's names (sites with a title per season): "Сезон 3", "Hyakushou
  // Kizoku S3", "Shiguang Dailiren III", "Агенти Часу 3", "Провожающая в последний путь Фрирен 2". The highest.
  function seasonMark(names) {
    var roman = {II: 2, III: 3, IV: 4, V: 5, VI: 6}, best = 1;
    names.forEach(function (name) {
      var m, s = 1;
      name = String(name || '').trim();
      if (/сезон/i.test(name)) s = seasonOf(name);
      else if ((m = /\bS(\d{1,2})$/i.exec(name))) s = +m[1];
      else if ((m = /\s(II|III|IV|V|VI)$/.exec(name))) s = roman[m[1]];
      else if ((m = /\s(\d)$/.exec(name))) s = +m[1];
      if (s > best) best = s;
    });
    return best;
  }
  function seasonOf(title) { var m = /(\d+)\s*сезон/i.exec(title || '') || /сезон\s*(\d+)/i.exec(title || ''); return m ? +m[1] : 1; }
  function moonPage(url) { var m = MOON.exec(url || ''); return m ? 'https://moonanime.art/iframe/' + m[1] : ''; }
  function moonStream(page) { return page ? HELPER + '/moon/hls.m3u8?url=' + encodeURIComponent(page) : ''; }
  // MOON's HLS master (served by our helper) → done(error, best variant, {"1080p": url, …}) for Lampa's
  // player: it starts at the best quality instead of hls.js's guess, and offers the others.
  function moonVariants(page, done) {
    if (!moonStream(page)) return done('серія без плеєра MOON');
    // The helper reads the signed address out of the page; the playlist is read here, since the certificate
    // of its server (s.moonanime.net) is one the helper's old Node does not accept.
    getJson(HELPER + '/moon/stream?url=' + encodeURIComponent(page), function (error, data) {
      if (error || !data || !data.url) return done(error || 'MOON не дав відео');
      hlsVariants(data.url, done);
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
    name: 'yummy', title: 'YummyAnime', site: 'https://yummyanime.tv', russian: true,
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
    name: 'animelib', title: 'AnimeLib', api: HELPER + '/animelib/api', russian: true,
    search: function (query, done) {
      getJson(ANIMELIB.api + '/anime?q=' + encodeURIComponent(query), function (error, data) {
        if (error) return done(error);
        done(null, ((data && data.data) || []).map(function (a) {
          return {title: a.rus_name || a.name, original: a.name, alt: [a.eng_name], year: +((/(\d{4})/.exec(a.releaseDateString || '') || [0, 0])[1]),
            season: seasonMark([a.rus_name, a.name, a.eng_name]), id: a.slug_url};
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
    name: 'yani', title: 'YummyAni', api: 'https://api.yani.tv', russian: true,
    // The API names titles in the asking browser's language; the TV asks for Ukrainian, which gives the
    // site's own Ukrainian names, unlike TMDB's — Russian ones match TMDB's Russian alternative title.
    search: function (query, done) {
      getJson(YANI.api + '/search?q=' + encodeURIComponent(query) + '&limit=20', function (error, data) {
        if (error) return done(error);
        done(null, ((data && data.response) || []).map(function (a) {
          return {title: a.title, year: a.year || 0, season: seasonMark([a.title]), id: a.anime_id};
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
    // One voice-over per season (the site names none), marked with its season for the screen's "Сезон"
    // choice: each season's episodes come from one of its episode pages, which lists the whole season
    // (the season page shows only the latest 20).
    voices: function (item, done) {
      request(item.id, function (error, page) {
        if (error) return done(error);
        var doc = html(page), seasons = [];
        [].forEach.call(doc.querySelectorAll('.all-sez a[href*="/sezon-"]'), function (a) {
          var n = +(/sezon-(\d+)/.exec(a.getAttribute('href')) || [0, 0])[1];
          if (n) seasons.push({title: 'UAFlix', season: n, subs: false, load: function (ready) { UAFLIX.season(item.id, n, ready); }});
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
        if (!zet) {
          var ashdi = /<iframe[^>]+src="(https:\/\/ashdi\.vip\/[^"]+)"/.exec(page);
          if (!ashdi) return done('на сторінці немає плеєра');
          return ashdiStream(ashdi[1].replace(/&amp;/g, '&'), done);
        }
        request(HELPER + '/zetvideo/vod/' + zet[1], function (error, text) {
          var file = !error && /file:"(https:\/\/zetvideo\.net\/[^"]+\.m3u8)"/.exec(text);
          if (!file) return done(error || 'ZetVideo не дав відео');
          hlsVariants(file[1], done);
        });
      });
    }
  };

  // Asks the server of the Free Bandera plugin to read an ASHDI player (this TV's page requests cannot):
  // ref is {play: address}; done(error, its answer).
  function makhnoContent(ref, done) {
    var x = new XMLHttpRequest();
    x.open('POST', 'https://bbe.lme.isroot.in/api/v2/content');
    x.setRequestHeader('Content-Type', 'application/json');
    x.timeout = 20000;
    x.onload = function () {
      var data;
      try { data = JSON.parse(x.responseText); } catch (e) { return done('незрозуміла відповідь сервера'); }
      done(null, data);
    };
    x.onerror = function () { done('мережа недоступна'); };
    x.ontimeout = function () { done('сервер не відповідає'); };
    x.send(JSON.stringify({source: 'makhno', ref: ref, full: true}));
  }
  // The stream of an ASHDI player address, for the TV's own player (done's 4th argument): a series'
  // address names its season and episode, which are looked up by number; else a film's first stream.
  function ashdiStream(address, done) {
    var s = /[?&]season=(\d+)/.exec(address), e = /[?&]episode=(\d+)/.exec(address);
    makhnoContent({play: address.split('?')[0], serial: s ? 1 : 0}, function (error, data) {
      if (error || !data) return done(error || 'ASHDI не дав відео');
      var file = '';
      if (s && e) {
        (data.voices || []).forEach(function (v) {
          (v.seasons || []).forEach(function (season) {
            if (file || +season.title !== +s[1]) return;
            (season.episodes || []).forEach(function (ep) { if (!file && +ep.number === +e[1] && ep.file) file = ep.file; });
          });
        });
      } else if (data.streams && data.streams[0]) file = data.streams[0].url;
      done(file ? null : 'ASHDI не дав цю серію', file, null, true);
    });
  }

  // A plain HLS address (any origin may read it) → done(error, best variant, {"1080p": url, …}); a stream
  // without variants is played as it is.
  function hlsVariants(master, done) {
    request(master, function (error, text) {
      if (error) return done(error);
      var lines = String(text).split(/\r?\n/), qualities = {}, best = 0, url = '';
      lines.forEach(function (line, i) {
        // Wide films (1920x960) count by their width; variant addresses may be relative (Tortuga).
        var m = /^#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+)/.exec(line), next = lines[i + 1];
        if (!m || !next || /^#/.test(next)) return;
        var height = Math.max(+m[2], Math.round(+m[1] * 9 / 16)), link = absolute(next, master);
        qualities[qualityName(height)] = link;
        if (height > best) { best = height; url = link; }
      });
      done(null, url || master, url ? qualities : null);
    });
  }
  function absolute(link, base) {
    if (/^https?:\/\//.test(link)) return link;
    if (/^\//.test(link)) return /^https?:\/\/[^\/]+/.exec(base)[0] + link;
    var parts = base.split('?')[0].split('/');
    parts.pop();
    link.split('/').forEach(function (p) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); });
    return parts.join('/');
  }

  // Tortuga (tortuga.tw, the player of serialno.tv and of Mikai's episodes) hides its playlist in an
  // obfuscated player script. Its own script reads it, on our helper page tortuga.html next to this plugin
  // (its own origin and storage) in a hidden sandboxed frame that can neither touch nor navigate Lampa;
  // the Playerjs it calls there hands the playlist back.
  var TORTUGA_PAGE = 'https://sitecards-ua.github.io/lampa-plugins/tortuga.html';
  var tortugaCache = {}, tortugaNext = 0;
  function tortugaFile(page, done) {
    var hit = tortugaCache[page];
    if (hit && Date.now() - hit.at < 600000) return done(null, hit.file);
    request(page, function (error, text) {
      var call = !error && /new TortugaCore\((\{[\s\S]*?\})\);\s*\};/.exec(text), core = !error && /loadScript\('(\/player\/js\/[^']+es5[^']*)'/.exec(text);
      var id = call && /\bid:\s*"([^"]+)"/.exec(call[1]);
      if (error || !call || !core || !id) return done(error || 'Tortuga: незнайома сторінка плеєра');
      var key = 'cs_tortuga_' + (++tortugaNext), frame = document.createElement('iframe'), finished = false;
      function finish(error, file) {
        if (finished) return;
        finished = true;
        window.removeEventListener('message', listen);
        clearTimeout(timer);
        if (frame.parentNode) frame.parentNode.removeChild(frame);
        if (file) tortugaCache[page] = {file: file, at: Date.now()};
        done(error, file);
      }
      function listen(e) { if (e.data && e.data.key === key) finish(e.data.file ? null : 'Tortuga не дав відео' + (e.data.error ? ': ' + e.data.error : ''), e.data.file); }
      var timer = setTimeout(function () { finish('Tortuga не відповідає'); }, 20000);
      window.addEventListener('message', listen);
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;width:320px;height:180px;border:0;visibility:hidden';
      frame.onload = function () { frame.contentWindow.postMessage({csTortuga: true, key: key, id: id[1], core: core[1], call: call[1]}, '*'); };
      frame.src = TORTUGA_PAGE;
      document.body.appendChild(frame);
    });
  }
  // The number in "5 серія", "Серія 05", "Episode 5" (a row may also name its season: "2 сезон 5 серія"); else
  // the first number, else the row's place. Episodes go in order of their numbers, each number once, so the
  // player's "next" is the next episode.
  function episodeNumber(title, n) {
    var t = title || '';
    var m = /(\d+)\s*-?\s*(?:а|я|тя)?\s*(?:серія|серiя|епізод|episode)/i.exec(t) || /(?:серія|серiя|епізод|episode|ep|e)\s*0*(\d+)/i.exec(t) || /(\d+)/.exec(t);
    return m ? +m[1] : n;
  }
  function inOrder(list) {
    var seen = {};
    return list.filter(function (e) { if (seen[e.number]) return false; seen[e.number] = true; return true; })
      .sort(function (a, b) { return a.number - b.number; });
  }
  // Tortuga's playlist: one address ("{Студія}url(subtitle:…)", a film or one episode) or seasons with
  // episodes, each with one or more voice-overs ("{A}url;{B}url"). Gives voice-overs like playerjsVoices.
  function tortugaVoices(file, name) {
    function streams(value) {
      var out = [];
      String(value || '').split(/[;,](?=\{)/).forEach(function (part) {
        var m = /^\{([^}]*)\}(.*)$/.exec(part.trim()), url = (m ? m[2] : part).replace(/\(subtitle:[^)]*\)\s*$/, '').trim();
        if (/^https?:\/\//.test(url)) out.push({voice: m && m[1] || name, url: url});
      });
      return out;
    }
    var list;
    if (!/^\s*\[/.test(file)) return streams(file).map(function (s) { return {title: s.voice, subs: /субтитр/i.test(s.voice), episodes: [{title: '1 серія', number: 1, file: s.url}]}; });
    try { list = JSON.parse(file); } catch (e) { return []; }
    var groups = {}, order = [];
    (list || []).forEach(function (s, i) {
      var season = +s.season || +(/(\d+)/.exec(s.title || '') || [0, i + 1])[1];
      (s.folder || [s]).forEach(function (e, k) {
        var number = +e.number || episodeNumber(e.title, k + 1);
        streams(e.file).forEach(function (st) {
          var key = season + '|' + st.voice;
          if (!groups[key]) { groups[key] = {title: st.voice, subs: /субтитр/i.test(st.voice), season: s.folder ? season : undefined, episodes: []}; order.push(key); }
          groups[key].episodes.push({title: number + ' серія', number: number, file: st.url});
        });
      });
    });
    return order.map(function (k) { groups[k].episodes = inOrder(groups[k].episodes); return groups[k]; }).sort(bySubs);
  }
  // A Playerjs playlist (the "file" of HDVB's and BambooUA's players): a film's address, voice-overs
  // with their file, voice-overs with episodes, or seasons → voice-overs → episodes. Gives voice-overs,
  // each with its season when the playlist has seasons (as UAFlix's are).
  function playerjsVoices(file, name) {
    function number(title, n) { return +(/(\d+)/.exec(title || '') || [0, n])[1]; }
    function episodes(list) {
      return inOrder((list || []).filter(function (e) { return e.file; }).map(function (e, i) { var k = episodeNumber(e.title, i + 1); return {title: k + ' серія', number: k, file: e.file}; }));
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
        (s.folder || []).forEach(function (v) { out.push(voice(v.title, episodes(v.folder), season)); });
      });
    } else if (list[0].folder && /сезон|season/i.test(list[0].title)) {
      // Seasons → episodes, one voice-over (Moviestape).
      list.forEach(function (s, i) { out.push(voice(name, episodes(s.folder), number(s.title, i + 1))); });
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
    voices: function (item, done) { hdvbVoices(item.id, 'Eneyida', done); },
    queries: function (n) { return [n.uk, n.en, n.original]; },
    stream: function (episode, done) { hlsVariants(episode.file, done); }
  };
  // A title page with an HDVB player (Eneyida, UASerials): the player's Playerjs playlist. Series have
  // /embed/, films /vid/; the page's trailer is HDVB too (/trailer/) and is not taken.
  function hdvbVoices(page, name, done) {
    request(page, function (error, text) {
      var embed = !error && /<iframe[^>]+?(?:data-)?src="(https:\/\/hdvbua\.pro\/(?:embed|vid)\/[^"]+)"/.exec(text);
      if (error || !embed) return done(error || 'на сторінці немає плеєра HDVB');
      request(embed[1].replace(/&amp;/g, '&'), function (error, player) {
        if (error) return done(error);
        var file = /\bfile:\s*'(\[[\s\S]*?\])'/.exec(player) || /\bfile:\s*"([^"]+)"/.exec(player);
        if (!file) return done('HDVB не дав відео');
        done(null, playerjsVoices(file[1], name));
      });
    });
  }
  // UASerials (uaserials.my, Ukrainian series and films): a DLE site with the HDVB player, like Eneyida.
  // Its search shows the Ukrainian and the original name, no year.
  var UASERIALS = {
    name: 'uaserials', title: 'UASerials', site: 'https://uaserials.my',
    search: function (query, done) {
      request(UASERIALS.site + '/index.php?do=search&subaction=search&search_start=0&full_search=0&story=' + encodeURIComponent(query), function (error, text) {
        if (error) return done(error);
        var out = [];
        [].forEach.call(html(text).querySelectorAll('.short-cols'), function (item) {
          var a = item.querySelector('a.short-img[href]'), t = item.querySelector('.th-title'), o = item.querySelector('.th-title-oname');
          if (!a || !t || !/^https:\/\/uaserials\.my\/\d+-[^\/]+\.html$/.test(a.getAttribute('href'))) return;
          out.push({title: (t.textContent || '').trim(), original: o ? (o.textContent || '').trim() : '', year: 0, season: 1, id: a.getAttribute('href')});
        });
        done(null, out);
      });
    },
    voices: function (item, done) { hdvbVoices(item.id, 'UASerials', done); },
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
  // Mikai (mikai.me, Ukrainian anime): its JSON API (any origin) lists each title's voice-over teams with
  // their players' episodes. Its MOON pages refuse to load here, so each episode's Tortuga page is taken.
  var MIKAI = {
    name: 'mikai', title: 'Mikai', api: 'https://api.mikai.me/v1',
    search: function (query, done) {
      getJson(MIKAI.api + '/anime/search?name=' + encodeURIComponent(query), function (error, data) {
        if (error) return done(error);
        done(null, ((data && data.result) || []).map(function (a) {
          var n = (a.details && a.details.names) || {}, en = n.nameEnglish || '', native = n.nameNative || '';
          // "Фрірен 2" is "… 2nd Season" / "… Season 2" in its other names.
          var s = /season (\d+)/i.exec(en) || /(\d+)(?:st|nd|rd|th) season/i.exec(native) || /season (\d+)/i.exec(native);
          return {title: n.name || en || native, original: native, alt: [en], year: a.year || 0, season: s ? +s[1] : seasonOf(n.name), id: a.id};
        }));
      });
    },
    voices: function (item, done) {
      getJson(MIKAI.api + '/anime/' + item.id, function (error, data) {
        if (error) return done(error);
        var list = [], seen = {};
        (((data && data.result) || {}).players || []).forEach(function (p) {
          var tortuga = (p.providers || []).filter(function (v) { return /^tortuga/i.test(v.name); })[0];
          var team = ((p.team && p.team.name) || 'Mikai') + (p.isSubs ? ' (субтитри)' : '');
          if (!tortuga || !tortuga.episodes || !tortuga.episodes.length || seen[team]) return;
          seen[team] = true;
          list.push({title: team, subs: !!p.isSubs, episodes: tortuga.episodes.map(function (e) {
            return {title: e.number + ' серія', number: e.number, page: e.playLink};
          }).sort(function (a, b) { return a.number - b.number; })});
        });
        done(null, list.sort(bySubs));
      });
    },
    queries: function (n) { return [n.uk, n.en, n.romaji]; },
    stream: function (episode, done) {
      tortugaFile(episode.page, function (error, file) {
        var v = !error && tortugaVoices(file, 'Mikai')[0];
        if (!v) return done(error || 'Tortuga не дав відео');
        hlsVariants(v.episodes[0].file, done);
      });
    }
  };

  // serialno.tv (Ukrainian series): a DLE site; the series page embeds Tortuga with the whole playlist
  // (seasons → episodes → voice-overs).
  var SERIALNO = {
    name: 'serialno', title: 'Serialno', site: 'https://serialno.tv',
    search: function (query, done) {
      request(SERIALNO.site + '/index.php?do=search', function (error, text) {
        if (error) return done(error);
        var out = [];
        [].forEach.call(html(text).querySelectorAll('.th-item'), function (item) {
          var a = item.querySelector('a.th-in[href]'), t = item.querySelector('.th-title'), y = item.querySelector('a[href*="/xfsearch/year/"]');
          if (!a || !t || !/^https:\/\/serialno\.tv\/\d+-[^\/]+\.html$/.test(a.getAttribute('href'))) return;
          out.push({title: (t.textContent || '').trim(), year: y ? +y.textContent : 0, season: 1, id: a.getAttribute('href')});
        });
        done(null, out);
      }, 'do=search&subaction=search&story=' + encodeURIComponent(query));
    },
    voices: function (item, done) {
      request(item.id, function (error, page) {
        var player = !error && (/src="(https:\/\/tortuga\.tw\/embed\/\d+)"/.exec(page) || /src="(https:\/\/tortuga\.tw\/vod\/\d+)"/.exec(page));
        if (error || !player) return done(error || 'на сторінці немає плеєра Tortuga');
        tortugaFile(player[1], function (error, file) {
          if (error) return done(error);
          done(null, tortugaVoices(file, 'Serialno'));
        });
      });
    },
    queries: function (n) { return [n.uk]; },
    stream: function (episode, done) { hlsVariants(episode.file, done); }
  };
  // Moviestape (moviestape.lat, Ukrainian films and series): a DLE site whose search shows only the
  // Ukrainian name, so each result's page is read for its year ("Дюна (2021)"). Its player (creavio/sniplyo)
  // plays MP4 files: a film's page names its file, a series' a JSON playlist of seasons → episodes.
  var MOVIESTAPE = {
    name: 'moviestape', title: 'Moviestape', site: 'https://moviestape.lat', pages: {},
    search: function (query, done) {
      request(MOVIESTAPE.site + '/index.php?do=search', function (error, text) {
        if (error) return done(error);
        var found = [];
        [].forEach.call(html(text).querySelectorAll('.search_top h3 a[href]'), function (a) {
          // Not persons, trailers or titles taken down ("abuse").
          if (found.length < 6 && /^https:\/\/moviestape\.lat\/(katalog_filmiv|katalog_serialiv|multfilmy|multserialy|anime|dokumentalni)[a-z_]*\/[^"]*\d+-[^\/]+\.html$/.test(a.getAttribute('href'))) {
            found.push({title: (a.textContent || '').trim(), year: 0, season: 1, id: a.getAttribute('href')});
          }
        });
        var left = found.length;
        if (!left) return done(null, []);
        found.forEach(function (t) {
          request(t.id, function (error, page) {
            if (!error) {
              MOVIESTAPE.pages[t.id] = page;
              t.year = +((/<h1[^>]*>[^<(]*\((\d{4})/.exec(page) || [0, 0])[1]);
            }
            if (!--left) done(null, found);
          });
        });
      }, 'do=search&subaction=search&story=' + encodeURIComponent(query));
    },
    voices: function (item, done) {
      function read(error, page) {
        var player = !error && /<iframe[^>]+src="(https:\/\/(?:creavio|sniplyo)\.online\/stream\.php\?[^"]+)"/.exec(page);
        if (error || !player) return done(error || 'на сторінці немає плеєра');
        var url = player[1].replace(/&amp;/g, '&'), pl = /[?&]pl=([^&]+)/.exec(url);
        if (pl) {
          return request(url.replace(/stream\.php\?.*$/, 'pl_new.php?pl=' + pl[1]), function (error, text) {
            if (error) return done(error);
            done(null, playerjsVoices(text, 'Moviestape'));
          });
        }
        request(url, function (error, text) {
          var file = !error && /\bfile:\s*"(https:\/\/[^"]+\.mp4)"/.exec(text);
          if (!file) return done(error || 'плеєр не дав відео');
          done(null, playerjsVoices(file[1], 'Moviestape'));
        });
      }
      if (MOVIESTAPE.pages[item.id]) return read(null, MOVIESTAPE.pages[item.id]);
      request(item.id, read);
    },
    queries: function (n) { return [n.uk]; },
    // MP4: no qualities to offer.
    stream: function (episode, done) { done(episode.file ? null : 'немає відео', episode.file, null); }
  };
  // UFDub (ufdub.com, a Ukrainian dubbing studio: Asian animation, anime, dorama): a DLE site; the title page's
  // player (video.ufdub.com) lists its episodes as [name, 'mp4', address] per tab, each address leading to an
  // MP4. A tab other than the main one ("Основа") is shown as its own voice-over.
  var UFDUB = {
    name: 'ufdub', title: 'UFDub', site: 'https://ufdub.com',
    search: function (query, done) {
      request(UFDUB.site + '/index.php?do=search', function (error, text) {
        if (error) return done(error);
        var out = [];
        [].forEach.call(html(text).querySelectorAll('.short'), function (item) {
          var a = item.querySelector('a.short-t[href]');
          if (!a || !/^https:\/\/ufdub\.com\//.test(a.getAttribute('href'))) return;
          // "Українська / Original", or the Ukrainian name as text and the original in a child element.
          var own = '', inner = [];
          [].forEach.call(a.childNodes, function (c) { if (c.nodeType === 3) own += c.textContent; else inner.push(c.textContent); });
          var names = own.split(' / ').concat(inner).map(function (s) { return s.trim(); }).filter(Boolean);
          var year = /\b(19\d\d|20\d\d)\b/.exec(item.textContent || '');
          out.push({title: names[0] || '', original: names[1] || '', alt: names.slice(2), year: year ? +year[1] : 0, season: seasonMark(names), id: a.getAttribute('href')});
        });
        // A result without a season mark may still be a later season under a short name ("Агенти Часу" is
        // season 3): its page's player names it in full ("Name=Агенти Часу 3/Shiguang Dailiren III").
        var unsure = out.filter(function (t) { return t.season === 1; }).slice(0, 8), left = unsure.length;
        if (!left) return done(null, out);
        unsure.forEach(function (t) {
          request(t.id, function (error, page) {
            var name = !error && /video\.ufdub\.com\/(?:V2|AT)\/VP\.php\?ID=\d+&(?:amp;)?Name=([^"&]+)/.exec(page);
            if (!error) UFDUB.pages[t.id] = page;
            if (name) {
              var full = name[1].split('/').map(function (s) { return s.trim(); }).filter(Boolean);
              t.alt = (t.alt || []).concat(full);
              if (!t.original) t.original = full[1] || '';
              t.season = seasonMark(full);
              if (t.season > 1 && full[0]) t.title = full[0];
            }
            if (!--left) done(null, out);
          });
        });
      }, 'do=search&subaction=search&story=' + encodeURIComponent(query));
    },
    pages: {},
    voices: function (item, done) {
      if (UFDUB.pages[item.id]) return UFDUB.player(UFDUB.pages[item.id], done);
      request(item.id, function (error, page) {
        if (error) return done(error);
        UFDUB.player(page, done);
      });
    },
    player: function (page, done) {
      var player = /<iframe[^>]+src="(https:\/\/video\.ufdub\.com\/(?:V2|AT)\/VP\.php\?ID=\d+)/.exec(page);
      if (!player) return done('на сторінці немає плеєра');
      request(player[1], function (error, text) {
        var list = !error && /\ba\s*=\s*\[([\s\S]*?)\];/.exec(text);
        if (!list) return done(error || 'плеєр не дав відео');
        var groups = {}, order = [], row = /\[\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/g, m;
        while ((m = row.exec(list[1]))) {
          if (!/^https?:\/\//.test(m[3])) continue;
          var tab = (/[?&]TAB=([^&]*)/.exec(m[3]) || [0, ''])[1], title = !tab || tab === 'Основа' ? 'UFDub' : tab;
          if (/трейлер/i.test(tab + m[1])) continue;
          if (!groups[title]) { groups[title] = {title: title, subs: /субтитр/i.test(title), episodes: []}; order.push(title); }
          var n = episodeNumber(m[1], groups[title].episodes.length + 1);
          groups[title].episodes.push({title: n + ' серія', number: n, file: encodeURI(m[3])});
        }
        done(null, order.map(function (t) { groups[t].episodes = inOrder(groups[t].episodes); return groups[t]; }).sort(bySubs));
      });
    },
    queries: function (n) { return [n.uk, n.en, n.romaji]; },
    // MP4 (the address redirects to the file): no qualities to offer.
    stream: function (episode, done) { done(null, episode.file, null); }
  };
  // Makhno: the catalogue of ASHDI as the server of the Free Bandera plugin lists it (any origin may read it).
  // A title is found by the card's TMDB number, so there is nothing to find for the viewer's own text search.
  // A series gives voice-overs → seasons → episodes, a film its streams; all are plain HLS on ashdi.vip.
  var MAKHNO = {
    name: 'makhno', title: 'Makhno', api: 'https://bbe.lme.isroot.in/api/v2',
    search: function (query, done) {
      var tmdb = /^tmdb:(tv|movie):(\d+)$/.exec(query);
      if (!tmdb) return done(null, []);
      getJson(MAKHNO.api + '/search?source=makhno&sources=makhno&tmdb_id=' + tmdb[2] + '&serial=' + (tmdb[1] === 'tv' ? 1 : 0), function (error, data) {
        if (error) return done(error);
        done(null, ((data && data.items) || []).map(function (a) {
          // Its own "title" is only the number asked for.
          return {title: 'Makhno', year: 0, season: 1, id: JSON.stringify(a.ref), ref: a.ref, tmdb: true};
        }));
      });
    },
    voices: function (item, done) {
      var x = new XMLHttpRequest();
      x.open('POST', MAKHNO.api + '/content');
      x.setRequestHeader('Content-Type', 'application/json');
      x.timeout = 20000;
      x.onload = function () {
        var data;
        try { data = JSON.parse(x.responseText); } catch (e) { return done('незрозуміла відповідь сервера'); }
        var list = [];
        (data.voices || []).forEach(function (v) {
          var title = v.display_name || v.name || 'Makhno', subs = /субтитр|\bsub\b/i.test(title);
          (v.seasons || []).forEach(function (s, i) {
            var episodes = inOrder((s.episodes || []).filter(function (e) { return e.file; }).map(function (e, k) {
              var n = +e.number || k + 1;
              return {title: n + ' серія', number: n, file: e.file};
            }));
            if (episodes.length) list.push({title: title, subs: subs, season: +s.title || i + 1, episodes: episodes});
          });
        });
        (data.streams || []).forEach(function (s) {
          if (!s.url) return;
          // "[FHD] багатоголосий закадровий | DniproFilm"; "не визначено" says nothing.
          var title = String(s.title || '').replace(/^\[[^\]]*\]\s*/, '').trim();
          list.push({title: !title || /не визначено/i.test(title) ? 'Makhno' : title, subs: false, episodes: [{title: '1 серія', number: 1, file: s.url}]});
        });
        done(null, list.sort(bySubs));
      };
      x.onerror = function () { done('мережа недоступна'); };
      x.ontimeout = function () { done('сервер не відповідає'); };
      x.send(JSON.stringify({source: 'makhno', ref: item.ref, full: true}));
    },
    queries: function (n) { return [n.tmdb ? 'tmdb:' + n.tmdb : '']; },
    // ASHDI's certificate fails for this page's own requests on the TV, not for its player: the address goes
    // to the player unread (no hls.js, no list of qualities).
    native: true,
    stream: function (episode, done) { done(null, episode.file, null); }
  };
  var SOURCES = [ANITUBE, ANIMEON, MIKAI, ANIMELIB, YUMMY, YANI, UAFLIX, ENEYIDA, UASERIALS, MAKHNO, MOVIESTAPE, SERIALNO, BAMBOO, UNIMAY, UFDUB];

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
    // Found by the card's own TMDB number.
    if (result.tmdb) return true;
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
    var n = {uk: movie.title || movie.name, original: movie.original_title || movie.original_name, en: '', ru: '', romaji: '', all: [],
      tmdb: movie.id && (!movie.source || movie.source === 'tmdb') ? (movie.name ? 'tv:' : 'movie:') + movie.id : ''};
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
    setTimeout(function () { Lampa.Activity.push({url: '', title: 'Кіно UA', component: 'cs_anitube', movie: movie, page: 1}); }, 1500);
  }

  function component(object) {
    var _this = this;
    var scroll = new Lampa.Scroll({mask: true, over: true});
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    // The list's height is the screen less the filter row (as online_mod does): without it the list grows
    // past the screen and does not scroll to the focused episode.
    scroll.minus(files.render().find('.explorer__files-head'));
    var movie = object.movie || {};
    var name = movie.title || movie.name || '';
    var source = ANITUBE, titles = [], voices = [], titleIndex = 0, voiceIndex = 0, last = null, tmdb = {};
    var saved = (Lampa.Storage.get(CHOICE_KEY, '{}') || {})[movie.id] || {};
    var avail = {}, destroyed = false;

    function remember() {
      var all = Lampa.Storage.get(CHOICE_KEY, '{}') || {};
      saved = all[movie.id] = {source: source.name, title: titles[titleIndex] && String(titles[titleIndex].id), voice: voices[voiceIndex] && voices[voiceIndex].title,
        season: voices[voiceIndex] && voices[voiceIndex].season};
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
          // Another season keeps the voice-over when that season has it.
          if (a.stype === 'season') {
            var keep = voices[voiceIndex] && voices[voiceIndex].title, pick = -1;
            voices.forEach(function (v, i) { if (v.season === b.season && (pick < 0 || v.title === keep && voices[pick].title !== keep)) pick = i; });
            if (pick >= 0) { voiceIndex = pick; remember(); _this.draw(); }
          }
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
    // Every site is checked in turn, in the background too once one is shown: whether the title is there,
    // how many voice-overs and the best quality of the first one. "Джерело" lists it under each site.
    this.begin = function () {
      var chosen = SOURCES.filter(function (s) { return s.name === saved.source; })[0];
      var order = chosen ? [chosen].concat(SOURCES.filter(function (s) { return s !== chosen; })) : SOURCES;
      // Up to four sites at a time. The site shown is still the first in this order that has the title: it
      // waits for those before it. found[i]: undefined — not answered yet, null — no title, else its titles.
      var shown = false, found = [], next = 0, left = order.length, WORKERS = 4;
      function show() {
        if (shown || destroyed) return;
        for (var k = 0; k < order.length; k++) {
          if (found[k] === undefined) return;
          if (found[k]) { shown = true; source = order[k]; _this.useTitles(found[k]); return; }
        }
      }
      function finished() {
        if (--left || destroyed) return;
        log('availability ' + SOURCES.map(function (s) { return s.name + ':' + availText(s); }).join(', '));
        if (shown) return;
        source = order[0];
        _this.buildFilter();
        _this.empty('Немає «' + name + '» ні на ' + SOURCES.map(function (s) { return s.title; }).join(', ') +
          '. Якщо на сайті воно під іншою назвою — «Пошук» (лупа вгорі).');
      }
      function worker() {
        if (destroyed || next >= order.length) return;
        var i = next++, src = order[i];
        function settled(state) {
          avail[src.name] = state;
          if (!destroyed) { _this.buildFilter(); refreshMenu(src); }
          finished();
          worker();
        }
        avail[src.name] = {state: 'wait'};
        _this.collect(src, null, function (all, sure, failed) {
          found[i] = sure.length ? sure : null;
          show();
          if (!sure.length) return settled({state: failed ? 'error' : 'no', error: failed});
          probe(src, sure, settled);
        });
      }
      for (var w = 0; w < WORKERS; w++) worker();
    };
    // The open "Джерело" menu is drawn once: the row of a site just checked gets its result in place.
    function refreshMenu(src) {
      if (!$('body').hasClass('selectbox--open')) return;
      $('.selectbox-item').each(function () {
        var row = $(this), title = row.find('.selectbox-item__title');
        if ($.trim(title.text()) !== src.title) return;
        if (!row.find('.selectbox-item__subtitle').length) return;
        row.find('.selectbox-item__subtitle').text(availText(src));
        if (!src.russian && avail[src.name].state === 'yes' && !title.find('span').length) title.append(UA_FLAG);
      });
    }
    function distinct(list) { var seen = {}, n = 0; list.forEach(function (v) { if (!seen[v.title]) { seen[v.title] = true; n++; } }); return n; }
    // The first title (season order, as useTitles), its voice-overs and the first one's best quality.
    function probe(src, sure, done) {
      var first = sure.slice().sort(function (a, b) { return a.season - b.season || (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || a.order - b.order; })[0];
      src.voices(first, function (error, list) {
        if (error || !list || !list.length) return done({state: error ? 'error' : 'none', error: error});
        // The seasons the site has: those its voice-overs carry (all seasons under one title) or those of
        // its titles (a title per season).
        var seasons = [];
        list.forEach(function (v) { if (v.season && seasons.indexOf(v.season) < 0) seasons.push(v.season); });
        if (!seasons.length) sure.forEach(function (t) { if (seasons.indexOf(t.season || 1) < 0) seasons.push(t.season || 1); });
        function yes(quality) { return {state: 'yes', voices: distinct(list), quality: quality, seasons: movie.name ? seasons : []}; }
        // A voice-over whose episode will not play here (UAFlix's ASHDI-only season) says nothing of the
        // quality: up to three are tried.
        (function voice(k) {
          if (k >= Math.min(list.length, 3)) return done(yes(''));
          function episodes(ready) { if (list[k].episodes) return ready(null, list[k].episodes); list[k].load(ready); }
          episodes(function (error, eps) {
            if (error || !eps || !eps.length) return voice(k + 1);
            qualityOf(src, eps[0], function (label) {
              if (!label) return voice(k + 1);
              done(yes(label));
            });
          });
        }(0));
      });
    }
    // "сезон 1", "сезони 1–5", "сезони 1–3, 5".
    function seasonsText(list) {
      var s = list.slice().sort(function (a, b) { return a - b; }), parts = [];
      for (var i = 0; i < s.length; i++) {
        var j = i;
        while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
        parts.push(j > i ? s[i] + '–' + s[j] : String(s[i]));
        i = j;
      }
      return (s.length === 1 ? 'сезон ' : 'сезони ') + parts.join(', ');
    }
    function availText(s) {
      var a = avail[s.name];
      if (!a || a.state === 'wait') return '… перевіряю';
      if (a.state === 'no') return '— немає';
      if (a.state === 'none') return '— є, але без плеєра для ТВ';
      if (a.state === 'error') return '⚠ ' + (a.error || 'помилка');
      return '✓ ' + [a.quality || 'якість невідома', a.seasons && a.seasons.length ? seasonsText(a.seasons) : '',
        a.voices + (a.voices === 1 ? ' озвучка' : a.voices < 5 ? ' озвучки' : ' озвучок')].filter(Boolean).join(' · ');
    }

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
        var found = false;
        voices.forEach(function (v, n) {
          if (found || v.title !== saved.voice) return;
          voiceIndex = n;
          found = !saved.season || v.season === saved.season;
        });
        _this.buildFilter();
        if (error) return _this.empty(source.title + ': ' + error);
        if (!voices.length) return _this.empty('Тут немає плеєра MOON, а інші плеєри на цьому ТВ не працюють');
        remember();
        _this.draw();
      });
    };

    this.buildFilter = function () {
      // Sites that have the title first, then those still being checked, then the rest; otherwise in
      // SOURCES order.
      var rank = {yes: 0, wait: 1, none: 2, error: 3, no: 4};
      function rankOf(s) { var a = avail[s.name]; return a ? rank[a.state] : 1; }
      var listed = SOURCES.map(function (s, i) { return {s: s, i: i}; }).sort(function (a, b) { return rankOf(a.s) - rankOf(b.s) || a.i - b.i; });
      // A Ukrainian flag by the sites that have the title in Ukrainian (all but the Russian ones). Lampa puts
      // the title into its template as HTML; a drawn box, since colour emoji are not to be relied on here.
      filter.set('sort', listed.map(function (x) {
        var flag = !x.s.russian && rankOf(x.s) === 0 ? UA_FLAG : '';
        return {title: x.s.title + flag, subtitle: availText(x.s), source: x.s.name, selected: x.s === source};
      }));
      var mine = avail[source.name];
      filter.chosen('sort', [source.title + (mine && mine.quality ? ' · ' + mine.quality : '')]);
      function group(title, stype, list, current) {
        return {title: title, subtitle: list[current] ? list[current].title : '', stype: stype,
          items: list.map(function (x, i) { return {title: x.title, selected: i === current, index: i}; })};
      }
      var select = [], seasons = voiceSeasons(), now = voices[voiceIndex];
      if (titles.length) select.push(group('Тайтл на ' + source.title, 'title', titles, titleIndex));
      // A site with all seasons under one title (UAFlix, Eneyida): the season first, then the voice-overs
      // of that season.
      if (seasons.length) {
        select.push({title: 'Сезон', subtitle: now ? 'Сезон ' + now.season : '', stype: 'season',
          items: seasons.map(function (s) { return {title: 'Сезон ' + s, selected: now && now.season === s, season: s}; })});
      }
      if (voices.length) {
        var mine = [];
        voices.forEach(function (v, i) { if (!seasons.length || !now || v.season === now.season) mine.push({title: v.title, selected: i === voiceIndex, index: i}); });
        select.push({title: 'Озвучка', subtitle: now ? now.title : '', stype: 'voice', items: mine});
      }
      filter.set('filter', select);
      var chosen = [];
      if (now && seasons.length) chosen.push('Сезон ' + now.season);
      if (now) chosen.push('Озвучка: ' + now.title);
      if (titles.length > 1) chosen.push(titles[titleIndex].title);
      filter.chosen('filter', chosen);
    };

    // TMDB season of the chosen title, for episode stills and names like online plugins.
    // UAFlix and Eneyida keep all seasons under one title: the voice-over carries its season.
    // The seasons the voice-overs carry (UAFlix, Eneyida), in order; none for sites with a title per season.
    function voiceSeasons() {
      var out = [];
      voices.forEach(function (v) { if (v.season && out.indexOf(v.season) < 0) out.push(v.season); });
      return out.sort(function (a, b) { return a - b; });
    }
    function label(voice) { return (voice.season && voiceSeasons().length ? 'Сезон ' + voice.season + ' · ' : '') + voice.title; }
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
            info: label(voice), time: [e.runtime ? e.runtime + ' хв' : '', date].filter(Boolean).join(' · '), quality: voice.quality || ''
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
        src.stream(episode, function (error, url, qualities, native) {
          if (error || !url) log('no stream: ' + (error || 'no url'));
          call(url || '', error, qualities, native);
        });
      }
      var playlist = voice.episodes.map(function (episode) {
        var cell = {title: [name, episode.title === name ? '' : episode.title, label(voice)].filter(Boolean).join(' · ')};
        if (!src.native) cell.hls_type = 'hlsjs';
        // Lampa keeps the watch progress under the same key online plugins use, and the rows show it.
        try { cell.timeline = Lampa.Timeline.view(hash(episode.number)); } catch (error) {}
        // An ASHDI episode (UAFlix) goes to the TV's own player: hls.js could not read it.
        cell.url = function (call) { stream(episode, function (url, error, qualities, native) { cell.url = url; if (qualities) cell.quality = qualities; if (native) delete cell.hls_type; call(); }); };
        return cell;
      });
      stream(voice.episodes[index], function (url, error, qualities, native) {
        if (!url) return Lampa.Noty.show('Не вдалося отримати відео цієї серії' + (error ? ': ' + error : ''));
        playlist[index].url = url;
        if (native) delete playlist[index].hls_type;
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
    this.destroy = function () { destroyed = true; files.destroy(); scroll.destroy(); };
  }

  var BUTTON = '<div class="full-start__button selector view--cs-anitube">' +
    // A film strip in our colours with a play mark; fixed colours, so it reads the same with and without focus.
    '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="1" y="3" width="22" height="18" rx="3" style="fill:#ffd700"/>' +
    '<rect x="6" y="3" width="12" height="18" style="fill:#0057b7"/>' +
    '<path d="M2.5 5.5h2v2.5h-2zM2.5 10.75h2v2.5h-2zM2.5 16h2v2.5h-2zM19.5 5.5h2v2.5h-2zM19.5 10.75h2v2.5h-2zM19.5 16h2v2.5h-2z" style="fill:#0d2d52"/>' +
    '<path d="M9.5 8l6 4-6 4z" style="fill:#fff"/></svg><span>Кіно UA</span></div>';
  function addButton(e) {
    if (e.type !== 'complite') return;
    try {
      var render = e.object.activity.render(), movie = e.data.movie;
      if (render.find('.view--cs-anitube').length) return;
      var button = $(BUTTON);
      button.on('hover:enter', function () {
        Lampa.Activity.push({url: '', title: 'Кіно UA', component: 'cs_anitube', movie: movie, page: 1});
      });
      // First in the row. Other plugins add their buttons later, and one rebuilds the row from copies: so
      // whichever copy is on the page now is moved, and nothing is inserted a second time.
      var row = render.find('.full-start-new__buttons, .full-start__buttons').first(), first = row.children('.selector').first();
      if (first.length) first.before(button); else row.append(button);
      function toFront() {
        var now = render.find('.view--cs-anitube').first();
        if (now.length && now.prev().length) now.parent().prepend(now);
        // It looks focused, but Lampa may still hold the element the copy replaced: OK would do nothing.
        if (now.hasClass('focus')) { try { Navigator.focus(now[0]); } catch (error) { log('focus ' + error); } }
      }
      [300, 1000, 2500].forEach(function (ms) { setTimeout(toFront, ms); });
    } catch (error) { log('button ' + error); }
  }
  // For checks from the PC in our own browser (the same engine and network rules as Lampa).
  window.claudespaceAnitubeApi = {sources: SOURCES, matches: matches, cardNames: cardNames, tortugaFile: tortugaFile, tortugaVoices: tortugaVoices, hlsVariants: hlsVariants};
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
