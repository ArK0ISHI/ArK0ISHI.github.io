import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'music.config.json');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'music.json');
const MAX_ALBUMS = 6;
const MAX_PLAYLISTS = 4;
const MAX_LOCAL_TRACKS = 16;
const MAX_TRACKS = 80;
const MAX_LRC_LENGTH = 30_000;
const FETCH_CONCURRENCY = 5;
const NETEASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36',
  Referer: 'https://music.163.com/',
};

const outerUrl = (id) => `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
const songSourceUrl = (id) => `https://music.163.com/#/song?id=${id}`;
const albumSourceUrl = (id) => `https://music.163.com/#/album?id=${id}`;
const playlistSourceUrl = (id) => `https://music.163.com/#/playlist?id=${id}`;
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

function numericId(value, label = 'song') {
  const id = String(value || '').trim();
  if (!/^\d{1,20}$/.test(id)) throw new Error(`invalid ${label} id: ${id}`);
  return id;
}

function secureUrl(value) {
  return String(value || '').replace(/^http:/, 'https:');
}

function collectionNote(collection, index, total, kind) {
  const kindLabel = kind === 'playlist' ? '播放列表' : '';
  return `《${collection.title}》${kindLabel} · ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')} · ${collection.note || '来自网易云音乐的夜间声音档案。'}`;
}

function normalizeNeteaseSeed(collection, seed, index, total, kind) {
  const id = numericId(seed.id);
  const collectionId = numericId(collection.id, kind);
  const collectionTitle = collection.title || `网易云${kind === 'playlist' ? '歌单' : '专辑'} ${collectionId}`;
  const isPlaylist = kind === 'playlist';
  return {
    id,
    title: seed.title || `网易云曲目 ${id}`,
    artist: seed.artist || collection.artist || '未知歌手',
    cover: secureUrl(seed.cover || collection.cover),
    src: outerUrl(id),
    source: songSourceUrl(id),
    sourceLabel: '网易云音乐 · 歌曲页面',
    provider: 'netease',
    sourceKind: 'netease',
    collectionKind: kind,
    note: collectionNote({ ...collection, title: collectionTitle }, index, total, kind),
    albumId: isPlaylist ? `playlist-${collectionId}` : collectionId,
    albumTitle: collectionTitle,
    albumSource: isPlaylist ? playlistSourceUrl(collectionId) : albumSourceUrl(collectionId),
    ...(isPlaylist ? { playlistId: collectionId, playlistTrackAlbum: seed.album || '' } : {}),
    trackNumber: index + 1,
    discNumber: Number(seed.discNumber || 1),
    durationMs: Number(seed.durationMs || 0),
  };
}

function normalizeLocalSeed(collection, seed, index, total) {
  const id = numericId(seed.id, 'local song');
  const playlistId = numericId(collection.id, 'playlist');
  const src = String(seed.src || '');
  const cover = String(seed.cover || '');
  if (!src.startsWith('/audio/music/')) throw new Error(`local song ${id} must use /audio/music/`);
  if (!cover.startsWith('/images/music/')) throw new Error(`local song ${id} must use /images/music/`);
  return {
    id,
    title: seed.title || `本地曲目 ${id}`,
    artist: seed.artist || '未知作者',
    cover,
    src,
    source: secureUrl(seed.source),
    sourceLabel: seed.sourceLabel || '本地声音档案',
    provider: 'local',
    sourceKind: 'local',
    collectionKind: 'playlist',
    note: `${collectionNote(collection, index, total, 'playlist')} ${seed.note || ''}`.trim(),
    albumId: `playlist-${playlistId}`,
    albumTitle: collection.title || `歌单 ${playlistId}`,
    albumSource: playlistSourceUrl(playlistId),
    playlistId,
    trackNumber: index + 1,
    discNumber: 1,
    durationMs: Number(seed.durationMs || 0),
    lrc: String(seed.lrc || '').slice(0, MAX_LRC_LENGTH),
    lyricKind: seed.lyricKind === 'timed' ? 'timed' : seed.lyricKind === 'none' ? 'none' : 'instrumental',
  };
}

async function readPreviousManifest() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  } catch {
    return { tracks: [] };
  }
}

