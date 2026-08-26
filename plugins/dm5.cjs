// DM5 动漫屋（dm5.com）漫画源插件 —— MiaoQi / Breeze 协议
// 注意：dm5 图片 CDN（*.cdndm5.com）带 Referer 防盗链，
// 所有请求统一携带 Referer: https://www.dm5.com/。
// 宿主会从插件的 fetch 中学习每个域名的 headers，之后图片走 Dart 直连。

const BASE = 'https://www.dm5.com';
const REFERER = 'https://www.dm5.com/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// 详情页用爬虫 UA：超大章节数漫画（如海贼王）对普通 UA 只返回精简页，
// 章节列表为空；Googlebot UA 返回含完整章节列表的页面。
const UA_CRAWLER =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const UUID = 'd3f5a1e2-8b4c-4a7d-9e6f-2c1b0a9d8e7f';

// 兼容缺失前导斜杠的 id（历史数据/第三方调用），避免 BASE+id 拼出
// 'dm5.com/manhua-xxx' 直接连 http 的错误（缺斜杠会变子域）。
function normalizeIdForHost(id) {
  if (!id) return '';
  const s = String(id).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return s.startsWith('/') ? s : '/' + s;
}

function headers(extra) {
  const h = { 'User-Agent': UA, 'Referer': REFERER };
  if (extra) {
    for (const k in extra) h[k] = extra[k];
  }
  return h;
}

