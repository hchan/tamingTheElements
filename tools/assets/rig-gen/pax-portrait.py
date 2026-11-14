"""Moved: the map strips are now built by tools/assets/portrait-rig/map-strips.py (manifest rects, any frame size). Kept as a shim."""
import os, runpy, sys
sys.argv[0] = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "portrait-rig", "map-strips.py")
runpy.run_path(sys.argv[0], run_name="__main__")