function previousById(previousManifest) {
  return new Map((Array.isArray(previousManifest?.tracks) ? previousManifest.tracks : []).map((track) => [String(track.id), track]));
}

async function resolveAlbum(album, previousTracks) {
  const albumId = numericId(album.id, 'album');
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
      tracks: ordered.map(({ song }, index) => normalizeNeteaseSeed(albumMeta, {
        id: song.id,
        title: song.name,
        artist: song.ar?.map((artist) => artist.name).filter(Boolean).join(' / '),
        cover: song.al?.picUrl,
        discNumber: song.cd || 1,
        durationMs: song.dt,
      }, index, ordered.length, 'album')),
      failures: [],
    };
  } catch (error) {
    if (configured.length === 0) throw error;
    const seeds = configured.map((track) => ({ ...(previousTracks.get(String(track.id)) || {}), ...track }));
    return {
      tracks: seeds.map((track, index) => normalizeNeteaseSeed(album, track, index, seeds.length, 'album')),
      failures: [{ scope: 'album', id: albumId, error: String(error), fallback: 'config-snapshot' }],
    };
  }
}

async function fetchSongDetails(ids) {
  const payload = await fetchJson(`https://music.163.com/api/song/detail?ids=${encodeURIComponent(JSON.stringify(ids.map(Number)))}`);
  return Array.isArray(payload?.songs) ? payload.songs : [];
}

function playlistSeedFromSong(song) {
  const artists = Array.isArray(song.ar) ? song.ar : Array.isArray(song.artists) ? song.artists : [];
  const album = song.al || song.album || {};
  return {
    id: song.id,
    title: song.name,
    artist: artists.map((artist) => artist.name).filter(Boolean).join(' / '),
    album: album.name,
    cover: album.picUrl,
    durationMs: song.dt || song.duration,
  };
}

function mergePlaylistAndLocal(playlist, remoteSeeds, localTracks, failures) {
  const combined = [];
  const pending = [...localTracks];
  remoteSeeds.forEach((seed) => {
    combined.push({ kind: 'netease', seed });
    for (let index = 0; index < pending.length;) {
      if (String(pending[index].insertAfterId || '') !== String(seed.id)) {
        index += 1;
        continue;
      }
      combined.push({ kind: 'local', seed: pending[index] });
      pending.splice(index, 1);
    }
  });
  pending.forEach((seed) => {
    combined.push({ kind: 'local', seed });
    failures.push({ scope: 'local-order', id: String(seed.id), error: `insertAfterId ${seed.insertAfterId || '(missing)'} not found`, fallback: 'appended' });
  });
  return combined.map((entry, index) => entry.kind === 'local'
    ? normalizeLocalSeed(playlist, entry.seed, index, combined.length)
    : normalizeNeteaseSeed(playlist, entry.seed, index, combined.length, 'playlist'));
}

async function resolvePlaylist(playlist, localTracks, previousTracks) {
  const playlistId = numericId(playlist.id, 'playlist');
  const configured = Array.isArray(playlist.tracks) ? playlist.tracks : [];
  const configuredById = new Map(configured.map((track) => [String(track.id), track]));
  const previousPlaylistTracks = [...previousTracks.values()].filter((track) => String(track.playlistId || '') === playlistId && track.provider !== 'local');
  const failures = [];
  let playlistMeta = { ...playlist };
  let remoteSeeds;
  try {
    const payload = await fetchJson(`https://music.163.com/api/v6/playlist/detail?id=${playlistId}`);
    const remoteIds = (Array.isArray(payload?.playlist?.trackIds) ? payload.playlist.trackIds : [])
      .map((entry) => numericId(entry?.id, 'playlist song'));
    if (remoteIds.length === 0) throw new Error('playlist has no track ids');
    const songs = await fetchSongDetails(remoteIds);
    const songsById = new Map(songs.map((song) => [String(song.id), playlistSeedFromSong(song)]));
    const previousPlaylistById = new Map(previousPlaylistTracks.map((track) => [String(track.id), track]));
    remoteSeeds = remoteIds.map((id) => songsById.get(id) || configuredById.get(id) || previousPlaylistById.get(id) || { id });
    const missingIds = remoteIds.filter((id) => !songsById.has(id));
    if (missingIds.length > 0) failures.push({ scope: 'playlist-detail', id: playlistId, error: `missing metadata for ${missingIds.join(',')}`, fallback: 'config-or-previous-snapshot' });
    playlistMeta = {
      ...playlist,
      title: payload?.playlist?.name || playlist.title,
      artist: payload?.playlist?.creator?.nickname || playlist.artist,
      cover: payload?.playlist?.coverImgUrl || playlist.cover,
    };
  } catch (error) {
    const snapshots = configured.length > 0 ? configured : previousPlaylistTracks;
    if (snapshots.length === 0) throw error;
    remoteSeeds = snapshots;
    failures.push({ scope: 'playlist', id: playlistId, error: String(error), fallback: configured.length > 0 ? 'config-snapshot' : 'previous-manifest' });
  }
  return {
    tracks: mergePlaylistAndLocal(playlistMeta, remoteSeeds, localTracks, failures),
    failures,
  };
}

