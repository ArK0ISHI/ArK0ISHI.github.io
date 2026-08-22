import rawConfig from '../../music.config.json';

type RawAlbumTrack = {
  id: string;
  title: string;
};

export type NeteaseAlbumSeed = {
  id: string;
  title: string;
  artist: string;
  note: string;
  tracks: RawAlbumTrack[];
};

export type NeteaseTrackSeed = RawAlbumTrack & {
  artist: string;
  note: string;
  albumId: string;
  albumTitle: string;
  trackNumber: number;
};

export type MusicManifestTrack = NeteaseTrackSeed & {
  cover: string;
  src: string;
  source: string;
  lrc: string;
  provider: 'netease' | 'fallback';
  lyricKind?: 'instrumental' | 'timed' | 'none';
};

const albums = rawConfig.albums as NeteaseAlbumSeed[];
const tracks: NeteaseTrackSeed[] = albums.flatMap((album) =>
  album.tracks.map((track, index) => ({
    ...track,
    artist: album.artist,
    note: `《${album.title}》· ${String(index + 1).padStart(2, '0')} / ${String(album.tracks.length).padStart(2, '0')} · ${album.note}`,
    albumId: album.id,
    albumTitle: album.title,
    trackNumber: index + 1,
  })),
);

export const neteaseMusic = {
  provider: rawConfig.provider,
  manifest: '/data/music.json',
  albums,
  tracks,
};

export const fallbackTrack: MusicManifestTrack = {
  id: 'cc0-chopin-nocturne-op15-2',
  title: '夜想曲 Op. 15 No. 2',
  artist: 'Frédéric Chopin · Vadim Chaimovich',
  cover: '',
  src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/2/29/Chopin_-_Nocturne_Op._15_no._2_in_F_sharp_major.ogg/Chopin_-_Nocturne_Op._15_no._2_in_F_sharp_major.ogg.mp3',
  source: 'https://commons.wikimedia.org/wiki/File:Chopin_-_Nocturne_Op._15_no._2_in_F_sharp_major.ogg',
  lrc: '',
  provider: 'fallback',
  note: '网易云链路不可用时启用的 CC0 备用音源。',
  albumId: 'cc0-fallback',
  albumTitle: '备用声音档案',
  trackNumber: 1,
  lyricKind: 'none',
};
