export type Track = {
  title: string;
  artist: string;
  src: string;
  source: string;
  license: string;
  note: string;
};

export const nightTrack: Track = {
  title: '夜想曲 Op. 15 No. 2',
  artist: 'Frédéric Chopin · Vadim Chaimovich',
  src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/2/29/Chopin_-_Nocturne_Op._15_no._2_in_F_sharp_major.ogg/Chopin_-_Nocturne_Op._15_no._2_in_F_sharp_major.ogg.mp3',
  source: 'https://commons.wikimedia.org/wiki/File:Chopin_-_Nocturne_Op._15_no._2_in_F_sharp_major.ogg',
  license: 'CC0 1.0',
  note: '给夜行、阅读，以及那些还没有说完的话。',
};
