/**
 * 受付用UI (index.html) メインアプリケーションスクリプト (app.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  // モーダル表示中の参加者IDを保持する状態変数
  let currentModalParticipantId = null;

  // 状態管理ステート
  const state = {
    participants: [], // 全参加者データ
    filteredList: [], // 検索・フィルター適用後データ
    currentTab: 'search', // 'search' | 'list'
    currentFilter: 'all', // 'all' | 'unregistered' | 'registered' | 'walkin' | 'bento_pending' | 'fee_pending'
    searchQuery: '', // 検索文字列
    selectedParticipant: null, // モーダルで選択中の参加者
    isAuthenticated: false, // 簡易認証フラグ
    isFetching: false, // データ取得中フラグ
    isUpdatingStatus: false, // ステータス更新中フラグ（連打防止・排他制御用）
  };

  // DOM要素の取得
  const elements = {
    // 認証関連
    authModal: document.getElementById('authModal'),
    authPasswordInput: document.getElementById('authPasswordInput'),
    authSubmitButton: document.getElementById('authSubmitButton'),
    authErrorText: document.getElementById('authErrorText'),

    // ヘッダー & 同期
    syncButton: document.getElementById('syncButton'),
    syncSpinner: document.getElementById('syncSpinner'),
    lastSyncText: document.getElementById('lastSyncText'),
    offlineBanner: document.getElementById('offlineBanner'),
    queueCountBadge: document.getElementById('queueCountBadge'),
    onlineStatusDot: document.getElementById('onlineStatusDot'),
    onlineStatusText: document.getElementById('onlineStatusText'),

    // 統計カウンター
    statTotal: document.getElementById('statTotal'),
    statCheckedIn: document.getElementById('statCheckedIn'),
    statCheckedInPercent: document.getElementById('statCheckedInPercent'),
    statBento: document.getElementById('statBento'),
    statFee: document.getElementById('statFee'),
    statWalkin: document.getElementById('statWalkin'),

    // タブ
    tabSearch: document.getElementById('tabSearch'),
    tabList: document.getElementById('tabList'),
    searchSection: document.getElementById('searchSection'),
    listSection: document.getElementById('listSection'),

    // 検索・一覧コントロール
    searchInput: document.getElementById('searchInput'),
    clearSearchButton: document.getElementById('clearSearchButton'),
    searchResultsContainer: document.getElementById('searchResultsContainer'),
    searchResultCount: document.getElementById('searchResultCount'),
    
    // 一覧フィルター & リスト
    filterButtons: document.querySelectorAll('.filter-btn'),
    listResultsContainer: document.getElementById('listResultsContainer'),
    listResultCount: document.getElementById('listResultCount'),

    // 詳細モーダル
    detailModal: document.getElementById('detailModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalContent: document.getElementById('modalContent'),
    modalCloseButton: document.getElementById('modalCloseButton'),
    modalName: document.getElementById('modalName'),
    modalKana: document.getElementById('modalKana'),
    modalOrg: document.getElementById('modalOrg'),
    modalPosition: document.getElementById('modalPosition'),
    modalId: document.getElementById('modalId'),
    modalPhone: document.getElementById('modalPhone'),
    modalEmail: document.getElementById('modalEmail'),
    modalLocation: document.getElementById('modalLocation'),
    modalTransport: document.getElementById('modalTransport'),
    modalGrade: document.getElementById('modalGrade'),
    modalSub1: document.getElementById('modalSub1'),
    modalSub2: document.getElementById('modalSub2'),
    modalNotes: document.getElementById('modalNotes'),
    modalWalkinBadge: document.getElementById('modalWalkinBadge'),
    modalUpdatedAt: document.getElementById('modalUpdatedAt'),

    // モーダル内ステータス詳細表示
    modalStatusCheckin: document.getElementById('modalStatusCheckin'),
    modalStatusBento: document.getElementById('modalStatusBento'),
    modalStatusFee: document.getElementById('modalStatusFee'),

    // モーダル内ステータストグルボタン
    toggleCheckinBtn: document.getElementById('toggleCheckinBtn'),
    toggleBentoBtn: document.getElementById('toggleBentoBtn'),
    toggleFeeBtn: document.getElementById('toggleFeeBtn'),
  };

  /**
   * ひらがな→カタカナ変換
   */
  function toKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) + 0x60)
    );
  }

  /**
   * カタカナ→ひらがな変換
   */
  function toHiragana(str) {
    return str.replace(/[\u30a1-\u30f6]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60)
    );
  }

  /**
   * 全角半角正規化（英数・スペース）
   */
  function normalizeString(str) {
    if (!str) return '';
    return str
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) - 0xfee0)
      )
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * 簡易認証の検証
   */
  function checkAuthentication() {
    // 確実にパスワード入力欄を初期化（空欄）
    if (elements.authPasswordInput) {
      elements.authPasswordInput.value = '';
    }

    const storedAuth = sessionStorage.getItem(window.AppConfig?.authStorageKey || 'reception_auth_token');
    if (storedAuth === 'authorized') {
      state.isAuthenticated = true;
      elements.authModal?.classList.add('hidden');
      loadInitialData();
    } else {
      state.isAuthenticated = false;
      elements.authModal?.classList.remove('hidden');
      if (elements.authPasswordInput) {
        elements.authPasswordInput.value = '';
        setTimeout(() => elements.authPasswordInput?.focus(), 100);
      }
    }
  }

  // 認証ボタンクリック
  elements.authSubmitButton?.addEventListener('click', handleAuthSubmit);
  elements.authPasswordInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAuthSubmit();
  });

  /**
   * パスワード認証の送信処理（バックエンド POST /api/auth 連携）
   */
  async function handleAuthSubmit() {
    const inputPass = elements.authPasswordInput.value.trim();
    if (!inputPass) {
      if (elements.authErrorText) {
        elements.authErrorText.textContent = '※ パスワードを入力してください。';
        elements.authErrorText.classList.remove('hidden');
      }
      elements.authPasswordInput.focus();
      return;
    }

    if (elements.authSubmitButton) {
      elements.authSubmitButton.disabled = true;
      elements.authSubmitButton.textContent = '認証中...';
    }
    if (elements.authErrorText) elements.authErrorText.classList.add('hidden');

    const baseUrl = window.AppConfig?.apiBaseUrl || '';
    try {
      const response = await fetch(`${baseUrl}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: inputPass }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        sessionStorage.setItem(window.AppConfig?.authStorageKey || 'reception_auth_token', 'authorized');
        state.isAuthenticated = true;
        elements.authModal?.classList.add('hidden');
        loadInitialData();
      } else {
        if (elements.authErrorText) {
          elements.authErrorText.textContent = result.error || '※ パスワードが正しくありません。';
          elements.authErrorText.classList.remove('hidden');
        }
        elements.authPasswordInput.focus();
      }
    } catch (error) {
      console.warn('[Auth Warning] API認証通信エラー:', error);
      // オフラインまたは通信障害時フォールバック（デフォルトパスワード 1204 / reception2026）
      if (inputPass === '1204' || inputPass === 'reception2026') {
        sessionStorage.setItem(window.AppConfig?.authStorageKey || 'reception_auth_token', 'authorized');
        state.isAuthenticated = true;
        elements.authModal?.classList.add('hidden');
        loadInitialData();
      } else {
        if (elements.authErrorText) {
          elements.authErrorText.textContent = '※ 認証に失敗しました。パスワードを確認してください。';
          elements.authErrorText.classList.remove('hidden');
        }
        elements.authPasswordInput.focus();
      }
    } finally {
      if (elements.authSubmitButton) {
        elements.authSubmitButton.disabled = false;
        elements.authSubmitButton.textContent = '認証して開始';
      }
    }
  }

  /**
   * 初期データの読み込み（キャッシュ優先表示後、APIフェッチ）
   */
  async function loadInitialData() {
    // 1. ローカルキャッシュの即時読み込み表示
    const cached = window.queueManager?.getCachedParticipants();
    if (cached && Array.isArray(cached) && cached.length > 0) {
      state.participants = cached;
      updateStatistics();
      renderCurrentView();
    }

    // 2. バックエンドAPIから最新データをフェッチ
    await fetchParticipantsFromApi();

    // 3. 未送信オフラインキューがあれば同期試行
    if (window.queueManager) {
      await window.queueManager.processQueue();
    }

    // 4. 定期自動ポーリングの設定（5秒に1回）
    startAutoPolling();
  }

  /**
   * 5秒ごとの自動ポーリング（バックエンドのインメモリキャッシュと連携）
   */
  let pollingIntervalId = null;
  function startAutoPolling() {
    if (pollingIntervalId) clearInterval(pollingIntervalId);
    pollingIntervalId = setInterval(async () => {
      if (state.isAuthenticated && navigator.onLine && !state.isFetching) {
        await fetchParticipantsFromApi(true);
      }
    }, 5000);
  }

  /**
   * 参加者一覧をAPIからフェッチ
   */
  async function fetchParticipantsFromApi(silent = false) {
    if (state.isFetching) return;
    state.isFetching = true;
    if (!silent) updateSyncButtonState(true);

    const baseUrl = window.AppConfig?.apiBaseUrl || '';
    try {
      const response = await fetch(`${baseUrl}/api/participants`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`サーバーレスポンスエラー: ${response.status}`);
      }

      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        state.participants = result.data;
        // キャッシュに保存
        window.queueManager?.setCachedParticipants(state.participants);
        updateStatistics();
        renderCurrentView();
        updateLastSyncDisplay();

        // モーダル表示中の場合、最新データでモーダル内の各ステータス情報表示とトグルボタンを直接上書き更新（リアクティブ化）
        if (currentModalParticipantId !== null) {
          const latestParticipant = state.participants.find((p) => p.id === currentModalParticipantId);
          if (latestParticipant) {
            state.selectedParticipant = latestParticipant;
            updateModalInfoDisplay(latestParticipant); // ステータス情報（テキスト・ラベル）のピンポイント更新
            updateModalToggleButtons(latestParticipant); // 操作用トグルボタンのピンポイント更新
          }
        }
      }
    } catch (error) {
      console.warn('[Fetch Warning] 最新データの取得に失敗しました（キャッシュデータを使用します）:', error);
    } finally {
      state.isFetching = false;
      if (!silent) updateSyncButtonState(false);
    }
  }

  /**
   * 同期ボタン状態更新
   */
  function updateSyncButtonState(isSyncing) {
    if (!elements.syncButton) return;
    if (isSyncing) {
      elements.syncSpinner?.classList.remove('hidden');
      elements.syncButton.disabled = true;
    } else {
      elements.syncSpinner?.classList.add('hidden');
      elements.syncButton.disabled = false;
    }
  }

  /**
   * 最終同期日時の表示更新
   */
  function updateLastSyncDisplay() {
    if (!elements.lastSyncText) return;
    const lastSync = window.queueManager?.getLastSyncTime();
    if (lastSync) {
      const date = new Date(lastSync);
      const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      elements.lastSyncText.textContent = `最終同期: ${timeStr}`;
    } else {
      elements.lastSyncText.textContent = '未同期';
    }
  }

  /**
   * 統計バーの計算と更新
   */
  function updateStatistics() {
    const total = state.participants.length;
    const checkedIn = state.participants.filter((p) => p.checkedIn).length;
    // 弁当事前注文者数と引換済数
    const bentoOrderedTotal = state.participants.filter((p) => p.bentoOrdered).length;
    const bentoConfirmed = state.participants.filter((p) => p.bentoOrdered && (p.bentoConfirmed || p.bentoExchanged)).length;
    // 参加費受領済（事前支払 または 当日受領）
    const fee = state.participants.filter((p) => p.feePaid || p.feeConfirmed).length;
    const walkin = state.participants.filter((p) => p.isWalkin).length;

    const percent = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

    if (elements.statTotal) elements.statTotal.textContent = total;
    if (elements.statCheckedIn) elements.statCheckedIn.textContent = checkedIn;
    if (elements.statCheckedInPercent) elements.statCheckedInPercent.textContent = `(${percent}%)`;
    if (elements.statBento) elements.statBento.textContent = `${bentoConfirmed} / ${bentoOrderedTotal}`;
    if (elements.statFee) elements.statFee.textContent = fee;
    if (elements.statWalkin) elements.statWalkin.textContent = walkin;
  }

  /**
   * キューおよびオンライン状態の更新リスナー
   */
  if (window.queueManager) {
    window.queueManager.subscribe(({ isOnline, queueCount, isSyncing }) => {
      // オンライン状態ドット
      if (elements.onlineStatusDot) {
        elements.onlineStatusDot.className = `w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`;
      }
      if (elements.onlineStatusText) {
        elements.onlineStatusText.textContent = isOnline ? 'オンライン' : 'オフライン';
      }

      // オフラインバナー & キューバッジ
      if (!isOnline || queueCount > 0) {
        elements.offlineBanner?.classList.remove('hidden');
        if (elements.queueCountBadge) elements.queueCountBadge.textContent = queueCount;
      } else {
        elements.offlineBanner?.classList.add('hidden');
      }

      if (isSyncing) {
        updateSyncButtonState(true);
      } else if (!state.isFetching) {
        updateSyncButtonState(false);
      }
    });
  }

  /**
   * タブ切り替え処理
   */
  elements.tabSearch?.addEventListener('click', () => switchTab('search'));
  elements.tabList?.addEventListener('click', () => switchTab('list'));

  function switchTab(tab) {
    state.currentTab = tab;
    if (tab === 'search') {
      elements.tabSearch.className = 'touch-target py-2.5 px-5 text-sm sm:text-base font-bold border-b-2 border-indigo-600 text-indigo-600 flex items-center space-x-2';
      elements.tabList.className = 'touch-target py-2.5 px-5 text-sm sm:text-base font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 flex items-center space-x-2';
      elements.searchSection?.classList.remove('hidden');
      elements.listSection?.classList.add('hidden');
      setTimeout(() => elements.searchInput?.focus(), 50);
    } else {
      elements.tabSearch.className = 'touch-target py-2.5 px-5 text-sm sm:text-base font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 flex items-center space-x-2';
      elements.tabList.className = 'touch-target py-2.5 px-5 text-sm sm:text-base font-bold border-b-2 border-indigo-600 text-indigo-600 flex items-center space-x-2';
      elements.searchSection?.classList.add('hidden');
      elements.listSection?.classList.remove('hidden');
    }
    renderCurrentView();
  }

  /**
   * 検索ロジック（フリガナ・漢字・所属など）
   */
  function filterParticipantsBySearch(query) {
    if (!query) return [];

    const normQuery = normalizeString(query);
    const queryKata = toKatakana(normQuery);
    const queryHira = toHiragana(normQuery);

    return state.participants.filter((p) => {
      const pLastKana = normalizeString(p.lastNameKana);
      const pFirstKana = normalizeString(p.firstNameKana);
      const fullNameKana = `${pLastKana}${pFirstKana}`;

      // フリガナ一致（最優先）
      if (
        pLastKana.includes(queryKata) ||
        pFirstKana.includes(queryKata) ||
        fullNameKana.includes(queryKata) ||
        pLastKana.includes(queryHira) ||
        pFirstKana.includes(queryHira) ||
        fullNameKana.includes(queryHira)
      ) {
        return true;
      }

      // 漢字氏名・所属・電話番号・システムID（UUID）での検索一致
      const fullName = `${normalizeString(p.lastName)}${normalizeString(p.firstName)}`;
      const org = normalizeString(p.organization);
      const phone = `${p.phone1}${p.phone2}${p.phone3}`;
      const idRaw = (p.id || '').toLowerCase();
      const idClean = idRaw.replace(/[^a-z0-9]/g, '');
      const queryClean = normQuery.replace(/[^a-z0-9]/g, '');

      return (
        fullName.includes(normQuery) ||
        org.includes(normQuery) ||
        phone.includes(normQuery) ||
        idRaw.includes(normQuery) ||
        (queryClean.length >= 3 && idClean.includes(queryClean))
      );
    });
  }

  // 検索入力イベント
  elements.searchInput?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (elements.clearSearchButton) {
      if (state.searchQuery) {
        elements.clearSearchButton.classList.remove('hidden');
      } else {
        elements.clearSearchButton.classList.add('hidden');
      }
    }
    renderSearchResults();
  });

  // 検索クリアボタン
  elements.clearSearchButton?.addEventListener('click', () => {
    if (elements.searchInput) {
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.clearSearchButton.classList.add('hidden');
      elements.searchInput.focus();
      renderSearchResults();
    }
  });

  /**
   * 一覧フィルター切り替え（.filter-btn.active による明示的な状態管理）
   */
  elements.filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      elements.filterButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      state.currentFilter = btn.dataset.filter || 'all';
      renderListView();
    });
  });

  /**
   * 現在のタブに応じた描画
   */
  function renderCurrentView() {
    if (state.currentTab === 'search') {
      renderSearchResults();
    } else {
      renderListView();
    }
  }

  /**
   * 検索結果の描画（コンパクトなカード形式）
   */
  function renderSearchResults() {
    if (!elements.searchResultsContainer) return;
    const query = state.searchQuery.trim();

    if (!query) {
      elements.searchResultsContainer.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400">
          <svg class="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p class="text-sm font-bold text-slate-600">参加者を検索</p>
          <p class="text-xs text-slate-400 mt-0.5">姓・名（フリガナ）、氏名（漢字）、所属名を入力してください</p>
        </div>
      `;
      if (elements.searchResultCount) elements.searchResultCount.textContent = '0件';
      return;
    }

    const matches = filterParticipantsBySearch(query);
    if (elements.searchResultCount) elements.searchResultCount.textContent = `${matches.length}件`;

    if (matches.length === 0) {
      elements.searchResultsContainer.innerHTML = `
        <div class="col-span-full py-10 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 p-5">
          <p class="text-sm font-bold text-slate-700">該当する参加者が見つかりませんでした</p>
          <p class="text-xs text-slate-500 mt-0.5">「${query}」に一致するデータはありません。</p>
          <div class="mt-3">
            <a href="./walkin.html" class="inline-flex items-center px-3.5 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs border border-indigo-200 transition">
              <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              当日参加受付フォームを開く
            </a>
          </div>
        </div>
      `;
      return;
    }

    elements.searchResultsContainer.innerHTML = matches.map((p) => createCompactParticipantCardHtml(p)).join('');
    attachRowClickListeners(elements.searchResultsContainer, '.participant-card');
  }

  /**
   * 一覧表示の描画（スプレッドシート風 表形式 Table）
   */
  function renderListView() {
    if (!elements.listResultsContainer) return;

    let list = [...state.participants];
    switch (state.currentFilter) {
      case 'unregistered':
        list = list.filter((p) => !p.checkedIn);
        break;
      case 'registered':
        list = list.filter((p) => p.checkedIn);
        break;
      case 'walkin':
        list = list.filter((p) => p.isWalkin);
        break;
      case 'bento_pending':
        // 弁当事前注文あり かつ 未引換の人
        list = list.filter((p) => p.bentoOrdered && !(p.bentoConfirmed || p.bentoExchanged));
        break;
      case 'fee_pending':
        // 事前支払でも当日受領でもない人
        list = list.filter((p) => !p.feePaid && !p.feeConfirmed);
        break;
    }

    if (elements.listResultCount) elements.listResultCount.textContent = `${list.length}件`;

    if (list.length === 0) {
      elements.listResultsContainer.innerHTML = `
        <div class="py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 p-6">
          <p class="text-base font-bold text-slate-600">対象の参加者がいません</p>
        </div>
      `;
      return;
    }

    // スプレッドシートのような表形式テーブルを生成
    elements.listResultsContainer.innerHTML = `
      <div class="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table class="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-[11px] sm:text-xs font-extrabold text-slate-500 uppercase tracking-wider select-none sticky top-0">
              <th class="py-3 px-3 sm:px-4 text-center w-12">No</th>
              <th class="py-3 px-3 sm:px-4">氏名 (フリガナ)</th>
              <th class="py-3 px-3 sm:px-4">所属 / 役職</th>
              <th class="py-3 px-3 sm:px-4 text-center">受付状況</th>
              <th class="py-3 px-3 sm:px-4 text-center">弁当引換</th>
              <th class="py-3 px-3 sm:px-4 text-center">参加費</th>
              <th class="py-3 px-3 sm:px-4 text-center">受付種別</th>
              <th class="py-3 px-3 sm:px-4">最終更新</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            ${list.map((p, idx) => createParticipantTableRowHtml(p, idx + 1)).join('')}
          </tbody>
        </table>
      </div>
    `;

    attachRowClickListeners(elements.listResultsContainer, '.participant-table-row');
  }

  /**
   * 表形式の1行HTML生成
   */
  function createParticipantTableRowHtml(participant, index) {
    const isCheckedIn = participant.checkedIn;
    const isBentoOrdered = participant.bentoOrdered;
    const isBentoConfirmed = participant.bentoConfirmed || participant.bentoExchanged;
    const isFeePaid = participant.feePaid;
    const isFeeConfirmed = participant.feeConfirmed;
    const isWalkin = participant.isWalkin;

    // 弁当引換ステータスバッジ
    let bentoBadgeHtml = '';
    if (!isBentoOrdered) {
      bentoBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-400 bg-slate-100">注文なし</span>';
    } else if (isBentoConfirmed) {
      bentoBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200">引換済</span>';
    } else {
      bentoBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200">未引換</span>';
    }

    // 参加費ステータスバッジ
    let feeBadgeHtml = '';
    if (isFeePaid) {
      feeBadgeHtml = '<span class="inline-block px-2.5 py-1 rounded-lg text-xs font-bold bg-violet-100 text-violet-800 border border-violet-300">事前支払済</span>';
    } else if (isFeeConfirmed) {
      feeBadgeHtml = '<span class="inline-block px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">当日受領済</span>';
    } else {
      feeBadgeHtml = '<span class="inline-block px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-500">未受領</span>';
    }

    return `
      <tr data-id="${participant.id}"
        class="participant-table-row hover:bg-indigo-50/60 active:bg-indigo-100/60 cursor-pointer transition ${isCheckedIn ? 'bg-indigo-50/20' : ''}">
        <td class="py-3.5 px-3 sm:px-4 text-center text-slate-400 font-mono text-xs">${index}</td>
        <td class="py-3.5 px-3 sm:px-4">
          <div class="text-[11px] font-semibold text-slate-400">${participant.lastNameKana} ${participant.firstNameKana}</div>
          <div class="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">${participant.lastName} ${participant.firstName}</div>
        </td>
        <td class="py-3.5 px-3 sm:px-4">
          <div class="text-xs sm:text-sm font-bold text-slate-700">${participant.organization || '-'}</div>
          <div class="text-[11px] text-slate-400">${participant.position || '-'}</div>
        </td>
        <td class="py-3.5 px-3 sm:px-4 text-center">
          <span class="inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${isCheckedIn ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500'}">
            ${isCheckedIn ? '受付済' : '未受付'}
          </span>
        </td>
        <td class="py-3.5 px-3 sm:px-4 text-center">
          ${bentoBadgeHtml}
        </td>
        <td class="py-3.5 px-3 sm:px-4 text-center">
          ${feeBadgeHtml}
        </td>
        <td class="py-3.5 px-3 sm:px-4 text-center">
          ${isWalkin 
            ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">当日</span>'
            : '<span class="text-slate-400 text-xs font-normal">事前</span>'
          }
        </td>
        <td class="py-3.5 px-3 sm:px-4 text-slate-400 font-mono text-[11px]">
          ${participant.updatedAt || '-'}
        </td>
      </tr>
    `;
  }

  /**
   * 検索用 コンパクトカードHTML生成（余白を削り小さく最適化）
   */
  function createCompactParticipantCardHtml(participant) {
    const isCheckedIn = participant.checkedIn;
    const isBentoOrdered = participant.bentoOrdered;
    const isBentoConfirmed = participant.bentoConfirmed || participant.bentoExchanged;
    const isFeePaid = participant.feePaid;
    const isFeeConfirmed = participant.feeConfirmed;
    const isWalkin = participant.isWalkin;

    let bentoBadge = '';
    if (!isBentoOrdered) {
      bentoBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-400">弁当無</span>';
    } else if (isBentoConfirmed) {
      bentoBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">弁当済</span>';
    } else {
      bentoBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">弁当未</span>';
    }

    let feeBadge = '';
    if (isFeePaid) {
      feeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-800 border border-violet-200">支払済</span>';
    } else if (isFeeConfirmed) {
      feeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">受領済</span>';
    } else {
      feeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">未受領</span>';
    }

    return `
      <div data-id="${participant.id}"
        class="participant-card touch-target bg-white rounded-xl border ${isCheckedIn ? 'border-indigo-300 bg-indigo-50/20' : 'border-slate-200'} p-2.5 shadow-xs hover:shadow-md active:scale-[0.99] transition cursor-pointer flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between mb-0.5">
            <span class="text-[11px] font-semibold text-slate-400 truncate">
              ${participant.lastNameKana} ${participant.firstNameKana}
            </span>
            ${isWalkin ? '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">当日</span>' : ''}
          </div>

          <h3 class="text-base sm:text-lg font-black text-slate-900 leading-tight mb-0.5 truncate">
            ${participant.lastName} ${participant.firstName}
          </h3>

          <p class="text-xs font-medium text-slate-600 truncate mb-1.5">
            ${participant.organization || '-'}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-1 pt-1.5 border-t border-slate-100">
          <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${isCheckedIn ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500'}">
            ${isCheckedIn ? '受付済' : '未受付'}
          </span>
          ${bentoBadge}
          ${feeBadge}
        </div>
      </div>
    `;
  }

  /**
   * 行/カードクリックイベントのアタッチ
   */
  function attachRowClickListeners(container, selector) {
    const items = container.querySelectorAll(selector);
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const participant = state.participants.find((p) => p.id === id);
        if (participant) {
          openDetailModal(participant);
        }
      });
    });
  }

  /**
   * モーダル内のステータス情報表示エリア（テキスト・バッジ等）を最新データでピンポイントDOM更新
   */
  function updateModalInfoDisplay(participant) {
    if (!participant) return;

    // 1. 受付状況（テキスト・色）
    if (elements.modalStatusCheckin) {
      elements.modalStatusCheckin.textContent = participant.checkedIn ? '受付済' : '未受付';
      elements.modalStatusCheckin.className = participant.checkedIn ? 'font-bold text-emerald-600' : 'font-bold text-slate-500';
    }

    // 2. 弁当事前注文・引換状況（テキスト・色）
    if (elements.modalStatusBento) {
      if (!participant.bentoOrdered) {
        elements.modalStatusBento.textContent = 'なし';
        elements.modalStatusBento.className = 'font-bold text-slate-400';
      } else {
        const isConfirmed = participant.bentoConfirmed || participant.bentoExchanged;
        elements.modalStatusBento.textContent = isConfirmed ? 'あり（引換済）' : 'あり（未引換）';
        elements.modalStatusBento.className = isConfirmed ? 'font-bold text-indigo-600' : 'font-bold text-amber-600';
      }
    }

    // 3. 参加費状況（テキスト・色）
    if (elements.modalStatusFee) {
      if (participant.feePaid) {
        elements.modalStatusFee.textContent = '事前支払済';
        elements.modalStatusFee.className = 'font-bold text-violet-600';
      } else if (participant.feeConfirmed) {
        elements.modalStatusFee.textContent = '当日受領済';
        elements.modalStatusFee.className = 'font-bold text-emerald-600';
      } else {
        elements.modalStatusFee.textContent = '未受領';
        elements.modalStatusFee.className = 'font-bold text-slate-500';
      }
    }

    // 4. 最終更新日時
    if (elements.modalUpdatedAt) {
      elements.modalUpdatedAt.textContent = participant.updatedAt || '-';
    }

    // 5. 当日受付バッジ
    if (elements.modalWalkinBadge) {
      if (participant.isWalkin) {
        elements.modalWalkinBadge.classList.remove('hidden');
      } else {
        elements.modalWalkinBadge.classList.add('hidden');
      }
    }
  }

  /**
   * モーダル内の全静的テキスト情報（氏名・所属・連絡先等）を更新
   */
  function updateModalStaticInfo(participant) {
    if (!participant) return;
    if (elements.modalName) elements.modalName.textContent = `${participant.lastName} ${participant.firstName}`;
    if (elements.modalKana) elements.modalKana.textContent = `${participant.lastNameKana} ${participant.firstNameKana}`;
    if (elements.modalOrg) elements.modalOrg.textContent = participant.organization || '-';
    if (elements.modalPosition) elements.modalPosition.textContent = participant.position || '-';
    if (elements.modalId) elements.modalId.textContent = participant.id ? participant.id.substring(0, 8).toUpperCase() : '-';
    if (elements.modalPhone) elements.modalPhone.textContent = [participant.phone1, participant.phone2, participant.phone3].filter(Boolean).join('-') || '-';
    if (elements.modalEmail) elements.modalEmail.textContent = participant.email || '-';
    if (elements.modalLocation) elements.modalLocation.textContent = participant.location || '-';
    if (elements.modalTransport) elements.modalTransport.textContent = participant.transportation || '-';
    if (elements.modalGrade) elements.modalGrade.textContent = participant.desiredGrade || '-';
    if (elements.modalSub1) elements.modalSub1.textContent = participant.subcommittee1 || '-';
    if (elements.modalSub2) elements.modalSub2.textContent = participant.subcommittee2 || '-';
    if (elements.modalNotes) elements.modalNotes.textContent = participant.notes || 'なし';
  }

  /**
   * モーダル内の全DOM要素を最新の参加者データで更新
   */
  function updateModalUI(participant) {
    if (!participant) return;
    updateModalStaticInfo(participant);
    updateModalInfoDisplay(participant);
    updateModalToggleButtons(participant);
  }

  /**
   * 詳細モーダルを開く
   */
  function openDetailModal(participant) {
    state.selectedParticipant = participant;
    currentModalParticipantId = participant.id; // 現在開いている参加者IDをセット
    updateModalUI(participant);

    elements.detailModal?.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  /**
   * モーダル内トグルボタンの表示状態更新
   */
  function updateModalToggleButtons(participant) {
    // 1. 受付状況 (R列)
    if (elements.toggleCheckinBtn) {
      if (participant.checkedIn) {
        elements.toggleCheckinBtn.className = 'touch-target py-3 px-3 rounded-xl bg-emerald-600 text-white font-extrabold text-sm shadow-md shadow-emerald-200 active:scale-[0.98] transition flex items-center justify-center space-x-1.5';
        elements.toggleCheckinBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          <span>受付済</span>
        `;
      } else {
        elements.toggleCheckinBtn.className = 'touch-target py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-sm border border-slate-300 active:scale-[0.98] transition flex items-center justify-center space-x-1.5';
        elements.toggleCheckinBtn.innerHTML = `
          <span class="w-3 h-3 rounded-full border-2 border-slate-400"></span>
          <span>未受付</span>
        `;
      }
    }

    // 2. 弁当引換 (S列: 注文有無, W列: 引換確認)
    if (elements.toggleBentoBtn) {
      if (!participant.bentoOrdered) {
        // 事前注文なしの場合は無効化表示
        elements.toggleBentoBtn.disabled = true;
        elements.toggleBentoBtn.className = 'touch-target py-3 px-3 rounded-xl bg-slate-50 text-slate-400 font-bold text-xs border border-dashed border-slate-300 cursor-not-allowed flex items-center justify-center';
        elements.toggleBentoBtn.innerHTML = `
          <span>弁当注文なし</span>
        `;
      } else {
        // 事前注文あり
        elements.toggleBentoBtn.disabled = false;
        const isConfirmed = participant.bentoConfirmed || participant.bentoExchanged;
        if (isConfirmed) {
          elements.toggleBentoBtn.className = 'touch-target py-3 px-3 rounded-xl bg-indigo-600 text-white font-extrabold text-sm shadow-md shadow-indigo-200 active:scale-[0.98] transition flex items-center justify-center space-x-1.5';
          elements.toggleBentoBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            <span>弁当券引換済</span>
          `;
        } else {
          elements.toggleBentoBtn.className = 'touch-target py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-sm border border-slate-300 active:scale-[0.98] transition flex items-center justify-center space-x-1.5';
          elements.toggleBentoBtn.innerHTML = `
            <span class="w-3 h-3 rounded-full border-2 border-slate-400"></span>
            <span>弁当券未引換</span>
          `;
        }
      }
    }

    // 3. 参加費支払 (T列: 事前支払有無, X列: 参加費支払確認)
    if (elements.toggleFeeBtn) {
      if (participant.feePaid) {
        // T列がTRUE（事前支払済）の場合はボタンを押せないようにする
        elements.toggleFeeBtn.disabled = true;
        elements.toggleFeeBtn.className = 'touch-target py-3 px-3 rounded-xl bg-violet-50 text-violet-700 font-extrabold text-xs border border-violet-200 cursor-not-allowed flex items-center justify-center space-x-1';
        elements.toggleFeeBtn.innerHTML = `
          <svg class="w-3.5 h-3.5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          <span>事前支払済</span>
        `;
      } else {
        // T列がFALSEの場合: ボタンが表示され、押すとX列（feeConfirmed）が更新される
        elements.toggleFeeBtn.disabled = false;
        if (participant.feeConfirmed) {
          elements.toggleFeeBtn.className = 'touch-target py-3 px-3 rounded-xl bg-emerald-600 text-white font-extrabold text-sm shadow-md shadow-emerald-200 active:scale-[0.98] transition flex items-center justify-center space-x-1.5';
          elements.toggleFeeBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            <span>参加費受領済</span>
          `;
        } else {
          elements.toggleFeeBtn.className = 'touch-target py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-sm border border-slate-300 active:scale-[0.98] transition flex items-center justify-center space-x-1.5';
          elements.toggleFeeBtn.innerHTML = `
            <span class="w-3 h-3 rounded-full border-2 border-slate-400"></span>
            <span>未受領</span>
          `;
        }
      }
    }
  }

  /**
   * モーダルを閉じる
   */
  function closeDetailModal() {
    elements.detailModal?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    state.selectedParticipant = null;
    currentModalParticipantId = null; // 表示中IDをnullにリセット
  }

  elements.modalCloseButton?.addEventListener('click', closeDetailModal);
  elements.modalBackdrop?.addEventListener('click', closeDetailModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elements.detailModal?.classList.contains('hidden')) {
      closeDetailModal();
    }
  });

  /**
   * モーダル内操作ボタンの排他ロック・解除制御（連打防止用）
   */
  function setModalButtonsLock(isLocked) {
    const buttons = [
      elements.toggleCheckinBtn,
      elements.toggleBentoBtn,
      elements.toggleFeeBtn,
    ].filter(Boolean);

    buttons.forEach((btn) => {
      if (isLocked) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      } else {
        btn.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      }
    });
  }

  /**
   * ステータス更新トリガー（連打防止・排他制御付き）
   */
  async function handleToggleStatus(field) {
    // 1. 選択中の参加者がいない、または既に更新処理中の場合は即時リターン（多重実行ガード）
    if (!state.selectedParticipant || state.isUpdatingStatus) return;

    state.isUpdatingStatus = true;
    setModalButtonsLock(true); // ★ ボタンを即時ロック（disabled + opacity-50 + pointer-events-none）

    try {
      const currentParticipant = state.selectedParticipant;

      // 2. フィールドごとのトグル判定
      if (field === 'checkedIn') {
        currentParticipant.checkedIn = !currentParticipant.checkedIn;
      } else if (field === 'bentoConfirmed') {
        // 注文がない場合は何もしない
        if (!currentParticipant.bentoOrdered) return;
        const nextState = !(currentParticipant.bentoConfirmed || currentParticipant.bentoExchanged);
        currentParticipant.bentoConfirmed = nextState;
        currentParticipant.bentoExchanged = nextState;
      } else if (field === 'feeConfirmed') {
        // T列が事前支払済みの場合は何もしない
        if (currentParticipant.feePaid) return;
        currentParticipant.feeConfirmed = !currentParticipant.feeConfirmed;
      }

      // 3. モーダル内テキスト表示と全体統計の即時更新
      updateModalInfoDisplay(currentParticipant);
      updateStatistics();
      renderCurrentView();

      // キャッシュの更新
      window.queueManager?.setCachedParticipants(state.participants);

      // 更新ペイロード（T列 feePaid は変更せず維持、X列 feeConfirmed を更新）
      const payload = {
        id: currentParticipant.id,
        checkedIn: currentParticipant.checkedIn,
        bentoConfirmed: currentParticipant.bentoConfirmed || currentParticipant.bentoExchanged,
        feeConfirmed: currentParticipant.feeConfirmed,
        rowIndex: currentParticipant.rowIndex,
      };

      // 4. 通信処理の確実な待機
      if (navigator.onLine) {
        try {
          const baseUrl = window.AppConfig?.apiBaseUrl || '';
          const response = await fetch(`${baseUrl}/api/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error('API更新失敗');
          }

          const result = await response.json();
          if (result.success && result.data?.updatedAt) {
            currentParticipant.updatedAt = result.data.updatedAt;
            if (elements.modalUpdatedAt) elements.modalUpdatedAt.textContent = result.data.updatedAt;
          }

          // ★ 即時ポーリング通信の完了まで確実にawait待機
          await fetchParticipantsFromApi(true);
        } catch (error) {
          console.warn('[Update] API直接通信失敗のためオフラインキューへ退避:', error);
          window.queueManager?.enqueueUpdate(payload);
        }
      } else {
        console.log('[Update] オフラインのためキューへ追加:', payload);
        window.queueManager?.enqueueUpdate(payload);
      }
    } finally {
      // 5. 処理完了またはエラー時の確実なロック解除（finallyブロック）
      state.isUpdatingStatus = false;
      setModalButtonsLock(false);
      if (state.selectedParticipant) {
        // 各ボタン本来の有効/無効状態（事前注文なし、事前支払済等）を正確に復元
        updateModalToggleButtons(state.selectedParticipant);
      }
    }
  }

  elements.toggleCheckinBtn?.addEventListener('click', () => handleToggleStatus('checkedIn'));
  elements.toggleBentoBtn?.addEventListener('click', () => handleToggleStatus('bentoConfirmed'));
  elements.toggleFeeBtn?.addEventListener('click', () => handleToggleStatus('feeConfirmed'));

  /**
   * 手動データ同期ボタン
   */
  elements.syncButton?.addEventListener('click', async () => {
    // 1. キューに溜まっている未送信データを送信
    if (window.queueManager) {
      await window.queueManager.processQueue();
    }
    // 2. スプレッドシートから最新データを再取得
    await fetchParticipantsFromApi();
  });

  /**
   * 大会名などの公開設定情報を取得し、画面およびドキュメントタイトルに動的反映
   */
  async function loadConferenceSettings() {
    const baseUrl = window.AppConfig?.apiBaseUrl || '';
    try {
      const response = await fetch(`${baseUrl}/api/settings`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) return;

      const result = await response.json();
      if (result.success && result.data?.conferenceName) {
        const confName = result.data.conferenceName;
        // 1. タイトルタグの動的更新
        document.title = `${confName} - 受付管理`;
        // 2. 指定されたクラス要素のテキスト更新
        document.querySelectorAll('.conference-name').forEach((el) => {
          el.textContent = confName;
        });
      }
    } catch (error) {
      console.warn('[Settings Warning] 設定情報の取得に失敗しました:', error);
    }
  }

  // 初期化実行
  loadConferenceSettings();
  checkAuthentication();
});
