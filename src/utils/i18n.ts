export type Locale = 'en' | 'es' | 'ja' | 'fr';

export interface Translations {
  subtitle: string;
  startBattle: string;
  soloMode: string;
  coopMode: string;
  duelMode: string;
  openHub: string;
  blenderForge: string;
  controlsHintSolo: string;
  controlsHint2P: string;
  wave: string;
  score: string;
  combo: string;
  best: string;
  kills: string;
  paused: string;
  resume: string;
  restart: string;
  returnTitle: string;
  victory: string;
  defeat: string;
  playAgain: string;
  tryAgain: string;
  offlineBanner: string;
  tabLeaderboard: string;
  tabForge: string;
  tabSocial: string;
  tabCloud: string;
  tabAi: string;
  tabDocs: string;
  searchPlaceholder: string;
  signInGoogle: string;
  signOut: string;
  syncNow: string;
  backupNow: string;
  installApp: string;
  darkMode: string;
  lightMode: string;
}

const EN: Translations = {
  subtitle: 'Sunlit Citadel 3D Action Arena',
  startBattle: 'ENTER ARENA',
  soloMode: 'Solo Survival',
  coopMode: 'Local 2P Co-op',
  duelMode: 'Local 2P Duel',
  openHub: 'Citadel Hub',
  blenderForge: 'Blender 3D Forge',
  controlsHintSolo: 'WASD Walk · Shift Sprint · Space Jump · Mouse Look · Click Attack · Right-Click Dash · Q/K Nova · V Camera',
  controlsHint2P: 'P1: WASD + Space + J · P2: Arrows + Shift + Enter · P Pause',
  wave: 'WAVE',
  score: 'SCORE',
  combo: 'COMBO',
  best: 'BEST',
  kills: 'KO',
  paused: 'ARENA PAUSED',
  resume: 'Resume Battle',
  restart: 'Restart Run',
  returnTitle: 'Title Screen',
  victory: 'CITADEL CONQUERED',
  defeat: 'VANGUARD FALLEN',
  playAgain: 'Play Again',
  tryAgain: 'Try Again',
  offlineBanner: 'Offline Mode — Local progress queued for cloud sync',
  tabLeaderboard: 'Leaderboards',
  tabForge: 'Blender Forge',
  tabSocial: 'Social & E2EE',
  tabCloud: 'Cloud & Security',
  tabAi: 'AI Strategist',
  tabDocs: 'Docs & Monitor',
  searchPlaceholder: 'Search players, friends, rigs, or docs...',
  signInGoogle: 'Sign in with Google',
  signOut: 'Sign Out',
  syncNow: 'Sync Cross-Platform Save',
  backupNow: 'Create Cloud Backup',
  installApp: 'Install App',
  darkMode: 'Dark Mode',
  lightMode: 'Daylight Mode',
};

const ES: Translations = {
  subtitle: 'Arena de Acción 3D en la Ciudadela Solar',
  startBattle: 'ENTRAR A LA ARENA',
  soloMode: 'Supervivencia Solo',
  coopMode: 'Co-op Local 2J',
  duelMode: 'Duelo Local 2J',
  openHub: 'Centro Ciudadela',
  blenderForge: 'Forja Blender 3D',
  controlsHintSolo: 'WASD Caminar · Shift Correr · Espacio Saltar · Ratón Mirar · Clic Atacar · E Impulso · Q/K Nova · V Cámara',
  controlsHint2P: 'J1: WASD + Espacio + J · J2: Flechas + Shift + Enter · P Pausa',
  wave: 'OLEADA',
  score: 'PUNTOS',
  combo: 'COMBO',
  best: 'RÉCORD',
  kills: 'BAJAS',
  paused: 'ARENA EN PAUSA',
  resume: 'Reanudar Batalla',
  restart: 'Reiniciar Partida',
  returnTitle: 'Pantalla de Título',
  victory: 'CIUDADELA CONQUISTADA',
  defeat: 'VANGUARDIA CAÍDA',
  playAgain: 'Jugar de Nuevo',
  tryAgain: 'Intentar de Nuevo',
  offlineBanner: 'Modo Sin Conexión — Progreso en cola para sincronizar',
  tabLeaderboard: 'Clasificación',
  tabForge: 'Forja Blender',
  tabSocial: 'Social y E2EE',
  tabCloud: 'Nube y Seguridad',
  tabAi: 'Estratega IA',
  tabDocs: 'Docs y Monitor',
  searchPlaceholder: 'Buscar jugadores, amigos, modelos o guías...',
  signInGoogle: 'Iniciar con Google',
  signOut: 'Cerrar Sesión',
  syncNow: 'Sincronizar Partida',
  backupNow: 'Crear Respaldo en Nube',
  installApp: 'Instalar App',
  darkMode: 'Modo Oscuro',
  lightMode: 'Modo Claro',
};

