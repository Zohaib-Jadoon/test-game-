export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  reward: string;
  target: number;
  metric: 'kills' | 'wave' | 'score';
  claimed: boolean;
}

export const INITIAL_CHALLENGES: DailyChallenge[] = [
  {
    id: 'daily-skirmish',
    title: 'Citadel Vanguard',
    description: 'Defeat 12 arena foes across any mode.',
    reward: '+500 Seasonal Glory & Obsidian Trim',
    target: 12,
    metric: 'kills',
    claimed: false,
  },
  {
    id: 'daily-wave',
    title: 'Storm the Spire',
    description: 'Reach Wave 3 in Solo or Local 2P Co-op.',
    reward: '+750 Seasonal Glory & Sunflare Trail',
    target: 3,
    metric: 'wave',
    claimed: false,
  },
  {
    id: 'season-master',
    title: 'Season IV: Golden Horizon',
    description: 'Achieve a single-run score of 2,500+.',
    reward: 'Astral Ronin Crest Badge',
    target: 2500,
    metric: 'score',
    claimed: false,
  },
];

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestPushNotifications(): Promise<{
  granted: boolean;
  permission: NotificationPermission | 'unsupported';
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { granted: false, permission: 'unsupported' };
  }
  const result = await Notification.requestPermission();
  return { granted: result === 'granted', permission: result };
}

export function sendLocalAlert(title: string, body: string): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  try {
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
    });
    return true;
  } catch {
    return false;
  }
}
