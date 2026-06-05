import { SetMetadata } from '@nestjs/common';
import { Capability } from './capability-matrix';

export const REQUIRE_CAPABILITY_KEY = 'requireCapability';

/**
 * Declares the capability a resolver/mutation requires. PermissionsGuard (T026) reads this and
 * enforces it against the caller's membership role.
 *
 * Usage: `@RequireCapability(Capability.INVITE_MEMBER)`
 */
export const RequireCapability = (capability: Capability): MethodDecorator =>
  SetMetadata(REQUIRE_CAPABILITY_KEY, capability);