async function attachLyric(track, previousTracks) {
  if (track.provider === 'local') return { track, failures: [] };
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
    const previous = previousTracks.get(track.id);
    const hasSnapshot = typeof previous?.lrc === 'string';
    return {
      track: {
        ...track,
        lrc: hasSnapshot ? previous.lrc : '',
        lyricKind: hasSnapshot ? (previous.lyricKind || 'none') : 'none',
      },
      failures: [{ scope: 'lyric', id: track.id, error: String(error), fallback: hasSnapshot ? 'previous-manifest' : 'none' }],
    };
  }
}

export async function syncNeteaseMusic({ silent = false } = {}) {
  const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const albums = Array.isArray(raw.albums) ? raw.albums.slice(0, MAX_ALBUMS) : [];
  const playlists = Array.isArray(raw.playlists) ? raw.playlists.slice(0, MAX_PLAYLISTS) : [];
  const localTracks = Array.isArray(raw.localTracks) ? raw.localTracks.slice(0, MAX_LOCAL_TRACKS) : [];
  if (albums.length === 0 && playlists.length === 0) throw new Error('music.config.json 中没有可用专辑或歌单');

  const previousManifest = await readPreviousManifest();
  const previousTracks = previousById(previousManifest);
  const albumResults = await Promise.all(albums.map((album) => resolveAlbum(album, previousTracks)));
  const playlistResults = await Promise.all(playlists.map((playlist) => resolvePlaylist(
    playlist,
    localTracks.filter((track) => String(track.playlistId || '') === String(playlist.id)),
    previousTracks,
  )));

  const seen = new Set();
  const collectionTracks = [...albumResults, ...playlistResults]
    .flatMap((result) => result.tracks)
    .filter((track) => {
      const key = `${track.provider}:${track.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TRACKS);
  if (collectionTracks.length === 0) throw new Error('没有解析到可用曲目');

  const lyricResults = await mapWithConcurrency(collectionTracks, FETCH_CONCURRENCY, (track) => attachLyric(track, previousTracks));
  const tracks = lyricResults.map((result) => result.track);
  const failures = [
    ...albumResults.flatMap((result) => result.failures),
    ...playlistResults.flatMap((result) => result.failures),
    ...lyricResults.flatMap((result) => result.failures),
  ];

  const manifest = {
    generatedAt: new Date().toISOString(),
    provider: localTracks.length > 0 ? 'netease+local' : 'netease',
    albums: albums.map(({ id, title, artist }) => ({ id: String(id), title, artist })),
    playlists: playlists.map(({ id, title, artist, creatorId }) => ({ id: String(id), title, artist, creatorId: String(creatorId || '') })),
    dedupe: 'stable first occurrence by provider:id; albums precede playlists; local tracks retain their own provider namespace',
    tracks,
    failures,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (!silent) {
    const localCount = tracks.filter((track) => track.provider === 'local').length;
    const instrumental = tracks.filter((track) => track.lyricKind === 'instrumental').length;
    console.log(`[netease-music] 已同步 ${albums.length} 张专辑 + ${playlists.length} 个歌单 / ${tracks.length} 首曲目（本地 ${localCount} 首）；LRC ${tracks.filter((track) => track.lrc).length} 首（器乐标记 ${instrumental} 首），降级 ${failures.length} 项`);
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncNeteaseMusic().catch((error) => {
    console.error(`[netease-music] 同步失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
