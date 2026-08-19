/**
 * アプリケーション共通設定
 */
const AppConfig = {
  // バックエンドAPIのベースURL
  apiBaseUrl: 'https://conference-reception-api.shouichiigi.workers.dev',

  // 簡易認証用キー（localStorage保存名）
  authStorageKey: 'reception_auth_token',

  // オフラインキューの保存キー
  offlineQueueKey: 'reception_offline_queue',

  // キャッシュされた参加者データの保存キー
  participantsCacheKey: 'reception_participants_cache',

  // 最終データ同期日時の保存キー
  lastSyncKey: 'reception_last_sync_time',
};

// グローバルスコープに公開
window.AppConfig = AppConfig;
