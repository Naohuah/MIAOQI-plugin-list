// 禁漫天堂（JmComic）自助插件 —— 作者：Naohuah
// 运行在 MiaoQI 宿主 QuickJS 里；只用宿主提供的 fetch / globalThis.__miaoqi_aes。
// 目标：getChapter 返回正确图片（供阅读器"接缝去重"拼成一条完整长图）。
(function () {
  var UUID = 'bf99008d-010b-4f17-ac7c-61a9b57dc3d9'; // 与 src.app/api 对齐的插件 id
  var VERSION = '2.0.20';
  var SECRET = '185Hcomic3PAPP7R';
  var API_BASE = 'https://www.cdnhjk.net'; // 兜底 API
  var IMG_BASE = 'https://cdn-msp3.jmdanjonproxy.vip';
  var UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';

  function aes() { return globalThis.__miaoqi_aes || {}; }
  function md5Hex(s) {
    var f = aes().md5Hex;
    if (f) try { return f(s); } catch (e) { return ''; }
    return '';
  }
  function nowSec() { return String(Math.floor(Date.now() / 1000)); }

  function hostOf(url) { try { return new URL(url).host; } catch (e) { return ''; } }

  // 请求头：token = md5(ts+VERSION)，tokenparam = "ts,VERSION"，Host，UA
  function headersFor(url, ts) {
    var h = {
      token: md5Hex(ts + VERSION),
      tokenparam: ts + ',' + VERSION,
      'user-agent': UA,
    };
    var host = hostOf(url);
    if (host) h.Host = host;
    return h;
  }

  // 响应 data 字段用 md5(ts+seed) 做 AES-ECB 解密
  async function decryptData(payload, ts) {
    if (typeof payload !== 'string' || !payload) return payload;
    var compact = payload.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!compact || !/^[A-Za-z0-9+/]*$/.test(compact.replace(/=+$/g, ''))) {
      return payload;
    }
    var seeds = ['185Hcomic3PAPP7R', '18comicAPPContent'];
    for (var i = 0; i < seeds.length; i++) {
      try {
        var key = md5Hex(ts + seeds[i]);
        var dec = aes().ecbDecryptB64(compact, key);
        if (dec) { try { return JSON.parse(dec); } catch (e) { return dec; } }
      } catch (e) {}
    }
    return payload;
  }

  async function decodeResp(bytes, ts) {
    // bytes: Uint8Array；先 utf8，尝试 JSON，再尝试 data 字段解密
    var text = '';
    try { text = new TextDecoder('utf-8').decode(bytes); } catch (e) {}
    try {
      var obj = JSON.parse(text);
      if (obj && typeof obj === 'object' && obj.data && typeof obj.data === 'string') {
        var dec = await decryptData(obj.data, ts);
        if (typeof dec === 'object') {
          // 把解密结果并回
          var merged = Object.assign({}, obj);
          delete merged.data;
          return Object.assign({}, typeof dec === 'object' ? dec : {}, merged);
        }
      }
      return obj;
    } catch (e) {
      return await decryptData(text, ts);
    }
  }

  async function request(path, opts) {
    opts = opts || {};
    var ts = nowSec();
    var url = path.indexOf('http') === 0 ? path : API_BASE + path;
    var qs = [];
    var params = opts.params || {};
    for (var k in params) if (params[k] != null && params[k] !== '') qs.push(k + '=' + encodeURIComponent(params[k]));
    if (qs.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
    var headers = headersFor(url, ts);
    var body = opts.form ? Object.keys(opts.form).map(function (k) { return k + '=' + encodeURIComponent(opts.form[k]); }).join('&') : null;
    if (body) headers['content-type'] = 'application/x-www-form-urlencoded';

    var resp = await fetch(url, { method: opts.method || 'GET', headers: headers, body: body || undefined });
    var bytes = new Uint8Array(await resp.arrayBuffer());
    var decoded = await decodeResp(bytes, ts);
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error('服务器响应异常 (' + resp.status + '): ' + JSON.stringify(decoded));
    }
    return decoded;
  }

  // ---- getInfo ----
  async function getInfo() {
    return {
      name: '禁漫天堂',
      uuid: UUID,
      version: '0.0.1',
      describe: '禁漫漫画源（作者 Naohuah）。支持搜索/详情/章节/长图拼接。',
      iconUrl: '',
    };
  }

  // ---- searchComic ----
  async function searchComic(payload) {
    payload = payload || {};
    var keyword = String(payload.keyword || '').trim();
    var page = Math.max(1, Number(payload.page) || 1);
    if (!keyword) return { items: [], paging: { hasReachedMax: true } };
    var raw = await request('/search', { params: { q: keyword, page: page, main_tag: 0 } });
    // 响应结构：{search_query,total,content:[...]}
    var list = (raw.content || raw.list || raw.search || (raw.data && (raw.data.content || raw.data.list)) || []);
    if (Array.isArray(raw)) list = raw;
    var items = (list || []).map(function (c) {
      var id = String(c.id || '');
      return {
        source: UUID,
        id: id,
        title: String(c.name || ''),
        subtitle: '',
        finished: false,
        likesCount: Number(c.likes) || 0,
        viewsCount: Number(c.total_views || c.totalViews) || 0,
        updatedAt: String(c.update_at || ''),
        cover: { id: id, url: coverUrl(c), path: id + '.jpg', extern: {} },
      };
    });
    var total = Number(raw.total || items.length) || 0;
    return {
      items: items,
      paging: {
        page: page,
        pages: page,
        total: total,
        hasReachedMax: items.length === 0 || items.length < 80 || (total > 0 && (page - 1) * 80 + items.length >= total),
      },
    };
  }

  function coverUrl(c) {
    var img = String(c.image || '');
    if (img.indexOf('http') === 0) return img;
    if (img.indexOf('/') === 0) return IMG_BASE + img;
    if (img.indexOf('media/') === 0) return IMG_BASE + '/' + img;
    var id = String(c.id || '');
    return IMG_BASE + '/media/albums/' + id + '_3x4.jpg';
  }

  // ---- getComicDetail ----
  async function getComicDetail(payload) {
    payload = payload || {};
    var comicId = String(payload.comicId || '').trim();
    if (!comicId) throw new Error('comicId 不能为空');
    var raw = await request('/album', { params: { id: comicId } });
    // series 里 sort=0 是"根条目(id=comicId)"，不是真章节，必须过滤掉。
    var series = (raw.series || []).filter(function (s) {
      return String(s.sort) !== '0' && s.id !== comicId;
    });
    series.sort(function (a, b) { return Number(a.sort) - Number(b.sort); });
    var eps = series.map(function (s, i) {
      return {
        id: String(s.id),
        requestId: String(s.id),
        logicalKey: String(s.id),
        storageChapterId: String(s.id),
        name: '第' + (i + 1) + '话 ' + String(s.name || ''),
        order: i + 1,
        extern: { sort: Number(s.sort) || 0 },
      };
    });
    if (!eps.length) {
      eps = [{ id: comicId, requestId: comicId, logicalKey: comicId, storageChapterId: comicId, name: '第1话', order: 1, extern: { sort: 1 } }];
    }
    return {
      data: {
        normal: {
          comicInfo: {
            id: comicId,
            title: String(raw.name || ''),
            description: String(raw.description || ''),
            cover: { id: comicId, url: coverUrl(raw), path: comicId + '.jpg', extern: {} },
            metadata: [],
          },
          eps: eps,
        },
        raw: { comicInfo: raw },
      },
    };
  }

  // ---- getChapter（重点：返回正确图片列表）----
  async function getChapter(payload) {
    payload = payload || {};
    var comicId = String(payload.comicId || '').trim();
    var chapterId = String(payload.chapterId || comicId).trim();
    var raw = await request('/chapter', { params: { skip: '', id: chapterId } });
    var imgs = raw.images || raw.image || (raw.data && raw.data.images) || [];
    if (!Array.isArray(imgs)) imgs = [];
    // 图片路径用**专辑 id（comicId）**，不是章节 id：media/photos/<comicId>/<image>
    var base = String(raw.img_base || '').trim() || IMG_BASE;
    var pages = imgs.map(function (img) {
      var name = typeof img === 'string' ? img : String((img && img.name) || '');
      var url = (typeof img === 'object' && img.url)
        ? String(img.url)
        : (base + '/media/photos/' + comicId + '/' + name);
      if (url.indexOf('/media/') === 0) url = IMG_BASE + url;
      return { id: name, name: name, path: name, url: url };
    });
    return {
      data: {
        chapter: {
          id: chapterId,
          name: String(raw.name || ('第' + chapterId + '话')),
          requestId: chapterId,
          logicalKey: chapterId,
          storageChapterId: chapterId,
          order: 0,
          pages: pages,
        },
        chapters: [],
        comic: { id: comicId, title: '' },
      },
    };
  }

  // ---- fetchImageBytes ----
  async function fetchImageBytes(payload) {
    var url = String((payload && payload.url) || '').trim();
    if (!url) throw new Error('url 不能为空');
    var resp = await fetch(url, { headers: { Host: hostOf(url) } });
    if (resp.status < 200 || resp.status >= 300) throw new Error('图片加载失败 (' + resp.status + ')');
    var bytes = new Uint8Array(await resp.arrayBuffer());
    return bytes; // 宿主 call 包装会把 Uint8Array 转成 {__miaoqi_bytes} 再解回
  }

  // ---- 导出 ----
  var plugin = { getInfo: getInfo, searchComic: searchComic, getComicDetail: getComicDetail, getChapter: getChapter, fetchImageBytes: fetchImageBytes };
  if (typeof module !== 'undefined' && module.exports) { module.exports = plugin; }
  return plugin;
})();