async function getText(url, extraHeaders) {
  const res = await fetch(url, { headers: headers(extraHeaders) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return await res.text();
}

function clean(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

// 章节列表缓存：comicId -> eps（宿主 runtime 跨调用持久，避免每次翻话重抓详情页）
const epsCache = {};
// 漫画名缓存：comicId -> title（getChapter 返回 comic.title 供阅读器头部显示）
const titleCache = {};

async function getInfo() {
  return {
    name: 'DM5 动漫屋',
    uuid: UUID,
    version: '0.0.1',
    describe: 'dm5.com 动漫屋漫画源：搜索、详情、阅读',
    iconUrl: '',
    home: 'https://www.dm5.com/',
  };
}

async function searchComic(args) {
  const keyword = String(args.keyword || '');
  const url =
    BASE + '/search?title=' + encodeURIComponent(keyword) + '&language=1';
  const html = await getText(url);
  const $ = globalThis.BreezeHtml.load(html);
  const items = [];

  // 第一个结果：banner_detail_form（大图）
  $('.banner_detail_form').each(function () {
    const a = $(this).find('.info .title a').first();
    const href = a.attr('href') || '';
    if (href.indexOf('/manhua-') !== 0) return;
    items.push({
      source: UUID,
      id: href,
      title: clean(a.text()) || clean(a.attr('title') || ''),
      subtitle: '',
      cover: { url: $(this).find('.cover img').first().attr('src') || '' },
    });
  });

  // 其余结果：mh-list 网格
  $('.mh-list li').each(function () {
    const a = $(this).find('h2.title a').first();
    const href = a.attr('href') || '';
    if (href.indexOf('/manhua-') !== 0) return;
    const style = $(this).find('.mh-cover').first().attr('style') || '';
    const m = style.match(/url\(['"]?([^'")]+)['"]?\)/);
    items.push({
      source: UUID,
      id: href,
      title: clean(a.text()) || clean(a.attr('title') || ''),
      subtitle: clean($(this).find('p.chapter').text()),
      cover: { url: m ? m[1] : '' },
    });
  });

  return { items: items, paging: { hasReachedMax: true } };
}

async function fetchDetail(comicId) {
  const id = normalizeIdForHost(comicId);
  const url = id.indexOf('http') === 0 ? id : BASE + id;
  const html = await getText(url, { 'User-Agent': UA_CRAWLER });
  const $ = globalThis.BreezeHtml.load(html);

  const mname = (html.match(/DM5_COMIC_MNAME="([^"]*)"/) || [])[1] || '';
  const banner = $('.banner_detail_form').first();
  const title = mname || clean(banner.find('.info .title').first().text());
  const cover = banner.find('.cover img').first().attr('src') || '';
  const subtitle = clean(banner.find('.info .subtitle').first().text());
  const author = (subtitle.match(/作者[:：]\s*([^\s]+)/) || [])[1] || '';
  const description = clean(banner.find('.info .content').first().text());
  const tip = clean(banner.find('.info .tip').first().text());
  const status = (tip.match(/状态[:：]\s*([^\s]+)/) || [])[1] || '';

  const eps = [];
  $('#detail-list-select-1 li').each(function () {
    const a = $(this).find('a').first();
    const href = a.attr('href') || '';
    const m = href.match(/^\/m(\d+)\/$/);
    if (!m) return;
    // 标题：优先 p.title（完整标题），否则 a 文本去 span，最后 a[title]
    let name = '';
    const pTitle = $(this).find('p.title').first();
    if (pTitle.length > 0) {
      pTitle.find('span').remove();
      name = clean(pTitle.text());
    }
    if (!name) {
      const aCopy = a.clone();
      aCopy.find('span').remove();
      name = clean(aCopy.text());
    }
    if (!name) name = clean(a.attr('title') || '');
    if (!name) name = '第' + (eps.length + 1) + '话';
    eps.push({ id: m[1], name: name, order: 0 });
  });
  // 章节顺序不固定（新→旧 / 旧→新），统一转正序：id 越大越新
  if (eps.length > 1) {
    const firstId = parseInt(eps[0].id, 10);
    const lastId = parseInt(eps[eps.length - 1].id, 10);
    if (firstId > lastId) eps.reverse();
  }
  for (let i = 0; i < eps.length; i++) eps[i].order = i;

  const metadata = [];
  if (author) metadata.push({ name: '作者', value: [{ name: author }] });
  if (status) metadata.push({ name: '状态', value: [{ name: status }] });

  return {
    source: UUID,
    comicId: comicId,
    data: {
      normal: {
        comicInfo: {
          title: title,
          creator: { name: author },
          description: description,
          cover: { url: cover },
          metadata: metadata,
          extern: { status: status === '已完结' ? 'completed' : 'ongoing' },
        },
        eps: eps,
      },
    },
  };
}

async function getComicDetail(args) {
  const comicId = String(args.comicId || '');
  const detail = await fetchDetail(comicId);
  epsCache[comicId] = detail.data.normal.eps;
  titleCache[comicId] = detail.data.normal.comicInfo.title || '';
  return detail;
}

async function getChapter(args) {
  const comicId = String(args.comicId || '');
  const chapterId = String(args.chapterId || '');
  if (!chapterId) {
    throw new Error('章节 ID 为空，请返回详情页重新选择章节');
  }
  const url = BASE + '/m' + chapterId + '/';
  const html = await getText(url);

  const pages = [];
  const seenUrls = new Set();

  // 章节页内联变量
  const varValue = function (name) {
    const m = html.match(
      new RegExp(name + '\\s*=\\s*["\']?([^;"\']{0,80})'),
    );
    return m ? m[1].trim() : '';
  };
  const cid = varValue('DM5_CID');
  const mid = varValue('DM5_MID');
  const vsign = varValue('DM5_VIEWSIGN');
  const vdt = varValue('DM5_VIEWSIGN_DT');
  const imgCount = parseInt(varValue('DM5_IMAGE_COUNT'), 10) || 0;

  // 图片直链不再内联：通过 chapterfun.ashx 分页获取（响应为 JS 代码，
  // 执行后 d 为图片 URL 数组，每页 2 张）。并发抓取（每次 6 页）加快加载。
  if (cid && vsign) {
    // 不上限过窄：长章节（超 150 图）不能被 Math.ceil(imgCount/2) 截断。
    // 用宽松上限，靠"整批无新增页"或达到 imgCount 饱和来停。
    const maxPages = 500;
    const fetchPage = async function (p) {
      const api =
        BASE +
        '/chapterfun.ashx?cid=' +
        cid +
        '&page=' +
        p +
        '&key=&language=1&gtk=6&_cid=' +
        cid +
        '&_mid=' +
        mid +
        '&_dt=' +
        encodeURIComponent(vdt) +
        '&_sign=' +
        vsign;
      const body = await getText(api);
      return evalChapterfun(body) || [];
    };
    const CONCURRENCY = 6;
    let p = 1;
    let emptyStreak = 0;
    outer: while (p <= maxPages) {
      const batch = [];
      for (let i = 0; i < CONCURRENCY && p <= maxPages; i++, p++) {
        batch.push(fetchPage(p));
      }
      const results = await Promise.all(batch);
      for (const urls of results) {
        // 单页偶发为空不立即断链：连续 2 个空页才视为翻页结束
        // （避免某个网络失败导致后半章节缺失"显示不全"）。
        if (!urls || urls.length === 0) {
          emptyStreak++;
          if (emptyStreak >= 2) break outer;
          continue;
        }
        emptyStreak = 0;
        let newCount = 0;
        for (const u of urls) {
          if (typeof u !== 'string' || !u || seenUrls.has(u)) continue;
          seenUrls.add(u);
          newCount++;
          pages.push({
            id: String(pages.length + 1),
            name: String(pages.length + 1),
            path: '',
            url: u,
          });
        }
        // 学习图片域名的 Referer headers（首批即可）
        if (newCount > 0) {
          try {
            await fetch(urls[0], { headers: headers() });
          } catch (e) {}
        }
        // 整页都是重复图（VIP 占位/接口固定返回）→ 停止翻页
        if (newCount === 0) break outer;
        // 不依赖 DM5_IMAGE_COUNT 截断：该值偶发偏小会造成"显示不全"。
        // 靠连续空页（emptyStreak>=2）自然结束，取全该章所有图。
      }
    }
  }

  // 学习每个图片域名的 Referer headers：DM5 章节图分布在多个 CDN 域
  // （*.cdndm5.com 等），若只学 urls[0] 的域，其它域的图会 403 导致
  // "显示不全"。逐域学习，宿主 Dart 直连时才带对 Referer。
  if (pages.length > 0) {
    const hostSet = new Set();
    for (const pg of pages) {
      try {
        const h = new URL(pg.url).hostname;
        if (h && !hostSet.has(h)) hostSet.add(h);
      } catch (e) {}
    }
    for (const h of hostSet) {
      const sample = pages.find((p) => {
        try { return new URL(p.url).hostname === h; } catch (e) { return false; }
      });
      if (!sample) continue;
      try {
        await fetch(sample.url, { headers: headers() });
      } catch (e) {}
    }
  }

  // VIP 付费章节：chapterfun 只返回占位图（images/war.jpg 等），
  // 此时唯一 URL 极少且指向占位图——给出友好提示而不是重复刷图
  if (pages.length > 0 && seenUrls.size <= 1) {
    const only = pages[0].url;
    if (/\/images\//.test(only) || /war\.jpg/.test(only)) {
      throw new Error('该章节为 VIP 付费章节，暂不支持在线观看，请到 dm5.com 查看');
    }
  }
  if (pages.length === 0) {
    throw new Error('未获取到章节图片，可能为付费章节或页面结构已变化');
  }

  // 章节列表：优先缓存，miss 时抓详情页
  let eps = epsCache[comicId];
  if (!eps) {
    try {
      const detail = await fetchDetail(comicId);
      eps = detail.data.normal.eps;
      epsCache[comicId] = eps;
      titleCache[comicId] = detail.data.normal.comicInfo.title || '';
    } catch (e) {
      eps = [];
    }
  }

  let chapterName = '';
  for (const c of eps) {
    if (c.id === chapterId) {
      chapterName = c.name;
      break;
    }
  }
  if (!chapterName) chapterName = '第' + chapterId + '话';

  return {
    comicId: comicId,
    data: {
      comic: { id: comicId, title: titleCache[comicId] || '' },
      chapter: { id: chapterId, name: chapterName, pages: pages },
      chapters: eps,
    },
  };
}

// 执行 chapterfun.ashx 返回的 JS（packer 混淆），返回图片 URL 数组
function evalChapterfun(body) {
  try {
    // 在独立函数作用域执行，避免污染全局
    const fn = new Function(
      body + '\n; return typeof d === "undefined" ? null : d;',
    );
    const d = fn();
    if (Array.isArray(d)) return d;
  } catch (e) {}
  return null;
}

async function fetchImageBytes(args) {
  const url = String(args.url || '');
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// 无自定义设置/能力项——返回空（Breeze 协议要求，避免宿主报 Missing function）
async function getSettingsBundle() {
  return {
    scheme: { type: 'settingsVersion', sections: [] },
    data: { values: {} },
  };
}

async function getCapabilitiesBundle() {
  return { scheme: { type: 'capabilities', actions: [] } };
}

module.exports = {
  getInfo,
  searchComic,
  getComicDetail,
  getChapter,
  fetchImageBytes,
  getSettingsBundle,
  getCapabilitiesBundle,
};
