export interface ProfileAvatarTransitionDetail {
  rect: { left: number; top: number; width: number; height: number };
  src?: string;
  destination?: 'profile' | 'home';
}

export const navigateWithProfileAvatarTransition = (
  source: Element,
  src: string | undefined,
  navigate: () => void,
  destination: ProfileAvatarTransitionDetail['destination'] = 'profile',
) => {
  const rect = source.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    navigate();
    return;
  }
  window.dispatchEvent(new CustomEvent<ProfileAvatarTransitionDetail>('jzone:profile-avatar-transition', {
    detail: {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      src,
      destination,
    },
  }));
  window.requestAnimationFrame(navigate);
};
