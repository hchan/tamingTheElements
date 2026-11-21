"""Per-species body-plan rig templates for the 12 roster24 heroes (plan: .scratch/roster24-crisp/r3a-plan.md). `build(landmarks)` picks the
template named by landmarks["plan"] and returns (spec, anim) for prep.py. Quadruped and serpent are implemented; fish, tentacle, bird and
mushroom land as their own modules (R3a items 3-4) and join PLANS."""
from . import quadruped, serpent
from .common import PlanError

PLANS = {"quadruped": quadruped.build, "serpent": serpent.build}
KINDS = ("quadruped", "serpent", "fish", "tentacle", "bird", "mushroom")
HERO_PLAN = {  # hero -> template (r3a-plan.md section 4)
    "kindrel": "quadruped", "brazgor": "quadruped", "ouroth": "serpent", "nykra": "quadruped", "glimmaw": "fish", "abyssor": "tentacle",
    "quarrak": "quadruped", "durrok": "quadruped", "umbrel": "mushroom", "hyalia": "tentacle", "zephra": "quadruped", "vortigal": "bird",
}


def build(landmarks):
    plan = landmarks.get("plan")
    if plan not in PLANS:
        raise PlanError(f"unknown or not yet implemented plan {plan!r} (have: {', '.join(sorted(PLANS))})")
    return PLANS[plan](landmarks)
