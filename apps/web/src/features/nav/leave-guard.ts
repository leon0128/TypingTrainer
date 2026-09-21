import { create } from 'zustand';

interface LeaveGuardState {
  /** What to ask before the header takes the player away from the screen; null asks nothing. */
  readonly message: string | null;
  set: (message: string | null) => void;
}

/**
 * A screen with something to lose (a run in progress) sets a message here, and the header asks it
 * before following a link or signing out.
 */
export const useLeaveGuard = create<LeaveGuardState>()((set) => ({
  message: null,
  set: (message) => {
    set({ message });
  },
}));
