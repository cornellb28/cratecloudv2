#!/usr/bin/env python3
import os
import sys
import json
import time
import argparse
import numpy as np
import librosa
import mutagen
from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.mp4 import MP4
from mutagen.id3 import ID3, TBPM, TKEY
from mutagen.easyid3 import EasyID3

SUPPORTED_EXTENSIONS = {'.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.ogg'}

KEY_TO_CAMELOT = {
    'C major': '8B',  'C# major': '3B',  'D major': '10B', 'D# major': '5B',
    'E major': '12B', 'F major':  '7B',  'F# major': '2B', 'G major':  '9B',
    'G# major': '4B', 'A major':  '11B', 'A# major': '6B', 'B major':  '1B',
    'C minor': '5A',  'C# minor': '12A', 'D minor':  '7A', 'D# minor': '2A',
    'E minor': '9A',  'F minor':  '4A',  'F# minor': '11A','G minor':  '6A',
    'G# minor': '1A', 'A minor':  '8A',  'A# minor': '3A', 'B minor':  '10A',
}

KEY_TO_OPENKEY = {
    'C major': '1d',  'C# major': '8d',  'D major':  '3d', 'D# major': '10d',
    'E major': '5d',  'F major':  '12d', 'F# major': '7d', 'G major':  '2d',
    'G# major': '9d', 'A major':  '4d',  'A# major': '11d','B major':  '6d',
    'C minor': '10m', 'C# minor': '5m',  'D minor':  '12m','D# minor': '7m',
    'E minor': '2m',  'F minor':  '9m',  'F# minor': '4m', 'G minor':  '11m',
    'G# minor': '6m', 'A minor':  '1m',  'A# minor': '8m', 'B minor':  '3m',
}

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# Krumhansl-Kessler key profiles
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def read_existing_tags(filepath: str) -> dict:
    tags = {
        'title': None, 'artist': None, 'album': None, 'genre': None,
        'track': None, 'year': None, 'bpm_tag': None, 'key_tag': None,
        'remixer': None, 'grouping': None, 'composer': None, 'comment': None, 'label': None,
    }
    ext = os.path.splitext(filepath)[1].lower()
    try:
        if ext == '.mp3':
            easy = EasyID3(filepath)
            tags['title']    = (easy.get('title')       or [None])[0]
            tags['artist']   = (easy.get('artist')      or [None])[0]
            tags['album']    = (easy.get('album')       or [None])[0]
            tags['genre']    = (easy.get('genre')       or [None])[0]
            tags['track']    = (easy.get('tracknumber') or [None])[0]
            tags['year']     = (easy.get('date')        or [None])[0]
            tags['composer'] = (easy.get('composer')    or [None])[0]
            tags['grouping'] = (easy.get('grouping')    or [None])[0]
            raw = ID3(filepath)
            if 'TBPM' in raw:
                tags['bpm_tag'] = str(raw['TBPM'])
            if 'TKEY' in raw:
                tags['key_tag'] = str(raw['TKEY'])
            if 'TPE4' in raw:
                tags['remixer'] = str(raw['TPE4'])
            if 'TPUB' in raw:
                tags['label'] = str(raw['TPUB'])
            # COMM frame — get the first comment text
            comm_keys = [k for k in raw.keys() if k.startswith('COMM')]
            if comm_keys:
                tags['comment'] = str(raw[comm_keys[0]])
        elif ext == '.flac':
            audio = FLAC(filepath)
            tags['title']    = (audio.get('title')       or [None])[0]
            tags['artist']   = (audio.get('artist')      or [None])[0]
            tags['album']    = (audio.get('album')       or [None])[0]
            tags['genre']    = (audio.get('genre')       or [None])[0]
            tags['track']    = (audio.get('tracknumber') or [None])[0]
            tags['year']     = (audio.get('date')        or [None])[0]
            tags['bpm_tag']  = (audio.get('bpm')         or [None])[0]
            tags['key_tag']  = (audio.get('key')         or [None])[0]
            tags['remixer']  = (audio.get('remixer')     or [None])[0]
            tags['grouping'] = (audio.get('grouping')    or [None])[0]
            tags['composer'] = (audio.get('composer')    or [None])[0]
            tags['comment']  = (audio.get('comment')     or [None])[0]
            tags['label']    = (audio.get('organization') or [None])[0]
        elif ext == '.m4a':
            audio = MP4(filepath)
            t = audio.tags or {}
            tags['title']    = (t.get('\xa9nam') or [None])[0]
            tags['artist']   = (t.get('\xa9ART') or [None])[0]
            tags['album']    = (t.get('\xa9alb') or [None])[0]
            tags['genre']    = (t.get('\xa9gen') or [None])[0]
            tags['year']     = (t.get('\xa9day') or [None])[0]
            tags['bpm_tag']  = str(t['tmpo'][0]) if 'tmpo' in t else None
            tags['composer'] = (t.get('\xa9wrt') or [None])[0]
            tags['grouping'] = (t.get('\xa9grp') or [None])[0]
            tags['comment']  = (t.get('\xa9cmt') or [None])[0]
            tags['label']    = (t.get('----:com.apple.iTunes:LABEL') or [None])[0]
    except Exception:
        pass
    return tags


