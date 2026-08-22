import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'music.config.json');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'music.json');
const MAX_ALBUMS = 6;
const MAX_TRACKS = 48;
const MAX_LRC_LENGTH = 30_000;
const FETCH_CONCURRENCY = 5;
const NETEASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36',
  Referer: 'https://music.163.com/',
};

const outerUrl = (id) => `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
const sourceUrl = (id) => `https://music.163.com/#/song?id=${id}`;
const albumSourceUrl = (id) => `https://music.163.com/#/album?id=${id}`;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchJson(url, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: NETEASE_HEADERS,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = await response.json();
      if (typeof payload?.code === 'number' && payload.code !== 200) throw new Error(`NetEase code ${payload.code}`);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await delay(350 * (attempt + 1));
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function normalizeSeed(album, seed, index, total) {
  const id = String(seed.id || '').trim();
  if (!/^\d{1,20}$/.test(id)) throw new Error(`invalid song id: ${id}`);
  const albumId = String(album.id || '').trim();
  const albumTitle = album.title || `网易云专辑 ${albumId}`;
  const trackNumber = Number(seed.trackNumber || seed.no || index + 1);
  return {
    id,
    title: seed.title || `网易云曲目 ${id}`,
    artist: seed.artist || album.artist || '未知歌手',
    cover: String(seed.cover || album.cover || '').replace(/^http:/, 'https:'),
    src: outerUrl(id),
    source: sourceUrl(id),
    provider: 'netease',
    note: `《${albumTitle}》· ${String(trackNumber).padStart(2, '0')} / ${String(total).padStart(2, '0')} · ${album.note || '来自网易云音乐的夜间声音档案。'}`,
    albumId,
    albumTitle,
    albumSource: albumSourceUrl(albumId),
    trackNumber,
    discNumber: Number(seed.discNumber || 1),
    durationMs: Number(seed.durationMs || 0),
  };
}

async function resolveAlbum(album) {
  const albumId = String(album.id || '').trim();
  if (!/^\d{1,20}$/.test(albumId)) throw new Error(`invalid album id: ${albumId}`);
  const configured = Array.isArray(album.tracks) ? album.tracks : [];
  try {
    const payload = await fetchJson(`https://music.163.com/api/v1/album/${albumId}`);
    const songs = Array.isArray(payload?.songs) ? payload.songs : [];
    if (songs.length === 0) throw new Error('album has no songs');
    if (configured.length > 0 && songs.length < configured.length) throw new Error(`album incomplete: ${songs.length}/${configured.length}`);
    const albumMeta = {
      ...album,
      title: payload?.album?.name || album.title,
      artist: payload?.album?.artist?.name || album.artist,
      cover: payload?.album?.picUrl || album.cover,
    };
    const ordered = songs
      .map((song, index) => ({ song, index }))
      .sort((a, b) => Number(a.song.cd || 1) - Number(b.song.cd || 1) || Number(a.song.no || a.index + 1) - Number(b.song.no || b.index + 1));
    return {
      tracks: ordered.map(({ song }, index) => normalizeSeed(albumMeta, {
        id: song.id,
        title: song.name,
        artist: song.ar?.map((artist) => artist.name).filter(Boolean).join(' / '),
        cover: song.al?.picUrl,
        trackNumber: song.no || index + 1,
        discNumber: song.cd || 1,
        durationMs: song.dt,
      }, index, ordered.length)),
      failures: [],
    };
  } catch (error) {
    if (configured.length === 0) throw error;
    return {
      tracks: configured.map((track, index) => normalizeSeed(album, track, index, configured.length)),
      failures: [{ scope: 'album', id: albumId, error: String(error) }],
    };
  }
}

async function attachLyric(track) {
  try {
    const payload = await fetchJson(`https://music.163.com/api/song/lyric?id=${track.id}&lv=-1&kv=-1&tv=-1`);
    const lrc = String(payload?.lrc?.lyric || '').slice(0, MAX_LRC_LENGTH);
    return {
      track: {
        ...track,
        lrc,
        lyricKind: payload?.pureMusic || /纯音乐|純音樂/.test(lrc) ? 'instrumental' : lrc ? 'timed' : 'none',
      },
      failures: [],
    };
  } catch (error) {
    return {
      track: { ...track, lrc: '', lyricKind: 'none' },
      failures: [{ scope: 'lyric', id: track.id, error: String(error) }],
    };
  }
}

export async function syncNeteaseMusic({ silent = false } = {}) {
  const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const albums = Array.isArray(raw.albums) ? raw.albums.slice(0, MAX_ALBUMS) : [];
  if (albums.length === 0) throw new Error('music.config.json 中没有可用专辑');

  const albumResults = await Promise.all(albums.map(resolveAlbum));
  const seen = new Set();
  const albumTracks = albumResults
    .flatMap((result) => result.tracks)
    .filter((track) => !seen.has(track.id) && seen.add(track.id))
    .slice(0, MAX_TRACKS);
  if (albumTracks.length === 0) throw new Error('没有解析到可用曲目');

  const lyricResults = await mapWithConcurrency(albumTracks, FETCH_CONCURRENCY, attachLyric);
  const tracks = lyricResults.map((result) => result.track);
  const failures = [
    ...albumResults.flatMap((result) => result.failures),
    ...lyricResults.flatMap((result) => result.failures),
  ];

  const manifest = {
    generatedAt: new Date().toISOString(),
    provider: 'netease',
    albums: albums.map(({ id, title, artist }) => ({ id: String(id), title, artist })),
    tracks,
    failures,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (!silent) {
    const instrumental = tracks.filter((track) => track.lyricKind === 'instrumental').length;
    console.log(`[netease-music] 已同步 ${albums.length} 张专辑 / ${tracks.length} 首曲目；LRC ${tracks.filter((track) => track.lrc).length} 首（器乐标记 ${instrumental} 首），降级 ${failures.length} 项`);
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncNeteaseMusic().catch((error) => {
    console.error(`[netease-music] 同步失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