const JA: Translations = {
  subtitle: '天空城塞 3D アクションアリーナ',
  startBattle: 'アリーナ出撃',
  soloMode: 'ソロサバイバル',
  coopMode: 'ローカル2人協力',
  duelMode: 'ローカル2人対戦',
  openHub: 'シタデルハブ',
  blenderForge: 'Blender 3D工房',
  controlsHintSolo: 'WASD 移動 · Shift ダッシュ走 · Space ジャンプ · マウス視点 · クリック攻撃 · 右クリック回避 · Q/K ノヴァ · V 視点切替',
  controlsHint2P: 'P1: WASD+Space+J · P2: 矢印+Shift+Enter · P 一時停止',
  wave: 'ウェーブ',
  score: 'スコア',
  combo: 'コンボ',
  best: 'ベスト',
  kills: '撃破',
  paused: '一時停止中',
  resume: '戦闘を再開',
  restart: 'リスタート',
  returnTitle: 'タイトルへ',
  victory: '天空城塞 制覇',
  defeat: '戦闘不能',
  playAgain: 'もう一度プレイ',
  tryAgain: '再挑戦',
  offlineBanner: 'オフラインモード — 進行状況は接続復帰時に同期されます',
  tabLeaderboard: 'ランキング',
  tabForge: 'Blender工房',
  tabSocial: 'フレンド・暗号チャット',
  tabCloud: 'クラウド・セキュリティ',
  tabAi: 'AI戦術参謀',
  tabDocs: '開発ドキュメント',
  searchPlaceholder: 'プレイヤー、フレンド、リグ、ドキュメントを検索...',
  signInGoogle: 'Googleでログイン',
  signOut: 'ログアウト',
  syncNow: 'クロスプラットフォーム同期',
  backupNow: 'クラウドバックアップ作成',
  installApp: 'アプリをインストール',
  darkMode: 'ダークモード',
  lightMode: 'ライトモード',
};

const FR: Translations = {
  subtitle: 'Arène d’Action 3D de la Citadelle Solaire',
  startBattle: 'ENTRER DANS L’ARÈNE',
  soloMode: 'Survie Solo',
  coopMode: 'Co-op Local 2J',
  duelMode: 'Duel Local 2J',
  openHub: 'Hub Citadelle',
  blenderForge: 'Forge Blender 3D',
  controlsHintSolo: 'WASD Marcher · Shift Sprint · Espace Sauter · Souris Regarder · Clic Attaquer · E Dash · Q/K Nova · V Caméra',
  controlsHint2P: 'J1: WASD + Espace + J · J2: Flèches + Shift + Entrée · P Pause',
  wave: 'VAGUE',
  score: 'SCORE',
  combo: 'COMBO',
  best: 'RECORD',
  kills: 'K.O.',
  paused: 'ARÈNE EN PAUSE',
  resume: 'Reprendre le Combat',
  restart: 'Recommencer',
  returnTitle: 'Écran Titre',
  victory: 'CITADELLE CONQUISE',
  defeat: 'VANGUARD VAINCU',
  playAgain: 'Rejouer',
  tryAgain: 'Réessayer',
  offlineBanner: 'Mode Hors Ligne — Progression mise en file d’attente',
  tabLeaderboard: 'Classements',
  tabForge: 'Forge Blender',
  tabSocial: 'Social & E2EE',
  tabCloud: 'Cloud & Sécurité',
  tabAi: 'Stratège IA',
  tabDocs: 'Docs & Moniteur',
  searchPlaceholder: 'Rechercher joueurs, amis, modèles ou docs...',
  signInGoogle: 'Connexion Google',
  signOut: 'Déconnexion',
  syncNow: 'Synchroniser Sauvegarde',
  backupNow: 'Créer Sauvegarde Cloud',
  installApp: 'Installer l’App',
  darkMode: 'Mode Sombre',
  lightMode: 'Mode Clair',
};

export const TRANSLATIONS: Record<Locale, Translations> = {
  en: EN,
  es: ES,
  ja: JA,
  fr: FR,
};

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  ja: '日本語',
  fr: 'Français',
};
