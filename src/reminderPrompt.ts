// Permission is requested only by the visible button, never by this startup check.
export async function shouldShowReminderPrompt(options: {
  supported: boolean;
  needsInstall: boolean;
  permission: string;
  signedIn: boolean;
  pendingOptIn: boolean;
  dismissed: boolean;
  enable: () => Promise<unknown>;
  readState: () => Promise<{ enabled: boolean }>;
  getSubscription: () => Promise<unknown>;
}) {
  if (!options.signedIn) return false;
  try {
    if (options.signedIn && options.permission === 'granted' && options.pendingOptIn) {
      await options.enable();
      return false;
    }
    if (options.dismissed) return false;
    if (options.needsInstall || !options.supported || options.permission !== 'granted') return true;
    if (options.signedIn) return !(await options.readState()).enabled;
    return !(await options.getSubscription());
  } catch {
    // Offline does not establish that a configured device needs another prompt.
    return false;
  }
}
