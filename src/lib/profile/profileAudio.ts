/** Aynı anda tek profil şarkısı çalsın diye basit kayıt. */
let stopCurrent: (() => void) | null = null;

export function claimProfileAudio(stop: () => void) {
  if (stopCurrent && stopCurrent !== stop) stopCurrent();
  stopCurrent = stop;
}

export function releaseProfileAudio(stop: () => void) {
  if (stopCurrent === stop) stopCurrent = null;
}

export function stopProfileAudio() {
  stopCurrent?.();
}
