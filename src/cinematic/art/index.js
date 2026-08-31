/* ===== cinematic/art/index.js — public CINE_ART barrel =====
   Procedural 2D vector art library for the SKYFALL INTERCEPTOR
   cinematic intro. No images, no libraries. Everything is shaded with
   gradients + facets so the objects read as machines with volume, not
   flat silhouettes.

   Public API (ctx is always arg 0, all state is save/restore'd):
     rocket   (c, x, y, s, rot, thrust, tt)
     warship  (c, x, y, s, alpha, charge, tt)  -> { tips:[[x,y],[x,y]] }
     jet      (c, x, y, s, rot, thrust, tint)
     pilot    (c, x, y, s, opts)               seated aircrew, 3rd person
     cockpit  (c, tt, boot, sealed)            absolute 1600x900
     silo     (c, x, y, w, open, glowCol)
     cloudBank(c, y, h, tt, tint, alpha)
     waspSwarm(c, x, y, w, h, tt, alpha, dir, scale)
     leviathan(c, x, y, s, alpha, tt) */
import { rocket } from './rocket.js';
import { warship } from './warship.js';
import { jet } from './jet.js';
import { pilot } from './pilot.js';
import { silo } from './silo.js';
import { cockpit } from './cockpit.js';
import { cloudBank, crowd } from './atmosphere.js';
import { waspSwarm, leviathan } from './bio.js';

export const CINE_ART = {
  rocket: rocket, warship: warship, jet: jet, pilot: pilot,
  cockpit: cockpit, silo: silo, cloudBank: cloudBank, crowd: crowd,
  waspSwarm: waspSwarm, leviathan: leviathan
};

