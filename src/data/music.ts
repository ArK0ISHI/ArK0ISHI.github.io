import rawConfig from '../../music.config.json';

export type MusicProvider = 'netease' | 'local' | 'fallback';
export type CollectionKind = 'album' | 'playlist';
export type LyricKind = 'instrumental' | 'timed' | 'none';

type RawTrack = {
  id: string;
  title: string;
  artist?: string;
  cover?: string;
  durationMs?: number;
};

export type NeteaseAlbumSeed = {
  id: string;
  title: string;
  artist: string;
  note: string;
  tracks: RawTrack[];
};

export type NeteasePlaylistSeed = {
  id: string;
  title: string;
  artist: string;
  creatorId: string;
  note: string;
  tracks: RawTrack[];
};

export type LocalTrackSeed = {
  id: string;
  title: string;
  artist: string;
  src: string;
  cover: string;
  source: string;
  sourceLabel: string;
  durationMs: number;
  lyricKind: LyricKind;
  lrc: string;
  playlistId: string;
  insertAfterId: string;
  note: string;
};

export type MusicTrackSeed = {
  id: string;
  title: string;
  artist: string;
  note: string;
  albumId: string;
  albumTitle: string;
  trackNumber: number;
  collectionKind: CollectionKind;
  playlistId?: string;
  cover?: string;
  src?: string;
  source?: string;
  sourceLabel?: string;
  sourceKind?: 'netease' | 'local' | 'fallback';
  provider?: MusicProvider;
  durationMs?: number;
  lrc?: string;
  lyricKind?: LyricKind;
};

export type MusicManifestTrack = MusicTrackSeed & {
  cover: string;
  src: string;
  source: string;
  lrc: string;
  provider: MusicProvider;
};

const albums = rawConfig.albums as NeteaseAlbumSeed[];
const playlists = rawConfig.playlists as NeteasePlaylistSeed[];
const localTracks = rawConfig.localTracks as LocalTrackSeed[];

const albumTracks: MusicTrackSeed[] = albums.flatMap((album) =>
  album.tracks.map((track, index) => ({
    id: track.id,
    title: track.title,
    artist: track.artist || album.artist,
    cover: track.cover,
    durationMs: track.durationMs,
    provider: 'netease',
    sourceKind: 'netease',
    collectionKind: 'album',
    note: `《${album.title}》· ${String(index + 1).padStart(2, '0')} / ${String(album.tracks.length).padStart(2, '0')} · ${album.note}`,
    albumId: album.id,
    albumTitle: album.title,
    trackNumber: index + 1,
  })),
);

function playlistTracks(playlist: NeteasePlaylistSeed): MusicTrackSeed[] {
  const playlistLocals = localTracks.filter((track) => track.playlistId === playlist.id);
  const combined: Array<{ kind: 'netease'; track: RawTrack } | { kind: 'local'; track: LocalTrackSeed }> = [];
  const pending = [...playlistLocals];

  playlist.tracks.forEach((track) => {
    combined.push({ kind: 'netease', track });
    for (let index = 0; index < pending.length;) {
      if (pending[index].insertAfterId !== track.id) {
        index += 1;
        continue;
      }
      combined.push({ kind: 'local', track: pending[index] });
      pending.splice(index, 1);
    }
  });
  pending.forEach((track) => combined.push({ kind: 'local', track }));

  return combined.map((entry, index) => {
    const common = {
      id: entry.track.id,
      title: entry.track.title,
      artist: entry.track.artist || playlist.artist,
      collectionKind: 'playlist' as const,
      playlistId: playlist.id,
      albumId: `playlist-${playlist.id}`,
      albumTitle: playlist.title,
      trackNumber: index + 1,
      durationMs: entry.track.durationMs,
      note: `《${playlist.title}》播放列表 · ${String(index + 1).padStart(2, '0')} / ${String(combined.length).padStart(2, '0')} · ${playlist.note}`,
    };
    if (entry.kind === 'local') {
      return {
        ...common,
        note: `${common.note} ${entry.track.note}`,
        provider: 'local' as const,
        sourceKind: 'local' as const,
        src: entry.track.src,
        cover: entry.track.cover,
        source: entry.track.source,
        sourceLabel: entry.track.sourceLabel,
        lrc: entry.track.lrc,
        lyricKind: entry.track.lyricKind,
      };
    }
    return {
      ...common,
      provider: 'netease' as const,
      sourceKind: 'netease' as const,
      cover: entry.track.cover,
    };
  });
}

const seen = new Set<string>();
const tracks: MusicTrackSeed[] = [
  ...albumTracks,
  ...playlists.flatMap(playlistTracks),
].filter((track) => {
  const key = `${track.provider || 'netease'}:${track.id}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

export const neteaseMusic = {
  provider: localTracks.length > 0 ? 'netease+local' : rawConfig.provider,
  manifest: '/data/music.json',
  albums,
  playlists,
  tracks,
};

export const fallbackTrack: MusicManifestTrack = {
  id: 'cc0-chopin-nocturne-op15-2',
  title: '夜想曲 Op. 15 No. 2',
  artist: 'Frédéric Chopin · Vadim Chaimovich',
  cover: '',
  src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/2/29/Chopin_-_Nocturne_Op._15_no._2_in_F_sharp_major.ogg/Chopin_-_Nocturne_Op._15_no._2_in_F_sharp_major.ogg.mp3',
  source: 'https://commons.wikimedia.org/wiki/File:Chopin_-_Nocturne_Op._15_no._2_in_F_sharp_major.ogg',
  sourceLabel: 'Wikimedia Commons · CC0 音源',
  sourceKind: 'fallback',
  lrc: '',
  provider: 'fallback',
  note: '网易云链路不可用时启用的 CC0 备用音源。',
  albumId: 'cc0-fallback',
  albumTitle: '备用声音档案',
  collectionKind: 'album',
  trackNumber: 1,
  lyricKind: 'none',
};
