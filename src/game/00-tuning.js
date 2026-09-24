// =====================================================================================================
// TUNING — primary gameplay, pacing, camera, effects, and world controls. Renderer geometry also has local constants.
// Units: meters, seconds, radians unless noted. "power" = the largest object size (m) the tornado can eat.
// =====================================================================================================
const TUNING = {
  // ---- Growth / absorb ladder ----
  START_POWER: 0.62,          // m. Largest object size absorbable at the start (leaves 0.35, paper 0.4, trash 0.6).
  GROWTH: 0.11,              // Playtest 2: 'bigger faster' -- twice again.             // Fractional power gain from absorbing an object as big as the current power.
  DUST_FRAC: 0.45,            // Objects smaller than this fraction of power are 'dust': swept up quietly, no growth beat.
  DUST_GROWTH: 0.0,          // Fractional power gain per dust object (0: crumbs do not feed growth).
  TIER_THRESHOLDS: [1.0, 2.4, 6.5, 12.5, 24.0], // Town: power needed to enter tier 2,3,4,5,6 (tier 6 = water tower).
  SPACE_THRESHOLDS: [60, 125, 210, 330, 900],   // Space: moons, Earth/Venus, ice giants, gas giants, the Sun.
  SPACE_START_POWER: 24,     // Power on arrival in space (continues from the tower).
  SPACE_RADIUS: 2600,        // Game units: static pickup field; planet orbits extend beyond it.
  SPACE_SCATTER: { rock_s: 2600, rock_m: 1800, rock_l: 900, satellite: 320, rocket: 260, comet: 200, station: 90, pluto: 40, moon: 48, bigmoon: 26, icemoon: 26, gasdwarf: 12, giant: 16, dwarfstar: 8 },
  SPACE_SPEED_MULT: 8,       // Space is ~10x the town's scale; the tornado moves this much faster there.
  SPACE_GROWTH_MULT: 1.25,   // Growth per absorb in space (on top of GROWTH).
  SPACE_START_KIT: { rock_s: 20, rock_m: 12, satellite: 5, rocket: 4 },
  SUN_POS: [0, -1100],       // Center of the compressed, playable solar system.
  // ---- Galaxy stage (after the Sun). Same size ladder as the solar system so the camera, speed and pacing carry over. ----
  GALAXY_THRESHOLDS: [60, 125, 210, 330, 900],
  GALAXY_START_POWER: 24, GALAXY_RADIUS: 2600,
  GALAXY_SCATTER: { g_rogue: 2600, g_browndwarf: 1800, g_reddwarf: 900, g_iceworld: 320, g_wisp: 260, g_whitedwarf: 200, g_yellowstar: 90, g_orangestar: 40, g_bluestar: 48, g_orangegiant: 26, g_redgiant: 14, g_cluster: 12, g_nebula: 26, g_supergiant: 8, g_pulsar: 6, g_bigcluster: 12, g_bluesuper: 6, g_bignebula: 6, g_supernova: 6, g_globular: 8, g_minihole: 5, g_hypergiant: 8 },
  GALAXY_LANDMARKS: [['g_bluestar', 190, -230], ['g_orangegiant', 340, -170], ['g_redgiant', -520, -380], ['g_cluster', 480, -520], ['g_nebula', -260, -900], ['g_supergiant', 900, -1100], ['g_pulsar', -1000, -1250], ['g_bignebula', -600, -1700], ['g_bluesuper', 700, -1650], ['g_hypergiant', -300, -1500]], // the next 'too big' thing is always somewhere on the way to the core
  GALAXY_START_KIT: { g_rogue: 20, g_browndwarf: 12, g_iceworld: 5, g_wisp: 4 },
  GALAXY_CORE_POS: [0, -2100],   // The galactic core is the last thing in the galaxy.
  // ---- Universe stage (after the galactic core). ----
  UNIVERSE_THRESHOLDS: [60, 125, 210, 330, 900],
  UNIVERSE_START_POWER: 24, UNIVERSE_RADIUS: 2600,
  UNIVERSE_SCATTER: { u_speck: 2600, u_dwarf: 1800, u_irregular: 320, u_lenticular: 260, u_smallspiral: 900, u_ringgal: 200, u_barred: 90, u_bulge: 40, u_spiral: 48, u_elliptical: 26, u_bigirregular: 14, u_pair: 12, u_bigspiral: 26, u_giantell: 8, u_quasar: 6, u_group: 12, u_bigquasar: 6, u_giantspiral: 6, u_cluster: 6, u_supercluster: 8, u_wall: 5, u_attractor: 8 },
  UNIVERSE_LANDMARKS: [['u_spiral', 190, -230], ['u_elliptical', 340, -170], ['u_bigirregular', -520, -380], ['u_pair', 480, -520], ['u_bigspiral', -260, -900], ['u_giantell', 900, -1100], ['u_quasar', -1000, -1250], ['u_giantspiral', -600, -1700], ['u_bigquasar', 700, -1650], ['u_attractor', -300, -1500]],
  UNIVERSE_START_KIT: { u_speck: 20, u_dwarf: 12, u_irregular: 5, u_lenticular: 4 },
  EVERYTHING_POS: [0, -2100],    // Everything there is: the last thing in the universe.
  // ---- Black hole (the tornado's form once it leaves Earth) ----
  BH_CORE: 0.9,              // Core radius = funnel radius * this.
  BH_Y: 1.2,                 // Core height above the plane = funnel radius * this.
  BH_DISK: 3.4,              // Accretion disk outer radius = funnel radius * this.
  BH_TRANSFORM_S: 1.4,       // Seconds the tornado takes to collapse into the black hole on liftoff.
  // ---- Finale: dive into the black hole, out the other side, a new universe, back on Earth ----
  FINALE_ZOOM_S: 3.2,        // Seconds the camera takes to fall into the core.
  FINALE_DARK_S: 0.7,        // Seconds of black.
  FINALE_FLASH_S: 1.6,       // Seconds for the white of the new universe to clear.
  // ---- Level clock (Ben, 2026-09-24): a max time per level so nobody gets bored. It only ever helps: at
  // SUPER_SIZE_AT_S seconds left the player grows to the level's biggest size, and at 0 the goal flies in.
  // Seconds per level for each start-screen setting. 'space' covers solar, galaxy and universe.
  LEVEL_TIMERS: { quick: { town: 45, space: 30 }, normal: { town: 90, space: 60 }, adult: { town: 300, space: 300 } },
  LEVEL_TIMER_DEFAULT: 'normal',
  // ---- Discovery worlds: every trip through the black hole lands in a town with one new kind of thing in it. ----
  // Scatter counts per theme type (whole plain). Trip 6 and later mix every theme at THEME_MIX_SCALE of these counts.
  THEME_ORDER: ['animals', 'dinos', 'candy', 'snow', 'castle'],
  THEMES: {
    animals: { name: 'Animal Farm', icon: '🐄', ground: null, scatter: { chick: 360, puppy: 120, sheep: 110, pig: 40, cow: 34, horse: 26, elephant: 16, giraffe: 14 } },
    dinos:   { name: 'Dino Valley', icon: '🦖', ground: null, scatter: { dinoegg: 360, babydino: 220, raptor: 90, stego: 30, trex: 8, bronto: 6 } },
    candy:   { name: 'Candy Town', icon: '🍭', ground: 'candy', scatter: { gumdrop: 360, lollipop: 220, cupcake: 55, donut: 40, candycane: 30, gingerhouse: 12 } },
    snow:    { name: 'Snow Town', icon: '⛄', ground: 'snow', scatter: { snowball: 380, penguin: 220, snowman: 95, igloo: 30, icecastle: 10 } },
    castle:  { name: 'Castle Town', icon: '🏰', ground: null, scatter: { helmet: 360, knight: 220, catapult: 90, dragon: 28, castle: 10 } },
  },
  THEME_MIX: { name: 'Everything Town', icon: '🌈' },
  THEME_MIX_SCALE: 0.45,
  SUPER_SIZE_AT_S: 10,       // Seconds left on the level clock when the player becomes the biggest size.
  SUPER_GROW_S: 1.0,         // Seconds the super-size grow takes (log-space ease, so it reads as one big whoosh).
  TIMEOUT_PULL_S: 1.8,       // Seconds the goal takes to fly in when the clock reaches 0.
  SPIN: 2.6,                 // Playtest 1: 'twirl really fast'. Multiplies funnel twist and debris orbit speed.
  COLORS: { blue: 0x3a86ff, teal: 0x2ec4b6, purple: 0x8b5cf6, pink: 0xff5fa2, red: 0xe63946 }, // Start discs.
  COLOR_MIX: 0.6,            // How strongly the chosen color tints the dust funnel (0 = plain dust).
  TIER_GROWTH_MULT: [0.78, 1.35, 1.35, 1.0, 1.0, 1.0], // 'object mass' per tier: scales GROWTH while in that tier (paces time between tier-ups).
  SIZE_JITTER: 0.10,         // +/- per-instance size variation (fraction).

  // ---- Tornado geometry / reach ----
  FUNNEL_RADIUS: 0.55,       // Funnel base radius = power * this.
  FUNNEL_HEIGHT: 11,         // Funnel height = funnel radius * this.
  PULL_RADIUS: 1.9,          // Absorb reach = funnel radius * this + object footprint radius.
  RATTLE_RADIUS: 1.9,        // Reach at which a too-big non-solid object rattles ("not yet") = funnel radius * this + footprint.
  RATTLE_SOLID_MARGIN: 1.0,
  WIND_RADIUS: 12.0,          // Objects within funnel radius * this + footprint sway in the wind (visual/audio only).
  SWAY_COOLDOWN_S: 2.5, // Solid too-big objects rattle only on an actual bump: block radius * this.
  BLOCK_RADIUS: 0.9,         // Solid too-big objects push the tornado out at funnel radius * this + footprint.
  RATTLE_COOLDOWN_S: 1.0,    // Minimum seconds between rattles of the same object (rattles fire on approach, not while parked).
  STUCK_S: 0.8,             // Seconds of being pinned by solid objects before the tornado squeezes through them.
  SQUEEZE_S: 1.5,            // Seconds the squeeze-through lasts.

  // ---- Movement (chase-the-finger model) ----
  MAX_SPEED: 10.0,           // Playtest 2: 'speed it up 2x'.             // m/s at start; scales with camera distance so screen-speed feels constant.
  ACCEL: 60,                 // m/s^2 at start; scales like MAX_SPEED.
  TURN_RATE: 4.0,            // rad/s the heading may rotate at full speed.
  TURN_SNAP: 4.0,            // Extra turn-rate multiplier when nearly stopped (a slow tornado pivots on the spot).
  CARVE: 0.7,                // Fraction of target speed bled off in a full U-turn (weight in the turn).
  DECEL: 80,                 // m/s^2 braking at start; scales like ACCEL.
  ARRIVE_DIST: 1.2,          // m. Inside this distance of the finger the tornado eases to a stop.
  DRAG: 3.5,                 // 1/s velocity decay when the finger is lifted.
  SPEED_SCALE_EXP: 0.36,      // speed *= (camDist / camDist0) ^ this.
  IDLE_SPEED: 0.5,           // m/s below which the tornado counts as idle (feedback-gap accounting only).

  // ---- Camera ----
  CAM_DIST0: 10,             // m. Camera distance at power 0 ...
  CAM_DIST_K: 11,           // ... plus power * this.
  CAM_PITCH: 52 * Math.PI / 180, // Angle below horizontal.
  CAM_PITCH_MIN: 34 * Math.PI / 180, // Pitch eases toward this as the tornado grows (reveals the horizon).
  CAM_FORWARD: 0.22,         // Look-target shift north (fraction of distance) so the tornado sits low on screen.
  CAM_LOOK_AHEAD: 0.10,      // Look-target shift toward velocity (fraction of distance).
  CAM_SMOOTH: 3.5,           // 1/s exponential smoothing of distance and look target.
  FOV: 50,                   // degrees.
  FOV_PUNCH: 9,              // degrees added on tier-up, decays.
  FOV_PUNCH_DECAY: 3.0,      // 1/s.
  FOG_NEAR_K: 2.2, FOG_FAR_K: 6.5, // fog distances = camDist * k.

  // ---- Juice ----
  SHAKE_K: 0.35,             // Shake amplitude = camDist * this * (objectSize/power)^1.5 (capped by SHAKE_MAX).
  SHAKE_MAX: 0.06,           // Cap as a fraction of camDist.
  SHAKE_DECAY: 6.0,          // 1/s.
  HITSTOP_TICKS: 3,          // Frames frozen on a large absorb (2-4).
  HITSTOP_MIN_FRAC: 0.55,    // objectSize/power at or above which an absorb is "large".
  SLOWMO_SCALE: 0.28,        // Time scale during the first absorb of a new tier.
  SLOWMO_S: 0.55,            // Seconds of slow-mo (real time).
  SPIRAL_S: 0.35,             // Seconds an object takes to spiral into the funnel (small objects).
  SPIRAL_S_BIG: 0.9,         // Seconds for objects near the current power.
  ANCHOR_FRAC: 0.45,         // While pulling in something at least this fraction of power, the tornado digs in ...
  ANCHOR_SPEED: 0.3,         // ... and its top speed drops to this fraction (weight; also paces dense areas).
  SPIRAL_ANTICIPATION: 0.3,  // First fraction of the spiral where the object lifts and shakes before moving in.
  DUST_PUFF_M: 6.0,          // Meters travelled between ground dust puffs (visual feedback while cruising).
  DUST_PUFF_S: 0.7,          // ... or at least one puff every this many seconds while moving.
  DEBRIS_RING_N: 220,        // Debris chips orbiting the funnel.
  PARTICLE_POOL: 900,        // Max simultaneous burst particles.
  HIGHLIGHT_S: 2.0,          // Seconds newly-edible objects bob after a tier-up.

  // ---- World ----
  WORLD_RADIUS: 460,         // m. Populated radius. No walls; beyond this it is empty plain.
  ROAD_SPACING: 160,         // m between roads (grid through the origin).
  ROAD_WIDTH: 7,
  LOT_SPACING: 34,           // m between house lots along roads.
  LOT_CHANCE: 0.15,          // Chance a lot has a house.
  YARD_LEAVES: 5,            // Leaves per road-lot yard.
  FIELD_TREE_CLUMPS: 1,      // Tree clumps per field block.
  // Uniform scatter over the whole plain (counts). Spacing per tier is tuned so ~3 s of travel separates meals.
  SCATTER: { leaf: 2600, paper: 400, trash: 300, chair: 1600, can: 1000, mailbox: 350, fence: 300, table: 240, dumpster: 200, tramp: 200, shed: 330, car: 460, boat: 220, rv: 120, bus: 100, pine: 100, tree: 190, house: 36, bighouse: 24, barn: 24, silo: 22, church: 12, elevator: 18 },
  START_YARD: { leaf: 22, paper: 6, trash: 4, chair: 10, can: 6, mailbox: 3 }, // Playtest 1: the first minute felt slow to pick anything up. // Rich "backyard" around the start: all too big except leaves/paper.
  START_YARD_R: 42,
  START_POS: [22, 24],       // x, z of the start (a front lawn near the central crossroads).
  TOWER_POS: [46, -330],     // Water tower position (north of the start; "north" is up the screen).

  // ---- Audio ----
  MASTER_GAIN: 0.7,
  MUSIC_GAIN: 0.07,          // Background tune, well under the effects.
  HUM_GAIN: 0.09,            // Black-hole drone in space.
  WIND_GAIN_MIN: 0.10, WIND_GAIN_MAX: 0.45,
  WIND_CUTOFF_MAX: 700, WIND_CUTOFF_MIN: 80, // Hz. Rumble deepens as power grows.

  // ---- Render ----
  MAX_DPR: 2,
  SHADOW_MAP: 2048,
  SHADOW_TIERS_MIN: 2,       // Object tiers >= this cast shadows (leaves/paper do not).
  ANTIALIAS: true,

  // ---- Bot (self-test only) ----
  BOT_LEAD: 2.0,             // Bot holds the "finger" this many pull-radii past the target.
  BOT_TIER_PREF_RANGE: 1.6,  // x camera distance. Prefer current-tier food within this range; else nearest edible anything.
  BOT_CURIOSITY_S: 14,        // Every N seconds the bot tries the nearest too-big thing on screen (a child does).
  BOT_CURIOSITY_MAX_S: 6,   // ... capped here; the allowance is the travel time to it plus 1 s.    // ... for at most this long.
  BOT_RETARGET_TICKS: 6,     // Re-choose target every N ticks (a finger does not jitter every frame).
  BOT_SWITCH_RATIO: 0.6,     // A new target must score this much better before the bot abandons the current one.
  BOT_CROWD: 0.12,           // Per-neighbour bonus when choosing between near-equal targets (go where the food is).
  BOT_GRUDGE: 0.4,           // Distance multiplier for things that once blocked the bot (a child remembers the car she could not eat).
  BOT_GIVEUP_TICKS: 180,     // Give up on a target after this many ticks (3 s) without getting closer; ignore it for 30 s.
};

const DT = 1 / 60;
const TAU = Math.PI * 2;