def analyze_audio(filepath: str) -> dict:
    y, sr = librosa.load(filepath, sr=None, mono=True)

    duration_sec = float(librosa.get_duration(y=y, sr=sr))
    minutes = int(duration_sec // 60)
    seconds = int(duration_sec % 60)
    duration_str = f'{minutes}:{seconds:02d}'

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = round(float(np.atleast_1d(tempo)[0]), 1)

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    best_corr = -np.inf
    best_key = 'C major'
    for i in range(12):
        corr_major = np.corrcoef(chroma_mean, np.roll(MAJOR_PROFILE, i))[0, 1]
        if corr_major > best_corr:
            best_corr = corr_major
            best_key = f'{NOTE_NAMES[i]} major'
        corr_minor = np.corrcoef(chroma_mean, np.roll(MINOR_PROFILE, i))[0, 1]
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = f'{NOTE_NAMES[i]} minor'

    rms = librosa.feature.rms(y=y)
    energy = round(float(np.mean(rms)), 4)

    n_points = 1000
    chunk_size = max(1, len(y) // n_points)
    waveform = [
        round(float(np.max(np.abs(y[i * chunk_size:(i + 1) * chunk_size]))), 4)
        for i in range(n_points)
        if len(y[i * chunk_size:(i + 1) * chunk_size]) > 0
    ]

    return {
        'bpm':          bpm,
        'key':          best_key,
        'camelot':      KEY_TO_CAMELOT.get(best_key, ''),
        'openkey':      KEY_TO_OPENKEY.get(best_key, ''),
        'duration_sec': round(duration_sec, 2),
        'duration_str': duration_str,
        'energy':       energy,
        'waveform':     waveform,
    }


def write_tags(filepath: str, bpm: float, camelot: str) -> bool:
    ext = os.path.splitext(filepath)[1].lower()
    try:
        if ext == '.mp3':
            raw = ID3(filepath)
            raw['TBPM'] = TBPM(encoding=3, text=str(int(round(bpm))))
            raw['TKEY'] = TKEY(encoding=3, text=camelot)
            raw.save()
        elif ext == '.flac':
            audio = FLAC(filepath)
            audio['bpm'] = [str(int(round(bpm)))]
            audio['key'] = [camelot]
            audio.save()
        elif ext == '.m4a':
            audio = MP4(filepath)
            if audio.tags is None:
                audio.add_tags()
            audio.tags['tmpo'] = [int(round(bpm))]
            audio.save()
        else:
            return False
        return True
    except Exception:
        return False


def analyze_file(filepath: str, write_back: bool = False) -> dict:
    """Full pipeline: validate → read tags → analyze → optionally write back."""
    start_time = time.time()

    if not os.path.exists(filepath):
        return {'success': False, 'error': f'File not found: {filepath}', 'filepath': filepath}

    ext = os.path.splitext(filepath)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return {'success': False, 'error': f'Unsupported format: {ext}', 'filepath': filepath}

    file_size_mb = round(os.path.getsize(filepath) / (1024 * 1024), 2)
    existing_tags = read_existing_tags(filepath)

    try:
        analysis = analyze_audio(filepath)
    except Exception as e:
        return {
            'success':  False,
            'error':    f'Analysis failed: {str(e)}',
            'filepath': filepath,
            'tags':     existing_tags,
        }

    wrote_tags = False
    if write_back:
        wrote_tags = write_tags(filepath, analysis['bpm'], analysis['camelot'])

    elapsed = round(time.time() - start_time, 2)

    return {
        'success':      True,
        'filepath':     filepath,
        'filename':     os.path.basename(filepath),
        'file_size_mb': file_size_mb,
        'format':       ext.lstrip('.').upper(),
        'title':        existing_tags['title'] or os.path.splitext(os.path.basename(filepath))[0],
        'artist':       existing_tags['artist'],
        'album':        existing_tags['album'],
        'genre':        existing_tags['genre'],
        'track':        existing_tags['track'],
        'year':         existing_tags['year'],
        'remixer':      existing_tags['remixer'],
        'grouping':     existing_tags['grouping'],
        'composer':     existing_tags['composer'],
        'comment':      existing_tags['comment'],
        'label':        existing_tags['label'],
        'bpm':          analysis['bpm'],
        'key':          analysis['key'],
        'camelot':      analysis['camelot'],
        'openkey':      analysis['openkey'],
        'duration_sec': analysis['duration_sec'],
        'duration_str': analysis['duration_str'],
        'energy':       analysis['energy'],
        'waveform':     analysis['waveform'],
        'bpm_source':   'tag' if existing_tags['bpm_tag'] else 'analyzed',
        'key_source':   'tag' if existing_tags['key_tag'] else 'analyzed',
        'wrote_tags':   wrote_tags,
        'elapsed_sec':  elapsed,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Analyze an audio file for BPM, key, and metadata.')
    parser.add_argument('filepath', help='Path to the audio file')
    parser.add_argument('--write-back', action='store_true', help='Write BPM and key back to file tags')
    parsed = parser.parse_args()
    result = analyze_file(parsed.filepath, write_back=parsed.write_back)
    print(json.dumps(result))
