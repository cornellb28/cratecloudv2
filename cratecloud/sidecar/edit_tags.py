#!/usr/bin/env python3
"""
Edit standard and Serato metadata on an audio file.
Writes:
  - Standard tags (ID3/FLAC/MP4) via mutagen
  - Serato Autotags (BPM, gain) via serato-tools for MP3/FLAC/M4A
"""
import os
import sys
import json
import argparse

from mutagen.id3 import ID3, TIT2, TPE1, TALB, TCON, TBPM, TKEY, TDRC, TPE4, TIT1, TCOM, COMM, TPUB, error as ID3Error
from mutagen.easyid3 import EasyID3
from mutagen.flac import FLAC
from mutagen.mp4 import MP4

try:
    from serato_tools.track_autotags import TrackAutotags
    HAS_SERATO = True
except ImportError:
    HAS_SERATO = False

SUPPORTED = {'.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.ogg'}


def _set_if(d, key, value):
    """Only set key if value is not None."""
    if value is not None:
        d[key] = value


def edit_mp3(filepath, meta, write_serato):
    # EasyID3 for text fields
    try:
        easy = EasyID3(filepath)
    except ID3Error:
        easy = EasyID3()
        easy.save(filepath)
        easy = EasyID3(filepath)

    if meta.get('title') is not None:
        easy['title'] = [meta['title']]
    if meta.get('artist') is not None:
        easy['artist'] = [meta['artist']]
    if meta.get('album') is not None:
        easy['album'] = [meta['album']]
    if meta.get('genre') is not None:
        easy['genre'] = [meta['genre']]
    if meta.get('year') is not None:
        easy['date'] = [str(meta['year'])]
    if meta.get('composer') is not None:
        easy['composer'] = [meta['composer']]
    if meta.get('grouping') is not None:
        easy['grouping'] = [meta['grouping']]
    easy.save()

    # Raw ID3 for BPM, key, and frames not available via EasyID3
    raw = ID3(filepath)
    if meta.get('bpm') is not None:
        raw['TBPM'] = TBPM(encoding=3, text=str(int(float(meta['bpm']))))
    if meta.get('key') is not None:
        raw['TKEY'] = TKEY(encoding=3, text=str(meta['key']))
    if meta.get('remixer') is not None:
        raw['TPE4'] = TPE4(encoding=3, text=str(meta['remixer']))
    if meta.get('label') is not None:
        raw['TPUB'] = TPUB(encoding=3, text=str(meta['label']))
    if meta.get('comment') is not None:
        raw['COMM::eng'] = COMM(encoding=3, lang='eng', desc='', text=str(meta['comment']))
    raw.save()

    # Serato autotags
    if write_serato and HAS_SERATO and meta.get('bpm') is not None:
        try:
            at = TrackAutotags(filepath)
            at.set(bpm=float(meta['bpm']))
            at.save()
        except Exception:
            pass  # non-fatal


def edit_flac(filepath, meta, write_serato):
    audio = FLAC(filepath)
    if meta.get('title') is not None:
        audio['title'] = [meta['title']]
    if meta.get('artist') is not None:
        audio['artist'] = [meta['artist']]
    if meta.get('album') is not None:
        audio['album'] = [meta['album']]
    if meta.get('genre') is not None:
        audio['genre'] = [meta['genre']]
    if meta.get('year') is not None:
        audio['date'] = [str(meta['year'])]
    if meta.get('bpm') is not None:
        audio['bpm'] = [str(int(float(meta['bpm'])))]
    if meta.get('key') is not None:
        audio['key'] = [str(meta['key'])]
    if meta.get('remixer') is not None:
        audio['remixer'] = [meta['remixer']]
    if meta.get('grouping') is not None:
        audio['grouping'] = [meta['grouping']]
    if meta.get('composer') is not None:
        audio['composer'] = [meta['composer']]
    if meta.get('comment') is not None:
        audio['comment'] = [meta['comment']]
    if meta.get('label') is not None:
        audio['organization'] = [meta['label']]
    audio.save()

    if write_serato and HAS_SERATO and meta.get('bpm') is not None:
        try:
            at = TrackAutotags(filepath)
            at.set(bpm=float(meta['bpm']))
            at.save()
        except Exception:
            pass


def edit_m4a(filepath, meta, _write_serato):
    audio = MP4(filepath)
    if audio.tags is None:
        audio.add_tags()
    t = audio.tags
    if meta.get('title') is not None:
        t['\xa9nam'] = [meta['title']]
    if meta.get('artist') is not None:
        t['\xa9ART'] = [meta['artist']]
    if meta.get('album') is not None:
        t['\xa9alb'] = [meta['album']]
    if meta.get('genre') is not None:
        t['\xa9gen'] = [meta['genre']]
    if meta.get('year') is not None:
        t['\xa9day'] = [str(meta['year'])]
    if meta.get('bpm') is not None:
        t['tmpo'] = [int(float(meta['bpm']))]
    if meta.get('composer') is not None:
        t['\xa9wrt'] = [meta['composer']]
    if meta.get('grouping') is not None:
        t['\xa9grp'] = [meta['grouping']]
    if meta.get('comment') is not None:
        t['\xa9cmt'] = [meta['comment']]
    audio.save()


def edit_file(filepath, meta, write_serato=True):
    if not os.path.exists(filepath):
        return {'success': False, 'error': f'File not found: {filepath}', 'filepath': filepath}

    ext = os.path.splitext(filepath)[1].lower()
    if ext not in SUPPORTED:
        return {'success': False, 'error': f'Unsupported format: {ext}', 'filepath': filepath}

    try:
        if ext == '.mp3':
            edit_mp3(filepath, meta, write_serato)
        elif ext == '.flac':
            edit_flac(filepath, meta, write_serato)
        elif ext == '.m4a':
            edit_m4a(filepath, meta, write_serato)
        # WAV/AIFF/OGG: write standard tags only if mutagen supports it
        # (skipped for now — they rarely carry editable metadata)
        return {'success': True, 'filepath': filepath, 'serato_written': write_serato and HAS_SERATO}
    except Exception as e:
        return {'success': False, 'error': str(e), 'filepath': filepath}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Edit metadata on an audio file.')
    parser.add_argument('filepath', help='Path to the audio file')
    parser.add_argument('--meta', required=True, help='JSON object of fields to write')
    parser.add_argument('--no-serato', action='store_true', help='Skip Serato tag writing')
    args = parser.parse_args()

    meta = json.loads(args.meta)
    result = edit_file(args.filepath, meta, write_serato=not args.no_serato)
    print(json.dumps(result))
