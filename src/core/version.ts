/**
 * Version of the simulation and of the hash definition, recorded in every replay header. Bump it with any change that
 * alters a hash for the same setup and commands, and re-record the goldens (docs/DETERMINISM.md).
 *
 * 2: agent RNG streams left SimState (rng holds the five sim streams); world flag bits follow FLAG_NAMES with the
 *    internal bits at 16+.
 */
export const SIM_VERSION = 2;
