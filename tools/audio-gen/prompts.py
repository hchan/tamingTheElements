"""Prompts for the pilot cues. Ids are `<element>_<kind>`; the files are public/assets/audio/sfx_<id>.ogg.

Brief (owner, art direction): grim, desaturated, textured, never cartoony: no bloops, zaps, chimes, sparkles or music.
`target` is the spectral centroid range (Hz) the finished clip should land in, used only to rank the seeds."""
from __future__ import annotations

NEG = 'music, melody, voice, speech, cartoon, chime, bell, sparkle, laser, retro game, 8-bit, silence, reverb tail, echo'

CUES = [
    # Hits: short, dry, punchy impacts, 0.5 to 0.8 s.
    dict(id='water_hit', seconds=0.8, centroid=(500, 3500), prompt='A heavy wet impact: a cold slap of dark water against stone, '
         'dense, gritty, close microphone, dry, no reverb', negative=NEG),
    dict(id='fire_hit', seconds=0.8, centroid=(800, 4500), prompt='A violent fire impact: a dull burning thump with crackling embers '
         'and scorching hiss, gritty, harsh, close microphone, dry', negative=NEG),
    dict(id='air_hit', seconds=0.8, centroid=(1500, 6000), prompt='A sharp slicing wind strike: a hard whipping blast of air with '
         'dry rasping texture, thin and brutal, close microphone, dry', negative=NEG),
    dict(id='earth_hit', seconds=0.8, centroid=(150, 2500), prompt='A deep crushing rock impact: a heavy stone thud with grinding '
         'gravel and a low rumble, gritty, dry, close microphone', negative=NEG),
    # Cleanses: a purge, slightly longer (up to about 1.3 s), still textured and unmusical.
    dict(id='water_cleanse', seconds=1.2, centroid=(600, 5000), prompt='A cold rush of dark water washing over a body, a heavy wet '
         'sluice and drain, murky, gritty, no music, dry', negative=NEG),
    dict(id='fire_cleanse', seconds=1.2, centroid=(800, 5000), prompt='Something burning away: a rough flaring whoosh of flame that '
         'crackles and dies to embers, scorched, harsh, no music, dry', negative=NEG),
    dict(id='earth_cleanse', seconds=1.2, centroid=(150, 3000), prompt='Dry earth cracking apart: a sharp stone fracture then '
         'crumbling dirt and gravel falling, heavy, dusty, no music, dry', negative=NEG),
    dict(id='air_cleanse', seconds=1.2, centroid=(1200, 6500), prompt='A hard gust of wind tearing through a cold hollow: a rushing '
         'howl that scatters and fades, rasping, airy, no music, dry', negative=NEG),
]
