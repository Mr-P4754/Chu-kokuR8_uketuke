/**
 * オフラインキューおよびローカルデータ同期マネージャー (queue.js)
 */

class OfflineQueueManager {
  constructor() {
    this.queueKey = window.AppConfig?.offlineQueueKey || 'reception_offline_queue';
    this.cacheKey = window.AppConfig?.participantsCacheKey || 'reception_participants_cache';
    this.lastSyncKey = window.AppConfig?.lastSyncKey || 'reception_last_sync_time';
    this.isSyncing = false;
    this.listeners = new Set();

    // ネットワーク復帰時の自動同期リスナー
    window.addEventListener('online', () => {
      console.log('[QueueManager] ネットワークオンライン復帰を検知。キューの同期を開始します...');
      this.notifyStatusChange();
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      console.log('[QueueManager] ネットワークオフラインを検知。');
      this.notifyStatusChange();
    });
  }

  /**
   * 状態変化の購読リスナー登録
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 購読者への通知
   */
  notifyStatusChange() {
    const queue = this.getQueue();
    const isOnline = navigator.onLine;
    this.listeners.forEach((listener) => {
      try {
        listener({
          isOnline,
          queueCount: queue.length,
          isSyncing: this.isSyncing,
        });
      } catch (error) {
        console.error('[QueueManager] リスナー通知エラー:', error);
      }
    });
  }

  /**
   * 未送信キューの取得
   */
  getQueue() {
    try {
      const stored = localStorage.getItem(this.queueKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[QueueManager] キュー読み込みエラー:', error);
      return [];
    }
  }

  /**
   * 未送信キューの保存
   */
  saveQueue(queue) {
    try {
      localStorage.setItem(this.queueKey, JSON.stringify(queue));
      this.notifyStatusChange();
    } catch (error) {
      console.error('[QueueManager] キュー保存エラー:', error);
    }
  }

  /**
   * キューに更新タスクを追加（同一IDの未送信タスクがあればマージして最新化）
   */
  enqueueUpdate(payload) {
    const queue = this.getQueue();
    const existingIndex = queue.findIndex((item) => item.type === 'update' && item.payload.id === payload.id);

    if (existingIndex >= 0) {
      // 既存タスクにフラグをマージ
      queue[existingIndex].payload = {
        ...queue[existingIndex].payload,
        ...payload,
        queuedAt: new Date().toISOString(),
      };
    } else {
      queue.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        type: 'update',
        payload: {
          ...payload,
          queuedAt: new Date().toISOString(),
        },
      });
    }

    this.saveQueue(queue);
  }

  /**
   * 参加者一覧キャッシュの取得
   */
  getCachedParticipants() {
    try {
      const stored = localStorage.getItem(this.cacheKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('[QueueManager] キャッシュ読み込みエラー:', error);
      return null;
    }
  }

  /**
   * 参加者一覧キャッシュの保存
   */
  setCachedParticipants(participants) {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(participants));
      localStorage.setItem(this.lastSyncKey, new Date().toISOString());
    } catch (error) {
      console.error('[QueueManager] キャッシュ保存エラー:', error);
    }
  }

  /**
   * 最終同期日時の取得
   */
  getLastSyncTime() {
    return localStorage.getItem(this.lastSyncKey);
  }

  /**
   * キューに溜まった更新をバックエンドAPIへ順次送信
   */
  async processQueue() {
    if (this.isSyncing) return;
    const queue = this.getQueue();
    if (queue.length === 0) return;

    if (!navigator.onLine) {
      console.warn('[QueueManager] オフラインのためキュー送信をスキップします。');
      return;
    }

    this.isSyncing = true;
    this.notifyStatusChange();

    const baseUrl = window.AppConfig?.apiBaseUrl || '';
    const remainingQueue = [...queue];
    let successCount = 0;

    for (const item of queue) {
      if (item.type === 'update') {
        try {
          const response = await fetch(`${baseUrl}/api/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success) {
              // 成功したアイテムをキューから除外
              const targetIndex = remainingQueue.findIndex((target) => target.id === item.id);
              if (targetIndex >= 0) {
                remainingQueue.splice(targetIndex, 1);
                this.saveQueue(remainingQueue);
                successCount++;
              }
            }
          } else {
            console.error(`[QueueManager] API送信失敗 (${response.status}):`, item);
            break; // サーバーエラー等の場合は一時中断して次回へ
          }
        } catch (error) {
          console.error('[QueueManager] 通信例外:', error);
          break; // ネットワーク断等の場合は中断
        }
      }
    }

    this.isSyncing = false;
    this.notifyStatusChange();
    console.log(`[QueueManager] キュー同期完了: ${successCount}件送信成功 (残り: ${remainingQueue.length}件)`);
    return { successCount, remainingCount: remainingQueue.length };
  }
}

// グローバルインスタンスの生成
window.queueManager = new OfflineQueueManager();
